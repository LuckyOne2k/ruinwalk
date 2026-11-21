---
id: 004
titel: Karussell – Fünf Lebensräume (Idee 9)
kanal: instagram
format: karussell
geplant_fuer: Tag 3 (Mi) laut Redaktionskalender, Uhrzeit legt Pascal fest
status: entwurf
freigegeben_von:
freigegeben_am:
bild: marketing/grafiken/entwuerfe/004_karussell_lebensraeume_1.jpg (+ _2 bis _6)
bild_url:
veroeffentlicht_am:
link:
---

## Ziel
Bindung und Speicherungen: Das Alleinstellungsmerkmal „deine echte Umgebung bestimmt das Spiel“ greifbar machen. Nebenziel: Kommentare über die Frage am Ende.

## Aufbau des Karussells (6 Seiten)
| Seite | Layout | Kicker | Schlagzeile | Inhalt |
|---|---|---|---|---|
| 1 | `titel` (gerendert) | Fünf Lebensräume | Jeder Ort hat seine Kreaturen. | „Echte Kartendaten bestimmen, wer dir begegnet. Wisch dich durch 👉“ |
| 2 | `klasse` (Sprites) | 1 · Wald 🌲 | Unter alten Bäumen. | Waldspinne, Wildkeiler, Eichhörnchen · mehr Bäume |
| 3 | `klasse` (Sprites) | 2 · Wiese & Feld 🌾 | Offenes Land. | Feldhase, Giftschlange, Streunender Hund · mehr Heilkraut |
| 4 | `klasse` (Sprites) | 3 · Sumpf & Wasser 💧 | Wo der Boden nachgibt. | Blutegel, Mückenschwarm, Riesenfrosch · mehr Ranken |
| 5 | `klasse` (Sprites) | 4 · Fels & Berg ⛰️ | Zwischen kaltem Stein. | Bergziege, Goblin, Steinskorpion · mehr Erz |
| 6 | `klasse` (Sprites) | 5 · Ruinen & Siedlung 🏚️ | Was von Städten bleibt. | Kanalratte, Irrlicht, Riesenfledermaus · Frage: „Wo gehst du am liebsten?“ |

Motivdatei für Seite 1: `marketing/grafiken/lebensraeume-motive.json`.

## Faktenprüfung
- Fünf Lebensräume mit genau diesen Namen und Symbolen → `index.html` `const HAB` (Wald 🌲, Wiese & Feld 🌾, Sumpf & Wasser 💧, Fels & Berg ⛰️, Ruinen & Siedlung 🏚️) → live
- Lebensräume aus echten OpenStreetMap-Daten → `habClass()` wertet OSM-Tags `landuse`/`natural`/`leisure` aus, Projektwissen `spielsysteme.md` → live. Einschränkung: Fehlen OSM-Daten, greift eine Ersatzzone (`fbHab`). Darum heißt es im Text „echte Kartendaten bestimmen“ und nicht „jeder Meter ist exakt kartiert“.
- Siedlung zählt als Ruinen: `habClass()` ordnet `residential`, `commercial`, `industrial`, `cemetery` u. a. dem Lebensraum `r` zu → live
- Lebensraum bestimmt die Kreaturen → `pickMob(tier, hab)` filtert `MOBS` nach `hab` → live
- Monster je Lebensraum (alle `tier:'normal'`, also ohne Gebietsstufen-Sperre):
  - Wald: Waldspinne `hab:'w'`, Wildkeiler `hab:'w'`, Eichhörnchen `hab:'w'`
  - Wiese & Feld: Feldhase `'g'`, Giftschlange `'gs'`, Streunender Hund `'gr'`
  - Sumpf & Wasser: Blutegel `'s'`, Mückenschwarm `'s'`, Riesenfrosch `'s'`
  - Fels & Berg: Bergziege `'f'`, Goblin `'fr'`, Steinskorpion `'fg'`
  - Ruinen & Siedlung: Kanalratte `'r'`, Irrlicht `'sr'`, Riesenfledermaus `'fr'`
  - Die Listen sind eine Auswahl. Bewusst nicht genannt: Elitegegner, weil sie erst ab Gebietsstufe 2 auftauchen
- Ressourcen je Lebensraum → `const HABW`: Wald `baum:2.2`, Wiese `kraut:2.2`, Sumpf `ranke:1.8`, Fels `erz:2.4` → live (seit Phase A)
- Nicht erwähnt (nicht vorhanden): Wetter/Tageszeit-Wirkung, Landmarken, Mehrspieler
- Titelgrafik: Logo, gemalter Hintergrund `assets/bg_chars.jpg` (echtes Spiel-Asset), keine Spielszene behauptet, Badge „In Entwicklung“

## Caption Instagram
Im Wald begegnen dir andere Kreaturen als am Wasser. Fünf Lebensräume im Überblick 👉

Ruin Walk nutzt echte Kartendaten von OpenStreetMap. Daraus entstehen fünf Lebensräume:

🌲 Wald: Waldspinne, Wildkeiler, Eichhörnchen
🌾 Wiese & Feld: Feldhase, Giftschlange, Streunender Hund
💧 Sumpf & Wasser: Blutegel, Mückenschwarm, Riesenfrosch
⛰️ Fels & Berg: Bergziege, Goblin, Steinskorpion
🏚️ Ruinen & Siedlung: Kanalratte, Irrlicht, Riesenfledermaus

Auch die Rohstoffe am Weg hängen davon ab. Im Wald wächst mehr Holz, auf der Wiese mehr Heilkraut, am Fels liegt mehr Erz.

In welchem Lebensraum gehst du am liebsten spazieren? Schreib es in die Kommentare.

#ruinwalk #gpsrpg #standortspiel #pixelrpg #gpsgame

## Text Facebook
(nicht geplant, Karussell nur für Instagram)

## Hashtags
#ruinwalk #gpsrpg #standortspiel #pixelrpg #gpsgame
(Pool GPS/Draußen + RPG: 4 Nische, 1 mittel. Größe der Tags vor dem Posten in der App prüfen.)

## Alt-Text
Seite 1: Dunkler, gemalter Wald mit Ruinen, darauf das Ruin-Walk-Logo. Text: „Fünf Lebensräume. Jeder Ort hat seine Kreaturen. Echte Kartendaten bestimmen, wer dir begegnet.“ Unten rechts der Hinweis „In Entwicklung“.
Seite 2: Lebensraum Wald, Titel „Im Unterholz“. Drei Pixel-Art-Kreaturen vor dunklen Waldruinen: eine große braune Spinne mit gelben Augen, ein kleiner Wildkeiler mit Hauern und ein Eichhörnchen. Text: „Waldspinne, Wildkeiler und Eichhörnchen. Mehr Bäume, mehr Holz.“
Seite 3: Lebensraum Wiese und Feld, Titel „Auf offenem Land“. Ein weißer Feldhase, eine grüne Giftschlange und ein brauner streunender Hund in Pixel-Art. Text: „Feldhase, Giftschlange und streunende Hunde. Hier wächst viel Heilkraut.“
Seite 4: Lebensraum Sumpf und Wasser, Titel „Am Wasser“. Ein roter Blutegel, eine Mücke mit blauen Flügeln und ein grüner Riesenfrosch in Pixel-Art. Text: „Blutegel, Mückenschwärme und Riesenfrösche. Ranken gibt es reichlich.“
Seite 5: Lebensraum Fels und Berg, Titel „Zwischen Steinen“. Eine weiße Bergziege mit Hörnern, ein grüner Goblin mit Keule und ein oranger Steinskorpion in Pixel-Art. Text: „Bergziegen, Goblins und Steinskorpione. Hier findest du mehr Erz.“
Seite 6: Lebensraum Ruinen und Siedlung, Titel „Zwischen alten Mauern“. Eine graue Kanalratte, ein blaues Irrlicht und eine graue Fledermaus mit roten Augen in Pixel-Art. Text: „Kanalratten, Irrlichter und Riesenfledermäuse.“

## Notizen für Pascal
- Seiten 2–6 sind gerendert (echte Monster-Sprites, siehe Nachtrag unten); Alt-Text je Seite ist ergänzt (20.11.2026).
- Bitte prüfen: Passt die Frage am Ende, oder lieber „Speichern für den nächsten Spaziergang“? Es soll nur ein Call-to-Action sein.
- Kartenscreenshots mit echten Lebensräumen sind im Testmodus nicht möglich (keine Kartenkacheln). Falls du einen eigenen machst, bitte ohne erkennbare Wohnadresse.
- Die Story-Umfrage „Wald oder Sumpf?“ an Tag 4 passt dazu und kann die Kommentare aufgreifen.


## Nachtrag Hauptsitzung (18.11.2026)
Seiten 2–6 sind jetzt mit den echten Monster-Sprites gerendert (`sprites-export.js` → `marketing/grafiken/sprites/`, Motive in `marketing/grafiken/lebensraeume-motive.json`). Zuordnung aller 15 Kreaturen zu ihren Lebensräumen gegen `MOBS[*].hab` nachgeprüft. Offener Punkt 1 aus dem Agentenbericht ist damit erledigt; Punkte 2 und 3 bleiben bei Pascal.
