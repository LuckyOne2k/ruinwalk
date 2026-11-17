// PROTOTYP der Instanzkampf-Engine (Phase 0). Reine Funktion, nur Ganzzahlen, keine Uhr, kein Math.random.
// Dient dem Nachweis von Determinismus, Replay und Auftragsverarbeitung. Die Zahlen sind KEINE Spielbalance.
import { drawInt, hashOf, fromHex } from './rng.mjs';
export const ENGINE_VERSION = 'proto-0.1';

// input: { fight_id, round_no, seed (hex), state:{members:[{id,hp,maxhp,atk,def,init,alive}], monster:{hp,maxhp,atk,def,init,burn:{turns,dmg}}},
//          actions:{[memberId]:{kind:'attack'|'ignite'}} (bestätigt), conn:{[memberId]:bool}, cfg:{crit_pct,burn_turns,burn_dmg} }
export function resolveRound(input) {
  const seed = fromHex(input.seed), cfg = input.cfg, fid = input.fight_id, rn = input.round_no;
  const st = JSON.parse(JSON.stringify(input.state));          // keine Mutation der Eingabe
  const log = []; let n = 0;                                    // n = Ziehungsnummer, je Auflösung bei 0
  const rnd = (stream, max) => drawInt(seed, stream, fid, rn, n++, max);
  const actors = [...st.members.filter((m) => m.alive).map((m) => ({ t: 'm', id: m.id, init: m.init })), { t: 'x', id: 'monster', init: st.monster.init }];
  actors.sort((a, b) => b.init - a.init || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // Gleichstand deterministisch nach ID
  const dmg = (atk, def, who) => { const base = Math.max(1, atk - Math.floor(def / 2)); const crit = rnd('crit', 100) < cfg.crit_pct; const spread = rnd('spread', 5); return { v: (crit ? base * 2 : base) + spread, crit }; };
  for (const a of actors) {
    if (st.monster.hp <= 0 || st.members.every((m) => !m.alive)) break;
    if (a.t === 'm') {
      const m = st.members.find((x) => x.id === a.id); if (!m.alive) continue;
      const act = input.actions[m.id]; const origin = act ? 'bestätigt' : 'automatisch';   // Standardangriff bei fehlender Bestätigung (D.3)
      const kind = act ? act.kind : 'attack';
      if (kind === 'ignite') { st.monster.burn = { turns: cfg.burn_turns, dmg: cfg.burn_dmg }; log.push({ a: m.id, k: 'ignite', o: origin }); }
      else { const d = dmg(m.atk, st.monster.def, m.id); st.monster.hp = Math.max(0, st.monster.hp - d.v); log.push({ a: m.id, k: 'attack', v: d.v, c: d.crit, o: origin }); }
    } else {
      const alive = st.members.filter((m) => m.alive); if (!alive.length) continue;
      const tgt = alive[rnd('target', alive.length)]; const d = dmg(st.monster.atk, tgt.def, 'monster');
      tgt.hp = Math.max(0, tgt.hp - d.v); if (tgt.hp === 0) tgt.alive = false;
      log.push({ a: 'monster', k: 'attack', t: tgt.id, v: d.v, c: d.crit });
    }
  }
  if (st.monster.burn && st.monster.burn.turns > 0 && st.monster.hp > 0) {            // Statusverarbeitung am Rundenende
    st.monster.hp = Math.max(0, st.monster.hp - st.monster.burn.dmg); st.monster.burn.turns -= 1;
    log.push({ k: 'burn', v: st.monster.burn.dmg, left: st.monster.burn.turns });
    if (st.monster.burn.turns === 0) delete st.monster.burn;
  }
  const won = st.monster.hp <= 0, lost = st.members.every((m) => !m.alive);
  const outcome = won ? 'won' : lost ? 'lost' : 'continue';
  const result = { state: st, log, outcome, draws: n };
  return { ...result, result_hash: hashOf(result) };
}
export const inputHash = (input) => hashOf(input);
