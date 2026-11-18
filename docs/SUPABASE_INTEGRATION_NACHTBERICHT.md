# Supabase-Integration: Nachtbericht

Stand: 18.11.2026. Branch `nacht/supabase-integration` (acht Commits auf Basis von `main`, nicht gemergt). **Auf dem Dev-Projekt wurde nichts installiert oder verändert, auf Produktion nichts angefasst, keine Secrets gelesen oder geschrieben.** Das Dev-Projekt wurde nur mit lesenden Katalogabfragen befragt (Rollen, Default-ACLs, Erweiterungen, Funktionsorte, Spalten; Vault nur Namen). `index.html`, GPS, Echtzeitkampf, `supabase/schema.sql` und alle beschlossenen Spiel- und Kampfregeln sind unverändert.

## 00. Abschlussentscheidungen (18.11.2026) und Stand des Branches

**Stand:** Branch `nacht/supabase-integration`, letzter Code-Commit `668de0e`. **Kein Merge nach `main`, keine Installation oder Änderung auf Dev oder Produktion, keine Secrets.** `index.html`, GPS/Echtzeit, Kampfregeln und `supabase/schema.sql` sind gegenüber `main` unverändert (leerer Diff). Auf diesem Stand warte ich auf deine nächste Entscheidung.

### 00.1 Die fünf Entscheidungen und ihre Umsetzung
| # | Entscheidung | Umsetzung | Tests |
|---|---|---|---|
| 1 | Ein Account stellt in einer Instanz dauerhaft nur einen Charakter; auch ausgetretene/automatisch entfernte zählen; andere Instanzen frei | strenge Zählung in `rwi.join`, `create_group`, Trigger `account_guard`, Unique-Index (`04_gruppe.sql`) – schon so implementiert, jetzt zusätzlich für **automatisch entfernte** Mitglieder (`abwesenheit`, `bereitschaft`), Warteliste mit Nachrücken + Entfernung, Client-Wrapper und Kontolöschung belegt | `konto-regel.mjs` 48 (vorher 31) |
| 2 | Lösch­vorgang wird vollständig zurückgerollt, wenn auch die minimale Bereinigung scheitert; nie ein Geistermitglied | Zusätzlich verschärft: scheitert **die Folgeprüfung** (`after_auto_removal`: Abbruch/Nachrücken) nach Stufe 2, bricht jetzt ebenfalls alles ab (vorher nur Alarm). Dokument: `docs/LOESCHVORGANG.md` (abgefangen vs. abbrechend) | `loesch-trigger.mjs` 59 (vorher 56) |
| 3 | Hotfix: neue Engine-Version nur über kontrollierte Wiederaufnahme | `stuck` ist gesperrt (`stuck_locked` für jeden direkten Commit); `resume_stuck` mit Begründung; Engine-Register `rwi.engine_versions` mit Zustandsschema; unbekannte/inkompatible Version abgelehnt; alt/neu in `rwi.ops_log`; nach Wiederaufnahme nur freigegebene Version (`engine_mismatch`); später Commit des alten Workers `superseded`; gleicher Snapshot/`input_hash`; frühere Runden byte-gleich; Replay bitgleich | `hotfix-resume.mjs` 34 (neu), `stuck.mjs` 46, `run.mjs` 45 |
| 4 | F9: Slot 3 nachträglich gesperrt | Eigentum immer, Berechtigung nur bei Eintritt und noch nicht abgegebenem Ready (`own_character(…, p_need_entitlement)`); Profil je Mitglied in `rwi.members.profile` (beim Eintritt, bei Ready aktualisiert, danach eingefroren); `rwi.roster` liest nur das gespeicherte Profil | `slot3-f9.mjs` 26 (neu) |
| 5 | Alarm: vorerst keine Zustellung, Datenbankalarm maßgeblich | unverändert genau ein Alarm je Übergang, keine Duplikate, Status/Historie, Protokoll von Wiederaufnahme/Beendigung; Erweiterungsvorschlag für E-Mail u. a. in `docs/STUCK_ABLAUF.md` | `stuck.mjs`, `hotfix-resume.mjs` |

### 00.2 Wesentliche Änderungen an bestehenden Tests (nichts entfernt oder abgeschwächt)
- `run.mjs` (Abschnitt 5): Der alte Test „Hotfix mit neuer engine_version löst die hängende Runde“ lief über einen direkten Commit. Beschluss 3 verbietet das. Der Test prüft jetzt dieselbe Aussage (neue Engine-Version löst die Runde, `engine_version` gespeichert), aber über `resume_stuck` und zusätzlich, dass der direkte Commit abgewiesen wird: 2 Prüfungen mehr (45 statt 43 bei gleichem Inhalt).
- `stuck.mjs` Abschnitt 8: „auch bei 8 Fehlversuchen nur EIN Alarm“ bleibt (jetzt: sechs `invalid`, danach `stuck_locked`, ein Alarm); die Hotfix-Prüfung läuft über die Wiederaufnahme.
- `installation.mjs`: Zählungen 17 Tabellen / 38 Funktionen in `public`; `worker-a1.mjs`: elf statt zehn Wrapper; `produktion.mjs`: Liste der Triggerfunktionen um `profile_snapshot` erweitert. Alles reine Erwartungsanpassungen an hinzugefügte Objekte.

### 00.3 Exakte Commit-IDs seit `main` (15 Commits, Basis `8e423a3`)
`2ff5b6a`, `ca46cba`, `12f8504`, `28438a2`, `052a6b3`, `1a3f0e9`, `a35108a`, `673fded` (Nachtauftrag) · `4e85377`, `ea92d86`, `f270633`, `7e3c99f`, `1e3e6ff` (Folgeauftrag 1) · **`8744b31`**, **`668de0e`** (dieser Auftrag), dazu der Commit mit diesem Bericht.

### 00.4 Geänderte Dateien gegenüber `main` (37 Dateien, 27 neu, 10 geändert; `git diff --stat main...HEAD`)
- **SQL** (`server/instance/sql/`): `01_proto.sql` (ohne pgcrypto), `03_windows.sql`, `04_gruppe.sql`, `05_produktion.sql`.
- **Worker** (`server/instance/worker/`): `core.mjs`, `a1.mjs` (neu).
- **Tests** (`server/instance/tests/`): neu `hotfix-resume`, `slot3-f9`, `loesch-trigger`, `konto-regel`, `konto-integration`, `worker-a1`, `worker`, `stuck`, `sa-untersuchung`, `installation`, `rechte-audit`, `prod-env`, `run-all-db.sh`; geändert `dev-umgebung`, `pg`, `produktion`, `run`.
- **Dev-Skripte** (`supabase/dev/`, nicht ausgeführt): `00_preflight.sql`, `build.sh`, `rollback_dev.sql`, `cleanup_test_accounts.sql`; `supabase/tests/run.sh`.
- **CI**: `.github/workflows/instance-tests.yml`.
- **Doku** (`docs/`): Nachbericht, `SUPABASE_FREIGABE_CHECKLISTE.md`, `LOESCHVORGANG.md`, `STUCK_ABLAUF.md`, `WORKER_A1_SCHNITTSTELLE.md`, `SUPABASE_S-A_UNTERSUCHUNG.md`, `INSTANZKAMPF_WORKER_ARCHITEKTUR.md`; `server/instance/README.md`.
- **Nicht angefasst:** `index.html`, `supabase/schema.sql`, Kampfregeln/Engine (`server/instance/engine/`), GPS-Echtzeit.

### 00.5 Testergebnisse (Basislauf: `668de0e`)
| Prüfung | Ergebnis |
|---|---|
| Sammellauf lokal, PostgreSQL 16.15 | `ALLES BESTANDEN` (25 Läufe) |
| CI `database (16)` / `database (17)` (Run 44251214345) | beide `ALLES BESTANDEN`, 25 Läufe `exit=0`, identische Zahlen |
| CI `vergleich-pg16-pg17`, `determinism`, `bestehende-tests` | alle `success` |
| `npm test` | 229 bestanden, 0 fehlgeschlagen |
| Determinismus Node / Bun | gleicher Digest `d0a464c6…` (Deno nur in der CI) |
Zahlen je Test (PG16 = PG17): run 45, fenster 39, gruppe 157, eventende 32, semantik 27, produktion 222, dev-umgebung 22, konto-integration 63, konto-regel 48, loesch-trigger 59, installation 29, rechte-audit 29, worker 25, worker-a1 26, stuck 46, hotfix-resume 34, slot3-f9 26, sa-untersuchung 15, supabase-schema 245 je Modus, Dungeon-Seeds 3/4/5 und Weltboss-Ende ohne Probleme, K.2-Vergleich ohne Deadlocks.
**Mutationsprüfung der neuen Tests:** ohne `stuck_locked`-Sperre scheitern 7 Prüfungen; ohne Kompatibilitätsprüfung 7; mit Berechtigungsprüfung bei jedem Aufruf 1; mit Live-Profil in `roster` 2.
**Nicht belegt (lokal nicht möglich):** echtes GoTrue/PostgREST/JWT, echtes `delete_account` mit Passwortanmeldung, `supautils`-Besonderheiten, Dashboard-Einstellung der exponierten Schemas, Commit-Latenz auf Dev.

### 00.6 Bekannte Einschränkungen
- Die Alarmzustellung nach außen fehlt bewusst; Betreiberkennung ist freier Text, keine geprüfte Identität.
- Die alte Engine-Version bei reinen Engine-Ausnahmen (`report_failure`) ist nicht immer bekannt und steht dann als `unbekannt` im Protokoll.
- `state_schema` ist heute überall 1; eine Schemamigration des gespeicherten Kampfzustands ist nicht gebaut (die Prüfung lehnt Versionen mit anderem Schema nur ab).
- F9: `rwi.players` (Profilquelle) wird noch nicht aus `public.characters` abgeleitet (F5, `derive-profile` fehlt). Der Schutz bezieht sich auf das gespeicherte Instanzprofil ab Eintritt/Ready.
- Spieler ohne Charakterzuordnung (nur Prototypschlüssel) haben keine Kontokennung und werden nicht auf die Account-Regel geprüft.
- Bei Entzug von Platz 3 vor dem Ready bleibt der Charakter Mitglied, kann aber nicht bereit werden (getestet). Dass ihn danach die bestehende Bereitschaftsfrist entfernt, ist erwartet, aber für diesen Fall nicht gesondert getestet.
- Aufrufe von Edge Function, Cron, `pg_net`, `dispatch_due`, Authentisierung/Ratenbegrenzung des Workers sind nicht gebaut.

### 00.7 Offene Dev-Voraussetzungen
Siehe `docs/SUPABASE_FREIGABE_CHECKLISTE.md` (Abschnitte C–F): Dashboard-Prüfung „Exposed schemas“, Preflight auf Dev, Umgang mit Probe-Migrationen und Vault-Überbleibsel, echte REST/JWT/GoTrue-Tests, `app_metadata`-Reihenfolge (S-A), `derive-profile`, Worker-Bereitstellung, Alarmzustellung.

### 00.8 Sicherheitsbewertung
- **Rechte:** `rwi` ist für `anon`/`authenticated` unerreichbar (kein USAGE, kein Tabellen-/Funktionsrecht); elf `service_role`-Wrapper (SECURITY INVOKER, fester `search_path`, Eingabeprüfung); Client-Wrapper erzwingen Eigentum aus `auth.uid()`; sechs SECURITY-DEFINER-Funktionen mit festem `search_path`, katalogisch geprüft. Neue Funktionen (`register_engine`, `profile_of`, `profile_snapshot`) sind klassifiziert und nicht client-ausführbar.
- **Integrität:** Account-Regel in drei Schichten; stuck nicht durch Commit umgehbar; Wiederaufnahme nur durch `service_role` mit Protokoll; Lösch­vorgänge atomar.
- **Restrisiken:** Der `service_role`-Schlüssel ist weiterhin allmächtig auf `public`; ein kompromittierter Worker kann Wiederaufnahmen und Engine-Registrierungen auslösen (nur protokolliert, kein Vier-Augen-Prinzip). Echte Plattformpfade sind ungetestet.

### 00.9 Empfehlung zur Dev-Installation
**Für eine spätere Dev-Installation – unter Vorbehalt, nicht jetzt.** Technisch spricht nach lokalem und CI-Nachweis (PG 16 und 17) nichts mehr gegen eine Installation auf dem **leeren** Dev-Projekt mit vorherigem Preflight und anschließender Katalogprüfung. Vorher sollten mindestens (1) die Dashboard-Einstellung der exponierten Schemas geprüft, (2) der Preflight gelesen und (3) entschieden sein, wer die echten REST/JWT-Tests ausführt, weil meine Umgebung Dev nicht erreicht. Ein Merge nach `main` empfehle ich erst nach den echten Dev-Tests, weil die kombinierte Installation Funktionen und Trigger in `public` anlegt, die auf Produktion nur mit eigener Migration kämen.

## 0. Nachtrag: Folgeauftrag „Kritische Review und Härtung“ (18.11.2026)

Auch dieser Teil: nur auf dem Branch `nacht/supabase-integration`, kein Merge, **keine Änderung auf Dev oder Produktion**, keine Secrets, `index.html`, GPS und Kampfregeln unverändert, `supabase/schema.sql` unverändert.

**Commits dieses Folgeauftrags** (auf `673fded`): `4e85377` (Härtung, SQL und Tests), `ea92d86` (S-A-Untersuchung, Testhilfen), `f270633` (Dokumente, Sammellauf). Der Bericht selbst steht im Commit, der diese Datei enthält. CI (PostgreSQL 16.16 und 17.12) war auf `f270633` in allen fünf Jobs grün (`database (16)`, `database (17)`, `vergleich-pg16-pg17`, `determinism`, `bestehende-tests`).

### 0.1 Beschlüsse und ihre Umsetzung
| Beschluss | Umsetzung | Nachweis |
|---|---|---|
| Ein Account stellt je Instanz höchstens einen Charakter | `04_gruppe.sql` + `05_produktion.sql` (Abschnitt 0.3) | `konto-regel.mjs` (31) |
| Worker-Architektur A1 | zehn `service_role`-Wrapper in `05_produktion.sql`, Adapter `worker/a1.mjs` (Abschnitt 0.4, `docs/WORKER_A1_SCHNITTSTELLE.md`) | `worker-a1.mjs` (26) |
| `stuck`: Alarm, keine automatische Wiederholung, kontrollierte Wiederaufnahme | `03/04/05` (Abschnitt 0.5, `docs/STUCK_ABLAUF.md`) | `stuck.mjs` (43) |
| Keine Installation, kein Merge | eingehalten | – |

### 0.2 Lösch-Trigger: Prüfung und Befund
Geprüft in `loesch-trigger.mjs` (56 Prüfungen): laufende Runde, bestätigte Aktion, Gruppenpause, laufende Rundenauflösung, Konto mit mehreren Charakteren in mehreren Instanzen, gleichzeitige Löschung und Auflösung, Fehler in `rwi.leave`, Rollback der gesamten Löschung, Wartelisteneintrag. Nach jedem Szenario läuft eine Konsistenzprüfung über alle Instanzen (keine aktiven Mitglieder ohne Charakter, keine wartenden Geister, keine Profile ohne Charakter, keine aktiven Kämpfe oder offenen Aufträge in beendeten Instanzen, keine doppelten Rundenergebnisse).

**Verhalten (so getestet):**
- Der Trigger läuft **nach** dem Löschen der Zeile (`AFTER DELETE`, je Charakter) und benutzt nur `OLD.character_id`. Bei der Kontolöschung sind Konto, Profil und der gerade gelöschte Charakter zu diesem Zeitpunkt nicht mehr sichtbar (Messung mit einer Prüfhilfe am Austritt). Das ist unkritisch: `rwi.leave` liest `public.characters` nicht (Katalogprüfung: nur `own_character` und `account_of` tun das).
- Bestätigte Aktion: Das Mitglied tritt aus, die Aktion bleibt als Verlauf stehen. Der nächste Claim führt das Mitglied in der `left`-Liste des eingefrorenen Snapshots; die Engine setzt es auf `gone`.
- Gruppenpause: Die Pause und das verbrauchte Budget bleiben unverändert; ein später wiederverbundenes Mitglied beendet die Pause wie bisher. Löschen beide Mitglieder, endet die Instanz regulär (`aborted`).
- Laufende Auflösung: Lease, Token und Phase bleiben unverändert, der Commit mit dem vor dem Löschen eingefrorenen Snapshot ist gültig (genau ein Rundenergebnis). Sind danach alle ausgetreten, wird die Instanz abgebrochen und der späte Commit ohne Wirkung abgewiesen.
- **Gefundener Fehler (jetzt behoben): Deadlock.** Zwei gleichzeitige Kontolöschungen mit Charakteren in denselben zwei Instanzen in gegenläufiger Reihenfolge verklemmten sich (im Kontrollversuch ohne Gegenmaßnahme: ein `deadlock detected` plus ein abgefangener Fehler). Gegenmaßnahme: `rwi.on_profile_deleting` sperrt vor der Kaskade alle aktiven Instanzen des Kontos aufsteigend nach ID. Danach gelingen beide Löschungen ohne Alarm.
- **Gefundener Fehler (jetzt behoben): stilles Geistermitglied.** Der erste Entwurf fing jeden Fehler in `rwi.leave` ab und protokollierte nur. Danach blieb das Mitglied aktiv. Jetzt: Stufe 1 `rwi.leave`; scheitert sie, Stufe 2 ohne Spiellogik (Mitglied `left/freiwillig` mit denselben Endzuständen wie `drop_member`, Wartelisteneintrag storniert, Beute entfällt) plus Alarm `char_cleanup_failed`; scheitert auch das, läuft der Fehler heraus und die **gesamte** Löschung (Charakter, Konto, Sicherungen, Protokoll, Zahlungsereignisse) wird zurückgerollt und ist nach Behebung wiederholbar (getestet). Ein bei der ersten Stufe-2-Fassung gefundener Fehler (`leave_reason`-CHECK-Constraint lehnte den neuen Grund ab) zeigt den Wert der Fehlerinjektion.
- Löschen scheitert nur, wenn selbst die minimale Bereinigung (oder ihre Folgeprüfung) nicht möglich ist; so entschieden am 18.11. (siehe `docs/LOESCHVORGANG.md`).

### 0.3 Account-Eindeutigkeit je Instanz
**Regel:** Ein Account hat in einer Instanz höchstens eine Mitgliedszeile (in jedem Zustand) oder einen wartenden Eintrag. Verschiedene Instanzen dürfen verschiedene Charaktere desselben Accounts enthalten.
**Umsetzung in drei Schichten:** (1) `rwi.join` und `rwi.create_group` melden `account_in_instance` / `account_duplicate`; `join` arbeitet unter der Instanzsperre, parallele Beitritte laufen nacheinander. (2) Trigger `account_guard` auf Mitgliedern und Warteliste mit Advisory-Sperre je (Instanz, Konto) prüft beide Tabellen gemeinsam, deckt also jeden Schreibweg (`promote_waitlist`, direkte Inserts). (3) Partieller Unique-Index auf `rwi.members (instance_id, account)`. Die Kontokennung `account` wird vom Trigger über den Hook `rwi.account_of(player)` gesetzt (Produktion: aus `public.characters`; Prototypspieler ohne Charakter bleiben unbeschränkt) und bei Kontolöschung aus den Zeilen entfernt.
**Strenge Zählung (am 18.11. bestätigt):** Auch ein ausgetretener oder entfernter Charakter zählt. Der Account kann also nicht mit einem anderen Charakter in dieselbe Instanz nachtreten (gleiche Logik wie „kein Wiederbeitritt“ für denselben Charakter). Wenn „teilnehmend“ nur aktive Mitglieder meinen soll, ist es eine Zeile in `account_conflict` und im Trigger.
**Tests (`konto-regel.mjs`):** nacheinander, gleichzeitig (8 Läufe mit je drei Beitritten, 6 Läufe über die Client-Wrapper mit `auth.uid()`), zwei verschiedene Accounts gleichzeitig (5 Läufe, beide erfolgreich), Beitritt gleichzeitig mit Nachrücken (5 Läufe), mehrere Instanzen mit drei Charakteren eines Accounts, Warteliste (Mitglied, wartend, Rückzug, Nachrücken), Gruppenwechsel, `create_group`, direkte Inserts, Unique-Index ohne Trigger. Der Fund aus `produktion.mjs` (alte Tests erwarteten zwei Charaktere desselben Kontos in einer Instanz) wurde an die Regel angepasst, nicht abgeschwächt: Die Prüfungen „A kann zweiten Charakter beitreten lassen“ und „`ambiguous_character`“ gelten nicht mehr; stattdessen wird `account_in_instance` und die eindeutige Ableitung geprüft; die Weltboss-Gruppe nutzt sechs verschiedene Konten.

### 0.4 A1-Schnittstelle
Siehe `docs/WORKER_A1_SCHNITTSTELLE.md` (Berechtigungsmatrix, Eingabeprüfung, Rückgabefelder, offene Punkte). Kurz: zehn Wrapper `rw_worker_*` und `rw_ops_*` in `public`, je genau eine `rwi`-Funktion, `SECURITY INVOKER`, `search_path = pg_catalog, pg_temp`, nur `service_role` darf ausführen. `anon` und `authenticated` scheitern im tatsächlichen Aufruf mit „permission denied“. Selbst bei versehentlich vergebenem EXECUTE würden sie am fehlenden `USAGE` auf `rwi` scheitern (Mutationsprüfung). Ein kompletter Worker-Tick läuft ausschließlich über die Wrapper. Neu dafür: `rwi.fight_rounds`.

### 0.5 stuck und Alarmierung
Siehe `docs/STUCK_ABLAUF.md`. Geprüft: `report_failure` war korrekt (5/10/20/40/60 s, Übergang bei `max_attempts`), aber (a) weitere Meldungen und weitere ungültige Commits erhöhten den Zähler und erzeugten jeweils einen weiteren Alarm, (b) ein Claim bei abgelaufener Lease hätte einen stuck-Kampf erneut zugeteilt, (c) es gab keine kontrollierte Wiederaufnahme. Behoben: genau ein Alarm je Übergang (eindeutiger Schlüssel), `already_stuck`, Claim bei `engine_stuck` abgewiesen, Watchdog legt fehlende Alarme einmal nach und schließt Alarme beendeter Instanzen, `resume_stuck` / `terminate_stuck` mit Pflichtbegründung und Betriebsprotokoll `rwi.ops_log`. **Überholt durch den Beschluss vom 18.11.:** Ein direkter Commit auf einen stuck-Auftrag ist jetzt gesperrt; Hotfix nur über `resume_stuck` mit Engine-Prüfung (Abschnitt 00, `docs/STUCK_ABLAUF.md`). **Eine Benachrichtigung nach außen gibt es nicht.**

### 0.6 S-A (nur untersucht)
Siehe `docs/SUPABASE_S-A_UNTERSUCHUNG.md`. **Empfehlung:** sicherheitstechnisch vertretbar (Marker in einem Feld, das Spieler nicht schreiben können; typstreng; Bestandskonten unberührt), aber **erst nach Prüfung gegen echtes GoTrue** umsetzen, ob `app_metadata` bei `admin.createUser` schon im INSERT geschrieben wird. Wenn nicht, bleibt S-C (heutiges Verhalten). Nichts an `schema.sql` geändert.

### 0.7 Neue und geänderte Tests (PostgreSQL 16.15 lokal; PG 16.16 und 17.12 in der CI auf `f270633`, identische Zahlen)
| Test | Prüfungen | Art |
|---|---|---|
| `loesch-trigger.mjs` | 56 | neu |
| `konto-regel.mjs` | 31 | neu |
| `worker-a1.mjs` | 26 | neu |
| `stuck.mjs` | 43 | neu |
| `sa-untersuchung.mjs` | 15 | neu (nur Analyse) |
| `produktion.mjs` | 222 (vorher 222) | angepasst an die Account-Regel; Hilfsfunktion `strip05` |
| `konto-integration.mjs` | 63 (vorher 59) | Slot-3-Szenario auf zwei Instanzen umgestellt; 4 Prüfungen neu |
| `rechte-audit.mjs` | 29 | erwartete Mengen erweitert (Funktionen/Trigger) |
| `installation.mjs` | 29 | Zählungen (16 Tabellen in `rwi`, 37 Funktionen in `public`) |
Unverändert: run 43, fenster 39, gruppe 157, eventende 32, semantik 27, worker 25, dev-umgebung 22, `supabase/tests/run.sh` 245 je Modus, Dungeon-Läufe, K.2-Vergleich. Determinismus Node = Bun (gleicher Digest; Deno nur in der CI), `npm test` 229 bestanden.
**Keine bestehende Prüfung wurde entfernt oder abgeschwächt.** Die Änderungen an `produktion.mjs`, `konto-integration.mjs`, `rechte-audit.mjs`, `installation.mjs` betreffen ausschließlich Erwartungen, die durch die beschlossene Regel oder die zusätzlichen Objekte überholt waren; jede ist oben begründet.
**Mutationsprüfung der neuen Tests:** ohne Trigger-Prüfung scheitern 2 Prüfungen (`konto-regel`, der Unique-Index fängt den Rest); ohne die Vorab-Sperre scheitern 3 (`deadlock detected`); mit EXECUTE für `authenticated` scheitern 2 (Katalog und Aufruf); ohne Alarm-Schlüssel und Übergangsprüfung scheitern 3 (`stuck`).

### 0.8 Weiterhin offene Sicherheitsfragen (nicht nachweisbar ohne echtes Dev-Projekt)
1. Echte PostgREST-/JWT-/GoTrue-Pfade (insbesondere `delete_account` mit echter Passwortanmeldung, Verhalten der Wrapper als RPC).
2. Ob `rwi` in der Data API exponiert ist (Dashboard-Einstellung).
3. `app_metadata`-Reihenfolge bei `admin.createUser` (S-A).
4. Benachrichtigung bei stuck (nur Datensatz).
5. Betreiberidentität bei Wiederaufnahme ist ein freier Text; Hotfix-Weg ohne eigene Freigabeprüfung.
6. `service_role`-Schlüssel ist weiterhin allmächtig auf `public`.
7. F5 (`derive-profile`) fehlt: Ohne serverseitige Ableitung der Spielerprofile aus `public.characters` kann kein echter Spieler beitreten; die Kontokennung hängt an `rwi.account_of`, nicht an `rwi.players`.
8. F9 (nachträglich gesperrter Platz-3-Charakter bleibt aktives Mitglied) weiterhin offen.
9. Ratenbegrenzung und Aufruf-Authentisierung der Edge Function nicht gebaut.

## 1. Was untersucht wurde

- Tatsächliche SQL-Dateiliste (`git ls-files`): `supabase/schema.sql`, `server/instance/sql/01_proto … 05_produktion.sql`, Migrationsskripte `migration_d3`/`rollback_d3` (nur Produktion), Testskripte unter `supabase/tests/`. Es gibt keine CLI-Migrationen und kein `config.toml`.
- Kombinierte Installation `schema.sql` → `01` → `02` → `03` → `04` → `05` unter Dev-ähnlichen Bedingungen (Default-ACLs in `public`, pgcrypto im Schema `extensions`, API-Rollen ohne `search_path`-Eintrag).
- Rechte aus dem Systemkatalog für `anon`, `authenticated`, `service_role`; RLS; SECURITY DEFINER; `search_path`; Trigger; Default-ACLs.
- Konto → Charakter → Instanz (Registrierung, Slots, Löschen, gesperrter Slot 3, Fremdzugriff).
- Installation, zweiter Versuch, Rollback, Neuinstallation.
- Worker-/Watchdog-Lücke (Architekturentscheidung: `docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md`).

## 2. Gefundene Fehler und Lücken

| # | Schwere | Befund | Stand |
|---|---|---|---|
| F1 | hoch | `claim_resolution` rief `digest()` unqualifiziert auf. Auf Dev liegt pgcrypto in `extensions`; `anon`/`authenticated`/`service_role` haben dort keinen `search_path`-Eintrag. Lokal im Dev-Nachbau reproduziert: `function digest(text, unknown) does not exist`. Ein Installationskonto ohne `extensions` im Pfad scheiterte außerdem am `seed`-Standardwert (`gen_random_bytes`) | **behoben** |
| F2 | hoch | Löschen eines Charakters oder Kontos ließ in laufenden Instanzen ein aktives Mitglied ohne Charakter und das Profil in `rwi.players` zurück (kein Fremdschlüssel zwischen den Schemas) | **behoben**; im Folgeauftrag zweistufig mit Deadlock-Schutz gehärtet (Abschnitt 0.2) |
| F3 | mittel | Eine Ausnahme der Engine im Worker erhöhte `attempts` nie: Die Runde wurde nach jedem Lease-Ablauf endlos und unbemerkt wiederholt (nie `stuck`, nie ein Alarm), obwohl V2 A.5 das vorsieht | **behoben** (`rwi.report_failure`); im Folgeauftrag weiter gehärtet (Abschnitt 0.5) |
| F4 | mittel | `rwi` ist nicht über die Data API erreichbar (gewollt). Eine Edge Function kann `rwi.claim_resolution` damit nicht per RPC rufen | **entschieden: A1**, Wrapper umgesetzt (Abschnitt 0.4); Edge Function selbst nicht gebaut |
| F5 | mittel | `rwi.players` hat keine serverseitige Ableitung aus `public.characters` (`derive-profile` fehlt). Grundklasse/Pfad lassen sich aus `characters.character_class` nicht bilden, `character_data` stammt vom Client. Ohne das kann kein echter Spieler beitreten | **offen** |
| F6 | niedrig | Durch die Dev-Default-ACLs behält `service_role` EXECUTE auf 9 interne `public`-Funktionen (`has_entitlement`, `is_verified`, `safe_class`, `safe_level` und 5 Triggerfunktionen) sowie auf die Client-Funktionen (liefern ohne Nutzer-Token nur `not_authenticated`). Praktisch unerheblich, weil `service_role` ohnehin BYPASSRLS und Tabellenrechte hat; `purge_account_backups` ist ausdrücklich entzogen | **dokumentiert**, `schema.sql` bewusst unverändert |
| F7 | niedrig | `handle_new_user` lässt jede Registrierung ohne gültigen `username` scheitern, auch Dashboard-/Admin-/Support-Konten (siehe Abschnitt 4) | **dokumentiert** |
| F8 | Regelfrage | Zwei Charaktere desselben Kontos konnten in derselben Instanz Mitglied sein | **behoben** durch den Beschluss „ein Account, ein Charakter je Instanz“ (Abschnitt 0.3) |
| F9 | Regelfrage | Ein nachträglich gesperrter Platz-3-Charakter (Rückerstattung) bleibt aktives Mitglied, kann aber nicht mehr handeln (`forbidden`), bis ihn der Server per Verbindungsabbruch entfernt | **offen**, nichts geändert |
| F10 | niedrig | Der Kommentar in `schema.sql` („seit 2026 keine Standardrechte“) trifft auf das Dev-Projekt nicht zu (es hat Default-ACLs). Verhalten der Datei ist in beiden Modi korrekt und getestet | **dokumentiert** |

## 3. Behobene Fehler und geänderte Dateien

Behoben in `server/instance/sql/`:
- `01_proto.sql`, `03_windows.sql`, `04_gruppe.sql`: `digest(...)` → `sha256(convert_to(..., 'UTF8'))` (PostgreSQL-Kernfunktion); `seed` aus `gen_random_uuid()` + `sha256`; `create extension pgcrypto` entfernt. Ergebnis gleich (SHA-256), Instanz-Skripte brauchen keine Erweiterung mehr.
- `05_produktion.sql`: Trigger `characters_rwi_cleanup` (AFTER DELETE auf `public.characters`) ruft die **bestehende** Funktion `rwi.leave` (freiwilliger Austritt, keine neue Regel) und entfernt das Profil. Löschen scheitert nie am Spielstand; Fehler landen in `rwi.ops_alerts`. Die zweite SECURITY-DEFINER-Funktion `rwi.on_character_deleted` ist klassifiziert und im Test exakt benannt.
- `04_gruppe.sql` + `05_produktion.sql`: `rwi.report_failure` (nur mit Token der aktuellen Lease, Wartezeit 5/10/20/40/60 s, ab `max_attempts` `stuck` + Alarm + `engine_stuck`), als Serverfunktion klassifiziert.

Neu: `supabase/dev/{00_preflight.sql, build.sh, rollback_dev.sql, cleanup_test_accounts.sql}`, `server/instance/worker/core.mjs`, die Tests `dev-umgebung`, `konto-integration`, `rechte-audit`, `installation`, `worker`, `tests/run-all-db.sh`, `docs/INSTANZKAMPF_WORKER_ARCHITEKTUR.md`. Geändert: `.github/workflows/instance-tests.yml` (PG 16 und 17, Artefakte), `tests/pg.mjs` und `supabase/tests/run.sh` (`PG_MAJOR`), `tests/run.mjs` (pgcrypto nur für die HMAC-Querprüfung), `tests/produktion.mjs` (Menge der SECURITY-DEFINER-Funktionen in `rwi` ist jetzt genau `{own_character, on_character_deleted}`; nichts gelockert, die Zahl der Prüfungen ist gleich geblieben: 222).

## 4. `handle_new_user`: Bewertung und Lösungsvorschlag

Heutiges Verhalten (getestet): ohne gültigen `username` in `raw_user_meta_data` bricht der Insert in `auth.users` ab; es bleibt kein Konto ohne Profil zurück. Das gilt unabhängig von der Quelle. Folgen: Konten über Dashboard, Admin-API oder für Support lassen sich nur mit `user_metadata.username` anlegen; anonyme Anmeldungen und OAuth ohne Namen scheitern; GoTrue meldet allgemein „Database error saving new user“.

| Lösung | Vorteil | Nachteil |
|---|---|---|
| **S-A (empfohlen):** Marker in `raw_app_meta_data` (z. B. `rw_staff=true`), den nur die Admin-API setzen kann, nicht eine Registrierung; der Trigger erzeugt dann einen Namen `staff_<8 hex>` | Support-Konten möglich, Regel „kein Konto ohne Namen“ bleibt für Spieler vollständig | Eine Änderung an `schema.sql` (und damit der Produktion), Admin-Prozess nötig |
| S-B: bei fehlendem Namen `Spieler_<hex>` vergeben | nichts scheitert | hebt die beschlossene Regel auf, Namensbelegung nicht mehr bewusst |
| S-C: Support-Konten über `user_metadata.username` anlegen (heute) | keine Änderung | jedes Support-Konto braucht einen gültigen, freien Spielernamen |

Nichts davon wurde geändert. Der Test hält das heutige Verhalten als „bekannte Einschränkung“ fest.

## 5. Ausgeführte Tests und exakte Ergebnisse

Lokal (PostgreSQL 16.15, Node 22.23.4) und in GitHub Actions (CI-Lauf auf Commit `a35108a`, Job `database (16)` = PostgreSQL 16.16, Job `database (17)` = **PostgreSQL 17.12**, dieselbe Nebenversion wie Dev). Identische Ergebnisse:

| Test | Prüfungen | | Test | Prüfungen |
|---|---|---|---|---|
| run (Phase 0) | 43 | | rechte-audit (neu) | 29 |
| fenster | 39 | | installation (neu) | 29 |
| gruppe | 157 | | worker (neu) | 25 |
| eventende | 32 | | dev-umgebung (neu) | 22 |
| semantik | 27 | | konto-integration (neu) | 59 |
| produktion | 222 | | supabase/tests/run.sh | 245 je Modus (neu/legacy) |

Dazu Dungeon-Läufe (Seeds 3, 4, 5, Weltboss-Ende) und K.2-Vergleich ohne Probleme; Determinismus Node/Bun/Deno und Engine-Tests (golden, combat, struktur, trennung, offen) grün; `npm test` grün. Beide PostgreSQL-Versionen erzeugen **dieselbe Installationsdatei** (`install_dev.sql`, 1639 Zeilen, sha256 `18003f28802612d6…`) und dieselben Testzahlen (Job `vergleich-pg16-pg17`). Protokolle liegen als Artefakte im CI-Lauf (`db-tests-pg16`, `db-tests-pg17`).

Mutationsprüfung der neuen Tests: Ohne den Löschtrigger scheitern 5 Prüfungen von `konto-integration`; ohne das REVOKE der Wrapper scheitern 3 Prüfungen von `rechte-audit`; die ursprüngliche Reproduktion von F1 und F3 war ein Rot-vor-Grün-Test.

## 6. Echte Integrationstests und reine Simulation

**Echt (echtes PostgreSQL 16 und 17):** Installation aller SQL-Dateien, Rollen `anon`/`authenticated`/`service_role` mit `SET ROLE`, Rechte aus dem Systemkatalog, RLS, Trigger, SECURITY DEFINER, `search_path`-Verhalten, Transaktionen, Rollback, Sperren und Parallelität, die Auftragskette `claim` → Engine → `commit`.

**Simulation (nicht belastbar für echtes Supabase):**
- `auth.users`, `auth.sessions`, `auth.mfa_amr_claims`, `auth.uid()`, `auth.jwt()` sind die Attrappe `supabase/tests/00_stub.sql`. Ob GoTrue für eine Passwortanmeldung wirklich eine `password`-Zeile in `auth.mfa_amr_claims` mit passender `session_id` im JWT schreibt, ist **nicht belegt**. Von dieser Annahme hängt `delete_account` ab.
- JWT-Claims werden per `SET request.jwt.claims` gesetzt; PostgREST ist nicht beteiligt. **Keine echten REST-, RPC-, JWT- oder GoTrue-Tests wurden ausgeführt.**
- Die Default-ACLs und der `search_path` von Dev sind nachgebaut, nicht übernommen.

## 7. Prüfliste für das echte Dev-Projekt

| Punkt | Stand |
|---|---|
| Postgres 17.12; `service_role` BYPASSRLS, `anon`/`authenticated` nicht; `authenticator` ohne BYPASSRLS | **Dev-Katalog** |
| Default-ACLs in `public` (3 Einträge: Tabellen, Funktionen, Sequenzen für `anon`/`authenticated`/`service_role`) | **Dev-Katalog** |
| `public` leer, kein Trigger auf `auth.users`, keine Cron-Jobs, ein Vault-Secret-Name (Wert nicht gelesen) | **Dev-Katalog** |
| pgcrypto liegt in `extensions`; `postgres` hat `extensions` im `search_path`, API-Rollen nicht | **Dev-Katalog** |
| `postgres` hat auf `auth.users` TRIGGER/REFERENCES/DELETE, SELECT auf `auth.sessions`/`mfa_amr_claims`; Spalten von `delete_account` vorhanden | **Dev-Katalog** |
| Preflight lehnt nicht leeres `public`, vorhandenes `rwi`, fehlende Rollen ab | lokal (Preflight selbst auf Dev nicht ausgeführt) |
| Rechtemengen für `anon`/`authenticated`/`service_role`, RLS auf allen Tabellen, feste `search_path` bei SECURITY DEFINER, keine PUBLIC-Ausführung | **lokal nachgewiesen** (Dev-ähnlich); auf Dev nach Installation **offen** |
| Installation erzeugt keine neuen Default-ACL-Einträge | lokal (Anzahl 3 → 3); auf Dev **offen** |
| `rwi` über die Data API nicht erreichbar | **offen** (steht nicht in der Datenbank; Dashboard „Data API / Exposed schemas“ prüfen, danach echte Anfrage mit `Accept-Profile: rwi`) |
| `anon`/`authenticated` über REST/RPC auf interne Funktionen, fremde Charaktere | **offen** (nur als `SET ROLE` lokal gezeigt) |
| `delete_account` mit echter GoTrue-Sitzung | **offen** |
| `extensions.digest`/`gen_random_bytes`: nach F1-Korrektur nicht mehr benötigt | lokal nachgewiesen |
| `search_path`-Manipulation: alle SECURITY-DEFINER-Funktionen mit festem Pfad, `pg_temp` zuletzt | lokal; statische Heuristik für unqualifizierte rwi-Tabellen sauber (kein Parser-Beweis) |
| Zustelllatenz `pg_net`, Edge-Function-Laufzeit, Cron-Takt im Tarif, Commit-Latenz auf Dev (`track_commit_timestamp` ist aus) | **offen** |

## 8. Offene Risiken

1. Echte GoTrue-/PostgREST-Pfade ungetestet (Abschnitt 6).
2. Worker-Pfad: Datenbankseite (A1-Wrapper, stuck, Wiederaufnahme) gebaut und lokal getestet; Cron, `pg_net`, Edge Function und `dispatch_due` nicht gebaut. Ohne sie läuft im Betrieb keine Runde.
3. `derive-profile` fehlt (F5).
4. F9 ist eine Regelfrage, keine Technikfrage (F8 ist entschieden).
5. Die CI deckt PG 16/17 ab, nicht die Supabase-eigenen Patches (`supautils`, Event-Trigger `pgrst_ddl_watch` u. a.).
6. `service_role` bleibt allmächtig auf `public`; der Service-Role-Key ist das wertvollste Secret.
7. Commit-Latenz: keine Commit-vor-Deadline-Garantie, wie beschlossen; auf Dev nicht gemessen.

## 9. Empfohlene Installationsreihenfolge

`supabase/dev/build.sh` erzeugt eine Datei mit dieser Reihenfolge; Ausführung in **einer** Transaktion:
`00_preflight` → `supabase/schema.sql` → `01_proto` → `02_actions` → `03_windows` → `04_gruppe` → `05_produktion`.
`05` braucht `public.characters` und `auth.uid()` und läuft nicht in einer reinen Prototyp-Datenbank. Ein zweiter Versuch bricht im Preflight mit „bereits installiert“ ab, ohne etwas zu verändern (getestet). Rollback: `rollback_dev.sql` mit `set rw.rollback_confirm = 'ja-loeschen'`; verbleibt: Testkonten in `auth.users` (separat `cleanup_test_accounts.sql`, nur `@rwtest.invalid`), Erweiterungen, Vault, Cron, Edge Functions, Migrationshistorie.

## 10. Nächste Schritte für die echte Dev-Installation (nach deiner Freigabe)

1. Diesen Branch prüfen und über PR nach `main` bringen (oder die Installationsdatei aus dem CI-Artefakt nehmen).
2. Preflight (nur lesend) auf Dev ausführen.
3. Installationsdatei als **eine** Migration auf Dev einspielen.
4. Sofort aus dem Katalog prüfen: Rechtemengen, RLS, Default-ACL-Zahl, `rwi`-Sichtbarkeit; Supabase-Advisors.
5. Testkonten mit `username`, bestätigter E-Mail und Domain `@rwtest.invalid` über die Auth-API anlegen (Passwörter nur lokal).
6. Echte REST/RPC-/JWT-Tests und `delete_account` mit echter Passwortanmeldung (Ort der Ausführung klären: meine Shell erreicht Dev nicht).
7. Danach erst Worker-Pfad (Entscheidungen aus der Architekturdatei) und `derive-profile`.

## 11. Was ausdrücklich deine Freigabe braucht

- Jede Ausführung auf Dev (Preflight, Installation, Tests, Rollback, Bereinigung des Vault-Überbleibsels `rwprobe_secret`).
- Merge in `main`.
- Änderung an `supabase/schema.sql` (S-A für `handle_new_user`, Härtung F6, Kommentar F10): betrifft die Produktion.
- Entschieden (Folgeauftrag): F8, A1, Alarmierung bei stuck, keine automatische Wiederholung. Offen: F9, strenge Zählung der Account-Regel, Hotfix-Weg bei stuck, Verhalten bei Fehler in der Löschbereinigung (Abschnitt 0.2), Zustellung des Alarms.
- Bau von `dispatch_due`, Cron-Job, Edge Function, Secrets, Deployment.
