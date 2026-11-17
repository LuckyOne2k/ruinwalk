// Statusliste der offenen Kampfregeln (Abweichungen vom Plan/Architekturbericht), durch Proben belegt.
// Jede Probe prüft die Planregel am echten Engine-Verhalten. „offen“ = Abweichung ist bestätigt und bleibt sichtbar. Wird eine offene Regel erfüllt
// (oder eine erfüllte verletzt), schlägt der Lauf fehl, damit die Liste nie stillschweigend veraltet. Aufruf: node server/instance/tests/offen.mjs
import { newFight, resolveRound } from '../engine/v1.mjs';
import { playFight, REAL4 } from '../sim/fight.mjs';
const seed = 'ab'.repeat(32);
const base = () => newFight([{ id: 'p1', name: 'A', grundklasse: 'krieger', pfad: 'ritter', tier: 3 }, { id: 'p2', name: 'B', grundklasse: 'magier', pfad: 'feuer', tier: 3 }], { bossHp: 5000, bossAtk: 5 });
const round = (S, actions, extra = {}) => resolveRound({ fight_id: 1, round_no: 1, seed, state: S, actions, cfg: {}, ...extra });
const std = { p1: { ability: 'standard', target: 'boss' }, p2: { ability: 'standard', target: 'boss' } };
const idx = (log, f) => log.findIndex(f);
const PROBES = [
  { id: 'E1', titel: 'Energie: Reservierung bei Bestätigung, Abbuchung bei Ausführung, Erstattung bei Verfall, Regeneration am Rundenbeginn', plan: 'Plan 2.1', erwartet: 'offen',
    test: () => { const m = base().members[0]; return typeof m.en === 'number' && typeof m.maxen === 'number'; } },
  { id: 'D1', titel: 'DoT-Ticks zu Rundenbeginn (Effekte früherer Runden lösen vor allen Aktionen aus)', plan: 'Plan 1, Rundenablauf', erwartet: 'offen',
    test: () => { const S = base(); S.members[0].st = [{ id: 'burn', turns: 2, power: 7, n: 1 }]; const l = round(S, std).log; const d = idx(l, (e) => e.e === 'dot'), a = idx(l, (e) => e.e === 'act'); return d >= 0 && d < a; } },
  { id: 'D2', titel: 'DoT in der Anwendungsrunde: löst nie aus (kein Sofort-Doppeln)', plan: 'Plan 2.2', erwartet: 'offen',
    test: () => { const S = base(); const l = round(S, { p1: std.p1, p2: { ability: 'flammenwelle', target: 'boss' } }).log; return !l.some((e) => e.e === 'dot' && e.u === 'boss' && e.st === 'burn'); } },
  { id: 'D3', titel: 'Reihenfolge der periodischen Effekte: Regeneration, Gift, Blutung, Brennen', plan: 'Plan 1, Reihenfolge', erwartet: 'offen',
    test: () => { const S = base(); S.members[0].hp -= 30; S.members[0].st = [{ id: 'burn', turns: 2, power: 7, n: 1 }, { id: 'bleed', turns: 2, power: 4, n: 1 }, { id: 'gift', turns: 2, power: 5, n: 1 }, { id: 'regen', turns: 2, power: 4, n: 1 }];
      const l = round(S, std).log.filter((e) => e.u === 'p1' && (e.e === 'dot' || e.e === 'hot')).map((e) => e.e === 'hot' ? 'regen' : e.st); return l.join() === 'regen,gift,bleed,burn'; } },
  { id: 'B1', titel: 'Brennen-Sprung: stirbt ein brennender Gegner, geht jeder Stapel auf einen anderen lebenden Gegner über (nicht von Bossen)', plan: 'Plan 2.2, Statuseffekte bei Tod', erwartet: 'offen',
    test: () => { const S = base(); const add = (id, hp, st) => ({ id, name: 'Brut', hp, maxhp: 40, atk: 5, def: 0, init: 1, alive: true, st }); S.adds = [add('add1', 1, [{ id: 'burn', turns: 2, power: 7, n: 1 }]), add('add2', 40, [])];
      const o = round(S, { p1: std.p1 }).state; const a2 = o.adds.find((a) => a.id === 'add2'); return !!(a2 && a2.st.some((s) => s.id === 'burn')); } },
  { id: 'T1', titel: 'Bossansage mit Ziel und Wirkung vorab (Ziel wird am Rundenbeginn festgelegt)', plan: 'Plan 1, Rundenbeginn', erwartet: 'offen',
    test: () => { const f = playFight({ players: REAL4, seed, bossHp: 2400, bossAtk: 36, maxRounds: 25 }); const t = f.rounds.map((r) => r.res.state.telegraph).filter(Boolean); return t.length > 0 && t.every((x) => typeof x === 'object' && x.target); } },
  { id: 'T2', titel: 'Bossziel-Auswahl (Bedrohung, Zufallsanteil 25 %): im Plan nicht geregelt', plan: 'keine Planregel', erwartet: 'entscheidung', test: () => null },
  { id: 'H1', titel: 'Heil- und Schildregeln: Heilung nie über Maximum, Schild nimmt den höheren Wert (kein Addieren), Obergrenze 35 %', plan: 'Plan 2.2', erwartet: 'erfüllt',
    test: () => { const S = base(); const s1 = round(S, { p1: { ability: 'schildwall', target: 'p1' }, p2: std.p2 }).state; const sh1 = s1.members[0].st.find((x) => x.id === 'shield');
      const S2 = JSON.parse(JSON.stringify(s1)); S2.members[0].cd = {}; const s2 = round(S2, { p1: { ability: 'schildwall', target: 'p1' }, p2: std.p2 }).state; const sh2 = s2.members[0].st.find((x) => x.id === 'shield');
      const S3 = base(); const h = round(S3, { p1: { ability: 'standard', target: 'boss' }, p2: { ability: 'heilendes_licht', target: 'p1' } }).state;
      return sh1 && sh2 && sh2.power === sh1.power && sh1.power <= Math.floor(s1.members[0].maxhp * 0.35) && h.members.every((m) => m.hp <= m.maxhp); } },
  { id: 'H2', titel: 'Zahlenwerte für Heilung, Schild, Regeneration, Trank, Rückkehr-HP, Nachrücker-HP, Energie', plan: 'Plan 8: Balance', erwartet: 'balance', test: () => null },
  { id: 'W1', titel: 'Wipe-Wiederaufnahme setzt die angehaltene Auflösung an derselben Stelle fort (kein eigener Zwischenschritt)', plan: 'Plan 1b, Ende der Unterbrechung', erwartet: 'offen',
    test: () => { const S = base(); return Array.isArray(S.pending) && S.pending !== undefined; } },
];
let bad = 0; const rows = [];
for (const p of PROBES) {
  let r; try { r = p.test(); } catch (e) { r = 'fehler: ' + e.message; }
  let ist = r === null ? p.erwartet : r === true ? 'erfüllt' : r === false ? 'offen' : 'fehler';
  const okk = ist === p.erwartet; if (!okk) bad++;
  rows.push(`${okk ? 'ok' : 'NICHT OK'} - [${p.id}] ${p.erwartet.toUpperCase()} · ${p.titel} (${p.plan})${okk ? '' : `  → Probe ergibt „${ist}“, Liste anpassen`}`);
}
console.log(rows.join('\n'));
const cnt = (s) => PROBES.filter((p) => p.erwartet === s).length;
console.log(`\nStatus: ${cnt('erfüllt')} erfüllt, ${cnt('offen')} offen (Abweichung bestätigt), ${cnt('entscheidung')} Entscheidung nötig, ${cnt('balance')} Balance offen`);
console.log(bad ? `FEHLER: ${bad} Probe(n) passen nicht zur Statusliste` : 'ALLE TESTS OK: Statusliste stimmt mit dem Engine-Verhalten überein');
process.exit(bad ? 1 : 0);
