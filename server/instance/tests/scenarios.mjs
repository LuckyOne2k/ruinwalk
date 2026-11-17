// Erzeugt deterministisch viele Testkämpfe ohne Zufall der Laufzeit (eigener Zahlengenerator aus der HMAC-Bibliothek).
import { resolveRound, ENGINE_VERSION } from '../engine/engine.mjs';
import { draw32, hashOf, hex, sha256, utf8 } from '../engine/rng.mjs';
export const SEED = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const gen = (i, max) => Math.floor((draw32(utf8('scen'), 'g', 0, 0, i) * max) / 4294967296);
export function makeFight(k) {
  const o = k * 40; const members = [];
  const cnt = 2 + gen(o, 3);
  for (let i = 0; i < cnt; i++) members.push({ id: 'm' + i, hp: 80 + gen(o + 1 + i, 120), maxhp: 200, atk: 8 + gen(o + 10 + i, 20), def: 2 + gen(o + 20 + i, 14), init: gen(o + 30 + i, 10), alive: true });
  const monster = { hp: 300 + gen(o + 5, 400), maxhp: 700, atk: 10 + gen(o + 6, 15), def: 3 + gen(o + 7, 10), init: gen(o + 8, 10) };
  return { fight_id: k + 1, round_no: 1, seed: SEED, state: { members, monster }, actions: {}, conn: {}, cfg: { crit_pct: 15, burn_turns: 3, burn_dmg: 6 } };
}
// Spielt Kämpfe bis zum Ende und liefert die Kette aller Ergebnis-Hashes.
export function playAll(nFights, maxRounds = 40) {
  const chain = []; const outcomes = { won: 0, lost: 0, continue: 0 };
  for (let k = 0; k < nFights; k++) {
    let inp = makeFight(k);
    for (let r = 1; r <= maxRounds; r++) {
      inp.round_no = r;
      inp.actions = r % 3 === 0 ? { m0: { kind: 'ignite' } } : (r % 2 === 0 ? { m0: { kind: 'attack' } } : {});
      const res = resolveRound(inp); chain.push(res.result_hash);
      inp = { ...inp, state: res.state };
      if (res.outcome !== 'continue') { outcomes[res.outcome]++; break; }
      if (r === maxRounds) outcomes.continue++;
    }
  }
  return { digest: hex(sha256(utf8(chain.join(',')))), rounds: chain.length, outcomes, engine: ENGINE_VERSION };
}
