# Dev-Installationsfreigabe: letzte Vorbereitung (nur lesend)

Stand: 18.11.2026, 16:30. Basis-Commit **`4370b84`** (CI-Lauf `44282298325`, grün, akzeptiert) plus die Sicherheitskorrekturen der Abschnitte „11:21“, „12:00“ und „16:30“ (Commit-ID und CI-Ergebnis stehen im Abschlussbericht, nicht in dieser Datei). Es wurde nichts installiert oder deployt. Lokal nur PG16 getestet; PG17 prüft die CI.
**Maßgeblicher Hash: `8a8c3d74bf9858c986c149a355922019952b6da3731e51b8167c6530a53946fb` (Stand 16:30). Frühere Hashes (`447b53c0…`, `33c2d0e9…`) sind überholt.**

## Hash

`supabase/dev/install_dev.sql` (neu erzeugt): **SHA-256 `8a8c3d74bf9858c986c149a355922019952b6da3731e51b8167c6530a53946fb`** (2096 Zeilen).
Vorher (nur Stand `4370b84`): `447b53c071e5161aea55389ad2353725c33147fcc0b652f3ab55f4ed1bf149cd`. Der Unterschied zu `4370b84` ist die neue Zielprüfung (`00_preflight.sql`) und die eigene Transaktion (`begin;` vor allem anderen, `commit;` am Ende); `schema.sql` und `rwi 01–05` sind unverändert.

## Finale Prüfliste

| # | Prüfung | Ergebnis | Beleg |
|---|---|---|---|
| 1 | `install_dev.sql` stammt aus Stand `4370b84` | **ja** | Arbeitsbaum = HEAD (`git status`: nur `results/` und `install_dev.sql` untracked). Neu erzeugt mit `build.sh`, `cmp` byteidentisch |
| 2 | SHA-256 stimmt mit neu erzeugter Datei überein | **ja** | beide `8a8c3d74…946fb` (neu erzeugt, `cmp` identisch) |
| 3 | Eingebundene SQL-Dateien = Branch | **ja** | 7 Teile (`00_preflight`, `schema.sql`, `01`–`05`) sind je als vollständiger HEAD-Blob in der Datei enthalten; Arbeitsbaum = HEAD. Seit `15f5d2e` keine SQL-Änderung. `schema.sql` seit `afc5dfb` unverändert |
| 4 | Preflight prüft Eignung/Leere und jetzt das Zielprojekt | **ja, mit Grenzen** (siehe unten) | `installation.mjs`: die bisherigen 29 Prüfungen bestehen weiter, insgesamt 79/79 lokal PG16; PG17 steht aus |
| 5 | Rollback entfernt nur Installationsobjekte | **ja, im Test** | Katalog-Fingerabdruck nach Rollback = Ausgangszustand (Relationen, Funktionen, ACLs, Trigger, Policies, Default-ACLs, Schemas) |
| 6 | Rollback löscht nichts außerhalb des Umfangs | **ja** (seit 16:30 ohne `CASCADE`, siehe Abschnitt 16:30) | Manifest + Abhängigkeitsprüfung + einzelne Löschungen ohne CASCADE, `DROP SCHEMA rwi` ohne CASCADE |
| 7 | Keine unbeabsichtigten Änderungen an public, Auth, Extensions, Grants, Default-ACLs | **ja** | siehe unten |
| 8 | Reihenfolge | **korrekt** | preflight, schema.sql, 01, 02, 03, 04, 05 (Test prüft Positionen; `build.sh`-Liste gelesen); keine eigenen BEGIN/COMMIT |
| 9 | Voraussetzungen PG17/Supabase Dev dokumentiert | **teilweise** | jetzt hier gesammelt; vorher verstreut (siehe Offen) |

### Zu 4: Preflight im Detail
Prüft: PG ≥ 15; Rollen `anon`, `authenticated`, `service_role`; nicht als API-Rolle; `auth.users`, `auth.sessions`, `auth.mfa_amr_claims`, `auth.uid()`, `auth.jwt()`; Rechte TRIGGER/REFERENCES/DELETE auf `auth.users`; `rwi` und Trigger `on_auth_user_created` fehlen; `public` ohne eigene Relationen und Funktionen. Schreibt nichts, Fehler vor jeder Änderung.
(Frühere Grenze „erkennt das Zielprojekt nicht“: behoben durch die Zielprüfung, siehe nächster Abschnitt.) Er prüft keine Typen/Enums in `public` und keine Extension-Funktionen in `public`.

### Zu 7: Was die Installation außerhalb `rwi` ändert
- `public`: 6 Tabellen, 38 Funktionen, RLS, Policies, Grants (Entzug für `public/anon/authenticated`, Vergabe an `service_role`/`authenticated` für benannte Funktionen).
- `auth`: genau ein Trigger `on_auth_user_created` auf `auth.users`.
- Keine `CREATE EXTENSION`, keine Rollenänderung, keine `ALTER DEFAULT PRIVILEGES` in `public` (Test: 3 Default-ACL-Einträge in `public` unverändert). `ALTER DEFAULT PRIVILEGES` nur in `rwi`.
- Das `revoke all on all functions in schema public` würde auch Extension-Funktionen in `public` treffen. **Auf Dev gibt es keine** (siehe Zielzustand).

## Stand 16:30: Rollback ohne CASCADE, transaktionssichere Installation

### Rollback: explizite Löschstrategie ohne CASCADE
Reihenfolge (alles in der einen Transaktion von `rollback_dev.sql`, nach Zielprüfung, Bestätigung, Sperren, Manifest- und Abhängigkeitsprüfung, die unverändert bestehen bleiben):
1. `drop trigger on_auth_user_created on auth.users` (nur dieser benannte Trigger).
2. `drop table` der 18 `rwi`-Tabellen in **einer** Anweisung (nur Tabellen mit Name **und** Spaltenfingerabdruck aus dem Manifest; gegenseitige Fremdschlüssel gehören dazu; ihre Trigger, Indizes, Sequenzen fallen mit).
3. `drop table` der 6 `public`-Tabellen in einer Anweisung (ebenso nach Manifest); damit entfallen die Trigger auf `public.characters`/`profiles`, die an `rwi`-Funktionen hängen.
4. `drop function` der Funktionen mit Signatur **und** Fingerabdruck aus dem Manifest (38 in `public`, 67 in `rwi`), in einer Anweisung.
5. `drop schema rwi` **ohne** CASCADE. Scheitert, sobald irgendetwas übrig ist, auch ein Objekt, das erst nach den Prüfungen entstand. Eigene Default-ACL-Einträge in `rwi` fallen automatisch mit (getestet).
Das Manifest liegt in einer Zwischentabelle der Transaktion (`rw_manifest`, `on commit drop`); Prüfungen und Löschungen lesen dieselben Einträge. Neu im Manifest: Struktur- und Funktionsfingerabdrücke auch für die 6 `public`-Tabellen und 38 `public`-Funktionen; ein gleichnamiges, aber abweichendes Objekt in `public` bricht ab (wird nicht gelöscht). Der Katalogabfrage-Umfang der Abhängigkeitsprüfung leitet sich jetzt ebenfalls aus dem Manifest ab (keine zweite Namensliste).
**Technische Grenzen:** (a) von Hand ergänzte Constraints/Kommentare/ACLs/Standardwerte stehen nicht im Manifest und fallen mit ihren Tabellen/Funktionen; (b) in `public` werden zusätzliche Trigger/Indizes/Richtlinien auf unseren Tabellen nicht einzeln geprüft (sie fallen mit der Tabelle); (c) Abhängige unbekannter Katalogart (z. B. Mitgliedschaft in einer Publikation wie `supabase_realtime`) zählen als fremd und lassen den Rollback abbrechen (sicher, aber ein Realtime-aktivierter Dev-Stand müsste vorher bereinigt werden); (d) Event-Trigger von Supabase (PostgREST/GraphQL) feuern bei den Löschungen; ihr Verhalten ist nur gegen die Attrappe nicht belegt; (e) nur auf der lokalen Attrappe getestet.

### Installation: eigene Transaktion
`build.sh` erzeugt `install_dev.sql` mit genau einem `begin;` (vor der Zielprüfung) und genau einem `commit;` (nach `05_produktion.sql`). Die eingebundenen Dateien enthalten keinerlei Transaktionssteuerung (per Test belegt; das PL/pgSQL-Blockende `end;` ist keine). Ein Fehler irgendwo (Zielprüfung, Preflight, jede Installationsanweisung) macht alles rückgängig, auch bei `psql` ohne `-1` und ohne `ON_ERROR_STOP` (getestet). Der Wrapper ruft `psql -v ON_ERROR_STOP=1 -f -` **ohne** `-1` auf, meldet bei Fehler-Exit „FEHLGESCHLAGEN“ mit Exit 2 und die Erfolgsmeldung erst nach fehlerfreiem `psql`. Wird die Datei über einen Weg ausgeführt, der selbst eine Transaktion um den Text legt (Migrations-Connector), ist `begin` darin nur eine Warnung und `commit` beendet die äußere Transaktion; funktional unschädlich, aber nicht empfohlen.
**Geänderte alte Prüfung:** Die Prüfung „Installationsskript enthält kein eigenes BEGIN/COMMIT (Transaktion gehört dem Aufrufer)“ wurde **nicht gelöscht, sondern ersetzt** durch drei strengere: eingebundene Teile ohne Transaktionssteuerung; genau ein `begin;` am Anfang und genau ein `commit;` am Ende; Reihenfolge relativ zur Zielprüfung. Ebenso angepasst: die Wrapper-Prüfung erwartet nun `-v ON_ERROR_STOP=1 -f -` ohne `-1` statt `-1 -v ON_ERROR_STOP=1 -f -`. Alle übrigen früheren Prüfungen unverändert.

### Tests (PostgreSQL 16.15, lokal)
- `installation.mjs`: **133 bestanden, 0 fehlgeschlagen** (vorher 111; die 111 bleiben bis auf die zwei oben genannten Anpassungen unverändert).
- Neu: vollständiger Rollback ohne CASCADE mit Default-ACL; Abbruch bei unerwarteten Objekten und externen Abhängigkeiten (bestehende Fälle laufen weiter, jetzt gegen die neue Sequenz); **Fehler in der Löschsequenz** an vier Stufen (rwi-Tabellen, public-Tabellen, Funktionen, Schema) per Ereignis-Trigger: alles zurückgenommen, Tabellen/Funktionen/Trigger unverändert; **Nachzügler** (Objekt entsteht während der Löschung in `rwi`): `DROP SCHEMA` scheitert, alles zurückgenommen; **Installationsfehler** in der Mitte, im letzten Statement, ohne Referenz, mit Produktionsreferenz, falsche Datenbank, nicht leeres `public` (jeweils ohne `-1`/`ON_ERROR_STOP`): nichts installiert; **Wrapper** mit echtem `psql` bei Installationsfehler (Exit ≠ 0, FEHLGESCHLAGEN, nichts installiert), Erfolgsfall, `psql`-Attrappe mit Exit 7.
- Mutationsproben, alle erkannt: `drop schema … cascade`; Installation ohne `begin/commit`; Wrapper ignoriert `psql`-Fehler; Wrapper mit `-1`; Löschung ohne Fingerabdruckfilter.
- `run-all-db.sh`: siehe Abschlussbericht.

## Sicherheitskorrekturen vom 18.11., 11:21 (lokal, nicht eingecheckt)

### 1. Zielprojektprüfung (zwingend, ohne Ersatzwert)
- **Wo:** Wortgleicher Block `-- ZIELPRÜFUNG` am Anfang von `00_preflight.sql` (damit ganz vorn in `install_dev.sql`), `rollback_dev.sql` und `cleanup_test_accounts.sql`. Ein Test vergleicht die drei Texte.
- **Was:** Die Sitzung muss ausdrücklich `set rw.project_ref = 'jlkqktmvqxibqdcobbhf';` gesetzt haben. Fehlt/leer: Abbruch. Produktionsreferenz `malbiahllucctiafzydv`: Abbruch mit eigener Meldung. Jede andere Referenz (auch abweichende Großschreibung): Abbruch. Zusätzlich muss `pg_control_system().system_identifier` die Kennung von ruinwalk-dev sein (`7707768362984748398`, am 18.11. lesend von Dev abgefragt, Rolle `postgres` darf die Funktion ausführen). Kein Ersatzwert, kein Übergehen, kein Blick auf `public`.
- **Warum zusätzlich die Kennung:** Die Projektreferenz steht nirgends in der Datenbank; die Einstellung allein wäre eine bloße Selbstauskunft. Die Datenbankkennung ist die einzige gefundene, wirklich an das Projekt gebundene Größe. Das Zusammenspiel: Referenz muss stimmen **und** die Datenbank muss die von Dev sein.
- **Wrapper `supabase/dev/install_dev.sh`** (neu, nicht ausgeführt): verlangt `RW_PROJECT_REF` (= Dev), `RW_DB_URL` (muss die Dev-Referenz nennen, darf die Produktionsreferenz nicht nennen) und den erwarteten SHA-256 als Argument; prüft den Hash; ruft erst danach `psql -v ON_ERROR_STOP=1 -f -` auf (seit 16:30 **ohne** `-1`, die Datei besitzt ihre Transaktion) und setzt die Referenz vor der Datei. Die Verbindungszeichenfolge wird nie ausgegeben.
- **Test:** Im Test ersetzt nur eine Zeile die Dev-Kennung durch die der lokalen Datenbank (je Datei genau ein Vorkommen, per Test belegt). Die unveränderte Datei lehnt die lokale Datenbank ab („falsche Datenbank“).

### 2. Rollback gegen externe Abhängigkeiten
- **Katalogprüfung (`pg_depend`):** Vor jedem Löschen wird geprüft, ob Objekte **außerhalb** des Umfangs von zu löschenden Objekten abhängen. Umfang = Schema `rwi`, die 6 `public`-Tabellen samt Spalten/Indizes/Triggern/Richtlinien/Fremdschlüsseln/Sequenzen/TOAST/Zeilentypen, dazu die 38 benannten `public`-Funktionen und die internen RI-Trigger auf der Gegenseite (z. B. auf `auth.users`). Abhängige unbekannter Objektart zählen als fremd (Abbruch statt Raten). Meldung nennt jedes Objekt mit `pg_describe_object`.
- **Manifest:** `rwi` darf nur die 18 vorgesehenen Tabellen, 67 benannte Funktionen und keine eigenen Typen enthalten; jedes weitere Objekt (von Hand angelegt) bricht ab, weil `DROP SCHEMA rwi CASCADE` es sonst mitlöschen würde. Ein Test hält das Manifest gleich dem installierten Stand: ändert jemand die `rwi`-SQL-Dateien, wird dieser Test rot, bis das Manifest nachgezogen ist.
- Die alten Schutzprüfungen (Sichten, Fremdschlüssel anderer Schemas) bleiben unverändert bestehen.
- Rollback und cleanup verlangen jetzt ebenfalls die Zielprüfung.

### Testergebnisse (lokal, PostgreSQL 16.15)
| Test | Ergebnis |
|---|---|
| `installation.mjs` gesamt | **79 bestanden, 0 fehlgeschlagen** (bisherige 29 Prüfungen unverändert bestanden + 50 neue) |
| davon neu Zielprüfung | fehlende/leere/Produktions-/abweichende/falsch geschriebene Referenz, richtige Referenz aber falsche Datenbank (je für Preflight und `install_dev.sql`), Unabhängigkeit von `public`, Textgleichheit der drei Dateien, Position vor `schema.sql`, Wrapper-Skript (8 Abbruchfälle + 1 Erfolgsfall mit Attrappe-psql) |
| davon neu Rollback | Fall **ohne** externe Abhängigkeit (läuft durch); **6 künstliche externe Abhängigkeiten** (Sicht, Fremdschlüssel, SQL-Funktion mit BEGIN ATOMIC, Trigger, Richtlinie, Fremdschlüssel aus `public`, der vom alten Schutz nicht erfasst wurde); **4 Manifest-Fälle** (Tabelle, Funktion, Typ, Sicht in `rwi`); jeweils Abbruch ohne Änderung; fremdes Schema bleibt unberührt; Ausgangszustand wieder hergestellt |
| Mutationsproben | Zielprüfung ohne „nicht gesetzt“-Zweig: 5 Prüfungen rot; ohne Kennungsvergleich: 7 rot; Katalogprüfung auf Hinweis abgeschwächt: 3 rot; Manifest-Funktionsprüfung entfernt: 2 rot; Wrapper ohne Produktionsprüfung: 1 rot. Alles wieder zurückgesetzt, danach 79/79 |
| `run-all-db.sh` gesamt | **Gesamtergebnis: ALLES BESTANDEN**, 33 Läufe `exit=0` (u. a. installation 79, dev-korrekturen 48, operatoren-parallel 30, operatoren-limit 13, k2-compare 0 Deadlocks) |
| **PostgreSQL 17** | **nicht ausgeführt**: lokal nicht installiert (nur 16), kein Netz zum Nachinstallieren. Läuft nur in der CI, dafür bräuchte es einen Push (nicht erlaubt) |

### Verbleibende Risiken dieser Korrekturen
- **PG17 und CI ungeprüft** für die neuen Prüfungen (Katalogabfrage nutzt nur stabile Kataloge, trotzdem nicht belegt).
- Die **Referenz bleibt eine Angabe des Bedieners**; wirklich gebunden ist nur die Datenbankkennung. Ändert sich die Kennung von Dev (Wiederherstellung, Hauptversions-Upgrade), bricht die Installation ab (sicherer Fehlschlag) und der Wert muss bewusst neu erhoben werden. Ein physischer Klon von Dev hätte dieselbe Kennung. Eine Produktionskennung wurde nicht erhoben und nicht benötigt (Positivprüfung auf Dev).
- Wird die Installation **ohne** `install_dev.sh` (z. B. über den Migrations-Connector) ausgeführt, muss `set rw.project_ref …` von außen vor die Datei gesetzt werden; steht es in der gehashten Datei selbst, ist es nur Selbstauskunft. Die Kennungsprüfung wirkt in beiden Fällen.
- `pg_depend` kennt keine Abhängigkeiten über PL/pgSQL-Funktionskörper oder dynamisches SQL: eine fremde Funktion, die `rwi.x` aufruft, wird nicht erkannt (sie bricht danach beim Aufruf, löscht aber nichts). Abhängige Objektarten, die nicht abgebildet sind (z. B. erweiterte Statistiken, Publikationen), würden als fremd gewertet; **zu löschende Objekte** dieser Arten kennt die Prüfung nicht (die Installation legt keine an).
- Zwischen Prüfung und Löschung (eine Transaktion) könnten parallel Objekte entstehen; empfohlen: ruhiges Fenster.
- Alles gegen die Attrappe getestet, nicht gegen echtes Supabase (unverändert offen, siehe oben).

## Letzte Prüfung vor Commit/Push (18.11., 12:00) - Befunde und Korrekturen

Ergebnis: Drei Lücken gefunden und lokal behoben, vier Grenzen bleiben ausdrücklich bestehen. Alles weiter **nicht eingecheckt**, `install_dev.sql` unverändert (Hash `8a8c3d74…946fb`), `install_dev.sh`, `rollback_dev.sql`, `cleanup_test_accounts.sql`, `installation.mjs` und das neue `server/instance/tests/rollback-manifest.mjs` sind geändert.

### 1. Zielprojektidentität (`rw.project_ref` + `system_identifier`)
- **Nicht unabhängig:** `rw.project_ref` ist eine Angabe des Bedieners, die das SQL nur mit einer Konstante vergleicht; sie kann nichts über die Datenbank aussagen. Wirklich gebunden ist **allein die Datenbankkennung**. Die Referenz erzwingt eine bewusste Handlung und verhindert Versehen mit Standardwerten, sie ist **kein zweiter Beweis**.
- **Schutz gegen versehentlichen Produktionszugriff:** Gilt, wenn die Kennung von Produktion von der von Dev abweicht. Zwei unabhängig angelegte Cluster erhalten unterschiedliche Kennungen (Zeit und Prozessnummer beim Anlegen); die Produktionskennung wurde **nicht erhoben** (kein Produktionszugriff), die Abweichung ist deshalb erwartet, nicht belegt.
- **Grenzen bei Klonen und Wiederherstellungen (ausdrücklich):**
  - Ein **physischer Klon** von Dev (Branch, Point-in-Time-Wiederherstellung in ein neues Projekt, Fork) trägt **dieselbe Kennung** und würde als „Dev“ akzeptiert.
  - Ein physischer Klon oder eine Wiederherstellung von **Produktion** trägt die Produktionskennung und wird abgelehnt (sicherer Fehlschlag).
  - Eine **logische** Wiederherstellung (Dump/Restore) von Produktionsdaten **in das Dev-Projekt** behält die Dev-Kennung und besteht die Zielprüfung. Dann schützt nur noch der Zustand (Preflight lehnt ein nicht leeres `public` ab); der **Rollback** hätte keinen Schutz außer der Bestätigung und der Zählung.
  - Ein Hauptversions-Upgrade (`pg_upgrade`) oder eine Neuanlage ändert die Kennung: die Zielprüfung bricht ab (sicher), der Wert muss bewusst neu erhoben, in den drei Dateien identisch ersetzt (Test erzwingt Gleichheit) und der Hash neu gebildet werden.
- Fazit: schützt zuverlässig gegen **Versehen mit einem anderen Projekt**, nicht gegen ein Dev-Projekt mit fremdem Inhalt oder einen Klon von Dev.

### 2. Rollback-Manifest
- **Vorher** (erste Fassung): nur Namen von Tabellen/Funktionen. Eine **ersetzte Funktion** (`create or replace` gleichen Namens), eine **Überladung**, eine zusätzliche Spalte, ein zusätzlicher Index, Trigger oder eine Richtlinie wären **nicht** erkannt worden.
- **Jetzt:** Tabellen mit Fingerabdruck der Spalten (Name, Typ, NOT NULL); Funktionen mit Signatur und Fingerabdruck (Sprache, Rückgabetyp, SECURITY, Volatilität, `search_path`/Konfiguration, Quelltext); Trigger, Indizes, Richtlinien, Typen, weitere Relationenarten. Jede Abweichung (zusätzlich **oder** verändert) bricht ab. Das Schema ist durch die Abfrage fest (`rwi`).
- Getestet (alle bestehen, jeweils nichts gelöscht): ersetzte Funktion, geänderter `search_path`, geänderte Sicherheitsart, zusätzliche Überladung, zusätzliche Spalte, geänderter Spaltentyp, zusätzlicher Index, Trigger, Richtlinie, Sequenz, fremde Tabelle/Funktion/Typ/Sicht; danach läuft der unveränderte Stand sauber durch.
- **Nicht abgedeckt:** von Hand ergänzte Constraints, Kommentare, Spaltenstandardwerte, ACLs/Eigentümer, RLS-Schalter (alles gehört zu unseren Tabellen/Funktionen und fällt mit ihnen). Die Fingerabdrücke wurden nur auf PG16 erzeugt; Stabilität auf PG17 ist **nicht belegt** (CI muss es zeigen). Ändert jemand die `rwi`-SQL-Dateien, schlägt der Test fehl, bis `node server/instance/tests/rollback-manifest.mjs` neu eingesetzt wurde.

### 3. Transaktionssicherheit
- **Lücke gefunden und behoben:** Die Prüfungen standen in getrennten Blöcken, die Transaktion gehörte dem Aufrufer. Eine Mutationsprobe (ohne `begin`) zeigte: ohne `psql -1` und ohne `ON_ERROR_STOP` läuft das Skript nach einem fehlgeschlagenen Check **weiter und löscht** (der Test sah danach „schema rwi existiert nicht“). Jetzt beginnen `rollback_dev.sql` und `cleanup_test_accounts.sql` selbst mit `begin;` (vor der Zielprüfung) und enden mit `commit;`: Zielprüfung, Bestätigung, Sperren, Manifest, Abhängigkeitsprüfung und Löschungen liegen in **einer** Transaktion; ein Fehlschlag nimmt alles zurück. Getestet ohne `-1` und ohne `ON_ERROR_STOP` (Rollback mit externer Abhängigkeit, ohne Referenz; cleanup ohne Referenz).
- **Parallele Änderungen:** Vor den Prüfungen werden alle 18 `rwi`- und 6 `public`-Tabellen mit `ACCESS EXCLUSIVE` gesperrt (`lock_timeout` 15 s: lieber Abbruch als Hängen). Getestet: gleichzeitiges Anlegen einer Sicht auf `rwi.cfg` und gleichzeitige Schreibzugriffe werden blockiert. Das verhindert nachträgliche Sichten, Fremdschlüssel, Trigger, Richtlinien auf diesen Tabellen.
- **Nicht beherrschbar (Grenze):** Das gleichzeitige Anlegen einer **neuen Funktion oder eines Typs im Schema `rwi`** (oder von Objekten, die nur über Funktionskörper abhängen) zwischen Prüfung und `DROP SCHEMA rwi CASCADE` wird durch Tabellensperren nicht verhindert und würde mitgelöscht. Empfehlung: ruhiges Fenster (keine Worker/Edge Function, keine Sitzungen). Die vollständige Lösung (explizite Löschliste ohne `CASCADE`, die bei jedem Fremdobjekt scheitert) wurde **nicht** gebaut, weil sie den Rollback grundlegend umbaut; Entscheidung bei dir.

### 4. Installationswrapper `install_dev.sh`
- **Lücke 1 behoben:** Hash und Ausführung lasen die Datei getrennt (Lücke dazwischen). Jetzt: **eine private Kopie**, deren Hash geprüft und die danach ausgeführt wird (Test prüft die Quelle und ein Mutationstest die Abweichung).
- **Lücke 2 behoben:** Die Verbindungsprüfung suchte die Referenz nur als Textteil irgendwo. Jetzt: die Verbindung muss eine URL sein, Host `db.<ref>.supabase.co` **oder** Benutzer `postgres.<ref>` an einem `*.pooler.supabase.com`-Host; `host=`, `hostaddr=`, `user=`, `service=`, `dbname=` in der Abfrage sind verboten; Referenz nur im Passwort/Datenbanknamen, Schlüssel-Wert-Form und Pooler ohne Referenz werden abgelehnt (je getestet).
- Abbruch, bevor `psql` startet: fehlende/abweichende/Produktions-Referenz, fehlende/falsche Verbindung, fehlender/falscher Hash, fehlende Datei (getestet, 8 Fälle + 5 Verbindungsfälle). Mit **echtem `psql`** (nur die Verbindung auf die lokale Testdatenbank umgeleitet) getestet: richtige Kennung installiert in einer Transaktion; falsche Datenbank bricht durch die Zielprüfung ab und ändert nichts; zweiter Lauf bricht ab.
- Restpunkte: `RW_INSTALL_FILE` (Testhaken) kann eine andere Datei benennen, der erwartete Hash bleibt Pflicht; die Verbindungszeichenfolge steht in der Prozessliste der ausführenden Maschine (Argument von `psql`).
- **Ausführungswege:** (a) `install_dev.sh` ist der **einzig vollständig geschützte** Weg (Hash, Referenz, Verbindung, eine Transaktion, Abbruch beim ersten Fehler). (b) Migrations-/Connector-Weg (z. B. `apply_migration`): läuft als eine Transaktion, aber **ohne** Hash-Prüfung durch ein Werkzeug (Hash der Datei selbst vergleichen) und **mit** vorangestelltem `set rw.project_ref = '…';`; die Kennungsprüfung wirkt. (c) SQL-Editor des Dashboards: Transaktionsverhalten **nicht geprüft**, nicht empfohlen. (d) Rohes `psql -f install_dev.sql` **ohne** `-1 -v ON_ERROR_STOP=1`: **unsicher**; ein Fehlschlag der Zielprüfung stoppt dort die Installation **nicht**. **Seit 16:30 überholt:** `install_dev.sql` besitzt ihre Transaktion selbst; auch (d) hinterlässt bei einem Fehler keine halbe Installation (aber ohne `ON_ERROR_STOP` laufen die Folgeanweisungen weiter und melden Fehler; das Ergebnis ist trotzdem nichts installiert).

### Testergebnisse dieser Runde (PostgreSQL 16.15, lokal)
- `installation.mjs`: **111 bestanden, 0 fehlgeschlagen** (79 der letzten Runde + 32 neue; die ursprünglichen 29 unverändert enthalten).
- Mutationsproben, alle erkannt: Funktions-Fingerabdruck entfernt, Tabellenstruktur entfernt, `begin` entfernt (Rollback und cleanup), Sperren entfernt, Wrapper hasht Original statt Kopie; zuvor: Zielprüfung, Kennungsvergleich, Katalogprüfung, Manifest, Produktionsprüfung im Wrapper.
- `run-all-db.sh`: **Gesamtergebnis ALLES BESTANDEN**, 33 Läufe `exit=0`, `installation` 111.
- **PostgreSQL 17: nicht ausgeführt** (lokal nicht vorhanden; CI braucht Push).

## Zielzustand Dev (nur lesend geprüft, 18.11.2026)

Projekt `ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`), Status ACTIVE_HEALTHY, PostgreSQL **17.12**, eu-central-1. Abfrage mit `get_project` und einer reinen `SELECT`-Abfrage über den Supabase-Connector; keine Secrets, nichts geändert.

- Verbindungsrolle `postgres`; Rechte TRIGGER/REFERENCES/DELETE auf `auth.users`: ja.
- `public`: 0 Relationen, 0 Funktionen (auch keine Extension-Funktionen), 0 Enums/Domains. `rwi`: existiert nicht. Trigger `on_auth_user_created`: nicht vorhanden. `auth.users`: 0 Zeilen.
- Rollen `anon`, `authenticated`, `service_role` vorhanden; `auth.sessions`, `auth.mfa_amr_claims` vorhanden.
- Extensions: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto (Schema `extensions`), supabase_vault, pg_cron, pg_net. Keine in `public`.
- Der Preflight wäre damit nach heutigem Stand bestanden. **Der echte Preflight wurde nicht auf Dev ausgeführt**, nur seine Bedingungen einzeln nachgeprüft.

## Installationsvoraussetzungen

1. Ziel ausschließlich `jlkqktmvqxibqdcobbhf` (Dev). Produktion `malbiahllucctiafzydv` nie.
2. PostgreSQL ≥ 15; Dev ist 17.12 (CI hat PG17 mit Supabase-Attrappe, nicht mit echtem Supabase-Image getestet).
3. Transaktion: `install_dev.sql` enthält `begin;` ... `commit;` selbst, **kein** `psql -1` verwenden (wäre verschachtelt). Ausführung über `install_dev.sh` (`psql -v ON_ERROR_STOP=1 -f -`).
4. Installationsrolle `postgres` (nicht `anon`/`authenticated`/`service_role`).
5. Vorher Hash der auszuführenden Datei gegen `8a8c3d74…946fb` prüfen (macht `install_dev.sh` selbst) und `RW_PROJECT_REF` setzen.
6. Rollback bereithalten: `rollback_dev.sql` mit `set rw.rollback_confirm = 'ja-loeschen';` in derselben Sitzung.
7. Erst danach: Edge-Function-Deployment, Secrets, Dev-Workflow sind **getrennte Schritte** und nicht Teil dieser Freigabe.

## Rollback-Risiken

- `rollback_dev.sql` entfernt: Trigger auf `auth.users`, Schema `rwi` (ohne CASCADE, nach Einzellöschung seiner Objekte), die 6 `public`-Tabellen, 38 `public`-Funktionen (alle nur, wenn sie dem Manifest-Fingerabdruck entsprechen). Nicht entfernt: `auth.users`-Zeilen (Testkonten, separat `cleanup_test_accounts.sql`), Extensions, Rollen, bestehende Default-ACLs, Vault-Secrets, Edge Functions, Cron-Jobs, Migrationshistorie.
- **CASCADE-Restrisiko (überholt, 16:30):** Der Rollback verwendet kein CASCADE mehr; fremde Abhängigkeiten und Nachzügler lassen ihn scheitern statt mitzulöschen.
- `drop trigger if exists on_auth_user_created` löscht einen gleichnamigen Trigger auch dann, wenn er nicht von uns stammt (bei Installation war er garantiert nicht vorhanden).
- Rollback löscht alle Daten in `rwi` und den `public`-Tabellen (Profile, Charaktere, Instanzen). Auf Dev nach Tests akzeptabel; das Skript meldet vorher die Zählung.
- Das Rollback ist gegen die Attrappe getestet, nicht gegen echtes Supabase. Ein Rollback-Teilfehler ist durch die einzelne Transaktion ausgeschlossen (getestet mit absichtlichen Fehlern in jeder Löschstufe).

## Ausdrücklich offene Punkte

1. **Nie auf echtem Supabase gelaufen:** Installation, Preflight, Rollback, Rechte (Supabase-eigene Default-ACLs, `supabase_admin`-Besitz) sind nur gegen die lokale Attrappe (`supabase/tests/00_stub.sql`) getestet, auf PG16 lokal und PG16/17 in CI.
2. **Nicht getestet:** echtes GoTrue, JWT/MFA (`aal2`), PostgREST, echter Deno-Lauf der Edge Function (nur `deno check` und Bun-Smoke mit Attrappe), Edge-Function-Bereitstellung, `verify_jwt`, API-Key-Formate (`sb_…`). Das gehört in den späteren Dev-Test, nicht in die Datenbankinstallation.
3. **k2-Deadlock (PG16, Lauf 44279099804) ungeklärt.** Bleibt in `docs/K2_DEADLOCK_UNTERSUCHUNG.md` korrekt als ungeklärt dokumentiert: kein Volltext (Artefakt-Download 403), lokal in 180 Läufen (`skip`) und 30 (`eigene`) nicht reproduzierbar, im Lauf `44282298325` auf PG16 und PG17 je 0 Deadlocks, `01_proto.sql`/`k2-compare.mjs`/`pg.mjs` seit `afc5dfb` unverändert, Ursachenvermutung ausdrücklich als Vermutung. Der Der Bericht nennt jetzt zusätzlich den grünen Lauf `44282298325` (ausdrücklich nicht als Behebung). Er ist eine Testkonkurrenz-Frage (Sweep/Commit-Runde auf `rwi.instances`), kein Hinweis auf die Installation; **ein Zufallsfehler unter Last ist nicht ausgeschlossen**.
4. (erledigt) Zielprojektprüfung im SQL; Restrisiken siehe oben.
5. (erledigt, lokal PG16) Rollback-Katalogprüfung; PG17/CI ausstehend, Restrisiken siehe oben.
6. Die Dev-Installation ist nicht idempotent (zweiter Lauf bricht per Preflight ab, ändert nichts).
7. E-Mail-Bestätigung/Mailversand auf Dev (für Testkonten) bleibt Voraussetzung des späteren Dev-Tests.
8. `install_dev.sql` ist untracked/erzeugt; Hash ist der einzige Bezug zum Stand, nicht im Repo hinterlegt.

## Empfehlung

**Freigabe der Datenbankinstallation auf Dev (`ruinwalk-dev` allein), bedingt:**
Installation mit genau der Datei `install_dev.sql` (SHA-256 `8a8c3d74…946fb`, Stand 16:30) in einer Transaktion, danach nur lesende Kontrolle (Objektzahlen: 6 Tabellen und 38 Funktionen in `public`, 18 Tabellen in `rwi`, ein Trigger auf `auth.users`, Rechte) und ein Stopp. Kein Deployment der Edge Function, keine Secrets, kein Dev-Workflow in diesem Schritt.

Begründung: Dev ist leer und besteht die Preflight-Bedingungen, der Stand ist reproduzierbar erzeugt, Installation und Rollback sind auf PG16 und PG17 (Attrappe) vollständig getestet, das Rollback stellt den Ausgangszustand her. Die offenen Punkte betreffen die Edge Function, den späteren Dev-Test und die Testkonkurrenz, nicht die Installation. Das Restrisiko (Punkt 1) ist durch die Dev-Natur und das getestete Rollback begrenzt.

**Vor einer Installation: neue Dateien einchecken und die CI auf PG16 und PG17 laufen lassen (aktuell nur lokal PG16 belegt; insbesondere die Fingerabdrücke des Manifests auf PG17).** Installation ausschließlich mit `install_dev.sh` und in einem ruhigen Fenster. Die Entscheidung liegt bei dir.

## Stand 18.11.2026 abends: Korrekturen aus der Read-only-Prüfung von ruinwalk-dev

Anlass: Read-only-Prüfung von `jlkqktmvqxibqdcobbhf` (PG 17.12, Kennung `7707768362984748398`, Preflight-Bedingungen erfüllt). Keine Verbindung zu Supabase bei diesen Änderungen, keine Installation.

| # | Befund | Änderung | Begründung |
|---|---|---|---|
| 1 | `set rw.project_ref` lief als eigene Autocommit-Transaktion VOR `begin;` – im Transaktions-Pooler (6543) evtl. auf anderem Backend | `install_dev.sh` setzt die Referenz als `set local rw.project_ref = '…';` unmittelbar nach dem einleitenden `begin;` der Datei (awk-Einfügung in den Datenstrom, Datei und Hash unverändert); Abbruch, wenn die erste Anweisung nicht `begin;` ist | Referenz, Zielprüfung (Kennung) und Installation laufen damit garantiert in derselben Transaktion = demselben Backend, unabhängig vom Pooler |
| 1b | zusätzlich | nur Port 5432 oder keine Portangabe; `port=`, `options=`, `target_session_attrs=` in der URL verboten | Transaktions-Pooler grundsätzlich ausgeschlossen (doppelte Sicherung) |
| 2 | kein `lock_timeout` in der Installation | `build.sh`: `set local lock_timeout = '5s';` als erste Anweisung nach `begin;` (vor Zielprüfung, vor der ersten Sperre auf `auth.users`) | Eine wartende Sperranforderung blockiert in PostgreSQL auch alle später ankommenden Schreibzugriffe auf `auth.users` (GoTrue). 5 s begrenzt diese Blockade; Abbruch macht alles rückgängig, ein neuer Versuch ist gefahrlos. Auf Dev (0 Nutzer) wird die Sperre normalerweise sofort gewährt. 15 s (Rollback) wären für eine Anmeldesperre zu lang, < 2 s brächte unnötige Fehlstarts |
| 3 | Umgebungsvariablen | `install_dev.sh` entfernt alle `PG*`-Variablen außer `PGPASSWORD` sowie `PSQLRC`/`PSQL_HISTORY`, setzt `PGSSLMODE=require`, ruft `psql -X` auf; URL mit `sslmode=disable/allow/prefer` wird abgelehnt | `PGHOSTADDR` hätte die Verbindung trotz geprüfter Host-URL auf eine andere IP gelenkt; `PGPORT` den Port (wenn in der URL keiner steht); `PGOPTIONS`/`PGSERVICE` Sitzungsoptionen bzw. Ziel; `~/.psqlrc` hätte vor der Datei beliebige SQL-Befehle ausführen können |
| 4 | Kommentar „psql -1“ in `rollback_dev.sql` | korrigiert: eigene Transaktion, `psql -X -v ON_ERROR_STOP=1`, ohne `-1`; Hinweis auf Port 5432 | Dokumentationsfehler |
| 5 | Kommentar in `schema.sql` („seit 2026 vergibt Supabase … keine Standardrechte mehr“) | **nicht geändert** (außerhalb des Änderungsumfangs) | Auf ruinwalk-dev bestehen in `public` Default-ACLs von `postgres` und `supabase_admin`, die `anon`, `authenticated`, `service_role` alle Rechte an neuen Tabellen, Sequenzen und Funktionen geben (lesend festgestellt). Der Kommentar trifft für Dev also nicht zu. Folgenlos für die Sicherheit: `schema.sql` entzieht anon/authenticated/PUBLIC danach alle Rechte; die Testattrappe läuft bereits im Modus „legacy = Standardrechte wie auf Dev“. Folge: `service_role` behält EXECUTE auf den internen public-Funktionen (außer `purge_account_backups`) – siehe offene Entscheidungen |
| 6 | `alter default privileges in schema rwi revoke … on functions from public` (05, Z. 374) | **nicht geändert** | Nach PostgreSQL-Semantik wirkungslos für das globale PUBLIC-EXECUTE neuer Funktionen. Keine konkrete Lücke: `anon`/`authenticated` haben kein USAGE auf `rwi` (05, Z. 368) und können keine `rwi`-Funktion aufrufen; jede `rwi`-Funktion der Installation wird in 05 ausdrücklich eingeordnet und widerrufen. Nur künftig von Hand angelegte Funktionen bekämen PUBLIC EXECUTE – ohne Schema-USAGE weiterhin unerreichbar |

**Tests:** `installation.mjs` 151 bestanden, 0 fehlgeschlagen (vorher 133). Neu: Port 6543/unbekannter Port/`port=`/`options=`/`sslmode=disable` abgelehnt, 5432/ohne Port/`sslmode=require` akzeptiert; Umgebungsvariablen erreichen psql nicht; Datei ohne einleitendes `begin;` wird nicht ausgeführt; **Pooling-Simulation** (Teil vor `begin;` auf Backend A, Rest auf Backend B: Installation gelingt) mit Gegenprobe des alten Verfahrens (Abbruch „nicht gesetzt“); `lock_timeout` steht an erster Stelle und **wirkt** (offene Schreibtransaktion auf `auth.users` → Abbruch nach ~5 s, nichts installiert). Angepasst (gleich streng): Wrapper-Erfolgsprüfung (Referenz jetzt nach `begin;`, `psql -X`) und Quelltextprüfung „private Kopie“ (awk statt cat).

**Neuer SHA-256 von `install_dev.sql`:** `2206042d22f047044f6a7813bcfa6eea9d778c3fd376033042bf454000adebf3` (geändert durch die `lock_timeout`-Zeilen; der Wrapper fügt die Referenzzeile nur in den Datenstrom ein, nicht in die Datei). Der frühere Hash `8a8c3d74…946fb` ist überholt.

**Erledigt im nächsten Abschnitt** (war offen): Rollback und Cleanup bekamen ihre Referenz/Bestätigung weiterhin per `set` vor dem Skript (ohne Wrapper). Port-5432-Hinweis steht im Kommentar; ein Wrapper wie `install_dev.sh` oder `set local` nach `begin` würde dort denselben Schutz bringen, ändert aber die wortgleiche Zielprüfung bzw. die Bedienung.

## Stand 18.11.2026 spät: Rollback und Cleanup mit demselben Schutz wie die Installation

**Lösung (eine Schutzlogik für alle drei Aktionen):** `supabase/dev/_ziel_wrapper.sh` enthält die bisher nur in `install_dev.sh` vorhandenen Prüfungen und wird von drei dünnen Wrappern eingebunden. Kein neuer Bedienweg außer den zwei Wrappern, die den bisherigen manuellen `psql`-Aufruf ersetzen.

| Aktion | Aufruf | Datei |
|---|---|---|
| Installation | `RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='…' bash supabase/dev/install_dev.sh <sha256 install_dev.sql>` | `install_dev.sql` (aus `build.sh`) |
| Rollback | `RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='…' RW_ROLLBACK_CONFIRM=ja-loeschen bash supabase/dev/rollback_dev.sh <sha256 rollback_dev.sql>` | `rollback_dev.sql` |
| Cleanup (nur `@rwtest.invalid`) | `RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='…' RW_ROLLBACK_CONFIRM=ja-loeschen bash supabase/dev/cleanup_dev.sh <sha256 cleanup_test_accounts.sql>` | `cleanup_test_accounts.sql` |

**Zulässige Verbindung (alle drei) – überholt, gilt: Abschnitt „URL nur per Positivliste“ unten (kein Passwort in der URL):** `postgresql://postgres:<pw>@db.jlkqktmvqxibqdcobbhf.supabase.co:5432/postgres` (direkt) oder `postgresql://postgres.jlkqktmvqxibqdcobbhf:<pw>@<region>.pooler.supabase.com:5432/postgres` (Session-Pooler). **Nicht** Port 6543 (Transaktions-Pooler), keine `host=/hostaddr=/port=/options=/…`-Parameter, kein `sslmode=disable/allow/prefer`. SHA-256 vorher mit `sha256sum <datei>` ermitteln.

**Garantien je Aufruf:** nur ruinwalk-dev (Referenz und Verbindungsziel), nie Produktion · PG-Umgebung bereinigt (alle `PG*` außer `PGPASSWORD` sowie `PSQLRC`/`PSQL_HISTORY` werden entfernt), `PGSSLMODE=require`, `psql -X` · genau die gehashte private Kopie wird ausgeführt · Projektreferenz **und** Bestätigung werden als `set local` direkt nach dem `begin;` der Datei eingefügt – Zielprüfung (Datenbankkennung), Bestätigungsprüfung und Aktion laufen in **derselben Transaktion auf demselben Backend**, auch hinter einem Pooler · `ON_ERROR_STOP=1`, ohne `-1`, Fehler = Exit 2 mit „FEHLGESCHLAGEN“.

**lock_timeout:** Installation 5 s (unverändert); Rollback und Cleanup jetzt ebenfalls 5 s als erste Anweisung nach `begin;` (DO-Block mit `set_config(…, true)`, damit der für Sperrtests genutzte Rollback-Abschnitt unverändert bleibt); die Sperrphase des Rollbacks von 15 s auf 5 s gesenkt, weil `DROP TRIGGER … ON auth.users` ACCESS EXCLUSIVE braucht und eine wartende Anforderung alle Anmeldezugriffe dahinter blockiert.

**Unverändert:** Zielprüfung wortgleich in allen drei SQL-Dateien, Manifest- und Abhängigkeitsprüfung, Rollback ohne CASCADE, Cleanup nur `email like '%@rwtest.invalid'`.

**Tests:** `installation.mjs` 188 bestanden (vorher 151). Neu u. a.: je Wrapper Abbrüche ohne/mit falscher Projektreferenz, ohne/mit falscher Bestätigung, Port 6543, fremder Host, ohne/mit falschem Hash; Strom enthält Referenz + Bestätigung als `set local` nach `begin;`, manipulierte PG-Umgebung erreicht psql nicht; Rollback mit echtem psql gegen falsche Datenbank (Abbruch) und richtige (vollständig, ohne CASCADE); **Pooling-Simulation** für Rollback und Cleanup (Teil vor `begin;` auf Backend A, Rest auf B: gelingt) mit Gegenprobe des alten Verfahrens (Abbruch); **Sperrkonflikte** für Rollback (~5 s, nichts gelöscht) und Cleanup (~5 s, kein Konto gelöscht); Cleanup löscht nur `@rwtest.invalid`, nicht `x@rwtest.invalid.example.org` oder `rwtest.invalid@example.org`. Angepasst (gleich streng): Quelltextprüfung „private Kopie“ prüft jetzt `_ziel_wrapper.sh` und dass alle drei Wrapper ihn einbinden, ohne selbst Dateien zu lesen oder psql aufzurufen.

## Stand 18.11.2026 nachts: URL nur per Positivliste, genau ein Host, Passwort nicht mehr in der URL

Anlass: Abgleich (`rw-backend-security`, `rw-qa`) fand zwei Umgehungen der Zielprüfung, die schon in `ce29fd0` steckten: prozentkodierte Abfrageparameter (`?%70ort=6543` → libpq verbindet auf 6543) und Mehrfach-Hosts (`fremd.example,aws-0-….pooler.supabase.com` → libpq versucht zuerst den fremden Host und würde ihm das Passwort schicken). Produktion war durch die Kennungsprüfung in der Transaktion weiter geschützt, die Zusagen „nur Port 5432“ und „nur das geprüfte Ziel“ stimmten aber nicht.

**Tatsächliches libpq-Verhalten (psql/libpq 16.15, lokal gegen ins Leere zeigende Ziele belegt):** `%xx` wird in Parameternamen **und** -werten dekodiert (`?%70ort=` = `port`, `sslmode=disab%6Ce` = `disable`); bei doppelten Parametern gilt der letzte; `&` trennt Parameter; `#` ist **kein** Fragment (`/x#?port=6543` setzt Port 6543); `h1,h2` und `h1:p1,h2:p2` sind mehrere Hosts, die nacheinander versucht werden; `POSTGRESQL://` (Großbuchstaben) ist keine URL, sondern ein Datenbankname am lokalen Standard-Socket; `%2E` im Host wird zu `.`; Hostnamen mit Schlusspunkt, Backslash oder Leerzeichen werden unverändert an die Namensauflösung gegeben; leerer Port und `05432` ergeben 5432. Eine Sperrliste kann das nicht vollständig abdecken.

**Lösung (`_ziel_wrapper.sh`, gilt für Installation, Rollback und Cleanup):**
1. Zeichenvorrat der URL nur `a-z 0-9 . : / @ ? = -` – damit sind Prozentkodierung, `#`, `&`, Komma, `[ ]` (IPv6), Backslash, Leer-/Steuerzeichen und Großbuchstaben ausgeschlossen.
2. Kein Passwort in der URL; Port nur `:5432` oder keiner; Abfrageteil nur leer oder genau `?sslmode=require|verify-ca|verify-full`; Host/Benutzer nur `postgres@db.jlkqktmvqxibqdcobbhf.supabase.co` oder `postgres.jlkqktmvqxibqdcobbhf@aws-<n>-<region>.pooler.supabase.com`.
3. Zusätzlich, unabhängig: die gesamte URL muss exakt einer der beiden Formen `postgres(ql)://…/postgres[?sslmode=…]` entsprechen (genau ein Host, Datenbank `postgres`).
4. **Passwort:** nur aus `PGPASSWORD` (Pflicht, keine Steuerzeichen). Der Wrapper schreibt es in eine private pgpass-Datei (`mktemp`, 600, nach dem Lauf gelöscht), gebunden an **genau** den geprüften Host, Port 5432, Datenbank `postgres` und Benutzer; psql erhält `PGPASSWORD` nicht (`unset` in einer Unterschale). libpq gibt das Passwort nur an diesen Host heraus. `psql -w`: nie nach einem Passwort fragen – ohne Terminal hätte psql sonst die erste Zeile des SQL-Stroms als Passwort gelesen und an den Server geschickt (im Test belegt).

**Bedienung neu:** `RW_DB_URL` ohne Passwort, Passwort über `PGPASSWORD`, z. B. `read -rs PGPASSWORD; export PGPASSWORD` und dann
`RW_PROJECT_REF=jlkqktmvqxibqdcobbhf RW_DB_URL='postgresql://postgres@db.jlkqktmvqxibqdcobbhf.supabase.co:5432/postgres' bash supabase/dev/install_dev.sh <sha256>` bzw. Session-Pooler `postgresql://postgres.jlkqktmvqxibqdcobbhf@aws-<n>-<region>.pooler.supabase.com:5432/postgres` (Rollback/Cleanup wie oben mit `RW_ROLLBACK_CONFIRM=ja-loeschen`).

**Passwort in der Prozessliste (geprüft):** `/proc/<pid>/cmdline` ist für alle lokalen Benutzer lesbar (`r--r--r--`), `/proc/<pid>/environ` nur für den Besitzer (`r--------`). Vorher stand das Passwort in der URL und damit in den psql-Argumenten; jetzt steht es weder in einer Kommandozeile (auch `printf` ist ein Shell-Builtin) noch in der Umgebung von psql. **Aufräumen:** Die pgpass-Datei wird über den EXIT-Trap gelöscht – auch bei Abbruch per SIGTERM/SIGINT/SIGHUP (lokal belegt), nicht bei SIGKILL (dann bleibt sie mit Rechten 600 im eigenen Temp-Verzeichnis liegen). Die Zeichenprüfung läuft mit `LC_ALL=C` (Bereiche wie `[a-z]` unabhängig von der Locale). **Restrisiko:** In der Umgebung des aufrufenden Shell-Prozesses und des Wrappers steht `PGPASSWORD` (für denselben Benutzer und root lesbar) und kurzzeitig in der pgpass-Datei (600). Wer das Passwort inline vor den Befehl schreibt, hat es in der Shell-Historie – deshalb `read -rs`.

**TLS (nicht geändert, Entscheidung offen):** Standard bleibt `PGSSLMODE=require` (verschlüsselt, prüft das Serverzertifikat aber nicht – ein Mittelsmann mit eigenem Zertifikat würde nicht erkannt; die pgpass-Bindung an den Hostnamen schützt dagegen nicht, weil der Name gleich bleibt). `verify-full` ist mit dem Wrapper bereits nutzbar (`?sslmode=verify-full` in der URL) und **fail-closed** (lokal belegt: ohne bzw. mit ungültigem `~/.postgresql/root.crt` bricht libpq vor jeder Anmeldung ab). Voraussetzung: das Supabase-CA-Zertifikat (Dashboard → Database → SSL Configuration, „Supabase Root 2021 CA“) als `~/.postgresql/root.crt`; `sslrootcert=` in der URL und `PGSSLROOTCERT` sind bewusst nicht zugelassen. Laut Supabase-Doku gilt die SSL-Durchsetzung samt `verify-full` für Direktverbindung und Session-Pooler. **Nicht belegt** (keine Verbindung zu Supabase erlaubt): dass das Zertifikat von `db.jlkqktmvqxibqdcobbhf.supabase.co` bzw. des Session-Poolers die Hostnamenprüfung tatsächlich besteht. Empfehlung: vor der Installation einmal lesend mit `verify-full` verbinden; gelingt das, `verify-full` im Wrapper verbindlich machen. Ergänzend möglich (libpq ab 16): `PGREQUIREAUTH=scram-sha-256` – dann schickt libpq das Passwort nie im Klartext, auch wenn ein Mittelsmann bei `require` eine Klartext-Anmeldung anfordert; ob Direktverbindung und Session-Pooler SCRAM verlangen, ist nicht belegt (vor Einführung prüfen).

**Pooler-Host:** Die Region von ruinwalk-dev ist im Repository nicht belegt (nur die von Produktion: eu-central-1). Zugelassen ist daher jeder Session-Pooler der Form `aws-<n>-<region>.pooler.supabase.com` (nur Supabase-Domäne, genau ein Host, Benutzer `postgres.<dev-ref>`). Sobald die Region feststeht, kann der Host exakt festgeschrieben werden.

**Tests:** `installation.mjs` 273 bestanden (vorher 188). Neu: 61 abgelehnte URL-Formen je für alle drei Wrapper mit erwartetem Ablehnungsgrund (Prozentkodierung in Port/Host/hostaddr/options/sslmode-Name und -Wert, Host, Datenbank; Mehrfach-Hosts in drei Varianten; IPv6; `&`, doppelte, leere, wertlose und zusätzliche Parameter; Großschreibung; ungültige TLS-Modi; `#`-Fragmente; Passwort/leeres Passwort in der URL; doppelte, leere, fehlende Userinfo; fremde Benutzer; Portvarianten; Hostvarianten mit Schlusspunkt, fremden Endungen, IP, Backslash, Leer-/Steuerzeichen; Schlüssel-Wert-Form); 6 zulässige Formen × 3 Wrapper (pgpass-Inhalt exakt, Modus 600, danach gelöscht, kein `PGPASSWORD` und kein Passwort in den psql-Argumenten); Abbruch ohne/mit ungültigem `PGPASSWORD`; **echte libpq gegen einen Lausch-Server**, der ein Klartext-Passwort anfordert: Gegenprobe (pgpass für diesen Host → Passwort kommt an), an den Dev-Host gebundenes pgpass → fremder Host erhält nichts, Mehrfach-Host mit fremdem ersten Host → nichts, Wrapper mit auf einen fremden Host umgelenktem psql → weder Passwort noch SQL-Zeile kommt an.
