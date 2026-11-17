// Inhalte der Instanzkampf-Engine, Stand: Klassenstruktur laut Architekturbericht/Plan (Abschnitt 4).
// STRUKTUR ist verbindlich: 4 Grundklassen (Krieger, Bogenschütze, Magier, Heiler) × je 3 Fähigkeiten, 12 Pfade × je 3 Fähigkeiten (Stufe 15/30/50).
// Es gibt keine weitere Grundklasse und keine hier erfundene Fähigkeit. Die ZAHLEN (Lebenspunkte, Schaden, Abklingzeiten, Prozentwerte) sind Platzhalter für die spätere Balance.
// Ausnahme „standard“: der im Plan beschriebene automatische Standardangriff (Plan, Verbindungsabbruch Punkt 2), keine Klassenfähigkeit.
// Alle Werte sind ganze Zahlen; Prozentwerte sind ganzzahlige Prozent (100 = 1,0-fach).
import { LEGACY_ABILITIES, LEGACY_CLASSES } from './legacy.mjs';
export const CONTENT_VERSION = 'c3';
export const REVIVE_LIMIT = 2;      // höchstens 2 Wiederbelebungen je zusammenhängendem Kampf (3 Lebensversuche), gemeinsamer Zähler für Fähigkeiten und Item (Plan 1b)

// Wirkbausteine (fx): dmg {power, hits, mode: one|all|spread, sure, split, bossBonus, st}, heal {who, pct, st}, shield {who, pct, turns}, st {who, st}, cleanse {who, n}
//   who: target | self | allies | weakest      tgt (Zielart): foe | foes | ally | allyDead | self | allies
//   st-Einträge: {id, turns, power[, ifHas]}.  ifHas: Wirkung nur, wenn das Ziel diesen Status trägt (Nachtschuss).
export const GRUNDKLASSEN = {
  krieger:       { name: 'Krieger',       hp: 200, atk: 20, def: 12, init: 4 },
  bogenschuetze: { name: 'Bogenschütze',  hp: 150, atk: 24, def: 6,  init: 8 },
  magier:        { name: 'Magier',        hp: 130, atk: 28, def: 4,  init: 6 },
  heiler:        { name: 'Heiler',        hp: 150, atk: 16, def: 7,  init: 5 },
};
export const PFADE = {
  ritter:        { grundklasse: 'krieger',       name: 'Ritter',        init: -1, abilities: ['bollwerk', 'heilige_hand', 'sonnenzorn'] },
  berserker:     { grundklasse: 'krieger',       name: 'Berserker',     init: 1,  abilities: ['raserei', 'kriegsschrei', 'erdbeben'] },
  duellant:      { grundklasse: 'krieger',       name: 'Duellant',      init: 2,  abilities: ['doppelstich', 'klingenwirbel', 'schattenschnitt'] },
  scharfschuetze:{ grundklasse: 'bogenschuetze', name: 'Scharfschütze', init: 0,  abilities: ['durchschlag', 'todesschuss', 'falkenpfeil'] },
  jaeger:        { grundklasse: 'bogenschuetze', name: 'Jäger',         init: 1,  abilities: ['wolf_fass', 'rudelangriff', 'ruf_der_wildnis'] },
  fallensteller: { grundklasse: 'bogenschuetze', name: 'Fallensteller', init: -1, abilities: ['baerenfalle', 'schattenfalle', 'nachtschuss'] },
  feuer:         { grundklasse: 'magier',        name: 'Feuer',         init: 0,  abilities: ['flammenwelle', 'inferno', 'phoenixfeuer'] },
  frost:         { grundklasse: 'magier',        name: 'Frost',         init: -1, abilities: ['eissplitter', 'eiskerker', 'ewiger_winter'] },
  sturm:         { grundklasse: 'magier',        name: 'Sturm',         init: 2,  abilities: ['kettenblitz', 'gewittersturm', 'himmelsblitz'] },
  priester:      { grundklasse: 'heiler',        name: 'Priester',      init: 0,  abilities: ['gebet', 'heiliger_schild', 'himmelslicht'] },
  moench:        { grundklasse: 'heiler',        name: 'Mönch',         init: 2,  abilities: ['palmenschlag', 'tausend_faeuste', 'erleuchtung'] },
  natur:         { grundklasse: 'heiler',        name: 'Natur',         init: -1, abilities: ['kraeuterbalsam', 'dornenranken', 'segen_des_weltenbaums'] },
};
export const UP_LV = [15, 30, 50];                                   // Pfad-Freischaltung (tier 1/2/3)
export const GRUND_ABILITIES = { krieger: ['wuchtschlag', 'schildwall', 'kampfgeist'], bogenschuetze: ['zielschuss', 'weitschuss', 'pfeilhagel'], magier: ['feuerball', 'frostnova', 'blitzschlag'], heiler: ['heilendes_licht', 'schutzsegen', 'strahlendes_urteil'] };
const D = (power, o = {}) => ({ t: 'dmg', power, hits: 1, mode: 'one', ...o });
const A = (name, tgt, cd, fx, o = {}) => ({ name, tgt, cd, fx, ...o });
const SLOW = { id: 'slow', turns: 2, power: 0 }, RUEST = { id: 'ruest', turns: 3, power: 10 }, BLEED = { id: 'bleed', turns: 2, power: 8 }, BURN = { id: 'burn', turns: 2, power: 7 };
const STUN = { id: 'stun', turns: 2, power: 0 };
export const REAL_ABILITIES = {
  standard:        A('Standardangriff', 'foe', 0, [D(100)]),
  // Grundklassen (Plan 4.2)
  wuchtschlag:     A('Wuchtschlag', 'foe', 1, [D(220)]),
  schildwall:      A('Schildwall', 'self', 3, [{ t: 'shield', who: 'self', pct: 20, turns: 2 }]),
  kampfgeist:      A('Kampfgeist', 'self', 3, [{ t: 'heal', who: 'self', pct: 25 }]),
  zielschuss:      A('Zielschuss', 'foe', 1, [D(150, { sure: true })]),
  weitschuss:      A('Weitschuss', 'foe', 0, [D(130)], { mark: 'fernkampf' }),
  pfeilhagel:      A('Pfeilhagel', 'foes', 3, [D(70, { hits: 3, mode: 'spread' })]),
  feuerball:       A('Feuerball', 'foe', 1, [D(200)]),
  frostnova:       A('Frostnova', 'foes', 3, [D(60, { mode: 'all', st: [SLOW] })]),
  blitzschlag:     A('Blitzschlag', 'foe', 2, [D(280)]),
  heilendes_licht: A('Heilendes Licht', 'ally', 1, [{ t: 'heal', who: 'target', pct: 25 }]),
  schutzsegen:     A('Schutzsegen', 'ally', 3, [{ t: 'shield', who: 'target', pct: 20, turns: 2 }]),
  strahlendes_urteil: A('Strahlendes Urteil', 'foe', 1, [D(200), { t: 'heal', who: 'weakest', pct: 12 }]),
  // Krieger-Pfade (4.3)
  bollwerk:        A('Bollwerk', 'ally', 3, [{ t: 'shield', who: 'target', pct: 30, turns: 2 }]),
  heilige_hand:    A('Heilige Hand', 'ally', 4, [{ t: 'heal', who: 'target', pct: 40 }]),
  sonnenzorn:      A('Sonnenzorn', 'foe', 5, [D(320), { t: 'heal', who: 'weakest', pct: 15 }]),
  raserei:         A('Raserei', 'foe', 2, [D(280, { st: [BLEED] })]),
  kriegsschrei:    A('Kriegsschrei', 'foe', 3, [D(220), { t: 'st', who: 'self', st: { id: 'buff', turns: 2, power: 20 } }]),
  erdbeben:        A('Erdbeben', 'foe', 5, [D(400, { st: [STUN] })]),
  doppelstich:     A('Doppelstich', 'foe', 2, [D(120, { hits: 2, st: [RUEST] })]),
  klingenwirbel:   A('Klingenwirbel', 'foe', 3, [D(80, { hits: 4 })]),
  schattenschnitt: A('Schattenschnitt', 'foe', 5, [D(100, { hits: 3, sure: true })]),
  // Bogenschützen-Pfade (4.4)
  durchschlag:     A('Durchschlag', 'foe', 2, [D(240, { st: [RUEST] })]),
  todesschuss:     A('Todesschuss', 'foe', 3, [D(220, { sure: true, bossBonus: 25 })], { mark: 'boss' }),
  falkenpfeil:     A('Falkenpfeil', 'foe', 5, [D(350, { sure: true, bossBonus: 25 })], { mark: 'boss' }),
  wolf_fass:       A('Wolf, fass!', 'foe', 2, [D(120, { hits: 3, st: [BLEED] })]),
  rudelangriff:    A('Rudelangriff', 'foe', 3, [D(90, { hits: 4, st: [SLOW] })]),
  ruf_der_wildnis: A('Ruf der Wildnis', 'foes', 5, [D(100, { hits: 5, mode: 'spread', st: [BLEED] })]),
  baerenfalle:     A('Bärenfalle', 'foe', 3, [D(150, { st: [STUN] })]),
  schattenfalle:   A('Schattenfalle', 'foes', 4, [D(120, { mode: 'all', st: [SLOW] })]),
  nachtschuss:     A('Nachtschuss', 'foe', 5, [D(300, { sure: true, st: [{ ...STUN, ifHas: 'slow' }] })]),
  // Magier-Pfade (4.5)
  flammenwelle:    A('Flammenwelle', 'foe', 2, [D(260, { st: [BURN] })]),
  inferno:         A('Inferno', 'foes', 4, [D(320, { mode: 'all', split: true, st: [BURN] })]),
  phoenixfeuer:    A('Phönixfeuer', 'foe', 5, [D(340), { t: 'st', who: 'self', st: { id: 'regen', turns: 3, power: 8 } }]),
  eissplitter:     A('Eissplitter', 'foe', 1, [D(150, { st: [SLOW] })]),
  eiskerker:       A('Eiskerker', 'foe', 5, [D(140, { st: [STUN] })]),
  ewiger_winter:   A('Ewiger Winter', 'foes', 5, [D(260, { mode: 'all', st: [{ ...SLOW }, { ...SLOW }] })]),
  kettenblitz:     A('Kettenblitz', 'foes', 2, [D(90, { hits: 3, mode: 'spread' })]),
  gewittersturm:   A('Gewittersturm', 'foes', 3, [D(90, { hits: 5, mode: 'spread' })]),
  himmelsblitz:    A('Himmelsblitz', 'foe', 5, [D(420)]),
  // Heiler-Pfade (4.6)
  gebet:           A('Gebet', 'ally', 2, [{ t: 'heal', who: 'target', pct: 30 }, { t: 'cleanse', who: 'target', n: 2 }]),
  heiliger_schild: A('Heiliger Schild', 'allyDead', 4, [{ t: 'heal', who: 'target', pct: 12 }, { t: 'shield', who: 'target', pct: 20, turns: 2 }],
                     { revive: { pct: 30, fx: [{ t: 'shield', who: 'target', pct: 20, turns: 2 }] } }),      // belebt auf einen Gestorbenen gewirkt (Plan 1b); auf Lebende: Heilung plus Schild
  himmelslicht:    A('Himmelslicht', 'allies', 5, [{ t: 'heal', who: 'allies', pct: 20 }, { t: 'shield', who: 'allies', pct: 10, turns: 2 }, { t: 'cleanse', who: 'allies', n: 1 }]),
  palmenschlag:    A('Palmenschlag', 'foe', 1, [D(220), { t: 'heal', who: 'self', pct: 8 }]),
  tausend_faeuste: A('Tausend Fäuste', 'foe', 3, [D(80, { hits: 5 }), { t: 'heal', who: 'self', pct: 10 }]),
  erleuchtung:     A('Erleuchtung', 'foe', 5, [D(340), { t: 'st', who: 'allies', st: { id: 'buff', turns: 2, power: 20 } }, { t: 'heal', who: 'self', pct: 10 }]),
  kraeuterbalsam:  A('Kräuterbalsam', 'allyDead', 3, [{ t: 'heal', who: 'target', pct: 12 }, { t: 'st', who: 'target', st: { id: 'regen', turns: 3, power: 6 } }],
                     { revive: { pct: 15, fx: [{ t: 'st', who: 'target', st: { id: 'regen', turns: 3, power: 6 } }] } }),
  dornenranken:    A('Dornenranken', 'foe', 3, [D(180, { st: [{ id: 'gift', turns: 3, power: 6 }] })]),
  segen_des_weltenbaums: A('Segen des Weltenbaums', 'allies', 5, [{ t: 'st', who: 'allies', st: { id: 'regen', turns: 3, power: 6 } }, { t: 'shield', who: 'allies', pct: 15, turns: 2 }]),
};
export const ABILITIES = REAL_ABILITIES;                       // Alt-IDs (z. B. „schildwall“ des Altprofils) kollidieren bewusst nicht: Altprofile lösen über LEGACY_ABILITIES auf
export { LEGACY_ABILITIES };
export const REVIVE_ABILITIES = Object.keys(REAL_ABILITIES).filter((k) => REAL_ABILITIES[k].revive);   // genau zwei: heiliger_schild, kraeuterbalsam

// Spielfigur laut Struktur: { grundklasse, pfad (oder null), tier 0–3 } -> Fähigkeitenliste (Grundklasse 3 + Pfad bis tier)
export function abilitiesOf(grundklasse, pfad, tier) {
  const base = GRUND_ABILITIES[grundklasse]; if (!base) throw new Error('unbekannte Grundklasse ' + grundklasse);
  let list = [...base];
  if (pfad) { const p = PFADE[pfad]; if (!p || p.grundklasse !== grundklasse) throw new Error('Pfad ' + pfad + ' gehört nicht zu ' + grundklasse); list = list.concat(p.abilities.slice(0, tier)); }
  else if (tier > 0) throw new Error('tier > 0 braucht einen Pfad');
  return list;
}
export { LEGACY_CLASSES };
// Boss „Aschenwächter“: drei Phasen nach Lebenspunkten (Schwellen in Prozent der maximalen Lebenspunkte). Platzhalter.
export const BOSS = {
  id: 'boss', name: 'Aschenwächter', hp: 900, atk: 24, def: 8, init: 7,
  phases: [{ from: 100, name: 'Glut' }, { from: 66, name: 'Funkenregen' }, { from: 33, name: 'Raserei' }],
  heavy: { power: 260, every: 3 },            // schwerer Schlag auf das Ziel der Bedrohungsliste, vorher angekündigt
  wave:  { power: 55, every: { 2: 4, 3: 3 } },// Flammenwelle auf alle ab Phase 2, Takt je Phase
  adds:  { count: 2, hp: 90, atk: 10, def: 2, init: 9 },
  enrage_atk_pct: 150,                         // Phase 3: Angriffskraft × 1,5
};
