/* Ruin Walk – Meta Graph API (Facebook-Seite + Instagram-Professional-Konto).
   Sicherheitsmodell:
   - Standard ist TROCKENLAUF: zeigt nur, welche Anfragen gesendet würden.
   - Schreiben nur mit --senden. Modus aus marketing/meta/modus.json: „freigabe“ = nur status: freigegeben (Pascal);
     „autonom“ = auch status: autonom, wenn die automatische Qualitätsprüfung besteht und Kanal/Limits passen; „pause“ = nichts.
   - Zusätzlich fragt ein Hook (.claude/hooks/schutz.js) vor --senden nach, außer im Modus „autonom“ bei einem schlichten Einzelbefehl.
   - Kein Token im Repo. Der Zugangsschlüssel wird als Netzwerk-Geheimnis für graph.facebook.com hinterlegt
     (Proxy setzt den Authorization-Header) oder lokal über die Umgebungsvariable META_TOKEN übergeben.
   Befehle (Repo-Wurzel):
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js status                       (nur lesen)
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js insights [tage]               (nur lesen)
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js pruefen <entwurf.md>
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md> [--senden]
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js kommentare [tage]             (nur lesen)
     node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js antworten <kommentar-id> "<text>" [--senden]
   Formate (Entwurfskopf „format:“): post · karussell · reel (Feld video:) · story (Feld bild: oder video:).
   Konfiguration (ohne Geheimnisse): marketing/meta/config.json  { "api_version", "page_id", "ig_user_id" }
   Tests (ohne Netz): node .claude/skills/ruinwalk-meta-publishing/tests/meta-api.test.js
   Nur für Tests und nur mit geladener Attrappe (sonst Abbruch): RW_META_ROOT (anderes Wurzelverzeichnis für config/modus/LOG/Medien), RW_META_URL_BASIS (statt GitHub-URL),
   RW_META_POLL_MS / RW_META_POLL_MAX (Statusabfrage). */
const fs = require('fs'), path = require('path');
const GEHEIM = require('./geheim.js');   // verborgene dritte Pfadstufen (Namen/Fähigkeiten/Figuren) – nie öffentlich nennen
// Node-fetch nutzt HTTPS_PROXY nur mit NODE_USE_ENV_PROXY=1 (Claude-Cloud-Umgebung) → einmal mit gesetzter Variable neu starten.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = require('child_process').spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}
// Test-Schalter RW_META_* wirken NUR mit geladener Attrappe (tests/attrappe.js setzt __RW_META_ATTRAPPE und ersetzt fetch).
// Ohne Attrappe: Abbruch – sonst könnten LOG/Limits/Reel-Sperre über ein anderes Wurzelverzeichnis umgangen werden.
const ATTRAPPE = globalThis.__RW_META_ATTRAPPE === true;
const SCHALTER = Object.keys(process.env).filter(k => k.startsWith('RW_META_'));
if (SCHALTER.length && !ATTRAPPE) { console.error('✗ Test-Schalter ' + SCHALTER.join(', ') + ' sind nur mit der Test-Attrappe erlaubt (tests/attrappe.js). Abbruch, nichts gesendet.'); process.exit(1); }
const T = k => (ATTRAPPE ? process.env[k] : undefined);
const ROOT = T('RW_META_ROOT') ? path.resolve(T('RW_META_ROOT')) : path.resolve(__dirname, '../../../..');
const CFG_PATH = path.join(ROOT, 'marketing/meta/config.json');
const [cmd, arg1, ...rest] = process.argv.slice(2).filter(a => a !== '--senden');
const SENDEN = process.argv.includes('--senden');
const cfg = fs.existsSync(CFG_PATH) ? JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) : {};
const V = cfg.api_version || 'v25.0';
const MODUS_PATH = path.join(ROOT, 'marketing/meta/modus.json');
const LOG_PATH = path.join(ROOT, 'marketing/freigabe/veroeffentlicht/LOG.md');
const ANTWORT_LOG = path.join(ROOT, 'marketing/freigabe/veroeffentlicht/ANTWORTEN_LOG.md');
const MODUS = fs.existsSync(MODUS_PATH) ? JSON.parse(fs.readFileSync(MODUS_PATH, 'utf8')) : { modus: 'freigabe' };
// api_host: graph.instagram.com (Instagram-API mit Instagram-Login, ohne Facebook-Seite) oder graph.facebook.com (Facebook-Login/Business)
const HOST = cfg.api_host || 'graph.facebook.com';
const IG_LOGIN = HOST === 'graph.instagram.com';
const BASE = `https://${HOST}/${V}`;
const IG = cfg.ig_user_id || (IG_LOGIN ? 'me' : '');
const die = (m, code = 1) => { console.error('✗ ' + m); process.exit(code); };

// Stories zählen NICHT zum Feed-Limit aus modus.json, haben aber ein eigenes Tageslimit.
// Bewusst als Konstante im Skript (modus.json ändert nur Pascal). Freigabe Pascal 20.11.2026 (Maßnahme A3: Stories zusätzlich).
const STORY_MAX_PRO_TAG = 3;
// Grenzen der Meta-API (IG User Media, Reels-Spezifikation): MOV/MP4, max. 300 MB, 3 s – 15 min, moov-Atom am Dateianfang.
// Stories-Video: max. 100 MB, 3–60 s (Zahl nur aus Sekundärquelle bestätigt, daher als vorsichtige Grenze).
// GitHub lehnt Dateien > 100 MiB beim Push ab und warnt ab 50 MiB → für raw.githubusercontent.com gilt praktisch 50 MB.
const VIDEO = { reel: { maxMB: 300, minS: 3, maxS: 900 }, story: { maxMB: 100, minS: 3, maxS: 60 }, githubMB: 50 };
const POLL_MS = Number(T('RW_META_POLL_MS') || 5000);   // Abfrageintervall Container-Status (Tests: kurz)
const POLL_MAX = Number(T('RW_META_POLL_MAX') || 60);   // Video: max. 60 × 5 s = 5 min

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
  const f = k => ((fm.match(new RegExp('^' + k + ':[ \\t]*(.*)$', 'm')) || [])[1] || '').replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  const block = name => ((s.match(new RegExp('## ' + name + '\\n([\\s\\S]*?)(\\n## |$)')) || [])[1] || '').trim();
  const e = { status: f('status'), kanal: f('kanal'), freigabe: f('freigegeben_von'), bild_url: f('bild_url'), alt: block('Alt-Text'),
           caption_ig: block('Caption Instagram'), text_fb: block('Text Facebook'), fakten: block('Faktenprüfung'),
           hashtags: block('Hashtags'), bild: f('bild'), video: f('video'), video_url: f('video_url'), vorschau_ms: f('vorschau_ms'),
           text_bild: block('Text im Bild'), format_roh: f('format').toLowerCase(), datei };
  e.format = e.format_roh || (/\(\+/.test(e.bild) ? 'karussell' : 'post');
  if (e.format === 'einzelbild' || e.format === 'bild') e.format = 'post';
  return e;
}
const FORMATE = ['post', 'karussell', 'reel', 'story'];
const istFeed = e => e.format !== 'story';

// Alt-Text je Karussellseite: Zeilen „Seite 1: …“, „Seite 2: …“ im Abschnitt „## Alt-Text“. Ohne solche Zeilen gilt ein Text für alle Seiten.
function altSeiten(e, n) {
  const m = [...e.alt.matchAll(/^\s*(?:[-*]\s*)?Seite\s+(\d+)\s*:\s*(.+)$/gim)];
  if (!m.length) return { je: Array(n).fill(e.alt), eigene: false };
  const je = Array(n).fill(e.alt);
  for (const x of m) { const i = parseInt(x[1]) - 1; if (i >= 0 && i < n && x[2].trim().length >= 20) je[i] = x[2].trim(); }
  return { je, eigene: true, gezaehlt: m.length };
}

// MP4/MOV: liegt das moov-Atom vor mdat („faststart“)? Meta verlangt das für Reels.
function moovVorne(datei) {
  const fd = fs.openSync(datei, 'r'), groesse = fs.fstatSync(fd).size, buf = Buffer.alloc(16);
  try {
    let pos = 0;
    while (pos + 8 <= groesse) {
      fs.readSync(fd, buf, 0, 16, pos);
      let len = buf.readUInt32BE(0); const typ = buf.toString('latin1', 4, 8);
      if (typ === 'moov') return true;
      if (typ === 'mdat') return false;
      if (len === 1) len = Number(buf.readBigUInt64BE(8)); else if (len === 0) return false;
      if (len < 8) return false;
      pos += len;
    }
  } finally { fs.closeSync(fd); }
  return false;
}
// Videodaten über ffprobe (falls installiert). null = nicht prüfbar.
function videoInfo(datei) {
  try {
    const out = require('child_process').execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', datei]).toString();
    const j = JSON.parse(out), v = (j.streams || []).find(s => s.codec_type === 'video');
    return { dauer: Number((j.format || {}).duration || 0), breite: v && v.width, hoehe: v && v.height, codec: v && v.codec_name,
             audio: (j.streams || []).filter(s => s.codec_type === 'audio').map(s => s.codec_name) };
  } catch { return null; }
}

// Automatische Qualitätsprüfung (Pflicht im Modus „autonom“, Hinweis im Modus „freigabe“)
const VERBOTEN = [/https?:\/\/(?!luckyone2k\.github\.io)/i, /\b(bald|demnächst|ab sofort mehrspieler|jetzt mit gruppen|weltboss ist da)\b/i,
  /\b(beste[sn]?|ultimativ\w*|revolution\w*|episch\w*)\b/i, /(gewinnspiel|rabatt|kaufen sie|jetzt kaufen)/i, /\b(tauche ein|entfessle)\b/i];
const NICHT_OEFFENTLICH = /(link in (der )?bio|jetzt (testen|spielen|ausprobieren)|(probier|teste|spiel)\w* (es )?(jetzt|sofort|gleich)|zum (spiel|testen)\b|ausprobieren willst|so startest du|testmodus)/i;
function pruefen(e) {
  const f = [];
  if (!FORMATE.includes(e.format)) f.push(`format „${e.format}“ unbekannt (erlaubt: ${FORMATE.join(', ')})`);
  if (istFeed(e) || e.caption_ig) {
    if (!e.caption_ig || e.caption_ig.length < 40) f.push('Caption Instagram fehlt oder zu kurz');
    if (e.caption_ig.length > 2200) f.push('Caption länger als 2.200 Zeichen');
    const first = (e.caption_ig.split('\n')[0] || ''); if (first.length > 125) f.push('Hook (erste Zeile) länger als 125 Zeichen');
    const tags = (e.caption_ig.match(/#[\wäöüß]+/gi) || []);
    if (tags.length < 3 || tags.length > 5) f.push(`Hashtags in der Caption: ${tags.length} (erlaubt 3–5)`);
    if (!tags.map(t => t.toLowerCase()).includes('#ruinwalk')) f.push('#ruinwalk fehlt');
  }
  if (!e.alt || e.alt.length < 20) f.push('Alt-Text fehlt');
  if (!e.fakten || !/→/.test(e.fakten)) f.push('Faktenprüfung fehlt (Aussage → Beleg → Status)');
  const texte = e.caption_ig + '\n' + e.text_fb + '\n' + e.text_bild;
  if (/→[^→\n]*→\s*in entwicklung\b/i.test(e.fakten) && !/in entwicklung/i.test(texte)) f.push('Faktenprüfung nennt etwas „in Entwicklung“, der Text sagt das nicht');
  for (const r of VERBOTEN) if (r.test(texte)) f.push('unzulässige Formulierung/Link: ' + r);
  // Spiel noch nicht öffentlich: kein Link, keine Aufforderung zum Spielen/Testen. Vorsichtig: gilt, solange
  // spiel_oeffentlich nicht ausdrücklich true ist (fehlender Schlüssel = nicht öffentlich).
  if (cfg.spiel_oeffentlich !== true && NICHT_OEFFENTLICH.test(texte))
    f.push('Spiel ist noch nicht öffentlich: keine Links und keine Aufforderung zum Spielen/Testen');
  // Verborgene Klassen (Entscheidung Pascal 20.11.2026): keine Namen, Fähigkeiten oder Figuren der dritten Pfadstufe
  try { const g = GEHEIM.treffer(texte + '\n' + e.alt, [e.bild, e.video, e.video_url, e.bild_url, ...bilderVon(e)]);
    if (g.length) f.push('verborgene Klasse genannt/gezeigt (bleibt geheim): ' + g.join(', ')); }
  catch (x) { f.push('Prüfung verborgener Klassen nicht möglich: ' + x.message); }
  if (/facebook/.test(e.kanal) && ['reel', 'story'].includes(e.format)) f.push(`format ${e.format} ist nur für Instagram umgesetzt`);

  if (e.format === 'reel' || (e.format === 'story' && e.video)) {
    if (!e.video) f.push('Reel braucht ein Feld video: (MP4)');
    else {
      const abs = path.join(ROOT, e.video), g = VIDEO[e.format];
      if (!fs.existsSync(abs)) f.push('Videodatei fehlt: ' + e.video);
      else {
        if (!/\.(mp4|mov)$/i.test(e.video)) f.push('Video muss MP4 oder MOV sein: ' + e.video);
        const mb = fs.statSync(abs).size / 1e6;
        if (mb > g.maxMB) f.push(`Video ${mb.toFixed(1)} MB > ${g.maxMB} MB (Meta-Grenze ${e.format})`);
        if (mb > VIDEO.githubMB && !/^https:\/\//.test(e.video_url)) f.push(`Video ${mb.toFixed(1)} MB > ${VIDEO.githubMB} MB – zu groß für die Ablage über GitHub`);
        if (!moovVorne(abs)) f.push('Video: moov-Atom nicht am Dateianfang (ffmpeg … -movflags +faststart)');
        const vi = videoInfo(abs);
        if (vi) {
          if (vi.dauer < g.minS || vi.dauer > g.maxS) f.push(`Videodauer ${vi.dauer.toFixed(1)} s außerhalb ${g.minS}–${g.maxS} s`);
          if (!['h264', 'hevc'].includes(vi.codec)) f.push(`Video-Codec ${vi.codec} (erwartet H.264 oder HEVC)`);
          if (vi.breite && vi.hoehe && Math.abs(vi.breite / vi.hoehe - 9 / 16) > 0.01) f.push(`Seitenverhältnis ${vi.breite}×${vi.hoehe} ist nicht 9:16`);
          if (vi.audio.some(a => a !== 'aac')) f.push('Audio muss AAC sein');
        }
      }
    }
  }
  if (e.format !== 'reel' && !(e.format === 'story' && e.video)) {
    const bilder = bilderVon(e);
    if (!bilder.length) f.push('Bilddatei fehlt');
    for (const b of bilder) if (!fs.existsSync(path.join(ROOT, b))) f.push('Bilddatei fehlt: ' + b);
    for (const b of bilder) if (!/\.jpe?g$/i.test(b)) f.push('Instagram-API akzeptiert nur JPEG: ' + b);
    if (e.format === 'story' && bilder.length > 1) f.push('Story: nur ein Bild je Entwurf');
    if (bilder.length > 1) {
      const a = altSeiten(e, bilder.length);
      // Fehlende Seiten sind kein Fehler (bisheriges Verhalten: ganzer Alt-Text-Block für jede Seite), aber ein Hinweis.
      if (a.eigene) a.je.forEach((t, i) => { if (t === e.alt) (e.hinweise = e.hinweise || []).push(`Alt-Text für Seite ${i + 1} fehlt – diese Seite bekommt den ganzen Alt-Text-Block`); });
      if (a.eigene && a.gezaehlt > bilder.length) f.push(`Alt-Text nennt ${a.gezaehlt} Seiten, Karussell hat ${bilder.length}`);
    }
  }
  return f;
}
// Bilder eines Entwurfs: „bild: pfad_1.jpg (+ _2 bis _6)“ = Karussell; sonst Einzelbild
function bilderVon(e) {
  const erst = (e.bild || '').split(' ')[0]; if (!erst) return [];
  const m = erst.match(/^(.*_)(\d+)(\.\w+)$/);
  if (!m || !/\(\+/.test(e.bild)) return [erst];
  const dir = path.dirname(path.join(ROOT, erst)), basis = path.basename(m[1]), ende = m[3];
  if (!fs.existsSync(dir)) return [erst];
  return fs.readdirSync(dir).filter(x => x.startsWith(basis) && x.endsWith(ende) && /^\d+$/.test(x.slice(basis.length, -ende.length)))
    .sort((a, b) => parseInt(a.slice(basis.length)) - parseInt(b.slice(basis.length))).slice(0, 10)
    .map(x => path.relative(ROOT, path.join(dir, x)).split(path.sep).join('/'));
}
// Öffentliche Bild-/Video-URL: raw.githubusercontent.com auf einem festen, bereits gepushten Commit (öffentliches Repo).
// Kein Push auf main nötig. Der Commit-Hash macht die Adresse unveränderlich.
// Hinweis Video: raw.githubusercontent.com liefert MP4 als application/octet-stream (geprüft 20.11.2026) – ob Instagram das annimmt,
// zeigt erst der erste echte Upload. Ausweg: video_url: auf eine andere öffentliche Ablage (z. B. GitHub Pages) setzen.
function githubUrl(rel) {
  if (T('RW_META_URL_BASIS')) return T('RW_META_URL_BASIS') + rel;   // nur Tests (ohne git/Netz)
  const cp = require('child_process'), git = a => cp.execFileSync('git', a, { cwd: ROOT }).toString().trim();
  const repo = (cfg.github_repo || 'LuckyOne2k/ruinwalk');
  let sha = null;
  try { const zweig = git(['rev-parse', '--abbrev-ref', 'HEAD']); git(['fetch', '-q', 'origin', zweig]); sha = git(['rev-parse', 'FETCH_HEAD']); } catch { }
  if (!sha) throw new Error('Commit auf GitHub nicht ermittelbar – Dateien erst committen und pushen.');
  try { git(['cat-file', '-e', `${sha}:${rel}`]); } catch { throw new Error(`Datei ${rel} ist noch nicht auf GitHub gepusht.`); }
  return `https://raw.githubusercontent.com/${repo}/${sha}/${rel}`;
}

// LOG.md-Zeilen: | Zeitpunkt | Modus | Entwurf | Kanal-IDs |. Stories: „instagram-story:ID“, Reels: „instagram-reel:ID“, sonst Feed.
function logZeilen() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(l => /^\| \d{4}-/.test(l)).map(l => ({ t: Date.parse(l.split('|')[1].trim()), z: l }));
}
function logZaehlen() {
  const jetzt = Date.now(), alle = logZeilen(), feed = alle.filter(x => !/instagram-story:/.test(x.z)), story = alle.filter(x => /instagram-story:/.test(x.z));
  return { tag: feed.filter(x => jetzt - x.t < 864e5).length, woche: feed.filter(x => jetzt - x.t < 7 * 864e5).length,
           storyTag: story.filter(x => jetzt - x.t < 864e5).length, reels: alle.filter(x => /instagram-reel:/.test(x.z)).length };
}
function logSchreiben(e, erg) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, '# Veröffentlichungsprotokoll\n\n| Zeitpunkt (UTC) | Modus | Entwurf | Kanal-IDs |\n|---|---|---|---|\n');
  fs.appendFileSync(LOG_PATH, `| ${new Date().toISOString()} | ${MODUS.modus} | ${path.basename(e.datei)} | ${erg.join(', ')} |\n`);
}

// Container-Status abwarten (FINISHED). Video: Pflicht, sonst wird nicht veröffentlicht.
async function warten(id, streng) {
  for (let i = 0; i < (streng ? POLL_MAX : 20); i++) {
    const st = await api('GET', '/' + id, { fields: 'status_code,status' }).catch(() => ({}));
    if (st.status_code === 'FINISHED') return;
    if (!st.status_code && !streng) return;
    if (['ERROR', 'EXPIRED'].includes(st.status_code)) throw new Error(`Container ${id}: ${st.status_code} ${st.status || ''}`.trim());
    await new Promise(r => setTimeout(r, streng ? POLL_MS : Math.min(POLL_MS, 3000)));
  }
  if (streng) throw new Error(`Container ${id} ist nach ${POLL_MAX} Abfragen nicht FINISHED – nichts veröffentlicht.`);
}

// ---- Antworten auf Kommentare unter eigenen Beiträgen (Freigabe Pascal 20.11.2026, modus.json → antworten_auf_eigene_kommentare)
const ANTWORT_MAX_ZEICHEN = 300;
const ANTWORT_VERBOTEN = [
  [/https?:\/\/|www\./i, 'Link/URL'],
  [/\b[\w-]+\.[a-z]{2,24}\b/i, 'Domain'],                                  // beliebige Endung (ruinwalk.eu, x.app …)
  [/\b(jetzt|gleich|sofort)\s+spielen\b|\bspiel\w*\s+(es\s+)?(jetzt|gleich|sofort)\b/i, 'Aufforderung zum Spielen'],
  [/\bprobier\w*|\bausprobier\w*/i, 'Ausprobieren'],
  [/\btest\w*|\bbeta\b/i, 'Testen/Testmodus/Beta'],
  [/\b(download\w*|herunterlad\w*|app[\s-]?store|play[\s-]?store|anmeld\w*|registrier\w*)\b/i, 'Download/Anmeldung'],
  [/\b(release|erscheint|erscheinen|veröffentlich\w*|start\w*|kommt|kommen)\s+(am|im|ab|bald|demnächst|noch)\b|\b(bald|demnächst|frühjahr|sommer|herbst|winter|weihnachten|ostern|nächste[nsr]? (woche|monat|jahr))\b/i, 'Termin-Zusage'],
  [/\b20\d\d\b/, 'Jahreszahl'],
  [/\b(kostet|kosten\w*|preis\w*|gratis|free|€|euro|bezahl\w*|kauf\w*)\b/i, 'Preis/Geld'],
  [/\b(mehrspieler\w*|multiplayer|gruppe\w*|dungeon\w*|instanz\w*|weltboss\w*|handel\w*|marktplatz|rangliste\w*|ranking|pvp|gilde\w*|clan\w*)\b/i, 'Funktion nicht live (nur Pascal darf dazu etwas sagen)'],
  [/link in (der |dem )?(bio|profil)\b|link im profil/i, 'Link in Bio/Profil'],
  [/\b(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|\bso weit\b|\bsoweit\b/i, 'Monat/„so weit“ (Termin)'],
  [/\bearly[\s-]?access\b|\bwarteliste\w*|\bzugang\w*|\bzugäng\w*|\bvorab\w*/i, 'Early Access/Warteliste/Zugang'],
  [/\b(dm|dms|pn|direktnachricht\w*|privatnachricht\w*|schreib (uns|mir) (privat|eine nachricht))\b|\bdiscord\w*/i, 'DM/Discord'],
];
function antwortPruefen(text) {
  const f = [];
  const t = (text || '').trim();
  if (!t) f.push('Antworttext fehlt');
  if (t.length > ANTWORT_MAX_ZEICHEN) f.push(`Antwort ${t.length} Zeichen (max. ${ANTWORT_MAX_ZEICHEN})`);
  const eigen = (cfg.instagram_handle || 'ruinwalk.official').toLowerCase();
  for (const m of t.match(/@[\w.]+/g) || []) if (m.slice(1).toLowerCase().replace(/\.$/, '') !== eigen) f.push('keine @-Erwähnung fremder Konten: ' + m);
  const ohneEigen = t.replace(new RegExp('@' + eigen.replace(/\./g, '\\.'), 'gi'), '@konto');   // eigene Erwähnung ist kein Link
  for (const [r, name] of ANTWORT_VERBOTEN) if (r.test(ohneEigen)) f.push('nicht erlaubt: ' + name);
  for (const r of VERBOTEN) if (r.test(ohneEigen)) f.push('unzulässige Formulierung: ' + r);
  try { const g = GEHEIM.treffer(ohneEigen); if (g.length) f.push('verborgene Klasse genannt (bleibt geheim): ' + g.join(', ')); }
  catch (x) { f.push('Prüfung verborgener Klassen nicht möglich: ' + x.message); }
  if (cfg.spiel_oeffentlich !== true && NICHT_OEFFENTLICH.test(ohneEigen)) f.push('Spiel ist noch nicht öffentlich: keine Aufforderung zum Spielen/Testen');
  return [...new Set(f)];
}
function antwortLog() {
  if (!fs.existsSync(ANTWORT_LOG)) return [];
  return fs.readFileSync(ANTWORT_LOG, 'utf8').split('\n').filter(l => /^\| \d{4}-/.test(l)).map(l => { const s = l.split('|').map(x => x.trim()); return { t: Date.parse(s[1]), kommentar: s[2] }; });
}

(async () => {
  if (cmd === 'pruefen') {
    const e = leseEntwurf(arg1), f = pruefen(e);
    console.log(`Modus: ${MODUS.modus} · Format: ${e.format} · Prüfung ${path.basename(arg1)}: ${f.length ? f.length + ' Fehler' : 'bestanden'}`);
    if (['reel', 'story'].includes(e.format)) console.log('  Hinweis: Alt-Text wird bei Reels/Stories nicht per API übertragen (nur Bildbeiträge) – ggf. in der App ergänzen.');
    (e.hinweise || []).forEach(x => console.log('  Hinweis: ' + x));
    f.forEach(x => console.log('  ✗ ' + x)); process.exit(f.length ? 1 : 0);
  }
  if (cmd === 'status') {
    if (IG_LOGIN) {
      const me = await api('GET', '/me', { fields: 'user_id,username,account_type,media_count' });
      console.log(`Instagram-Konto: @${me.username} (ID ${me.user_id}, Typ ${me.account_type}, ${me.media_count} Beiträge) über ${HOST}`);
      const lim = await api('GET', `/${IG}/content_publishing_limit`, { fields: 'quota_usage,config' }).catch(() => null);
      if (lim && lim.data && lim.data[0]) console.log('API-Veröffentlichungen in den letzten 24 h:', lim.data[0].quota_usage, '/', (lim.data[0].config || {}).quota_total);
      console.log('Kommentar-Antworten brauchen beim Instagram-Login die Berechtigung instagram_business_manage_comments (hier nicht abfragbar).');
      return;
    }
    if (IG) {
      const k = await api('GET', '/' + IG, { fields: 'id,username,name,media_count,followers_count' });
      console.log(`Instagram-Konto: @${k.username} (ID ${k.id}, ${k.media_count} Beiträge, ${k.followers_count} Follower) über ${HOST}`);
      const lim = await api('GET', `/${IG}/content_publishing_limit`, { fields: 'quota_usage,config' }).catch(() => null);
      if (lim && lim.data && lim.data[0]) console.log('API-Veröffentlichungen in den letzten 24 h:', lim.data[0].quota_usage, '/', (lim.data[0].config || {}).quota_total);
      const perms = await api('GET', '/me/permissions').catch(() => ({ data: [] }));
      const ok = (perms.data || []).filter(p => p.status === 'granted').map(p => p.permission);
      console.log('Berechtigungen:', ok.join(', '));
      console.log('Kommentare beantworten (instagram_manage_comments):', ok.includes('instagram_manage_comments') ? 'ja' : 'NEIN – Berechtigung fehlt im Token');
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
  if (cmd === 'kommentare') {
    if (!IG) die('ig_user_id fehlt in marketing/meta/config.json');
    const tage = Number(arg1 || 7), seit = Date.now() - tage * 864e5;
    const eigen = (cfg.instagram_handle || 'ruinwalk.official').toLowerCase();
    const beantwortet = new Set(antwortLog().map(x => x.kommentar));
    const media = await api('GET', `/${IG}/media`, { fields: 'id,caption,timestamp,comments_count,permalink', limit: 25 });
    let n = 0;
    for (const m of (media.data || []).filter(m => Date.parse(m.timestamp) >= seit && m.comments_count > 0)) {
      const c = await api('GET', `/${m.id}/comments`, { fields: 'id,text,username,timestamp,replies{id,username}', limit: 50 });
      console.log(`\nBeitrag ${m.id} (${(m.caption || '').split('\n')[0].slice(0, 50)}) ${m.permalink || ''}`);
      for (const k of c.data || []) {
        if ((k.username || '').toLowerCase() === eigen) continue;
        const ja = beantwortet.has(k.id) || ((k.replies || {}).data || []).some(r => (r.username || '').toLowerCase() === eigen);
        console.log(`  ${ja ? '[beantwortet]' : '[offen]      '} ${k.id} · ${k.timestamp} · ${String(k.text || '').replace(/\s+/g, ' ').slice(0, 200)}`);
        n++;
      }
    }
    console.log(`\n${n} Kommentare in ${tage} Tagen. Nur lesend. Antworten: antworten <kommentar-id> "<text>" (heikle Kommentare nicht beantworten, Pascal melden).`);
    return;
  }
  if (cmd === 'antworten') {
    const kid = arg1, text = rest.join(' ');
    const regel = MODUS.antworten_auf_eigene_kommentare || {};
    if (MODUS.modus === 'pause') die('Modus „pause“: nichts wird gesendet.');
    if (regel.erlaubt !== true) die('Antworten auf Kommentare ist nicht freigegeben (modus.json → antworten_auf_eigene_kommentare.erlaubt).');
    if (!kid || !/^\d+$/.test(kid)) die('Kommentar-ID fehlt oder ungültig');
    const f = antwortPruefen(text); if (f.length) die('Antwort nicht zulässig:\n  - ' + f.join('\n  - '));
    const log = antwortLog();
    if (log.some(x => x.kommentar === kid)) die(`Kommentar ${kid} wurde bereits beantwortet (ANTWORTEN_LOG.md).`);
    const heute = log.filter(x => Date.now() - x.t < 864e5).length;
    if (heute >= (regel.max_pro_tag || 0)) die(`Tageslimit für Antworten erreicht (${heute}/${regel.max_pro_tag || 0}).`);
    if (!IG) die('ig_user_id fehlt in marketing/meta/config.json');
    const eigen = (cfg.instagram_handle || 'ruinwalk.official').toLowerCase();
    // Lesend prüfen: Kommentar existiert, ist ein Hauptkommentar, steht unter einem EIGENEN Beitrag, ist nicht von uns, noch nicht beantwortet.
    const k = await api('GET', '/' + kid, { fields: 'id,username,media{id},parent_id,hidden,replies{id,username}' });
    if (k.parent_id) die('Nur Hauptkommentare beantworten (das ist bereits eine Antwort).');
    if (k.hidden) die('Kommentar ist ausgeblendet – nicht beantworten.');
    if ((k.username || '').toLowerCase() === eigen) die('Eigener Kommentar – keine Antwort nötig.');
    if (((k.replies || {}).data || []).some(r => (r.username || '').toLowerCase() === eigen)) die('Kommentar hat bereits eine Antwort von @' + eigen + '.');
    const mid = k.media && k.media.id; if (!mid) die('Beitrag zum Kommentar nicht ermittelbar.');
    const m = await api('GET', '/' + mid, { fields: 'id,owner{id},username' }).catch(() => ({}));
    const eigeneId = IG === 'me' ? (await api('GET', '/me', { fields: 'user_id' })).user_id : IG;
    const owner = m.owner && m.owner.id;
    if (!(owner === String(eigeneId) || (m.username || '').toLowerCase() === eigen)) die('Kommentar steht nicht unter einem eigenen Beitrag – keine Antwort.');
    console.log(SENDEN ? 'SENDEN:' : 'TROCKENLAUF (nichts wird gesendet):');
    console.log(` POST ${BASE}/${kid}/replies\n   ${JSON.stringify({ message: text })}`);
    if (!SENDEN) return console.log('\nZum Senden: denselben Befehl mit --senden.');
    const r = await api('POST', `/${kid}/replies`, { message: text });
    fs.mkdirSync(path.dirname(ANTWORT_LOG), { recursive: true });
    if (!fs.existsSync(ANTWORT_LOG)) fs.writeFileSync(ANTWORT_LOG, '# Antworten auf Kommentare (nur eigene Beiträge)\n\nKeine Namen von Kommentierenden (Datenschutz). Text = unsere Antwort.\n\n| Zeitpunkt (UTC) | Kommentar-ID | Beitrag | Antwort-ID | Antworttext |\n|---|---|---|---|---|\n');
    fs.appendFileSync(ANTWORT_LOG, `| ${new Date().toISOString()} | ${kid} | ${mid} | ${r.id} | ${text.replace(/\|/g, '/').replace(/\n/g, ' ')} |\n`);
    console.log('✓ Antwort gesendet:', r.id, '→ protokolliert in ANTWORTEN_LOG.md');
    return;
  }
  if (cmd === 'veroeffentlichen') {
    const e = leseEntwurf(arg1);
    if (MODUS.modus === 'pause') die('Modus „pause“: Marketing ist von Pascal angehalten. Nichts wird veröffentlicht.');
    const z = logZaehlen();
    if (MODUS.modus === 'autonom') {
      if (!['freigegeben', 'autonom'].includes(e.status)) die(`Entwurf hat status "${e.status || 'leer'}" – im Modus „autonom“ nötig: status: autonom (nach bestandener Prüfung) oder freigegeben.`);
      const f = pruefen(e); if (f.length) die('Qualitätsprüfung nicht bestanden:\n  - ' + f.join('\n  - '));
      const kanaele = e.kanal.split(',').map(k => k.trim());
      for (const k of kanaele) if (!(MODUS.erlaubte_kanaele || []).includes(k)) die(`Kanal „${k}“ ist im Modus autonom nicht freigeschaltet (modus.json).`);
      if (istFeed(e)) {
        if (z.tag >= (MODUS.max_beitraege_pro_tag || 1)) die(`Tageslimit erreicht (${z.tag}).`);
        if (z.woche >= (MODUS.max_beitraege_pro_woche || 4)) die(`Wochenlimit erreicht (${z.woche}).`);
      } else if (z.storyTag >= STORY_MAX_PRO_TAG) die(`Story-Tageslimit erreicht (${z.storyTag}/${STORY_MAX_PRO_TAG}).`);
    } else {
      if (e.status !== 'freigegeben') die(`Entwurf hat status "${e.status || 'leer'}" – Veröffentlichung nur mit status: freigegeben (durch Pascal).`);
      if (!/pascal/i.test(e.freigabe)) die('freigegeben_von muss Pascal nennen.');
      if (!istFeed(e) && z.storyTag >= STORY_MAX_PRO_TAG) die(`Story-Tageslimit erreicht (${z.storyTag}/${STORY_MAX_PRO_TAG}).`);
    }
    // Sperre erstes Reel: solange LOG.md kein Reel enthält, nur mit freigegeben_von: Pascal (Entscheidung Pascal 20.11.2026).
    // Prozessregel: Das Feld trägt nur Pascal ein (der Agent nie). Exakt „Pascal“, keine Varianten.
    const reelSperre = e.format === 'reel' && z.reels === 0 && e.freigabe !== 'Pascal';
    if (reelSperre && SENDEN) die('Erstes Reel: Veröffentlichung nur mit genau „freigegeben_von: Pascal“ im Entwurf (noch kein Reel im LOG).');
    if (['reel', 'story'].includes(e.format) && /facebook/.test(e.kanal)) die(`format ${e.format} ist nur für Instagram umgesetzt`);

    const plan = [];
    let urls = [], videoUrl = '';
    const istVideo = e.format === 'reel' || (e.format === 'story' && !!e.video);
    if (istVideo) {
      if (/^https:\/\//.test(e.video_url)) videoUrl = e.video_url;
      else { try { videoUrl = githubUrl(e.video); } catch (x) { die(x.message); } }
    } else {
      const bilder = bilderVon(e);
      if (/^https:\/\//.test(e.bild_url)) urls = [e.bild_url];
      else { try { urls = bilder.map(githubUrl); } catch (x) { die(x.message); } }
      if (!urls.length) die('Keine Bilder gefunden.');
    }
    const alt = altSeiten(e, urls.length || 1).je;
    if (/instagram/.test(e.kanal)) {
      if (!IG) die('ig_user_id fehlt in marketing/meta/config.json');
      if (e.format === 'reel') {
        const p = { media_type: 'REELS', video_url: videoUrl, caption: e.caption_ig, share_to_feed: 'true' };
        if (/^\d+$/.test(e.vorschau_ms)) p.thumb_offset = e.vorschau_ms;
        plan.push(['POST', `/${IG}/media`, p]);
      } else if (e.format === 'story') plan.push(['POST', `/${IG}/media`, istVideo ? { media_type: 'STORIES', video_url: videoUrl } : { media_type: 'STORIES', image_url: urls[0] }]);
      else if (urls.length === 1) plan.push(['POST', `/${IG}/media`, { image_url: urls[0], caption: e.caption_ig, alt_text: alt[0] }]);
      else { urls.forEach((u, i) => plan.push(['POST', `/${IG}/media`, { image_url: u, is_carousel_item: 'true', alt_text: alt[i] }]));
             plan.push(['POST', `/${IG}/media`, { media_type: 'CAROUSEL', children: '<IDs der Seiten>', caption: e.caption_ig }]); }
      if (istVideo) plan.push(['GET', '/<container-id>', { fields: 'status_code', bis: 'FINISHED' }]);
      plan.push(['POST', `/${IG}/media_publish`, { creation_id: '<aus dem letzten Schritt>' }]);
    }
    e.bild_url = urls[0];
    if (/facebook/.test(e.kanal)) { if (!cfg.page_id) die('page_id fehlt'); plan.push(['POST', `/${cfg.page_id}/photos`, { url: e.bild_url, caption: e.text_fb || e.caption_ig }]); }
    if (!plan.length) die('kanal muss instagram und/oder facebook enthalten');
    console.log(SENDEN ? 'SENDEN:' : `TROCKENLAUF (nichts wird gesendet) · Format: ${e.format}`);
    for (const [m, p, b] of plan) console.log(` ${m} ${BASE}${p}\n   ${JSON.stringify(b).slice(0, 300)}`);
    if (reelSperre) console.log('\n⚠ SPERRE erstes Reel: Beim Senden wird abgelehnt, bis im Entwurf „freigegeben_von: Pascal“ steht.');
    if (!SENDEN) return console.log('\nZum Senden: denselben Befehl mit --senden (nur nach Freigabe; es folgt eine Bestätigungsabfrage).');
    const erg = [];
    if (/instagram/.test(e.kanal) && e.format === 'reel') {
      const c = await api(...plan[0]); await warten(c.id, true);
      const pub = await api('POST', `/${IG}/media_publish`, { creation_id: c.id }); erg.push('instagram-reel:' + pub.id);
    } else if (/instagram/.test(e.kanal) && e.format === 'story') {
      const c = await api(...plan[0]); await warten(c.id, istVideo);
      const pub = await api('POST', `/${IG}/media_publish`, { creation_id: c.id }); erg.push('instagram-story:' + pub.id);
    } else if (/instagram/.test(e.kanal) && urls.length > 1) {
      const kinder = [];
      for (let i = 0; i < urls.length; i++) { const k = await api('POST', `/${IG}/media`, { image_url: urls[i], is_carousel_item: 'true', alt_text: alt[i] }); await warten(k.id); kinder.push(k.id); }
      const c = await api('POST', `/${IG}/media`, { media_type: 'CAROUSEL', children: kinder.join(','), caption: e.caption_ig });
      await warten(c.id);
      const pub = await api('POST', `/${IG}/media_publish`, { creation_id: c.id }); erg.push('instagram:' + pub.id);
    } else if (/instagram/.test(e.kanal)) { const c = await api(...plan[0]); // Container muss fertig verarbeitet sein (bei Bildern meist sofort)
      await warten(c.id);
      const pub = await api('POST', `/${IG}/media_publish`, { creation_id: c.id }); erg.push('instagram:' + pub.id); }
    if (/facebook/.test(e.kanal)) { const fbp = plan.find(x => x[1].endsWith('/photos')); const r = await api(...fbp); erg.push('facebook:' + (r.post_id || r.id)); }
    logSchreiben(e, erg);
    console.log('✓ Veröffentlicht:', erg.join(', '), '→ protokolliert; Entwurf nach marketing/freigabe/veroeffentlicht/ verschieben.');
    return;
  }
  console.log('Befehle: status | insights [tage] | pruefen <entwurf.md> | veroeffentlichen <entwurf.md> [--senden] | kommentare [tage] | antworten <kommentar-id> "<text>" [--senden]');
})().catch(e => {
  const c = String((e.cause && (e.cause.cause || e.cause).message) || '');
  if (/403/.test(c)) die('Netzwerk: ' + HOST + ' ist in dieser Umgebung nicht freigegeben. Zuerst Zugangsschlüssel als Netzwerk-Geheimnis hinterlegen (siehe marketing/meta/ANBINDUNG.md, Stufe 2, Schritt 6).', 2);
  die(e.message + (c ? ' – ' + c : ''), 2);
});
