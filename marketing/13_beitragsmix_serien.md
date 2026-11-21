# Beitragsmix, Serien und täglicher Ablauf (Instagram)

Stand: 20.11.2026. Grundlage: `12_reichweite_analyse.md` (Maßnahmen A1/A2, A3, A4/A6, 14-Tage-Mix), Zustimmung Pascal 20.11.2026, Freigabe „Antworten auf Kommentare unter eigenen Beiträgen“ (`modus.json` → `antworten_auf_eigene_kommentare`, max. 10/Tag).
Erstellt von `rw-marketing`. Der Abschnitt 4 ist der Wortlaut für die geplante Aufgabe; die Hauptsitzung überträgt ihn.

Feste Grenzen (gelten für alles hier):
- **Max. 1 Feed-Beitrag pro Tag** (Bild, Karussell oder Reel; `modus.json`). Stories zusätzlich, max. 3 pro Tag (Konstante im Skript).
- **Spiel nicht öffentlich:** keine Links, kein „Link in Bio“, keine Aufforderung zum Spielen, Testen oder Anmelden. CTA = Folgen, Speichern, Teilen, Frage beantworten.
- Erlaubt nach außen ist nur: eigene Beiträge/Stories veröffentlichen und **Antworten auf Kommentare unter eigenen Beiträgen** (Regeln Abschnitt 3). Verboten bleiben: Likes, Folgen, Direktnachrichten, Kommentieren bei anderen Konten, Löschen, Facebook.
- **Verborgene Klassen bleiben geheim** (Pascal, 20.11.2026): Die dritte Stufe jedes Pfads (`PATHS[*].st[2]`) wird nie mit Namen, Fähigkeit, Werten oder Figur gezeigt, auch nicht in Antworten auf Kommentare und nicht durch Bestätigen oder Verneinen von Rateversuchen. Hinweise sind erwünscht („Die dritte Stufe bleibt ein Geheimnis …“), ebenso der Rätselspruch aus `SECRET[*].h`, weil das Spiel ihn vorher zeigt. Das nötige Level der dritten Stufe (Level 50, `UP_LV`) darf genannt werden (Entscheidung Pascal 21.11.2026); alle übrigen Bedingungen, Zahlen und Werte der dritten Stufe bleiben geheim. Also auch nicht die Anforderungen aus `UPQ[2]`. Keine Screenshots aus „Klasse wechseln (Vorschau)“ (`?dev=1`) oder aus Testmodus-Spielständen mit Stufe 3. Sperrwörter (Name, Fähigkeit, Set-Name `PSN[*][2]`, Figur-ID) erzwingen `pruefen`, `antworten` und `render.js` über `geheim.js`. Liste: `node .claude/skills/ruinwalk-meta-publishing/scripts/geheim.js`.
- Nur echte Spielgrafik (Screenshots, Sprites aus `figs/` außer den 12 verborgenen Stufen, und aus `marketing/grafiken/sprites/`). Prototypen (Gruppen-Dungeons, Weltboss, Mehrspieler) nur als „in Entwicklung“, ohne Bild und ohne Termin.

## 1. Wochenrhythmus

| Tag | Feed (17:35) | Story (nach dem Feed-Beitrag, ca. 17:45) |
|---|---|---|
| Mo | **Werkstatt** (Karussell) | Frage an die Community (Frage-Optik als Bild) |
| Di | **Reel** | Hinweis auf das Reel („Neu im Feed: …“) |
| Mi | **Kreatur der Woche** (Karussell) | „Schick das jemandem, der …“ |
| Do | Einzelbild oder Umfrage-Bild | Hinweis auf den Beitrag |
| Fr | **Pfad-Freitag** (Bild oder Reel) | – |
| Sa | **Reel** | Hinweis auf das Reel |
| So | **Pausentag** (kein Feed-Beitrag) | Rückblick der Woche (eine Story) |

Pro Woche: 2 Reels (+ Pfad-Freitag als Reel, sobald Reels laufen = 3), 2 Karussells, 1–2 Bilder, 1 Pausentag, Stories an 5 Tagen.
**Solange kein Reel veröffentlicht ist** (Sperre erstes Reel, Freigabe Pascal nötig) oder kein Reel-Entwurf bereitliegt: am Reel-Tag ein Karussell oder Bild aus der Ideenliste; das Reel-Thema bleibt als Entwurf liegen.
Fällt ein Serien-Tag aus (kein geprüfter Entwurf): lieber Pause als ein schwacher Beitrag.

## 2. Serien

Jede Serie hat einen festen Kicker auf der Grafik und eine feste erste Zeile, damit Wiederkehrende sie erkennen. Nummer immer mitführen (#1, #2 …).

### Kreatur der Woche (Mi, Karussell 3–4 Seiten)
- **Inhalt:** ein Monster aus `MOBS` (50 vorhanden). Seite 1: Sprite groß + Name. Seite 2: Lebensraum (`hab`), Seltenheit (`tier`: normal/selten/Elite/Boss/Gebietsboss), Fähigkeit (`ab`, z. B. Gift, Panzer, Flucht). Seite 3: Beute (`drops` → Materialname aus `ITEMS`). Optional Seite 4: Frage.
- **Belege:** jede Angabe mit Fundstelle `MOBS.<id>` in der Faktenprüfung. Keine Zahlen zu Leben/Schaden (ändern sich beim Balancing).
- **Hook-Muster:** „Kreatur der Woche #N: <Name>. <ein konkreter Reiz aus der Fähigkeit>.“ (z. B. „Der Feldhase flieht, bevor du zuschlägst.“ – nur wenn `ab:'flucht'` belegt).
- **CTA:** „Speichern, falls du ihm draußen begegnest“ oder Frage „Welche Kreatur soll nächste Woche dran sein?“.
- **Reihenfolge:** erst normale und seltene Monster aus allen fünf Lebensräumen, Bosse/Gebietsbosse sparsam (max. jede vierte Woche).

### Pfad-Freitag (Fr, Bild; später Reel)
- **Inhalt:** einer der 12 Pfade aus `PATHS` mit den Figuren der Grundklasse und der Pfadstufen 1–2 aus `figs/` (dritte Stufe nur als „verborgene Klasse ❓“ – **ohne Namen, Fähigkeit, Werte oder Figur**; Bedingung nie verraten, nur den Rätselspruch `SECRET.<pfad>.h`). Fähigkeiten je Stufe aus `PATHS.<pfad>.st[i].sk.n`, Level 15/30/50 aus `UP_LV` (Level 50 für die dritte Stufe darf genannt werden).
- **Reel-Variante:** wie Reel 007 (Charakter-Bildschirm für Grundklasse und Pfadstufen 1–2, danach Bildschirm „Klassenentwicklung“ mit „❓ Verborgene Klasse“, Skript `marketing/grafiken/reel_007_aufnahme.js` als Vorlage, Spielstände anpassen).
- **Hook-Muster:** „Pfad-Freitag #N: <Grundklasse> → <Stufe 1> → <Stufe 2> → ???“
- **CTA:** „Welchen Pfad soll es nächsten Freitag geben?“ – sammelt Kommentare, auf die geantwortet werden darf.
- **Reihenfolge:** je Grundklasse abwechseln (Krieger, Bogenschütze, Magier, Heiler), Priester war Reel 1.

### Werkstatt (Mo, Karussell oder Bild)
- **Inhalt:** ehrliches Entwickler-Update aus `git log` der letzten 7 Tage und `docs/`. Nur, was im Spiel (Zweig `main` bzw. Live-Stand) wirklich angekommen ist, als „neu“; alles andere als „wir arbeiten an …“ ohne Termin. Pixel-Art-Entwürfe nur, wenn als „Entwurf“ gekennzeichnet.
- **Nie:** Prototyp-Szenen (Instanzkampf), Termine, Versprechen, interne Sicherheitsthemen, Namen Dritter.
- **Hook-Muster:** „Werkstatt #N: <eine konkrete Änderung in einem Satz>.“
- **CTA:** Frage nach Wünschen („Was soll als Nächstes besser werden?“).
- Unsicher, ob etwas live ist → `rw-architekt` bzw. Hauptsitzung fragen, sonst weglassen.

### Reels (Di, Sa)
Themen in dieser Reihenfolge (aus `12_reichweite_analyse.md`, Abschnitt 5): 007 Wanderer → Hohepriester, dritte Stufe geheim · Gebietsboss-Telegraph (Ansage + Abwehr, echte Kampfszene im Testmodus) · 50 Monster in 15 Sekunden (Sprite-Parade) · Herstellen „Aus Ast und Stein wird Werkzeug“ · bestes Thema mit neuem Hook.
Regeln: 8–20 s, 9:16, Text-Hook in Sekunde 1, Untertitel im Bild, Text zwischen ca. 220 und 1500 px Höhe, kein Ton oder stille Spur (Musik nur, wenn Pascal selbst in der App postet), Karte nur ohne echte Orte.

### Stories
Per API nur Bild oder Video, **keine Sticker** (Umfrage, Frage, Link). Deshalb:
- „Neu im Feed“: Story-Grafik (Format `story`, 1080×1920) mit Ausschnitt des Beitrags und Text „Neu im Feed: <Thema>“.
- Frage-Optik: Layout `frage` – Antworten kommen als Kommentar unter dem nächsten Feed-Beitrag bzw. als Story-Antwort (Direktnachricht → **nicht** beantworten, Pascal melden).
- Echte Umfrage-Sticker setzt nur Pascal in der App.
Entwurf wie Feed (`format: story`, `bild:` oder `video:`, Abschnitte `## Text im Bild`, `## Alt-Text`, `## Faktenprüfung`, keine Caption nötig).

## 3. Antworten auf Kommentare (freigegeben 20.11.2026)

Nur unter **eigenen** Beiträgen, max. 10 pro Tag, nur über `meta-api.js antworten`. Voraussetzung technisch: Token mit `instagram_manage_comments` (fehlt Stand 20.11.2026 → bis Pascal das ergänzt, nur `kommentare` lesen und Antwortvorschläge im Bericht nennen).

**Einordnen vor jeder Antwort:**
- **Heikel → nicht antworten, Pascal melden** (Kommentar-ID + Kurzinhalt ohne Namen): Kritik oder Beschwerde, Beleidigung, Spam/Werbung, Fragen zu Daten, Datenschutz, Geld, Preis, Termin, Testzugang oder „Wo kann ich spielen?“, Bitte um Link, erkennbar Minderjährige, Politik, Persönliches, alles Unklare.
- **Unbedenklich:** Lob, Antworten auf unsere Frage, Fragen zu Dingen, die es im Spiel belegt gibt.

**So antworten:** kurz (1–2 Sätze, max. 300 Zeichen), Du-Form, warm, im Markenton. Nur belegte Fakten. Keine Zusagen zu Termin, Preis oder Funktionen. Keine Links, keine @-Erwähnung anderer Konten, kein „jetzt spielen/testen“, kein Download. Höchstens eine Rückfrage. Keine Kopie desselben Satzes unter mehreren Kommentaren.
Beispiele: „Danke dir! Der Heiler ist auch unser heimlicher Liebling. Welchen Pfad würdest du nehmen?“ · „Gute Frage. Aktuell gibt es fünf Lebensräume, und welcher dir begegnet, entscheiden echte Kartendaten.“
Auf „Wann kann ich spielen?“: heikel (Termin) → nicht antworten, Pascal melden.
Rateversuche zur verborgenen Klasse: weder bestätigen noch verneinen, z. B. „Gute Idee! Mehr verraten wir nicht. 😉“ oder gar nicht antworten.

## 4. Wortlaut für den täglichen Lauf (geplante Aufgabe, 17:35)

> Du bist `rw-marketing` für Ruin Walk. Lies zuerst `marketing/meta/modus.json` und `marketing/meta/config.json`. Bei `modus: pause` nichts tun außer einem kurzen Bericht.
>
> **1. Lage prüfen (nur lesend):** `meta-api.js status`, `marketing/freigabe/veroeffentlicht/LOG.md`. Wurde heute (24 h) schon ein Feed-Beitrag veröffentlicht, keinen weiteren Feed-Beitrag posten.
>
> **2. Feed-Beitrag nach Wochenrhythmus** (`marketing/13_beitragsmix_serien.md`, Abschnitt 1): Sonntag ist Pausentag (kein Feed). Sonst den passenden Entwurf aus `marketing/freigabe/entwuerfe/` wählen (Serie des Tages; fehlt er, den ältesten geprüften Entwurf; fehlt auch der, einen neuen nach Skill `ruinwalk-social-content` erstellen – nur echte Spielgrafik, Grafik ansehen). Reels: das **erste Reel** nur, wenn im Entwurf `freigegeben_von: Pascal` steht; sonst stattdessen Karussell/Bild. Dann `meta-api.js pruefen <entwurf>` → muss „bestanden“ sein. Status auf `autonom` setzen, Medien (Bilder/Video) committen und auf den Arbeitszweig pushen (nicht `main`), dann als schlichten Einzelbefehl `meta-api.js veroeffentlichen <entwurf> --senden`. Danach Entwurf nach `veroeffentlicht/` verschieben, `veroeffentlicht_am` und Link eintragen, committen.
>
> **3. Story** (Mo–Sa nach Rhythmus, max. 3/Tag, Skript zählt): Story-Grafik `format: story` erstellen (Format `story` im Skill `ruinwalk-grafik`), prüfen, veröffentlichen wie oben. Keine Sticker, keine Links.
>
> **4. Kommentare:** `meta-api.js kommentare 7`. Für jeden `[offen]`-Kommentar einordnen nach Abschnitt 3: heikel → nicht antworten, im Bericht an Pascal melden (ID, Kurzinhalt, kein Name). Unbedenklich → Antwort formulieren (max. 300 Zeichen, Markenton, keine Zusagen/Links/Erwähnungen), `meta-api.js antworten <id> "<text>"` als Trockenlauf, dann mit `--senden`. Max. 10 Antworten pro Tag (Skript zählt). Fehlt die Berechtigung `instagram_manage_comments`, nur Vorschläge im Bericht.
>
> **Niemals:** Likes, Folgen, Direktnachrichten, Kommentare bei anderen Konten, Löschen, Facebook, Änderungen an `modus.json`, Links zum Spiel oder Aufforderungen zum Spielen/Testen, mehr als ein Feed-Beitrag pro Tag. Im Zweifel (heikles Thema, unsichere Fakten, Kritik, neue Funktion ankündigen): nicht posten, Pascal fragen.
>
> **Montags zusätzlich:** Kennzahlen der Beiträge, die 7 Tage alt sind, nach `marketing/analyse/` (Vorlage `KPI_VORLAGE.md`): Reichweite, Aufrufe, Saves, Shares, Profilbesuche, Follows je Format.
>
> **Bericht an Pascal (kurz):** was veröffentlicht (Format, Uhrzeit, Link), welche Antworten gesendet (Anzahl, IDs), welche Kommentare gemeldet, was morgen geplant ist, was er freigeben muss.

## 5. Nächste Entwürfe (Vorschlag)

| Datum | Feed | Story |
|---|---|---|
| Sa 21.11. | Karussell 004 Lebensräume (geprüft, Alt-Text je Seite ergänzt) | Neu im Feed |
| So 22.11. | Pausentag – oder **Reel 007** (`007_instagram_reel_wanderer_priester.md`), falls Pascal es bis dahin freigibt (dann Pause auf Mo verschieben) | Rückblick |
| Mo 23.11. | Werkstatt #1 (neu erstellen) | Frage |
| Di 24.11. | Reel 007 (falls freigegeben), sonst 005 Umfrage Gebietsstufen | Neu im Feed |
| Mi 25.11. | Kreatur der Woche #1 (neu) | „Schick das …“ · 7-Tage-Auswertung 001 |
| Do 26.11. | 006 Gebietsbosse | Neu im Feed |
| Fr 27.11. | Pfad-Freitag #1 (neu) | – |
