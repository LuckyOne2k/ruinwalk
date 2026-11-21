# Bestandsaufnahme: Ausrüstung, Kampfberechnung und spätere Aufnahme ins Instanzprofil

Stand: 18.11.2026. Reine Analyse; keine Formel erfunden, keine Kampfmechanik geändert. Quellen: `index.html` (Zeilen laut Stand `main`/`b53647d`), `server/instance/engine/{content,v1}.mjs`, `docs/PROFILABLEITUNG.md`.

## 1. Ausrüstungssystem im Client (`index.html`)

### 1.1 Slots (Z. 421)
Zehn Slots: `waffe`, `nebenhand`, `kopf`, `brust`, `beine`, `haende`, `fuesse`, `umhang`, `ring`, `amulett`. Belegung `S.eq[slot] = uid` des Gegenstands in `S.gear`.

### 1.2 Gegenstandsmodell
`S.gear[] = { u, b, q, p }`: laufende Nummer, **Basis-ID** `b` (Text), Qualität `q` (0–4), Verbesserungsstufe `p` (0–10). Die Basiswerte stehen **nicht** im Spielstand, sondern werden in `getBase(b)` (Z. 477) aus der ID berechnet. Basis-ID-Familien:
- `a|<slot>|<typ>|<stufe>` Rüstung (Typ schwer/mittel/leicht; Stufe 1–3)
- `w|<waffe>|<stufe>` Waffe, `o|<nebenhand>|<stufe>` Nebenhand
- `u|t` Umhang, `r|t` Ring, `m|t` Amulett
- `s|<setId>|<0–7>` Setteil (0–5 Rüstung/Umhang, 6 Waffe, 7 Nebenhand)
- `q|<pfad>|<stufe>` Pfadwaffe (feste Qualität)

Gegenstandsstufe `t` (1–3) → `GT = [Level 1/10/25, Skalierung 1/2.2/4]`; Qualität `QM = [1, 1.25, 1.6, 2, 2.6]`; Verbesserung `+10 % je p`.

### 1.3 Wert eines Gegenstands (`gStats`, Z. 506)
`wert = Basiswert × QM[q] × (1 + 0.1·p)`, gerundet; `crit` auf 3 Nachkommastellen. Es gibt genau **vier** Gegenstandswerte: `def`, `atk`, `hp`, `crit`.
- Rüstung: `def = max(1, round(a.d · GT.s · typfaktor))`, typfaktor schwer 1.4 / mittel 1 / leicht 0.6; schwer zusätzlich `hp`, mittel `crit +1 %·t`, leicht `atk`.
- Waffen: `atk = round(3·s)` bzw. Waffenart-Tabelle `WX` (z. B. Zweihandaxt 4.2, Hammer 4.4, Rapier 3 + crit); Bogen `crit`, Heilstab `hp`.
- Nebenhand, Umhang, Ring, Amulett: je eigene Tabellen (z. B. Schild `def`+`hp`, Köcher `crit`+`atk`, Amulett `hp`).

### 1.4 Runen (Schmiederunen)
`rune0`–`rune4` sind **Verbrauchsgegenstände im Inventar**, die nur die **Erfolgschance** der Verbesserung erhöhen (`RUNEB = +5/10/15/20/25 %`). Sie verleihen keine Kampfwerte. Wirkung steckt ausschließlich in `p` des Gegenstands. Chancen `UPCH` je Stufe `[1,1,1,.9,.75,.6,.45,.3,.15,.05]`; Erfolg per `Math.random()` im Client. (Die Instanzauftrags-Formulierung „Runen“ ist damit **keine** Werteigenschaft, sondern ein Zufallsmodifikator beim Aufwerten.)

### 1.5 Set-Boni (`SETS` ab Z. 460, `SB` Z. 511)
Sets: Boss-Sets (10) und Pfad-Sets (12 Pfade × 3 Stufen). Bonusstufen je Set: 2/4/6 Rüstungsteile (`b2/b4/b6`) und `bw` (Waffe + Nebenhand desselben Sets). Summiert in `SB()`.
Verwendete Bonusschlüssel (24): `hpb, def, crit, range, dm, enreg, enCost, healHit, healMul, critHeal, lifesteal, steinhaut, dmgPanzer, dmgBoss, dmgFar, critDmg, first, miss, rescue, dbl, poisonShot, poisonRes, burn, skillDm`.

### 1.6 Klassen- und Pfadwerte (`CLASSES`, `PATHS`, `effClass`)
Je Klasse: `cd, range, dmg, en, crit, hpb, def, heal` (z. B. Krieger `hpb .2`, `def 2`, `dmg 1.3`). Pfadstufen (`PATHS[p].st[t].m`) überschreiben/addieren `dm, crit, range, hpb, def, heal, hits, enreg` und schalten Fertigkeiten frei (`sk`, mit Energiekosten, Abklingzeit, Multiplikator, Treffer, Heilung, Schild, Betäubung).

### 1.7 Temporäre Effekte (nicht dauerhaft, nicht im Profil sinnvoll)
Schild `S.shield` (Treffer), Betäubung `S.stun`/`myStun`, Gift `psn`, Erschöpfung `S.exh` (3 min), Energie `S.en`, aktueller Lebenswert `S.hp`, Fertigkeits-Abklingzeiten `S.scd`, Heiltrank (`usePotion`), Zähler `hitTaken/atkCnt/psCnt/rescueUsed`.

### 1.8 Berechnung der Kampfwerte im Client (Z. 945–950)
- `maxHP = round((100 + 10·(lv−1)) · (1 + hpb_klasse + hpb_set)) + Σ Gegenstands-hp`
- `defense = S.def + def_klasse + Σ Gegenstands-def + Set.def`
- `atk = 10 + 2·lv + Σ Gegenstands-atk`
- `critCh = min(0.75, crit_klasse + Σ Gegenstands-crit + Set.crit)`
- Schaden je Treffer (`strike`): `max(1, round((atk + rnd(0..8)) · mult · fm))`, `fm = 1 + dm + …Set-Boni`, Krit ×`(2 + critDmg)`.
- Monster auf Spieler (`monsterHit`): `max(1, ceil(roh·0.25), roh − defense)` (Rüstung senkt höchstens 75 %), danach Schild/Steinhaut/Fähigkeiten.

## 2. Instanz-Engine (`server/instance/engine`)
Einheit: `{hp, maxhp, atk, def, init}` aus `GRUNDKLASSEN` (`krieger 200/20/12/4`, `bogenschuetze 150/24/6/8`, `magier 130/28/4/6`, `heiler 150/16/7/5`) plus `PFADE[pfad].init`. Fähigkeiten und Effekte kommen aus `content.mjs` (`abilitiesOf(grundklasse, pfad, tier)`). Schaden: `floor(atk · power/100) − floor(def/2)` (Mindestwerte, Streuung `spread`, Krit global `crit_pct 15`/`crit_mult 200` aus `cfg`).
**Es gibt keine** Eingänge für Gegenstände, Qualität, Verbesserung, Set-Boni, Krit je Einheit, Reichweite, Energie oder aktuelle HP-Skalierung nach Level. Level wirkt nur über `tier` (Fähigkeiten-Freischaltung).

## 3. Zuordnung: wie Werte später ins Instanzprofil fließen könnten
| Client-Wert | Quelle im Client | Auf dem Server vorhanden? | Engine-Eingang | Zustand |
|---|---|---|---|---|
| Grundklasse, Pfad, Stufe, Level | `S.cls/path/tier/lv` | ja, aus `character_data` (nur Client-Wahrheit) | `grundklasse, pfad, tier` | **umgesetzt (F5)** |
| Gegenstands-`def` | `gs('def')` | nur als IDs `b,q,p` im JSON, Formel nur im Client | `def` | Formel serverseitig nachzubauen, **Skalierung nicht festgelegt** |
| Gegenstands-`atk` | `gs('atk')` | wie oben | `atk` | wie oben |
| Gegenstands-`hp`, Klassen-/Set-`hpb`, Level-HP | `maxHP()` | wie oben | `hp/maxhp` | **Skalenkonflikt**: Client-HP ≈ 100–600, Engine-HP fix 130–200 |
| Krit (Klasse + Gegenstand + Set) | `critCh()` | wie oben | nur global `crit_pct` | **kein Einheiten-Krit in der Engine** |
| Set-Bonus `hpb/def/crit` | `SB()` | Set-ID in `b`, Boni nur im Client | `hp/def` indirekt | Zuordnung nötig, Skala offen |
| Set-Boni `range, dm, enreg, enCost, healHit, healMul, critHeal, lifesteal, steinhaut, dmgPanzer, dmgBoss, dmgFar, critDmg, first, miss, rescue, dbl, poisonShot, poisonRes, burn, skillDm` | `SB()` | nur Client | **kein Gegenstück** | Engine müsste neue Regeln erhalten → ändert Instanzkampfregeln |
| Runen | `inv.rune0–4` | nur Inventar | **kein Wert** (nur Aufwertungschance) | **gehört nicht ins Profil**; Wirkung liegt in `p` |
| Verbesserung `p`, Qualität `q` | `S.gear` | nur Client-Zufall | über Gegenstandswert | nicht überprüfbar |
| Schild, Gift, Betäubung, Erschöpfung, Energie, aktuelles `S.hp` | Laufzeit | nein | – | **nie ins Profil** (Laufzeitzustand) |

Empfohlene Reihenfolge, wenn entschieden wird (jeweils eigene Freigabe, keine Formeln jetzt festgelegt):
1. **Skalenentscheidung** (Pflicht, vorab): Wie werden Client-Werte (HP ≈ 100–600) auf Engine-Werte (HP 130–200) abgebildet, oder werden Engine-Grundwerte neu festgelegt? Ohne diese Entscheidung ist jede Zahl erfunden.
2. **Serverseitige Gegenstandsberechnung**: `getBase`/`gStats` als Serverfunktion aus `b,q,p` (reine Tabellenberechnung, deterministisch, testbar gegen den Client mit demselben Eingabesatz).
3. **Vertrauensgrundlage**: Gegenstände aus einem serverseitigen Beleg (Ledger, siehe `docs/CHARAKTERFORTSCHRITT_SERVERARCHITEKTUR.md`) statt aus freiem JSON.
4. **Nur die Werte mit Engine-Entsprechung** zuerst: `def`, `atk`, `hp` (und Krit nur, wenn die Engine Einheiten-Krit bekommt).
5. **Set-Boni mit Gegenstück** (`hpb/def`) vor den 20 übrigen Schlüsseln, die neue Engine-Regeln verlangen.

## 4. Was heute fehlt und was nicht vertrauenswürdig ist
**Fehlt in der Engine:** Gegenstandswerte (def/atk/hp/crit), Einheiten-Krit, Qualität/Verbesserung, 20+ Set-Bonusarten, Reichweite, Energie, Level-Skalierung der HP.
**Fehlt auf dem Server:** jede serverseitige Berechnung von `getBase`/`gStats`/`SB`/`maxHP`/`atk`; ein Gegenstands-/Inventarbeleg; eine Prüfung, dass `b` ein existierender, im Spiel erlangbarer Gegenstand ist (Prüfung nur in `sanitize`, Client).
**Nicht vertrauenswürdig (Client schreibt frei):** `S.gear` (inkl. `q`, `p`), `S.eq`, `S.inv` (Runen, Material), `S.cu` (Münzen), `S.def`, `S.stats` (Zähler für Pfadfreischaltung, `walk` per GPS), `S.lv`, `S.path`, `S.tier`, `S.cls`. Würfe (Drops, Aufwertung) laufen mit `Math.random()` im Browser.
**Folge:** Ein Spieler kann sich heute jeden Gegenstand mit `q=4`, `p=10` in den Spielstand schreiben. Würde man Ausrüstung ungeprüft ins Instanzprofil übernehmen, wäre das direkt ausnutzbar. Deshalb **darf Ausrüstung erst nach** Schritt 1–3 oben ins Profil.

## 5. Offene Entscheidungen
1. Skalenentscheidung Client↔Engine (Schritt 1).
2. Soll die Engine Einheiten-Krit und welche Set-Boni erhalten (Kampfregeln!)?
3. Beleg für Gegenstände (Ledger) vor oder zusammen mit der Übernahme?
4. Bleiben Runen im Einzelspiel (Aufwertungschance) und sind im Instanzprofil ohne Bedeutung? (Empfehlung: ja.)
