// Engine-Tests Phase 1:  node server/instance/tests/combat.mjs
import { resolveRound, newFight, DEFAULT_CFG, ENGINE_VERSION } from '../engine/v1.mjs';
import { hashOf } from '../engine/rng.mjs';
import { playFight, TEAM4 } from '../sim/fight.mjs';
import { ABILITIES, CLASSES, BOSS } from '../engine/content.mjs';
const SEED = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
let pass = 0, fail = 0; const ok = (c, n, i = '') => { c ? pass++ : fail++; console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const inp = (S, r = 1, actions = {}, over = {}) => ({ fight_id: 7, round_no: r, seed: over.seed || SEED, cfg: { ...DEFAULT_CFG, ...(over.cfg || {}) }, state: S, actions, conn: {} });
const fresh = (team = TEAM4) => newFight(team);
const clone = (x) => JSON.parse(JSON.stringify(x));
const seedOf = (k) => { const h = (k * 2654435761 >>> 0).toString(16).padStart(8, '0'); return h.repeat(8); };

// Grundeigenschaften
{ const S = fresh(), i = inp(S, 1, { p2: { ability: 'blutung', target: 'boss' } }), before = hashOf(i);
  const a = resolveRound(i), b = resolveRound(clone(i));
  ok(a.result_hash === b.result_hash, 'gleiche Eingabe -> bitgleiches Ergebnis'); ok(hashOf(i) === before, 'Eingabe wird nicht verändert');
  ok(resolveRound(inp(S, 1, {}, { seed: seedOf(5) })).result_hash !== a.result_hash, 'anderer Seed -> anderes Ergebnis'); }

// Vollständige Kämpfe mit Bots, Replay und Invarianten
const chk = (S) => { let bad = []; for (const m of S.members) { if (m.hp < 0 || m.hp > m.maxhp) bad.push('hp ' + m.id); if (m.alive && m.hp === 0) bad.push('alive0 ' + m.id); if (!m.alive && m.hp !== 0) bad.push('dead>0 ' + m.id); for (const s of m.st) if (s.turns <= 0) bad.push('turns'); for (const k in m.cd) if (m.cd[k] <= 0) bad.push('cd'); if (!m.alive && m.st.length) bad.push('dead-st'); }
  if (S.monster.hp < 0 || S.monster.hp > S.monster.maxhp) bad.push('boss hp'); if (S.monster.alive && S.monster.hp === 0) bad.push('boss alive0'); for (const a of S.adds) if (!a.alive || a.hp <= 0) bad.push('add'); return bad; };
{ let bad = 0, replay = 0, total = 0, won = 0, lost = { wipe: 0, zeit: 0 }, rounds = 0, nPhase = 0, maxPh = 0;
  const comps = [TEAM4, TEAM4.slice(0, 3), [TEAM4[0], TEAM4[2], TEAM4[3]], [TEAM4[1], TEAM4[2], TEAM4[3]], [...TEAM4, { id: 'p5', cls: 'klinge' }]];
  for (let k = 0; k < 150; k++) {
    const f = playFight({ players: comps[k % comps.length], seed: seedOf(k + 1), fightId: k + 1, offline: k % 4 === 0 ? { p2: [2, 3, 4], p3: [5] } : {} });
    for (const { input, res } of f.rounds) { total++; bad += chk(res.state).length; const again = resolveRound(JSON.parse(JSON.stringify(input))); if (again.result_hash === res.result_hash) replay++; maxPh = Math.max(maxPh, res.state.monster.phase); }
    rounds += f.rounds.length; if (f.outcome === 'won') won++; else if (f.outcome === 'lost') lost[f.reason]++;
  }
  ok(bad === 0, 'Invarianten nach jeder Runde (150 Kämpfe, 5 Gruppenzusammensetzungen)', `${total} Runden`);
  ok(replay === total, 'Replay: jede Runde aus gespeicherter Eingabe bitgleich', `${replay}/${total}`);
  ok(won + lost.wipe + lost.zeit === 150 && won > 0 && lost.wipe > 0, 'beide Ausgänge kommen vor (Sieg und Wipe)', `Siege ${won}, Wipe ${lost.wipe}, Zeit ${lost.zeit}, Ø ${(rounds / 150).toFixed(1)} Runden`);
  ok(maxPh === 3, 'alle drei Bossphasen werden erreicht'); }

// Spott: Boss muss den Spötter treffen
{ let allTank = 0, n = 0;
  for (let k = 0; k < 60; k++) { const S = fresh(); const r1 = resolveRound(inp(S, 1, { p1: { ability: 'spott' } }, { seed: seedOf(k + 100) }));
    const r2 = resolveRound(inp(r1.state, 2, {}, { seed: seedOf(k + 100) }));      // Wächter (Init 3) handelt nach dem Boss: Spott wirkt ab der Folgerunde
    for (const e of r2.log) if (e.e === 'boss') { n++; if (e.t === 'p1') allTank++; } }
  ok(n === 60 && allTank === n, 'Spott: in der Folgerunde greift der Boss in 60/60 Seeds den Spötter an (kein Zufallsabweichler)', `${allTank}/${n}`); }
{ let toTank = 0, n = 0; for (let k = 0; k < 400; k++) { const S = fresh(); S.members[0].threat = 500; const r = resolveRound(inp(S, 1, {}, { seed: seedOf(k + 900) })); for (const e of r.log) if (e.e === 'boss') { n++; if (e.t === 'p1') toTank++; } }
  ok(toTank / n > 0.70 && toTank / n < 0.95, 'Bedrohung: höchster Bedrohungswert wird meist (nicht immer) getroffen (25 % Streuung)', `${(100 * toTank / n).toFixed(0)} %`); }

// Statuswirkungen
{ const S = fresh(); S.monster.hp = S.monster.maxhp; const r1 = resolveRound(inp(S, 1, { p3: { ability: 'brandpfeil', target: 'boss' } }, { cfg: { crit_pct: 0 } }));
  const burn = r1.log.filter((e) => e.e === 'dot'); ok(burn.length === 1 && burn[0].v === 7 && r1.state.monster.st.find((s) => s.id === 'burn').turns === 2, 'Brand: 7 Schaden im selben Rundenende, danach 2 Runden Restdauer');
  let s2 = r1.state, ticks = 1; for (let r = 2; r <= 4; r++) { const x = resolveRound(inp(s2, r, {}, { cfg: { crit_pct: 0 } })); ticks += x.log.filter((e) => e.e === 'dot' && e.u === 'boss').length; s2 = x.state; }
  ok(ticks === 3 && !s2.monster.st.some((s) => s.id === 'burn'), 'Brand tickt genau 3-mal und endet'); 
  const again = resolveRound(inp(r1.state, 2, { p3: { ability: 'funken', target: 'boss' } })); ok(again.state.monster.st.filter((s) => s.id === 'burn').length <= 1, 'gleicher Status stapelt nicht'); }
{ const S = fresh(); S.members[1].hp = 40; const r = resolveRound(inp(S, 1, { p4: { ability: 'segen' } })); const dmg = r.log.filter((e) => e.e === 'boss' && e.t === 'p2').reduce((a, e) => a + e.v, 0); ok(r.log.some((e) => e.e === 'hot' && e.u === 'p2' && e.v === 6) && r.state.members[1].hp === 40 - dmg + 6 - r.log.filter((e) => e.e === 'add' && e.t === 'p2').reduce((a, e) => a + e.v, 0), 'Regeneration heilt jeden Rundenende-Tick'); }
{ const S = fresh(); S.members[0].hp = S.members[0].maxhp - 3; const r = resolveRound(inp(S, 1, { p4: { ability: 'heilung', target: 'p1' } })); ok(r.log.find((e) => e.ab === 'heilung').v === 3 && r.state.members[0].hp <= r.state.members[0].maxhp, 'Heilung ist durch maxhp begrenzt (+3 statt voller Wert)'); }
{ const S = fresh(); S.members[0].st.push({ id: 'taunt', turns: 2, power: 0 }, { id: 'shield', turns: 3, power: 30 }); const r = resolveRound(inp(S, 1, {}, { cfg: { crit_pct: 0 } }));
  const bl = r.log.find((e) => e.e === 'boss'); ok(bl.t === 'p1' && bl.abs === 24 - 0 || bl.abs === Math.min(30, bl.v), 'Schutzschild nimmt zuerst auf', JSON.stringify(bl));
  const lost = CLASSES.waechter.hp - r.state.members[0].hp; ok(lost === bl.v - bl.abs, 'nur der Rest geht von den Lebenspunkten ab', `Schaden ${bl.v}, abgefangen ${bl.abs}, verloren ${lost}`); }
{ const S = fresh(); S.members[1].st.push({ id: 'stun', turns: 1, power: 0 }); const r = resolveRound(inp(S, 1, { p2: { ability: 'stoss', target: 'boss' } })); ok(r.log.some((e) => e.e === 'stun' && e.a === 'p2') && !r.log.some((e) => e.e === 'act' && e.a === 'p2'), 'Betäubung überspringt die Aktion'); }

// Fähigkeiten: Abklingzeit, Ungültiges, fehlende Bestätigung
{ const S = fresh(); const r1 = resolveRound(inp(S, 1, { p2: { ability: 'toedlich', target: 'boss' } })); ok(r1.state.members[1].cd.toedlich === 4, 'Abklingzeit gesetzt (5) und am Rundenende um 1 gesenkt');
  const r2 = resolveRound(inp(r1.state, 2, { p2: { ability: 'toedlich', target: 'boss' } })); const l = r2.log.find((e) => e.a === 'p2'); ok(l.ab === 'stoss' && l.o === 'ungültig→automatisch', 'Fähigkeit in Abklingzeit -> Standardangriff, Herkunft „ungültig→automatisch“');
  const r3 = resolveRound(inp(S, 1, { p2: { ability: 'heilung', target: 'p1' } })); ok(r3.log.find((e) => e.a === 'p2').ab === 'stoss', 'fremde Klassenfähigkeit wird abgelehnt');
  const r4 = resolveRound(inp(S, 1, {})); ok(r4.log.filter((e) => e.e === 'act').every((e) => e.o === 'automatisch'), 'ohne Bestätigung: alle „automatisch“ (Standardangriff)');
  const r5 = resolveRound(inp(S, 1, { p2: { ability: 'stoss', target: 'p1' } })); ok(r5.log.find((e) => e.a === 'p2').t === 'boss', 'ungültiges Ziel (Mitspieler als Angriffsziel) fällt auf den Boss zurück'); }
{ const S = fresh(); const r = resolveRound(inp(S, 1, { p3: { ability: 'flaechenfeuer' } })); ok(r.log.find((e) => e.ab === 'flaechenfeuer').hits.length === 1, 'Flächenfeuer ohne Zusatzgegner trifft nur den Boss');
  S.monster.hp = 900; S.monster.phase = 2; S.adds = [{ id: 'add1', name: 'x', hp: 90, maxhp: 90, atk: 10, def: 2, init: 9, alive: true, st: [] }, { id: 'add2', name: 'x', hp: 90, maxhp: 90, atk: 10, def: 2, init: 9, alive: true, st: [] }];
  const r2 = resolveRound(inp(S, 1, { p3: { ability: 'flaechenfeuer' } })); ok(r2.log.find((e) => e.ab === 'flaechenfeuer').hits.filter((h) => h.t).length === 3, 'Flächenfeuer trifft Boss und beide Zusatzgegner'); }

// Bossmechaniken
{ const f = playFight({ players: TEAM4, seed: seedOf(3), fightId: 3, maxRounds: 5 });
  const tele = f.rounds.map((x) => x.res.state.telegraph); ok(tele[2] === 'schwerer_schlag' && tele[0] === null, 'schwerer Schlag wird am Ende von Runde 3 angekündigt', JSON.stringify(tele));
  ok(f.rounds[3].res.log.some((e) => e.e === 'boss' && e.k === 'schwerer_schlag'), 'der angekündigte schwere Schlag erfolgt in Runde 4'); }
{ const S = fresh(); S.monster.hp = Math.floor(BOSS.hp * 0.67); const r = resolveRound(inp(S, 1, { p2: { ability: 'toedlich', target: 'boss' } }, { cfg: { crit_pct: 0 } }));
  ok(r.state.monster.phase === 2 && r.state.adds.length === 2 && r.log.filter((e) => e.e === 'phase').length === 1, 'Phase 2 mitten in der Runde: Zusatzgegner erscheinen genau einmal');
  const r2 = resolveRound(inp(r.state, 2, {})); ok(r2.log.filter((e) => e.e === 'phase').length === 0 && r2.state.adds.length === 2, 'kein erneuter Phasenwechsel/Spawn in Folgerunde'); }
{ const S = fresh(); S.monster.hp = Math.floor(BOSS.hp * 0.2); S.monster.phase = 1; const r = resolveRound(inp(S, 1, {}, {})); ok(r.state.monster.phase === 3 && r.log.filter((e) => e.e === 'phase').map((e) => e.p).join() === '2,3', 'Sprung über Phase 2 löst beide Wechsel in Reihenfolge aus'); }
{ let seenWave = false; const f = playFight({ players: TEAM4, seed: seedOf(11), fightId: 11, maxRounds: 40 }); for (const x of f.rounds) if (x.res.log.some((e) => e.e === 'boss' && e.k === 'flammenwelle')) seenWave = true; ok(seenWave, 'Flammenwelle kommt in Phase 2/3 vor'); }

// Ausgänge
{ const S = fresh(); S.monster.hp = 5; const r = resolveRound(inp(S, 1, { p2: { ability: 'stoss', target: 'boss' }, p1: { ability: 'hieb', target: 'boss' } })); ok(r.outcome === 'won' && r.reason === 'sieg', 'Sieg: Boss auf 0');
  ok(!r.log.some((e, i, a) => e.e === 'act' && a.slice(0, i).some((x) => x.e === 'down' && x.u === 'boss')), 'nach dem Tod des Bosses handelt niemand mehr'); }
{ const S = fresh(); for (const m of S.members) { m.hp = 1; } S.monster.phase = 2; S.monster.cds.wave = 0; const r = resolveRound(inp(S, 1, {})); ok(r.outcome === 'lost' && r.reason === 'wipe' && r.state.members.every((m) => !m.alive), 'Wipe: alle Spieler tot -> lost/wipe'); }
{ const S = fresh(); const r = resolveRound(inp(S, DEFAULT_CFG.round_limit, {})); ok(r.outcome === 'lost' && r.reason === 'zeit', 'Rundenlimit erreicht -> lost/zeit'); }
{ const S = fresh(); S.monster.hp = 4; S.monster.st.push({ id: 'burn', turns: 2, power: 9 }); S.members.forEach((m, i) => { if (i) { m.alive = false; m.hp = 0; } }); S.members[0].hp = 1;
  const r = resolveRound(inp(S, 1, { p1: { ability: 'hieb', target: 'add9' } }, { cfg: { crit_pct: 0 } })); ok(['won', 'lost'].includes(r.outcome), 'Gleichzeitiger Tod führt zu eindeutigem Ausgang', r.outcome + '/' + r.reason); }
{ const S = fresh(); S.members.forEach((m, i) => { if (i) { m.alive = false; m.hp = 0; } }); S.members[0].hp = 3; S.monster.hp = 6; S.monster.st.push({ id: 'burn', turns: 2, power: 9 });
  S.monster.init = 99; const r = resolveRound(inp(S, 1, {}, { cfg: { crit_pct: 0 } })); ok(!r.state.members[0].alive && r.outcome === 'lost', 'Boss tötet letzten Spieler vor dem Tick: Ende sofort, kein Tick danach (lost)'); }

// Ausgefallene Spieler brechen den Kampf nicht ab
{ const f = playFight({ players: TEAM4, seed: seedOf(21), fightId: 21, offline: { p1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], p4: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } });
  ok(f.rounds.length > 0 && f.rounds.slice(0, 3).every((x) => x.res.log.filter((e) => e.e === 'act' && (e.a === 'p1' || e.a === 'p4')).every((e) => e.o === 'automatisch')), 'ausgefallene Spieler handeln automatisch, der Kampf läuft weiter', `${f.rounds.length} Runden, ${f.outcome}`); }
// Ankündigung stimmt immer mit der folgenden Boss-Aktion überein
{ let n = 0, bad = 0; for (let k = 0; k < 60; k++) { const f = playFight({ players: TEAM4, seed: seedOf(k + 300), fightId: k }); for (let i = 0; i + 1 < f.rounds.length; i++) { const t = f.rounds[i].res.state.telegraph; const nb = f.rounds[i + 1].res.log.find((e) => e.e === 'boss'); if (!nb) continue; const kind = nb.k === 'angriff' ? null : nb.k === 'flammenwelle' ? 'flammenwelle' : 'schwerer_schlag'; n++; if (kind !== t) bad++; } }
  ok(n > 500 && bad === 0, 'Ankündigung entspricht in jeder Runde der folgenden Boss-Aktion', `${n} Runden, ${bad} Abweichungen`); }
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen  (Engine ${ENGINE_VERSION})`); process.exit(fail ? 1 : 0);
