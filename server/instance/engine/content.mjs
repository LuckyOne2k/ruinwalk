// Testinhalte für die Instanzkampf-Engine (Phase 1). NICHT final: Klassen, Werte und Boss sind Platzhalter zum Prüfen der Mechanik.
// Alle Werte sind ganze Zahlen; Prozentwerte sind ganzzahlige Prozent (100 = 1,0-fach).
export const CONTENT_VERSION = 'c2';

// Fähigkeit: kind = damage | heal | aoe | self | taunt | allies | shield
//   power = Prozent der Angriffskraft, cd = Abklingzeit in Runden, apply = Statuswirkungen auf das Ziel
export const ABILITIES = {
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
  // revive: Wirkt die Fähigkeit auf einen gestorbenen Mitspieler, belebt sie ihn (Plan 1b). Genau zwei Fähigkeiten dürfen das (Heiliger Schild, Kräuterbalsam);
  // hier stehen sie als „Schutzschild“ (Klasse Quell) und „Kräuterbalsam“ (Klasse Druide). Auf Lebende wirken sie wie gewohnt.
  schutz:       { name: 'Schutzschild',    kind: 'shield', power: 0,   cd: 3, apply: [{ st: 'shield', turns: 3, power: 30 }], revive: { pct: 30, apply: [{ st: 'shield', turns: 3, power: 20 }] } },
  balsam:       { name: 'Kräuterbalsam',   kind: 'heal',   power: 160, cd: 2, revive: { pct: 15, apply: [{ st: 'regen', turns: 4, power: 5 }] } },
};
export const CLASSES = {
  waechter: { name: 'Wächter', hp: 230, atk: 14, def: 14, init: 3, abilities: ['hieb', 'spott', 'schildwall'] },
  klinge:   { name: 'Klinge',  hp: 150, atk: 24, def: 6,  init: 8, abilities: ['stoss', 'blutung', 'toedlich'] },
  funke:    { name: 'Funke',   hp: 130, atk: 26, def: 4,  init: 6, abilities: ['funken', 'brandpfeil', 'flaechenfeuer'] },
  druide:   { name: 'Druide', hp: 140, atk: 14, def: 7, init: 5, abilities: ['licht', 'balsam', 'segen'] },
  quell:    { name: 'Quell',   hp: 145, atk: 12, def: 7,  init: 5, abilities: ['licht', 'heilung', 'segen', 'schutz'] },
};
// Boss „Aschenwächter“: drei Phasen nach Lebenspunkten (Schwellen in Prozent der maximalen Lebenspunkte).
export const REVIVE_LIMIT = 2;      // höchstens 2 Wiederbelebungen je zusammenhängendem Kampf (3 Lebensversuche), gemeinsamer Zähler (Plan 1b)
export const BOSS = {
  id: 'boss', name: 'Aschenwächter', hp: 900, atk: 24, def: 8, init: 7,
  phases: [{ from: 100, name: 'Glut' }, { from: 66, name: 'Funkenregen' }, { from: 33, name: 'Raserei' }],
  heavy: { power: 260, every: 3 },            // schwerer Schlag auf das Ziel der Bedrohungsliste, vorher angekündigt
  wave:  { power: 55, every: { 2: 4, 3: 3 } },// Flammenwelle auf alle ab Phase 2, Takt je Phase
  adds:  { count: 2, hp: 90, atk: 10, def: 2, init: 9 },
  enrage_atk_pct: 150,                         // Phase 3: Angriffskraft × 1,5
};
