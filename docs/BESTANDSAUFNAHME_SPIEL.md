# Ruin Walk – Bestandsaufnahme Spiel (aus dem Code)

Stand: 15.11.2026 · Commit `4935ac8` · Grundlage: `index.html` (3.024 Zeilen) plus `sprites*.js`. Nur gelesen, nichts geändert. Zeilennummern beziehen sich auf `index.html`.

Legende: ✅ vollständig vorhanden · 🟡 teilweise / Platzhalter · ❌ fehlt.

## 1. Spielsysteme im Überblick

### Weltkarte und GPS-Erkundung
- ✅ Leaflet-Karte mit OSM-Kacheln (Z. 1114–1115), GPS-Verfolgung (`startGPS`, `onPos`, `setPos`, `gpsWatch`), Testmodus ohne GPS (Tippen auf die Karte, Z. 1871), Laufstrecke nur bei echtem GPS (`countWalk`, Z. 1134).
- ✅ Deterministische Welt je Zelle (165 m): `cellEnts` (Z. 1090) erzeugt 3–5 Ressourcen, ~70 % ein Monster, 12 % selten, 4 % Elite, 1 % Boss und einen Händler je ~6×6 Zellen. Respawn über `alive`/`S.cd` (8–15 min Ressourcen, 15 min – 12 h Monster).
- ✅ Lebensräume aus echten OSM-Daten (`habClass`, `buildChunk`, `habAt`, Overpass, Cache `ruinwalk_hab`) mit Ersatzgenerator `fbHab`. Fünf Lebensräume: Wald, Wiese & Feld, Sumpf & Wasser, Fels & Berg, Ruinen & Siedlung (`HAB`, Z. 315).
- 🟡 Lebensräume wirken nur auf **Monster** (`pickMob`). Ressourcen sind überall gleich verteilt (`pickType` ohne Lebensraum, Z. 982). Es gibt keine Anzeige, welcher Lebensraum an deinem Standort liegt, außer der Monsterkarte.
- ❌ Keine Orte/Landmarken, keine Erkundungsanzeige (besuchte Gebiete, Entdeckt-Prozent), keine Wegpunkte, keine Tageszeit/Wetter-Wirkung (nur Zähler „Nacht-Kills“, Z. 1500).

### Gebiete
- 🟡 „Gebiet“ = 12×12 Zellen (`REGION`, Z. 406), pro Gebiet genau ein Gebietsboss (`areaEnts`, Z. 1074), Typ nach Lebensraum an einer Zufallszelle. Ein Gebiet hat **keinen Namen, keine Stufe, keinen Fortschritt, keine eigene Belohnung**. `AREA_DIST` ist nur die Sichtweite (4 km, Z. 1317).

### Gegner, Kämpfe, Bosse
- ✅ 50 Monster (`MOBS`, Z. 329): 20 normal, 12 selten, 8 Elite, 5 Boss, 5 Gebietsboss; 11 Fähigkeiten (`ABIL`, Z. 316–328), alle in `monsterHit` / `roamTick` verdrahtet (Gift, Brüllen, Schwarm, Wut, Panzer, Heilung, Fernangriff, Diebstahl, Scheu, Dornen, Aussaugen).
- ✅ Kampf: Reichweite, Energie, Abklingzeiten, Krit, Fähigkeiten, Aggro/Verfolgung/Leine (`strike` Z. 1499, `roamTick` Z. 1210, `monsterHit` Z. 1279), Ohnmacht mit Strafe und Erschöpfung (`faint` Z. 1567), Anfängerschutz bis Stufe 5.
- ✅ Gebietsbosse: Phasen, Telegraphen, Abwehr/Unterbrechen, Sonderphasen (Sprösslinge, harte Haut, Flugphase, Gift-Stapel) für alle 5 (`BFX`, `bossTick`, `reactDo`, Z. 1416–1498).
- 🟡 Die 5 normalen Bosse (Waldtyrann, Moorkönigin, Mooswächter-Schildkröte, Vampirfürst, Felswurm) haben nur Werte und eine Fähigkeit, keine eigenen Mechaniken.
- 🟡 Schwierigkeit ist **nicht** an die Welt gekoppelt: Spawn-Tabellen sind überall gleich, `rec` (empfohlene Stufe) wird nur als Warnhinweis angezeigt (Z. 1360). Ein Stufe-1-Spieler kann an jeder Stelle auf Elite/Boss treffen; ein Stufe-50-Spieler findet überall dieselben Gegner.
- 🟡 Monsterschaden ist fest (z. B. normal 1–9, Elite 10–23, Boss 14–34, Gebietsboss 70–140), Spielerleben wächst mit der Stufe (`maxHP` = 100 + 10 pro Stufe, Z. 940). Ab etwa Stufe 20 sind normale Monster dadurch ohne Gefahr.
- 🟡 `othersInFight()` liefert immer 0 (Z. 1566): Platzhalter für Mehrspieler-Kämpfe.

### Klassen, Level, Fähigkeiten
- ✅ Wanderer (Stufe 1–4) → Wahl einer von 4 Grundklassen ab Stufe 5 (`CLASS_LV`, `CLASSES`, Z. 688); 12 Pfade × 3 Stufen (15/30/50, `PATHS` Z. 722, `UP_LV`), je neue Fähigkeit; verborgene Stufe 3 mit 12 geheimen Bedingungen (`SECRET`, Z. 785); Klassenquests (`UPQ`, Z. 801); Entwicklungsbildschirm.
- ✅ Level 1–50 (`LV_CAP`), Erfahrung = Stufe × 40 je Stufe (insgesamt 49.000 XP bis zur Höchststufe, `addXP` Z. 949).
- 🟡 Fähigkeiten sind fest je Klasse/Pfad (3 + 1 je Stufe); keine Verbesserung, keine Auswahl, keine Fähigkeiten-Synergien. Wanderer hat 2 Fähigkeiten.

### Attribute und Charakterentwicklung
- 🟡 Es gibt **keine Attribute und keine Talentpunkte**. Werte folgen nur aus Stufe, Klasse/Pfad, Ausrüstung und Set-Boni (`atk`, `maxHP`, `defense`, `critCh`, `SB`, Z. 507/940–943). Charakterbildschirm zeigt Level, Leben, Angriff, Verteidigung, Klasse, Fähigkeiten, Lebensfertigkeiten.
- 🟡 Lebensfertigkeiten (`SKILLNAME`: Holzfällen, Bergbau, Sammeln): nur Chance auf +1 Menge (max. 50 %, Z. 1405). Keine Freischaltungen, keine Boni darüber hinaus.

### Inventar, Ausrüstung, Gegenstände
- ✅ 10 Slots, 5 Qualitätsstufen, Stufen I–III (Level 1/10/25, `GT`), klassenbezogene Waffen/Nebenhand/Rüstungsarten (`CW`, `ARMT`), 10 Boss-Sets (Level 25/45, Boni bei 2/4/6 Teilen + Waffenset) und 36 Pfad-Sets (Level 15/30/50), Verbesserung bis +10 mit Runen (`UPCH`, `UPFEE`), Verkauf/Preise (`gVal`), Item-Popup.
- ✅ 9 Rezepte für Werkzeug/Trank/Runen plus Ausrüstung Stufe I–III herstellbar (`RECIPES`, `GR`, `craftGear`, Z. 408/592–623). 24 Materialien, 5 Runenstufen, 3 Werkzeug-/Spezialgegenstände (`ITEMS`, Z. 293).
- 🟡 Nur **ein** Verbrauchsgegenstand (Heiltrank). Keine Buffs, keine Nahrung, keine Alchemie, keine Schriftrollen. Runen: nur Stufe 0–1 herstellbar, 2–4 nur als Drop.
- 🟡 Sets sind nicht herstellbar, nur Drops (`rollSet`, `rollPathSet`, Z. 529–540). Material-Veredelung gibt es nicht.
- 🟡 Händler (`shopInfo`, Z. 677): Heiltrank + 3 Pool-Items + 2 Stufe-I-Ausrüstungsteile, kein Sortimentswechsel nach Fortschritt, nur Verkauf von Material/Ausrüstung.

### Ressourcen, Sammeln, Crafting
- ✅ 6 Ressourcentypen (`NODES`, Z. 307), Werkzeuge mit Haltbarkeit (Axt, Spitzhacke), Respawnzeiten, Statistik, Reparatur.
- 🟡 Nur 3 Sammelberufe; keine Lebensraum-Ressourcen (z. B. Sumpfpflanzen, Erze nur im Fels), kein Angeln, kein Verfeinern.

### Quests und Belohnungen
- 🟡 Nur **4 Quests** (`QUESTS`, Z. 1672: Erste Schritte, Holzfäller, Jäger, Bergmann), linear, Belohnung abholen (`claimQuest`). Danach: „Keine offenen Quests“. Klassenquests (`UPQ`) sind getrennt.
- ❌ Keine Questketten, keine Tages-/Wochenaufgaben, keine Erkundungs-/Boss-/Gebietsquests, keine Titel/Erfolge, keine Geschichte/Weltbeschreibung.

### Fortschritt und langfristige Ziele
- 🟡 Vorhanden: Stufen bis 50, Pfadentwicklung, Sets/+10, Gebietsbosse (Respawn 12 h). Nach Stufe 50 gibt es nur Ausrüstungsjagd. Keine Dungeons (Dungeon-Sets „ab 50“ sind geplant, kein Dungeon-Code), keine Ranglisten, keine Saisons.

### Benutzeroberfläche und mobile Bedienung
- ✅ Kampf-Layout „Daumenzone“, Fähigkeiten im Bogen, Abwehr/Unterbrechen/Trank-Knöpfe, Status-Icons, Schadenszahlen, Item-Popups, Menüs (Inventar, Herstellen, Quests, Charakter, Mehr, Ausrüstung, Händler), Charakterauswahl, Konto/Cloud; Tests prüfen Tippgrößen (≥ 40 px) und Überlauf bei 320–412 px.
- ❌ Kein Tutorial/Onboarding (die erste Quest ist der einzige Hinweis), kein Ton, keine Einstellungen (Gewohnheiten, Effekte, Sprache), kein PWA-/Offline-Manifest (nur Browser-Seite), keine Benachrichtigungen.
- 🟡 Der Testmodus (Tippen zum Bewegen) ist im normalen Spiel erreichbar (`starttest`, „Mehr“); Laufstrecke zählt dabei nicht, Loot und XP aber schon. Für künftigen Handel/Rangliste ein Manipulationsthema.

## 2. Was funktioniert zusammen, was nicht

**Verbunden (belegt):** Klasse ↔ Waffen/Rüstung (`wK`, `oK`, `ARMT`) · Ausrüstung/Set-Boni ↔ Kampf (`SB` in `strike`/`monsterHit`) · Drops ↔ Crafting (`GR`-Kosten sind Monster-Materialien) · Bosse/Gebietsbosse ↔ Sets (`SETS.boss`) · Lebensräume ↔ Monsterauswahl · Statistiken ↔ Klassenaufstieg (`UPQ`, `SECRET`) · Sammelstatistik ↔ Quests · Spielstand ↔ Cloud-Sync.

**Nicht oder kaum verbunden:**
1. Welt ↔ Schwierigkeit/Stufe (keine Stufenzonen, keine Skalierung).
2. Lebensräume ↔ Ressourcen und ↔ Quests/Belohnungen.
3. Gebiete ↔ Fortschritt (kein Name, keine Entdeckung, keine Gebietsbelohnung außer Boss).
4. Quests ↔ Klassen, Sets, Händler, Gebiete (nur 4 Einsteigerquests).
5. Lebensfertigkeiten ↔ Rezepte (keine Freischaltungen).
6. Händler ↔ Fortschritt (Sortiment bleibt gleich).
7. Münzen: Quellen vorhanden, Senken nur Upgrade-Gebühr/Reparatur/Trank; ohne Markt kaum Ziel.
8. Mehrspieler (nur Platzhalter), Zahlung/Platz 3 (nur Server-Vorbereitung).

## 3. Fehlende Inhalte für einen langfristigen Spielablauf
- Weltstruktur: Gebietsnamen und -stufen, Entfernungs-/Zonenmodell, Orte (Dörfer, Ruinen, Lager), Erkundungsfortschritt.
- Quests: Hauptstrang als Führung (Level 1–50), Neben- und Wiederholquests, Gebiets-/Bossquests, Erfolge und Titel.
- Gegner: Variation je Gebiet (neue Arten pro Stufenbereich), Mechaniken für die 5 Bosse, Elite-Varianten.
- Charakter: Entscheidung zu Attributen/Talenten, Fähigkeitsverbesserung, Buffs/Nahrung/Alchemie.
- Wirtschaft: Veredelung, Set-Crafting, Händlersortiment nach Fortschritt, Geldsenken, später Marktplatz.
- Endgame: Dungeons/Instanzen (Sets ab 50), Gruppeninhalte, Ranglisten, Saisons/Events.
- Einstieg und Bedienung: Tutorial, Einstellungen, Ton, PWA/Offline-Hilfe.

## 4. Priorisierter Entwicklungsplan (Vorschlag, noch nichts begonnen)

**Phase A – Grundlagen, die alles Weitere trägt (klein, zuerst)**
1. Weltschwierigkeit: Gebiet bekommt Stufe/Name (aus Gebiets-ID deterministisch, z. B. Entfernung vom ersten Startpunkt des Spielers + Lebensraum), Spawn-Tabellen und Monsterwerte skalieren danach; `rec` wird verbindlich (Warnung + Wirkung).
2. Level-/Wertekurve klären: Monsterschaden und -leben über Stufen, XP-Kurve, Heiltrank-Stufen (Balance-Tabelle statt Einzelzahlen).
3. Lebensraum ↔ Ressourcen: Ressourcen nach Lebensraum gewichten, erste neue Ressourcen.
4. Tutorial/Einstieg (3–5 geführte Schritte) und Anzeige „Gebiet: Name · Stufe · Lebensraum“ auf der Karte.

**Phase B – Fortschrittsrückgrat**
5. Quest-System ausbauen (Datenmodell für Ziele und Belohnungen, Questketten, Wiederholquests): Hauptstrang Level 1–50 (Gebietsbezug), Nebenquests, Bossquests.
6. Erkundung: besuchte Gebiete/Chunks anzeigen, Entdeckungsfortschritt, Belohnungen; Erfolge/Titel.

**Phase C – Kampf und Charakter**
7. Mechaniken für die 5 Bosse; neue Gegnerarten pro Gebietsstufe.
8. Charakterentwicklung: Entscheidung Attribute/Talente; Fähigkeiten verbessern.
9. Verbrauchsgegenstände/Buffs (Nahrung, Tränke in Stufen).

**Phase D – Wirtschaft und Handwerk**
10. Rezepte/Veredelung, Set-Crafting, Freischaltungen über Lebensfertigkeiten, Händler nach Fortschritt, Geldsenken.

**Phase E – Inhalte in Masse**
11. Monster-, Gebiets-, Quest- und Setinhalte nach festem Muster (Tabellen), Events/Tageszeit/Wetter.

**Phase F – Endgame und Soziales (braucht Server)**
12. Dungeons (Sets ab 50), Mehrspieler-Kampf, Marktplatz, Ranglisten.

**Querschnitt (klein halten):** Einstellungen/Ton, PWA, Testmodus-Regelung vor Handel/Rangliste, Balance-Tabellen (Excel) als gemeinsame Quelle.

## 5. Entscheidungen, die Phase A/B bestimmen
1. **Weltschwierigkeit:** nach Entfernung vom Startpunkt des Charakters, nach Gebiet fest (jede Region für alle gleich) oder nach Spielerstufe skalierend?
2. **Charakterwerte:** Attribute/Talentpunkte einführen oder bewusst bei „Stufe + Ausrüstung + Pfad“ bleiben?
3. **Rahmen:** Soll das Spiel eine Hauptgeschichte (Quest-Hauptstrang) bekommen oder eher ein Sandbox-Fortschritt mit Aufgabenlisten bleiben?
