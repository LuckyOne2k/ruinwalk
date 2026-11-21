---
id: 007
titel: Reel 1 – Vom Wanderer zum Hohepriester, die dritte Stufe bleibt geheim (Klassenentwicklung, Maßnahme A1)
kanal: instagram
format: reel
geplant_fuer: nach Freigabe durch Pascal (Vorschlag 14-Tage-Plan: So 22.11.2026 oder Di 24.11.2026, 17:35)
status: veroeffentlicht
freigegeben_von: Pascal
freigegeben_am: 2026-11-21 (Chat: „Reel 007 freigegeben“)
video: marketing/grafiken/entwuerfe/007_reel_wanderer_priester.mp4
video_url:
vorschau_ms: 5300
bild: marketing/grafiken/entwuerfe/007_reel_wanderer_priester_vorschau.jpg
veroeffentlicht_am: 2026-11-21 18:26 MEZ (17:26:53 UTC, autonom, instagram-reel:18086472044338803)
link: https://www.instagram.com/reel/DgAw32etR9P/
---

## Ziel
Reichweite bei Nicht-Followern (erstes Reel, Maßnahme A1 aus `12_reichweite_analyse.md`), Speichern und Kommentare. In 14 Sekunden zeigt das Reel echte Spielgrafik: dieselbe Figur auf vier Stufen. Am Ende steht das Geheimnis der dritten Stufe, wie das Spiel es selbst zeigt. CTA: Frage in der Caption.
Regel (Pascal, 20.11.2026): Verborgene Klassen werden nie beim Namen genannt, keine Namen, Werte oder Bilder. Hinweise und der im Spiel sichtbare Rätselspruch sind erwünscht.

## Skript (13,8 s, 1080×1920, 30 fps, ohne Ton)
| Zeit | Bild (echtes Spiel, Testmodus ohne Karte) | Text oben | Untertitel |
|---|---|---|---|
| 0,0–2,6 s | Charakter-Bildschirm: Wanderer, Level 4 | LEVEL 4 · Noch keine Klasse. | Du startest als Wanderer. |
| 2,2–4,6 s | Heiler, Level 5 (weiße Überblendung = Verwandlung) | LEVEL 5 · GRUNDKLASSE · Heiler | Neue Fähigkeit: Heilendes Licht |
| 4,1–6,5 s | Priester, Level 15 | LEVEL 15 · PFADSTUFE 1 · Priester | Neue Fähigkeit: Gebet |
| 6,1–8,5 s | Hohepriester, Level 30 | LEVEL 30 · PFADSTUFE 2 · Hohepriester | Neue Fähigkeit: Heiliger Schild |
| 8,0–11,0 s | Bildschirm „Klassenentwicklung“ auf Stufe 2, Ausschnitt: „❓ Verborgene Klasse“, Rätselspruch, „Name und Werte bleiben geheim …“ (die Stufen-Anforderungen darüber sind ausgeblendet) | LEVEL 50 · STUFE 3 · Verborgene Klasse | Die dritte Stufe bleibt ein Geheimnis. |
| 10,6–13,8 s | Schlusskarte: Logo, Waldruinen-Hintergrund | 4 KLASSEN · 12 PFADE · 36 STUFEN – Welchen Weg gehst du? | Ein GPS-Fantasy-RPG im Browser. Echte Spielgrafik. Badge „In Entwicklung“ |

Keine Figur, kein Name, keine Fähigkeit und keine Bedingungen oder Zahlen der verborgenen Stufe im Bild (Einzelbilder angesehen, 21.11.2026).
Herstellung (wiederholbar): `node marketing/grafiken/reel_007_aufnahme.js`. Playwright öffnet `index.html` im Testmodus (Karte, OSM und Supabase abgeschaltet, kein Standort), setzt die Spielstände, fotografiert die Bildschirme (405×720 bei Faktor 2,67 = 1080×1920), legt das Markenband darüber (es verdeckt HUD und Testmodus-Anzeige) und schneidet mit ffmpeg (leichter Zoom, Überblendungen, H.264, stille AAC-Spur, `+faststart`). Ergebnis: 3,6 MB, 13,8 s (neu erzeugt 21.11.2026 mit „Level 50“). Die Texte liegen zwischen 215 und 1520 px Höhe, also außerhalb der Bereiche, die die Reels-Oberfläche verdeckt.

## Faktenprüfung
- Start als Wanderer ohne Klasse → `CLASSES.wanderer` `blurb:'Noch keine Klasse.'`; Standard-Spielstand `cls:'wanderer'` → live
- Klassenwahl ab Level 5 → `CLASS_LV=5` → live
- Vier Grundklassen → `PICK=['krieger','bogen','magier','heiler']`, `CLASSES` → live
- Heiler-Fähigkeit „Heilendes Licht“ ab Level 5 → `CLASSES.heiler.sk` `{n:'Heilendes Licht', lv:5}` → live
- Pfadstufen 1 und 2 bei Level 15 und 30, dritte Stufe ab Level 50 → `UP_LV=[15,30,50]` (`index.html` ~725); die Klassenentwicklung zeigt auf Stufe 2 „Stufe 50“ als Anforderung → live. Das nötige Level der dritten Stufe darf genannt werden (Entscheidung Pascal 21.11.2026), alle übrigen Bedingungen bleiben geheim
- Priester → Hohepriester mit den Fähigkeiten Gebet und Heiliger Schild → `PATHS.priester.st[0]`, `st[1]` (`sk.n`) → live
- Dritte Stufe = verborgene Klasse, Name und Werte geheim bis zum Erwecken → Klassenentwicklung (`openSheet('up')`, Zweig `S.tier===2`): „❓ Verborgene Klasse … Name und Werte bleiben geheim, bis du die Bedingung erfüllt hast“; Pfadwahl zeigt `st[0].n → st[1].n → ❓` → live
- Rätselspruch „Wer Leben bewahrt, wird vom Himmel gesandt.“ → `SECRET.priester.h`, im Spiel vor dem Erwecken sichtbar → live (die Bedingung selbst wird nicht genannt)
- Nicht gezeigt: Anforderungen der Klassenquest `UPQ[2]` („Prüfung des Verborgenen“) – Regel: keine Bedingungen, Zahlen oder Werte der dritten Stufe
- 12 Pfade, 36 Stufen → `PATHS` (12 Pfade × 3 Stufen) → live; nur die Anzahl, keine Namen der dritten Stufen
- Bilder: echter Charakter-Bildschirm (Figur über `figTok()`) und Klassenentwicklung; Leben per `maxHP()` auf voll gesetzt → live
- Ruin Walk insgesamt → in Entwicklung (nicht öffentlich, `config.json` `spiel_oeffentlich: false`)
- Nicht erwähnt: Name, Fähigkeit, Werte oder Figur der verborgenen Stufe; Mehrspieler, Dungeons, Weltboss; Termine; Links.

## Caption Instagram
Vom Wanderer zum Hohepriester. Und dann? Die dritte Stufe bleibt ein Geheimnis.

Du beginnst ohne Klasse. Ab Level 5 wählst du eine von vier Grundklassen, hier den Heiler. Mit Level 15 und 30 steigst du auf deinem Pfad weiter auf und bekommst jedes Mal eine neue Fähigkeit: Gebet und Heiliger Schild.

Ab Level 50 wartet eine verborgene Klasse. Name und Werte bleiben geheim, bis du ihre Bedingung erfüllst. Im Spiel steht nur ein Rätselspruch: „Wer Leben bewahrt, wird vom Himmel gesandt.“

Alles im Video ist echte Spielgrafik. Ruin Walk ist noch in Entwicklung.

Was glaubst du, wer sich dahinter verbirgt?

#ruinwalk #pixelrpg #gpsrpg #pixelartgame #fantasyrpgde

## Text Facebook
(nicht geplant, Facebook nicht in `erlaubte_kanaele`; Reels per Skript nur für Instagram)

## Hashtags
#ruinwalk #pixelrpg #gpsrpg #pixelartgame #fantasyrpgde
(4 Nische, 1 mittel; Schlüsselwörter „Pixel-Art“, „RPG“, „Klasse“, „Level“ stehen zusätzlich in Caption und Video, Maßnahme A5.)

## Alt-Text
Kurzes Hochformat-Video aus Ruin Walk. Im Charakter-Bildschirm verwandelt sich eine Pixel-Art-Figur in vier Schritten: Wanderer mit Kapuze und Schleuder auf Level 4, grün gekleideter Heiler mit Stab auf Level 5, weiß gekleideter Priester mit Heiligenschein auf Level 15 und Hohepriester mit goldenem Umhang auf Level 30. Oben stehen jeweils Level und Name, unten die neue Fähigkeit. Danach erscheint „Level 50 · Stufe 3“ über dem Bildschirm Klassenentwicklung mit einem Fragezeichen, der Überschrift „Verborgene Klasse“ und dem Spruch „Wer Leben bewahrt, wird vom Himmel gesandt.“. Zum Schluss das Ruin-Walk-Logo vor dunklen Waldruinen mit dem Text „4 Klassen, 12 Pfade, 36 Stufen. Welchen Weg gehst du?“ und dem Hinweis „In Entwicklung“.

(Die Graph API überträgt Alt-Text nur bei Bildbeiträgen, nicht bei Reels. Pascal kann ihn nach dem Posten in der App ergänzen, falls die App das für Reels anbietet.)

## Notizen für Pascal
- **Freigabe nötig:** Das erste Reel sendet das Skript nur, wenn hier genau `freigegeben_von: Pascal` steht. Das Feld trägst nur du ein. Danach `status: autonom` oder `freigegeben` setzen.
- Diese Fassung ersetzt die frühere mit Namen (gelöscht nach deiner Entscheidung vom 20.11.2026).
- Die Kommentar-Frage lädt zum Raten ein. Antworten auf Rateversuche dürfen den Namen weder bestätigen noch verneinen (Regel in `13_beitragsmix_serien.md`).
- **Vor dem Senden:** Video committen und auf den Arbeitszweig pushen (raw.githubusercontent.com). GitHub liefert MP4 als `application/octet-stream` aus. Ob Instagram das annimmt, zeigt erst der erste echte Upload. Lehnt Instagram ab, das Reel in der App posten (dann auch mit Musik) oder `video_url:` auf eine andere Ablage setzen.
- Ohne Ton (stille Spur). Musik geht per API nicht.
- Titelbild: `vorschau_ms: 5300` (Priester). Reel zählt als Feed-Beitrag (max. 1 pro Tag).
