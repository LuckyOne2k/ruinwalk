// Automatische Testspieler: Entscheidungen sind reine Funktionen des sichtbaren Kampfzustands (kein Zufall, kein Uhrzugriff).
const st = (u, id) => u.st.some((s) => s.id === id);
const lowest = (list) => [...list].sort((a, b) => a.hp * b.maxhp - b.hp * a.maxhp || (a.id < b.id ? -1 : 1))[0];
export const POLICIES = {
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
export const decide = (S, m) => POLICIES[m.cls](S, m);
