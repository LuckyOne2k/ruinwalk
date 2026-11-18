/* Ruin Walk – Mobile-Prüfung (nur lesend).
   Öffnet das echte index.html (Testmodus, Karte/Netz abgeschaltet) im Hochformat auf mehreren Handybreiten,
   öffnet die Hauptmenüs, macht Screenshots und prüft: waagerechter Überlauf, zu kleine Tippflächen (< 40 px),
   Elemente außerhalb des sichtbaren Bereichs, JavaScript-Fehler.
   Aufruf: node .claude/skills/ruinwalk-mobile-check/scripts/mobile-check.js [ausgabeordner] [--breiten=320,360,390,412]
   Exit-Code 1, wenn Befunde vorliegen. */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../../..');
const H = require(path.join(ROOT, 'tests/harness.js'));
const args = process.argv.slice(2);
const out = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'docs/mobile-check'));
const widths = (args.find(a => a.startsWith('--breiten=')) || '--breiten=320,360,390,412').split('=')[1].split(',').map(Number);
const SCREENS = ['karte', 'inv', 'craft', 'quests', 'char', 'set'];
const SEED = { lv: 12, cls: 'krieger', cu: 500, inv: { holz: 5, stein: 5, trank: 3 }, test: true };

(async () => {
  const { srv, url } = await H.serve();
  const browser = await H.launch();
  const report = []; let problems = 0;
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const p = await ctx.newPage(); const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/unpkg.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
      await p.route('**/unpkg.com/leaflet@1.9.4/dist/leaflet.js', r => r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'tests/leaflet-stub.js'), 'utf8'), contentType: 'application/javascript' }));
      await p.route(/openstreetmap|overpass|\.supabase\.co/, r => r.abort());
      await p.addInitScript(seed => { window.__RW_TEST = true; localStorage.setItem('ruinwalk_v1', JSON.stringify(seed)); localStorage.setItem('ruinwalk_tut', '1'); }, SEED);
      await p.goto(url + '/index.html'); await p.waitForFunction(() => window.__RW); await p.waitForTimeout(300);
      // Startbildschirm: „Erst ohne GPS testen“ (Testmodus, Augsburg) – danach ist die Karte mit HUD sichtbar
      await p.evaluate(() => { const b = document.querySelector('[data-a=starttest]'); if (b) b.click(); }); await p.waitForTimeout(500);
      if (process.env.RW_MOBILE_PROBE) await p.evaluate(() => { const d = document.createElement('div'); d.id = 'probe'; d.textContent = 'Probe'; d.style.cssText = 'position:absolute;top:120px;left:10px;width:600px;height:20px;z-index:9999;background:red'; document.body.appendChild(d); });
      for (const s of SCREENS) {
        if (s !== 'karte') { const ok = await p.evaluate(s => { const b = document.querySelector('#nav [data-s=' + s + ']'); if (b) b.click(); return !!b; }, s); if (!ok) { report.push({ w, s, fehler: 'Menüknopf fehlt' }); problems++; continue; } await p.waitForTimeout(250); }
        const r = await p.evaluate(() => {
          const vw = innerWidth, vh = innerHeight, small = [], outside = [];
          const vis = el => { const cs = getComputedStyle(el), b = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && b.width > 0 && b.height > 0; };
          for (const el of document.querySelectorAll('button,[data-a],a[href],input,select')) {
            if (!vis(el)) continue; const b = el.getBoundingClientRect();
            if (b.bottom < 0 || b.top > vh) continue;
            const label = (el.id ? '#' + el.id : '') + (el.dataset.a ? '[data-a=' + el.dataset.a + ']' : '') + ' "' + (el.textContent || el.value || '').trim().slice(0, 20) + '"';
            if (Math.min(b.width, b.height) < 40 && !el.closest('.leaflet-container')) small.push(label + ' ' + Math.round(b.width) + '×' + Math.round(b.height));
            if (b.right > vw + 1 || b.left < -1) outside.push(label);
          }
          // Überlauf = sichtbare UI-Elemente (außerhalb der Karte), die über den rechten/linken Rand ragen. Kartenmarker dürfen das.
          let overflow = 0;
          for (const el of document.querySelectorAll('body *')) {
            if (el.closest('#map') || !vis(el)) continue; const b = el.getBoundingClientRect();
            if (b.bottom < 0 || b.top > vh) continue;
            const o = Math.max(b.right - vw, -b.left);
            if (o > 1) { overflow = Math.max(overflow, Math.round(o)); const lab = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
              if (!outside.includes(lab)) outside.push(lab); }
          }
          return { overflow, small: [...new Set(small)].slice(0, 25), outside: [...new Set(outside)].slice(0, 25) };
        });
        const file = `w${w}_${s}.png`; await p.screenshot({ path: path.join(out, file) });
        const bad = r.overflow > 0 || r.outside.length > 0;
        if (bad) problems++;
        report.push({ w, s, ...r, screenshot: file, bewertung: bad ? 'BEFUND' : (r.small.length ? 'Hinweis' : 'ok') });
        if (s !== 'karte') await p.evaluate(() => { const x = document.querySelector('#shX,[data-a=close],.close'); if (x) x.click(); document.querySelector('#nav [data-s]')?.blur(); });
      }
      if (errors.length) { problems++; report.push({ w, s: 'js', fehler: errors }); }
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  let md = '# Mobile-Prüfung\n\nBreiten: ' + widths.join(', ') + ' px (Hochformat, Touch). Befund = waagerechter Überlauf oder Element außerhalb des Bildschirms. Hinweis = Tippfläche < 40 px (prüfen, ob gewollt).\n\n| Breite | Ansicht | Bewertung | Überlauf px | außerhalb | < 40 px |\n|---|---|---|---|---|---|\n';
  for (const r of report) md += `| ${r.w} | ${r.s} | ${r.bewertung || 'BEFUND'} | ${r.overflow ?? '-'} | ${(r.outside || []).join('<br>') || (r.fehler ? JSON.stringify(r.fehler) : '-')} | ${(r.small || []).join('<br>') || '-'} |\n`;
  fs.writeFileSync(path.join(out, 'bericht.md'), md);
  fs.writeFileSync(path.join(out, 'bericht.json'), JSON.stringify(report, null, 1));
  console.log(`Mobile-Prüfung: ${report.length} Ansichten, ${problems} Befunde → ${out}/bericht.md`);
  process.exit(problems ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
