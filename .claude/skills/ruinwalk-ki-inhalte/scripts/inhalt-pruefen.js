/* Ruin Walk – Prüfer für KI-generierte Inhaltsvorschläge (Quests, NPC-Texte, Ereignisse).
   Prüft einen Vorschlag (JSON) gegen die ECHTEN Spieldaten: nur vorhandene Monster/Items/Ressourcen,
   nur unterstützte Zieltypen, Belohnungen innerhalb fester Obergrenzen, Textlängen, keine verbotenen Inhalte.
   Dies ist die Prüfstufe VOR der menschlichen Freigabe. Im späteren Live-Betrieb muss dieselbe Prüfung
   serverseitig laufen (Client/KI sind nie vertrauenswürdig).
   Aufruf: node .claude/skills/ruinwalk-ki-inhalte/scripts/inhalt-pruefen.js <vorschlag.json> [--daten=spieldaten.json]
   Ohne --daten wird der Export (ruinwalk-balancing) in einen temporären Ordner erzeugt. Exit 1 bei Fehlern. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('Aufruf: inhalt-pruefen.js <vorschlag.json> [--daten=…]'); process.exit(2); }
let datenPfad = (args.find(a => a.startsWith('--daten=')) || '').split('=')[1];
if (!datenPfad) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-daten-'));
  cp.execFileSync('node', [path.join(ROOT, '.claude/skills/ruinwalk-balancing/scripts/spieldaten-export.js'), tmp], { stdio: 'ignore' });
  datenPfad = path.join(tmp, 'spieldaten.json');
}
const D = JSON.parse(fs.readFileSync(datenPfad, 'utf8'));
const V = JSON.parse(fs.readFileSync(file, 'utf8'));

// Obergrenzen (Platzhalter, bis Pascal Balancewerte festlegt – siehe SKILL.md). Konservativ gewählt.
const CAP = { xpProStufe: 60, muenzenProStufe: 120, itemsMenge: 5, zieleMax: 4, zielMenge: 50, titel: 40, text: 400, npcZeile: 160 };
const ZIELTYPEN = { besiegen: 'monster', sammeln: 'ressource', herstellen: 'rezept', item_besitzen: 'item' };
const VERBOTEN = [/https?:\/\//i, /<\s*script/i, /\bon\w+\s*=/i, /echtgeld|kaufen sie|rabatt|gewinnspiel/i, /\b(adresse|telefon|e-?mail)\b/i];
const fehler = [], hinweise = [];
const err = m => fehler.push(m), hint = m => hinweise.push(m);
const ids = { monster: Object.keys(D.MOBS), ressource: Object.keys(D.NODES), item: Object.keys(D.ITEMS), rezept: D.RECIPES.map(r => r.id) };
const txt = (s, max, wo) => { if (typeof s !== 'string' || !s.trim()) return err(`${wo}: Text fehlt`); if (s.length > max) err(`${wo}: zu lang (${s.length} > ${max})`); for (const r of VERBOTEN) if (r.test(s)) err(`${wo}: unzulässiger Inhalt (${r})`); };

if (!['quest', 'npc', 'ereignis'].includes(V.typ)) err('typ muss quest, npc oder ereignis sein');
if (!/^[a-z0-9_]{3,40}$/.test(V.id || '')) err('id: nur a-z, 0-9, _ (3–40 Zeichen)');
const stufe = V.gebietsstufe;
if (!Number.isInteger(stufe) || stufe < 1 || stufe > 5) err('gebietsstufe muss 1–5 sein');
if (V.lebensraum && !['w', 'g', 's', 'f', 'r'].includes(V.lebensraum)) err('lebensraum muss w, g, s, f oder r sein');
txt(V.titel, CAP.titel, 'titel'); txt(V.text, CAP.text, 'text');

if (V.typ === 'quest') {
  if (!Array.isArray(V.ziele) || !V.ziele.length) err('quest: ziele fehlen');
  else {
    if (V.ziele.length > CAP.zieleMax) err(`quest: höchstens ${CAP.zieleMax} Ziele`);
    V.ziele.forEach((z, i) => {
      const art = ZIELTYPEN[z.typ];
      if (!art) return err(`ziel ${i + 1}: Zieltyp „${z.typ}“ gibt es nicht (erlaubt: ${Object.keys(ZIELTYPEN).join(', ')})`);
      if (!ids[art].includes(z.ziel)) err(`ziel ${i + 1}: „${z.ziel}“ existiert im Spiel nicht (${art})`);
      if (!Number.isInteger(z.menge) || z.menge < 1 || z.menge > CAP.zielMenge) err(`ziel ${i + 1}: menge 1–${CAP.zielMenge}`);
      if (art === 'monster' && D.MOBS[z.ziel]) {
        const m = D.MOBS[z.ziel], min = { normal: 1, rare: 1, elite: 2, boss: 3, area: 4 }[m.tier];
        if (stufe < min) err(`ziel ${i + 1}: ${m.n} (${m.tier}) erscheint erst ab Gebietsstufe ${min}`);
        if (V.lebensraum && m.hab && m.hab !== '*' && !m.hab.includes(V.lebensraum)) hint(`ziel ${i + 1}: ${m.n} lebt nicht im Lebensraum ${V.lebensraum} (hab ${m.hab})`);
      }
    });
  }
  const b = V.belohnung || {};
  if ((b.xp || 0) > CAP.xpProStufe * stufe) err(`belohnung.xp ${b.xp} > Obergrenze ${CAP.xpProStufe * stufe}`);
  if ((b.muenzen || 0) > CAP.muenzenProStufe * stufe) err(`belohnung.muenzen ${b.muenzen} > Obergrenze ${CAP.muenzenProStufe * stufe}`);
  for (const [it, n] of Object.entries(b.items || {})) {
    if (!ids.item.includes(it)) err(`belohnung: Item „${it}“ existiert nicht`);
    if (/^rune[2-4]$|herz$|schuppe$/.test(it)) err(`belohnung: „${it}“ ist ein seltener Drop – nicht als Questbelohnung ohne Freigabe`);
    if (!Number.isInteger(n) || n < 1 || n > CAP.itemsMenge) err(`belohnung: Menge für ${it} 1–${CAP.itemsMenge}`);
  }
  if (b.ausruestung || b.set || b.klasse) err('belohnung: Ausrüstung/Sets/Klassen sind für KI-Inhalte gesperrt');
}
if (V.typ === 'npc') {
  if (!Array.isArray(V.zeilen) || !V.zeilen.length) err('npc: zeilen fehlen');
  else V.zeilen.forEach((z, i) => txt(z, CAP.npcZeile, `zeile ${i + 1}`));
  if (V.handel || V.belohnung) err('npc: Handel/Belohnungen nur über bestehende Systeme (shopInfo/QUESTS), nicht frei definierbar');
}
if (V.typ === 'ereignis' && V.wirkung) err('ereignis: spielmechanische Wirkung braucht eine Designfreigabe – nur Beschreibung erlaubt');
if (!V.quelle) hint('quelle fehlt (z. B. „KI-Entwurf, Modell, Datum“) – für die Nachvollziehbarkeit angeben');

console.log(`Prüfung ${path.basename(file)}: ${fehler.length} Fehler, ${hinweise.length} Hinweise`);
fehler.forEach(m => console.log('  ✗ ' + m)); hinweise.forEach(m => console.log('  ! ' + m));
process.exit(fehler.length ? 1 : 0);
