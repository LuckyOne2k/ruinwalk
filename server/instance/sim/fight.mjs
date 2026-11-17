// Spielt einen kompletten Instanzkampf im Speicher (ohne Datenbank): Bots entscheiden, die Engine löst Runde für Runde auf.
// offline: { memberId: [Runden] } -> in diesen Runden gibt der Spieler keine Aktion ab (Engine setzt Standardangriff, "automatisch").
import { resolveRound, newFight, DEFAULT_CFG } from '../engine/v1.mjs';
import { decide } from './bots.mjs';
// reviveWindowRounds > 0: Gefallene sind so viele Runden lang für Wiederbelebung freigegeben (Ersatz für das 60-Sekunden-Fenster der Datenbank); left: { memberId: ab Runde }
export function playFight({ players, seed, fightId = 1, cfg = {}, offline = {}, maxRounds = 60, decideFn = decide, state = null, startRound = 1, reviveWindowRounds = 0, left = {}, bossHp = 0, bossAtk = 0 }) {
  let S = state || newFight(players, { ...(bossHp ? { bossHp } : {}), ...(bossAtk ? { bossAtk } : {}) }), rounds = [], outcome = 'continue', reason = null; const diedAt = {};
  for (let r = startRound; r < startRound + maxRounds; r++) {
    const actions = {};
    for (const m of S.members) if (m.alive && !(offline[m.id] || []).includes(r)) actions[m.id] = decideFn(S, m);
    const revive_ok = reviveWindowRounds > 0 ? S.members.filter((m) => !m.alive && !m.final && diedAt[m.id] !== undefined && r - diedAt[m.id] <= reviveWindowRounds).map((m) => m.id) : [];
    const lf = Object.keys(left).filter((k) => left[k] <= r);
    const input = { fight_id: fightId, round_no: r, seed, cfg: { ...DEFAULT_CFG, ...cfg }, state: S, actions, conn: {}, ...(reviveWindowRounds > 0 ? { revive_ok } : {}), ...(lf.length ? { left: lf } : {}) };
    const res = resolveRound(input); for (const m of res.state.members) { if (!m.alive) { if (diedAt[m.id] === undefined) diedAt[m.id] = r; } else delete diedAt[m.id]; } rounds.push({ input, res }); S = res.state; outcome = res.outcome; reason = res.reason;
    if (outcome !== 'continue') break;
  }
  return { rounds, outcome, reason, state: S };
}
// Alte Testprofile (nur Regressionsreferenz, siehe engine/legacy.mjs)
export const TEAM4 = [{ id: 'p1', name: 'Bruno', cls: 'waechter' }, { id: 'p2', name: 'Mira', cls: 'klinge' }, { id: 'p3', name: 'Ilka', cls: 'funke' }, { id: 'p4', name: 'Tom', cls: 'quell' }];
// Testgruppen nach der echten Klassenstruktur (Stufe 50: Grundklasse + Pfad, tier 3)
export const REAL4 = [{ id: 'p1', name: 'Bruno', grundklasse: 'krieger', pfad: 'ritter', tier: 3 }, { id: 'p2', name: 'Mira', grundklasse: 'bogenschuetze', pfad: 'jaeger', tier: 3 },
  { id: 'p3', name: 'Ilka', grundklasse: 'magier', pfad: 'feuer', tier: 3 }, { id: 'p4', name: 'Tom', grundklasse: 'heiler', pfad: 'priester', tier: 3 }];
export const REAL5 = [...REAL4, { id: 'p5', name: 'Nora', grundklasse: 'heiler', pfad: 'natur', tier: 3 }];
export const REAL_BOSS_HP = 2400, REAL_BOSS_ATK = 36;      // Platzhalter: Boss-Werte für Gruppen der echten Struktur (Balance später)

// Lesbare Kampfprotokoll-Zeile (deutsch) für die Ausgabe
import { ABILITIES, LEGACY_ABILITIES, BOSS } from '../engine/content.mjs';
export function describe(S0, ev) {
  const ABILITIES_ = ((S0.members.find((m) => m.id === ev.a) || {}).legacy ? LEGACY_ABILITIES : ABILITIES);
  const nm = (id) => id === 'boss' ? BOSS.name : (S0.members.find((m) => m.id === id) || {}).name || (id.startsWith('add') ? 'Funkenbrut ' + id.slice(3) : id);
  const crit = (c) => (c ? ' (KRITISCH)' : '');
  switch (ev.e) {
    case 'phase': return `*** PHASE ${ev.p}: ${ev.name} ***`;
    case 'spawn': return `    ${ev.n} Funkenbrut erscheint`;
    case 'stun': return `  ${nm(ev.a)} ist betäubt`;
    case 'act': { const ab = ABILITIES_[ev.ab], o = ev.o === 'bestätigt' ? '' : ` [${ev.o}]`;
      if (ab.fx) { const parts = []; for (const h of ev.hits || []) parts.push(h.down ? `${nm(h.down)} fällt` : `${nm(h.t)} −${h.v}${crit(h.c)}${h.abs ? ` (${h.abs} abgefangen)` : ''}`); for (const h of ev.heals || []) parts.push(`${nm(h.t)} +${h.v}`);
        return `  ${nm(ev.a)}: ${ab.name}${o}${ev.t && !(ev.hits || []).length ? ' → ' + nm(ev.t) : ''}${parts.length ? ' → ' + parts.join(', ') : ''}`; }
      if (ev.hits) return `  ${nm(ev.a)}: ${ab.name}${o} → ` + ev.hits.map((h) => h.down ? `${nm(h.down)} fällt` : `${nm(h.t)} −${h.v}${crit(h.c)}`).join(', ');
      if (ab.kind === 'damage') return `  ${nm(ev.a)}: ${ab.name}${o} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}${ev.abs ? ` (${ev.abs} abgefangen)` : ''}`;
      if (ab.kind === 'heal') return `  ${nm(ev.a)}: ${ab.name}${o} → ${nm(ev.t)} +${ev.v}`;
      return `  ${nm(ev.a)}: ${ab.name}${o}${ev.t ? ' → ' + nm(ev.t) : ''}`; }
    case 'revive': return `  ${nm(ev.a)}: ${ABILITIES_[ev.ab].name} → ${nm(ev.t)} wird wiederbelebt (${ev.hp} Leben, Wiederbelebung ${ev.n})`;
    case 'item_revive': return `  ${nm(ev.u)} setzt das Wiederbelebungsitem ein (${ev.hp} Leben, Wiederbelebung ${ev.n})`;
    case 'verfall': return `  ${nm(ev.a)}: ${ABILITIES_[ev.ab].name} verfällt (${ev.why}), Abklingzeit erstattet`;
    case 'left': return `  ${nm(ev.u)} hat die Instanz verlassen`;
    case 'boss': return ev.hits ? `  ${BOSS.name}: FLAMMENWELLE → ` + ev.hits.map((h) => h.down ? `${nm(h.down)} fällt` : `${nm(h.t)} −${h.v}${crit(h.c)}`).join(', ')
      : `  ${BOSS.name}: ${ev.k === 'schwerer_schlag' ? 'SCHWERER SCHLAG' : 'Angriff'} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}${ev.abs ? ` (${ev.abs} abgefangen)` : ''}`;
    case 'add': return `  ${nm(ev.a)} → ${nm(ev.t)} −${ev.v}${crit(ev.c)}`;
    case 'dot': return `  ${nm(ev.u)} erleidet ${ev.v} (${({ burn: 'Brand', bleed: 'Blutung', gift: 'Gift' })[ev.st] || ev.st})`;
    case 'hot': return `  ${nm(ev.u)} regeneriert ${ev.v}`;
    case 'down': return `  ✝ ${nm(ev.u)} ist besiegt`;
    default: return '  ' + JSON.stringify(ev);
  }
}
