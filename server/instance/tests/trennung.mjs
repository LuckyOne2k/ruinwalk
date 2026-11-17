// Trennung der alten Testprofile (legacy.mjs) vom regulären Engine-Pfad: node server/instance/tests/trennung.mjs
// Dieser Test schaltet die Referenzprofile NIE frei.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { newFight, resolveRound, resolveClaim, legacyReferenceEnabled } from '../engine/v1.mjs';
import { ABILITIES, abilitiesOf, GRUNDKLASSEN, PFADE } from '../engine/content.mjs';
import { LEGACY_ABILITIES } from '../engine/legacy.mjs';
import { REAL4, REAL5 } from '../sim/fight.mjs';
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
let pass = 0, fail = 0; const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const throws = (f) => { try { f(); return false; } catch { return true; } };

ok(legacyReferenceEnabled() === false, 'Referenzprofile sind in diesem Prozess nicht freigeschaltet');
ok(throws(() => newFight([{ id: 'p1', cls: 'waechter' }])), 'newFight lehnt Referenzprofile ab, solange sie nicht freigeschaltet sind');
{ const S = newFight(REAL4); S.members[0].legacy = true; S.members[0].cls = 'waechter';
  ok(throws(() => resolveRound({ fight_id: 1, round_no: 1, seed: 'ab'.repeat(32), state: S, actions: {}, cfg: {} })), 'resolveRound lehnt einen Zustand mit Referenzprofil ab');
  ok(throws(() => resolveClaim({ fight_id: 1, round_no: 1, seed: 'ab'.repeat(32), cfg_version: 1, snapshot: { state: S, actions: {} } })), 'resolveClaim (Weg der Edge Function) lehnt ihn ebenfalls ab'); }
for (const team of [REAL4, REAL5]) { const S = newFight(team); ok(S.members.every((m) => !m.legacy && m.grundklasse && GRUNDKLASSEN[m.grundklasse] && m.abilities.every((a) => ABILITIES[a])), 'echte Spielerzustände enthalten kein Referenzprofil und nur reguläre Fähigkeiten'); }
{ const legacyOnly = Object.keys(LEGACY_ABILITIES).filter((k) => !(k in ABILITIES)); const every = new Set();
  for (const [pf, d] of Object.entries(PFADE)) for (const t of [0, 1, 2, 3]) for (const a of abilitiesOf(d.grundklasse, t ? pf : null, t)) every.add(a);
  ok(legacyOnly.length > 0 && legacyOnly.every((k) => !every.has(k)), 'kein Referenz-Fähigkeitsname gelangt in eine reguläre Klasse', legacyOnly.join(',')); }
// Quelltext-Prüfung: wer darf die Referenzprofile importieren oder freischalten
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.mjs')) files.push(p); } }; walk(root);
const rel = (p) => relative(root, p).replace(/\\/g, '/');
const importers = files.filter((p) => /legacy\.mjs/.test(readFileSync(p, 'utf8')) && rel(p) !== 'tests/trennung.mjs').map(rel).sort();
const ALLOWED_IMPORT = ['engine/content.mjs', 'engine/v1.mjs', 'sim/bots.mjs', 'sim/fight.mjs', 'sim/run-dungeon.mjs', 'tests/combat.mjs'];
ok(JSON.stringify(importers) === JSON.stringify(ALLOWED_IMPORT.slice().sort()), 'legacy.mjs wird nur von den vorgesehenen Dateien importiert', importers.join(', '));
const enablers = files.filter((p) => /enableLegacyReference\(\)/.test(readFileSync(p, 'utf8'))).map(rel).filter((x) => x !== 'engine/v1.mjs').sort();
ok(JSON.stringify(enablers) === JSON.stringify(['sim/run-dungeon.mjs', 'tests/combat.mjs', 'tests/determinism.mjs', 'tests/golden.mjs']), 'Freischaltung nur in Regressionswerkzeugen (Referenzkämpfe, Kernregeltests, Determinismus-Kette, --team legacy)', enablers.join(', '));
const prod = ['engine/v1.mjs', 'engine/content.mjs', 'engine/rng.mjs'].filter((f) => files.map(rel).includes(f));
ok(!readFileSync(join(root, 'engine/content.mjs'), 'utf8').includes('enableLegacyReference') && !readFileSync(join(root, 'engine/rng.mjs'), 'utf8').includes('enableLegacyReference'), 'content und rng schalten nichts frei', prod.join(','));
{ const v1 = readFileSync(join(root, 'engine/v1.mjs'), 'utf8'); ok((v1.match(/enableLegacyReference\(\)/g) || []).length === 0 && /export const enableLegacyReference/.test(v1), 'die Engine ruft die Freischaltung selbst nie auf'); }
const sqlAll = readdirSync(join(root, 'sql')).map((f) => readFileSync(join(root, 'sql', f), 'utf8')).join('\n');
ok(/legacy_rejected/.test(sqlAll), 'der Kampfstart in der Datenbank lehnt Referenzprofile ab (start_fight)');
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`); process.exit(fail ? 1 : 0);
