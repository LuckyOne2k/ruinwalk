/* Ruin Walk – Meta Graph API (Facebook-Seite + Instagram-Professional-Konto).
   Sicherheitsmodell:
   - Standard ist TROCKENLAUF: zeigt nur, welche Anfragen gesendet würden.
   - Schreiben nur mit --senden UND nur für Entwürfe mit "status: freigegeben" (Freigabe durch Pascal).
   - Zusätzlich fragt ein Hook (.claude/hooks/meta-guard.sh) vor jedem --senden nach Bestätigung.
   - Kein Token im Repo. Der Zugangsschlüssel wird als Netzwerk-Geheimnis für graph.facebook.com hinterlegt
     (Proxy setzt den Authorization-Header) oder lokal über die Umgebungsvariable META_TOKEN übergeben.
   Befehle (Repo-Wurzel):
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js status                       (nur lesen)
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js insights [tage]               (nur lesen)
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md> [--senden]
   Konfiguration (ohne Geheimnisse): marketing/meta/config.json  { "api_version", "page_id", "ig_user_id" } */
const fs = require('fs'), path = require('path');
// Node-fetch nutzt HTTPS_PROXY nur mit NODE_USE_ENV_PROXY=1 (Claude-Cloud-Umgebung) → einmal mit gesetzter Variable neu starten.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = require('child_process').spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}
const ROOT = path.resolve(__dirname, '../../../..');
const CFG_PATH = path.join(ROOT, 'marketing/meta/config.json');
const [cmd, arg1, ...rest] = process.argv.slice(2);
const SENDEN = process.argv.includes('--senden');
const cfg = fs.existsSync(CFG_PATH) ? JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) : {};
const V = cfg.api_version || 'v25.0';
const BASE = `https://graph.facebook.com/${V}`;
const die = (m, code = 1) => { console.error('✗ ' + m); process.exit(code); };

async function api(method, p, params = {}) {
  const u = new URL(BASE + p);
  const headers = {};
  if (process.env.META_TOKEN) headers.Authorization = 'Bearer ' + process.env.META_TOKEN;   // sonst setzt der Proxy den Header
  let body;
  if (method === 'GET') for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  else { body = new URLSearchParams(params); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const r = await fetch(u, { method, headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${method} ${p}: ${r.status} ${j.error ? j.error.message + ' (code ' + j.error.code + ')' : ''}`);
  return j;
}

function leseEntwurf(datei) {
  if (!datei || !fs.existsSync(datei)) die('Entwurfsdatei fehlt');
  const s = fs.readFileSync(datei, 'utf8');
  const fm = (s.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const f = k => ((fm.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
  const block = name => ((s.match(new RegExp('## ' + name + '\\n([\\s\\S]*?)(\\n## |$)')) || [])[1] || '').trim();
  return { status: f('status'), kanal: f('kanal'), freigabe: f('freigegeben_von'), bild_url: f('bild_url'), alt: block('Alt-Text'),
           caption_ig: block('Caption Instagram'), text_fb: block('Text Facebook') };
}

(async () => {
  if (cmd === 'status') {
    if (!cfg.page_id) console.log('Hinweis: marketing/meta/config.json fehlt oder ohne page_id – siehe marketing/meta/ANBINDUNG.md');
    const me = await api('GET', '/me', { fields: 'id,name' });
    console.log('Token gehört zu:', me.name, me.id);
    const perms = await api('GET', '/me/permissions').catch(() => ({ data: [] }));
    console.log('Berechtigungen:', (perms.data || []).filter(p => p.status === 'granted').map(p => p.permission).join(', ') || '(nicht abfragbar)');
    if (cfg.page_id) { const pg = await api('GET', '/' + cfg.page_id, { fields: 'name,instagram_business_account{id,username}' }); console.log('Seite:', pg.name, '· Instagram:', pg.instagram_business_account ? pg.instagram_business_account.username + ' (' + pg.instagram_business_account.id + ')' : 'nicht verknüpft'); }
    return;
  }
  if (cmd === 'insights') {
    const tage = Number(arg1 || 7);
    if (cfg.ig_user_id) console.log(JSON.stringify(await api('GET', `/${cfg.ig_user_id}/media`, { fields: 'id,caption,timestamp,like_count,comments_count,permalink', limit: 25 }), null, 1));
    if (cfg.page_id) console.log(JSON.stringify(await api('GET', `/${cfg.page_id}/posts`, { fields: 'id,message,created_time,permalink_url', limit: 25 }), null, 1));
    console.log(`(Für Reichweite/Impressionen je Beitrag: /{media-id}/insights bzw. /{post-id}/insights – Kennzahlen siehe ANBINDUNG.md; Zeitraum ${tage} Tage)`);
    return;
  }
  if (cmd === 'veroeffentlichen') {
    const e = leseEntwurf(arg1);
    if (e.status !== 'freigegeben') die(`Entwurf hat status "${e.status || 'leer'}" – Veröffentlichung nur mit status: freigegeben (durch Pascal).`);
    if (!/pascal/i.test(e.freigabe)) die('freigegeben_von muss Pascal nennen.');
    if (!/^https:\/\//.test(e.bild_url)) die('bild_url muss eine öffentliche https-Adresse sein (Instagram lädt das Bild selbst).');
    const plan = [];
    if (/instagram/.test(e.kanal)) {
      if (!cfg.ig_user_id) die('ig_user_id fehlt in marketing/meta/config.json');
      plan.push(['POST', `/${cfg.ig_user_id}/media`, { image_url: e.bild_url, caption: e.caption_ig, alt_text: e.alt }], ['POST', `/${cfg.ig_user_id}/media_publish`, { creation_id: '<aus Schritt 1>' }]);
    }
    if (/facebook/.test(e.kanal)) { if (!cfg.page_id) die('page_id fehlt'); plan.push(['POST', `/${cfg.page_id}/photos`, { url: e.bild_url, caption: e.text_fb || e.caption_ig }]); }
    if (!plan.length) die('kanal muss instagram und/oder facebook enthalten');
    console.log(SENDEN ? 'SENDEN:' : 'TROCKENLAUF (nichts wird gesendet):');
    for (const [m, p, b] of plan) console.log(` ${m} ${BASE}${p}\n   ${JSON.stringify(b).slice(0, 300)}`);
    if (!SENDEN) return console.log('\nZum Senden: denselben Befehl mit --senden (nur nach Freigabe; es folgt eine Bestätigungsabfrage).');
    const erg = [];
    if (/instagram/.test(e.kanal)) { const c = await api(...plan[0]); const pub = await api('POST', `/${cfg.ig_user_id}/media_publish`, { creation_id: c.id }); erg.push('instagram:' + pub.id); }
    if (/facebook/.test(e.kanal)) { const fbp = plan.find(x => x[1].endsWith('/photos')); const r = await api(...fbp); erg.push('facebook:' + (r.post_id || r.id)); }
    console.log('✓ Veröffentlicht:', erg.join(', '), '→ Entwurf nach marketing/freigabe/veroeffentlicht/ verschieben und IDs eintragen.');
    return;
  }
  console.log('Befehle: status | insights [tage] | veroeffentlichen <entwurf.md> [--senden]');
})().catch(e => {
  const c = String((e.cause && (e.cause.cause || e.cause).message) || '');
  if (/403/.test(c)) die('Netzwerk: graph.facebook.com ist in dieser Umgebung nicht freigegeben. Zuerst Zugangsschlüssel als Netzwerk-Geheimnis hinterlegen (siehe marketing/meta/ANBINDUNG.md, Stufe 2, Schritt 6).', 2);
  die(e.message + (c ? ' – ' + c : ''), 2);
});
