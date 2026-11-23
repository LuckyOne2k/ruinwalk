---
id: 010
titel: Reel – Gebietsboss #1 Bergtroll (Abwehr gegen den Felsbrocken)
kanal: instagram
format: reel
geplant_fuer: Mo 23.11.2026, 17:35 (Reel-Tag Mo, Wochenplan 13_beitragsmix_serien.md)
status: entwurf
freigegeben_von:
freigegeben_am:
video: marketing/grafiken/entwuerfe/010_reel_gebietsboss_bergtroll.mp4
video_url:
vorschau_ms: 800
bild: marketing/grafiken/entwuerfe/010_reel_gebietsboss_bergtroll_vorschau.jpg
veroeffentlicht_am:
link:
---

## Ziel
Reichweite bei Nicht-Followern (Reels als Hauptformat, Entscheidung Pascal 23.11.2026). Serie „Gebietsboss“ (#1 von 5). Bewegung ab Bild 1: Treffer, Schadenszahlen, der Troll schlägt zurück. CTA: Folgen (Schlusskarte „Folge für Teil 2“) und Frage in der Caption.

## Skript (15,3 s, 1080×1920, 30 fps, stille AAC-Spur)
| Zeit | Bild (echtes Spiel, Testmodus, Kartengrund ohne Kacheln) | Untertitel |
|---|---|---|
| 0,0–2,6 s | Paladin (Level 45) im Kampf mit dem Bergtroll, Schadenszahlen, Leben sinkt | Der Bergtroll. Gebietsboss aus Fels und Berg. |
| 2,6–5,3 s | Meldung „Die Haut des Trolls wird hart! Ein kritischer Treffer bricht sie“, Hinweis „Harte Haut“ | Seine Haut wird hart. Nur kritische Treffer brechen sie. |
| 5,3–7,5 s | (Schnitt: Wartezeit bis zum Spezialangriff entfernt) Telegraph „🪨 Felsbrocken · Wucht → 🛡️ Abwehr“ mit ablaufendem Balken, Abwehr wird getippt | Er hebt einen Felsbrocken. Jetzt: Abwehr! |
| 7,5–9,6 s | „Du gehst in Deckung“, Abwehr ✅, danach „Kritisch! … Haut zerbrochen“ | Abgewehrt. Doch der Kampf geht weiter. |
| 9,6–12,9 s | weiterer Kampf | Fünf Gebietsbosse, jeder mit eigener Mechanik. |
| 12,9–15,3 s | Schlusskarte: Logo, „Gebietsboss #1 · Folge für Teil 2 · Nächster Gebietsboss, neue Mechanik.“, Badge „In Entwicklung · echte Spielgrafik“ | – |

Herstellung (wiederholbar): `node marketing/grafiken/reels_aufnahme.js boss`. Aufnahme aus dem committeten Stand (`git archive HEAD`, `index.html` = Stand `main`), Testmodus-Startposition Augsburg, keine Kartenkacheln (keine echten Orte sichtbar), Anzeige „Testmodus“ ausgeblendet, Karte auf Zoom 19 (wie Zwei-Finger-Zoom). Vorlauf (Troll läuft heran) und Wartezeit bis zum Spezialangriff herausgeschnitten; vor dem Spezialangriff Leben der Figur aufgefüllt (ersetzt im Schnitt einen Heiltrank). Startleben des Trolls auf 7.520 gesetzt, damit die Phase „Harte Haut“ (unter 75 %) im Bild liegt. Einzelbilder angesehen (23.11.2026): keine verborgene Klasse, keine Karte mit Orten.

## Faktenprüfung
- Bergtroll ist ein Gebietsboss mit Lebensraum Fels & Berg und Fähigkeit Panzer → `MOBS.bergtroll` (`tier:'area'`, `hab:'f'`, `ab:'panzer'`), `HAB.f` „Fels & Berg“ → live
- Spezialangriff Felsbrocken (Wucht, Abwehr hilft), Ansage „Der Troll hebt einen Felsbrocken“ → `BFX.bergtroll.a` (`t:'wucht'`), `reactDo('guard')`, `bossResolve` (Abwehr senkt den Schaden) → live
- Harte Haut ab Phase 2, kritischer Treffer bricht sie → `bossTick` (`k==='bergtroll'` → `bf.haut`, Meldung „Die Haut des Trolls wird hart! Ein kritischer Treffer bricht sie“) → live
- Fünf Gebietsbosse, jeder mit eigener Mechanik → `MOBS` mit `tier:'area'` (5: urmammut, baumriese, sumpfsaurier, bergtroll, aschedrache), je ein Eintrag in `BFX` mit eigenen Angriffen, dazu Phasen in `bossTick` (Sprösslinge, harte Haut, Flugphase …) → live
- Figur: Paladin = Pfadstufe 2 des Ritter-Pfads (`PATHS.ritter.st[1]`), sichtbar erlaubt; keine dritte Stufe im Bild oder Text → live
- Ruin Walk insgesamt → in Entwicklung (nicht öffentlich, `config.json` `spiel_oeffentlich: false`)
- Nicht erwähnt: verborgene Klassen, Mehrspieler, Dungeons, Weltboss, Termine, Links.

## Caption Instagram
Der Bergtroll hebt einen Felsbrocken. Du hast drei Sekunden.

Gebietsbosse kündigen ihre Spezialangriffe an. Gegen Wucht hilft Abwehr, gegen Zauber Unterbrechen. Wer richtig reagiert, steckt nur einen Bruchteil ein.

Der Bergtroll hat noch einen Trick: Fällt sein Leben unter drei Viertel, wird seine Haut hart. Dann brechen sie nur kritische Treffer.

Fünf Gebietsbosse gibt es, jeder mit eigener Mechanik. Alles im Video ist echte Spielgrafik. Ruin Walk ist noch in Entwicklung.

Welchen Boss sollen wir als Nächstes zeigen?

#ruinwalk #pixelrpg #gpsrpg #rpg #indiegame

## Hashtags
#ruinwalk #pixelrpg #gpsrpg #rpg #indiegame

## Alt-Text
Kurzes Hochformat-Video aus Ruin Walk. Eine Pixel-Art-Figur in weißer Rüstung mit Schild kämpft auf einer hellen Karte gegen einen grauen Troll mit Krone, rote Schadenszahlen steigen auf. Oben eine Leiste mit „Bergtroll, Gebietsboss“ und Lebensbalken. Eine Warnung „Felsbrocken, Wucht, Abwehr“ mit ablaufendem Balken erscheint, die Figur geht in Deckung. Untertitel erklären: harte Haut, Abwehr, fünf Gebietsbosse. Zum Schluss das Logo und „Folge für Teil 2“.

## Notizen für Pascal
- Keine Freigabe nötig: Die Sperre „erstes Reel“ ist mit Reel 007 erledigt (`instagram-reel:` steht im LOG). Der Lauf setzt `status: autonom` nach bestandener Prüfung.
- Ohne Musik (stille Spur). Wenn du Musik willst: in der App posten.
- „Drei Sekunden“: Ansagezeit 3,4 s bzw. 2,8 s in der letzten Phase (`bossTick`, `dur`).
