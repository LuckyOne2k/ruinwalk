/* Verborgene Klassen (Entscheidung Pascal 20.11.2026: Geheimes wird nie beim Namen genannt – keine Namen, Werte oder Bilder).
   Ableitung aus index.html (Klassenentwicklung, openSheet('up')):
   - S.tier===0: Pfadwahl zeigt „st[0].n → st[1].n → ❓“ (dritte Stufe ohne Namen)
   - S.tier===1: zeigt die nächste Stufe st[1] mit Name und Fähigkeit (sichtbar)
   - S.tier===2: zeigt „❓ Verborgene Klasse“ + Hinweis SECRET[pfad].h, „Name und Werte bleiben geheim“
   → verborgen ist genau die dritte Stufe jedes Pfads: PATHS[*].st[2] – Name, Figur figs/<id>.png, Fähigkeit sk.n –
     und der Set-Name der Stufe 3 PSN[*][2].
   Die Rätselsprüche SECRET[*].h sind im Spiel vorher sichtbar und dürfen genutzt werden.
   Gelesen wird immer das index.html des Repos (nicht das Test-Wurzelverzeichnis).
   Aufruf ohne Argumente: Liste der Sperrwörter. */
const fs = require('fs'), path = require('path');
const INDEX = path.resolve(__dirname, '../../../../index.html');

// Feste Ausnahmen: Wörter, die im Spiel auch öffentlich vorkommen, sind keine Sperrwörter.
const AUSNAHMEN = {
  'Erdbeben': 'öffentlicher Angriff des Urmammuts (index.html, BFX.urmammut, „🌋 Erdbeben“)',
  'Erleuchtung': 'steht im sichtbaren Rätselspruch SECRET.moench.h („Hundert Wege führen zur Erleuchtung …“)',
};
// Figur-IDs, die als eigenes Wort zu allgemein sind (der volle Name „Herr der Wildnis“ wird trotzdem erkannt).
const ID_NICHT_ALS_WORT = ['herr'];

const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let cache = null;
function verborgen() {
  if (cache) return cache;
  const s = fs.readFileSync(INDEX, 'utf8'), a = s.indexOf('const PATHS={'), b = s.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new Error('PATHS in index.html nicht gefunden – Liste verborgener Klassen nicht ermittelbar');
  const psnZeile = (s.match(/const PSN=(\{[^\n]*\});/) || [])[1];
  if (!psnZeile) throw new Error('PSN in index.html nicht gefunden');
  const psn = {};   // ohne eval: pfad:['a','b','c']
  for (const m of psnZeile.matchAll(/(\w+):\['([^']*)','([^']*)','([^']*)'\]/g)) psn[m[1]] = [m[2], m[3], m[4]];
  const stufen = [];
  const block = s.slice(a, b), pfade = [...block.matchAll(/^\s*(\w+):\{b:'/gm)].map(m => m[1]);
  block.split('st:[').slice(1).forEach((teil, i) => {
    const m = [...teil.matchAll(/\{n:'([^']+)',i:':st_(\w+):'[\s\S]*?sk:\{[^}]*?\bn:'([^']+)'/g)];
    if (!m[2]) return;
    const pid = pfade[i], set = psn[pid] && psn[pid][2];
    stufen.push({ pfad: pid, name: m[2][1], fig: m[2][2], faehigkeit: AUSNAHMEN[m[2][3]] ? null : m[2][3], set: !set || AUSNAHMEN[set] ? null : set });
  });
  if (stufen.length !== 12 || stufen.some(x => !x.pfad)) throw new Error(`Erwartet 12 verborgene Stufen, gefunden ${stufen.length} – Ableitung prüfen`);
  return (cache = stufen);
}

// Muster für ein Sperrwort: normalisiert, Teile dürfen getrennt (Leerzeichen/Bindestrich/Unterstrich) oder zusammengeschrieben sein,
// vordere Teile mit -n/-en/-s/-es („Herrn der Wildnis“), letzter Teil gebeugt („Lichtgesandten“, „Sonnenwächterin“).
function muster(wort) {
  const teile = norm(wort).split(/[\s\-_]+/).filter(Boolean);
  const vorn = teile.slice(0, -1).map(t => esc(t) + '(?:n|en|s|es)?'), letzt = teile[teile.length - 1];
  const basis = /er$/.test(letzt) ? letzt.slice(0, -1) : letzt;   // „…er“ → „…e“ + r/n/rin/…
  const ende = esc(basis) + '(?:r|e|n|en|er|s|es|rs|rn|in|rin|innen|rinnen)?';
  return new RegExp('(^|[^a-z0-9])' + [...vorn, ende].join('[\\s\\-_]*') + '($|[^a-z0-9])', 'i');
}
function sperrwoerter() {
  const w = [];
  for (const v of verborgen()) {
    for (const x of [v.name, v.faehigkeit, v.set]) if (x) w.push({ wort: x, re: muster(x) });
    if (!ID_NICHT_ALS_WORT.includes(v.fig) && norm(v.name).replace(/[\s\-_]+/g, '') !== v.fig) w.push({ wort: v.fig, re: muster(v.fig) });
  }
  return w;
}
// Treffer in Text (Namen, Fähigkeiten, Set-Namen, Figur-IDs als Wort) und in Dateipfaden (Figur-IDs)
function treffer(text, pfade = []) {
  const t = norm(text), f = [];
  for (const { wort, re } of sperrwoerter()) if (re.test(t)) f.push(wort);
  for (const v of verborgen()) for (const p of pfade) if (new RegExp('(^|[/_.-])' + v.fig + '([/_.-]|$)', 'i').test(String(p || ''))) f.push(p);
  return [...new Set(f)];
}
module.exports = { verborgen, treffer, AUSNAHMEN, norm };
if (require.main === module) {
  for (const v of verborgen()) console.log(`${v.name} (figs/${v.fig}.png) · Fähigkeit: ${v.faehigkeit || '(Ausnahme)'} · Set: ${v.set || '(Ausnahme)'}`);
  for (const [k, g] of Object.entries(AUSNAHMEN)) console.log(`Ausnahme „${k}“: ${g}`);
}
