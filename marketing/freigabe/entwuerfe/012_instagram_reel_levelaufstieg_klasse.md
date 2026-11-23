---
id: 012
titel: Reel – Levelaufstieg #1: Level 5, Klassenwahl (Bogenschütze)
kanal: instagram
format: reel
geplant_fuer: Sa 28.11.2026, 17:35 (Reel-Tag Sa)
status: entwurf
freigegeben_von:
freigegeben_am:
video: marketing/grafiken/entwuerfe/012_reel_levelaufstieg_klasse.mp4
video_url:
vorschau_ms: 6500
bild: marketing/grafiken/entwuerfe/012_reel_levelaufstieg_klasse_vorschau.jpg
veroeffentlicht_am:
link:
---

## Ziel
Reichweite, Serie „Levelaufstieg“ (der Moment, in dem sich etwas ändert). Bewegung ab Bild 1: Schleuderschüsse auf einen Rohling, der Sieg bringt Level 5. CTA: Folgen („Folge für Teil 2 – Level 15: die erste Pfadstufe“), Frage in der Caption.

## Skript (14,0 s, 1080×1920, 30 fps, stille AAC-Spur)
| Zeit | Bild (echtes Spiel, Testmodus, Kartengrund ohne Kacheln) | Untertitel |
|---|---|---|
| 0,0–1,0 s | Wanderer Level 4 schießt auf einen Rohling, Schadenszahl | Level 4. Noch fünf Erfahrungspunkte. |
| 1,0–2,3 s | zweiter Schuss, Rohling besiegt, Level springt auf 5 | Ein Rohling. Jeder Sieg bringt Erfahrung. |
| 2,3–4,6 s | Karte, Level 5 im HUD, Meldung „Rohling besiegt!“ | Level 5: Zeit für eine Klasse. |
| 4,6–8,7 s | Charakter-Bildschirm (Level 5), dann „Klasse wählen“ mit Krieger, Bogenschütze, Elementarmagier, Heiler; Bogenschütze wird ausgewählt und bestätigt | Vier Grundklassen stehen zur Wahl. |
| 8,7–11,6 s | Karte: Figur ist jetzt Bogenschütze, Meldung „Du bist jetzt Bogenschütze! Neue Fähigkeit: Zielschuss“ | Bogenschütze. Neue Waffe, neuer Weg. |
| 11,6–14,0 s | Schlusskarte: „Levelaufstieg #1 · Folge für Teil 2 · Level 15: die erste Pfadstufe.“ | – |

Herstellung: `node marketing/grafiken/reels_aufnahme.js level` (committeter Stand, Testmodus Augsburg ohne Kartenkacheln, Zoom 19). Der Hinweistext im Fenster „Klasse wählen“ („… Klassenwechsel kommen später“) ist herausgescrollt und nicht im Bild – keine Ankündigung. Einzelbilder angesehen (23.11.2026).

## Faktenprüfung
- Start als Wanderer ohne Klasse, Klassenwahl ab Level 5 → `CLASSES.wanderer` („Noch keine Klasse.“), `CLASS_LV=5`, `addXP` („Du kannst jetzt eine Klasse wählen“) → live
- Level 4 → 5 braucht 160 Erfahrung (`S.lv*40`), Spielstand 155 → „noch fünf Erfahrungspunkte“ → live
- Rohling besiegen bringt Erfahrung → `MOBS.rohling` (`xp:8`), `strike()` → `addXP` → live
- Vier Grundklassen → `PICK=['krieger','bogen','magier','heiler']`, Fenster `openSheet('class')` → live
- Bogenschütze mit Bogen, größere Reichweite → `CLASSES.bogen` (`w:'Bogen'`, `range:60`) → live; erste Fähigkeit wird im Spiel gemeldet (Text aus `C0().sk`)
- Level 15 = erste Pfadstufe → `UP_LV=[15,30,50]` → live (Schlusskarte nennt nur Stufe 1, nichts zur dritten Stufe)
- Ruin Walk insgesamt → in Entwicklung (nicht öffentlich)

## Caption Instagram
Level 5. Der Moment, in dem aus dem Wanderer jemand wird.

Du startest ohne Klasse, nur mit einer Schleuder. Jeder Sieg bringt Erfahrung. Mit Level 5 wählst du eine von vier Grundklassen: Krieger, Bogenschütze, Elementarmagier oder Heiler.

Hier wird es der Bogenschütze. Neue Waffe, neue Fähigkeit, neuer Weg. Mit Level 15 wartet die erste Pfadstufe.

Alles im Video ist echte Spielgrafik. Ruin Walk ist noch in Entwicklung.

Welche Klasse hättest du gewählt?

#ruinwalk #rpgklassen #pixelrpg #gpsrpg #pixelartgame

## Hashtags
#ruinwalk #rpgklassen #pixelrpg #gpsrpg #pixelartgame

## Alt-Text
Kurzes Hochformat-Video aus Ruin Walk. Eine Pixel-Art-Figur mit Kapuze schießt mit der Schleuder auf ein graues Tier, die Levelanzeige springt von 4 auf 5. Danach öffnet sich der Charakter-Bildschirm und das Fenster „Klasse wählen“ mit vier Klassen und ihren Figuren; der Bogenschütze wird ausgewählt. Zurück auf der Karte trägt die Figur jetzt Bogen und grüne Kleidung, eine Meldung nennt die neue Fähigkeit. Zum Schluss das Logo und „Folge für Teil 2“.

## Notizen für Pascal
- Keine Freigabe nötig (Reel-Sperre erledigt). Ohne Musik.
- Name „Elementarmagier“ steht so im Spiel (Klassenwahl); bitte bestätigen, falls die Klasse öffentlich nur „Magier“ heißen soll.
