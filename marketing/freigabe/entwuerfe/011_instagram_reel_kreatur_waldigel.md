---
id: 011
titel: Reel – Kreatur der Woche #1 Waldigel (Dornen)
kanal: instagram
format: reel
geplant_fuer: Mi 25.11.2026, 17:35 (Reel-Tag Mi, Serie Kreatur der Woche)
status: entwurf
freigegeben_von:
freigegeben_am:
video: marketing/grafiken/entwuerfe/011_reel_kreatur_waldigel.mp4
video_url:
vorschau_ms: 1200
bild: marketing/grafiken/entwuerfe/011_reel_kreatur_waldigel_vorschau.jpg
veroeffentlicht_am:
link:
---

## Ziel
Reichweite und Wiedererkennung: Serie „Kreatur der Woche“ jetzt als Reel (Entscheidung Pascal 23.11.2026). Bewegung ab Bild 1: Schleuderschuss, Schadenszahl. CTA: Folgen („Folge für Kreatur #2“), Frage in der Caption.

## Skript (10,3 s, 1080×1920, 30 fps, stille AAC-Spur)
| Zeit | Bild (echtes Spiel, Testmodus, Kartengrund ohne Kacheln) | Untertitel |
|---|---|---|
| 0,0–0,7 s | Wanderer (Level 2) schießt mit der Schleuder auf den Waldigel, „-13“ | Der Waldigel. Klein, friedlich, stachelig. |
| 0,7–3,6 s | Details im Kampf (ⓘ): „Friedlich, wehrt sich nur“, „Lebensraum: Wald, Wiese & Feld“, „Dornen: Verletzt dich, wenn du zuschlägst“; der Igel wehrt sich („-1“) | Dornen: Jeder Treffer sticht zurück. |
| 3,6–6,1 s | Kampf, Details sichtbar | Lebt im Wald und auf Wiese und Feld. |
| 6,1–8,3 s | zweiter Schuss: Igel besiegt, Dornen-Schaden „-2“ an der Figur, Meldung „Waldigel besiegt! +1 Fell“ | Beute: mit etwas Glück ein Fell. |
| 7,9–10,3 s | Schlusskarte: Logo, „Kreatur der Woche #1 · Folge für Kreatur #2 · Jede Woche eine neue Kreatur aus Ruin Walk.“ | – |

Herstellung: `node marketing/grafiken/reels_aufnahme.js igel` (committeter Stand, Testmodus Augsburg ohne Kartenkacheln, Zoom 19). Zufall im Testlauf festgelegt: kein kritischer Treffer, das Fell fällt (40 %-Chance im Spiel, also ein echtes mögliches Ergebnis; die Caption sagt „mit etwas Glück“). Einzelbilder angesehen (23.11.2026).

## Faktenprüfung
- Waldigel, normales Monster, friedlich (greift nicht von selbst an) → `MOBS.igel` (`tier:'normal'`, kein `ag`), Kampfkarte „🕊️ Friedlich, wehrt sich nur“ → live
- Dornen: verletzt dich, wenn du zuschlägst → `MOBS.igel.ab:'dorn'`, `ABIL.dorn`, `strike()` (Rückschaden 12 % des eigenen Schadens, mind. 1) → live
- Lebensraum Wald sowie Wiese & Feld → `MOBS.igel.hab:'wg'`, `HAB.w` „Wald“, `HAB.g` „Wiese & Feld“ → live
- Beute Fell mit Chance → `MOBS.igel.drops` `{i:'fell',c:.4}` → live
- Wanderer mit Schleuder → `CLASSES.wanderer` (`w:'Schleuder'`) → live
- Ruin Walk insgesamt → in Entwicklung (nicht öffentlich)
- Keine Zahlen zu Leben/Schaden in Caption (Balancing kann sich ändern); im Bild nur die echten Spielwerte.

## Caption Instagram
Kreatur der Woche, Folge 1: der Waldigel. Wer zuschlägt, sticht sich.

Der Waldigel greift nie von selbst an. Er wehrt sich nur. Doch seine Dornen verletzen dich bei jedem Treffer, den du landest.

Du triffst ihn im Wald und auf Wiesen und Feldern. Mit etwas Glück lässt er ein Fell fallen.

Alles im Video ist echte Spielgrafik. Ruin Walk ist noch in Entwicklung.

Welche Kreatur soll nächste Woche dran sein?

#ruinwalk #pixelart #gpsgame #pixelrpg #indiedevde

## Hashtags
#ruinwalk #pixelart #gpsgame #pixelrpg #indiedevde

## Alt-Text
Kurzes Hochformat-Video aus Ruin Walk. Eine Pixel-Art-Figur mit Kapuze und Schleuder schießt auf einen kleinen Igel auf einer hellen Karte, rote Schadenszahlen steigen auf. Oben eine Infokarte: Waldigel, friedlich, Lebensraum Wald, Wiese und Feld, Dornen verletzen dich, wenn du zuschlägst. Nach dem zweiten Treffer erscheint „Waldigel besiegt! +1 Fell“. Zum Schluss das Logo und „Folge für Kreatur #2“.

## Notizen für Pascal
- Keine Freigabe nötig (Reel-Sperre erledigt). Ohne Musik.
