/* Reels 010–012 (Reels als Hauptformat, Entscheidung Pascal 23.11.2026) – Aufnahme aus dem echten Spiel + Schnitt.
   Regeln: Bewegung aus dem Spiel ab Bild 1 (Kampf, Treffer, Levelaufstieg) statt Titeltext · 10–20 s · fester Serien-Kicker ·
   am Ende kurzer Folgen-Hinweis (kein Link, keine Aufforderung zum Spielen/Testen) · keine verborgenen Klassen (PATHS[*].st[2]).
   Ablauf:
   1. Exportiert den committeten Stand (git archive HEAD: index.html, Sprites, Bilder, Test-Harness) in ein Temp-Verzeichnis –
      uncommittete Änderungen im Arbeitsbaum fließen so nicht ins Video. HEAD = Stand von main für index.html (geprüft 23.11.2026).
   2. Öffnet das Spiel im Testmodus (Startposition Augsburg, kein echter Standort) mit echtem Leaflet 1.9.4 (npm-Paket, wie im
      Spiel von unpkg), aber OHNE Kartenkacheln und ohne Overpass/Supabase → heller Kartengrund ohne Straßen, keine echten Orte.
      Die Anzeige „🧪 Testmodus“ wird ausgeblendet (nur kosmetisch). Wartezeiten werden herausgeschnitten (Aufnahme pausiert).
   3. Nimmt per Chrome-Screencast (CDP) 1080×1920 auf, Untertitel/Kicker liegen als eigene Ebene über dem Spiel (keine Klicks).
   4. Schneidet mit ffmpeg: 30 fps, H.264, stille AAC-Spur, +faststart, Schlusskarte mit Folgen-Hinweis.
   Aufruf (Repo-Wurzel): node marketing/grafiken/reels_aufnahme.js [boss|igel|level …]   (ohne Argument: alle)
   Leaflet: LEAFLET_DIR=<ordner mit leaflet.js/leaflet.css>, sonst lädt das Skript leaflet@1.9.4 per „npm pack“ in ein Temp-Verzeichnis.
   Ergebnis: marketing/grafiken/entwuerfe/01x_reel_<name>.mp4 (+ _vorschau.jpg) */
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const REPO = path.resolve(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-reels-'));
const FPS = 30, ENDE = 2.4, UEB = 0.4;

// 1. Committeten Stand exportieren
const ROOT = path.join(TMP, 'spiel'); fs.mkdirSync(ROOT);
cp.execSync(`git archive HEAD index.html pxdom.js sprites.js sprites_chars.js sprites_figs.js sprites_gear.js sprites_items.js sprites_mobs.js sprites_skills.js figs items status assets tests | tar -x -C "${ROOT}"`, { cwd: REPO });
fs.cpSync(path.join(REPO, '.claude/skills/ruinwalk-grafik/fonts'), path.join(ROOT, '_fonts'), { recursive: true });
let LF = process.env.LEAFLET_DIR;
if (!LF) { const d = path.join(TMP, 'leaflet'); fs.mkdirSync(d); cp.execSync('npm pack leaflet@1.9.4 --silent', { cwd: d }); cp.execSync('tar xzf leaflet-1.9.4.tgz', { cwd: d }); LF = path.join(d, 'package/dist'); }
const H = require(path.join(ROOT, 'tests/harness.js')), U = require(path.join(ROOT, 'tests/util.js'));

// Ebene über dem Spiel: Kicker (Serie) + Untertitel. Liegt unter der Spielfigur, ca. 1075–1290 px Höhe (über den Fähigkeiten, frei von Reels-Bedienelementen).
const EBENE = `(() => { if (document.getElementById('rwE')) return;
  const st = document.createElement('style'); st.textContent = "@import url('/_fonts/fonts.css');#gps{visibility:hidden!important}" +
   "#rwE{position:fixed;left:0;right:0;top:404px;z-index:2147483647;pointer-events:none;text-align:center;font-family:'Crimson Text',serif}" +
   "#rwE .k{display:inline-block;font:700 12.5px Cinzel,serif;letter-spacing:.16em;color:#f0c982;text-transform:uppercase;background:#120f0de6;border:1px solid rgba(216,164,93,.6);padding:4px 10px;border-radius:3px}" +
   "#rwE .s{display:block;margin:8px auto 0;max-width:330px;font:600 19px/1.25 'Crimson Text',serif;color:#f3e8d8;background:#120f0de0;border:1px solid rgba(216,164,93,.45);padding:7px 14px;border-radius:5px;transition:opacity .2s}" +
   "#rwE .s:empty{opacity:0}";
  document.head.appendChild(st); const d = document.createElement('div'); d.id = 'rwE'; d.innerHTML = '<span class="k"></span><span class="s"></span>'; document.body.appendChild(d); })()`;

async function aufnahme(browser, url, seed, szene) {
  const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1080 / 405, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const fehler = []; p.on('pageerror', e => fehler.push(e.message));
  await p.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.css', r => r.fulfill({ body: fs.readFileSync(path.join(LF, 'leaflet.css'), 'utf8'), contentType: 'text/css' }));
  await p.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js', r => r.fulfill({ body: fs.readFileSync(path.join(LF, 'leaflet.js'), 'utf8') + '\n;(()=>{const o=L.map;L.map=function(){const m=o.apply(this,arguments);window.__rwKarte=m;return m;};})();', contentType: 'application/javascript' }));   // Karteninstanz merken, um wie per Zwei-Finger-Zoom näher heranzugehen
  await p.route(/openstreetmap|overpass|\.supabase\.co|fonts\.googleapis|fonts\.gstatic/, r => r.abort());
  await p.addInitScript(sd => { window.__RW_TEST = true; localStorage.setItem('ruinwalk_v1', JSON.stringify(sd)); localStorage.setItem('ruinwalk_tut', '1'); }, seed);
  await p.goto(url + '/index.html'); await p.waitForFunction(() => window.__RW); await p.waitForTimeout(400);
  await p.evaluate(() => { const b = document.querySelector('[data-a=starttest]'); if (b) b.click(); }); await p.waitForTimeout(700);
  await U.install(p); await p.evaluate(EBENE);
  // alle Spielmeldungen mitschreiben (Meldungen ersetzen einander schnell; Warten auf Ereignisse über diese Liste)
  await p.evaluate(() => { window.__rwMeld = []; new MutationObserver(() => window.__rwMeld.push(document.querySelector('#toast').textContent)).observe(document.querySelector('#toast'), { childList: true, characterData: true, subtree: true }); });
  if (process.env.RW_REELS_DEBUG) { p.on('console', m => console.log('  [spiel] ' + m.text())); await p.evaluate(() => { new MutationObserver(() => console.log('toast: ' + document.querySelector('#toast').textContent)).observe(document.querySelector('#toast'), { childList: true, characterData: true, subtree: true }); }); } await p.evaluate(() => document.fonts.ready);
  // Screencast: Bilder nur während „aktiv“, Pausen werden aus der Zeitachse entfernt
  const cdp = await ctx.newCDPSession(p), bilder = []; let aktiv = false, versatz = 0, pauseAb = 0, nr = 0;
  const ordner = fs.mkdtempSync(path.join(TMP, 'f-'));
  cdp.on('Page.screencastFrame', f => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (!aktiv) return; const datei = path.join(ordner, `${String(++nr).padStart(5, '0')}.jpg`); fs.writeFileSync(datei, Buffer.from(f.data, 'base64'));
    bilder.push({ t: f.metadata.timestamp - versatz, datei }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  const A = {
    p, warte: ms => p.waitForTimeout(ms),
    sag: (k, s) => p.evaluate(([k, s]) => { const e = document.getElementById('rwE'); if (k !== null) e.querySelector('.k').textContent = k; e.querySelector('.s').textContent = s || ''; }, [k, s]),
    start: () => { aktiv = true; if (pauseAb) versatz += Date.now() / 1000 - pauseAb; pauseAb = 0; return p.evaluate(() => { document.getElementById('rwE').style.outline = '0px solid transparent'; }); },
    pause: async () => { await p.waitForTimeout(60); A.ende = Date.now() / 1000 - versatz; aktiv = false; pauseAb = Date.now() / 1000; },
    // Zuschlagen, sobald der Knopf frei ist (echter Klick auf den Spielknopf)
    // näher heranzoomen (wie Zwei-Finger-Zoom im Spiel, maxZoom 19) und auf die Spielfigur zentrieren
    zoom: z => p.evaluate(z => { const R = __RW; __rwKarte.setView([R.P.lat, R.P.lon], z, { animate: false }); }, z),
    schlag: () => p.evaluate(() => { const b = document.querySelector('#cAct'); if (b && !b.disabled && b.dataset.a === 'shoot') { b.click(); return true; } return false; }),
  };
  A.kampf = async (ms) => { const bis = Date.now() + ms; while (Date.now() < bis) { await A.schlag(); await p.waitForTimeout(120); } };
  await szene(A);
  if (aktiv) await A.pause();
  await cdp.send('Page.stopScreencast').catch(() => {});
  if (fehler.length) throw new Error('JS-Fehler im Spiel: ' + fehler.join('; '));
  await ctx.close();
  return { bilder, ende: A.ende };
}

// Schlusskarte (Folgen-Hinweis, kein Link)
async function schluss(browser, s) {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); const q = await ctx.newPage();
  const f = path.join(TMP, `ende_${s.id}.html`);
  fs.writeFileSync(f, `<!doctype html><html><head><link rel="stylesheet" href="file://${path.join(REPO, '.claude/skills/ruinwalk-grafik/fonts/fonts.css')}"><style>*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;position:relative;overflow:hidden;background:#120f0d;color:#f3e8d8;text-align:center}</style></head><body>
    <div style="position:absolute;inset:0;background:url(file://${path.join(REPO, 'assets/bg_chars.jpg')}) center/cover"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#0a0807ee 0%,#0a080799 40%,#0a0807dd 75%,#0a0807f7 100%)"></div>
    <div style="position:absolute;inset:28px;border:2px solid rgba(216,164,93,.35)"></div>
    <img src="file://${path.join(REPO, 'assets/logo.png')}" style="position:absolute;left:315px;top:330px;width:450px;filter:drop-shadow(0 8px 24px #000)">
    <div style="position:absolute;left:80px;right:80px;top:700px">
      <div style="font:700 34px Cinzel,serif;letter-spacing:.18em;color:#f0c982;text-transform:uppercase">${s.kicker}</div>
      <div style="font:700 104px/1.08 Cinzel,serif;margin-top:34px;text-shadow:0 4px 20px #000">${s.folge}</div>
      <div style="font:400 46px/1.35 'Crimson Text',serif;color:#e6d6c4;margin-top:36px">${s.weiter}</div>
      <div style="display:inline-block;margin-top:56px;font:600 30px Cinzel,serif;letter-spacing:.1em;border:2px solid #ff7a2f;color:#ffd9bf;padding:12px 24px;border-radius:4px;background:#ff7a2f22">In Entwicklung · echte Spielgrafik</div>
    </div></body></html>`);
  await q.goto('file://' + f);
  await q.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  const png = path.join(TMP, `ende_${s.id}.png`); await q.screenshot({ path: png }); await ctx.close(); return png;
}

function schnitt(r, ende, s) {
  const OUT = path.join(REPO, 'marketing/grafiken/entwuerfe', s.datei);
  const b = r.bilder; if (b.length < 10) throw new Error('zu wenige Bilder aufgenommen: ' + b.length);
  const t0 = b[0].t, lines = [];
  for (let i = 0; i < b.length; i++) { const d = ((i + 1 < b.length ? b[i + 1].t : r.ende) - b[i].t); lines.push(`file '${b[i].datei}'`, `duration ${Math.max(0.001, d).toFixed(4)}`); }
  lines.push(`file '${b[b.length - 1].datei}'`);
  const liste = path.join(TMP, `liste_${s.id}.txt`); fs.writeFileSync(liste, lines.join('\n'));
  const spiel = Math.max(0, r.ende - t0);
  const roh = path.join(TMP, `roh_${s.id}.mp4`);
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', liste, '-vf', `scale=1080:1920:flags=lanczos,fps=${FPS},format=yuv420p`, '-t', spiel.toFixed(3), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', roh]);
  const gesamt = spiel + ENDE - UEB;
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', roh, '-loop', '1', '-t', String(ENDE), '-i', ende, '-f', 'lavfi', '-t', '30', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', `[0:v]settb=AVTB,fps=${FPS},format=yuv420p[a];[1:v]scale=1080:1920,fps=${FPS},format=yuv420p,setsar=1[b];[a]setsar=1[a1];[a1][b]xfade=transition=fadeblack:duration=${UEB}:offset=${(spiel - UEB).toFixed(3)}[v]`,
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-t', gesamt.toFixed(3), OUT]);
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(s.vorschau), '-i', OUT, '-frames:v', '1', '-q:v', '3', OUT.replace(/\.mp4$/, '_vorschau.jpg')]);
  console.log(`Reel ${s.id}: ${path.relative(REPO, OUT)} · ${gesamt.toFixed(1)} s · ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB · ${b.length} Bilder (${(b.length / spiel).toFixed(0)}/s)`);
}

// ---------- Szenen (Fakten: siehe Entwürfe 010–013, Abschnitt Faktenprüfung) ----------
const SZENEN = {
  // 010 Gebietsboss #1: Bergtroll (MOBS.bergtroll, BFX.bergtroll: Felsbrocken = Wucht → Abwehr; Phase 2: harte Haut)
  boss: { id: '010', datei: '010_reel_gebietsboss_bergtroll.mp4', vorschau: 0.8, kicker: 'Gebietsboss #1', folge: 'Folge für<br>Teil 2', weiter: 'Nächster Gebietsboss,<br>neue Mechanik.',
    seed: { lv: 45, cls: 'krieger', path: 'ritter', tier: 2, xp: 0, cu: 300, test: true, hp: 9999, en: 100, inv: { trank: 3 } },
    async lauf(A) {
      const id = await A.p.evaluate(() => { const R = __RW; const a = T.area(); const e = a.find(x => x.type === 'bergtroll'); if (!e) return null;
        R.setPos(e.lat - 0.00013, e.lon + 0.00006, 5); R.refreshWorld(); R.S.hp = R.maxHP(); R.S.en = 100; R.S.mh[e.id] = 7520; R.select(e.id); return e.id; });
      if (!id) throw new Error('kein Bergtroll gefunden');
      await A.zoom(19);
      // Vorlauf (nicht im Video): angreifen, bis der Troll herangekommen ist
      await A.p.evaluate(() => { const b = document.querySelector('#cAct'); if (b && !b.disabled) b.click(); });
      await A.p.waitForFunction(() => /· (1[01]|\d) m entfernt/.test(document.querySelector('#cSub').textContent), null, { timeout: 15000, polling: 50 });
      await A.zoom(19); await A.p.evaluate(() => { __RW.S.hp = __RW.maxHP(); });
      await A.sag('Gebietsboss #1 · Bergtroll', 'Der Bergtroll. Gebietsboss aus Fels und Berg.');
      await A.start(); await A.kampf(2600);
      await A.p.waitForFunction(() => __rwMeld.some(t => /Haut des Trolls/.test(t)), null, { timeout: 6000, polling: 50 }).catch(() => {});
      await A.sag(null, 'Seine Haut wird hart. Nur kritische Treffer brechen sie.'); await A.kampf(2600);
      await A.pause();
      // Wartezeit bis zum ersten Spezialangriff herausschneiden (BFX: erster Angriff 9 s nach Kampfbeginn)
      await A.p.waitForFunction(() => /Felsbrocken/.test(document.querySelector('#tele').textContent || ''), null, { timeout: 20000, polling: 50 });
      await A.p.evaluate(() => { __RW.S.hp = Math.max(__RW.S.hp, Math.round(__RW.maxHP() * .8)); });   // statt Trank-Pause im Schnitt
      await A.sag(null, 'Er hebt einen Felsbrocken. Jetzt: Abwehr!'); await A.start(); await A.warte(1200);
      await A.p.evaluate(() => document.querySelector('#react [data-a=guard]').click());
      await A.p.waitForFunction(() => __rwMeld.some(t => /Abgewehrt/.test(t)), null, { timeout: 8000, polling: 30 });
      await A.sag(null, 'Abgewehrt. Doch der Kampf geht weiter.'); await A.kampf(1800);
      await A.sag(null, 'Fünf Gebietsbosse, jeder mit eigener Mechanik.'); await A.kampf(2400);
    } },
  // 011 Kreatur der Woche #1: Waldigel (MOBS.igel: friedlich, ab 'dorn', hab 'wg', Beute Fell 40 %)
  igel: { id: '011', datei: '011_reel_kreatur_waldigel.mp4', vorschau: 1.2, kicker: 'Kreatur der Woche #1', folge: 'Folge für<br>Kreatur #2', weiter: 'Jede Woche eine neue<br>Kreatur aus Ruin Walk.',
    seed: { lv: 2, cls: 'wanderer', xp: 0, cu: 40, test: true, hp: 60, en: 100, inv: {} },
    async lauf(A) {
      const ok = await A.p.evaluate(() => { const R = __RW; const id = T.place('igel'); if (!id) return false; const e = R.sel; R.setPos(e.lat - 0.00012, e.lon + 0.00004, 5); R.refreshWorld(); R.S.hp = R.maxHP(); R.select(id);
        T.rand([], .3); return true; });   // Zufall fest: kein kritischer Treffer, Fell fällt (40 %-Chance, echtes mögliches Ergebnis)
      if (!ok) throw new Error('kein Waldigel gefunden');
      await A.zoom(19); await A.warte(500); await A.sag('Kreatur der Woche #1', 'Der Waldigel. Klein, friedlich, stachelig.');
      await A.start(); await A.schlag(); await A.warte(700);
      await A.p.evaluate(() => document.querySelector('#card [data-a=info]').click());   // Details im Kampf einblenden (ⓘ)
      await A.sag(null, 'Dornen: Jeder Treffer sticht zurück.'); await A.warte(2900);
      await A.sag(null, 'Lebt im Wald und auf Wiese und Feld.'); await A.warte(2500);
      await A.schlag(); await A.sag(null, 'Beute: mit etwas Glück ein Fell.'); await A.warte(2100);
    } },
  // 012 Levelaufstieg #1: Wanderer erreicht Level 5 und wählt eine Klasse (CLASS_LV = 5, PICK, CLASSES.bogen)
  level: { id: '012', datei: '012_reel_levelaufstieg_klasse.mp4', vorschau: 6.5, kicker: 'Levelaufstieg #1', folge: 'Folge für<br>Teil 2', weiter: 'Level 15:<br>die erste Pfadstufe.',
    seed: { lv: 4, cls: 'wanderer', xp: 155, cu: 60, test: true, hp: 90, en: 100, inv: {} },
    async lauf(A) {
      const ok = await A.p.evaluate(() => { const R = __RW; const id = T.place('rohling'); if (!id) return false; const e = R.sel; R.setPos(e.lat - 0.00012, e.lon - 0.00004, 5); R.refreshWorld(); R.S.hp = R.maxHP(); R.select(id); T.rand([], .5); return true; });
      if (!ok) throw new Error('kein Rohling gefunden');
      await A.zoom(19); await A.warte(500); await A.sag('Levelaufstieg #1', 'Level 4. Noch fünf Erfahrungspunkte.');
      await A.start(); await A.kampf(1000);
      await A.sag(null, 'Ein Rohling. Jeder Sieg bringt Erfahrung.');
      const bis = Date.now() + 8000; while (Date.now() < bis && await A.p.evaluate(() => __RW.S.lv < 5)) { await A.schlag(); await A.warte(120); }
      await A.sag(null, 'Level 5: Zeit für eine Klasse.'); await A.warte(2300);
      await A.p.evaluate(() => document.querySelector('#nav [data-s=char]').click()); await A.sag(null, 'Vier Grundklassen stehen zur Wahl.'); await A.warte(1300);
      await A.p.evaluate(() => document.querySelector('[data-a=open][data-s=class]').click()); await A.warte(300);
      await A.p.evaluate(() => { const s = document.querySelector('#sheet .body, #sheet') ; const b = [...document.querySelectorAll('[data-a=clspick]')].find(x => x.dataset.id === 'bogen'); if (b) b.scrollIntoView({ block: 'center' }); });
      await A.warte(1500);
      await A.p.evaluate(() => [...document.querySelectorAll('[data-a=clspick]')].find(x => x.dataset.id === 'bogen').click()); await A.warte(500);
      await A.p.evaluate(() => { const b = document.querySelector('[data-a=clsok]'); b.scrollIntoView({ block: 'center' }); }); await A.warte(900);
      await A.p.evaluate(() => document.querySelector('[data-a=clsok]').click()); await A.warte(500);
      await A.sag(null, 'Bogenschütze. Neue Waffe, neuer Weg.'); await A.warte(2400);
    } },
};

(async () => {
  const wahl = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SZENEN);
  const { srv, url } = await H.serve(); const browser = await H.launch();
  try {
    for (const k of wahl) { const s = SZENEN[k]; if (!s) throw new Error('unbekannte Szene ' + k);
      const r = await aufnahme(browser, url, s.seed, A => s.lauf(A)); const ende = await schluss(browser, s); schnitt(r, ende, s); }
  } finally { await browser.close(); srv.close(); }
  if (!process.env.RW_REELS_BEHALTEN) fs.rmSync(TMP, { recursive: true, force: true }); else console.log('Zwischendateien: ' + TMP);
})().catch(e => { console.error(e); process.exit(1); });
