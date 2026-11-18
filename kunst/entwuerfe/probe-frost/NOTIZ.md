# Probe: set_p_frost_3_6 – Ewigwinter-Eisstab (Entwurf rw-pixelart, 18.11.2026)

**Motiv (belegt):** `set_p_<pfad>_<stufe>_6` = Waffe des Pfad-Sets (index.html: `ix===6` → Waffe; Pfad-Sets aus `PSN`/`CW`). Frost, Stufe 3 → „Ewigwinter-Eisstab“ (Magier-Pfad Frost). Status: **Entwurf**, `items/` unverändert.

## Dateien
- `set_p_frost_3_6.txt` – Raster (Quelle), `set_p_frost_3_6.png` – Render 48×48
- `vergleich.png` – Original vs. Entwurf (1x/2x/Lupe; dunkel/hell/Karo)
- `nachbarn.png` – Entwurf neben `set_p_frost_2_6`, `set_p_frost_3_0`, `set_p_frost_3_7` (Originale)

## Prüfung (`pixel.py pruefen --typ item`)
| | Original | Entwurf |
|---|---|---|
| Ergebnis | FEHLER (3) | ok (0 Fehler, 0 Hinweise) |
| Halbtransparente Pixel | 1.327 | 0 |
| Farben | 97 | 10 |
| Streupixel | 2 | 0 |
| Außenkontur #29190e | 0 % | 100 % |
| Einzelfarbpixel | 40,5 % | 1,5 % (bewusste Glanzpunkte) |
| Begrenzungsrahmen | 41×40 (71 %) | 40×40 (69 %) |

## Was verbessert wurde
- Gleiches Motiv und Aufbau wie vorher: Eiskristall-Kopf oben links, diagonaler Schaft, Goldband, Goldknauf unten rechts, zwei Funkel links unten/rechts oben.
- Alpha-Leuchtschein entfernt; Seltenheit (Stufe 3 = Gold) über Goldkelch mit zwei Krallen, Goldband, Goldknauf mit Glanzpunkt und zwei Pixelkreuzen mit Kontur (Regel 11).
- Kristall als echte Facettenform: Grat mit Glanzlinie, Lichtseite (oben rechts) hell, Schattenseite dunkel, kurzer Reflex auf der Schattenseite, Schlagschatten am Kelch. Kanten mit sauberem 2:1-Rhythmus (Spitze) bzw. 1:1-Treppe (Schaft).
- Eis-Rampe mit Farbtonverschiebung: #1e2a5c (indigo) → #2b5a9a → #4795cf → #8ed4ee → #effdf6 (Licht leicht grünlich-warm). Schaft nutzt dieselbe Rampe (1–3).
- Gold aus der Hauspalette (#7a5a1c / #b8902a / #f4d03f + #f4f1e8 als Glanz).

## Offene Punkte / Selbstkritik
- Neben den heutigen Set-Nachbarn (Gold-Glow, kaum dunkle Kontur) wirkt der Entwurf härter und dunkler umrandet. Stimmig wird es erst, wenn das ganze Frost-Set (und `set_p_frost_1_6`/`2_6`) nach denselben Regeln überarbeitet wird.
- Weniger Goldfläche als das Original (dort Goldstreifen im Kristall + Glow) → Stufe 3 wirkt etwas zurückhaltender; Option: goldene Einlage im Kristall ergänzen.
- Gold der Hauspalette (#f4d03f) weicht leicht vom Set-Gold (#ffd65a) ab – bei Set-Überarbeitung vereinheitlichen.
- Grundformen wurden mit einer kleinen Konstruktionshilfe im Diagonalraster gesetzt (kein Quantisieren des Originals); Kelch, Knauf, Facette und Glanzpunkte von Hand.
- Abgleich vor Einbau: `rw-mobile-ux` (Lesbarkeit bei Inventargröße) + `rw-qa`. Einbau nur nach Pascals Freigabe.
