// Automatische Testspieler: Entscheidungen sind reine Funktionen des sichtbaren Kampfzustands (kein Zufall, kein Uhrzugriff).
import { ABILITIES } from '../engine/content.mjs';
import { LEGACY_CLASSES } from '../engine/legacy.mjs';
const st = (u, id) => u.st.some((s) => s.id === id);
const lowest = (list) => [...list].sort((a, b) => a.hp * b.maxhp - b.hp * a.maxhp || (a.id < b.id ? -1 : 1))[0];
const LEGACY_POLICIES = {
  waechter(S, m) {
    const taunted = S.members.some((x) => x.alive && st(x, 'taunt'));
    if (!m.cd.spott && !taunted) return { ability: 'spott' };
    if (!m.cd.schildwall && S.telegraph === 'schwerer_schlag') return { ability: 'schildwall' };
    return { ability: 'hieb', target: 'boss' };
  },
  klinge(S, m) {
    const add = S.adds.filter((a) => a.alive).sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1))[0];
    if (add) return { ability: m.cd.toedlich ? 'stoss' : 'toedlich', target: add.id };
    if (!m.cd.toedlich && S.monster.hp * 100 > 15 * S.monster.maxhp) return { ability: 'toedlich', target: 'boss' };
    if (!m.cd.blutung && !st(S.monster, 'bleed')) return { ability: 'blutung', target: 'boss' };
    return { ability: 'stoss', target: 'boss' };
  },
  funke(S, m) {
    if (!m.cd.flaechenfeuer && (S.adds.some((a) => a.alive))) return { ability: 'flaechenfeuer' };
    if (!m.cd.brandpfeil && !st(S.monster, 'burn')) return { ability: 'brandpfeil', target: 'boss' };
    return { ability: 'funken', target: 'boss' };
  },
  quell(S, m) {
    const al = S.members.filter((x) => x.alive), low = lowest(al);
    if (!m.cd.heilung && low.hp * 100 < 60 * low.maxhp) return { ability: 'heilung', target: low.id };
    if (!m.cd.segen && S.monster.phase >= 2) return { ability: 'segen' };
    if (!m.cd.schutz && S.telegraph === 'schwerer_schlag') return { ability: 'schutz', target: (al.find((x) => x.cls === 'waechter') || low).id };
    return { ability: 'licht', target: 'boss' };
  },
};

// Regelwerk für Figuren nach der echten Klassenstruktur (Grundklasse/Pfad): Wiederbelebung (optional) > Heilung > Schutz > Gruppenhilfe > Fläche gegen Zusatzgegner > stärkster Angriff
const dmgScore = (ab) => ab.fx.reduce((s, f) => s + (f.t === 'dmg' ? f.hits * f.power * (f.mode === 'all' ? 2 : 1) : 0), 0);
const hasFx = (ab, t, who) => ab.fx.some((f) => f.t === t && (!who || f.who === who));
function generic(S, m, revive) {
  const al = S.members.filter((x) => x.alive), low = lowest(al), boss = S.monster, adds = S.adds.filter((a) => a.alive);
  const ready = m.abilities.filter((id) => !m.cd[id]).map((id) => [id, ABILITIES[id]]);
  if (revive) for (const [id, ab] of ready) if (ab.revive) { const dead = S.members.filter((x) => !x.alive && !x.final).sort((a, c) => (a.id < c.id ? -1 : 1))[0]; if (dead) return { ability: id, target: dead.id, mode: 'revive', death: dead.deaths }; }
  const heals = ready.filter(([, ab]) => (ab.tgt === 'ally' || ab.tgt === 'allyDead') && hasFx(ab, 'heal', 'target')).sort((a, c) => c[1].fx.find((f) => f.t === 'heal').pct - a[1].fx.find((f) => f.t === 'heal').pct);
  if (heals.length && low.hp * 100 < 60 * low.maxhp) return { ability: heals[0][0], target: low.id };
  const selfHeal = ready.find(([, ab]) => ab.tgt === 'self' && hasFx(ab, 'heal', 'self')); if (selfHeal && m.hp * 100 < 50 * m.maxhp) return { ability: selfHeal[0] };
  const tank = [...al].sort((a, c) => c.threat - a.threat || (a.id < c.id ? -1 : 1))[0];
  if (S.telegraph === 'schwerer_schlag') { const sh = ready.find(([, ab]) => ab.tgt === 'ally' && hasFx(ab, 'shield', 'target')); if (sh) return { ability: sh[0], target: tank.id };
    const ss = ready.find(([, ab]) => ab.tgt === 'self' && hasFx(ab, 'shield', 'self')); if (ss) return { ability: ss[0] }; }
  const group = ready.find(([, ab]) => ab.tgt === 'allies' && !ab.fx.some((f) => f.t === 'dmg') && al.some((x) => x.hp * 100 < 75 * x.maxhp || boss.phase >= 2)); if (group) return { ability: group[0] };
  if (adds.length) { const fl = ready.filter(([, ab]) => ab.tgt === 'foes' && dmgScore(ab) > 0).sort((a, c) => dmgScore(c[1]) - dmgScore(a[1]))[0]; if (fl) return { ability: fl[0] }; }
  const atk = ready.filter(([, ab]) => (ab.tgt === 'foe' || ab.tgt === 'foes') && dmgScore(ab) > 0).sort((a, c) => dmgScore(c[1]) - dmgScore(a[1]) || (a[0] < c[0] ? -1 : 1))[0];
  const add = adds.sort((a, c) => a.hp - c.hp || (a.id < c.id ? -1 : 1))[0];
  if (atk) return atk[1].tgt === 'foes' ? { ability: atk[0] } : { ability: atk[0], target: add && dmgScore(atk[1]) < 300 ? add.id : 'boss' };
  return { ability: 'standard', target: 'boss' };
}
export const decide = (S, m) => (LEGACY_CLASSES[m.cls] ? LEGACY_POLICIES[m.cls](S, m) : generic(S, m, false));
// Variante mit Wiederbelebung: Priester/Natur holen Gefallene zurück (Aktionsart und Todesfall legt die Bestätigung fest)
export const decideRevive = (S, m) => (LEGACY_CLASSES[m.cls] ? LEGACY_POLICIES[m.cls](S, m) : generic(S, m, true));
