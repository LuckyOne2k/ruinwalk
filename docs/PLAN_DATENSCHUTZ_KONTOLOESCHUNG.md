# Ruin Walk – Umsetzungsplan Datenschutz und Kontolöschung

Stand: 15.11.2026 · Status: **nur Plan, nichts umgesetzt, nichts am Live-Schema oder Code geändert.**
Rechtstexte entstehen ausschließlich als **Entwurf** und müssen vor Veröffentlichung rechtlich geprüft werden (ich bin kein Anwalt).

---

## 1. Ist-Zustand (untersucht)

### 1.1 Live-Schema (Projekt `malbiahllucctiafzydv`, abgefragt 15.11.2026)

| Tabelle | Inhalt (personenbezogen) | Bezug zum Konto | Verhalten bei Konto-Löschung heute |
|---|---|---|---|
| `auth.users` (Supabase) | E-Mail, Passwort-Hash, Metadaten (Benutzername), Zeitstempel | Wurzel | – |
| `auth.sessions`, `identities`, `one_time_tokens`, `mfa_*`, `webauthn_*`, `oauth_*` | Sitzungen (u. a. IP, Browserkennung), Bestätigungs-/Reset-Token | FK → `auth.users` **CASCADE** | werden mitgelöscht |
| `public.profiles` | Benutzername, created_at, last_login | FK → `auth.users` **CASCADE** | mitgelöscht |
| `public.characters` | Name, Klasse, Level, Spielstand (JSON), Platz, Version | FK → `profiles` **CASCADE** | mitgelöscht |
| `public.character_backups` | Kopien der Spielstände (bis 10 „update“ + „delete“) | FK → `profiles` **CASCADE** | mitgelöscht |
| `public.account_entitlements` | Platz-3-Berechtigung, Zahlungsreferenz | FK → `profiles` **CASCADE** | mitgelöscht |
| `public.payment_events` | Zahlungsereignisse, Payload | FK → `profiles` **ohne CASCADE** | **blockiert die Löschung**, sobald eine Zeile existiert (heute 0 Zeilen) |
| `public.audit_log` | account_id, character_id, Aktion, Detail, Zeit | **kein FK** | **bleibt zurück** (heute 1 Zeile) |
| `auth.audit_log_entries` (Supabase) | Auth-Ereignisse mit IP/Aktor | kein FK | Verhalten prüfen (siehe L3) |

Policies: nur SELECT auf `profiles`, `account_entitlements`, `characters` (jeweils eigene Zeilen). Alle Schreibzugriffe laufen über `SECURITY DEFINER`-Funktionen (`create/save/list/move/delete_character`, `touch_login`, `username_available`). Es gibt **keine** Funktion zum Löschen eines Kontos. Mit dem Publishable Key kann ein Client `auth.users` nicht löschen.

Wichtig und bereits geprüft: Eine Kaskadenlöschung über das Konto erzeugt **keine neuen Backups** (`backup_character()` überspringt DELETE, wenn das Profil nicht mehr existiert). Der Live-Test hat gezeigt, dass nach Löschen der Testkonten keine Sicherungen zurückbleiben.

### 1.2 Lücken

- **L1 `payment_events`:** FK ohne Kaskade → Löschen des Auth-Kontos schlägt fehl, sobald es Zahlungsereignisse gibt. Zusätzlich: Zahlungsdaten unterliegen ggf. gesetzlichen Aufbewahrungspflichten (steuerrechtlich) → nicht blind löschen, sondern vom Konto lösen (anonymisieren). Rechtlich klären.
- **L2 `audit_log`:** bleibt nach Kontolöschung mit `account_id`/`character_id` bestehen (pseudonyme Daten, trotzdem personenbezogen).
- **L3 `auth.audit_log_entries`:** enthält ggf. IP und E-Mail/Aktor, ohne FK. Muss im Test geprüft werden: ob befüllt, ob die Löschfunktion Zugriff hat. Falls nicht löschbar: im Datenschutztext mit Frist nennen.
- **L4 Plattform-Reste, nicht löschbar:** Supabase-Projekt-Backups (je nach Tarif), API-/Auth-Logs mit IP (kurze Aufbewahrung je Tarif). Das lässt sich technisch nicht von uns löschen → muss ehrlich im Datenschutztext stehen („nach Löschung bis zu X Tage in Plattform-Backups/Logs“). Tarif und echte Fristen im Dashboard nachsehen.
- **L5 Gelöschte Charaktere:** `delete_character` legt eine Sicherung mit Grund „delete“ an, die **unbegrenzt** bleibt (solange das Konto existiert). Datenschutz verlangt eine Frist (Speicherbegrenzung). Vorschlag: 30 Tage, danach automatisch entfernen.
- **L6 Es gibt keinen Löschweg** für Nutzer und keinen Datenexport (Art. 15/20 DSGVO; Export optional, siehe Entscheidungen).
- **L7 Lokale Daten auf dem Gerät** (siehe 1.3) werden bei Löschung nicht aufgeräumt, und der Cloud-Zwischenspeicher könnte sonst später wieder hochladen.

### 1.3 Client (`index.html`) – betroffene Stellen

- Sitzung und Auth: `AUTH_KEY='ruinwalk_auth'`, `authStore()`, `authRefresh()`, `sbFetch`, `sbAuthed`, Passwort-Login `/auth/v1/token?grant_type=password` (Zeile ~2180).
- Konto-Bildschirm: `acctUI()`, `acLogout()`, `acLogoutAsk()`, `acLogoutHTML()`, `acLoad()`, Zustände `acV` (Ansichten), `acF` (Formularzustand), `acM` (Meldung).
- Cloud-Zwischenspeicher: Schlüssel `ruinwalk_cc_<id>` (+`_bak`, `_corrupt`, `_replaced_<ts>`, `_srvcopy_<ts>`), `ruinwalk_cm_<id>`, `ruinwalk_tl_<id>`, `ruinwalk_cloudmap`, `ruinwalk_slot`; `cloudCacheReplace()` kopiert in freie lokale Plätze.
- Sync: `SY`, `syncPush`, `syncFlush`, Tab-Sperre (`tlBeat/tlCheck`). Sync muss bei Löschung **sofort und endgültig** stoppen.
- Charakter löschen (bleibt getrennt): `charsUI()` → `cdel` → `deleteChar()`; Cloud: `delete_character`-RPC im Konto.
- Nie anfassen (Standardregel): lokale Plätze `ruinwalk_v1`, `ruinwalk_v1_s2/_s3` und ihre `_bak`.

---

## 2. Welche Daten tatsächlich wohin gehen (Prüfergebnis aus dem Code)

| Empfänger | Auslöser | Übertragene Daten | Anmerkung |
|---|---|---|---|
| **GitHub Pages** (GitHub/Microsoft) | jeder Seitenaufruf | IP, Browserkennung, Referrer, Zeit; **kein** Standort | Auslieferung von HTML/JS/Bildern. Keine Cookies von uns. |
| **unpkg.com** (Leaflet-Skript/CSS) | jeder Seitenaufruf | IP, Browserkennung, Referrer | **Vermeidbar:** Leaflet lokal einbinden (hilft auch Offline und Sicherheit). |
| **tile.openstreetmap.org** (OSM Foundation) | Karte anzeigen | Kachelkoordinaten z/x/y (= grober Standort bei Zoom ~17–19), IP, Browserkennung, Referrer | Auch im Gastmodus. OSM-Nutzungsrichtlinie: nur geringe Last; für Livebetrieb eigener Anbieter. |
| **overpass-api.de** | Lebensraumdaten laden | POST mit **Rasterfeld ca. 1,3 km × 1,3 km (Chunk aus 8×8 Zellen) um die Position** (Bounding Box, gemessen in D1), IP | Genauigster Standortbezug nach außen. Auch im Gastmodus. Das Feld ist gerastert, nicht die exakte Position. Lokal merkt sich das Spiel besuchte Felder in `ruinwalk_hab` (bis 200, nur auf dem Gerät). |
| **Supabase** (Frankfurt, Anbieter US-Unternehmen → Auftragsverarbeitung/SCC prüfen) | Registrierung, Login, Cloud-Speichern | E-Mail, Passwort (als Hash gespeichert), Benutzername, Zeitstempel, Sitzungsdaten (IP, Browserkennung), Charakterdaten (Name, Klasse, Level, Inventar, Statistiken wie gelaufene Meter/Spielzeit), Backups, Aktionsprotokoll, Berechtigungen | **Keine GPS-Koordinaten im Spielstand** (`def()` enthält keine Position; `lastGps` nur im Arbeitsspeicher). Per Test absichern. |
| **E-Mail-Versand** (Bestätigung, Reset) | Registrierung/Reset | E-Mail-Adresse | Welcher Versender nutzt Supabase aktuell (Standard-Mailer oder eigenes SMTP)? Im Dashboard prüfen und nennen. |
| **Browser (localStorage)** | immer | Spielstände, Sitzungstoken, Cloud-Zwischenspeicher, Einstellungen | Technisch notwendige Speicherung (kein Tracking, keine Cookies, keine Analyse, keine Werbung gefunden). |
| **GPS (Geolocation-API)** | Spielstart | Position nur lokal im Browser; geht nur indirekt als Rasterzelle an Overpass und als Kachel an OSM | Berechtigung fragt der Browser ab. |

**Prüfmethode (Schritt D1):** Ein Playwright-Test zeichnet alle Netzwerkanfragen im Gastmodus, mit GPS-Testposition, bei Registrierung/Login (Attrappe) und beim Cloud-Speichern auf und vergleicht die Hosts mit einer **Whitelist**. Ein neuer unbekannter Host lässt den Test fehlschlagen, damit nichts unbemerkt dazukommt. Zusätzlich ein Test, der prüft, dass im Cloud-Spielstand und in Anfragen an Supabase keine Koordinaten stehen.

---

## 3. Kontolöschung – Entwurf

### 3.1 Technischer Weg (Entscheidung nötig, Empfehlung A)

- **A (empfohlen): SQL-Funktion `delete_account(p_confirm text)`**, `SECURITY DEFINER`, löscht `auth.users` des aufrufenden Kontos. Vorteile: ein Ablauf in einer Transaktion, vollständig mit SQL-Tests prüfbar, keine neue Infrastruktur, kein Geheimschlüssel. Nachteil: Löschen von `auth.users` per SQL ist nicht der offiziell dokumentierte Weg; muss auf dem echten Projekt mit einem Wegwerfkonto bewiesen werden.
- **B: Edge Function** mit service_role und `auth.admin.deleteUser`. Offizieller Weg, aber: neue Infrastruktur, Geheimschlüssel in der Edge-Umgebung, schwerer testbar, zwei getrennte Stufen (erst Daten, dann Auth), Teilfehler möglich.

### 3.2 Schutz vor versehentlichem Löschen (mehrere Hürden)

1. Eigener Unterbildschirm „Konto löschen“, **nur** über das Konto erreichbar, ganz unten im Gefahrenbereich, anderer Name als „Charakter löschen“.
2. Klare Liste, was passiert: Konto, E-Mail, Benutzername, **alle Cloud-Charaktere (Anzahl + Namen)**, alle Server-Backups, Platz-3-Berechtigung (verfällt **ohne Erstattung**); was **nicht** passiert: lokale Spielstände auf diesem Gerät.
3. Optional vorher: „Cloud-Charaktere lokal behalten“ (Kopie in freie lokale Plätze 1/2, vorhandene `cloudCacheReplace`-Logik) oder Download als JSON-Datei. Ohne ausdrückliche Wahl keine Löschung.
4. **Passwort erneut eingeben** → frischer Login (neue Sitzung).
5. **Serverseitige Prüfung, dass die Sitzung jung ist** (Sitzung aus `auth.sessions`, Anlagezeit < 5 Minuten, gelesen über die Session-ID im JWT). So kann ein gestohlenes oder altes Token das Konto nicht löschen.
6. **Benutzername eintippen** als Bestätigung (Server vergleicht `p_confirm` mit dem eigenen Benutzernamen, ohne Groß/Kleinschreibung).
7. Löschknopf erst nach kurzer Wartezeit (z. B. 5 s) aktiv, rot, nur ein einziges Mal pro Fenster.
8. Server begrenzt Fehlversuche; alles in **einer Transaktion** (Alles oder nichts).

**Entscheidung (siehe 7):** Variante „sofort“ (Empfehlung, einfach, erfüllt „unverzüglich“) oder „7 Tage Schutzfrist“ (Konto wird gesperrt, Löschung per geplantem Job, in der Frist per Login abbrechbar; mehr Aufwand: Status, Job, Mails).

### 3.3 Serverseitiger Ablauf von `delete_account` (eine Transaktion)

1. `auth.uid()` vorhanden, sonst `PT401`.
2. Sitzung jung (s. 3.2/5), sonst Fehler `reauth_required`.
3. `p_confirm` = eigener Benutzername, sonst `confirm_mismatch`.
4. Konto sperren (Zeilensperre auf Profil), damit parallele Speichervorgänge scheitern.
5. `payment_events` vom Konto lösen (`account_id = null`, Payload von personenbezogenen Feldern bereinigen), **nicht** löschen (Aufbewahrung, rechtlich zu klären).
6. `audit_log` des Kontos und seiner Charaktere löschen (oder per FK-Kaskade, siehe 3.4).
7. `delete from auth.users where id = uid` → Kaskade über Profil, Charaktere, Backups, Berechtigungen, Sitzungen, Token. **Charaktere nicht einzeln per `delete_character` löschen** (würde „delete“-Backups erzeugen).
8. Rückgabe `true`. Keine personenbezogenen Daten im Rückgabewert.
9. Optional ein **nicht identifizierender** Zähler/Zeitstempel („Konto gelöscht“, ohne IDs) – nur wenn gewünscht.

### 3.4 Schema-Änderungen (nur nach Freigabe, zuerst lokal + SQL-Tests, dann live)

- `audit_log.account_id`: Fremdschlüssel auf `profiles(account_id)` **ON DELETE CASCADE** (macht jede künftige Kontolöschung, auch über das Dashboard, vollständig).
- `payment_events.account_id`: **ON DELETE SET NULL** (statt blockierend) + Payload ohne Personenbezug festlegen.
- Aufbewahrung gelöschter Charaktere (L5): Aufräumfunktion für „delete“-Backups älter als 30 Tage (läuft beim Speichern/Anlegen oder per `pg_cron`, falls aktiv).
- Neue Funktion `delete_account(text)`; Recht nur für `authenticated`; kein `anon`.
- `supabase/schema.sql`, SQL-Tests und Live-Test werden mitgezogen.

### 3.5 Client-Ablauf (nach Freigabe)

1. Konto → „Konto löschen …“ → Unterbildschirm (Ansicht `acV='delete'`).
2. Schritt 1: Info und Auswahl (lokal behalten / Export / nichts).
3. Schritt 2: Passwort eingeben → `token?grant_type=password` (neue Sitzung) → Benutzername eintippen → Wartezeit → Knopf.
4. Aufruf `rpc/delete_account`. Während des Laufs: Sync gestoppt, `noSave=true` für Cloud-Charaktere, Knopf gesperrt.
5. **Erfolg:** `authStore(null)`, Cloud-Zwischenspeicher dieses Geräts (`_cc_`, `_cm_`, `_tl_`, `_cloudmap`) entfernen, **aber nur nachdem** die gewählte lokale Kopie erfolgreich geschrieben ist; aktiver Charakter wechselt auf einen lokalen Platz; lokale Plätze und deren `_bak` bleiben unberührt; Bestätigungsmeldung.
6. **Fehler/Offline:** nichts wird gelöscht, klare Meldung, Wiederholung möglich. **Antwort verloren (Server hat gelöscht, Handy nicht informiert):** nächster Versuch liefert 401/„Anmeldung ungültig“ → Meldung „Konto existiert möglicherweise nicht mehr; melde dich an, um das zu prüfen“; kein falscher Konflikt.
7. **Andere Geräte:** sehen beim nächsten Speichern/Erneuern 401/`not_found` → Zustand „Anmeldung nötig“; lokaler Cloud-Cache bleibt erhalten; eine spätere Anmeldung mit anderem Konto wird durch die bestehende Kontoprüfung (`foreign`) abgelehnt.

### 3.6 Trennung Konto-löschen / Charakter-löschen

| | Charakter löschen | Konto löschen |
|---|---|---|
| Ort | Charakterliste / Konto-Plätze | Konto → Gefahrenbereich, eigener Unterbildschirm |
| Wirkt auf | genau ein Charakter | Konto, **alle** Cloud-Charaktere, Backups, E-Mail, Benutzername |
| Server | `delete_character` (Sicherung „delete“, 30 Tage vorgesehen) | `delete_account` (kein Backup, alles weg) |
| Bestätigung | zweimal tippen | Passwort + Benutzername + Wartezeit |
| Anmeldung danach | bleibt | beendet, Konto existiert nicht mehr |
| Texte/Farben | „Charakter löschen“ | „Konto endgültig löschen“, anderes Rot/Symbol |

---

## 4. Rechtstexte (nur Entwurf) und Verlinkung

### 4.1 Dateien

- `datenschutz.html` und `impressum.html` als statische Seiten im Repo, gleiches Design, **ohne Spiel-Skripte** und ohne externe Ressourcen. Sichtbarer Banner „ENTWURF – nicht rechtlich geprüft“.
- Inhalt Datenschutz (Gliederung): Verantwortlicher, Überblick, Hosting (GitHub Pages), Karte (OSM, Overpass), Standort/GPS, Konto und Cloud-Speicherung (Supabase), E-Mail-Versand, lokale Speicherung im Browser, Empfänger und Drittlandtransfer, Speicherdauer (inkl. Plattform-Backups/Logs, Backups gelöschter Charaktere 30 Tage), Rechte (Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit, Widerspruch, Beschwerde bei der Aufsichtsbehörde), Kinder/Altersgrenze, Änderungen. Die Tabelle aus Abschnitt 2 wird 1:1 in verständliche Sprache übertragen und mit dem Netzwerktest belegt.
- Impressum: Pflichtangaben nach § 5 DDG (Name, ladungsfähige Anschrift, E-Mail, ggf. weitere). **Platzhalter, bis du Betreiber und Anschrift festlegst.**

### 4.2 Verlinkung in der Oberfläche

- Startbildschirm (Fußzeile), Konto-Bildschirm (Anmelden, Registrieren, eingeloggt), Registrierung (Hinweis „Datenschutzerklärung gelesen“ mit Link; Hinweis, keine Einwilligung), Menü „Mehr“.
- Links öffnen im neuen Tab (`target=_blank rel=noopener`), ohne das Spiel zu verlassen oder zu unterbrechen (Spielstand unberührt).
- **Schalter:** Links sind per Konstante (`LEGAL_LIVE`) bis zur Freigabe ausblendbar. Entwurfsseiten dürfen erst veröffentlicht werden, wenn die rechtliche Prüfung erfolgt ist.

---

## 5. Reihenfolge, Tests, Änderungen

| Schritt | Inhalt | Änderung | Tests |
|---|---|---|---|
| **D0** | Entscheidungen aus Abschnitt 7 | keine | – |
| **D1** | Datenfluss belegen | nur Testcode | Netzwerk-Mitschnitt gegen Host-Whitelist; Spielstand/Anfragen ohne Koordinaten |
| **D2** | Schema und `delete_account` lokal | `supabase/schema.sql`, SQL-Tests | siehe 5.1 |
| **D3** | Live einspielen | Migration + Live-Test (mit Wegwerfkonto, nur auf Freigabe) | Live-Prüfung vollständige Restlosigkeit |
| **D4** | Client-Löschfluss | `index.html` | siehe 5.2 |
| **D5** | Leaflet lokal, unpkg entfernen | `index.html`, neue Dateien | Netzwerktest zeigt keinen unpkg-Host mehr; Karte lädt |
| **D6** | Rechtstexte-Entwurf + Links | neue HTML-Seiten, `index.html` | Links, Banner, keine externen Ressourcen, kein Konsolenfehler |
| **D7** | Abschlussbericht, Doku | `docs/` | Gesamtlauf aller Tests |

### 5.1 SQL-Tests (D2)

- Löscht Konto vollständig: `auth.users`, `profiles`, `characters`, `character_backups`, `account_entitlements`, `audit_log` (alles zur `account_id`/`character_id`) = 0 Zeilen.
- Andere Konten bleiben völlig unverändert.
- Ohne Anmeldung / `anon`: abgelehnt. Fremdes Konto nicht löschbar (Funktion kennt nur `auth.uid()`).
- Alte Sitzung → `reauth_required`; falscher/fehlender Benutzername → `confirm_mismatch`; Groß/Kleinschreibung egal.
- `payment_events` mit Zahlung: Löschung gelingt, Zeile bleibt ohne `account_id`, Payload bereinigt.
- Keine neuen „delete“-Backups durch die Kaskade.
- Charakterlöschung unverändert (Backup „delete“); Aufräumfunktion löscht „delete“-Backups > 30 Tage, jüngere bleiben.
- Gleicher Benutzername nach Löschung wieder frei.
- Wiederholung nach erfolgreichem Löschen → `not_authenticated`/`not_found`, kein Fehlzustand.
- Parallelität: Speichern nach Löschung scheitert sauber.
- Die vorhandenen 175 SQL-Tests bleiben grün (inkl. Live-RLS-Prüfung).

### 5.2 Client-Tests (D4)

- Löschen nur über mehrstufigen Ablauf erreichbar; ohne Passwort/Benutzername keine RPC-Anfrage.
- Falsches Passwort, falscher Name, Offline, Serverfehler → nichts gelöscht, lokale Daten unberührt.
- Erfolg: Sitzung weg, Cloud-Cache weg, lokale Plätze + `_bak` **byte-identisch**, aktiver Charakter lokal, kein Hochladen mehr, `noSave` verhindert Wiederauferstehung.
- „Lokal behalten“ kopiert Cloud-Charaktere vor der Löschung und bricht bei Fehler ab (keine Löschung ohne gesicherte Kopie).
- Verlorene Antwort / 401 nach Löschung → verständliche Meldung, kein Konflikt.
- Anderes Gerät mit offener Sitzung: nach Löschung „Anmeldung nötig“, lokaler Cache bleibt, anderes Konto wird abgelehnt.
- Charakterlöschung funktioniert unverändert und löscht nie das Konto.
- Texte: „Konto löschen“ und „Charakter löschen“ eindeutig unterscheidbar.
- Alle bisherigen 207 Tests bleiben grün; absichtlich eingebaute Fehler (z. B. Löschen ohne Passwortschritt, Cache vor Kopie entfernt, Sync läuft weiter) werden erkannt.

---

## 6. Risiken

1. **Direktes Löschen aus `auth.users` per SQL** ist funktional, aber nicht der Standardweg → vor Freigabe auf dem echten Projekt mit Wegwerfkonto beweisen; Fallback Edge Function.
2. **Platzhalter-Rechtstexte dürfen nicht live gehen** (Abmahnrisiko, gerade beim Impressum). Schalter und Banner vorgesehen.
3. **Plattform-Reste** (Projekt-Backups, Logs) sind nicht löschbar → ehrliche Frist im Text.
4. **Zahlungsdaten:** Aufbewahrungspflicht gegen Löschpflicht → rechtlich klären, bevor Zahlung gebaut wird.
5. **Unwiderruflichkeit:** Fehlbedienung schwer rückgängig → daher mehrere Hürden; Schutzfrist-Variante möglich.
6. **Verlorene Antwort** nach Löschung → Zustand im Client sauber behandeln (geplant).
7. **Anonymitätsirrtum:** Benutzername und Charaktername sind frei wählbar und können Personenbezug enthalten → Hinweis bei Registrierung/Erstellung.
8. **OSM-/Overpass-Last und Datenschutz** (Standortbezug an Dritte) → Hinweis im Text, mittelfristig eigener Anbieter.
9. **Minderjährige:** Altersgrenze und Einwilligung der Eltern rechtlich klären.

---

## 7. Entscheidungen, die ich von dir brauche

1. **Löschung sofort oder mit 7 Tagen Schutzfrist?** (Empfehlung: sofort, mit den mehrstufigen Hürden.)
2. **Technischer Weg:** A (SQL-Funktion, empfohlen) oder B (Edge Function)?
3. **Betreiber fürs Impressum:** Privatperson Pascal Ludwig oder anderer Betreiber (nicht den Hebebühnenverleih ohne Absprache)? Ladungsfähige Anschrift und Kontakt-E-Mail, die öffentlich stehen dürfen?
4. **Aufbewahrung der Sicherungen gelöschter Charaktere:** 30 Tage okay?
5. **Datenexport** (JSON-Download der eigenen Daten) mit einbauen? (Empfehlung: ja, einfach und hilft Auskunftsrecht.)
6. **Altersgrenze** des Spiels (z. B. ab 16)?
7. **Supabase-Tarif und E-Mail-Versand:** Welcher Tarif (Backups/Logs)? Eigener SMTP-Versender oder Standard?
8. **Leaflet lokal einbinden** (empfohlen, ersetzt unpkg) – gleich mit D5 durchführen?

Nach deiner Freigabe beginne ich mit D0/D1 und gehe der Reihenfolge nach; live ändere ich nichts ohne deine ausdrückliche Bestätigung je Schritt (Schema-Migration D3).

---

## 8. Stand D2 (15.11.2026, lokal, nicht live)

- `supabase/schema.sql`: `audit_log.account_id` → FK mit CASCADE; `payment_events.account_id` → FK mit SET NULL; neue Funktionen `delete_account(text)` (nur `authenticated`), `purge_account_backups(uuid)` (intern), `purge_expired_backups()` (nur `service_role`); `touch_login()` und `delete_character()` räumen Sicherungen gelöschter Charaktere nach 30 Tagen auf.
- `supabase/migration_d3_konto_loeschen.sql`: dieselben Änderungen als Migration für das Live-Projekt (**nicht angewendet**), getestet als Upgrade-Pfad (altes Schema + Migration).
- Tests: 240 SQL-Tests (neue Modi, ältere Projekte, SQL-Editor-Varianten, Upgrade-Pfad).
- Ungeprüft bis D3 (nur im echten Projekt prüfbar): (1) JWT enthält `session_id`; (2) `auth.sessions` ist für die Funktion lesbar; (3) Löschen aus `auth.users` per Funktion funktioniert; (4) `auth.audit_log_entries` (IP/E-Mail) bleibt bestehen oder nicht.
