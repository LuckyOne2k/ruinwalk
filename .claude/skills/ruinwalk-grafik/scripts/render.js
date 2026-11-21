/* Ruin Walk – Marketinggrafiken rendern (lokal, ohne Netz).
   Aufruf (Repo-Wurzel): node .claude/skills/ruinwalk-grafik/scripts/render.js <motive.json> [ausgabeordner] [--skala=1]
   motive.json: ein Objekt oder eine Liste von Objekten, je Objekt { "datei": "name.png", "format": "post|story|quadrat|banner",
   "layout": "titel|klasse|liste|frage|screenshot", … } – Felder siehe SKILL.md. Bildpfade relativ zur Repo-Wurzel. */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../../..');
const H = require(path.join(ROOT, 'tests/harness.js'));
const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--'));
if (!pos[0]) { console.error('Aufruf: render.js <motive.json> [ausgabeordner] [--skala=1]'); process.exit(2); }
const motive = [].concat(JSON.parse(fs.readFileSync(pos[0], 'utf8')));
const out = path.resolve(pos[1] || path.join(ROOT, 'marketing/grafiken/entwuerfe'));
const skala = Number((args.find(a => a.startsWith('--skala=')) || '--skala=1').split('=')[1]);
const GROESSE = { post: [1080, 1350], story: [1080, 1920], quadrat: [1080, 1080], banner: [1640, 624] };
// Verborgene Klassen (Pascal 20.11.2026): keine Namen, Fähigkeiten oder Figuren der dritten Pfadstufen in Marketinggrafiken.
{ const { treffer } = require(path.join(ROOT, '.claude/skills/ruinwalk-meta-publishing/scripts/geheim.js'));
  let geheim = 0;
  for (const m of motive) {
    const g = treffer(JSON.stringify({ ...m, figuren: (m.figuren || []).map(f => f.name) }), [m.hintergrund, m.bild, ...(m.figuren || []).map(f => f.bild)]);
    if (g.length) { console.error(`✗ ${m.datei}: verborgene Klasse genannt/gezeigt (bleibt geheim): ${g.join(', ')}`); geheim++; }
  }
  if (geheim) process.exit(1); }

(async () => {
  const { srv, url } = await H.serve();
  const browser = await H.launch();
  fs.mkdirSync(out, { recursive: true });
  let fehler = 0;
  try {
    for (const m of motive) {
      const [w, h] = GROESSE[m.format || 'post'] || GROESSE.post;
      for (const b of [m.hintergrund, m.bild, ...(m.figuren || []).map(f => f.bild)].filter(Boolean))
        if (!fs.existsSync(path.join(ROOT, b))) { console.error(`✗ ${m.datei}: Bild fehlt: ${b}`); fehler++; }
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: skala });
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // kein Netz: nur lokale Dateien
      await p.addInitScript(d => { window.RW_DATA = d; }, m);
      await p.goto(url + '/.claude/skills/ruinwalk-grafik/vorlagen/vorlage.html');
      await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
      const ueber = await p.evaluate(() => { const c = document.getElementById('c'), cr = c.getBoundingClientRect(); return [...c.querySelectorAll('.inner *')].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > cr.bottom - 40 || r.right > cr.right - 40; }).map(e => e.className || e.tagName).slice(0, 5); });
      if (ueber.length) { console.warn(`! ${m.datei}: Inhalt reicht bis an den Rand (${ueber.join(', ')}) – Text kürzen`); }
      if (errs.length) { console.error(`✗ ${m.datei}: ${errs.join('; ')}`); fehler++; }
      const jpg = /\.jpe?g$/i.test(m.datei);   // .jpg = JPEG (kleiner, von Instagram bevorzugt), sonst PNG
      await p.locator('#c').screenshot({ path: path.join(out, m.datei), type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 90 } : {}) });
      console.log(`✓ ${m.datei} (${m.format || 'post'}, ${w * skala}×${h * skala})`);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
