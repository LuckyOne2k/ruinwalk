/* Reel 007 „Vom Wanderer zum Priester – und die verborgene dritte Stufe“ – Aufnahme aus dem echten Spiel + Schnitt.
   Regel (Pascal 20.11.2026): verborgene Klassen (PATHS[*].st[2]) nie mit Namen, Werten oder Figur zeigen.
   1. Öffnet index.html im Testmodus (Karte/Netz abgeschaltet wie in den Tests, kein echter Standort) mit Hochformat 9:16
      und fotografiert den Charakter-Bildschirm in vier Spielständen: Wanderer Lv 4 → Heiler Lv 5 → Priester Lv 15 →
      Hohepriester Lv 30 (echte Figuren über figTok(), echte Werte), danach den Bildschirm „Klassenentwicklung“ auf
      Stufe 2: „❓ Verborgene Klasse“ mit Rätselspruch, so wie das Spiel ihn vor dem Erwecken zeigt.
   2. Legt oben ein Markenband mit Untertitel darüber (verdeckt die Test-Anzeige des HUD), dazu eine Schlusskarte mit Logo.
   3. Schneidet mit ffmpeg: leichter Zoom je Bild, Überblendungen, H.264 1080×1920, 30 fps, stille AAC-Tonspur, faststart.
   Aufruf (Repo-Wurzel): node marketing/grafiken/reel_007_aufnahme.js [ausgabe.mp4]
   Ergebnis: marketing/grafiken/entwuerfe/007_reel_wanderer_priester.mp4 (+ _vorschau.jpg) */
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const H = require(path.join(ROOT, 'tests/harness.js'));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'marketing/grafiken/entwuerfe/007_reel_wanderer_priester.mp4'));
const VORSCHAU_S = 5.3;   // Titelbild: Priester
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-reel-'));
const FONTS = 'file://' + path.join(ROOT, '.claude/skills/ruinwalk-grafik/fonts/fonts.css');
const LOGO = 'file://' + path.join(ROOT, 'assets/logo.png');

// Spielstände und Untertitel (Fakten: siehe Entwurf 007, Abschnitt Faktenprüfung)
const STUFEN = [
  { cls: 'wanderer', path: '', tier: 0, lv: 4, kicker: 'Level 4', titel: 'Noch keine Klasse.', sub: 'Du startest als Wanderer.' },
  { cls: 'heiler', path: '', tier: 0, lv: 5, kicker: 'Level 5 · Grundklasse', titel: 'Heiler', sub: 'Neue Fähigkeit: Heilendes Licht' },
  { cls: 'heiler', path: 'priester', tier: 1, lv: 15, kicker: 'Level 15 · Pfadstufe 1', titel: 'Priester', sub: 'Neue Fähigkeit: Gebet' },
  { cls: 'heiler', path: 'priester', tier: 2, lv: 30, kicker: 'Level 30 · Pfadstufe 2', titel: 'Hohepriester', sub: 'Neue Fähigkeit: Heiliger Schild' },
  { cls: 'heiler', path: 'priester', tier: 2, lv: 30, ansicht: 'up', kicker: 'Stufe 3', titel: 'Verborgene Klasse', sub: 'Die dritte Stufe bleibt ein Geheimnis.', bandH: 470, versatz: -520 },
  // versatz: Bild nach oben schieben, damit Stufen-Anforderungen (UPQ[2]) unter dem Band verschwinden – keine Bedingungen/Zahlen der dritten Stufe zeigen
];
const DAUER = [2.6, 2.4, 2.4, 2.4, 3.0], ENDE = 3.2, UEB = 0.45;   // Sekunden je Bild, Schlusskarte, Überblendung

// HTML als Datei laden (setContent darf keine file://-Bilder/Schriften nachladen)
let seiteNr = 0;
const zeige = async (q, html) => { const f = path.join(TMP, `seite_${++seiteNr}.html`); fs.writeFileSync(f, html); await q.goto('file://' + f); };
const band = s => `<div style="position:absolute;left:0;right:0;top:0;height:${s.bandH || 400}px;background:linear-gradient(180deg,#120f0d 0%,#120f0d ${s.bandH ? 96 : 82}%,#120f0d00 100%)"></div>
  <div style="position:absolute;left:28px;right:28px;top:28px;height:${(s.bandH || 400) - 40}px;border:2px solid rgba(216,164,93,.35);border-bottom:none"></div>
  <div style="position:absolute;left:0;right:0;top:215px;text-align:center">
    <div style="font:700 34px Cinzel,serif;letter-spacing:.18em;color:#f0c982;text-transform:uppercase">${s.kicker}</div>
    <div style="font:700 78px/1.05 Cinzel,serif;color:#f3e8d8;margin-top:10px;text-shadow:0 4px 18px #000">${s.titel}</div>
  </div>
  <div style="position:absolute;left:60px;right:60px;top:1450px;text-align:center"><span style="display:inline-block;font:600 46px 'Crimson Text',serif;color:#f3e8d8;background:#120f0dd9;border:1px solid rgba(216,164,93,.45);padding:14px 34px;border-radius:6px">${s.sub}</span></div>`;

(async () => {
  const { srv, url } = await H.serve();
  const browser = await H.launch();
  const bilder = [];
  try {
    // 1. Aufnahme aus dem Spiel
    for (const [i, s] of STUFEN.entries()) {
      const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1080 / 405, isMobile: true, hasTouch: true });
      const p = await ctx.newPage(); const fehler = []; p.on('pageerror', e => fehler.push(e.message));
      await p.route('**/unpkg.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
      await p.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js', r => r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'tests/leaflet-stub.js'), 'utf8'), contentType: 'application/javascript' }));
      await p.route(/openstreetmap|overpass|\.supabase\.co/, r => r.abort());
      const seed = { lv: s.lv, cls: s.cls, path: s.path, tier: s.tier, xp: 0, cu: 120, test: true, inv: {} };
      await p.addInitScript(sd => { window.__RW_TEST = true; localStorage.setItem('ruinwalk_v1', JSON.stringify(sd)); localStorage.setItem('ruinwalk_tut', '1'); }, seed);
      await p.goto(url + '/index.html'); await p.waitForFunction(() => window.__RW); await p.waitForTimeout(300);
      await p.evaluate(() => { const b = document.querySelector('[data-a=starttest]'); if (b) b.click(); }); await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('#nav [data-s=char]').click()); await p.waitForTimeout(300);
      // volles Leben anzeigen (Spielwert maxHP()), Bildschirm neu öffnen
      await p.evaluate(() => { const r = window.__RW; r.S.hp = r.maxHP(); const b = document.querySelector('#nav [data-s=char]'); b.click(); b.click(); });
      await p.waitForTimeout(400);
      if (s.ansicht === 'up') { await p.evaluate(() => document.querySelector('[data-a=open][data-s=up]').click()); await p.waitForTimeout(400); }
      const roh = path.join(TMP, `roh_${i}.png`); await p.screenshot({ path: roh });
      if (fehler.length) throw new Error('JS-Fehler im Spiel: ' + fehler.join('; '));
      await ctx.close();
      // 2. Markenband + Untertitel
      const ctx2 = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); const q = await ctx2.newPage();
      await zeige(q, `<!doctype html><html><head><link rel="stylesheet" href="${FONTS}"><style>*{margin:0}body{width:1080px;height:1920px;position:relative;overflow:hidden;background:#120f0d}</style></head>
        <body style="background:#1f1814"><img src="file://${roh}" style="position:absolute;left:0;top:${s.versatz || 0}px;width:1080px;height:1920px">${band(s)}</body></html>`);
      await q.evaluate(async () => { await document.fonts.ready; });
      const fertig = path.join(TMP, `bild_${i}.png`); await q.screenshot({ path: fertig }); bilder.push(fertig);
      await ctx2.close();
    }
    // Schlusskarte
    const ctx3 = await browser.newContext({ viewport: { width: 1080, height: 1920 } }); const q = await ctx3.newPage();
    await zeige(q, `<!doctype html><html><head><link rel="stylesheet" href="${FONTS}"><style>*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;position:relative;overflow:hidden;background:#120f0d;color:#f3e8d8;text-align:center}</style></head><body>
      <div style="position:absolute;inset:0;background:url(file://${path.join(ROOT, 'assets/bg_create.jpg')}) center/cover"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,#0a0807ee 0%,#0a080788 40%,#0a0807dd 75%,#0a0807f7 100%)"></div>
      <div style="position:absolute;inset:28px;border:2px solid rgba(216,164,93,.35)"></div>
      <img src="${LOGO}" style="position:absolute;left:290px;top:300px;width:500px;filter:drop-shadow(0 8px 24px #000)">
      <div style="position:absolute;left:80px;right:80px;top:720px">
        <div style="font:700 34px Cinzel,serif;letter-spacing:.18em;color:#f0c982;text-transform:uppercase">4 Klassen · 12 Pfade · 36 Stufen</div>
        <div style="font:700 92px/1.1 Cinzel,serif;margin-top:30px;text-shadow:0 4px 20px #000">Welchen Weg<br>gehst du?</div>
        <div style="font:400 46px/1.35 'Crimson Text',serif;color:#e6d6c4;margin-top:36px">Ein GPS-Fantasy-RPG im Browser.<br>Echte Spielgrafik.</div>
        <div style="display:inline-block;margin-top:60px;font:600 30px Cinzel,serif;letter-spacing:.1em;border:2px solid #ff7a2f;color:#ffd9bf;padding:12px 24px;border-radius:4px;background:#ff7a2f22">In Entwicklung</div>
      </div></body></html>`);
    await q.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
    const ende = path.join(TMP, 'bild_ende.png'); await q.screenshot({ path: ende }); bilder.push(ende);
    await ctx3.close();
  } finally { await browser.close(); srv.close(); }

  // 3. Schnitt: je Bild ein Clip mit leichtem Zoom, dann Überblendungen (weiß = Verwandlung, zuletzt schwarz)
  const dauern = [...DAUER, ENDE], FPS = 30, args = ['-y', '-v', 'error'];
  bilder.forEach((b, i) => args.push('-loop', '1', '-t', String(dauern[i]), '-i', b));
  args.push('-f', 'lavfi', '-t', '30', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  let f = '';
  bilder.forEach((b, i) => { const fr = Math.round(dauern[i] * FPS);
    f += `[${i}:v]scale=1188:2112,zoompan=z='min(1+0.0009*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${fr}:s=1080x1920:fps=${FPS},setsar=1,format=yuv420p[v${i}];`; });
  let prev = 'v0', t = dauern[0];
  for (let i = 1; i < bilder.length; i++) {
    const off = (t - UEB).toFixed(3), typ = i === bilder.length - 1 ? 'fadeblack' : 'fadewhite';
    f += `[${prev}][v${i}]xfade=transition=${typ}:duration=${UEB}:offset=${off}[x${i}];`; prev = 'x' + i; t = t - UEB + dauern[i];
  }
  f = f.replace(/;$/, '');
  args.push('-filter_complex', f, '-map', `[${prev}]`, '-map', `${bilder.length}:a`, '-shortest',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-t', t.toFixed(3), OUT);
  cp.execFileSync('ffmpeg', args, { stdio: 'inherit' });
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(VORSCHAU_S), '-i', OUT, '-frames:v', '1', '-q:v', '3', OUT.replace(/\.mp4$/, '_vorschau.jpg')]);
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`Reel: ${path.relative(ROOT, OUT)} · ${t.toFixed(1)} s · ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
