// Läuft unverändert unter Node, Bun und Deno. Gibt eine JSON-Zeile aus: Laufzeit + Digest. Der Vergleich erfolgt in run-determinism.sh.
import { sha256, hmac, utf8, hex, draw32 } from '../engine/rng.mjs';
import { playAll } from './scenarios.mjs';
import { playFight, TEAM4, REAL4, REAL5, REAL_BOSS_HP, REAL_BOSS_ATK } from '../sim/fight.mjs';
import { ENGINE_VERSION, enableLegacyReference } from '../engine/v1.mjs';
enableLegacyReference();                                        // die 120-Kämpfe-Kette der alten Phase-1-Referenz nutzt die Testprofile
const rt = typeof Deno !== 'undefined' ? 'deno ' + Deno.version.deno : typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.version;
const checks = [];
const eq = (n, a, b) => checks.push({ n, ok: a === b });
eq('sha256("abc")', hex(sha256(utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
eq('sha256("")', hex(sha256(new Uint8Array(0))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
// RFC 4231, Testfall 2 und 6 (Schlüssel > 64 Byte)
eq('hmac rfc4231 #2', hex(hmac(utf8('Jefe'), utf8('what do ya want for nothing?'))), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
eq('hmac rfc4231 #6', hex(hmac(new Uint8Array(131).fill(0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First'))), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
eq('utf8 mehrbyte', hex(utf8('äß€😀')), 'c3a4c39fe282acf09f9880');
const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
eq('draw32 fest', String(draw32(seed, 'crit', 7, 3, 0)), String(draw32(seed, 'crit', 7, 3, 0)));
const run = playAll(300);
// Phase-1-Engine: 120 komplette Dungeon-Kämpfe (verschiedene Gruppen, Ausfälle); die Kette aller Ergebnis-Hashes geht in den Digest ein
const comps = [TEAM4, TEAM4.slice(0, 3), TEAM4.slice(1), [TEAM4[0], TEAM4[2], TEAM4[3]]]; const chain = []; let dr = 0;
for (let k = 1; k <= 120; k++) { const f = playFight({ players: comps[k % 4], seed: ((k * 2654435761 >>> 0).toString(16).padStart(8, '0')).repeat(8), fightId: k, offline: k % 3 === 0 ? { p2: [2, 3, 4] } : {} }); for (const x of f.rounds) { chain.push(x.res.result_hash); dr++; } }
// Engine v1 mit der echten Klassenstruktur (4 Grundklassen, 12 Pfade, Wiederbelebung, Todesfenster, Ausfälle, Austritt): 100 Kämpfe, Kette aller Ergebnis-Hashes plus Endzustand
const PATHS = [['krieger', 'ritter'], ['krieger', 'berserker'], ['krieger', 'duellant'], ['bogenschuetze', 'scharfschuetze'], ['bogenschuetze', 'jaeger'], ['bogenschuetze', 'fallensteller'], ['magier', 'feuer'], ['magier', 'frost'], ['magier', 'sturm'], ['heiler', 'priester'], ['heiler', 'moench'], ['heiler', 'natur']];
const v1chain = []; let v1r = 0;
for (let k = 1; k <= 100; k++) {
  const base = k % 3 === 0 ? REAL5 : REAL4, team = k % 5 === 0 ? PATHS.slice(k % 9, (k % 9) + 4).map(([g, pf], i) => ({ id: 'p' + (i + 1), name: 'T' + i, grundklasse: g, pfad: pf, tier: 3 })).concat([{ id: 'p5', name: 'H', grundklasse: 'heiler', pfad: k % 2 ? 'natur' : 'priester', tier: 3 }]) : base;
  const f = playFight({ players: team, seed: ((k * 2246822519 >>> 0).toString(16).padStart(8, '0')).repeat(8), fightId: 1000 + k, bossHp: REAL_BOSS_HP, bossAtk: REAL_BOSS_ATK - (k % 4) * 3, reviveWindowRounds: k % 2 ? 2 : 0, offline: k % 4 === 0 ? { p2: [2, 3, 4] } : {}, left: k % 7 === 0 ? { p3: 6 } : {} });
  for (const x of f.rounds) { v1chain.push(x.res.result_hash); v1r++; } v1chain.push(f.outcome + ':' + (f.reason || '') + ':' + f.state.members.map((m) => m.hp + '/' + m.deaths + '/' + m.revives).join(','));
}
run.v1_engine = ENGINE_VERSION; run.v1_rounds = v1r; run.v1_digest = hex(sha256(utf8(v1chain.join(','))));
eq('v1 hat Kämpfe berechnet', v1r > 400, true);
run.dungeon_rounds = dr; run.digest = hex(sha256(utf8(run.digest + '|' + chain.join(',') + '|' + run.v1_digest)));
const bad = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ rt, vectors_ok: bad.length === 0, bad: bad.map((b) => b.n), ...run }));
if (bad.length) { console.error('Testvektor fehlgeschlagen', bad); (typeof process !== 'undefined' ? process.exit(1) : Deno.exit(1)); }
