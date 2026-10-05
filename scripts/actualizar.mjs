// Lee resultados y posiciones de URBA y el estado del vivo en YouTube, y regenera datos.js.
// Lo ejecuta GitHub Actions cada pocos minutos (.github/workflows/actualizar.yml). Node 20, sin dependencias.
import { readFileSync, writeFileSync } from 'node:fs';

const SA = 14;                                   // id de San Albano en URBA
const TORNEOS = { P: 2025177, I: 2025187, A: 2025188, B: 2025189 }; // Primera A 2026: Superior, Intermedia, Preintermedia, Preintermedia B
const CANAL = 'https://www.youtube.com/@clubsanalbano_ok';
const SALIDA = new URL('../datos.js', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const previo = (() => { try { return JSON.parse(readFileSync(SALIDA, 'utf8').replace(/^[^\n]*\n/, '').replace(/^window\.DATOS=/, '').replace(/;\s*$/, '')); } catch { return {}; } })();

async function torneo(id) {
  const r = await fetch(`https://urba.org.ar/api/fixture/championship/${id}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error(`URBA ${id}: HTTP ${r.status}`);
  const j = await r.json();
  const rondas = j?.championship?.rounds, tabla = j?.standings;
  if (!Array.isArray(rondas) || rondas.length !== 26 || !Array.isArray(tabla) || tabla.length !== 14) throw new Error(`URBA ${id}: formato inesperado`);
  return { rondas, tabla };
}
const partido = m => [m.local_team.club_id, m.visit_team.club_id, m.local_team_score, m.visit_team_score, m.local_team_offensive_bonus, m.visit_team_offensive_bonus, m.fulfilled ? 1 : 0, m.suspended ? 1 : 0];

async function urba() {
  const SRES = {}, TABLAS = {}, LIGAS = {};
  for (const [eq, id] of Object.entries(TORNEOS)) {
    const { rondas, tabla } = await torneo(id);
    SRES[eq] = rondas.map(r => {
      const m = r.matches.map(partido).find(x => x[0] === SA || x[1] === SA);
      if (!m) throw new Error(`${eq} ${r.name}: sin partido de San Albano`);
      const loc = m[0] === SA, res = m[6] ? (loc ? `${m[2]}-${m[3]}` : `${m[3]}-${m[2]}`) + (m[loc ? 4 : 5] ? 'b' : '') + (m[loc ? 5 : 4] ? 'r' : '') : 'x';
      return `${loc ? 'L' : 'V'}${loc ? m[1] : m[0]}:${res}`;
    }).join(' ');
    TABLAS[eq] = tabla.map(s => [s.team.club_id, s.position, s.played, s.won, s.tied, s.lost, s.points_favor, s.points_against, s.bonus_offensive, s.bonus_defensive, s.points_total].join(',')).join('|');
    LIGAS[eq] = rondas.map(r => `${r.name.replace(/\D/g, '')}@${r.playdate.slice(0, 10)}:${r.matches.map(m => partido(m).join(',')).join(';')}`).join('\n');
  }
  return { SRES, LIGA: LIGAS.P, LIGAS, TABLAS };
}

// Devuelve el id del video si el canal está transmitiendo ahora; null si no.
async function vivo() {
  const r = await fetch(`${CANAL}/live?hl=es`, { headers: { 'user-agent': UA, 'accept-language': 'es', cookie: 'CONSENT=YES+cb; SOCS=CAI' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`YouTube: HTTP ${r.status}`);
  const h = await r.text();
  const id = (h.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1];
  return id && /"isLive(Now)?":true/.test(h) && !/"isUpcoming":true/.test(h) ? id : null;
}

const datos = { SRES: previo.SRES, LIGA: previo.LIGA, LIGAS: previo.LIGAS, TABLAS: previo.TABLAS, vivo: null };
try { Object.assign(datos, await urba()); } catch (e) { console.error('No se actualizó URBA, se conservan los datos anteriores:', e.message); }
try { datos.vivo = await vivo(); } catch (e) { console.error('No se pudo consultar YouTube:', e.message); datos.vivo = null; }
if (!datos.SRES || !datos.LIGA || !datos.TABLAS) { console.error('Sin datos de URBA: no se escribe nada.'); process.exit(0); }

const firma = d => JSON.stringify([d.SRES, d.LIGA, d.LIGAS ?? null, d.TABLAS, d.vivo ?? null]);
if (firma(datos) === firma(previo)) { console.log('Sin cambios.'); process.exit(0); }
datos.actualizado = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
writeFileSync(SALIDA, '// Generado automáticamente por scripts/actualizar.mjs. No editar a mano.\nwindow.DATOS=' + JSON.stringify(datos) + ';\n');
console.log('datos.js actualizado:', datos.actualizado, datos.vivo ? '· EN VIVO ' + datos.vivo : '');
