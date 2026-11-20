---
id: 005
titel: Umfrage-Post – Wie weit wagst du dich? (Gebietsstufen, Idee 11)
kanal: instagram
format: post
geplant_fuer: nach 004 (Feed täglich 17:35 Uhr), Uhrzeit legt der geplante Lauf bzw. Pascal fest
status: entwurf
freigegeben_von:
freigegeben_am:
bild: marketing/grafiken/entwuerfe/005_umfrage_gebietsstufen.jpg
bild_url:
veroeffentlicht_am:
link:
---

## Ziel
Kommentare und Bindung: Die Gebietsstufen (Idee 11, Woche 3 „Gefahr und Beute“) als Mitmach-Frage vorstellen. Antwort mit einem Buchstaben ist einfach, das senkt die Hürde für erste Kommentare. Neues Format im Raster (Umfrage-Post nach Teaser, Karussell, Klassenbild, Lebensraum-Karussell).

## Faktenprüfung
- Fünf Gebietsstufen mit den Namen Randland, Wildland, Fernmark, Schreckensmark, Ruinenreich → `index.html` `BAND_N` → live
- Gebiet = Block aus 12×12 Zellen → `index.html` `REGION=12`, Projektwissen `spielsysteme.md` („Gebiete (12×12 Zellen)“) → live. Im Text nur „Gebiet“, keine Meterangabe.
- Nahe der Heimat bleibt es ruhig, mit der Entfernung steigt die mögliche Stufe → `effBand()` = Minimum aus `worldBand()` und `homeCap(regDist(...))`, `homeCap=d=>1+Math.floor(d/2)` (Heimat-Schutzring) → live. Einschränkung: Die Stufe draußen ergibt sich aus einem festen Wellenfeld (`worldBand`), weit weg heißt also „bis zu“, nicht automatisch Stufe 5. Darum im Text „kann … höher werden“.
- Empfohlene Level je Stufe: 1–7, 8–15, 16–25, 26–37, 38+ → `BAND_LO=[1,8,16,26,38]` und Anzeige in der Gebietsleiste (`'Lv '+BAND_LO[b-1]+…`) → live (im Text nicht genannt, nur zur Absicherung)
- Elitegegner ab Stufe 2, Bosse ab Stufe 3, Gebietsbosse ab Stufe 4 → `BAND_MIN={normal:1,rare:1,elite:2,boss:3,area:4}` → live
- Monster werden mit der Stufe stärker → Tabelle `BSC` (Leben/Schaden je Stufe skaliert) → live
- Mehr Beute in höheren Stufen: Münzen je Stufe `BCOIN=[1,1.6,2.6,4,6]` → live. Im Text vorsichtig als „mehr Münzen“ formuliert, keine Aussage zu Item-Qualität.
- Nicht erwähnt: Heimatumzug (7 Tage), Erkundungsfortschritt, Mehrspieler.
- Grafik: Vorlage `frage`, gemalter Hintergrund `assets/bg_login.jpg` (echtes Spiel-Asset), keine Spielszene behauptet, Badge „In Entwicklung“ (Spiel nicht öffentlich). Motivdatei `marketing/grafiken/woche3-motive.json`.
- Umfrageoptionen zeigen 4 der 5 Stufen (Vorlage erlaubt max. 4), Schreckensmark steht in der Caption.

## Caption Instagram
Wie weit wagst du dich von zu Hause weg? A, B, C oder D in die Kommentare.

In Ruin Walk ist die Welt in Gebiete aufgeteilt. Jedes hat eine von fünf Gebietsstufen:

1 Randland
2 Wildland
3 Fernmark
4 Schreckensmark
5 Ruinenreich

Rund um deine Heimat bleibt es ruhig. Je weiter du gehst, desto höher kann die Stufe werden. Ab Stufe 2 tauchen Elitegegner auf, ab Stufe 3 Bosse, ab Stufe 4 die Gebietsbosse. Dafür gibt es dort mehr Münzen.

Ruin Walk ist noch in Entwicklung. Folg uns, wenn du sehen willst, wie es weitergeht.

#ruinwalk #gpsrpg #standortspiel #locationbasedgame #outdoorgaming

## Text Facebook
(nicht geplant, Facebook nicht in `erlaubte_kanaele`)

## Hashtags
#ruinwalk #gpsrpg #standortspiel #locationbasedgame #outdoorgaming
(Pool GPS/Draußen: 4 Nische, 1 mittel; rotiert gegenüber 004. Größe der Tags vor dem Posten in der App prüfen.)

## Alt-Text
Umfragegrafik vor einem dunklen, gemalten Wald mit Ruinen. Oben: „Fünf Gebietsstufen. Wie weit wagst du dich?“ Darunter: „Nahe der Heimat ist es ruhig. Je weiter du gehst, desto gefährlicher.“ Vier Antwortfelder: A Randland, bleib nah dran. B Wildland, ein Stück hinaus. C Fernmark, weit draußen. D Ruinenreich, bis ganz ans Ende. Unten der Hinweis „In Entwicklung“.

## Notizen für Pascal
- Zwei Aufforderungen in der Caption (Kommentar + Folgen)? Haupt-CTA ist der Kommentar; der Folgen-Satz ist der Standard-Abschluss, solange das Spiel nicht öffentlich ist. Wenn du nur einen willst: Folgen-Satz streichen.
- Gut als Vorlauf für 006 (Gebietsbosse), weil hier „ab Stufe 4 die Gebietsbosse“ angeteasert wird.
