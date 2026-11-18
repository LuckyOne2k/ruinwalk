---
name: ruinwalk-pixelart
description: Pixel-Art auf Profi-Niveau für Ruin Walk – neue und überarbeitete Sprites (Spielfiguren 64×64, Items 48×48, Status-Symbole 32×32, Monster, Karten-Objekte), Stilregeln aus den echten Spieldateien, Handwerksregeln (Silhouette, Licht, Farbrampen mit Farbtonverschiebung, saubere Linien, selektive Kontur, keine Kissenschattierung), Raster-Werkzeug mit Qualitätsprüfung und Vorher/Nachher-Bogen. Nutzen für jedes Zeichnen, Überarbeiten oder Prüfen von Spielgrafiken.
---

# Pixel-Art für Ruin Walk

Ziel: Grafiken, die **besser als der Bestand** sind und trotzdem **wie aus einem Guss** wirken. Ein einzelnes Prachtstück, das stilistisch herausfällt, ist ein Fehler.

## Werkzeug (`scripts/pixel.py`, nur Pillow, lokal)
```bash
P=.claude/skills/ruinwalk-pixelart/scripts/pixel.py
python3 $P palette                                   # Hauspalette als Rasterkopf
python3 $P import status/feuer.png /tmp/feuer.txt    # vorhandenes Bild als Raster (verlustfrei) zum Überarbeiten
python3 $P render kunst/entwuerfe/x/feuer.txt kunst/entwuerfe/x/feuer.png
python3 $P pruefen kunst/entwuerfe/x/feuer.png --typ status        # Exit 1 bei Fehlern
python3 $P vergleich kunst/entwuerfe/x/vergleich.png --alt status/feuer.png --neu kunst/entwuerfe/x/feuer.png
```
**Rasterformat:** Kopf `palette:` mit Zeilen `<zeichen> <#rrggbb>`, dann `---`, dann das Bild – ein Zeichen = ein Pixel, `.` = transparent, alle Zeilen gleich lang. Man zeichnet Pixel für Pixel; jede Zeile ist bewusst gesetzt.
**Ergebnisse immer ansehen:** den Vergleichsbogen mit dem Read-Werkzeug öffnen und beurteilen (1x = Spielgröße, 2x, Lupe; dunkler, heller und Karo-Hintergrund). Ohne Ansehen gilt nichts als fertig.

## Formate und Einbindung (belegt im Code)
| Art | Datei | Größe | Anzeige im Spiel | Einbindung |
|---|---|---|---|---|
| Spielfigur je Klasse/Stufe | `figs/<name>.png` | 64×64, blickt nach **rechts** | Charakterbild, Karte | Name in `figs/manifest.js` (`PX_PNG`); Ebenen `_base`/`_down` sind derzeit deaktiviert (Commit e4a4750) |
| Item/Ausrüstung/Material | `items/<name>.png` | 48×48 | Inventar, Popups | Name in `items/manifest.js` (`PX_ITEMS`), Zuordnung über `pxdom.js` |
| Status-Symbol | `status/<id>.png` | 32×32 | **28 px** (Spieler) bzw. **18 px** (Monster) | erzeugt von `tools/gen_status_icons.py` – **Achtung:** ein erneuter Lauf überschreibt `status/*.png`; vor dem Einbau handgezeichneter Symbole mit Pascal/`rw-qa` klären, ob das Skript stillgelegt oder angepasst wird |
| Monster, Karte, Skills | `sprites*.js` | 16×16 bzw. 32×32, **im Code als Formen** gezeichnet (`PX_SPR`) | Karte, Kampf | Ersatz durch PNG braucht Codeänderung → nur als Vorschlag mit `rw-gamedesign`/`rw-mobile-ux` |

Gemessener Bestand: Außenkontur fast überall **`#29190e`** (Figuren 58 %, Status 99 % der Randpixel), Figuren ≤ 38 Farben, Status ≤ 9 Farben, binäre Transparenz. Items uneinheitlich: 103 von 559 mit zu vielen Farben (Verläufe), 95 mit halbtransparenten Pixeln (weicher Leuchtschein), 83 mit losen Funkelpixeln – genau hier ist Verbesserung am sichtbarsten. `pruefen` gibt für jedes vorhandene Bild die Ausgangslage.

## Handwerksregeln (Pflicht)
1. **Silhouette zuerst.** Das Motiv muss als einfarbige Fläche bei Spielgröße (1x, bei Status 18–28 px) erkennbar sein. Wenige, klare Hauptformen; Waffe/Attribut ragt aus der Silhouette heraus. Erst wenn die Silhouette trägt, kommen Farben.
2. **Ein Licht für alles:** Licht von **oben links**, Schatten nach unten rechts. Jede Fläche folgt dieser Richtung – nie Mitte hell/Rand dunkel.
3. **Keine Kissenschattierung** (Pillow Shading: Schatten ringsum am Rand entlang). Volumen entsteht durch Form und Lichtrichtung, nicht durch einen dunklen Rand innen.
4. **Farbrampen mit Farbtonverschiebung:** 3–5 Stufen je Material; Schatten Richtung Blau/Violett bzw. Rotbraun (kühler, satter), Lichter Richtung Gelb/Weiß (wärmer, entsättigt). Kein reines Abdunkeln mit Schwarz. Dasselbe Material (Stahl, Gold, Leder, Haut) nutzt in **allen** Bildern dieselbe Rampe → Hauspalette (`palette`), sonst Rampen der Nachbarbilder übernehmen (`import`).
5. **Saubere Linien:** Pixelketten mit gleichmäßigem Rhythmus (1-1-1, 2-2-2, 1-2-1-2); keine Ausreißer wie 1-3-1, keine „L-Ecken“ (Doppelpixel an Stufen), Außenkontur genau 1 px breit. Kurven: Segmentlängen steigen/fallen gleichmäßig (3-2-1-1-2-3).
6. **Selektive Kontur:** Außen `#29190e` (Hauskontur, Pflicht ≥ 85 % des Randes; eine bewusste Lichtkante oben links ist erlaubt). Innenlinien in der dunkelsten Stufe der angrenzenden Materialrampe, nicht in Schwarz.
7. **Binäre Transparenz.** Kein Weichzeichnen, kein Leuchtschein mit Alpha. Anti-Aliasing nur von Hand und nur **innen** zwischen Farbflächen (1 Zwischenpixel an Treppenstufen), nie zur Transparenz hin.
8. **Kein Banding:** keine parallel laufenden, gleich langen Farbstufen, die wie Treppen aussehen. Stufen gegeneinander versetzen.
9. **Dithering sparsam** – nur als Materialstruktur (Fell, Stein, Rost) in kleinen Bereichen, nie als Verlauf über große Flächen.
10. **Lesbarkeit vor Detail:** Kleine Symbole (Status) ≤ 3 Hauptformen, starker Hell-Dunkel-Kontrast; Augen 1–2 px mit Glanzpunkt; Glanzpunkte bewusst (1–3 je Material), keine Streu-Glitzer.
11. **Seltenheit/Magie** ohne Alpha-Glow: 1-px-Lichtkante in der Seltenheitsfarbe, Funkeln als kleine Pixelkreuze **mit Kontur**, Edelstein mit eigener 3-Stufen-Rampe und Glanzpunkt.
12. **Stimmigkeit im Set:** Teile eines Sets (gleicher Name `set_<x>_<n>_*`), Klassenstufen (z. B. `krieger` → `ritter` → `paladin`) und Status-Symbole teilen Palette, Konturdicke, Proportionen und Blickrichtung. Vor dem Zeichnen die Nachbarbilder im Vergleichsbogen ansehen.
13. **Proportionen der Figuren** wie im Bestand: Begrenzungsrahmen etwa 40×59 auf 64×64, Füße auf gleicher Grundlinie, Kopf ~1/4 der Höhe (chibi-nah), blickt nach rechts. Items füllen 60–75 % der Fläche, 1 px Luft zum Rand.
14. **Farbanzahl-Grenzen:** Figur ≤ 40, Item ≤ 24, Status ≤ 16, Monster ≤ 32. Weniger ist meist besser.

## Arbeitsablauf
1. **Auftrag klären:** Was ist das Ding im Spiel (grep nach Name in `index.html`, `figs/manifest.js`, `items/manifest.js`)? Klasse, Material, Seltenheit, Anzeigegröße. Nichts erfinden, was das Spiel nicht hat (Skill `ruinwalk-projektwissen`).
2. **Bestand ansehen:** Original und 3–6 Nachbarn (`vergleich --neu …`) öffnen; was ist gut, was schwach (`pruefen`)?
3. **Silhouette** im Raster mit 1–2 Farben → rendern → bei 1x ansehen.
4. **Flächenfarben** aus Hauspalette/Set-Rampen → **Licht/Schatten** → **Kontur bereinigen** (Regel 5–6) → **Glanzpunkte**.
5. `pruefen --typ …` muss **ohne Fehler** sein; jeden verbleibenden Hinweis entweder beheben oder im Bericht begründen.
6. **Vergleichsbogen** erstellen und ansehen; Selbstkritik nach den Regeln 1–14 (konkret: welche Pixel, warum). **Mindestens zwei Überarbeitungsrunden.** Fertig erst, wenn das Neue bei 1x lesbarer und bei Lupe sauberer ist als das Alte.
7. **Ablage als Entwurf:** `kunst/entwuerfe/<thema>/` mit `<name>.txt` (Raster = Quelle), `<name>.png`, `vergleich.png`, `NOTIZ.md` (was verbessert, Prüfergebnis, offene Punkte). Live-Dateien in `figs/`, `items/`, `status/` werden **nicht** im Entwurfsschritt überschrieben.
8. **Freigabe:** Pascal sieht den Vergleichsbogen und entscheidet. Erst dann Einbau.
9. **Einbau (nach Freigabe):** gleiche Datei, gleiche Größe ersetzen; neue Namen zusätzlich im Manifest eintragen. Danach `npm test` (u. a. „Alle Status-Symbole existieren als Bilddatei“), Mobile-Prüfung (`ruinwalk-mobile-check`) mit Screenshot. Cache-Versionen erhöht nur der zuständige Agent im Abgleich: Figuren/Items `?v=` in `pxdom.js` (Zeile 11/12), Status `?v=` in `index.html` (`fxChip`), Manifeste `?v=` in `index.html` (Zeile 248/249).

## Abnahme (alles muss stimmen)
- `pruefen`: 0 Fehler; Außenkontur ≥ 85 %; keine Streupixel, keine Halbtransparenz.
- Bei Spielgröße auf dunklem **und** hellem Hintergrund eindeutig erkennbar.
- Passt neben die Nachbarbilder (Palette, Kontur, Proportion, Blickrichtung).
- Vorher/Nachher-Bogen liegt vor; Verbesserungen sind benannt.
- Abgleich: `rw-mobile-ux` (Lesbarkeit) + `rw-qa`; bei neuen Inhalten zusätzlich `rw-gamedesign`.
