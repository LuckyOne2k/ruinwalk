# Stilvorlage Klassenfiguren (verbindlich für Phase 2) – Version 2

Stand 18.11.2026 (Phase 1b nach Pascals Rückmeldung) · Entwurf, **nicht live** (figs/ unverändert).
Referenz: `koerper.png`, `koerper_masse.png` (Maßbild), `../wanderer|krieger|bogen|magier|heiler.png`, `../grundklassen_vergleich.png`.

## 1. Dateien und Werkzeug
- Quelle jeder Figur = Raster `kunst/entwuerfe/klassen/<name>.txt` (Name wie in `figs/manifest.js`, z. B. `sonnenwaechter`).
- `bau.py` = Grundkörper + Hilfen (`setze`, `block`, `faerbe`, `kopf`, `gesicht`, `koerper`, `beine`, `faust`, `kette`,
  `aussenkontur`). `klassen.py` = Figuren + Kleidungsteile (`kapuze`, `robe`, `aermel_fallend`, `aermel_hinten`,
  `bogen_holz`, `hut_spitz`, `heiligenschein`). Alle Formen als Pixelzeilen `(y, x0, "pixel")` von Hand gesetzt.
- Neue Figur: in `klassen.py` Funktion `fig_<name>()` nach dem Muster der Grundklasse (kopieren, ergänzen), eintragen in
  `FIGUREN`, dann `python3 bau.py ../<name>.txt <name>` und rendern. Feinarbeit danach direkt im Raster erlaubt.
  Phase-2-Kollegen arbeiten am besten in **eigenen Dateien** (`klassen_<pfad>.py`, per `exec` wie `klassen.py` geladen)
  oder direkt im Raster, damit sich niemand `klassen.py` gegenseitig überschreibt.
- Prüfen: `python3 .claude/skills/ruinwalk-pixelart/scripts/pixel.py pruefen <png> --typ figur` → 0 Fehler, 0 Hinweise
  (einzige erlaubte Ausnahme: „Einzelfarbpixel“ bei Kettengeflecht, Materialstruktur).

## 2. Maße (Pixelkoordinaten, 0-basiert, x nach rechts, y nach unten)
| Was | Wert |
|---|---|
| Leinwand | 64×64, binäre Transparenz, blickt nach **rechts** (3/4-Ansicht), y0/y63/x0/x63 bleiben leer |
| **Grundlinie** | unterste Konturzeile der Stiefel **y62**, Sohle y61 |
| **Kopf** | Füllung x21–42 × y4–24 (22×21 px), Kontur y3 → Kopf ≈ 1/3 der Figurhöhe (chibi) |
| Gesicht | x27–42 × y11–24; Ohr x27–28 y17–19; Pony y11–13 |
| Brauen | y13–14 über den Augen (Form = Ausdruck) |
| **Augen** | je 3×4 px: nah x30–32, fern x37–39, y15–18; Zeile 1 Wimper `k`, Zeile 2 Glanz `W` + Iris `i` + `k`, Zeile 3 `i I k`, Zeile 4 `i I` |
| Nase / Wange / Mund | Nase (41,19) `3` · Wange x29–30 y19 `qq` · Mund um x34–36, y20–22 |
| Hut/Helm/Kapuze | ab y2; Krempe Magierhut y10–12, x14–49; Helmreif y10–11 |
| Schulterlinie | y25; Rumpf x23–39 (Taille x24–38) |
| Gürtel | y36 (Licht) + y37 (Schatten), Schnalle x31–33; Saum Oberteil y40 |
| Beine (Schrittstellung) | hinten schräg zurück x25–30 (y41) → x22–27 (y54); vorne schräg vor x30–38 (y41) → x35–41 (y54) |
| Stiefel | y55–61; hinten x21–29, vorne x35–45 (Spitzen nach rechts); Lücke x30–34 |
| Robe | y25–57, Rock weitet sich: x23–39 (y38) → x18–45 (y57), Saum y56–57 |
| **Vorderhand (Waffe)** | aktiv vor dem Körper: Faust x43–47 × y30–34, **Griff x45, y32**; Stäbe/Bögen senkrecht x45–46, Klingen schräg (1 px nach rechts je 2 px nach oben) |
| **Hinterhand (Nebenhand)** | Faust x19–23 × y34–37, **Mitte x21, y35**; Schild links davon (x9–24), Buch x11–19, Anhänger darunter |
| Ärmel | Hemd/Rüstung: Arm angewinkelt x36–44 y26–33; Robe: `aermel_fallend()` – Stoff fällt unter dem Unterarm bis y37 |
| Rahmen | Grundkörper 31×60 (x18–48, y3–62 inkl. Kontur); mit Ausrüstung 36–51 breit |

Pose, Kopfraster und Handpositionen **nicht ändern** – nur Frisur (innerhalb der Kopffläche), Ausdruck, Kleidung,
Rüstung, Waffen, Attribute. Ausdrücke in `gesicht()`: `neutral`, `neugierig` (Wanderer), `entschlossen` (Krieger),
`keck` (Bogen), `konzentriert` (Magier), `sanft` (Heiler). Pfade erben den Ausdruck ihrer Grundklasse; ein eigener
Ausdruck je Pfad ist erlaubt (z. B. Berserker: Brauen stark gesenkt, Mund offen `444/4.4`), aber nur über Brauen/Mund.

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
| Haare `5 6 7 8` (Standard braun) | #c98a4e #9c6136 #6e3f26 #4a2b1b |
| Augen `W i I`, Wange `q` | #fbf6ea, Iris je Klasse (s. u.; Standard #3b4f8c #7fa3e0), #e98d7d |
| Leinen/Hemd `a b c d` | #f3e8cf #d4c19b #a28b69 #6e5a47 |
| Hose `E e f g` (Standard, je Klasse ersetzt) | #a9a4bd #837d9b #615673 #3e3a52 |
| Leder/Holz `t l L m` | #e0c290 #ad7442 #77492b #4a2b1b |
| Gold `x y Y z` | #fff3b0 #f2cf55 #c4942e #87601f |
| Stahl `S s G D T` | #f4f7fb #c3cbd8 #8a93a8 #566282 #3e3a52 |

Je Klasse (Pfade übernehmen Stoff, Haar, Iris und Hose ihrer Grundklasse; Stufe 3 darf veredeln):
| Klasse | Stoff `A B C F` | Haar `5 6 7 8` | Iris `i I` | Hose `E e f g` |
|---|---|---|---|---|
| Wanderer | #c4a57a #8f7150 #644b38 #40302b (Wolle) + Kittel `N O P R` #a8ad74 #7b824f #555c3b #383e2c | Standard braun | #2f6a3f #7cc18a | #b3a98f #8a8069 #6e5a47 #433d35 |
| Krieger | #ee6f55 #c63c3c #8c2436 #56192b | 7/8 #4a3a40 #2e2232 (schwarz) | #5a3a28 #d29a4a | Kettenbeinlinge (`#`/`%`) + Kniebuckel |
| Bogenschütze | #9fcf63 #5f9c45 #3b6b3b #25462f + Federn `N O` #f1f1e6 #c94a3c | 7/8 #b05a2a #6e2f1c (kupfer) | Standard | #8f9763 #6a7046 #4b5133 #313624 |
| Magier | #7fb0f0 #4377d6 #2c4aa2 #1f2c66 | #f1f1f8 #c6cae0 #9095b8 #5d5f88 (silber) | #5a3a9a #a07ae0 | unter Robe |
| Heiler | #fbf6ea #e3dccb #b0a9c4 #746d95 (Schatten violett) + Stola `N O P R` #b9ec8c #6cc35a #3f8a4a #245b39 | #fff3b0 #f2cf55 #c08a34 #7e5422 (gold) | #2f7a8a #6fc8d8 | unter Robe |

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
Farbgrenze **≤ 40** je Figur (Grundklassen: 26–33). Neue Farben nur als vollständige Rampe mit Farbtonverschiebung
(Licht wärmer/heller, Schatten kühler/satter), nie reines Abdunkeln.

## 5. Detailgrad je Stufe (sichtbar steigernd, Silhouette bleibt die der Grundklasse)
| Stufe | Inhalt | Richtwert |
|---|---|---|
| Grundklasse | schlicht: Stoff, Leder, einfache Waffe, kein Gold außer Schnalle/Borte (Ausnahme Heiler: Heiligenschein) | 26–33 Farben |
| Stufe 1 (Lv 15) | Pfadwaffe/-nebenhand laut `CW`, ein Pfadmotiv (Wappen, Farbakzent), bessere Materialien | ≤ 34 |
| Stufe 2 (Lv 30) | + Rüstungsteile/Schulterstücke, Goldborten, Umhang oder Mantel, Motiv größer | ≤ 37 |
| Stufe 3 (Lv 50) | + prächtig: Ornamente, Krone/Kamm/Heiligenschein, Aura **ohne Alpha** (deckende Strahlen, Funken als Pixelkreuze mit Kontur, Schwingen), Motiv in Waffe + Kleidung + Aura | ≤ 40 |
Aura/Schwingen liegen **hinter** der Figur (zuerst stempeln), y0/y63/x0/x63 bleiben leer (1 px Luft), nie Gesicht/Waffe verdecken.

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
lesbar · Kopf/Gesichtsraster, Grundlinie y62, Pose und Handpositionen unverändert · Vergleichsbogen gegen Original + Grundklasse + Nachbarstufen
angesehen · mind. 2 Überarbeitungsrunden.
