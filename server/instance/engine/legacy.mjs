// ALTE Testprofile aus Phase 0/1 (Wächter, Klinge, Funke, Quell). Sie bilden NICHT die Klassenstruktur des Architekturberichts ab (kein Spott, kein „Quell“ im Spiel)
// und existieren ausschließlich, damit die eingefrorene Dungeon-Referenz (tests/golden.mjs) den unveränderten Engine-Kern nachweisen kann.
// Nicht für neue Tests verwenden. Neue Tests nutzen GRUNDKLASSEN/PFADE aus content.mjs.
export const LEGACY_ABILITIES = {
  hieb:         { name: 'Hieb',            kind: 'damage', power: 100, cd: 0 },
  schildwall:   { name: 'Schildwall',      kind: 'self',   power: 0,   cd: 4, apply: [{ st: 'guard', turns: 3, power: 10 }] },
  spott:        { name: 'Spott',           kind: 'taunt',  power: 0,   cd: 3, apply: [{ st: 'taunt', turns: 2, power: 0 }] },
  stoss:        { name: 'Stoß',            kind: 'damage', power: 100, cd: 0 },
  blutung:      { name: 'Blutender Schnitt', kind: 'damage', power: 70, cd: 3, apply: [{ st: 'bleed', turns: 3, power: 6 }] },
  toedlich:     { name: 'Tödlicher Streich', kind: 'damage', power: 230, cd: 5 },
  funken:       { name: 'Funkenschlag',    kind: 'damage', power: 100, cd: 0 },
  brandpfeil:   { name: 'Brandpfeil',      kind: 'damage', power: 60,  cd: 3, apply: [{ st: 'burn', turns: 3, power: 7 }] },
  flaechenfeuer:{ name: 'Flächenfeuer',    kind: 'aoe',    power: 65,  cd: 4 },
  licht:        { name: 'Lichtstoß',       kind: 'damage', power: 90,  cd: 0 },
  heilung:      { name: 'Heilung',         kind: 'heal',   power: 380, cd: 1 },
  segen:        { name: 'Segen der Quelle', kind: 'allies', power: 0,  cd: 5, apply: [{ st: 'regen', turns: 4, power: 6 }] },
  schutz:       { name: 'Schutzschild',    kind: 'shield', power: 0,   cd: 3, apply: [{ st: 'shield', turns: 3, power: 30 }] },
};
export const LEGACY_CLASSES = {
  waechter: { name: 'Wächter', hp: 230, atk: 14, def: 14, init: 3, abilities: ['hieb', 'spott', 'schildwall'] },
  klinge:   { name: 'Klinge',  hp: 150, atk: 24, def: 6,  init: 8, abilities: ['stoss', 'blutung', 'toedlich'] },
  funke:    { name: 'Funke',   hp: 130, atk: 26, def: 4,  init: 6, abilities: ['funken', 'brandpfeil', 'flaechenfeuer'] },
  quell:    { name: 'Quell',   hp: 145, atk: 12, def: 7,  init: 5, abilities: ['licht', 'heilung', 'segen', 'schutz'] },
};
