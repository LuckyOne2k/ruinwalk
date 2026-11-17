// Spielt einen kompletten Instanzkampf im Speicher (ohne Datenbank): Bots entscheiden, die Engine löst Runde für Runde auf.
// offline: { memberId: [Runden] } -> in diesen Runden gibt der Spieler keine Aktion ab (Engine setzt Standardangriff, "automatisch").
import { resolveRound, newFight, DEFAULT_CFG } from '../engine/v1.mjs';
import { decide } from './bots.mjs';
export function playFight({ players, seed, fightId = 1, cfg = {}, offline = {}, maxRounds = 60, decideFn = decide, state = null, startRound = 1 }) {
  let S = state || newFight(players), rounds = [], outcome = 'continue', reason = null;
  for (let r = startRound; r < startRound + maxRounds; r++) {
    const actions = {};
    for (const m of S.members) if (m.alive && !(offline[m.id] || []).includes(r)) actions[m.id] = decideFn(S, m);
    const input = { fight_id: fightId, round_no: r, seed, cfg: { ...DEFAULT_CFG, ...cfg }, state: S, actions, conn: {} };
    const res = resolveRound(input); rounds.push({ input, res }); S = res.state; outcome = res.outcome; reason = res.reason;
    if (outcome !== 'continue') break;
  }
  return { rounds, outcome, reason, state: S };
}
export const TEAM4 = [{ id: 'p1', name: 'Bruno', cls: 'waechter' }, { id: 'p2', name: 'Mira', cls: 'klinge' }, { id: 'p3', name: 'Ilka', cls: 'funke' }, { id: 'p4', name: 'Tom', cls: 'quell' }];
// Lesbare Kampfprotokoll-Zeile (deutsch) für die Ausgabe
import { ABILITIES, BOSS } from '../engine/content.mjs';
export function describe(S0, ev) {
  const nm = (id) => id === 'boss' ? BOSS.name : (S0.members.find((m) => m.id === id) || {}).name || (id.startsWith('add') ? 'Funkenbrut ' + id.slice(3) : id);
  const crit = (c) => (c ? ' (KRITISCH)' : '');
  switch (ev.e) {
    case 'phase': return `*** PHASE ${ev.p}: ${ev.name} ***`;
    case 'spawn': return `    ${ev.n} Funkenbrut erscheint`;
    case 'stun': return `  ${nm(ev.a)} ist betäubt`;
    case 'act': { const ab = ABILITIES[ev.ab], o = ev.o === 'bestätigt' ? '' : ` [${ev.o}]`;
      if (ev.hits) return `  ${nm(ev.a)}: ${ab.name}${o} → ` + ev.hits.map((h) => h.down ? `${nm(h.down)} fällt` : `${nm(h.t)} −${h.v}${crit(h.c)}`).join(', ');
      if (ab.kind === 'damage') return `  ${nm(ev.a)}: ${ab.name}${o} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}${ev.abs ? ` (${ev.abs} abgefangen)` : ''}`;
      if (ab.kind === 'heal') return `  ${nm(ev.a)}: ${ab.name}${o} → ${nm(ev.t)} +${ev.v}`;
      return `  ${nm(ev.a)}: ${ab.name}${o}${ev.t ? ' → ' + nm(ev.t) : ''}`; }
    case 'boss': return ev.hits ? `  ${BOSS.name}: FLAMMENWELLE → ` + ev.hits.map((h) => h.down ? `${nm(h.down)} fällt` : `${nm(h.t)} −${h.v}${crit(h.c)}`).join(', ')
      : `  ${BOSS.name}: ${ev.k === 'schwerer_schlag' ? 'SCHWERER SCHLAG' : 'Angriff'} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}${ev.abs ? ` (${ev.abs} abgefangen)` : ''}`;
    case 'add': return `  ${nm(ev.a)} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}`;
    case 'dot': return `  ${nm(ev.u)} erleidet ${ev.v} (${ev.st === 'burn' ? 'Brand' : 'Blutung'})`;
    case 'hot': return `  ${nm(ev.u)} regeneriert ${ev.v}`;
    case 'down': return `  ✝ ${nm(ev.u)} ist besiegt`;
    default: return '  ' + JSON.stringify(ev);
  }
}
