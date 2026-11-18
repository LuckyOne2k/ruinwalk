# Stilvorlage Klassenfiguren (verbindlich für Phase 2)

Stand 18.11.2026 · Entwurf, **nicht live** (figs/ unverändert) · Referenzbilder: `koerper.png`, `koerper_masse.png`,
`../wanderer|krieger|bogen|magier|heiler.png`, Bogen `../grundklassen_vergleich.png`.

## 1. Dateien und Werkzeug
- Quelle jeder Figur = Raster `kunst/entwuerfe/klassen/<name>.txt` (Name wie in `figs/manifest.js`, z. B. `sonnenwaechter`).
- `bau.py` = Baukasten: Grundkörper-Stempel (`KOPF`, `RUMPF`, `ARM_*`, `HAND_*`, `BEINE`, `STIEFEL_*`), Hilfen
  `kapuze()`, `robe()`, `aermel_weit()`, `hut_spitz()`, `faust()`, `kette()`, `aussenkontur()`.
  Neue Figur: Funktion `fig_<name>()` nach dem Muster der Grundklasse des Pfads schreiben (Grundklasse kopieren, dann
  Teile ergänzen) → `python3 bau.py ../<name>.txt <name>` → Feinarbeit direkt im Raster erlaubt.
  Jede Figur in einem eigenen Prozess bauen (`PAL` wird je Figur überschrieben).
- Prüfen: `python3 .claude/skills/ruinwalk-pixelart/scripts/pixel.py pruefen <png> --typ figur` → 0 Fehler, 0 Hinweise.

## 2. Maße (Pixelkoordinaten, x nach rechts, y nach unten, 0-basiert)
| Was | Wert |
|---|---|
| Leinwand | 64×64, binäre Transparenz, blickt nach **rechts** (3/4-Ansicht) |
| **Grundlinie** | unterste Konturzeile der Stiefel **y62**; Sohlen-Füllung y61; y63 bleibt leer |
| Kopf (Schädel) | x24–41 × y6–22 (18×17), Kontur y5 oben; mit Hut/Kapuze bis y1 (y0 bleibt leer) |
| Augen | 2×3 px: nahes Auge x32–33, fernes x38–39, y14–16 (Wimper k / Glanz W + Iris i / Iris i + I) |
| Mund / Wange | Mund x34–35 y19 (`4`), Wangenröte x31–32 y17 (`q`) |
| Hals | x30–33 y23 |
| Schulterlinie | y24; Rumpf x23–40; Schulterbreite 18 px (+ Ärmel = 24 px) |
| Gürtel | y37 (Licht) + y38 (Schatten), Schnalle x31–33 |
| Beine | y42–54; hinteres Bein x24–30, vorderes x32–39 (1 px Schritt-Lücke = Kontur) |
| Stiefel | y55–61; hinten x23–31, vorne x32–42 (Spitze nach rechts) |
| **Vorderhand (Waffe)** | Faust x42–46 × y34–38, **Griffmitte x44, y36**; Waffenschaft senkrecht x44–45. Robenfiguren (weiter Ärmel): Faust 1 px tiefer, y35–39 |
| **Hinterhand (Nebenhand)** | Faust x19–23 × y35–38, Mitte x21, y36; Schild/Buch/Talisman links davon bzw. darüber |
| Rahmen | Grundkörper 30×58; mit Ausrüstung 34–42 breit; Waffen dürfen bis x1/x62 ragen, 1 px Luft zum Rand |

Pose (Stand, Kopfhaltung, Handhöhen) **nicht ändern** – nur Kleidung, Rüstung, Waffen, Attribute.
Kopfgröße und Gesicht bleiben bei allen 41 Figuren identisch (Helme/Kapuzen/Hüte darüber).

## 3. Licht, Kontur, Linien
- Licht **oben links**: linke/obere Flächen Stufe 1–2, rechte/untere Stufe 3–4. Keine Kissenschattierung.
- **Außenkontur 1 px `k #29190e`**, automatisch von `aussenkontur()` (4er-Nachbarschaft, schließt Einzellöcher).
- Innenlinien in der dunkelsten Stufe des angrenzenden Materials (Stoff `F`, Leder `m`, Stahl `D`/`T`, Gold `z`), nie `k`
  mitten in Flächen. Zwischen zwei Teilen gleicher Farbe: 1 px dunkle Stufe.
- Falten: Paar aus dunkler Linie (`C`/`F`) + heller Kante rechts daneben (`A`/`B`), lang und senkrecht, höchstens 1 Versatz.
- Kettenhemd nur über `#` (Licht) / `%` (Schatten) + `kette()` – ruhiges Ringmuster, kein Schachbrett.
- Glanzpunkte: 1–3 je Material (Stahl `S`, Kristall `u`), keine Streupixel.

## 4. Palette (Zeichen im Raster festgelegt – bitte dieselben Zeichen benutzen)
Gemeinsam (alle Figuren): Kontur `k #29190e`
| Material | Licht → Tief |
|---|---|
| Haut `1 2 3 4` | #f9e0c4 #ecb98f #c98a6b #8f5545 |
| Haare `5 6 7 8` | #c98a4e #9c6136 #6e3f26 #4a2b1b |
| Augen `W i I`, Wange `q` | #fbf6ea #3b4f8c #7fa3e0, #e98d7d |
| Leinen/Hemd `a b c d` | #f3e8cf #d4c19b #a28b69 #6e5a47 |
| Hose `E e f g` | #a9a4bd #837d9b #615673 #3e3a52 |
| Leder/Holz `t l L m` | #e0c290 #ad7442 #77492b #4a2b1b |
| Gold `x y Y z` | #fff3b0 #f2cf55 #c4942e #87601f |
| Stahl `S s G D T` | #f4f7fb #c3cbd8 #8a93a8 #566282 #3e3a52 |

Klassenstoff `A B C F` (je Grundklasse; Pfade behalten die Farbe ihrer Grundklasse, Stufe 3 darf sie veredeln):
| Klasse | A B C F |
|---|---|
| Wanderer (Wolle braun) + Kittel `N O P R` | #c4a57a #8f7150 #644b38 #40302b · #a8ad74 #7b824f #555c3b #383e2c |
| Krieger (rot) | #ee6f55 #c63c3c #8c2436 #56192b |
| Bogenschütze (grün) | #9fcf63 #5f9c45 #3b6b3b #25462f |
| Magier (blau) | #7fb0f0 #4377d6 #2c4aa2 #1f2c66 |
| Heiler (weiß, Schatten violett) + Stola `N O P R` | #fbf6ea #e6dfd0 #bdb7c6 #837d99 · #b9ec8c #6cc35a #3f8a4a #245b39 |

Magie-/Effektrampen `u v V X` (je Figur nur **eine** Magiefarbe + ggf. Gold):
| Element | u v V X |
|---|---|
| Arkan/Kristall (Magier) | #effcff #8fe6f2 #3fa6dc #2a5aa8 |
| Licht/Heilung | #fff6c4 #f8e48a #e2bd52 (+ Gold) |
| Feuer | #fff3b0 #ffb43a #ef6a2c #b8322a |
| Frost | #f4fcff #a8e8f4 #59b8e3 #2a6c9c |
| Blitz/Sturm | #fffbd0 #f4e04a #c9a82a #5c4a9a |
| Natur | #d8f5a0 #8fd65a #4f9a3f #2a5a30 |
| Schatten/Nacht | #c9a0f0 #8a5cc8 #4f2f86 #2a1a4a |
| Sonne | #fffbe0 #ffd84a #f09a2a #b85a1a |
| Fels/Erde | #d8c8a8 #a08868 #6a5848 #3e342e |
Farbgrenze **≤ 40** je Figur (Grundklassen: 27–32). Neue Farben nur als vollständige Rampe mit Farbtonverschiebung
(Licht wärmer/heller, Schatten kühler/satter), nie reines Abdunkeln.

## 5. Detailgrad je Stufe (sichtbar steigernd, Silhouette bleibt die der Grundklasse)
| Stufe | Inhalt | Richtwert |
|---|---|---|
| Grundklasse | schlicht: Stoff, Leder, einfache Waffe, kein Gold außer Schnalle/Borte | 27–32 Farben |
| Stufe 1 (Lv 15) | Pfadwaffe/-nebenhand laut `CW`, ein Pfadmotiv (Wappen, Farbakzent), bessere Materialien | ≤ 34 |
| Stufe 2 (Lv 30) | + Rüstungsteile/Schulterstücke, Goldborten, Umhang oder Mantel, Motiv größer | ≤ 37 |
| Stufe 3 (Lv 50) | + prächtig: Ornamente, Krone/Kamm/Heiligenschein, Aura **ohne Alpha** (deckende Strahlen, Funken als Pixelkreuze mit Kontur, Schwingen), Motiv in Waffe + Kleidung + Aura | ≤ 40 |
Aura/Schwingen liegen **hinter** der Figur (vor `koerper()` stempeln), dürfen bis 1 px an den Rand, nie Gesicht/Waffe verdecken.

## 6. Klassennamen → Motiv (Waffe/Nebenhand aus `CW` in index.html, nichts anderes zeichnen)
- **Ritter** (Schwert+Schild): Wappenschild, Helm mit Visier/Federbusch · **Paladin**: weiß-goldener Wappenrock, Schild mit Lichtstern · **Sonnenwächter**: Sonnenmotiv (Sonnenscheibe auf Schild/Brust, goldene Strahlenaura)
- **Berserker** (Zweihandaxt): Fell, nackte Arme, Hörnerhelm · **Kriegsherr** (Zweihandaxt): Umhang, Krone/Kamm, schwere Platte · **Weltenbrecher** (Hammer): Fels/Risse (gesprungene Steinplatten, glühende Risse in Fels-Rampe, Gesteinsbrocken-Aura)
- **Duellant** (Rapier+Parierdolch): Federhut/Wams · **Klingentänzer** (Sichel+Zweitsichel): Bänder, Tücher in Bewegung · **Phantomklinge** (Geisterklinge+Geisterdolch): Schatten-Rampe, geisterhafte Klingen
- **Scharfschütze/Meisterschütze/Falkenauge** (Bogen+Köcher): Zielauge/Fernrohr-Motiv → Federn → Falkenschwingen/Falke
- **Jäger** (Bogen+Köcher) Wolf als Begleiter · **Bestienmeister** (Beil+Jagdhorn) Fellmantel, Tierschädel · **Herr der Wildnis** (Bogen+Köcher) Geweih, Blätter, Rudel
- **Fallensteller** (Messer+Bärenfalle) · **Schattenjäger** (Armbrust+Bolzenköcher) Schatten-Rampe · **Nachtpirscher** (Dolch+Wurfdolch) Mondsichel, Nacht
- **Feuermagier/Pyromant/Phönixweber** (Feuerstab+Feuerbuch): Flammen → Flammenkragen → **Flammenschwingen** (Phönix)
- **Frostmagier/Eisweber/Winterherrscher** (Eisstab+Eisbuch): Eiskristall → Eisfäden/-spitzen → Eiskrone, Frostaura
- **Sturmmagier/Sturmrufer/Himmelsspalter** (Blitzstab+Sturmbuch): Blitz-Zickzack → Sturmwolke → gespaltener Himmel/Blitzkranz
- **Priester/Hohepriester/Lichtgesandter** (Heilstab+Talisman): Heiligenschein → Mitra/Goldstola → Lichtschwingen
- **Mönch/Großmeister/Erleuchteter** (Faust+Gebetskette): Kutte, Bandagen → Gürtelknoten/Perlen → Lichtkreis/drittes Auge
- **Naturheiler/Druide/Weltenbaum-Hüter** (Naturstab+Kräuterkorb): Blüten/Kräuter → Geweih, Blätter → Weltenbaum (Äste, Krone)
Übersetzung: Name in 1–2 Bildmotive zerlegen, Motiv **dreifach** wiederholen (Waffe, Kleidung, Aura/Kopf), in der Rampe des
Elements. Keine bekannten Marken/Spielfiguren nachbilden.

## 7. Abnahme je Bild
`pruefen --typ figur`: 0 Fehler, keine Hinweise, Außenkontur ≥ 85 % (Grundklassen: 100 %) · bei 1x auf dunkel **und** hell
lesbar · Gesicht, Grundlinie y62, Handpositionen unverändert · Vergleichsbogen gegen Original + Grundklasse + Nachbarstufen
angesehen · mind. 2 Überarbeitungsrunden.
