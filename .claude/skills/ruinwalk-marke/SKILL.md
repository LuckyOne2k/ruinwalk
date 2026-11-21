---
name: ruinwalk-marke
description: Markenleitfaden von Ruin Walk – Positionierung, Tonalität, Wortwahl, Farben, Schriften, Bildsprache, Wahrheitsregeln (was als live, was als in Entwicklung kommuniziert werden darf) und Kurzprüfung für jeden öffentlichen Text. Laden vor jedem Marketingtext, Post, Landingpage-Text, Store-Text oder jeder Grafik.
---

# Marke Ruin Walk

Ausführlich: `marketing/02_marke_kommunikation.md`. Diese Datei ist die Arbeitsfassung.

## Kern
- **Name:** Ruin Walk · Untertitel „The Forgotten World“. Immer zwei Wörter, „Ruin Walk“ (nicht „Ruinwalk“, nicht „RuinWalk“) in öffentlichen Texten.
- **Ein Satz:** Ein mystisches GPS-Fantasy-RPG im Browser, das deine echte Umgebung in eine vergessene Welt voller Ruinen, Kreaturen und Schätze verwandelt.
- **Leitmotiv:** „Deine Welt ist das Spielfeld.“ / „Verlass die bekannten Wege.“
- **Versprechen:** Rausgehen lohnt sich – jeder Weg kann Ressourcen, Gegner oder Beute bringen. Tiefe eines klassischen RPGs (Klassen, Pfade, Sets, Bosse) ohne App-Store, direkt im Browser.

## Tonalität
- Deutsch, Du-Form, warm und geheimnisvoll, nie albern oder marktschreierisch.
- Bildhafte, kurze Sätze. Fantasy-Wortschatz sparsam: Ruinen, Pfade, Legenden, Wildnis, Beute, Kreaturen.
- Entwickler-Updates: ehrlich, nahbar, konkret („Diese Woche: …“). Ein Mensch baut hier ein Spiel – das darf man merken.
- Verboten: Superlative ohne Beleg („das beste RPG“), Druck („nur heute!“), Pay-to-win-Andeutungen, Versprechen mit Datum, das nicht feststeht.

## Wahrheitsregeln (wichtigste Regel)
| Status im Spiel | So darf es kommuniziert werden |
|---|---|
| ✅ live (z. B. GPS-Erkundung, 4 Klassen + 12 Pfade, 50 Monster, Gebietsbosse mit Telegraphen, Crafting, Sets/+10, Gebietsstufen, Cloud-Speicher, 3 Charakterplätze) | als vorhanden, mit echtem Screenshot/Sprite |
| 🧪 Prototyp/in Arbeit (Gruppen-Dungeons, Weltboss, Mehrspieler) | nur „in Entwicklung“, „wir arbeiten an …“, ohne Termin, ohne Spielszenen |
| ❌ nicht vorhanden (Hauptgeschichte, Handel, Ranglisten, PvP, App-Store-App, Events) | nicht erwähnen oder als offene Frage an die Community („Was wünscht ihr euch?“) |

**Verborgene Klassen bleiben geheim** (Pascal, 20.11.2026): Die dritte Stufe jedes Pfads (`PATHS[*].st[2]`, im Spiel „❓ Verborgene Klasse – Name und Werte bleiben geheim“) wird nie öffentlich mit Namen, Fähigkeit, Werten oder Figur gezeigt, auch nicht als Silhouette und nicht durch Bestätigen von Rateversuchen. Erwünscht sind Hinweise („Die dritte Stufe bleibt ein Geheimnis …“) und die Rätselsprüche aus `SECRET[*].h`, die das Spiel vorher zeigt. Das nötige Level der dritten Stufe (Level 50, `UP_LV`) darf genannt werden (Entscheidung Pascal 21.11.2026); alle übrigen Bedingungen, Zahlen und Werte der dritten Stufe bleiben geheim. Also auch nicht die Anforderungen aus `UPQ[2]`. Keine Screenshots aus „Klasse wechseln (Vorschau)“ (`?dev=1`) oder aus Testmodus-Spielständen mit Stufe 3. Sperrwörter (Name, Fähigkeit, Set-Name `PSN[*][2]`, Figur-ID) erzwingen `pruefen`, `antworten` und `render.js` über `geheim.js`. Sperrliste: `node .claude/skills/ruinwalk-meta-publishing/scripts/geheim.js` (aus `index.html` abgeleitet, von `meta-api.js pruefen`/`antworten` und `render.js` erzwungen).

Quelle der Wahrheit: Skill `ruinwalk-projektwissen` (`references/spielsysteme.md`). Im Zweifel: weglassen oder Pascal fragen.

## Visuelle Identität
- **Farben:** Nachtbraun `#120f0d` (Grund) · Paneel `#211812` · Gold `#d8a45d` / Hellgold `#f0c982` (Akzente, Kicker) · Pergament `#f3e8d8` (Text) · Glut-Orange `#ff7a2f` (nur für Hinweise/Badges, Spiel-Akzentfarbe) · Gedämpft `#c0ad99`.
- **Schriften:** Cinzel (Titel, Kicker, Großbuchstaben-Look) · Crimson Text (Fließtext). Wie Landingpage.
- **Bildwelt:** gemalte, dunkle Waldruinen (`assets/bg_*.jpg`) + scharfe Pixel-Art-Figuren (`figs/`) + echte Spiel-Screenshots. Goldene Doppelrahmen-Linie als Wiedererkennungsmerkmal (Vorlage `ruinwalk-grafik`).
- **Logo** `assets/logo.png` nie verzerren, nie umfärben, auf dunklem Grund.
- KI-Bilder: nur als Stimmungsbild, kennzeichnen („Stimmungsbild“), nie als Spielszene. Keine Stile lebender Künstler nachahmen, keine fremden Marken/Figuren.

## Kurzprüfung vor jeder Freigabe (alle mit Ja beantworten)
1. Stimmt jede Spielaussage mit dem Projektwissen überein (live vs. in Entwicklung)? Bleibt jede verborgene Klasse ohne Namen, Werte und Bild?
2. Zeigt das Bild echte Spielgrafik oder ist es als Stimmungsbild gekennzeichnet?
3. Tonalität: Du-Form, ruhig-mystisch, keine Übertreibung?
4. Klarer nächster Schritt (Frage, Link in Bio, Speichern) – höchstens einer?
5. Keine personenbezogenen Daten, keine echten Standorte von Personen, keine Spielerdaten ohne Einwilligung?
6. Barrierearm: Alt-Text vorbereitet, Text auf Bild gut lesbar, Untertitel bei Video?
