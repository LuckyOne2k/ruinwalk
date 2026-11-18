# Profilableitung (F5): Kampfprofil serverseitig aus `public.characters`

Stand: 18.11.2026, Branch `nacht/supabase-integration`. Lokal auf PG16 getestet (`profil-ableitung.mjs`, 33 Prüfungen), PG17 über CI.

## Regel
Der Client liefert beim Beitritt **nur noch die Charakter-ID**. Das Kampfprofil `{lv, grundklasse, pfad, tier}` wird in der Datenbank von `rwi.derive_profile(character_id)` aus `public.characters` berechnet. Es gibt keinen Weg, Profilwerte vom Client zu übergeben.

## Was tatsächlich in der Datenbank steht (Untersuchung)
| Quelle | Inhalt | Vertrauenswürdig? |
|---|---|---|
| `characters.character_class` (aus `cls`) | Klasse laut Spielstand | nur Form geprüft |
| `characters.level` (aus `lv`, begrenzt 1..50) | Stufe | nur Form geprüft |
| `characters.character_data` (JSON) | kompletter Client-Spielstand (Ausrüstung, Runen, Pfad) | **Client schreibt frei**, Server prüft nur „ist ein Objekt“ |
| `characters.version`, Besitz (`account_id`), Entitlement | Server | ja |

Klassen- und Berechnungsformeln (CLASSES, PATHS, effClass, Ausrüstungswerte, SETS/SB, Runen) liegen **nur in `index.html`**. Die Instanz-Engine (`engine/content.mjs`) kennt nur `GRUNDKLASSEN` (HP/ATK/DEF/INIT), `PFADE` (INIT-Modifikator, Fähigkeiten) und `UP_LV = [15,30,50]`.

## Ableitung
- Eingabe `cls` (Client-Namen werden abgebildet: `bogen→bogenschuetze`, `scharf→scharfschuetze`, `falle→fallensteller`; `wanderer` ist gültig, aber nicht kampfberechtigt).
- `lv` 1..50 (Instanzzugang ab Level 5, bestehende Regel; darunter `not_eligible`).
- `tier` (0..3) steht im Spielstand und wird **geprüft, nicht berechnet**: tier 1/2/3 verlangt Level ≥ 15/30/50 (`UP_LV`), sonst `profile_invalid:tier_level`.
- Pfad nur bei tier ≥ 1 und nur, wenn er zur Grundklasse gehört; Pfad ohne Stufe → `profile_invalid:path_without_tier`.
- Ergebnis: `{lv, grundklasse, pfad, tier, char_version, src:'derived'}`. Kein stiller Rückfall auf Clientwerte: unvollständige/ungültige Daten → Fehler (Beitritt/Bereit scheitert).

## Konkrete Berechnungen (Engine-Werte, `newFight`)
Stufe fließt **nicht** in die Werte ein, nur in die Pfad-Freischaltung. Werte = Grundklasse + INIT-Modifikator des Pfads.
| lv | Spielstand | Profil | HP | ATK | DEF | INIT |
|---|---|---|---|---|---|---|
| 1 | krieger | krieger, –, tier 0 | 200 | 20 | 12 | 4 |
| 15 | krieger/ritter | krieger, ritter, tier 1 | 200 | 20 | 12 | 3 (4−1) |
| 30 | magier/sturm | magier, sturm, tier 2 | 130 | 28 | 4 | 8 (6+2) |
| 50 | heiler/moench | heiler, moench, tier 3 | 150 | 16 | 7 | 7 (5+2) |
| 20 | bogen/falle (Client-Name), tier 1 | bogenschuetze, fallensteller, tier 1 | 150 | 24 | 6 | 7 (8−1) |

Alle 4 Grundklassen und alle 12 Spezialisierungen sind im Test abgedeckt.

## Lebenszyklus
1. **Beitritt**: Profil wird abgeleitet und als Schnappschuss in `rwi.members.profile` gespeichert (Trigger `profile_snapshot`). Entitlement wird geprüft.
2. **Bereit**: Schnappschuss wird ein letztes Mal neu abgeleitet (Änderungen vor „bereit“ zählen), Entitlement erneut geprüft.
3. **Nach „bereit“**: eingefroren. `rwi.roster` liest ausschließlich den Schnappschuss. Spätere Änderungen an Charakter oder Berechtigung ändern eine laufende Instanz nicht (Test: Änderung während des Kampfs ohne Wirkung).
4. **Neue Instanz**: wird neu abgeleitet (Test: nach Ausrüstungs-/Stufenänderung neues Profil).

## Dokumentierte Lücken (keine Ersatzwerte erfunden)
1. **Ausrüstung, Waffen, Rüstung, Slots, Set-Boni, Runen, Energie, aktuelle HP** sind nicht Teil der Instanz-Engine. Sie in das Profil aufzunehmen würde die beschlossenen Kampfregeln ändern; deshalb fehlt das bewusst. Erst nach Entscheidung (Engine-Formel + serverseitige Berechnung) möglich.
2. **Formal gültige, aber erfundene Spielstände** (z. B. `lv 50`, Pfad `moench`, frei im JSON gesetzt) kann der Server nicht erkennen: es gibt keinen serverseitigen Fortschritt (XP, Quests, Käufe). Getestet als „GRENZE“. Abhilfe nur mit serverseitiger Fortschrittsführung (eigene Entscheidung).
3. Die Clientformeln für Stufen→Werte sind in der Instanz-Engine nicht abgebildet (Stufe wirkt nur über `tier`). Falls Stufenskalierung gewünscht ist: Entscheidung nötig.

## Tests (profil-ableitung.mjs, 33 ok)
Alle 4 Grundklassen (Stufe 0), alle 12 Spezialisierungen × Stufe 1–3 (36 Fälle), Abbildung Client→Engine vollständig, Engine-Kampfwerte = Tabellenwerte für alle 12 Pfade, `wanderer` und Level 4 `not_eligible`, ungültige/unbrauchbare Spielstände abgewiesen (`profile_invalid`), frei mitgegebene Clientwerte ohne Wirkung, Änderung vor Ready (Profil bleibt bis Ready, dann aktualisiert), Änderung nach Ready eingefroren (auch bei erneutem Ready), Kampfstart nutzt eingefrorenes Profil, neue Instanz nach Änderung neu abgeleitet, alte Instanz behält ihr Profil, Charakter nach Eintritt ungültig → Ready abgelehnt, create_character-Weg, Grenzfall „erfundener Spielstand“ dokumentiert.
