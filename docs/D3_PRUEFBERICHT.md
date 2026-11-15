# D3 – Prüfbericht Kontolöschung (Live-Projekt)

Datum: 15.11.2026 · Projekt: Ruin Walk (Supabase `malbiahllucctiafzydv`) · Repo-Stand der Vorbereitung: Commit `88fcbeb`

## 1. Ergebnis in Kürze
- Migration `d3_konto_loeschen` ist **live eingespielt** (Funktionen, Rechte, Fremdschlüssel wie geplant).
- Echter Passwort-Login erzeugt in `auth.mfa_amr_claims` eine Zeile `password`; die `session_id` im JWT entspricht dieser Sitzung.
- Eine erfolgreiche Löschung mit **Wegwerfkonto 1** hat die gesamte Kaskade und die Anonymisierung der Zahlungsdaten belegt.
- Fünf negative Tests mit **Wegwerfkonto 2** bestanden (mit der unten genannten Einschränkung bei T4).
- Das echte Konto (`lucky1`) blieb in allen Schritten unverändert.
- Offen: Wegwerfkonto 2 und das Zahlungsereignis `d3b_test_evt` bestehen noch (siehe 6). `pg_net` ist wieder entfernt.

## 2. Migration
- Eingespielt über den Connector als Migration `d3_konto_loeschen` (ohne äußeres `begin/commit`, der Connector führt sie atomar aus; Inhalt sonst identisch mit `supabase/migration_d3_konto_loeschen.sql`).
- Vorher (Snapshot): 1 Nutzer, 1 Profil, 1 Charakter, 0 Backups, 0 Entitlements, 0 Zahlungsereignisse, 1 Audit-Zeile; `payment_events.account_id` ohne Löschregel; `audit_log` ohne Fremdschlüssel; 0 Audit-Waisen. Prüfsummen der alten `touch_login`/`delete_character` liegen im Verlauf.
- Danach geprüft: `delete_account`, `purge_account_backups`, `purge_expired_backups`, `touch_login`, `delete_character` sind `SECURITY DEFINER`, Eigentümer `postgres`, `search_path=public, pg_temp`. `anon` hat kein Ausführungsrecht auf `delete_account`; `authenticated` hat es. `purge_account_backups` ist für `authenticated` und `service_role` gesperrt. `purge_expired_backups` ist nur für `service_role` ausführbar.
- Hinweis: `service_role` kann `delete_account`, `touch_login`, `delete_character` ausführen (Supabase-Standardrechte). Ohne Nutzer-JWT scheitern sie mit `not_authenticated`; `service_role` umgeht ohnehin die Zugriffsregeln.
- Fremdschlüssel: `payment_events_account_id_fkey` → `ON DELETE SET NULL`; `audit_log_account_id_fkey` → `ON DELETE CASCADE`.
- Migrationen im Projekt jetzt: `ruinwalk_schema_phase1`, `ruinwalk_perf_fixes`, `ruinwalk_s1_backup_thinning`, `d3_konto_loeschen`.
- Rückweg: `supabase/rollback_d3_konto_loeschen.sql` (lokal getestet, nicht angewendet).

## 3. Passwortnachweis (echter Login)
- Die Anmeldung lief gegen den echten Auth-Endpunkt (`/auth/v1/token?grant_type=password`), Status 200.
- JWT-Claims: `amr=[{method: password}]`, `aal1`, `role=authenticated`, `session_id` vorhanden.
- Datenbank: genau 1 Sitzung, 1 AMR-Zeile `password` mit derselben `session_id` wie im JWT.
- Damit sind die in D2 als „ungeprüft“ geführten Punkte belegt: `session_id` im JWT, Lesbarkeit von `auth.sessions`/`auth.mfa_amr_claims` für die Funktion, Löschen aus `auth.users` aus der Funktion.
- Technischer Weg: Die Shell erreicht Supabase nicht, Claude in Chrome war von der Handy-App aus nicht erreichbar. Deshalb wurde auf ausdrückliche Freigabe die Erweiterung `pg_net` **vorübergehend** installiert und für HTTP-Aufrufe aus der Datenbank an den eigenen Projekt-Endpunkt genutzt (siehe 7).

## 4. Erfolgreiche Löschung (Wegwerfkonto 1)
Konto `D3_Wegwerf` (angelegt per SQL mit Passwort-Hash, Anmeldung über echten Login).

| Tabelle | vorher | nachher |
|---|---|---|
| auth.users / identities | 1 / 1 | 0 / 0 |
| auth.sessions / mfa_amr_claims | 1 / 1 | 0 / 0 |
| profiles | 1 | 0 |
| characters | 1 | 0 |
| character_backups | 2 | 0 |
| account_entitlements | 1 | 0 |
| audit_log (Konto) | 4 | 0 |
| payment_events (verknüpft) | 1 | 0 |

- Das Zahlungsereignis `d3_test_evt` blieb ohne Konto erhalten, Inhalt nur `{amount: 499, currency: EUR, redacted: true}`. E-Mail, Name und Kartenfragment sind entfernt.
- Echtes Konto vorher/nachher: 1 Nutzer, 1 Sitzung (`otp`), 1 Profil, 1 Charakter, 0 Backups, 1 Audit-Zeile.

### Abweichung in diesem Lauf (offen dokumentiert)
Die Löschung von Wegwerfkonto 1 war **nicht** als Erfolgsfall an dieser Stelle geplant. Ein Test „alte Sitzung“ sollte mit Token 1 laufen; dessen Alter wurde nicht vorher geprüft und betrug nur 47 s. Der Aufruf mit richtigem Benutzernamen war damit ein gültiger Erfolgsfall. Die Funktion verhielt sich korrekt, die Testreihenfolge nicht wie gefordert. Die danach laufenden Tests 7 und 8 (falscher Name, OTP) trafen ein bereits gelöschtes Konto und zählen nicht. Es erfolgten keine Korrekturen; der Lauf wurde gestoppt und mit Wegwerfkonto 2 wiederholt.

## 5. Negative Tests (Wegwerfkonto 2)
Konto `D3_Wegwerf2`. Vor jedem Test wurden Kontozustand und tatsächlich verwendete Sitzung direkt in der Datenbank geprüft; bei Sitzungstests war der Aufruf an Alter, Methode und gültigen Token gekoppelt. Alle Tests mit **falschem** Benutzernamen, keine erfolgreiche Löschung.

| # | Test | Zustand vor dem Aufruf | Antwort |
|---|---|---|---|
| T1 | kein Bearer (nur Publishable-Key) | Sitzung `password` 7 s | 401, `permission denied` (42501) |
| T2 | Anon-Key als Bearer | Konto vollständig | 401, `permission denied` (42501) |
| T3 | falscher Name, frische Passwort-Sitzung | `password`, 10 s, Token 3589 s gültig | 400, `confirm_mismatch` (22023) |
| T4 | Sitzung mit AMR-Methode `otp`, frisch | `otp`, 23 s, Token 3576 s gültig | 403, `reauth_required` (PT403) |
| T5 | Passwort-Sitzung älter als 2 Minuten | `password`, 151 s, Token 3449 s gültig | 403, `reauth_required` (PT403) |

Nach jedem Test: Konto und alle Daten vollständig (1 Nutzer, 1 Profil, 1 Charakter, 2 Backups, 1 Entitlement, 1 verknüpftes Zahlungsereignis, 4 Audit-Zeilen). Echtes Konto unverändert.

### Einschränkung zu T4 (ausdrücklich)
T4 hat **nur die Datenbankprüfung auf `amr=otp`** getestet. Der Eintrag in `auth.mfa_amr_claims` wurde bei Wegwerfkonto 2 **manuell per SQL** von `password` auf `otp` gesetzt. Es wurde **kein echter OTP-Login** (E-Mail-Code, Magic Link, Wiederherstellung) durchgeführt, weil ohne Service-Key kein Link erzeugt werden kann. Ein echter OTP-Login ist weiter offen und kann in D4 mit einer echten E-Mail-Anmeldung nachgeholt werden.

Weitere Einschränkung: Bei T1/T2 reicht schon das fehlende Ausführungsrecht für `anon`; sie prüfen die Rechtevergabe, nicht die Funktionslogik. Alte Sitzung (T5) und OTP (T4) wurden mit falschem Namen geprüft (Reihenfolge in der Funktion: Anmeldung, Sitzung/Passwort, dann Name), um eine Löschung sicher auszuschließen.

## 6. Noch vorhandene Testdaten (Live-Projekt)
- **Wegwerfkonto 2** (`dddd0000-0000-0000-0000-00000000d3d4`, Benutzername `D3_Wegwerf2`) besteht vollständig: 1 Nutzer, 1 Identity, 3 Sitzungen (Methoden `password`, `password`, `otp`; die `otp`-Zeile ist die manuell gesetzte), 1 Profil, 1 Charakter, 2 Backups, 1 Entitlement, 4 Audit-Zeilen.
- **`d3b_test_evt`** hängt noch an Wegwerfkonto 2 und enthält absichtlich Testpersonendaten (E-Mail, Name, Kartenfragment `4242`). Es wird erst bei der Löschung von Wegwerfkonto 2 anonymisiert.
- **`d3_test_evt`** ist anonymisiert (ohne Konto, nur Betrag und Währung).
- Die abschließende Löschung von Wegwerfkonto 2 ist **nicht freigegeben und nicht ausgeführt**. Sie ist zunächst auch nicht nötig, weil Wegwerfkonto 1 den Kaskadenpfad belegt hat. Aufräumen später (Löschung per echtem Passwort-Login nach Freigabe, oder Entfernen per Dashboard) bleibt eine eigene Entscheidung.

## 7. pg_net
- Vorübergehend installiert, ausschließlich für HTTP-Aufrufe der Prüfung (Login, Funktionsaufrufe) an den eigenen Projekt-Endpunkt; alle Aufrufe betrafen nur die Wegwerfkonten.
- Danach mit `DROP EXTENSION pg_net` **entfernt** und kontrolliert: Erweiterung nicht installiert, Schema `net` nicht vorhanden, keine fremden Schemas, keine zusätzlichen Funktionen/Trigger.
- **Keine erneute Installation** ohne ausdrückliche Freigabe.

## 8. Rückblick auf die Testkonten
Beide Wegwerfkonten wurden per SQL mit bcrypt-Passwort angelegt (Passwort nicht im Repo). Das echte Konto wurde in keinem Schritt verändert.

## 9. Offene Punkte
1. Echter OTP-Login (T4-Nachweis) in D4.
2. Wegwerfkonto 2 und `d3b_test_evt` aufräumen (nach Freigabe).
3. Steuerberater: Aufbewahrung der anonymisierten Zahlungsdaten (Betrag/Währung) bestätigen.
4. D4 (Client: erneute Passwortabfrage, Bestätigung, Export, lokale Daten), D5 (Leaflet lokal), D6 (Rechtstexte als Entwurf), D7 (Abschluss).
