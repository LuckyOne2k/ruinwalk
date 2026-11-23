# Beitragsmix, Serien und täglicher Ablauf (Instagram)

Stand: 23.11.2026 (Reels als Hauptformat, täglich posten: Entscheidung Pascal, 23.11.2026). Grundlage bis 20.11.: `12_reichweite_analyse.md` (Maßnahmen A1/A2, A3, A4/A6, 14-Tage-Mix), Zustimmung Pascal 20.11.2026, Freigabe „Antworten auf Kommentare unter eigenen Beiträgen“ (`modus.json` → `antworten_auf_eigene_kommentare`, max. 10/Tag).
Erstellt von `rw-marketing`. Der Abschnitt 4 ist der Wortlaut für die geplante Aufgabe; die Hauptsitzung überträgt ihn.

Feste Grenzen (gelten für alles hier):
- **Max. 1 Feed-Beitrag pro Tag** (Bild, Karussell oder Reel; `modus.json`). Stories zusätzlich, max. 3 pro Tag (Konstante im Skript). „Tag“ = **Kalendertag Europe/Berlin** (ab Mitternacht MEZ/MESZ wieder frei, kein rollierendes 24-h-Fenster; Pascal, 23.11.2026). Das Wochenlimit (7) zählt die letzten 7 Berliner Kalendertage (heute + 6 davor).
- **Spiel nicht öffentlich:** keine Links, kein „Link in Bio“, keine Aufforderung zum Spielen, Testen oder Anmelden. CTA = Folgen, Speichern, Teilen, Frage beantworten.
- Erlaubt nach außen ist nur: eigene Beiträge/Stories veröffentlichen und **Antworten auf Kommentare unter eigenen Beiträgen** (Regeln Abschnitt 3). Verboten bleiben: Likes, Folgen, Direktnachrichten, Kommentieren bei anderen Konten, Löschen, Facebook.
- **Verborgene Klassen bleiben geheim** (Pascal, 20.11.2026): Die dritte Stufe jedes Pfads (`PATHS[*].st[2]`) wird nie mit Namen, Fähigkeit, Werten oder Figur gezeigt, auch nicht in Antworten auf Kommentare und nicht durch Bestätigen oder Verneinen von Rateversuchen. Hinweise sind erwünscht („Die dritte Stufe bleibt ein Geheimnis …“), ebenso der Rätselspruch aus `SECRET[*].h`, weil das Spiel ihn vorher zeigt. Das nötige Level der dritten Stufe (Level 50, `UP_LV`) darf genannt werden (Entscheidung Pascal 21.11.2026); alle übrigen Bedingungen, Zahlen und Werte der dritten Stufe bleiben geheim. Also auch nicht die Anforderungen aus `UPQ[2]`. Keine Screenshots aus „Klasse wechseln (Vorschau)“ (`?dev=1`) oder aus Testmodus-Spielständen mit Stufe 3. Sperrwörter (Name, Fähigkeit, Set-Name `PSN[*][2]`, Figur-ID) erzwingen `pruefen`, `antworten` und `render.js` über `geheim.js`. Liste: `node .claude/skills/ruinwalk-meta-publishing/scripts/geheim.js`.
- Nur echte Spielgrafik (Screenshots, Sprites aus `figs/` außer den 12 verborgenen Stufen, und aus `marketing/grafiken/sprites/`). Prototypen (Gruppen-Dungeons, Weltboss, Mehrspieler) nur als „in Entwicklung“, ohne Bild und ohne Termin.

## 1. Wochenrhythmus (Entscheidung Pascal, 23.11.2026: Reels als Hauptformat, jeden Tag posten)

**Warum:** Aufrufe je Beitrag bis 23.11.2026 (Profil-Screenshot Pascal 10:08 MEZ, bestätigt mit `meta-api.js aufrufe`): Teaser 001: 1 · Karussell 002: 2 · Klassen 003: 1 · **Reel 007: 111** (Reichweite 103) · Karussell 004: 0. Das eine Reel brachte 111 von 115 Aufrufen in 30 Tagen. Bild- und Karussellbeiträge erreichen bei 0 Followern praktisch niemanden; Reels werden auch Nicht-Followern gezeigt. Durchschnittliche Wiedergabe von Reel 007: 2,8 s von 13,8 s → die ersten 1–2 Sekunden entscheiden.

| Tag | Feed (17:35) | Story (nach dem Feed-Beitrag, ca. 17:45) |
|---|---|---|
| Mo | **Reel** (Gebietsboss / Levelaufstieg, abwechselnd) | „Neu im Feed: …“ |
| Di | **Werkstatt** (Einzelbild, Entwickler-Update) | Frage an die Community (Frage-Optik als Bild) |
| Mi | **Reel: Kreatur der Woche** | „Neu im Feed: …“ |
| Do | Einzelbild oder Umfrage-Bild | Hinweis auf den Beitrag |
| Fr | **Pfad-Freitag** (Einzelbild) | „Schick das jemandem, der …“ |
| Sa | **Reel** (Aus Ast und Stein / Gebietsboss / Levelaufstieg) | „Neu im Feed: …“ |
| So | **Karussell für Follower** (Vertiefung: z. B. alle Bosse, ein Lebensraum, ein Pfad im Detail) | Rückblick der Woche |

Pro Woche: **3 Reels (Mo/Mi/Sa) = Hauptformat**, 1 Karussell (So, für bestehende Follower), 3 Einzelbilder (Di/Do/Fr), Stories an allen 7 Tagen. **Kein Pausentag mehr** (Sonntag wird belegt). Weiter gilt: höchstens 1 Feed-Beitrag pro Tag, 7 pro Woche (`modus.json`).
Die Sperre „erstes Reel“ ist erledigt (Reel 007 steht im LOG) – weitere Reels brauchen keine Einzelfreigabe, nur bestandene Prüfung.
Fehlt am Reel-Tag ein geprüfter Reel-Entwurf: neues Reel nach den Regeln unten erstellen; geht das nicht, ein Einzelbild aus der Ideenliste. Fehlt an einem anderen Tag ein geprüfter Entwurf: lieber nur eine Story als ein schwacher Feed-Beitrag.

## 2. Serien

Jede Serie hat einen festen Kicker auf der Grafik und eine feste erste Zeile, damit Wiederkehrende sie erkennen. Nummer immer mitführen (#1, #2 …).

### Kreatur der Woche (Mi, Reel; Vorlage Reel 011)
- **Inhalt:** ein Monster aus `MOBS` (50 vorhanden) im echten Kampf: Schuss/Schlag ab Bild 1, Details der Kampfkarte (ⓘ: Verhalten, Lebensraum `hab`, Fähigkeit `ab`, Beute), Sieg mit Beute-Meldung. Untertitel: Name, Fähigkeit, Lebensraum, Beute. Aufnahme: `marketing/grafiken/reels_aufnahme.js` (Szene `igel` als Vorlage). Vertiefung als Karussell am Sonntag möglich (Sprite groß, Lebensraum, Seltenheit `tier`, Beute aus `ITEMS`).
- **Belege:** jede Angabe mit Fundstelle `MOBS.<id>` in der Faktenprüfung. Keine Zahlen zu Leben/Schaden (ändern sich beim Balancing).
- **Hook-Muster:** „Kreatur der Woche, Folge N: <Name>.“ (in der Caption „Folge N“ statt „#N“ – `pruefen` zählt „#1“ als Hashtag; im Video-Kicker „#N“).
  Danach ein konkreter Reiz aus der Fähigkeit (z. B. „Der Feldhase flieht, bevor du zuschlägst.“ – nur wenn `ab:'flucht'` belegt).
- **CTA:** „Speichern, falls du ihm draußen begegnest“ oder Frage „Welche Kreatur soll nächste Woche dran sein?“.
- **Reihenfolge:** erst normale und seltene Monster aus allen fünf Lebensräumen, Bosse/Gebietsbosse sparsam (max. jede vierte Woche).

### Pfad-Freitag (Fr, Einzelbild; als Reel nur am Sa im Wechsel)
- **Inhalt:** einer der 12 Pfade aus `PATHS` mit den Figuren der Grundklasse und der Pfadstufen 1–2 aus `figs/` (dritte Stufe nur als „verborgene Klasse ❓“ – **ohne Namen, Fähigkeit, Werte oder Figur**; Bedingung nie verraten, nur den Rätselspruch `SECRET.<pfad>.h`). Fähigkeiten je Stufe aus `PATHS.<pfad>.st[i].sk.n`, Level 15/30/50 aus `UP_LV` (Level 50 für die dritte Stufe darf genannt werden).
- **Reel-Variante:** wie Reel 007 (Charakter-Bildschirm für Grundklasse und Pfadstufen 1–2, danach Bildschirm „Klassenentwicklung“ mit „❓ Verborgene Klasse“, Skript `marketing/grafiken/reel_007_aufnahme.js` als Vorlage, Spielstände anpassen).
- **Hook-Muster:** „Pfad-Freitag #N: <Grundklasse> → <Stufe 1> → <Stufe 2> → ???“
- **CTA:** „Welchen Pfad soll es nächsten Freitag geben?“ – sammelt Kommentare, auf die geantwortet werden darf.
- **Reihenfolge:** je Grundklasse abwechseln (Krieger, Bogenschütze, Magier, Heiler), Priester war Reel 1.

### Werkstatt (Di, Einzelbild)
- **Inhalt:** ehrliches Entwickler-Update aus `git log` der letzten 7 Tage und `docs/`. Nur, was im Spiel (Zweig `main` bzw. Live-Stand) wirklich angekommen ist, als „neu“; alles andere als „wir arbeiten an …“ ohne Termin. Pixel-Art-Entwürfe nur, wenn als „Entwurf“ gekennzeichnet.
- **Nie:** Prototyp-Szenen (Instanzkampf), Termine, Versprechen, interne Sicherheitsthemen, Namen Dritter.
- **Hook-Muster:** „Werkstatt #N: <eine konkrete Änderung in einem Satz>.“
- **CTA:** Frage nach Wünschen („Was soll als Nächstes besser werden?“).
- Unsicher, ob etwas live ist → `rw-architekt` bzw. Hauptsitzung fragen, sonst weglassen.

### Reels (Mo, Mi, Sa) – Hauptformat (Pascal, 23.11.2026)
Serien mit festem Wiedererkennungswert (Kicker im Video „<Serie> #N“, gleicher Aufbau, gleiche Schlusskarte):
- **Gebietsboss #N** (Mo, im Wechsel mit Levelaufstieg): ein Gebietsboss (`MOBS` mit `tier:'area'`, 5 Stück) mit seinem Spezialangriff aus `BFX` und der richtigen Reaktion (🛡️ Abwehr / ⚡ Unterbrechen). Vorlage Reel 010.
- **Kreatur der Woche #N** (Mi): Vorlage Reel 011.
- **Levelaufstieg #N** (Mo/Sa im Wechsel): ein echter Level-Moment (Level 5 Klassenwahl, Level 15 und 30 Pfadstufe 1 und 2 – **nie die dritte Stufe**, nur „bleibt ein Geheimnis“). Vorlage Reel 012.
- **Aus Ast und Stein #N** (Sa): Sammeln → Herstellen → Werkzeug benutzen (`RECIPES`, `NODES`), z. B. Holzfälleraxt aus Ast, Stein, Ranke, dann Baum fällen.

Regeln:
- **Bewegung aus dem Spiel in den ersten 1–2 Sekunden** (Treffer, Schadenszahlen, Telegraph, Levelaufstieg) statt Titeltext oder Logo. Kein Titelbild am Anfang; der Serien-Kicker liegt klein über dem laufenden Spiel.
- **Hook in der ersten Sekunde** (Lehre aus Reel 007: nur 2,8 s Ø Wiedergabe, `meta-api.js aufrufe` 23.11.2026): Das Motiv (z. B. der Boss, die Kreatur) ist ab Bild 1 **groß im Bild**, nicht klein in der Karte oder erst nach einem Schwenk. Dazu eine **kurze Textzeile als Hook** (≤ 6 Wörter, z. B. „Der Bergtroll hebt einen Felsbrocken.“), sofort sichtbar und groß genug für das Handy. Kein langsamer Aufbau, kein Menü, kein Logo zuerst.
- **10–20 s**, 9:16, 30 fps, stille AAC-Spur (Musik nur, wenn Pascal selbst in der App postet). Wartezeiten herausschneiden, jeder Schnitt zeigt echte Spielszenen.
- Untertitel kurz (≤ 8 Wörter, max. 2 Zeilen), im Bild zwischen ca. 1075 und 1290 px Höhe (unter der Figur, frei von Reels-Bedienelementen); Spielmeldungen bleiben sichtbar.
- **Schluss (ca. 2 s): kurzer Folgen-Hinweis** „Folge für Teil 2“ bzw. „Folge für Kreatur #2“ + Andeutung der nächsten Folge. Erlaubt, weil kein Link und keine Aufforderung zum Spielen/Testen. Badge „In Entwicklung · echte Spielgrafik“.
- Karte nur ohne echte Orte (Testmodus, ohne Kartenkacheln), Anzeige „Testmodus“ ausgeblendet. Keine Entwickler-Vorschau (`?dev=1`), keine verborgenen Klassen, keine Werte der dritten Stufe.
- Herstellung: `node marketing/grafiken/reels_aufnahme.js <szene>` (Aufnahme aus dem committeten Stand per Chrome-Screencast, Schnitt mit ffmpeg). Einzelbilder vor der Ablage ansehen.
- Nach 7 Tagen: `meta-api.js aufrufe` – Aufrufe, Reichweite und Ø Wiedergabedauer je Reel vergleichen (Ziel: Ø Wiedergabe deutlich über 3 s).

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
> **1. Lage prüfen (nur lesend):** `meta-api.js status`, `marketing/freigabe/veroeffentlicht/LOG.md`. Wurde heute (Kalendertag Europe/Berlin, ab 00:00 MEZ/MESZ) schon ein Feed-Beitrag veröffentlicht, keinen weiteren Feed-Beitrag posten. Das Skript zählt genauso.
>
> **2. Feed-Beitrag nach Wochenrhythmus** (`marketing/13_beitragsmix_serien.md`, Abschnitt 1): jeden Tag genau ein Feed-Beitrag, **kein Pausentag** (Pascal, 23.11.2026). Mo/Mi/Sa ein **Reel** (Hauptformat), So ein Karussell für Follower, Di/Do/Fr ein Einzelbild. Den passenden Entwurf aus `marketing/freigabe/entwuerfe/` wählen (Serie des Tages; fehlt er, den ältesten geprüften Entwurf; fehlt auch der, einen neuen nach Skill `ruinwalk-social-content` erstellen – nur echte Spielgrafik, Grafik ansehen). Reels: Die Sperre „erstes Reel“ ist erledigt (Reel 007 im LOG); weitere Reels brauchen nur die bestandene Prüfung. Neues Reel nach Abschnitt 2 „Reels“ (Bewegung in den ersten 1–2 s, 10–20 s, Folgen-Hinweis am Ende, `marketing/grafiken/reels_aufnahme.js`). Dann `meta-api.js pruefen <entwurf>` → muss „bestanden“ sein. Status auf `autonom` setzen, Medien (Bilder/Video) committen und auf den Arbeitszweig pushen (nicht `main`), dann als schlichten Einzelbefehl `meta-api.js veroeffentlichen <entwurf> --senden`. Danach Entwurf nach `veroeffentlicht/` verschieben, `veroeffentlicht_am` und Link eintragen, committen.
>
> **3. Story** (Mo–So nach Rhythmus, max. 3/Tag, Skript zählt): Story-Grafik `format: story` erstellen (Format `story` im Skill `ruinwalk-grafik`), prüfen, veröffentlichen wie oben. Keine Sticker, keine Links.
>
> **4. Kommentare:** `meta-api.js kommentare 7`. Für jeden `[offen]`-Kommentar einordnen nach Abschnitt 3: heikel → nicht antworten, im Bericht an Pascal melden (ID, Kurzinhalt, kein Name). Unbedenklich → Antwort formulieren (max. 300 Zeichen, Markenton, keine Zusagen/Links/Erwähnungen), `meta-api.js antworten <id> "<text>"` als Trockenlauf, dann mit `--senden`. Max. 10 Antworten pro Tag (Skript zählt). Fehlt die Berechtigung `instagram_manage_comments`, nur Vorschläge im Bericht.
>
> **Niemals:** Likes, Folgen, Direktnachrichten, Kommentare bei anderen Konten, Löschen, Facebook, Änderungen an `modus.json`, Links zum Spiel oder Aufforderungen zum Spielen/Testen, mehr als ein Feed-Beitrag pro Tag. Im Zweifel (heikles Thema, unsichere Fakten, Kritik, neue Funktion ankündigen): nicht posten, Pascal fragen.
>
> **Montags zusätzlich:** `meta-api.js aufrufe` (nur lesend: Aufrufe, Reichweite, Likes, Kommentare, Gespeichert, Geteilt, Ø Wiedergabe Reel, Profilbesuche, Follows je Beitrag) und die Beiträge, die 7 Tage alt sind, nach `marketing/analyse/` (Vorlage `KPI_VORLAGE.md`) auswerten, Format gegen Format.
>
> **Bericht an Pascal (kurz):** was veröffentlicht (Format, Uhrzeit, Link), welche Antworten gesendet (Anzahl, IDs), welche Kommentare gemeldet, was morgen geplant ist, was er freigeben muss.

## 5. Nächste Entwürfe (Stand 23.11.2026)

| Datum | Feed (17:35) | Story |
|---|---|---|
| Mo 23.11. | **Reel 010** Gebietsboss #1 Bergtroll (geprüft) | Neu im Feed |
| Di 24.11. | Werkstatt #1 (Einzelbild, neu) – oder 005 Umfrage Gebietsstufen | Frage |
| Mi 25.11. | **Reel 011** Kreatur der Woche #1 Waldigel (geprüft) | Neu im Feed |
| Do 26.11. | 005 Umfrage Gebietsstufen bzw. 006 Gebietsbosse (Einzelbild) | Hinweis |
| Fr 27.11. | Pfad-Freitag #1 (Einzelbild, neu) | „Schick das …“ |
| Sa 28.11. | **Reel 012** Levelaufstieg #1 Klassenwahl (geprüft) | Neu im Feed |
| So 29.11. | Karussell für Follower (neu, z. B. „Fünf Gebietsbosse im Überblick“) | Rückblick |
| Mo 30.11. | Reel: Gebietsboss #2 oder Aus Ast und Stein #1 (neu) · 7-Tage-Auswertung Reel 010 | Neu im Feed |
