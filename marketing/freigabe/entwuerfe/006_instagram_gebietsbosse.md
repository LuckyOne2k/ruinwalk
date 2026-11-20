---
id: 006
titel: Einzelbild – Gebietsbosse: Lies den Angriff (Ideen 12 + 13)
kanal: instagram
format: post
geplant_fuer: nach 005 (Feed täglich 17:35 Uhr), Uhrzeit legt der geplante Lauf bzw. Pascal fest
status: entwurf
freigegeben_von:
freigegeben_am:
bild: marketing/grafiken/entwuerfe/006_gebietsbosse.jpg
bild_url:
veroeffentlicht_am:
link:
---

## Ziel
Neugier und Speicherungen: Zeigen, dass Kämpfe in Ruin Walk mehr sind als Draufhauen. Die Gebietsbosse kündigen Angriffe an, du reagierst. Ersetzt vorerst das Reel aus Idee 12 (Bildschirmaufnahme fehlt) durch ein Einzelbild mit echten Sprites. Kommentar-Frage als CTA.

## Faktenprüfung
- Fünf Gebietsbosse: Uralter Baumriese, Urmammut, Sumpfsaurier, Bergtroll, Aschedrache → `index.html` `MOBS` mit `tier:'area'` (5 Einträge) → live
- Gebietsbosse erscheinen erst ab Gebietsstufe 4 → `BAND_MIN.area=4`, `areaEnts()` (`if(bd>=BAND_MIN.area)`) → live
- Gebietsboss greift erst an, wenn du ihn angreifst → Info-Karte `'Gebietsboss · greift erst an, wenn du ihn angreifst'` → live
- Hook „Der Drache holt tief Luft“ = wörtlicher Ankündigungstext des Feuerodems → `BFX.aschedrache` `h:'Der Drache holt tief Luft'` → live
- Angriffe werden angekündigt (Telegraph mit Zeitbalken) → `BFX` (Ankündigungstexte `h`), `bossTick()`, `bossUI()` (Balken `.tb`) → live
- Wucht wird abgewehrt, Zauber unterbrochen → `reactDo()`: `guard` nur gegen `t:'wucht'`, Unterbrechen nur gegen `t:'zauber'`; `bossUI` zeigt „Wucht → 🛡️ Abwehr“ / „Zauber → ⚡ Unterbrechen“ → live
- Angriffsnamen in Grafik und Caption → `BFX`: Aschedrache „🔥 Feuerodem“ (zauber) + „🐉 Schwanzschlag“; Baumriese „🌿 Wurzeln“ (zauber); Urmammut „🐘 Ansturm“ (wucht) + „🌋 Erdbeben“; Sumpfsaurier „☠️ Giftwolke“ (zauber) + „💦 Säurestrahl“; Bergtroll „🪨 Felsbrocken“ (wucht) → live
- Zuordnung Boss → Lebensraum: Baumriese `hab:'w'` (Wald), Urmammut `'g'` (Wiese), Sumpfsaurier `'s'` (Sumpf), Bergtroll `'f'` (Fels), Aschedrache `'r'` (Ruinen) → live
- Unter 35 % Leben geraten Gebietsbosse in Raserei (mehr Schaden) → `if(m.tier==='area'&&hpNow<m.hp*.35)h=Math.round(h*1.4)` und Status `raserei` → live
- Wer abwehrt, nimmt deutlich weniger Schaden → `if(t.ok==='guard')dmg=Math.round(dmg*(…))` (Faktor 0,15–0,4 je Klasse/Stufe) → live. Im Text ohne Zahlen.
- Nicht erwähnt: Mehrspieler/Gruppenkampf gegen Bosse (nicht live), Weltboss (Prototyp), konkrete Lebenspunkte/Schadenswerte.
- Grafik: Vorlage `klasse`, echte Monster-Sprites aus `sprites_mobs.js`, exportiert nach `marketing/grafiken/sprites/m_*.png` (`sprites-export.js`), Hintergrund `assets/bg_create.jpg`. Vier der fünf Bosse auf dem Bild (fünf passen nicht in die Vorlage), Bergtroll steht in der Caption. Badge „In Entwicklung“. Motivdatei `marketing/grafiken/woche3-motive.json`.

## Caption Instagram
Der Drache holt tief Luft. Du hast einen Augenblick, um zu reagieren.

Die Gebietsbosse von Ruin Walk warten erst ab Gebietsstufe 4. Sie greifen nicht von selbst an, aber wenn du den Kampf beginnst, kündigen sie ihre Angriffe an:

🔥 Aschedrache: Feuerodem
🌿 Uralter Baumriese: Wurzeln
🐘 Urmammut: Ansturm
☠️ Sumpfsaurier: Giftwolke
🪨 Bergtroll: Felsbrocken

Gegen Wucht hilft Abwehr, Zauber musst du unterbrechen. Und unter 35 % Leben geraten sie in Raserei.

Ruin Walk ist noch in Entwicklung. Welchen der fünf würdest du zuerst herausfordern?

#ruinwalk #pixelrpg #fantasyrpgde #pixelartgame #gpsrpg

## Text Facebook
(nicht geplant, Facebook nicht in `erlaubte_kanaele`)

## Hashtags
#ruinwalk #pixelrpg #fantasyrpgde #pixelartgame #gpsrpg
(Pool RPG + GPS: 4 Nische, 1 mittel; rotiert gegenüber 004/005. Größe der Tags vor dem Posten in der App prüfen.)

## Alt-Text
Vier Pixel-Art-Monster vor einer dunklen, gemalten Ruine: ein großer roter Drache mit ausgebreiteten Flügeln, ein Baumwesen mit grüner Krone und gelben Augen, ein braunes Mammut mit weißen Stoßzähnen und ein grauer Saurier mit grünen Stacheln. Beschriftet als Aschedrache, Uralter Baumriese, Urmammut, Sumpfsaurier. Text oben: „Gebietsbosse. Lies den Angriff. Gebietsbosse kündigen ihre Angriffe an. Wucht wehrst du ab, Zauber unterbrichst du.“ Darunter Felder mit den Angriffen Feuerodem, Wurzeln, Ansturm, Giftwolke. Unten der Hinweis „In Entwicklung“.

## Notizen für Pascal
- Raserei-Schwelle exakt aus dem Code übernommen (35 %), nicht gerundet (Korrektur Hauptsitzung 20.11.2026).
- Idee 12 bleibt als Reel offen (Bildschirmaufnahme eines Gebietsbosses im Testmodus, ohne echten Standort).
