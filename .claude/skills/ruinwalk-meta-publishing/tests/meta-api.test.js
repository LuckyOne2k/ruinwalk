/* Tests für meta-api.js – ohne Netz (Graph API = Attrappe, attrappe.js) und ohne das echte LOG.md.
   Aufruf (Repo-Wurzel): node .claude/skills/ruinwalk-meta-publishing/tests/meta-api.test.js
   Braucht ffmpeg für die Testvideos (fehlt es, werden die Video-Fälle übersprungen und gemeldet). */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const SKRIPT = path.join(__dirname, '../scripts/meta-api.js'), ATTRAPPE = path.join(__dirname, 'attrappe.js');
let ok = 0, fehler = 0, uebersprungen = 0;
const check = (b, name, info = '') => { if (b) ok++; else { fehler++; console.log('  ✗ ' + name + (info ? '\n      ' + String(info).slice(0, 600).replace(/\n/g, '\n      ') : '')); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-meta-'));
try {
const W = (rel, inhalt) => { const p = path.join(TMP, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, inhalt); return p; };
const LOG = 'marketing/freigabe/veroeffentlicht/LOG.md', ALOG = 'marketing/freigabe/veroeffentlicht/ANTWORTEN_LOG.md';
const MODUS_STD = { modus: 'autonom', erlaubte_kanaele: ['instagram'], max_beitraege_pro_tag: 1, max_beitraege_pro_woche: 7, kommentare_und_nachrichten: false,
  antworten_auf_eigene_kommentare: { erlaubt: true, max_pro_tag: 3 } };
W('marketing/meta/config.json', JSON.stringify({ api_host: 'graph.facebook.com', api_version: 'v25.0', ig_user_id: '1784', instagram_handle: 'ruinwalk.official', spiel_oeffentlich: false }));
const modus = m => W('marketing/meta/modus.json', JSON.stringify({ ...MODUS_STD, ...m }));
const log = zeilen => W(LOG, '# Veröffentlichungsprotokoll\n\n| Zeitpunkt (UTC) | Modus | Entwurf | Kanal-IDs |\n|---|---|---|---|\n' + zeilen.map(([t, id]) => `| ${t} | autonom | x.md | ${id} |\n`).join(''));
const alog = zeilen => W(ALOG, '| Zeitpunkt (UTC) | Kommentar-ID | Beitrag | Antwort-ID | Antworttext |\n|---|---|---|---|---|\n' + zeilen.map(([t, k]) => `| ${t} | ${k} | 9 | R | Danke |\n`).join(''));
const vor = h => new Date(Date.now() - h * 36e5).toISOString();

function lauf(args, szenario = {}, ohneAttrappe = false) {
  const sz = path.join(TMP, 'szenario.json'), pr = path.join(TMP, 'protokoll.jsonl');
  fs.writeFileSync(sz, JSON.stringify(szenario)); fs.writeFileSync(pr, '');
  const env = { ...process.env, NODE_USE_ENV_PROXY: '1', RW_META_ROOT: TMP, RW_META_URL_BASIS: 'https://raw.example.test/', RW_META_POLL_MS: '1', RW_META_POLL_MAX: '4',
    RW_ATTRAPPE_SZENARIO: sz, RW_ATTRAPPE_PROTOKOLL: pr };
  delete env.META_TOKEN; delete env.HTTPS_PROXY; delete env.https_proxy;
  const r = cp.spawnSync(process.execPath, [...(ohneAttrappe ? [] : ['-r', ATTRAPPE]), SKRIPT, ...args], { env, encoding: 'utf8' });
  const aufrufe = fs.readFileSync(pr, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  return { code: r.status, out: r.stdout + r.stderr, aufrufe, posts: aufrufe.filter(a => a.m === 'POST') };
}

// --- Testmedien
const HAT_FFMPEG = cp.spawnSync('ffmpeg', ['-version']).status === 0;
const video = (rel, groesse, sek, faststart = true) => {
  const p = path.join(TMP, rel); fs.mkdirSync(path.dirname(p), { recursive: true });
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${groesse}:d=${sek}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(faststart ? ['-movflags', '+faststart'] : []), p]);
};
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
['m/a_1.jpg', 'm/a_2.jpg', 'm/a_3.jpg', 'm/einzel.jpg', 'm/story.jpg'].forEach(r => W(r, JPG));
if (HAT_FFMPEG) { video('m/reel.mp4', '108x192', 4); video('m/reel_ohne_faststart.mp4', '108x192', 4, false); video('m/quer.mp4', '192x108', 4); video('m/kurz.mp4', '108x192', 1); }

const ENTWURF = (kopf, abschnitte = {}) => {
  const k = { kanal: 'instagram', status: 'autonom', freigegeben_von: '', ...kopf };
  const a = { 'Faktenprüfung': '- Vier Klassen → `CLASSES` → live', 'Caption Instagram': 'Vom Wanderer zur verborgenen Klasse. Ein Weg, vier Stufen.\n\nWelchen Pfad gehst du?\n\n#ruinwalk #pixelrpg #gpsrpg',
    'Alt-Text': 'Pixel-Art-Figur verwandelt sich Stufe für Stufe vom Wanderer zum Hohepriester.', ...abschnitte };
  return '---\n' + Object.entries(k).map(([x, y]) => `${x}: ${y}`).join('\n') + '\n---\n\n' + Object.entries(a).filter(([, v]) => v !== null).map(([x, y]) => `## ${x}\n${y}\n`).join('\n');
};
let n = 0; const datei = (kopf, ab) => W(`e/${++n}.md`, ENTWURF(kopf, ab));
const senden = (d, sz) => lauf(['veroeffentlichen', d, '--senden'], sz);

console.log('meta-api.js – Bestehendes Verhalten');
modus(); log([]);
{ const d = datei({ format: 'post', bild: 'm/einzel.jpg' });
  const r = lauf(['veroeffentlichen', d]); check(r.code === 0 && /TROCKENLAUF/.test(r.out) && r.aufrufe.length === 0, 'Trockenlauf sendet nichts', r.out);
  const r2 = senden(d); check(r2.code === 0 && r2.posts.length === 2 && r2.posts[0].params.image_url && r2.posts[0].params.alt_text, 'Einzelbild: Container + media_publish', r2.out);
  check(/\| instagram:P\d+ \|/.test(fs.readFileSync(path.join(TMP, LOG), 'utf8')), 'Einzelbild protokolliert als instagram:<id>');
  const r3 = senden(datei({ format: 'post', bild: 'm/einzel.jpg' })); check(r3.code === 1 && /Tageslimit erreicht/.test(r3.out) && r3.aufrufe.length === 0, 'Feed-Tageslimit greift weiter', r3.out); }
log([]);
{ const r = senden(datei({ format: 'post', bild: 'm/einzel.jpg', status: 'entwurf' })); check(r.code === 1 && r.aufrufe.length === 0, 'status entwurf wird abgelehnt', r.out); }
modus({ modus: 'pause' });
{ const r = senden(datei({ format: 'post', bild: 'm/einzel.jpg' })); check(r.code === 1 && /pause/.test(r.out) && r.aufrufe.length === 0, 'Modus pause sperrt', r.out); }
modus({ modus: 'freigabe' });
{ const r = senden(datei({ format: 'post', bild: 'm/einzel.jpg', status: 'autonom' })); check(r.code === 1 && r.aufrufe.length === 0, 'Modus freigabe: autonom reicht nicht', r.out); }
modus();
{ const r = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, { 'Caption Instagram': 'Ruin Walk wartet auf dich. Link in Bio, jetzt testen und losziehen!\n\n#ruinwalk #a #b' })]);
  check(r.code === 1 && /nicht öffentlich/.test(r.out), 'Spiel nicht öffentlich: Link in Bio wird abgelehnt', r.out);
  const cfgP = path.join(TMP, 'marketing/meta/config.json'), alt = fs.readFileSync(cfgP, 'utf8'), c = JSON.parse(alt); delete c.spiel_oeffentlich;
  fs.writeFileSync(cfgP, JSON.stringify(c));
  const r2 = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, { 'Caption Instagram': 'Ruin Walk wartet auf dich. Link in Bio und los geht es draußen!\n\n#ruinwalk #a #b' })]);
  check(r2.code === 1 && /nicht öffentlich/.test(r2.out), 'fehlender Schlüssel spiel_oeffentlich = nicht öffentlich (Sperre aktiv)', r2.out);
  fs.writeFileSync(cfgP, JSON.stringify({ ...c, spiel_oeffentlich: true }));
  const r3 = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, { 'Caption Instagram': 'Ruin Walk wartet auf dich. Link in Bio und los geht es draußen!\n\n#ruinwalk #a #b' })]);
  check(r3.code === 0, 'nur spiel_oeffentlich: true hebt die Sperre auf', r3.out);
  fs.writeFileSync(cfgP, alt); }

console.log('Test-Schalter nur mit Attrappe (QA H1)');
log([[vor(1), 'instagram:1']]);
{ const d = datei({ format: 'post', bild: 'm/einzel.jpg' });
  const r = lauf(['veroeffentlichen', d, '--senden'], {}, true);
  check(r.code === 1 && /nur mit der Test-Attrappe/.test(r.out), 'ohne Attrappe: RW_META_ROOT wird nicht ausgewertet, Abbruch', r.out);
  const r2 = lauf(['pruefen', d], {}, true); check(r2.code === 1 && /Test-Attrappe/.test(r2.out), 'ohne Attrappe: auch pruefen bricht bei RW_META_* ab', r2.out); }
log([]);
{ const r = senden(datei({ format: 'post', bild: 'm/einzel.jpg' }), { status: ['ERROR'] });
  check(r.code === 2 && !r.posts.some(p => /media_publish/.test(p.p)), 'Bild-Container ERROR: kein media_publish', r.out);
  const r2 = senden(datei({ format: 'post', bild: 'm/einzel.jpg' }), { status: ['EXPIRED'] });
  check(r2.code === 2 && !r2.posts.some(p => /media_publish/.test(p.p)), 'Bild-Container EXPIRED: kein media_publish', r2.out);
  check(!/instagram:P/.test(fs.readFileSync(path.join(TMP, LOG), 'utf8')), 'fehlgeschlagenes Bild wird nicht protokolliert'); }

console.log('Verborgene Klassen bleiben geheim (Pascal 20.11.2026)');
{ const GEHEIM = require('../scripts/geheim.js'), v = GEHEIM.verborgen();
  check(v.length === 12 && v.some(x => x.name === 'Lichtgesandter' && x.fig === 'lichtgesandter' && x.faehigkeit === 'Himmelslicht'), 'Ableitung aus index.html: 12 dritte Stufen inkl. Lichtgesandter/Himmelslicht', JSON.stringify(v));
  check(!v.some(x => ['Priester', 'Hohepriester', 'Ritter', 'Paladin'].includes(x.name)), 'sichtbare Stufen 1–2 sind keine Sperrwörter');
  check(v.find(x => x.name === 'Weltenbrecher').faehigkeit === null && v.find(x => x.name === 'Erleuchteter').faehigkeit === null, 'feste Ausnahmen „Erdbeben“ (BFX) und „Erleuchtung“ (SECRET.moench.h)');
  check(v.find(x => x.pfad === 'ritter').set === 'Sonnenaegis' && v.find(x => x.pfad === 'frost').set === 'Ewigwinter', 'Set-Namen der Stufe 3 (PSN[*][2]) sind Sperrwörter');
  for (const t of ['Sonnenwaechter', 'Weltenbaum Hüter', 'Weltenbaumhüter', '#phoenixweber', 'Herr-der-Wildnis-Bogen', 'Herrn der Wildnis', 'Sonnenwächterin', 'Nachtpirscherin',
    'Lichtgesandten', 'die Lichtgesandte', 'Set Sonnenaegis', 'Ewigwinter-Rüstung', 'Himmelsriss', 'figs winterherrscher', 'WINTERHERRSCHER'])
    check(GEHEIM.treffer(t).length > 0, 'Sperrwort erkannt: ' + t);
  for (const t of ['Erdbeben', 'Erleuchtung', 'Herr', 'Priester', 'Hohepriester', 'Heiliger Schild', 'Der Winter wird hart', 'Ein Phantom', 'Das Auge des Falken', 'Herren und Damen'])
    check(GEHEIM.treffer(t).length === 0, 'kein Fehlalarm: ' + t, GEHEIM.treffer(t));
  // Gegenprobe: alle 12 Rätselsprüche und die Beiträge/Entwürfe 001–007 ohne Fehlalarm
  const RW = path.resolve(__dirname, '../../../..'), idx = fs.readFileSync(path.join(RW, 'index.html'), 'utf8');
  const spr = [...idx.slice(idx.indexOf('const SECRET={')).split('\n};')[0].matchAll(/h:'([^']+)'/g)].map(m => m[1]);
  check(spr.length === 12, '12 Rätselsprüche gefunden');
  for (const h of spr) check(GEHEIM.treffer(h).length === 0, 'Rätselspruch ohne Fehlalarm: ' + h, GEHEIM.treffer(h));
  for (const ord of ['marketing/freigabe/veroeffentlicht', 'marketing/freigabe/entwuerfe']) for (const d of fs.readdirSync(path.join(RW, ord)).filter(x => /^00\d_.*\.md$/.test(x))) {
    const t = fs.readFileSync(path.join(RW, ord, d), 'utf8'), oeff = ['Caption Instagram', 'Text Facebook', 'Text im Bild', 'Alt-Text'].map(n => ((t.match(new RegExp('## ' + n + '\\n([\\s\\S]*?)(\\n## |$)')) || [])[1] || '')).join('\n');
    check(oeff.length > 200 && GEHEIM.treffer(oeff).length === 0, 'Beitrag ohne Fehlalarm (Text gelesen): ' + d, oeff.length + ' ' + GEHEIM.treffer(oeff)); }
  const ok = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, { 'Caption Instagram': 'Die dritte Stufe bleibt ein Geheimnis. Wer Leben bewahrt, wird vom Himmel gesandt.\n\n#ruinwalk #pixelrpg #gpsrpg' })]);
  check(ok.code === 0, 'Hinweis und Rätselspruch ohne Namen sind erlaubt', ok.out);
  const lv = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, { 'Caption Instagram': 'Ab Level 50 wartet eine verborgene Klasse. LEVEL 50 · STUFE 3, mehr verraten wir nicht.\n\n#ruinwalk #pixelrpg #gpsrpg' })]);
  check(lv.code === 0, 'nötiges Level der dritten Stufe („Level 50“) darf genannt werden (Pascal 21.11.2026)', lv.out);
  check(GEHEIM.treffer('Ab Level 50 wartet eine verborgene Klasse.').length === 0, 'geheim.js sperrt „Level 50“ nicht');
  for (const [ab, name] of [[{ 'Caption Instagram': 'Vom Wanderer zum Lichtgesandten in fünf Stufen, schau selbst.\n\n#ruinwalk #pixelrpg #gpsrpg' }, 'Name in Caption'],
    [{ 'Alt-Text': 'Eine Figur mit Flügeln, beschriftet als Phönixweber, vor dunklem Grund.' }, 'Name im Alt-Text'],
    [{ 'Caption Instagram': 'Die Fähigkeit Himmelslicht heilt dich stark, wenn es eng wird.\n\n#ruinwalk #pixelrpg #gpsrpg' }, 'Fähigkeit der verborgenen Stufe'],
    [{ 'Caption Instagram': 'Der Herr der Wildnis ruft seine Tiere, wenn es ernst wird.\n\n#ruinwalk #pixelrpg #gpsrpg' }, 'mehrteiliger Name']]) {
    const r = lauf(['pruefen', datei({ format: 'post', bild: 'm/einzel.jpg' }, ab)]); check(r.code === 1 && /verborgene Klasse/.test(r.out), 'pruefen sperrt: ' + name, r.out); }
  W('m/figs_lichtgesandter.jpg', JPG);
  const r = lauf(['pruefen', datei({ format: 'post', bild: 'm/figs_lichtgesandter.jpg' })]); check(r.code === 1 && /verborgene Klasse/.test(r.out), 'pruefen sperrt Datei mit Figur-ID der verborgenen Stufe', r.out);
  const mj = W('motive_geheim.json', JSON.stringify([{ datei: 'x.jpg', layout: 'klasse', figuren: [{ bild: 'figs/lichtgesandter.png', name: 'Lichtgesandter' }] }]));
  const rr = cp.spawnSync(process.execPath, [path.join(__dirname, '../../ruinwalk-grafik/scripts/render.js'), mj, path.join(TMP, 'aus')], { encoding: 'utf8' });
  check(rr.status === 1 && /verborgene Klasse/.test(rr.stderr) && !fs.existsSync(path.join(TMP, 'aus', 'x.jpg')), 'render.js verweigert Figur/Name der verborgenen Stufe', rr.stdout + rr.stderr); }
console.log('Karussell und Alt-Text je Seite');
log([]);
{ const r = senden(datei({ format: 'karussell', bild: 'm/a_1.jpg (+ _2 bis _3)' }, { 'Alt-Text': 'Seite 1: Erste Seite mit Logo und Titel auf dunklem Grund.\nSeite 2: Zweite Seite mit drei Pixel-Art-Kreaturen im Wald.\nSeite 3: Dritte Seite mit einer Frage an die Community.' }));
  const kinder = r.posts.filter(p => p.params.is_carousel_item);
  check(r.code === 0 && kinder.length === 3, 'Karussell: drei Seiten', r.out);
  check(kinder.map(k => k.params.alt_text).join('|') === 'Erste Seite mit Logo und Titel auf dunklem Grund.|Zweite Seite mit drei Pixel-Art-Kreaturen im Wald.|Dritte Seite mit einer Frage an die Community.', 'eigener Alt-Text je Karussellseite', JSON.stringify(kinder.map(k => k.params.alt_text)));
  check(r.posts.some(p => p.params.media_type === 'CAROUSEL' && p.params.children === 'C1,C2,C3' && !p.params.alt_text), 'Karussell-Container mit Kindern, ohne alt_text'); }
log([]);
{ const alt = 'Ein gemeinsamer Alt-Text für alle Seiten des Karussells.';
  const r = senden(datei({ format: 'karussell', bild: 'm/a_1.jpg (+ _2 bis _3)' }, { 'Alt-Text': alt }));
  const kinder = r.posts.filter(p => p.params.is_carousel_item);
  check(kinder.length === 3 && kinder.every(k => k.params.alt_text === alt), 'ohne „Seite N:“ gilt ein Alt-Text für alle Seiten (bisheriges Verhalten)', r.out); }
{ const r = lauf(['pruefen', datei({ format: 'karussell', bild: 'm/a_1.jpg (+ _2 bis _3)' }, { 'Alt-Text': 'Seite 1: Erste Seite mit Logo und Titel auf dunklem Grund.' })]);
  check(r.code === 0 && /Hinweis: Alt-Text für Seite 2 fehlt/.test(r.out), 'fehlender Seiten-Alt-Text = Hinweis, kein Fehler', r.out); }

console.log('Story');
log([]);
{ const d = datei({ format: 'story', bild: 'm/story.jpg' }, { 'Caption Instagram': null, 'Text im Bild': 'Neu im Feed: Vom Wanderer zum Hohepriester.' });
  const p = lauf(['pruefen', d]); check(p.code === 0, 'Story-Bild ohne Caption besteht die Prüfung', p.out);
  const r = senden(d); check(r.code === 0 && r.posts[0].params.media_type === 'STORIES' && r.posts[0].params.image_url && !r.posts[0].params.caption, 'Story-Bild: media_type STORIES, image_url, keine Caption', r.out);
  check(/instagram-story:P\d+/.test(fs.readFileSync(path.join(TMP, LOG), 'utf8')), 'Story protokolliert als instagram-story:<id>'); }
log([[vor(1), 'instagram:1']]);
{ const r = senden(datei({ format: 'story', bild: 'm/story.jpg' }, { 'Caption Instagram': null })); check(r.code === 0, 'Story zählt nicht zum Feed-Limit (Feed heute schon 1)', r.out); }
log([[vor(1), 'instagram-story:1'], [vor(2), 'instagram-story:2'], [vor(3), 'instagram-story:3']]);
{ const r = senden(datei({ format: 'story', bild: 'm/story.jpg' }, { 'Caption Instagram': null })); check(r.code === 1 && /Story-Tageslimit/.test(r.out) && r.aufrufe.length === 0, 'Story-Tageslimit 3', r.out);
  const r2 = senden(datei({ format: 'post', bild: 'm/einzel.jpg' })); check(r2.code === 0, 'Stories zählen nicht zum Feed-Tageslimit', r2.out); }
{ const r = lauf(['pruefen', datei({ format: 'story', bild: 'm/story.jpg' }, { 'Caption Instagram': null, 'Text im Bild': 'Link in Bio!' })]);
  check(r.code === 1 && /nicht öffentlich/.test(r.out), 'Story: Text im Bild wird geprüft', r.out); }

if (!HAT_FFMPEG) { uebersprungen += 1; console.log('  (ffmpeg fehlt – Video-Fälle übersprungen)'); }
else {
  console.log('Reel');
  log([]);
  const reel = (kopf = {}, ab) => datei({ format: 'reel', video: 'm/reel.mp4', ...kopf }, ab);
  { const r = lauf(['pruefen', reel()]); check(r.code === 0, 'gültiges Reel besteht die Prüfung', r.out); }
  { const r = lauf(['pruefen', reel({ video: 'm/reel_ohne_faststart.mp4' })]); check(r.code === 1 && /moov/.test(r.out), 'Reel ohne faststart wird abgelehnt', r.out); }
  { const r = lauf(['pruefen', reel({ video: 'm/quer.mp4' })]); check(r.code === 1 && /9:16/.test(r.out), 'Reel im Querformat wird abgelehnt', r.out); }
  { const r = lauf(['pruefen', reel({ video: 'm/kurz.mp4' })]); check(r.code === 1 && /Videodauer/.test(r.out), 'Reel unter 3 s wird abgelehnt', r.out); }
  { const r = lauf(['pruefen', reel({ video: '' })]); check(r.code === 1 && /video:/.test(r.out), 'Reel ohne video: wird abgelehnt', r.out); }
  { const r = lauf(['pruefen', reel({ kanal: 'instagram,facebook' })]); check(r.code === 1 && /nur für Instagram/.test(r.out), 'Reel auf Facebook wird abgelehnt', r.out); }
  // Sperre erstes Reel
  { const d = reel();
    const t = lauf(['veroeffentlichen', d]); check(t.code === 0 && /SPERRE erstes Reel/.test(t.out) && /"media_type":"REELS"/.test(t.out) && t.aufrufe.length === 0, 'Trockenlauf Reel: Plan mit REELS + Sperrhinweis, nichts gesendet', t.out);
    const r = senden(d); check(r.code === 1 && /Erstes Reel/.test(r.out) && r.aufrufe.length === 0, 'Sperre: erstes Reel ohne freigegeben_von: Pascal wird nicht gesendet', r.out); }
  { const r = senden(reel({ freigegeben_von: 'nicht Pascal' })); check(r.code === 1 && /Erstes Reel/.test(r.out) && r.aufrufe.length === 0, 'Sperre: „nicht Pascal“ reicht nicht', r.out);
  const r2 = senden(reel({ freigegeben_von: 'pascal' })); check(r2.code === 1 && r2.aufrufe.length === 0, 'Sperre: nur exakt „Pascal“', r2.out); }
  { const r = senden(reel({ freigegeben_von: 'Pascal' }), { status: ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'] });
    const reihe = r.aufrufe.map(a => a.m + ' ' + a.p.replace(/\d+/g, 'N')).join(' > ');
    check(r.code === 0, 'erstes Reel mit freigegeben_von: Pascal wird gesendet', r.out);
    check(reihe === 'POST /N/media > GET /CN > GET /CN > GET /CN > POST /N/media_publish', 'Reel: Container → Status bis FINISHED → media_publish', reihe);
    const c = r.posts[0].params; check(c.media_type === 'REELS' && c.video_url === 'https://raw.example.test/m/reel.mp4' && c.caption && !c.alt_text, 'Reel-Container: REELS, video_url, caption, kein alt_text', JSON.stringify(c));
    check(/instagram-reel:P\d+/.test(fs.readFileSync(path.join(TMP, LOG), 'utf8')), 'Reel protokolliert als instagram-reel:<id>'); }
  log([[vor(30), 'instagram-reel:1']]);
  { const r = senden(reel()); check(r.code === 0, 'nach dem ersten Reel im LOG: weitere Reels ohne Pascal-Freigabe (Modus autonom)', r.out); }
  log([[vor(30), 'instagram-reel:1']]);
  { const r = senden(reel(), { status: ['IN_PROGRESS', 'ERROR'] }); check(r.code === 2 && !r.posts.some(p => /media_publish/.test(p.p)), 'Container ERROR: kein media_publish', r.out); }
  log([[vor(30), 'instagram-reel:1']]);
  { const r = senden(reel(), { status: ['IN_PROGRESS'] }); check(r.code === 2 && /nicht FINISHED/.test(r.out) && !r.posts.some(p => /media_publish/.test(p.p)), 'Container bleibt IN_PROGRESS: kein media_publish', r.out);
    check(!/instagram-reel:P/.test(fs.readFileSync(path.join(TMP, LOG), 'utf8')), 'nicht veröffentlichtes Reel wird nicht protokolliert'); }
  log([[vor(1), 'instagram:1'], [vor(30), 'instagram-reel:1']]);
  { const r = senden(reel()); check(r.code === 1 && /Tageslimit erreicht/.test(r.out), 'Reel zählt zum Feed-Tageslimit', r.out); }
  log([]);
  { const r = senden(datei({ format: 'story', video: 'm/reel.mp4' }, { 'Caption Instagram': null }), { status: ['IN_PROGRESS', 'FINISHED'] });
    check(r.code === 0 && r.posts[0].params.media_type === 'STORIES' && r.posts[0].params.video_url && r.aufrufe.filter(a => a.m === 'GET').length === 2, 'Story-Video: STORIES + video_url, wartet auf FINISHED', r.out); }
}

console.log('Antworten auf Kommentare');
const KOMM = { id: '555', username: 'jemand', media: { id: '900' }, replies: { data: [] } };
const MEDIA = { id: '900', owner: { id: '1784' }, username: 'ruinwalk.official' };
const SZ = { kommentar: KOMM, media: MEDIA };
modus(); alog([]);
const antw = (text, sz = SZ, id = '555', s = false) => lauf(['antworten', id, text, ...(s ? ['--senden'] : [])], sz);
{ modus({ antworten_auf_eigene_kommentare: { erlaubt: false, max_pro_tag: 3 } });
  const r = antw('Danke dir, schön dass du dabei bist!'); check(r.code === 1 && /nicht freigegeben/.test(r.out) && r.aufrufe.length === 0, 'erlaubt=false sperrt', r.out);
  modus({ antworten_auf_eigene_kommentare: undefined }); const r2 = antw('Danke dir!'); check(r2.code === 1 && r2.aufrufe.length === 0, 'fehlender Eintrag sperrt', r2.out);
  modus({ modus: 'pause' }); const r3 = antw('Danke dir!'); check(r3.code === 1 && r3.aufrufe.length === 0, 'Modus pause sperrt Antworten', r3.out); modus(); }
for (const [t, name] of [['Schau mal auf https://example.com vorbei', 'Link'], ['Mehr auf ruinwalk.de', 'Domain'], ['Frag mal @andereraccount', 'fremde @-Erwähnung'],
  ['Du kannst jetzt spielen!', 'jetzt spielen'], ['Bald kannst du es testen', 'testen'], ['Download kommt', 'Download'], ['Release am 1. Mai', 'Release am'],
  ['Es kostet nichts', 'kostet'], ['Link in Bio', 'Link in Bio'],
  ['Probier es einfach aus!', 'probier'], ['Komm in den Testmodus', 'Testmodus'], ['Mehrspieler kommt im Frühjahr', 'Mehrspieler/Termin'],
  ['Gruppen-Dungeons sind schon fertig', 'Gruppen-Dungeons'], ['Das ist episch, tauche ein', 'VERBOTEN-Liste'], ['Wir starten 2027', 'Jahreszahl'],
  ['Schau auf ruinwalk.eu', 'Domain .eu'], ['Im März ist es so weit', 'Monat'], ['Bis es so weit ist, dauert es', 'so weit'], ['Early Access kommt', 'Early Access'],
  ['Trag dich in die Warteliste ein', 'Warteliste'], ['Zugang gibt es per DM', 'Zugang/DM'], ['Komm in unseren Discord', 'Discord'], ['Mehr dazu: Link im Profil', 'Link im Profil'],
  ['Die Beta läuft', 'Beta'], ['Wir testen gerade neue Monster', 'testen'], ['Ja, es ist der Lichtgesandter!', 'Name verborgene Klasse'], ['Ewiger Winter wartet auf dich', 'Fähigkeit verborgene Stufe'], ['Der Weltboss wird stark', 'Weltboss'], ['Handel und Ranglisten?', 'Handel/Rangliste'], ['x'.repeat(301), '> 300 Zeichen'], ['', 'leer']]) {
  const r = antw(t); check(r.code === 1 && r.aufrufe.length === 0, 'Antwort abgelehnt: ' + name, r.out);
}
{ const r = antw('Danke! Folge @ruinwalk.official für mehr.'); check(r.code === 0, 'eigene @-Erwähnung ist erlaubt', r.out); }
{ const r = antw('Ab Level 50 wird es spannend, mehr verraten wir nicht.'); check(r.code === 0, 'Antwort mit „Level 50“ ist erlaubt', r.out); }
for (const t of ['Danke dir! Der Heiler ist auch unser heimlicher Liebling. Welchen Pfad würdest du nehmen?', 'Gute Frage. Aktuell gibt es fünf Lebensräume, und welcher dir begegnet, entscheiden echte Kartendaten.']) {
  const r = antw(t); check(r.code === 0, 'Beispielantwort aus 13_beitragsmix_serien.md ist erlaubt: ' + t.slice(0, 30), r.out); }
{ const r = antw('Danke dir! Welche Klasse würdest du wählen?', { ...SZ, media: { id: '900', owner: { id: '4711' }, username: 'fremd' } });
  check(r.code === 1 && /eigenen Beitrag/.test(r.out) && !r.posts.length, 'Kommentar unter fremdem Beitrag wird abgelehnt', r.out); }
{ const r = antw('Danke dir!', { ...SZ, kommentar: { ...KOMM, parent_id: '1' } }); check(r.code === 1 && /Hauptkommentare/.test(r.out) && !r.posts.length, 'Antwort auf eine Antwort wird abgelehnt', r.out); }
{ const r = antw('Danke dir!', { ...SZ, kommentar: { ...KOMM, replies: { data: [{ id: '7', username: 'ruinwalk.official' }] } } });
  check(r.code === 1 && /bereits eine Antwort/.test(r.out) && !r.posts.length, 'bereits (in der App) beantwortet wird erkannt', r.out); }
{ const r = antw('Danke dir!', { ...SZ, kommentar: { ...KOMM, username: 'ruinwalk.official' } }); check(r.code === 1 && !r.posts.length, 'eigener Kommentar wird nicht beantwortet', r.out); }
{ const r = antw('Danke dir! Welche Klasse würdest du wählen?'); check(r.code === 0 && /TROCKENLAUF/.test(r.out) && !r.posts.length, 'Trockenlauf: nur lesende Prüfaufrufe', r.out); }
{ const r = antw('Danke dir! Welche Klasse würdest du wählen?', SZ, '555', true);
  check(r.code === 0 && r.posts.length === 1 && r.posts[0].p === '/555/replies' && r.posts[0].params.message.startsWith('Danke'), 'Senden: POST /{kommentar-id}/replies', r.out);
  const l = fs.readFileSync(path.join(TMP, ALOG), 'utf8'); check(/\| 555 \| 900 \| R\d+ \|/.test(l) && !/jemand/.test(l), 'Antwort protokolliert, ohne Namen der kommentierenden Person', l);
  const r2 = antw('Nochmal danke!', SZ, '555', true); check(r2.code === 1 && /bereits beantwortet/.test(r2.out) && r2.aufrufe.length === 0, 'keine doppelte Antwort auf denselben Kommentar', r2.out); }
alog([[vor(1), '1'], [vor(2), '2'], [vor(3), '3']]);
{ const r = antw('Danke dir!', SZ, '556'); check(r.code === 1 && /Tageslimit/.test(r.out) && r.aufrufe.length === 0, 'Tageslimit max_pro_tag', r.out); }
alog([[vor(25), '1'], [vor(26), '2'], [vor(27), '3']]);
{ const r = antw('Danke dir!', { ...SZ, kommentar: { ...KOMM, id: '556' } }, '556'); check(r.code === 0, 'ältere Antworten zählen nicht zum Tageslimit', r.out); }
alog([[vor(5), '555']]);
{ const r = lauf(['kommentare', '7'], { medien: { data: [{ id: '900', caption: 'Test', timestamp: new Date().toISOString(), comments_count: 2 }] },
    kommentare: { data: [{ id: '555', text: 'Cool', username: 'a', timestamp: 'x' }, { id: '556', text: 'Wann?', username: 'b', timestamp: 'x' }] } });
  check(r.code === 0 && /\[beantwortet\] 555/.test(r.out) && /\[offen\]\s+556/.test(r.out) && !r.posts.length, 'kommentare: listet, markiert beantwortete, sendet nichts', r.out); }

console.log('meta-api.js – Aufrufe je Beitrag (nur lesend)');
{ const B = { views: 0, reach: 0, saved: 0, shares: 0, likes: 0, comments: 0, total_interactions: 0 };
  const r = lauf(['aufrufe', '5'], { medien: { data: [
      { id: '901', caption: 'Reel eins', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-11-21T17:26:53+0000' },
      { id: '902', caption: 'Karussell zwei', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', timestamp: '2026-11-22T18:31:55+0000' }] },
    insights: { 901: { ...B, views: 111, reach: 103, ig_reels_avg_watch_time: 2770 }, 902: { ...B, views: 2, reach: 1, profile_visits: 0, follows: null } } });
  check(r.code === 0 && /\| Reel \| Reel eins \| 111 \| 103 \|/.test(r.out) && /\| Karussell \| Karussell zwei \| 2 \| 1 \|/.test(r.out) && /Aufrufe gesamt: 113/.test(r.out), 'aufrufe: Tabelle je Beitrag mit views/reach, Summe', r.out);
  check(/902: follows/.test(r.out) && /\| 0 \| – \|$/m.test(r.out), 'aufrufe: abgelehnte Kennzahl einzeln abgefangen, als – gezeigt', r.out);
  check(!r.posts.length && r.aufrufe.every(a => a.m === 'GET'), 'aufrufe: nur GET-Aufrufe, nichts gesendet', JSON.stringify(r.aufrufe)); }

} catch (x) { fehler++; console.log('  ✗ Abbruch der Testsuite: ' + (x && x.stack || x)); }
finally { fs.rmSync(TMP, { recursive: true, force: true }); }
console.log(`\nErgebnis: ${ok} bestanden, ${fehler} fehlgeschlagen${uebersprungen ? ', Video-Fälle übersprungen (ffmpeg fehlt)' : ''}`);
process.exit(fehler ? 1 : 0);
