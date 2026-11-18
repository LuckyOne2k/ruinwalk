/* Ruin Walk – Spieldaten-Export für Balancing-Analysen (nur lesend).
   Lädt das echte index.html über den Test-Harness (Karte/Netz abgeschaltet) und schreibt die Spieldaten
   als JSON plus eine Markdown-Übersicht der Monsterwerte je Gebietsstufe.
   Aufruf (aus dem Repo-Wurzelverzeichnis):  node .claude/skills/ruinwalk-balancing/scripts/spieldaten-export.js [ausgabeordner]
   Ändert nichts am Spiel oder an Spielständen. */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../../..');
const H = require(path.join(ROOT, 'tests/harness.js'));
const out = path.resolve(process.argv[2] || path.join(ROOT, 'docs/balancing/export'));

(async () => {
  const { srv, url } = await H.serve();
  const browser = await H.launch();
  try {
    const p = await H.page(browser, url);
    const data = await p.evaluate(() => {
      const R = window.__RW;
      const clean = o => { const s = JSON.stringify(o, (k, v) => typeof v === 'function' ? undefined : v); return s === undefined ? null : JSON.parse(s); };
      const mobsByBand = {};
      for (const [id, m] of Object.entries(R.MOBS)) {
        mobsByBand[id] = [1, 2, 3, 4, 5].map(b => {
          const s = R.mobOf({ type: id, b });
          return { b, hp: s.hp, min: s.min, max: s.max, xp: s.xp, rec: s.rec, cm: s.cm || 1 };
        });
      }
      const levels = [];
      const S0 = JSON.parse(JSON.stringify(R.S));
      for (const lv of [1, 5, 10, 15, 20, 25, 30, 40, 50]) { R.S.lv = lv; levels.push({ lv, maxHP: R.maxHP(), atk: R.atk(), xpNext: lv * 40 }); }
      R.S = S0;
      return {
        meta: { LV_CAP: R.LV_CAP, UP_LV: R.UP_LV, UPMAX: R.UPMAX, BAND_LV: R.BAND_LV },
        playerBase: levels,
        MOBS: clean(R.MOBS), mobsByBand, BSC: clean(R.BSC), ABIL: clean(R.ABIL),
        CLASSES: clean(R.CLASSES), PATHS: clean(R.PATHS), ITEMS: clean(R.ITEMS), NODES: clean(R.NODES),
        RECIPES: clean(R.RECIPES), SETS: clean(R.SETS), TIERS: clean(R.TIERS), UPCOST: clean(R.UPCOST), UPFEE: clean(R.UPFEE),
        QUESTS: clean(R.QUESTS.map(q => ({ id: q.id, t: q.t, d: q.d, rt: q.rt })))
      };
    });
    if (p.errors.length) console.warn('Seitenfehler:', p.errors);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'spieldaten.json'), JSON.stringify(data, null, 1));
    let md = '# Monsterwerte je Gebietsstufe (automatisch exportiert)\n\nQuelle: index.html via `mobOf`. Format je Stufe: Leben / Schaden min–max / XP / empf. Level.\n\n| Monster | Art | Stufe 1 | Stufe 2 | Stufe 3 | Stufe 4 | Stufe 5 |\n|---|---|---|---|---|---|---|\n';
    for (const [id, rows] of Object.entries(data.mobsByBand)) {
      const m = data.MOBS[id];
      md += `| ${m.n} | ${m.tier} | ` + rows.map(r => `${r.hp} / ${r.min}–${r.max} / ${r.xp} / ${r.rec}`).join(' | ') + ' |\n';
    }
    md += '\n## Spielerbasis (ohne Ausrüstung/Klasse)\n\n| Level | Leben | Angriff | XP bis nächstes Level |\n|---|---|---|---|\n';
    for (const l of data.playerBase) md += `| ${l.lv} | ${l.maxHP} | ${l.atk} | ${l.xpNext} |\n`;
    fs.writeFileSync(path.join(out, 'monsterwerte.md'), md);
    console.log('Export geschrieben nach', out, '–', Object.keys(data.MOBS).length, 'Monster,', Object.keys(data.PATHS).length, 'Pfade');
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
