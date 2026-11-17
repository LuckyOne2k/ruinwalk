// Referenztest „Dungeon-Kern“: 4 Testspieler gegen den Aschenwächter, 12 feste Seeds. Prüft das KAMPFPROTOKOLL (Ereignisse und Ausgang), nicht die Zustandshashes,
// damit spätere Engine-Erweiterungen (Wiederbelebung, Beitritt …) den Kern nachweislich nicht verändern.  Aufruf: node golden.mjs [--schreiben]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { playFight, TEAM4 } from '../sim/fight.mjs';
import { sha256, utf8, hex, canon } from '../engine/rng.mjs';
const file = join(dirname(fileURLToPath(import.meta.url)), 'golden/dungeon-referenz.json');
const rows = [];
for (let k = 1; k <= 12; k++) {
  const f = playFight({ players: TEAM4, seed: ((k * 2654435761 >>> 0).toString(16).padStart(8, '0')).repeat(8), fightId: k, offline: k % 3 === 0 ? { p4: [4, 5, 6] } : {} });
  rows.push({ seed: k, ausgang: f.outcome, grund: f.reason, runden: f.rounds.length, protokoll: hex(sha256(utf8(canon(f.rounds.map((x) => x.res.log))))) });
}
if (process.argv.includes('--schreiben')) { writeFileSync(file, JSON.stringify(rows, null, 1) + '\n'); console.log('Referenz geschrieben:', rows.map((r) => r.ausgang[0] + r.runden).join(' ')); process.exit(0); }
const ref = JSON.parse(readFileSync(file, 'utf8')); let bad = 0;
for (const r of rows) { const g = ref.find((x) => x.seed === r.seed); if (!g || JSON.stringify(g) !== JSON.stringify(r)) { bad++; console.log('ABWEICHUNG Seed', r.seed, g && g.ausgang + g.runden, '→', r.ausgang + r.runden); } }
console.log(bad ? `NICHT OK - Dungeon-Referenz weicht ab (${bad}/12)` : `ok - Dungeon-Referenz: 12/12 Kämpfe mit unverändertem Protokoll (${rows.filter((r) => r.ausgang === 'won').length} Siege)`); process.exit(bad ? 1 : 0);
