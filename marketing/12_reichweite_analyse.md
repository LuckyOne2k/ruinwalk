# Reichweiten-Analyse und Maßnahmenplan Instagram

Stand: 20.11.2026, Daten abgerufen 17:27 UTC (nur lesend über die Graph API). Auftrag: Pascal, 20.11.2026.
Erstellt von `rw-marketing`. Ändert nichts am Lauf, an `modus.json` oder an Entwürfen. Alles unter „Entscheidung Pascal“ ist ein Vorschlag.

## 1. Kurzfazit

- **Die Beiträge erreichen derzeit praktisch niemanden.** Die API meldet für alle vier Beiträge Reichweite 0 und 0 Aufrufe, das Konto hat **0 Follower** und folgt 0 Konten.
- **Hauptursache ist die Ausgangslage, nicht die Machart der Bilder.** Ein Konto ohne Follower hat im Feed niemanden, dem es angezeigt werden kann. Neue Leute erreicht man fast nur über Empfehlungen (vor allem Reels, außerdem Explore und Suche) oder durch Menschen, die etwas teilen. Bisher haben wir **nur Bild- und Karussell-Beiträge** gepostet, **kein Reel, keine Story**, keine Interaktion nach außen, und das Konto ist nirgends verlinkt.
- **Hebel mit der größten Wirkung:** (1) Reels aus echter Spielgrafik, (2) Pascal teilt die ersten Beiträge über sein Umfeld (persönliche Stories, Freunde, Indie-Kontakte), (3) Profil auffindbar machen, (4) Pascal gibt eine eng begrenzte, eigene Community-Arbeit frei (Antworten, gezieltes Folgen, Kommentieren in der Nische).

## 2. Ist-Stand (API, 20.11.2026, 17:27 UTC)

Konto @ruinwalk.official: Business-Konto, 4 Beiträge, **0 Follower, 0 gefolgte Konten**. Anzeigename „Ruin Walk“. Bio laut API: „Deine Welt ist das Spielfeld. 🗺️ / GPS-Fantasy-RPG im Browser – keine App nötig. / In Entwicklung ·“ (endet mit „·“, wirkt abgeschnitten). Kein Website-Link (richtig, weil das Spiel noch nicht öffentlich ist).

| Beitrag | Zeit (MEZ) | Format | Reichweite | Aufrufe | Likes | Komm. | Gespeichert | Geteilt | Profilbesuche | Follows |
|---|---|---|---|---|---|---|---|---|---|---|
| „Comming soon...“ (manuell, nicht im LOG) | 18.11. 16:37 | Bild | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 001 Teaser | 18.11. 17:36 | Bild | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 002 Karussell „Was ist Ruin Walk?“ | 19.11. 17:45 | Karussell (5) | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 003 Klassen | 20.11. 18:23 | Bild | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Konto-Werte 17.–20.11. (Tagessummen): erreichte Konten 0, Aufrufe 0, Profilaufrufe 0, Konten mit Interaktion 1, Interaktionen 3.

**Einordnung und Lücken (nicht erfunden, sondern offen):**
- Die drei Likes stammen nach Konto-Wert „1 Konto mit Interaktion“ sehr wahrscheinlich von **einem einzigen Konto** (Annahme: Pascals persönliches Konto). Dass die Reichweite trotzdem 0 zeigt, ist widersprüchlich. Meta nennt die Reichweite selbst einen „Schätzwert, noch in Entwicklung“; Insights kommen teils verzögert. → **Werte am 25.11. erneut abrufen** (7-Tage-Auswertung von 001) und Pascal bitten, die Zahlen in der App zu vergleichen.
- 003 war beim Abruf erst 4 Minuten online – noch keine Aussage möglich.
- Demografie (`follower_demographics`) liefert nichts, weil es keine Follower gibt (Meta zeigt Demografie erst ab 100 Followern, Annahme nach Hilfe-Center, nicht gesondert geprüft).
- Nicht per API prüfbar: **Kontostatus „Empfehlungen“** (Einstellungen → Konto → Kontostatus). Pascal sollte einmal nachsehen, ob das Konto für Empfehlungen an Nicht-Follower geeignet ist.
- Gemeldet, aber nicht gemessen: Stories gab es keine.

## 3. Ursachen – unsere Beiträge im Abgleich mit aktuellen Quellen

| Punkt | Unser Stand | Was Quellen sagen | Bewertung |
|---|---|---|---|
| **Follower-Basis** | 0 | Feed-Beiträge werden zuerst Followern gezeigt; Nicht-Follower erreicht man über Empfehlungen (Reels, Explore, Suche, vorgeschlagene Konten). Eignung garantiert keine Empfehlung. [Instagram Hilfe: Kontostatus](https://help.instagram.com/539126347315373), [Meta: Recommendations](https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators) | **Hauptursache.** Ohne erste 50–100 echte Follower aus dem eigenen Umfeld fehlt jedes Startsignal. |
| **Format** | 3 Bilder, 1 Karussell, 0 Reels | Reels sind das Format für Nicht-Follower; „Trial Reels“ werden gezielt nur Nicht-Followern gezeigt ([Meta Newsroom, 12/2024](https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first/)); Zugang laut späteren Berichten ab 1.000 Followern ([Betanews 07/2025](https://betanews.com/2025/07/14/instagram-opens-up-trial-reels-feature-to-more-creators/)) – für uns also noch nicht nutzbar. | **Zweite Hauptursache.** Ohne Reels kaum Chance auf Empfehlungen. |
| **Wichtigste Signale** | – | Sekundärquellen zitieren Mosseri: Sehdauer, Likes pro Reichweite, **„Sends“ (Teilen per Nachricht) pro Reichweite** – Letzteres entscheidet über Nicht-Follower; Originalinhalte werden bevorzugt ([Buffer 2026](https://buffer.com/resources/instagram-algorithms/), [Sprout Social](https://sproutsocial.com/insights/instagram-algorithm/)). Original-Wortlaut 2026 nicht geprüft. | Inhalte müssen **teilbar** sein („Schick das jemandem, der …“). Vorteil: Wir posten nur Originalinhalte. |
| **Hashtags** | 5 je Beitrag, gemischt DE/EN, #ruinwalk | Instagram begrenzt laut Berichten auf 5 Hashtags ([Social Media Today](https://www.socialmediatoday.com/news/instagrams-implementing-new-limits-on-hashtag-use/808309/), [Business Today 12/2025](https://www.businesstoday.in/technology/news/story/no-more-hashtag-stuffing-instagram-limits-hashtag-usage-to-just-5-per-reel-and-post-507444-2025-12-19)); Mosseri: Hashtags erhöhen Reichweite kaum, helfen bei der Einordnung; **Schlüsselwörter in Caption, Bildtext, Alt-Text und Profil zählen mehr** ([Hootsuite](https://blog.hootsuite.com/social-media-updates/instagram/hashtags-dont-affect-reach/)). | Hashtags passen. Kein Hebel für mehr Reichweite. **Schlüsselwörter** stärker nutzen. |
| **Hook** | Erste Zeilen ruhig und markentreu („Vom Wanderer zur Legende.“) | Im Feed entscheidet das Bild bzw. die erste Reel-Sekunde. | Ordentlich, aber die Bilder sind Titelgrafiken (Logo + Schlagzeile) ohne Spielszene. Ein Hook mit konkretem Reiz fehlt („Dieser Boss warnt dich 2 Sekunden vorher“). |
| **Alt-Text** | Kommt an (per API geprüft) | Alt-Text hilft bei Barrierefreiheit und Einordnung. | Gut. Mängel: Beim Karussell bekommt **jede Seite denselben Alt-Text** (Skript übergibt einen Text für alle), und der Alt-Text von 002 nennt „Drei Schritte zum Start“, die Seite 5 zeigt aber „Noch in Entwicklung“. |
| **Uhrzeit 17:35** | Tatsächlich 17:36 / 17:45 / 18:23 MEZ | Studien widersprechen sich (Buffer: Mi 18 Uhr unter den Top-Zeiten, Fr/Sa schwächer; Sprout: Di/Mi Nachmittag bis Abend) – Empfehlung aller: eigene Insights ([Buffer](https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram), [Sprout Social](https://sproutsocial.com/best-times-to-post/instagram-general)). | Zeit ist vertretbar. **Bei 0 Followern ist die Uhrzeit nahezu wirkungslos.** Erst ab ca. 100 Followern über Insights optimieren. |
| **Bildgröße 1080×1350** | Hochformat 4:5 | Größtes Feed-Format für Bilder; das Profilraster zeigt seit 2025 Hochformat-Kacheln (Annahme, nicht gesondert geprüft). | Richtig, beibehalten. |
| **Erster Eindruck des Profils** | Ältester Beitrag „Comming soon...“ (Tippfehler), Name ohne Suchbegriff, Bio endet auf „·“ | Wer das Profil besucht, entscheidet in Sekunden. | Leichte Bremse für die Umwandlung Besuch → Follow. |
| **Frequenz** | täglich | Sekundär berichtet: Mosseri rät zu etwa 2 Reels + 3–5 Feed-Beiträgen pro Woche (nicht im Original geprüft). | Tägliches Posten von Standbildern bringt ohne Follower wenig. Besser: weniger Bilder, dafür Reels und Stories. |

**Zusätzlich technisch:** Das Skript `meta-api.js` kann heute nur Bilder und Bild-Karussells. Die Graph API unterstützt **Reels (`media_type=REELS`) und Stories (`media_type=STORIES`, nur Business-Konten)** ([Meta Developer: Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)). Musik aus der Instagram-Bibliothek ist per API nicht wählbar. Werkzeuge vorhanden: Playwright (Spiel im Browser) und `ffmpeg` (Videoschnitt) liegen in der Umgebung.

## 4. Maßnahmen

Bewertung: Nutzen / Aufwand / Risiko jeweils hoch–mittel–gering. „Regelkonform“ = vereinbar mit Wahrheitsregeln und „Spiel noch nicht öffentlich“.

### a) Sofort im bestehenden Rahmen umsetzbar

| # | Maßnahme | Nutzen | Aufwand | Risiko | Regelkonform |
|---|---|---|---|---|---|
| A1 | **Reels aus echter Spielgrafik** (8–20 s, vertikal 1080×1920, ohne Musik oder mit Musik durch Pascal): Bildschirmaufnahmen im Testmodus Augsburg per Playwright, z. B. Boss-Telegraph, Klassen-Entwicklung Wanderer→Pfadstufe 3, Sprite-Parade der 50 Monster, Herstellen. Text-Hook in der ersten Sekunde, Untertitel im Bild. | hoch | mittel (einmalig Aufnahme-Skript + Skript-Erweiterung REELS; danach gering) | gering; Video-Upload über raw.githubusercontent.com vorher testen | ja – nur echte Szenen, Prototypen nicht zeigen, keine echten Wohnorte |
| A2 | **Skript `meta-api.js` um Reels und Stories erweitern** (Entwicklungsauftrag, Prüfung durch `rw-qa`). Pro Karussellseite eigener Alt-Text. | hoch (Voraussetzung für A1/A3 im autonomen Lauf) | mittel | gering; Sicherheitssperren bleiben gleich | ja |
| A3 | **Stories 3–5×/Woche**: jeden neuen Beitrag teilen, Umfrage-/Frage-Optik als Bild (per API sind interaktive Sticker nicht setzbar – echte Umfrage-Sticker nur durch Pascal in der App). | mittel (bindet Follower, sobald es welche gibt) | gering | gering | ja |
| A4 | **Teilbarkeit gezielt erzeugen**: Inhalte, die man jemandem schickt („Welche Klasse passt zu deinem Freund?“, „Schick das deinem Spaziergang-Partner“). Speicher-Karussells mit Nutzwert (Klassen-/Pfad-Übersicht, Monster je Lebensraum). | mittel–hoch | gering | gering; nicht reißerisch werden | ja |
| A5 | **Schlüsselwörter statt mehr Hashtags**: in Caption-Satz 1–2, Bildtext und Alt-Text Begriffe wie „GPS-Rollenspiel“, „Pixel-Art-RPG“, „Browserspiel ohne App“, „Spiel für Spaziergänge“. Hashtags bei 3–5 belassen, nach Pool rotieren. | mittel | gering | gering | ja |
| A6 | **Serien mit Wiedererkennung**: „Kreatur der Woche“ (Monster-Sprite + Lebensraum), „Pfad-Freitag“ (je 1 der 12 Pfade), „Werkstatt“ (Entwickler-Update aus `git log`). Feste Serien erleichtern das Folgen. | mittel | gering | gering | ja |
| A7 | **Hook mit Spielinhalt statt Logo-Titel**: Titelbild zeigt eine echte Szene oder Figur groß, Schlagzeile als konkreter Reiz; Logo klein. | mittel | gering | gering | ja |
| A8 | **Posting-Zeit vorerst lassen**, ab ca. 100 Followern über Insights („Wann deine Follower aktiv sind“) anpassen. Wochenende ggf. vormittags testen. | gering (jetzt) | gering | – | ja |
| A9 | **Karussell-Anteil** auf ca. 2/Woche, Einzelbilder auf 1/Woche reduzieren. | mittel | gering | – | ja |
| A10 | **Messung**: ab sofort wöchentlich `marketing/analyse/` mit Reichweite, Sends, Saves, Profilbesuchen, Follows je Beitrag (Abruf wie in Abschnitt 2, nur lesend). Optional Skriptbefehl `insights` um Media-Insights erweitern. | mittel (Steuerung) | gering | – | ja |

### b) Braucht Pascals Entscheidung

| # | Maßnahme | Nutzen | Aufwand | Risiko | Regelkonform |
|---|---|---|---|---|---|
| B1 | **Start-Anschub durch Pascal persönlich** (kein Agent): Konto in eigener Story/Status teilen, Freunde, Familie, Kolleg:innen und bestehende Kontakte bitten zu folgen, in Bio/Signatur verlinken. Ziel: erste 50–100 echte Follower. | **sehr hoch** | gering | gering (echte Menschen, kein Kauf) | ja – Aufruf ist „folgen“, nicht „spielen“ |
| B2 | **Profil-Feinschliff** (macht Pascal in der App): Anzeigename „Ruin Walk · GPS-Fantasy-RPG“ (Suchbegriff im Namen, wie in `04_instagram.md` geplant), Bio vervollständigen (z. B. „In Entwicklung · gemacht in Augsburg“), Beitrag „Comming soon...“ archivieren oder Tippfehler korrigieren, Alt-Text von 002 in der App korrigieren, Kontostatus prüfen. | mittel | gering | gering | ja (Bio ohne „Jetzt testen“, solange nicht öffentlich) |
| B3 | **Begrenzte Community-Arbeit freigeben** (heute verboten: `kommentare_und_nachrichten: false`): Stufe 1 – auf Kommentare unter eigenen Beiträgen antworten (Textbausteine vorab freigeben). Stufe 2 – täglich ca. 10 Minuten echte, inhaltliche Kommentare bei passenden Pixel-Art-/Indie-Dev-/GPS-Spiel-Konten; gezieltes Folgen von Nischenkonten. Ausführung wahlweise durch Pascal selbst oder per Agent als Entwurf, den Pascal absendet. | hoch | mittel (täglich) | mittel: Spam-Eindruck, Plattform-Sperren bei Masse; daher Obergrenzen, keine Kopiertexte, kein Folgen/Entfolgen | ja, solange nicht für „Spiel testen“ geworben wird |
| B4 | **Collab-Posts / Kooperationen** mit Pixel-Art-Künstler:innen oder Indie-Dev-Konten (Collab-Funktion zeigt den Beitrag beiden Follower-Kreisen). Anfrage durch Pascal. | hoch | mittel | gering–mittel (Partnerwahl, Rechte an fremder Kunst klären) | ja, wenn der Partner nur echte Spielgrafik zeigt bzw. eigene Kunst klar gekennzeichnet ist |
| B5 | **Reddit/Discord-Communities** (z. B. r/PixelArt, r/IndieDev, deutschsprachige Indie-Gruppen) mit Entwicklungs-Einblicken, Regeln je Community beachten, keine Werbung wo verboten. Postet Pascal. | mittel–hoch | mittel | mittel (Regelverstöße, Kritik) | ja, als Devlog ohne Spielaufruf |
| B6 | **TikTok / YouTube Shorts**: dieselben Reels zusätzlich veröffentlichen (neuer Account durch Pascal, neuer Kanal in den Regeln). | hoch (zweite Empfehlungsmaschine, gleiche Inhalte) | gering–mittel nach A1 | gering | ja |
| B7 | **Facebook-Seite** | gering für Reichweite bei der Zielgruppe; nützlich für Gruppen und spätere Werbung | mittel | gering | ja |
| B8 | **Bezahlte Werbung** (Beitrag hervorheben, z. B. 3–5 €/Tag für 7 Tage auf das beste Reel, Zielgebiet Deutschland/Augsburg, Interessen RPG/Pixel-Art) | mittel–hoch, kurzfristig | gering | mittel: Geld, ohne spielbares Ziel bleibt nur „Folgen“; Erfahrungswerte erst ab gutem organischem Reel | ja, aber separater Auftrag mit Budget |
| B9 | **Gewinnspiele** | kurzfristig Follower, oft geringe Qualität | mittel (Recht: Teilnahmebedingungen, Impressum, Meta-Promotion-Richtlinie) | mittel–hoch; derzeit nichts Sinnvolles zu verlosen, Skript sperrt „Gewinnspiel“ | **nicht empfohlen** vor Spielstart |
| B10 | **Rhythmus anpassen** (Entscheidung Pascal vom 19.11. ist „täglich 1 Feed-Beitrag“): siehe Abschnitt 5 – ggf. 4–5 Feed-Beiträge + 2 Reels statt 7 Standbilder. | mittel | – | gering | ja |

### Reihenfolge nach Wirkung und Aufwand (Top 5)

1. **B1 Start-Anschub durch Pascal** (sehr hoch / gering) – ohne erste echte Follower bleibt alles andere unsichtbar.
2. **A1 + A2 Reels aus echter Spielgrafik** (hoch / mittel) – einziger realistischer Weg zu Nicht-Followern ohne Budget.
3. **B3 Begrenzte Community-Arbeit** (hoch / mittel) – Sichtbarkeit in der Nische, Gegenseitigkeit.
4. **A4 + A6 Teilbare Serien** (mittel–hoch / gering) – erzeugt Sends und Saves, die stärksten Signale.
5. **B2 Profil-Feinschliff** (mittel / gering) – macht aus Besuchen Follows.

## 5. 14-Tage-Vorschlag für den täglichen Lauf (21.11.–4.12.2026)

Vorschlag, **nicht umgesetzt**. Voraussetzung für Reels und Stories im autonomen Lauf ist A2 (Skript-Erweiterung, getestet). Bis dahin: Reel-Dateien als Entwurf vorbereiten, Pascal postet sie in der App (mit Musik aus der Bibliothek), oder Bilder wie bisher.

| Tag | Feed (17:35) | Story (nach dem Beitrag) |
|---|---|---|
| Sa 21.11. | Karussell 004 Lebensräume (bereits vorbereitet) | Beitrag teilen |
| So 22.11. | **Reel 1:** „Vom Wanderer zum Hohepriester – und dann?“ (dritte Stufe bleibt geheim, Entscheidung Pascal 20.11.2026) – Figuren-Verwandlung, 10 s | Frage-Optik „Welche Klasse?“ |
| Mo 23.11. | Bild/Umfrage 005 (bereits in Arbeit) | Beitrag teilen |
| Di 24.11. | Pause oder Story-Tag | Werkstatt-Einblick (git log) |
| Mi 25.11. | **Reel 2:** Gebietsboss-Telegraph in echter Spielszene | Beitrag teilen · **7-Tage-Auswertung 001** |
| Do 26.11. | Karussell „Kreatur der Woche“ #1 (Serie) | „Schick das jemandem …“ |
| Fr 27.11. | Pfad-Freitag #1 (Bild) | – |
| Sa 28.11. | **Reel 3:** 50 Monster in 15 Sekunden (Sprite-Parade) | Beitrag teilen |
| So 29.11. | Pause | Rückblick der Woche |
| Mo 30.11. | Werkstatt #1 (Entwickler-Update, Karussell) | Frage an Community |
| Di 1.12. | **Reel 4:** Herstellen „Aus Ast und Stein wird Werkzeug“ | Beitrag teilen |
| Mi 2.12. | Kreatur der Woche #2 | – |
| Do 3.12. | Pfad #2 (Bild) | Beitrag teilen |
| Fr 4.12. | **Reel 5:** bestes Reel-Thema der ersten vier wiederholen, neuer Hook | **Wochenauswertung**, Plan anpassen |

Formatmischung pro Woche: **2–3 Reels, 2 Karussells, 1–2 Bilder, 1 Pausentag, Stories an 4–5 Tagen.**
Messgrößen für den 4.12.: Reichweite je Format, Sends und Saves pro Reichweite, Profilbesuche, neue Follower. Ziel (Annahme, ohne B1 kaum erreichbar): 50 Follower, mindestens ein Reel mit Reichweite > 200.

## 6. Entscheidungen für Pascal

1. **B1:** Machst du den persönlichen Start-Anschub (teilen, Freunde bitten)?
2. **B2:** Profil korrigieren (Name mit „GPS-Fantasy-RPG“, Bio vervollständigen, „Comming soon...“ archivieren/korrigieren, Alt-Text 002, Kontostatus ansehen)?
3. **A2:** Darf `meta-api.js` für Reels und Stories (inkl. Alt-Text je Karussellseite) erweitert werden? Testweise erster Reel-Upload nur nach deiner Freigabe.
4. **B3:** Community-Arbeit freigeben? Wenn ja: welche Stufe, wer führt aus, Obergrenzen.
5. **B10:** Rhythmus „täglich 1 Feed“ beibehalten oder auf den Mix aus Abschnitt 5 (mit Pausentagen) ändern?
6. **B4–B8:** Kooperationen, Reddit/Discord, TikTok/Shorts, Facebook, Budget – jeweils später einzeln, am sinnvollsten erst nach den ersten Reels.

## Quellen (abgerufen 20.11.2026)

- Instagram Hilfe-Center: Kontostatus – https://help.instagram.com/539126347315373
- Instagram Creators: Recommendations eligibility – https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators (Seite in dieser Umgebung nicht direkt abrufbar, Inhalt laut Suchergebnis)
- Meta Newsroom: Trial Reels (12/2024) – https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first/
- Betanews: Trial Reels für mehr Creator (07/2025) – https://betanews.com/2025/07/14/instagram-opens-up-trial-reels-feature-to-more-creators/
- Meta for Developers: Content Publishing (Reels, Stories) – https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Buffer: Instagram-Algorithmus 2026 – https://buffer.com/resources/instagram-algorithms/
- Sprout Social: Instagram-Algorithmus – https://sproutsocial.com/insights/instagram-algorithm/
- Social Media Today: Hashtag-Limit – https://www.socialmediatoday.com/news/instagrams-implementing-new-limits-on-hashtag-use/808309/
- Business Today: Hashtag-Limit 5 (12/2025) – https://www.businesstoday.in/technology/news/story/no-more-hashtag-stuffing-instagram-limits-hashtag-usage-to-just-5-per-reel-and-post-507444-2025-12-19
- Hootsuite: Hashtags beeinflussen Reichweite nicht – https://blog.hootsuite.com/social-media-updates/instagram/hashtags-dont-affect-reach/
- Buffer: Beste Posting-Zeiten 2026 – https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram
- Sprout Social: Beste Posting-Zeiten 2026 – https://sproutsocial.com/best-times-to-post/instagram-general

Hinweis zur Quellenlage: Viele Algorithmus-Aussagen stammen aus Marketing-Blogs, die Mosseri sinngemäß zitieren; Originalaussagen 2026 wurden nicht direkt geprüft. Zahlenangaben aus solchen Quellen sind hier bewusst weggelassen.
