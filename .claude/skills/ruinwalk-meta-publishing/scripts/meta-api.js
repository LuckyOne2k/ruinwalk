/* Ruin Walk – Meta Graph API (Facebook-Seite + Instagram-Professional-Konto).
   Sicherheitsmodell:
   - Standard ist TROCKENLAUF: zeigt nur, welche Anfragen gesendet würden.
   - Schreiben nur mit --senden. Modus aus marketing/meta/modus.json: „freigabe“ = nur status: freigegeben (Pascal);
     „autonom“ = auch status: autonom, wenn die automatische Qualitätsprüfung besteht und Kanal/Limits passen; „pause“ = nichts.
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
const MODUS_PATH = path.join(ROOT, 'marketing/meta/modus.json');
const LOG_PATH = path.join(ROOT, 'marketing/freigabe/veroeffentlicht/LOG.md');
const MODUS = fs.existsSync(MODUS_PATH) ? JSON.parse(fs.readFileSync(MODUS_PATH, 'utf8')) : { modus: 'freigabe' };
// api_host: graph.instagram.com (Instagram-API mit Instagram-Login, ohne Facebook-Seite) oder graph.facebook.com (Facebook-Login/Business)
const HOST = cfg.api_host || 'graph.facebook.com';
const IG_LOGIN = HOST === 'graph.instagram.com';
const BASE = `https://${HOST}/${V}`;
const IG = cfg.ig_user_id || (IG_LOGIN ? 'me' : '');
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
           caption_ig: block('Caption Instagram'), text_fb: block('Text Facebook'), fakten: block('Faktenprüfung'),
           hashtags: block('Hashtags'), bild: f('bild'), datei };
}

// Automatische Qualitätsprüfung (Pflicht im Modus „autonom“, Hinweis im Modus „freigabe“)
const VERBOTEN = [/https?:\/\/(?!luckyone2k\.github\.io)/i, /\b(bald|demnächst|ab sofort mehrspieler|jetzt mit gruppen|weltboss ist da)\b/i,
  /\b(beste[sn]?|ultimativ\w*|revolution\w*|episch\w*)\b/i, /(gewinnspiel|rabatt|kaufen sie|jetzt kaufen)/i, /\b(tauche ein|entfessle)\b/i];
function pruefen(e) {
  const f = [];
  if (!e.caption_ig || e.caption_ig.length < 40) f.push('Caption Instagram fehlt oder zu kurz');
  if (e.caption_ig.length > 2200) f.push('Caption länger als 2.200 Zeichen');
  const first = (e.caption_ig.split('\n')[0] || ''); if (first.length > 125) f.push('Hook (erste Zeile) länger als 125 Zeichen');
  const tags = (e.caption_ig.match(/#[\wäöüß]+/gi) || []);
  if (tags.length < 3 || tags.length > 5) f.push(`Hashtags in der Caption: ${tags.length} (erlaubt 3–5)`);
  if (!tags.map(t => t.toLowerCase()).includes('#ruinwalk')) f.push('#ruinwalk fehlt');
  if (!e.alt || e.alt.length < 20) f.push('Alt-Text fehlt');
  if (!e.fakten || !/→/.test(e.fakten)) f.push('Faktenprüfung fehlt (Aussage → Beleg → Status)');
  if (/→[^→\n]*→\s*in entwicklung\b/i.test(e.fakten) && !/in entwicklung/i.test(e.caption_ig + e.text_fb)) f.push('Faktenprüfung nennt etwas „in Entwicklung“, der Text sagt das nicht');
  for (const r of VERBOTEN) if (r.test(e.caption_ig + '\n' + e.text_fb)) f.push('unzulässige Formulierung/Link: ' + r);
  const bildDatei = (e.bild || '').split(' ')[0];
  if (!bildDatei || !fs.existsSync(path.join(ROOT, bildDatei))) f.push('Bilddatei fehlt: ' + bildDatei);
  return f;
}
function logZaehlen() {
  if (!fs.existsSync(LOG_PATH)) return { tag: 0, woche: 0 };
  const jetzt = Date.now(), z = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(l => /^\| \d{4}-/.test(l)).map(l => Date.parse(l.split('|')[1].trim()));
  return { tag: z.filter(t => jetzt - t < 864e5).length, woche: z.filter(t => jetzt - t < 7 * 864e5).length };
}

(async () => {
  if (cmd === 'pruefen') {
    const e = leseEntwurf(arg1), f = pruefen(e);
    console.log(`Modus: ${MODUS.modus} · Prüfung ${path.basename(arg1)}: ${f.length ? f.length + ' Fehler' : 'bestanden'}`);
    f.forEach(x => console.log('  ✗ ' + x)); process.exit(f.length ? 1 : 0);
  }
  if (cmd === 'status') {
    if (IG_LOGIN) {
      const me = await api('GET', '/me', { fields: 'user_id,username,account_type,media_count' });
      console.log(`Instagram-Konto: @${me.username} (ID ${me.user_id}, Typ ${me.account_type}, ${me.media_count} Beiträge) über ${HOST}`);
      const lim = await api('GET', `/${IG}/content_publishing_limit`, { fields: 'quota_usage,config' }).catch(() => null);
      if (lim && lim.data && lim.data[0]) console.log('API-Veröffentlichungen in den letzten 24 h:', lim.data[0].quota_usage, '/', (lim.data[0].config || {}).quota_total);
      return;
    }
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
    if (IG) console.log(JSON.stringify(await api('GET', `/${IG}/media`, { fields: 'id,caption,timestamp,like_count,comments_count,permalink', limit: 25 }), null, 1));
    if (cfg.page_id) console.log(JSON.stringify(await api('GET', `/${cfg.page_id}/posts`, { fields: 'id,message,created_time,permalink_url', limit: 25 }), null, 1));
    console.log(`(Für Reichweite/Impressionen je Beitrag: /{media-id}/insights bzw. /{post-id}/insights – Kennzahlen siehe ANBINDUNG.md; Zeitraum ${tage} Tage)`);
    return;
  }
  if (cmd === 'veroeffentlichen') {
    const e = leseEntwurf(arg1);
    if (MODUS.modus === 'pause') die('Modus „pause“: Marketing ist von Pascal angehalten. Nichts wird veröffentlicht.');
    if (MODUS.modus === 'autonom') {
      if (!['freigegeben', 'autonom'].includes(e.status)) die(`Entwurf hat status "${e.status || 'leer'}" – im Modus „autonom“ nötig: status: autonom (nach bestandener Prüfung) oder freigegeben.`);
      const f = pruefen(e); if (f.length) die('Qualitätsprüfung nicht bestanden:\n  - ' + f.join('\n  - '));
      const kanaele = e.kanal.split(',').map(k => k.trim());
      for (const k of kanaele) if (!(MODUS.erlaubte_kanaele || []).includes(k)) die(`Kanal „${k}“ ist im Modus autonom nicht freigeschaltet (modus.json).`);
      const z = logZaehlen();
      if (z.tag >= (MODUS.max_beitraege_pro_tag || 1)) die(`Tageslimit erreicht (${z.tag}).`);
      if (z.woche >= (MODUS.max_beitraege_pro_woche || 4)) die(`Wochenlimit erreicht (${z.woche}).`);
    } else {
      if (e.status !== 'freigegeben') die(`Entwurf hat status "${e.status || 'leer'}" – Veröffentlichung nur mit status: freigegeben (durch Pascal).`);
      if (!/pascal/i.test(e.freigabe)) die('freigegeben_von muss Pascal nennen.');
    }
    if (!/^https:\/\//.test(e.bild_url)) die('bild_url muss eine öffentliche https-Adresse sein (Instagram lädt das Bild selbst).');
    const plan = [];
    if (/instagram/.test(e.kanal)) {
      if (!IG) die('ig_user_id fehlt in marketing/meta/config.json');
      plan.push(['POST', `/${IG}/media`, { image_url: e.bild_url, caption: e.caption_ig, alt_text: e.alt }], ['POST', `/${IG}/media_publish`, { creation_id: '<aus Schritt 1>' }]);
    }
    if (/facebook/.test(e.kanal)) { if (!cfg.page_id) die('page_id fehlt'); plan.push(['POST', `/${cfg.page_id}/photos`, { url: e.bild_url, caption: e.text_fb || e.caption_ig }]); }
    if (!plan.length) die('kanal muss instagram und/oder facebook enthalten');
    console.log(SENDEN ? 'SENDEN:' : 'TROCKENLAUF (nichts wird gesendet):');
    for (const [m, p, b] of plan) console.log(` ${m} ${BASE}${p}\n   ${JSON.stringify(b).slice(0, 300)}`);
    if (!SENDEN) return console.log('\nZum Senden: denselben Befehl mit --senden (nur nach Freigabe; es folgt eine Bestätigungsabfrage).');
    const erg = [];
    if (/instagram/.test(e.kanal)) { const c = await api(...plan[0]); // Container muss fertig verarbeitet sein (bei Bildern meist sofort, bei Videos länger)
      for (let i = 0; i < 20; i++) { const st = await api('GET', '/' + c.id, { fields: 'status_code' }).catch(() => ({})); if (!st.status_code || st.status_code === 'FINISHED') break; if (st.status_code === 'ERROR') throw new Error('Container-Fehler bei Instagram'); await new Promise(r => setTimeout(r, 3000)); }
      const pub = await api('POST', `/${IG}/media_publish`, { creation_id: c.id }); erg.push('instagram:' + pub.id); }
    if (/facebook/.test(e.kanal)) { const fbp = plan.find(x => x[1].endsWith('/photos')); const r = await api(...fbp); erg.push('facebook:' + (r.post_id || r.id)); }
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '# Veröffentlichungsprotokoll\n\n| Zeitpunkt (UTC) | Modus | Entwurf | Kanal-IDs |\n|---|---|---|---|\n');
    fs.appendFileSync(LOG_PATH, `| ${new Date().toISOString()} | ${MODUS.modus} | ${path.basename(e.datei)} | ${erg.join(', ')} |\n`);
    console.log('✓ Veröffentlicht:', erg.join(', '), '→ protokolliert; Entwurf nach marketing/freigabe/veroeffentlicht/ verschieben.');
    return;
  }
  console.log('Befehle: status | insights [tage] | pruefen <entwurf.md> | veroeffentlichen <entwurf.md> [--senden]');
})().catch(e => {
  const c = String((e.cause && (e.cause.cause || e.cause).message) || '');
  if (/403/.test(c)) die('Netzwerk: ' + HOST + ' ist in dieser Umgebung nicht freigegeben. Zuerst Zugangsschlüssel als Netzwerk-Geheimnis hinterlegen (siehe marketing/meta/ANBINDUNG.md, Stufe 2, Schritt 6).', 2);
  die(e.message + (c ? ' – ' + c : ''), 2);
});
