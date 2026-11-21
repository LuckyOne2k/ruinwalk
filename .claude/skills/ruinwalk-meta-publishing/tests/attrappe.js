/* Attrappe der Graph API für Tests ohne Netz. Wird per `node -r attrappe.js meta-api.js …` geladen und ersetzt fetch.
   Szenario (JSON-Datei in RW_ATTRAPPE_SZENARIO):
     status:     Folge von status_code-Antworten für Container (Standard ["FINISHED"]), letzte wiederholt sich
     kommentar:  Antwort auf GET /{kommentar-id}
     media:      Antwort auf GET /{media-id} (owner)
     medien:     Antwort auf GET /{ig}/media
     kommentare: Antwort auf GET /{media-id}/comments
   Jeder Aufruf wird als JSON-Zeile in RW_ATTRAPPE_PROTOKOLL angehängt. Nichts verlässt den Rechner. */
const fs = require('fs');
globalThis.__RW_META_ATTRAPPE = true;   // nur hiermit wertet meta-api.js die RW_META_*-Testschalter aus
const SZ = process.env.RW_ATTRAPPE_SZENARIO ? JSON.parse(fs.readFileSync(process.env.RW_ATTRAPPE_SZENARIO, 'utf8')) : {};
const PROTO = process.env.RW_ATTRAPPE_PROTOKOLL;
let nr = 0, statusIdx = 0;
const antwort = (obj, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => obj });
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(String(url)), m = opt.method || 'GET';
  const params = m === 'GET' ? Object.fromEntries(u.searchParams) : Object.fromEntries(new URLSearchParams(String(opt.body || '')));
  const p = u.pathname.replace(/^\/v[\d.]+/, '');
  if (PROTO) fs.appendFileSync(PROTO, JSON.stringify({ m, p, params, host: u.host }) + '\n');
  if (m === 'POST' && /\/media$/.test(p)) return antwort({ id: 'C' + (++nr) });
  if (m === 'POST' && /\/media_publish$/.test(p)) return antwort({ id: 'P' + (++nr) });
  if (m === 'POST' && /\/replies$/.test(p)) return antwort({ id: 'R' + (++nr) });
  if (m === 'GET' && /^\/C\d+$/.test(p)) { const f = SZ.status || ['FINISHED']; const s = f[Math.min(statusIdx++, f.length - 1)]; return antwort({ status_code: s, id: p.slice(1) }); }
  if (m === 'GET' && /\/comments$/.test(p)) return antwort(SZ.kommentare || { data: [] });
  if (m === 'GET' && /^\/\d+\/media$/.test(p)) return antwort(SZ.medien || { data: [] });
  if (m === 'GET' && p === '/me/permissions') return antwort(SZ.rechte || { data: [] });
  if (m === 'GET' && SZ.kommentar && p === '/' + SZ.kommentar.id) return antwort(SZ.kommentar);
  if (m === 'GET' && SZ.media && p === '/' + SZ.media.id) return antwort(SZ.media);
  return antwort({ error: { message: 'Attrappe: unbekannter Aufruf ' + m + ' ' + p, code: 0 } }, false);
};
