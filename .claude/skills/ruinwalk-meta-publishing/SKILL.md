---
name: ruinwalk-meta-publishing
description: Anbindung von Ruin Walk an Instagram und Facebook über Meta Business Suite und die offizielle Graph API – benötigte Konten, Berechtigungen, sichere Token-Hinterlegung, Statusprüfung, Insights lesen, Veröffentlichen von Bildern, Karussells, Reels und Stories (Trockenlauf als Standard, doppelte Freigabesperre) und Antworten auf Kommentare unter eigenen Beiträgen. Nutzen, wenn Accounts verbunden, Berechtigungen geprüft, Kennzahlen gelesen oder ein freigegebener Beitrag veröffentlicht werden soll.
---

# Meta-Anbindung (Instagram + Facebook)

Anleitung für Pascal: `marketing/meta/ANBINDUNG.md`. Berechtigungsliste: `marketing/meta/BERECHTIGUNGEN.md`.

## Stand
- Instagram **@ruinwalk.official** (Business-Konto, 18.11.2026), Weg: Graph API mit Facebook-Login (`api_host: graph.facebook.com` in `marketing/meta/config.json`), Token als Netzwerk-Geheimnis hinterlegt. Keine Facebook-Seite.
- Token-Rechte (Stand 20.11.2026, `status`): `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_messages`, `instagram_manage_events` – **`instagram_manage_comments` fehlt** (nötig für `antworten`).
- **Bilder öffentlich:** Ist `bild_url` leer, erzeugt das Skript automatisch `https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/<commit>/<pfad>` aus dem auf GitHub gepushten Stand des aktuellen Zweigs (Commit-Hash = unveränderliche Adresse). Bilder müssen JPEG sein und **vor** dem Posten committet und gepusht werden. Kein Push auf `main` nötig.
- **Karussell:** `bild: …_1.jpg (+ _2 bis _N)` → alle Seiten `_1…_N` (max. 10) werden als Karussell gepostet. **Alt-Text je Seite:** im Abschnitt `## Alt-Text` Zeilen `Seite 1: …`, `Seite 2: …`. Fehlt eine Seite, bekommt sie den ganzen Block (Hinweis bei `pruefen`). Quelle: IG-User-Media-Referenz (Beispiel `image_url` + `is_carousel_item` + `alt_text`), Changelog 24.03.2025: `alt_text` nur für Bildbeiträge, nicht für Reels/Stories.
- **Reel:** `format: reel`, `video: …mp4` (9:16, H.264, AAC oder stumm, `+faststart`, 3 s–15 min, ≤ 300 MB laut Meta; über GitHub praktisch ≤ 50 MB, Push-Grenze 100 MiB). Container `media_type=REELS`, `video_url`, `caption`, `share_to_feed=true`, optional `vorschau_ms:` → `thumb_offset`. Das Skript fragt `status_code` ab und veröffentlicht nur bei `FINISHED` (max. 60 × 5 s); `ERROR`/`EXPIRED`/Zeitüberschreitung → nichts veröffentlicht. Zählt als Feed-Beitrag.
- **Sperre erstes Reel:** Solange in `LOG.md` kein `instagram-reel:` steht, sendet das Skript ein Reel nur, wenn im Entwurf genau `freigegeben_von: Pascal` steht (Trockenlauf zeigt Hinweis). **Ehrlich:** Das ist eine Prozessregel, keine technische Sicherung – das Skript kann nicht prüfen, wer das Feld geschrieben hat. Der Agent setzt `freigegeben_von` nie selbst; nur Pascal (oder auf seine ausdrückliche Chat-Anweisung die Hauptsitzung mit Quellenangabe).
- **Story:** `format: story`, `bild:` (JPEG) **oder** `video:`. Container `media_type=STORIES`, keine Caption. Text auf dem Bild in `## Text im Bild` (wird mitgeprüft). Eigenes Tageslimit `STORY_MAX_PRO_TAG = 3` (Konstante im Skript, nicht in `modus.json`), zählt nicht zum Feed-Limit. Umfrage-/Frage-Sticker sind per API nicht setzbar.
- **Video-URL:** wie Bilder über raw.githubusercontent.com (gepushter Commit) oder `video_url:`. GitHub liefert MP4 als `application/octet-stream` – erster echter Upload zeigt, ob Instagram das annimmt.
- Kein offizieller Meta-Connector in der Claude-Umgebung vorhanden. Drittanbieter-Connectoren (z. B. Windsor.ai, Zapier) wären möglich, leiten aber Daten über Dritte – nur auf ausdrücklichen Wunsch.

## Zwei Wege – Empfehlung
1. **Start (sofort, ohne Technik): Meta Business Suite manuell.** Agent liefert fertigen Entwurf (Bild + Text + Alt-Text + Hashtags + Wunschzeit), Pascal plant/veröffentlicht in der Business Suite. Kennzahlen exportiert Pascal dort (CSV) nach `marketing/analyse/`.
2. **Später: Graph API mit eigener Meta-App** (Typ „Business“) und einem **System-User-Token** aus dem Meta-Business-Portfolio, der nur die Ruin-Walk-Seite und das verknüpfte Instagram-Konto verwalten darf. Für eigene Konten genügt „Standard Access“ ohne App Review, solange nur Personen/System-User mit Rolle in der App/dem Portfolio betroffen sind (vor Einrichtung in der aktuellen Meta-Doku bestätigen).

## Token sicher hinterlegen
- **Nie** ins Repo, nie in den Chat, nie in `config.json`.
- Claude-Cloud-Umgebung: als Netzwerk-Geheimnis für Host `graph.facebook.com` (Header `Authorization: Bearer …`) – der Agent fordert das über das sichere Formular an (`request_credential`), Pascal trägt den Wert ein. Der Proxy setzt den Header, der Agent sieht den Wert nie.
- Lokal: Umgebungsvariable `META_TOKEN` (nicht committen).
- `marketing/meta/config.json` enthält nur öffentliche IDs: `api_version`, `page_id`, `ig_user_id`.

## Befehle
```bash
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js status                      # Token, Rechte, Seite, IG-Verknüpfung (lesend)
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js insights 7                  # letzte Beiträge (lesend)
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js pruefen <entwurf.md>        # Qualitätsprüfung
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md>            # Trockenlauf
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md> --senden   # nur nach Freigabe
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js kommentare 7                # Kommentare unter eigenen Beiträgen (lesend), [offen]/[beantwortet]
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js antworten <kommentar-id> "<text>"            # Trockenlauf
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js antworten <kommentar-id> "<text>" --senden   # Antwort senden
node .claude/skills/ruinwalk-meta-publishing/tests/meta-api.test.js   # Tests ohne Netz (Attrappe tests/attrappe.js, braucht ffmpeg)
# Test-Schalter RW_META_* wirken nur mit geladener Attrappe (sie setzt __RW_META_ATTRAPPE und ersetzt fetch); sonst bricht das Skript ab.
```
Veröffentlichen verlangt im Entwurf: `status: autonom` (Modus autonom) oder `status: freigegeben` + `freigegeben_von: Pascal …`, `kanal: instagram|facebook|instagram,facebook`, `bild_url: https://…` (öffentlich erreichbar – Instagram lädt das Bild selbst; z. B. GitHub Pages nach Push auf `main` oder eine von Pascal gewählte Ablage). Abschnitte `## Caption Instagram`, `## Text Facebook`, `## Alt-Text`. Kopf `format: post|karussell|reel|story` (ohne Angabe: Karussell, wenn `bild` mit `(+`, sonst `post`). Kanal-IDs im LOG: `instagram:` (Bild/Karussell), `instagram-reel:`, `instagram-story:`.

## Antworten auf Kommentare (Freigabe Pascal 20.11.2026, `modus.json` → `antworten_auf_eigene_kommentare`)
Endpunkt `POST /{ig-comment-id}/replies` mit `message` (Meta-Referenz „IG Comment Replies“; Berechtigung beim Facebook-Login `instagram_manage_comments`, beim Instagram-Login `instagram_business_manage_comments`). Nur Hauptkommentare, keine ausgeblendeten.

`kommentare_und_nachrichten: false` in `modus.json` gilt weiter für eigenes Kommentieren (bei anderen Konten) und Direktnachrichten. Der Befehl `antworten` folgt **nur** dem Feld `antworten_auf_eigene_kommentare`.

Das Skript prüft: `erlaubt === true` und Modus ≠ `pause` · Kommentar steht unter einem **eigenen** Beitrag (`owner` des Beitrags = `ig_user_id`), ist kein eigener Kommentar und keine Antwort · noch nicht beantwortet (`ANTWORTEN_LOG.md` und vorhandene Antworten von @ruinwalk.official) · Tageslimit `max_pro_tag` (gezählt in `marketing/freigabe/veroeffentlicht/ANTWORTEN_LOG.md`, ohne Namen der Kommentierenden) · Text ≤ 300 Zeichen, keine Links/Domains (jede Endung), keine @-Erwähnung fremder Konten, nichts zu Spielen/Ausprobieren/Testen/Testmodus/Beta/Download/Anmeldung, keine Termine/Jahreszahlen/Jahreszeiten, nichts zu Preis/Geld, keine nicht-live Funktionen (Mehrspieler, Gruppen, Dungeons, Weltboss, Handel, Ranglisten, PvP, Gilden), dazu dieselben Verbotslisten wie bei Beiträgen (`VERBOTEN`, `NICHT_OEFFENTLICH`). Trockenlauf als Standard. Die Wortlisten sind ein Netz, kein Ersatz für die Einordnung durch den Agenten.

**Ablauf (macht der Agent, nicht das Skript):** Das Skript erkennt heikle Kommentare nicht zuverlässig. Vor jeder Antwort einordnen:
1. `kommentare 7` lesen, nur `[offen]` betrachten.
2. **Heikel → nicht antworten, Pascal melden** (Kommentar-ID + Kurzinhalt im Bericht): Kritik, Beschwerde, Beleidigung, Spam/Werbung, Fragen zu Daten/Datenschutz/Geld/Preis/Termin/Testzugang, Bitte um Link, Minderjährige, politische oder persönliche Themen, alles Unklare.
3. Unbedenklich (Lob, Fragen zu vorhandenen Spielinhalten, Antwort auf unsere Frage): kurz, freundlich, Du-Form, Markenton, nur belegte Fakten, keine Zusagen. Höchstens eine Rückfrage.
4. `antworten <id> "<text>"` (Trockenlauf), dann mit `--senden`. Gesperrt sind u. a. auch Monatsnamen/„so weit“, Early Access, Warteliste, Zugang, DM/Direktnachricht, Discord und „Link im Profil“. Keine Likes, kein Folgen, keine Direktnachrichten, nie woanders kommentieren.

## Veröffentlichungsmodus (`marketing/meta/modus.json`)
| Modus | Wirkung |
|---|---|
| `autonom` (aktuell, entschieden von Pascal 18.11.2026) | Skript veröffentlicht Entwürfe mit `status: autonom` oder `freigegeben`, wenn die Qualitätsprüfung besteht, der Kanal in `erlaubte_kanaele` steht (derzeit nur `instagram`) und Tages-/Wochenlimit frei sind. Hook fragt nicht nach. |
| `freigabe` | nur `status: freigegeben` + `freigegeben_von: Pascal`; Hook fragt vor jedem Senden |
| `pause` | Skript verweigert jede Veröffentlichung (Not-Aus) |

## Sicherheitssperren
1. Skript: sendet nur mit `--senden`, prüft Modus, Status, Qualität (`pruefen`: Hook ≤ 125 Zeichen, 3–5 Hashtags mit #ruinwalk, Alt-Text, Faktenprüfung mit Belegen, „in Entwicklung“ ehrlich benannt, keine Superlative/fremden Links/Gewinnspiele, Bild-/Videodatei vorhanden und passend), Kanal und Limits (Feed aus `modus.json`, Stories 3/Tag), Sperre erstes Reel; protokolliert in `marketing/freigabe/veroeffentlicht/LOG.md`.
2. Hook `.claude/hooks/schutz.js`: jede Änderung an `modus.json` → Rückfrage an Pascal; rohe Schreibaufrufe an die Graph API (`curl -X POST` …) → immer Rückfrage; `meta-api.js --senden` nur im Modus `autonom` und nur als schlichter Einzelbefehl ohne Rückfrage.
3. Agent `rw-marketing`: kommentiert, liked, folgt, schreibt Nachrichten und löscht nie ohne Freigabe; heikle Themen gehen trotz Modus `autonom` an Pascal.
4. `scripts/geheim.js` (Pascal, 20.11.2026: verborgene Klassen bleiben geheim): leitet aus `index.html` die 12 verborgenen dritten Pfadstufen ab (`PATHS[*].st[2]`: Name, Figur-ID, Fähigkeit; dazu Set-Name `PSN[*][2]`), feste Ausnahmen „Erdbeben“ (BFX Urmammut) und „Erleuchtung“ (`SECRET.moench.h`). Vergleich normalisiert (ä→ae …, Bindestriche/Leerzeichen, Beugungen wie „Lichtgesandten“, „Sonnenwächterin“). Erzwungen von `pruefen` (Texte, Alt-Text, Dateipfade), `antworten` und `render.js`. Bilder selbst prüft es nicht – Sichtprüfung bleibt Pflicht.
5. `pruefen` und `antworten` behandeln das Spiel als nicht öffentlich, solange `config.json` nicht ausdrücklich `spiel_oeffentlich: true` enthält (fehlender Schlüssel = nicht öffentlich).
6. Hook-Positivliste (Stand Hauptsitzung 21.11.2026): Im Modus `autonom` läuft ohne Rückfrage nur exakt `node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen|antworten … --senden` (optional `2>&1`); alles andere mit `--senden`, mit Test-Schaltern `RW_META_*` oder vorgeladenen Modulen fragt nach. Die Test-Schalter wirken ohnehin nur mit der Attrappe (`tests/attrappe.js`).

## Automatischer Zeitplan (nach API-Anbindung)
Ein geplanter Auftrag (scheduled task der Claude-Umgebung) kann zu festen Zeiten den nächsten passenden Entwurf aus dem Redaktionskalender prüfen und veröffentlichen. Einrichtung erst, wenn Token und `config.json` stehen und ein erster Beitrag manuell erfolgreich war.

## Grenzen der API (vor Nutzung in der aktuellen Doku prüfen)
- Instagram: Veröffentlichung in zwei Schritten (Container → `media_publish`), Bild per öffentlicher URL (JPEG), Tageslimit für API-Beiträge (Endpunkt `content_publishing_limit`, derzeit 100/24 h), Stories nur für Business-Konten.
- Quellen (Suche 20.11.2026; `developers.facebook.com` ist in dieser Umgebung nicht direkt abrufbar, Inhalte über Suchergebnisse bestätigt): Content Publishing https://developers.facebook.com/docs/instagram-platform/content-publishing/ · IG User Media https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media · Changelog https://developers.facebook.com/docs/instagram-platform/changelog · IG Comment Replies https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/ · GitHub-Dateigrößen https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- Facebook-Seite: Beiträge über `/{page-id}/feed` bzw. `/photos` mit Seiten-Token.
- Musik aus der Instagram-Bibliothek ist per API nicht wählbar → Reels mit Musik postet Pascal manuell.
- Bild und Karussell sind echt erprobt (001–003). Reels, Stories und Antworten sind nur gegen die Attrappe getestet; der erste echte Lauf je Format nach Freigabe durch Pascal.
