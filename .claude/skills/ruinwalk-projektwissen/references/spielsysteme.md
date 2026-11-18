# Spielsysteme – was wirklich existiert

Quelle: `index.html` + `docs/BESTANDSAUFNAHME_SPIEL.md` (15.11.) + `docs/PHASE_A_GEBIETSSTUFEN.md` (danach umgesetzt).
Legende: ✅ live im Spiel · 🟡 teilweise/Platzhalter · ❌ fehlt · 🧪 nur Prototyp (nicht im Spiel)

## Welt und GPS
- ✅ Leaflet-Karte (OSM-Kacheln, Sepia-Filter), GPS-Verfolgung, Testmodus ohne GPS (Karte antippen; Laufstrecke zählt dann nicht, Loot/XP schon – Manipulationsthema vor Handel/Rangliste).
- ✅ Deterministische Welt je Zelle (165 m): 3–5 Ressourcen, ~70 % ein Monster, Händler je ~6×6 Zellen; Respawn (Ressourcen 8–15 min, Monster 15 min – 12 h).
- ✅ 5 Lebensräume aus echten OSM-Daten (`HAB`): Wald 🌲, Wiese & Feld 🌾, Sumpf & Wasser 💧, Fels & Berg ⛰️, Ruinen & Siedlung. Wirken auf Monster (`pickMob`) und – seit Phase A – auf Ressourcen (`HABW`).
- ✅ Gebiete (12×12 Zellen) mit Gebietsstufe 1–5 (`worldBand`; Namen `BAND_N`: Randland, Wildland, Fernmark, Schreckensmark, Ruinenreich; Level ab `BAND_LO` 1/8/16/26/38), Heimat-Schutzring (`effBand`), Anzeige oben (Stufe, Name, Level-Bereich, Warnung), Spawn-Gating (Elite ab 2, Boss ab 3, Gebietsboss ab 4), Skalierung (`BSC`), Heimatumzug alle 7 Tage. Testmodus-Heimat: Augsburg (virtuell, nichts gespeichert).
- ✅ Tutorial mit 4 Schritten beim ersten Start.
- ❌ Orte/Landmarken, Erkundungsfortschritt, Wegpunkte, Tageszeit-/Wetter-Wirkung (nur Zähler „Nacht-Kills“).

## Gegner und Kampf (Solo, Echtzeit im Browser)
- ✅ 50 Monster (`MOBS`): 20 normal, 12 selten, 8 Elite, 5 Boss, 5 Gebietsboss. Beispiele normal: Rohling, Riesenkäfer, Wildkeiler, Feldhase, Goblin, Waldspinne, Giftschlange, Irrlicht. Bosse: Waldtyrann, Moorkönigin, Mooswächter-Schildkröte, Vampirfürst, Felswurm. Gebietsbosse: Uralter Baumriese, Urmammut, Sumpfsaurier, Bergtroll, Aschedrache.
- ✅ 11 Monsterfähigkeiten (Gift, Brüllen, Schwarm, Wut, Panzer, Heilung, Fernangriff, Diebstahl, Scheu/Flucht, Dornen, Aussaugen).
- ✅ Kampf: Reichweite, Energie, Abklingzeiten, Krit, Fähigkeiten, Aggro/Verfolgung/Leine, Ohnmacht mit Strafe, Anfängerschutz bis Stufe 5.
- ✅ Gebietsbosse mit Phasen, Telegraphen (angekündigte Angriffe), Abwehr/Unterbrechen, Sonderphasen (Sprösslinge, harte Haut, Flugphase, Gift-Stapel).
- 🟡 Die 5 normalen Bosse haben nur Werte + eine Fähigkeit, keine eigenen Mechaniken.
- ✅ 11 Status-Icons (`status/`): betäubt, erschöpft, feuer, flug, gelähmt, gift, harthaut, raserei, schutz, sproessling, wurzeln.
- ❌ Mehrspieler im Live-Spiel (`othersInFight()` = 0).

## Klassen, Stufen, Fähigkeiten
- ✅ Stufe 1–50 (`LV_CAP`), XP je Stufe = Stufe × 40 (49.000 XP bis 50). Leben = 100 + 10 je Stufe.
- ✅ Wanderer (Stufe 1–4, Fähigkeiten Steinwurf, Durchatmen) → ab Stufe 5 eine von 4 Grundklassen:
  - **Krieger** (Wuchtschlag, Schildwall, Kampfgeist) – Pfade: Ritter→Paladin→Sonnenwächter (Tank mit Schild) · Berserker→Kriegsherr→Weltenbrecher (Schaden und Raserei) · Duellant→Klingentänzer→Phantomklinge (schnell und kritisch)
  - **Bogenschütze** (Zielschuss, Weitschuss, Pfeilhagel) – Pfade: Scharfschütze→Meisterschütze→Falkenauge (Reichweite und Krit) · Jäger→Bestienmeister→Herr der Wildnis (Tiergefährte) · Fallensteller→Schattenjäger→Nachtpirscher (Fallen und Kontrolle)
  - **Elementarmagier** (Feuerball, Frostnova, Blitzschlag) – Pfade: Feuermagier→Pyromant→Phönixweber · Frostmagier→Eisweber→Winterherrscher · Sturmmagier→Sturmrufer→Himmelsspalter
  - **Heiler** (Heilendes Licht, Schutzsegen, Strahlendes Urteil) – Pfade: Priester→Hohepriester→Lichtgesandter (Heilzauber und Schutz) · Mönch→Großmeister→Erleuchteter (Nahkampf mit Heilkraft) · Naturheiler→Druide→Weltenbaum-Hüter (Kräuter und Tränke)
- ✅ Pfadstufen bei Level 15/30/50 (`UP_LV`), je eine neue Fähigkeit; verborgene Stufe 3 mit 12 geheimen Bedingungen (`SECRET`); Klassenquests (`UPQ`). Figurenbilder je Pfadstufe in `figs/`.
- 🟡 Keine Attribute, keine Talentpunkte, keine Fähigkeitsverbesserung (offene Entscheidung, Bestandsaufnahme Abschnitt 5).

## Ausrüstung, Items, Crafting, Wirtschaft
- ✅ 10 Ausrüstungsslots, 5 Qualitätsstufen, Stufen I–III (Level 1/10/25), klassengebundene Waffen/Rüstungsarten, 10 Boss-Sets (Level 25/45, Boni bei 2/4/6 Teilen) und 36 Pfad-Sets (Level 15/30/50), Verbesserung bis +10 mit Runen, Item-Popup mit Vergleich.
- ✅ 6 Ressourcentypen (`NODES`): Ast, Kleiner Stein, Ranke, Heilkraut, Baum (Holz, braucht Axt), Eisenerzvorkommen (braucht Spitzhacke). Werkzeuge mit Haltbarkeit, Reparatur.
- ✅ 9 Rezepte (Werkzeug/Trank/Runen) + Ausrüstung I–III herstellbar. 24 Materialien, 5 Runenstufen.
- ✅ Lebensfertigkeiten Holzfällen, Bergbau, Sammeln (nur Chance auf +1 Menge, max. 50 %).
- 🟡 Nur ein Verbrauchsgegenstand (Heiltrank). Sets nur als Drop. Händler-Sortiment ändert sich nicht mit Fortschritt. Münzsenken: Upgrade-Gebühr, Reparatur, Trank.
- ❌ Marktplatz, Handel zwischen Spielern, Veredelung, Nahrung/Buffs.

## Quests und Fortschritt
- 🟡 Nur 4 Quests (`QUESTS`): Erste Schritte, Holzfäller, Jäger, Bergmann. Klassenquests getrennt.
- ❌ Hauptgeschichte, Questketten, Tages-/Wochenaufgaben, Erfolge/Titel, Ranglisten, Saisons, Events.

## Konto und Cloud
- ✅ Registrierung/Login/Passwort-Reset (Supabase Auth), E-Mail-Bestätigung Pflicht für Cloud.
- ✅ 3 Charakterplätze (2 frei, Platz 3 gesperrt – Kauf nicht umgesetzt), lokale und Cloud-Charaktere, Cloud-Sync mit Versionsprüfung, Konfliktdialog, Tab-Sperre, Server-Sicherungen (10, max. 1 je 10 min), Kontolöschung mit Datenexport.

## Instanzkampf 🧪 (nur Prototyp, `server/instance/`)
- Gruppen-Dungeons 2–4 Spieler, besondere Dungeons 6–8, Weltboss 6–8 mit absolutem Eventende. Rundenbasiert, serverseitig, deterministisch. Bereitschaft (60 s), Abwesenheit (5 min), Wiederbelebung, Warteliste/Nachrücken, Belohnungsansprüche.
- Alle Inhalte und Zahlen dort sind **Testwerte**, keine Spielbalance. Nicht öffentlich als Feature bewerben – höchstens als „in Entwicklung“.

## Optik
- Pixel-Art-Sprites (`sprites*.js`), gemalte Hintergründe (`assets/bg_*.jpg`), Logo `assets/logo.png`.
- Spiel-UI: dunkles Braun (`--bg:#16120f`), Akzent Orange `#ff7a2f`, Serif (Georgia). Landingpage: Gold `#d8a45d`, Cinzel + Crimson Text.
