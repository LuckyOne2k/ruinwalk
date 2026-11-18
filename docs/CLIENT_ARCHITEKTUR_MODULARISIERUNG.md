# Architekturprüfung und Modularisierungsplan für den Client (`index.html`)

Stand: 18.11.2026. **Reine Analyse.** Es wurde keine Datei verschoben, keine Funktion ausgelagert und `index.html` nicht verändert. Grundlage: `index.html` auf `main` (3108 Zeilen, 269 KB), `pxdom.js`, `sprites*.js`, `tests/`, `.github/workflows/pages.yml`. Zeilenangaben sind „ca.“ und beziehen sich auf diesen Stand.

## 1. Kurzfassung und Empfehlung
- Der gesamte Spielcode (ca. 2850 Zeilen, 208 Funktionen) steckt in **einer einzigen Funktionsklammer** `(()=>{ 'use strict'; … })()` in einem Inline-`<script>`. Alles teilt sich diesen einen Gültigkeitsbereich: ein Spielstandobjekt `S` (ca. 520 Zugriffe), 27 veränderliche `let`-Variablen und ca. 115 Konstanten.
- **Empfohlen:** native **ES-Module ohne Build-Schritt** (flacher Importgraph, ein Einstiegsmodul), eingeführt in einem ersten, rein mechanischen Schritt („Code unverändert in `js/main.js` verschieben“), danach Abschnitt für Abschnitt herauslösen. Leaflet und die Sprite-Skripte bleiben vorerst klassische Skripte.
- **Reihenfolge (Begründung in Abschnitt 6):** (0) Absicherung/Messwerkzeug → (1) CSS → (2) reine Datentabellen → (3) Server-/Konto-/Sync-Block → (4) Speichern/Laden → (5) Anzeige-Hilfen (Toast, HUD, FX) → (6) Welt/Habitat → (7) GPS/Karte → (8) Ausrüstung/Fortschritt → (9) Kampf → (10) Menüs und Klick-Verteiler → (11) Start-Reihenfolge.
- **Grenzen eingehalten:** GPS-Mechanik, Echtzeitkämpfe, Kampfwerte/Formeln, Charakterdaten/Speicherformate, Instanzregeln und Supabase bleiben unberührt. Jeder Schritt ist ein reines **Verschieben von unverändertem Quelltext** und wird mit einem Fingerabdruck-Vergleich (Abschnitt 7) belegt.

## 2. Ist-Aufnahme

### 2.1 Dateien und Auslieferung
| Datei | Rolle |
|---|---|
| `index.html` | CSS (Z. 9–180, ca. 170 Zeilen), HTML-Gerüst (Z. 181–239, ca. 100 DOM-IDs), Inline-Skript (Z. 251–3108) |
| `pxdom.js` | ersetzt Emoji-Token (`:i_stock:` …) im DOM durch Pixelbilder (klassisches Skript, Globals `PX_*`) |
| `sprites*.js`, `figs/manifest.js`, `items/manifest.js` | Bilddaten (Globals), mit `?v=n` zur Cache-Erneuerung |
| Leaflet 1.9.4 | von `unpkg.com`, Global `L` |
| `tests/` | Playwright-Browsertests (20 Fallgruppen, ca. 1800 Zeilen, 229 Tests); Hook `window.__RW` |
| `.github/workflows/pages.yml` | Auslieferung von `main` als **statische Dateien über GitHub Pages, ohne Build-Schritt** |

Das Spiel kennt aktuell **keinen Instanzkampf-Client**: Die Serverkommunikation umfasst nur Konto/Anmeldung, Charakter-Cloud (`create_character`, `list_characters`, `save_character`, `move_character`, `delete_account`, `touch_login`, `username_available`, Tabellenzugriffe `characters`/`profiles`/`account_entitlements`). `SB_URL` und der öffentliche Schlüssel (Produktionsprojekt) stehen fest im Code (Z. 2066).

### 2.2 Abschnittskarte des Inline-Skripts
| Zeilen (ca.) | Inhalt | Funktionen (Auswahl) | Hängt ab von |
|---|---|---|---|
| 251–264 | Start-Prüfungen (Leaflet da? https?) | – | DOM, `L` |
| 265–411 | Konstanten, Speicherschlüssel, **ACTIVE** (aktiver Platz/Cloud-Charakter aus `localStorage`), `ITEMS`, `NODES`, `MOBS`, `ABIL`, `TIERS` | `metaOk, readMeta, writeMeta, fmtT, pickMob` | `localStorage` |
| 412–460 | Rezepte, Ausrüstungs-Tabellen (`SLOTS`, `CW`, `ARM`, `WNM`, …) | `clsKey` | Klassen, `S` |
| 460–540 | **Sets** und Gegenstandsbasis | `getBase, gStats, SB, setInfo` | `S`, Tabellen |
| 540–690 | Ausrüstung: Ablegen, Drops, Herstellen, Verbessern, Währung | `canEquip, equip, addGear, rollGear, craftGear, upgradeGear, earn` | `S`, `toast`, `save`, `hud` |
| 691–840 | **Klassen/Pfade**, Geheimbedingungen, Klassenquests, `effClass` | `effClass, canUp` | `S` |
| 841–960 | **Spielstand**: `def`, `sanitize`, `tryLoad`, Laden, `save`, Ableitungen (`maxHP`, `defense`, `atk`, `critCh`), `addXP` | `sanitize, tryLoad, save, addXP, regen` | `localStorage`, Tabellen |
| 976–1160 | **Welt/Habitat** (Chunks, Overpass-Abfrage, Heimatzone, Zellen/Monster) | `buildChunk, habNext, cellEnts, areaEnts, setHome` | `S`, `fetch`, Karte |
| 1160–1260 | **Karte und GPS** (Leaflet-Map, Position, Beobachtung) | `setPos, onPos, beginWatch, startGPS` | `L`, `S` |
| 1261–1360 | Umherlaufende Monster, Monstertreffer | `roamTick, monsterHit` | `S`, Welt |
| 1362–1700 | Auswahl/Karte der Monster, **Kampf** (Schlag, Boss, Fertigkeiten, Ohnmacht), Fertigkeitsleiste | `strike, bossTick, faint, useSkill, buildSkillBar` | alles |
| 1699–1755 | Herstellen/Tränke/Items, Quests | `craft, usePotion, checkQuests, claimQuest` | `S` |
| 1756–1943 | **Menüs** (`openSheet` baut alle Blätter als HTML) | `openSheet` | fast alles |
| 1944–2072 | Charakterplätze, lokale/Cloud-Wechsel, Löschen | `charsUI, switchSlot, createChar, deleteChar` | `S`, Cloud |
| 2066–2300 | **Supabase-Zugriff und Anmeldung** | `sbFetch, sbAuthed, acLogin, acRegister, acForgot` | `fetch`, `AUTH` |
| 2300–2476 | Konto: Löschen, Export, verwaiste Charaktere, Hochladen/Spielen | `acDelGo, acExport, acUpload, acPlay, acCreateCloud` | `AUTH`, `S` |
| 2477–2720 | **Cloud-Synchronisation** inkl. Konflikte | `syncPush, syncTick, acConflict*` | `SY`, `S`, Cloud |
| 2718–2780 | Sperre gegen Mehrfach-Tabs, Start der Anmeldung | `lockGate, tl*, authBoot` | `AUTH`, `S` |
| 2780–2910 | Popups, Toast, Effekte, Heimat, Tutorial, HUD, Testmodus | `toast, itemPop, fxUI, hud, setTest` | `S` |
| 2910–3040 | **Ein einziger Klick-Verteiler** (`document` → `data-a`, ca. 100 Aktionen) | – | alles |
| 3040–3108 | Takt (`setInterval`, 1 s), Start, Test-Hook `window.__RW` | `gpsWatch` | alles |

### 2.3 Gemeinsamer Zustand
- **`S` (Spielstand):** wird nur beim Laden zugewiesen (Z. 884–904: 3 Zuweisungen; außerdem der Test-Setter). Danach wird `S` nur noch verändert, nie ersetzt (Wechsel von Charakter/Platz = Speichern + Neuladen, so im Quelltext dokumentiert). Das ist günstig für Module: `S` kann als `export let S` im Zustandsmodul stehen, nur dieses weist zu.
- **Veränderliche Modul-Variablen (27 `let`):** Gift/Betäubung (`psn, myStun, stunId`), GPS (`P, lastFix, watchId, gpsLost, …`), Auswahl (`sel`), Menüzustände (`curSheet, qtab, pickCls, …`), Kampfzähler (`hitTaken, atkCnt, psCnt, rescueUsed`), Konto-/Sync-Zustand (`acV, acBusy, SY, AUTH`). Sie gehören je einem Fachbereich; nur wenige werden bereichsübergreifend gelesen (`P`, `sel`, `S`).
- **Zyklen:** `hud()`, `toast()`, `save()`, `openSheet()`, `refreshWorld()`, `renderCard()` werden aus fast jedem Bereich aufgerufen; umgekehrt rufen Menüs Spiellogik auf. Das ist die eigentliche Kopplung, nicht die Datenmenge.
- **Speicher:** 59 `localStorage`-Zugriffe: Spielstand je Platz (`ruinwalk_v1*`), `_bak`, `_corrupt`, Cloud-Zwischenspeicher (`ruinwalk_cc_*`), Sync-Metadaten (`ruinwalk_cm_*`), Habitat-Cache, Anmeldung, Tab-Sperre.

### 2.4 Initialisierungsreihenfolge (heute implizit durch die Zeilenfolge)
1. Prüfung `L`/https → 2. Konstanten und **ACTIVE** (liest `localStorage`) → 3. Datentabellen, Klassen, Pfade, Sets (`SETS`-Schleife erzeugt Pfad-Sets, `SETD`) → 4. Spielstand laden/bereinigen (`S`), Reparaturen (`fixEq`, `fixGear`) → 5. Habitat-Cache lesen → 6. Leaflet-Karte anlegen → 7. GPS-/Weltfunktionen → 8. Kampf/Menüs → 9. Konto/Cloud-Konstanten → 10. Ereignis-Handler registrieren (12 `addEventListener`) → 11. Takt `setInterval` → 12. `hud(); buildSkillBar(); authBoot(); tlCheck(); lockGate();` → 13. Test-Hook.
**Wichtig für Module:** Schritt 3 hängt davon ab, dass Tabellen **vor** ihrer Verwendung (`getBase` in `sanitize`) existieren; diese Reihenfolge muss als Importreihenfolge erhalten bleiben (Daten ohne Abhängigkeiten zuerst).

### 2.5 Event-Handler
12 `addEventListener` auf `document`/`window` (Klick-Verteiler, `input`/`change` für Kontolöschen, `focusin/out`, `keydown`, `visibilitychange`/`pagehide` (2×Speichern, Sync, Tab-Sperre), `online`). Keine Inline-`onclick`-Attribute. Der Klick-Verteiler (`switch` über `data-a`) ist die einzige zentrale Stelle für Bedienaktionen.

### 2.6 Funktionsgruppen (Abhängigkeit nach unten)
`Daten` ← `Regeln/Stats` (`getBase, gStats, SB, effClass, maxHP, atk, …`) ← `Fortschritt/Ausrüstung/Handwerk` ← `Kampf` ← `Menüs/Anzeige`; daneben `Persistenz` (Speichern/Laden) und `Server` (Konto, Cloud, Sync) als eigene, quer liegende Bereiche, sowie `Welt/GPS/Karte`.

## 3. Probleme der heutigen Struktur
1. Ein Bereich lässt sich nicht isoliert prüfen: Tests laufen nur im Browser über den Hook `__RW` (ca. 150 durchgereichte Namen).
2. Parallelarbeit führt zu Zusammenführungskonflikten in einer 3100-Zeilen-Datei.
3. Gleiche Inhalte existieren doppelt (Klassen-/Pfadnamen im Client und in `server/instance/engine/content.mjs`; F5-Namensabbildung). Ein gemeinsames Datenmodul könnte beides speisen (nur Lesen, später und mit eigener Freigabe).
4. Das Produktions-Supabase ist im Code fest verdrahtet; Dev-Prüfungen brauchen eine austauschbare Konfiguration (später, nur Konfigurationsmodul, keine Logikänderung).

## 4. Technische Optionen
| Option | Beschreibung | Für | Gegen |
|---|---|---|---|
| **A. Native ES-Module, ohne Build** | `<script type="module" src="js/main.js">`, Importe über relative Pfade | kein Build-Schritt (passt zu `pages.yml`), echte Importgrenzen, Strikt-Modus bereits aktiv, Tests laden die Dateien über denselben statischen Server | `file://`-Start geht nicht (Browser verbieten Modulimporte von `file:`); viele kleine Dateien (Ladekette); `?v=`-Cache-Erneuerung pro Datei unhandlich |
| B. Klassische Skripte mit gemeinsamem Namensraum (`window.RW.*`) | mehrere `<script src>`; Austausch über ein Globalobjekt | läuft überall (auch `file://`), geordnetes Laden wie bei den Sprites | keine echten Importgrenzen, Reihenfolge nur durch Tag-Folge, Namenskollisionen, schlechter testbar |
| C. ES-Module + Bündelung (esbuild/Vite) | Entwicklung in Modulen, Auslieferung als 1 Datei | ein Request, ein Cache-Schlüssel, Minifizierung | neuer Build-Schritt in `pages.yml`, zusätzliche Abhängigkeit, Fehlersuche über Source-Maps |

**Mobile Browser:** ES-Module werden von allen aktuellen mobilen Browsern unterstützt (iOS Safari ab 11, Chrome Android ab 61). Risiken sind Startzeit (Importkette = sequentielle Abrufe) und Cache. Gegenmittel ohne Build: **flacher Graph** (ein Einstiegsmodul importiert alle Bereiche direkt, kaum Verschachtelung), `<link rel="modulepreload">` für die Hauptmodule, HTTP/2 bei GitHub Pages (parallele Abrufe, geringe Kosten je Datei). Auslieferung statisch mit Standard-Caching der Plattform; Versionierung über einen Versionsparameter am Einstiegsmodul (`main.js?v=n`) plus Revalidierung per ETag.
**Empfehlung: A**, mit der Option, später auf C umzusteigen, ohne den Quelltext zu ändern (die Module sind bündelbar). B nur als Notlösung, falls ein Zielgerät Module nicht verträgt (derzeit kein Hinweis darauf).

## 5. Zielstruktur
```
index.html                 # nur HTML-Gerüst, <link css>, Leaflet/Sprite-Skripte (klassisch), <script type=module src=js/main.js>
css/main.css               # aus Z. 9–180
js/
  main.js                  # Start-Reihenfolge (2.4), Takt, Test-Hook; importiert alle Bereiche
  core/
    dom.js                 # $, kleine DOM-Helfer
    util.js                # rnd, numIn, isObj, fmt*, hash, mulberry, dist (reine Funktionen)
    state.js               # export let S, def(), setState(); Muster/Zähler, ACTIVE
    hooks.js               # kleine Anmeldestelle: toast/hud/save/openSheet als Funktionen registrieren (bricht Zyklen)
    config.js              # SB_URL/Schlüssel, Speicherschlüssel (später umschaltbar auf Dev)
  data/
    items.js               # ITEMS, NODES, RECIPES, SELL, BUY, COIN, HAB, SKILLNAME
    mobs.js                # MOBS, TIERS, ABIL, MOBLIST-Aufbau
    classes.js             # CLASSES, PATHS, UP_LV, SECRET, UPQ, PS* (Pfad-Set-Daten)
    gear-data.js           # SLOTS, QN/QC/QM, GT, CW, ARM*, WNM/ONM, SETS, SETD, Drop-Tabellen
    quests.js              # QUESTS
  rules/
    stats.js               # getBase, gStats, SB, effClass, maxHP, defense, atk, critCh (nur Lesen von S)
    xp.js                  # addXP, canUp, upProg, regen
  persistence/
    storage.js             # slotKey, readMeta/writeMeta, sanitize, tryLoad, save, Laden beim Start
    slots.js               # Charakterplätze lokal/Cloud, charsUI-Logik
  game/
    gear.js                # canEquip, equip, addGear, rollGear/rollSet, craftGear, upgradeGear, Währung/Händler
    inventory.js           # craft, usePotion, useItem, Quests (checkQuests, claimQuest)
    combat.js              # strike, monsterHit, faint, Boss, Fertigkeiten, skill bar
    roam.js                # roamTick, mk (Marker)
  world/
    habitat.js             # buildChunk, habNext, Overpass-Abruf, Zonen/Heimat
    cells.js               # cellEnts, areaEnts, refreshWorld, updateNear
    map.js                 # Leaflet-Karte, updMe
    gps.js                 # setPos, onPos, beginWatch, startGPS, gpsWatch
  server/
    supabase.js            # sbFetch, sbAuthed, Sitzung (AUTH), authRefresh
    auth.js                # acLogin/acRegister/acForgot/acReset/acLogout, authBoot
    account.js             # Löschen, Export, Orphans, acUpload/acPlay/acCreateCloud
    sync.js                # syncPush/Tick/Verify/Conflict
    tablock.js             # Tab-Sperre (tl*), lockGate
  ui/
    toast.js, hud.js, fx.js, popups.js, tutorial.js
    sheets.js              # openSheet und Blatt-Erzeuger (später je Blatt eine Datei)
    dispatcher.js          # Klick-Verteiler (Aktionstabelle statt langer switch, Verhalten unverändert)
  test-hook.js             # window.__RW (nur bei __RW_TEST), importiert Schnittstellen
```
**Abhängigkeitsrichtung (verbindlich):** `core ← data ← rules ← persistence/game/world ← ui ← main`; `server` hängt nur von `core`, `persistence`, `hooks` ab; `ui` darf alles lesen, andere Bereiche rufen `ui` **nur über `hooks.js`**. Zyklen sind so ausgeschlossen, solange die Hooks erst in `main.js` registriert werden.
**Schnittstellen:** Daten-Module exportieren nur Konstanten. `rules/*` exportieren reine Lese-Funktionen auf `S`. `persistence/storage.js` exportiert `save, tryLoad, sanitize` (Signatur unverändert). `server/*` exportiert Ereignis-/Statusfunktionen und bekommt UI nur über `hooks`. Der Test-Hook importiert aus allen Modulen und bildet **exakt dieselbe Namensmenge** wie heute auf `window.__RW` ab (das wird in Schritt 0 als Vertrag festgehalten).

## 6. Migrationsplan (kleine, einzeln testbare Schritte)
Allgemein je Schritt: ein Branch/PR, nur Verschiebung von unverändertem Quelltext, danach Fingerabdruck-Vergleich + vollständige Browser-Tests (229). Rücksetzen: **Revert des einen PR** (Auslieferung nur von `main`); `index.html` bleibt zu jedem Zeitpunkt lauffähig, weil jeder Schritt einzeln funktionsfähig ist.

| # | Schritt | Betroffene Funktionen/Bereiche | Dateien | Risiken | Notwendige Tests | Rücksetzen |
|---|---|---|---|---|---|---|
| 0 | **Absicherung:** Fingerabdruck-Werkzeug (Hash je Top-Level-Funktion/Konstante), Vertrag der `__RW`-Namensliste als Test, Ladezeit-Messung (mobil, gedrosselt) als Ausgangswert | – | `tools/fingerprint.mjs`, `tests/cases/vertrag.js` | keins (nur Zusatz) | neue Vertragstests, alle 229 | Dateien löschen |
| 1 | **CSS auslagern** | Z. 9–180 | `css/main.css`, `index.html` | Reihenfolge/Laden (Flackern), Cache-Version | Sichtprüfung auf Gerät, `ui`-Tests, Ladezeit | Revert |
| 2 | **Skript als Modul starten (unverändert):** Inline-Skript 1:1 nach `js/main.js`, geladen als `type=module` | Gesamtes Inline-Skript | `js/main.js`, `index.html` | Strikt-/Defer-Verhalten (läuft nach dem Parsen), `file://` entfällt, Leaflet muss vor dem Modul geladen sein, Hook `__RW` | alle 229, Start auf iOS/Android, Offline-Verhalten | Revert (Inline-Skript zurück) |
| 3 | **Datentabellen** (keine Logik, keine Zustandsnutzung) | `ITEMS, NODES, MOBS, ABIL, TIERS, RECIPES, SELL, BUY, COIN, HAB, SKILLNAME, QUESTS, SLOTS, QN/QC/QM, GT, CW, ARM*, WNM, ONM, SETS(Basis), CLASSES, PATHS, UP_LV, SECRET, UPQ` | `js/data/*.js` | Reihenfolge (Daten, die andere Daten referenzieren), die `SETS`-Schleife für Pfad-Sets liest `PATHS`/`PSB` → in dasselbe Modul | Fingerabdruck der Tabellen, `gear`, `craft`, `world`, `combat` | Revert |
| 4 | **Server-/Konto-/Sync-Block** (größter, am besten abgegrenzter Block, ca. 700 Zeilen) | `sbFetch … authBoot` | `js/server/*.js`, `core/hooks.js` | UI-Aufrufe (`toast`, `hud`, `openSheet`, `charsUI`) → über `hooks`; geteilte `AUTH`/`SY`; Ladezeitpunkt `authBoot` | `auth, cloudbase, cloudplay, cloudsync, cloudresolve, cloudlock, cloudtab, kontoloeschen, session, datenfluss` | Revert |
| 5 | **Speichern/Laden** | `sanitize, tryLoad, save`, Laden, `ACTIVE`, Plätze, Meta | `js/persistence/*.js`, `core/state.js` | **hoch:** Datenverlust bei Fehler; Reihenfolge Tabellen→`sanitize`; `S`-Zuweisung nur im Zustandsmodul | `save, chars, cloudbase, datenfluss` + neue Prüfung: gleicher Spielstand vor/nach (Bytevergleich), Absturz-/Wiederherstellungsfälle (`_bak`, `_corrupt`) | Revert; Spielstände bleiben unverändert, da Format/Schlüssel gleich |
| 6 | **Anzeige-Hilfen** (`toast`, `hud`, FX, Popups, Tutorial) | Z. 2780–2910 | `js/ui/*.js` | `hud` liest viele Werte → über `rules/stats` | `ui, status` | Revert |
| 7 | **Regeln/Stats** (reine Funktionen auf `S`) | `getBase, gStats, SB, effClass, maxHP, defense, atk, critCh, addXP, regen` | `js/rules/*.js` | **keine Formeländerung:** nur verschieben; Fingerabdruck belegt Identität | `gear, combat, save` + Vergleichstest „Werte vor/nach“ auf festen Spielständen | Revert |
| 8 | **Welt/Habitat und Zellen** | `buildChunk, habNext, ensureHab, cellEnts, areaEnts, setHome, zoneUI` | `js/world/habitat.js, cells.js` | Netz (Overpass), `localStorage`-Cache, Zufall (`hash`, `mulberry`) muss unverändert bleiben | `world, gebiete` | Revert |
| 9 | **GPS/Karte** (nur Verschieben, **Logik unverändert**) | `setPos, onPos, beginWatch, startGPS, gpsWatch, countWalk`, Leaflet-Aufbau | `js/world/gps.js, map.js` | **hoch:** Echtzeit/Ortung; Zeitgeber und Zustand `P, lastFix, watchId`; Feldtest nötig | `gps` + Gerätetest (echtes GPS, Wegfall/Wiederkehr, Testmodus) | Revert |
| 10 | **Ausrüstung/Handwerk/Quests** | `canEquip … upgradeGear, craft, usePotion, checkQuests` | `js/game/gear.js, inventory.js` | Zufallsaufrufe (`Math.random`) dürfen nicht umgeordnet werden | `gear, craft, status` | Revert |
| 11 | **Kampf** (nur Verschieben) | `strike, monsterHit, faint, boss*, useSkill, roamTick` | `js/game/combat.js, roam.js` | **hoch:** Echtzeitkämpfe, Zeitgeber (`nextAtk`, `eng`), gemeinsamer Zustand (`sel`, `psn`, `myStun`) | `combat` + Vergleichslauf mit festem Zufall (Seed) vor/nach + Gerätetest | Revert |
| 12 | **Menüs und Klick-Verteiler** | `openSheet`, `switch` über `data-a` | `js/ui/sheets.js, dispatcher.js` | größte Menge an Zeichenketten-HTML; Aktionsnamen müssen 1:1 bleiben | `ui` + Test aller `data-a`-Aktionen (Liste aus dem Quelltext erzeugen) | Revert |
| 13 | **Start-Reihenfolge und Test-Hook** | Z. 3040–3108 | `js/main.js`, `js/test-hook.js` | Reihenfolge (2.4) | alle 229 + Vertragstest | Revert |
| 14 | optional: Bündelung (Option C) | – | Build-Schritt in `pages.yml` | Build-Fehler | alle Tests gegen das Bündel | Build-Schritt entfernen |

**Warum diese Reihenfolge:**
- **CSS (1) und Modulstart (2) zuerst:** kein oder minimales Logikrisiko, aber sie schaffen die Voraussetzung für alles Weitere; Schritt 2 deckt Strikt-/Ladeprobleme früh auf, solange der Code noch unverändert ist.
- **Datentabellen (3) vor Logik:** größter Zeilengewinn bei null Zustandskopplung; erleichtert das Lesen und ist Basis eines späteren gemeinsamen Datenmodells mit dem Server (Profilableitung, Ausrüstung).
- **Server-Block (4) vor Spielcode:** am stärksten abgegrenzt (eigener Zustand, eigene Tests), ca. 25 % der Datei, und genau dort wird parallel am meisten entwickelt (Konto, Cloud, später Instanzclient). Er hängt nur über wenige UI-Aufrufe am Spiel.
- **Speichern (5):** hoch kritisch, aber früh sinnvoll, solange noch wenig anderes verschoben ist, und mit den besten Tests abgedeckt.
- **GPS und Kampf (9, 11) zuletzt:** höchstes Risiko (Echtzeit, Gerätetests), und erst dann sind alle ihre Abhängigkeiten sauber getrennt.

## 7. Sicherheitsnetz gegen unbeabsichtigte Änderungen
1. **Fingerabdruck:** Werkzeug zerlegt `index.html`/Module in Top-Level-Deklarationen und vergleicht Hashes des Quelltexts (ohne Leerraum). Ein Schritt gilt nur als „reines Verschieben“, wenn alle Hashes der verschobenen Deklarationen identisch bleiben und nur Import-/Export-Zeilen hinzukommen.
2. **Vertragstest `__RW`:** die Namensmenge des Test-Hooks darf sich nie ändern (heute ca. 150 Namen).
3. **Parität der Werte:** fester Satz an Spielständen (je Klasse/Pfad/Stufe, mit Ausrüstung) → `maxHP, defense, atk, critCh, gStats, SB` vor und nach jedem Schritt identisch.
4. **Gerätetests** für Schritte 2, 9, 11 (iOS Safari, Android Chrome, echtes GPS) und Ladezeitmessung gegen den Ausgangswert aus Schritt 0.
5. **Parallelbetrieb:** bis zum Abschluss kann eine Kopie des alten `index.html` als `legacy.html` mit ausgeliefert werden, damit ein Zurückgehen ohne Neuauslieferung möglich ist (Entscheidung nötig).

## 8. Risiken und offene Entscheidungen
- `file://`-Start fällt weg (Module): Wird das Spiel so jemals lokal geöffnet? Sonst Option B/C.
- Cache-Erneuerung bei vielen Dateien: einheitliche Versionsnummer am Einstieg; oder Bündelung (Option C).
- Hooks statt direkter UI-Aufrufe sind die einzige echte Strukturänderung; sie ändern kein Verhalten, müssen aber vor jedem Spielstart registriert sein (Start-Reihenfolge).
- Die Produktions-URL im Code ist ein Dev-Test-Hindernis (Konfigurationsmodul später; nicht Teil dieser Analyse, **keine Änderung an Supabase**).
- Entscheidungen: Option A/B/C; `legacy.html` ja/nein; Reihenfolge freigeben; ob parallel ein gemeinsames Datenmodul Client/Server angestrebt wird (eigene Freigabe).
