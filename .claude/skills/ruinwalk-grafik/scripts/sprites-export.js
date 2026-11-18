/* Ruin Walk – Pixel-Sprites (Monster, Fähigkeiten, Ressourcen …) als PNG exportieren (nur lesend).
   Die Sprites liegen im Spiel nur als Zeichenanweisungen (sprites*.js) vor; dieses Skript lässt das echte Spiel
   sie zeichnen (pxUrl) und speichert sie als PNG – z. B. für Marketinggrafiken (Layout „klasse“, Feld „figuren“).
   Aufruf: node .claude/skills/ruinwalk-grafik/scripts/sprites-export.js [ausgabeordner] [--praefix=m_]
   Präfixe: m_ Monster · sk_ Fähigkeiten · n_ Ressourcen · st_ Pfadstufen · leer = alle. Standard: m_ nach marketing/grafiken/sprites/ */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../../..');
const H = require(path.join(ROOT, 'tests/harness.js'));
const args = process.argv.slice(2);
const out = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'marketing/grafiken/sprites'));
const praefix = (args.find(a => a.startsWith('--praefix=')) || '--praefix=m_').split('=')[1];
(async () => {
  const { srv, url } = await H.serve(); const browser = await H.launch();
  try {
    const p = await H.page(browser, url);
    const liste = await p.evaluate(pf => Object.values(PX_KEYS).filter((k, i, a) => a.indexOf(k) === i && new RegExp('^:' + pf).test(k))
      .map(k => [k.replace(/:/g, ''), pxUrl(k)]).filter(([, u]) => u && u.startsWith('data:image/png')), praefix);
    fs.mkdirSync(out, { recursive: true });
    for (const [n, u] of liste) fs.writeFileSync(path.join(out, n + '.png'), Buffer.from(u.split(',')[1], 'base64'));
    console.log(`${liste.length} Sprites (Präfix „${praefix}“) → ${out}`);
    if (!liste.length) process.exitCode = 1;
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(2); });
