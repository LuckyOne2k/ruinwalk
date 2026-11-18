---
name: ruinwalk-grafik
description: Erstellt Marketinggrafiken für Ruin Walk (Instagram/Facebook Post 1080×1350, Story 1080×1920, Quadrat 1080×1080) aus echten Spielassets (Logo, Hintergründe, Pixel-Figuren, Spiel-Screenshots) mit festen Markenvorlagen – lokal, ohne Netz, per Playwright. Nutzen für Posts, Stories, Karussell-Seiten, Teaser, Klassenvorstellungen, Entwickler-Updates, Umfragen.
---

# Marketinggrafiken rendern

## Schnellstart
```bash
node .claude/skills/ruinwalk-grafik/scripts/render.js <motive.json> [ausgabeordner] [--skala=1]
node .claude/skills/ruinwalk-grafik/scripts/render.js .claude/skills/ruinwalk-grafik/beispiele/motive.json /tmp/test   # Beispiele
```
Standard-Ausgabe: `marketing/grafiken/entwuerfe/`. Grafiken sind **Entwürfe** bis zur Freigabe (Skill `ruinwalk-social-content`, Abschnitt Freigabe).

## Felder je Motiv
| Feld | Bedeutung |
|---|---|
| `datei` | Dateiname; Endung `.jpg` = JPEG (Qualität 90, ~5× kleiner, für Veröffentlichung empfohlen), `.png` = PNG |
| `format` | `post` (1080×1350, Standard für Feed), `story` (1080×1920, mit Sicherheitszonen), `quadrat` (1080×1080), `banner` (1640×624, Facebook-Titelbild; nur mit Layout `banner`) |
| `layout` | `titel` (Logo + Schlagzeile), `klasse` (Pixel-Figuren + Fähigkeiten-Chips), `liste` (Update-Punkte mit Icon), `frage` (Umfrage A/B/C/D), `screenshot` (Spiel-Screenshot im Handyrahmen), `banner` (Logo links, Text rechts) |
| `hintergrund` | `assets/bg_login.jpg`, `assets/bg_create.jpg`, `assets/bg_chars.jpg` (gemalte Waldruinen) |
| `kicker`, `titel`, `text` | Oberzeile, Schlagzeile (Cinzel), Fließtext (Crimson Text) |
| `logo` | `true` blendet das Logo bei `liste`/`frage` ein (bei `titel` immer) |
| `figuren` | `[{bild: "figs/ritter.png", name: "Ritter"}]` – erste groß, weitere klein; > 3 Figuren werden automatisch kleiner |
| `chips` | kurze Begriffe (z. B. echte Fähigkeitsnamen) |
| `punkte` | `[{icon: "✅", text: "…"}]` – ✅ = fertig/live, 🔧 = in Entwicklung, 🗳️ = Frage |
| `optionen` | Antworten einer Umfrage (max. 4) |
| `bild`, `unterschrift` | Screenshot-Pfad (z. B. aus `ruinwalk-mobile-check`, nach `marketing/grafiken/screenshots/` kopiert) |
| `badge` | Standard „In Entwicklung“; `""` blendet aus (erst nach öffentlichem Start) |

## Verfügbare echte Assets
- `assets/logo.png` (800×498, transparent), `assets/bg_*.jpg` (720×1290 Hochformat).
- `figs/<pfad>.png` (64×64 Pixel-Art, wird scharf hochskaliert): wanderer, krieger, bogen, magier, heiler, alle 36 Pfadstufen (ritter, paladin, sonnenwaechter, berserker, kriegsherr, weltenbrecher, duellant, klingentaenzer, phantomklinge, scharfschuetze, meisterschuetze, falkenauge, jaeger, bestienmeister, herr, fallensteller, schattenjaeger, nachtpirscher, feuermagier, pyromant, phoenixweber, frostmagier, eisweber, winterherrscher, sturmmagier, sturmrufer, himmelsspalter, priester, hohepriester, lichtgesandter, moench, grossmeister, erleuchteter, naturheiler, druide, weltenbaumhueter).
- `items/*.png` (Ausrüstung), `status/*.png` (Status-Icons).
- Echte Spiel-Screenshots: `node .claude/skills/ruinwalk-mobile-check/scripts/mobile-check.js <ordner> --breiten=390` erzeugt Karte, Inventar, Herstellen, Quests, Charakter, Mehr.

## Regeln
1. **Nur echte Spielgrafik** zeigen. KI-generierte Bilder nur als klar erkennbare Stimmungsbilder, nie als „Spielszene“ ausgeben (Skill `ruinwalk-marke`).
2. Inhalte vorher gegen `ruinwalk-projektwissen` prüfen (gibt es das wirklich, ist es live oder in Entwicklung?).
3. Text kurz: Schlagzeile ≤ 6 Wörter, Fließtext ≤ 2 Zeilen. Das Skript warnt, wenn Inhalt an den Rand reicht.
4. Ergebnis immer ansehen (Bild öffnen) bevor es zur Freigabe geht.
5. Schriften liegen lokal (`fonts/`, SIL OFL), die Vorlage lädt nichts aus dem Netz.
