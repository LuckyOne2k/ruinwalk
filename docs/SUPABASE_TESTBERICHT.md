# Supabase – Testbericht Phase 2 (Datenbank, vor Registrierung/Login)

Stand: 13.11.2026 · Projekt „ruinwalk“ (Frankfurt, eu-central-1, Postgres 17) · Frontend: **noch nicht** angebunden.

## Ablauf
1. Projekt vorher leer (0 Tabellen, 0 Konten, 0 Trigger). Schema per Migration `ruinwalk_schema_phase1` eingespielt.
2. Editor-Test (`editor_test.sql`) im echten Projekt: 163 von 168 grün. Die 5 Fehlschläge waren ein Testfehler (in `auth.users` hat `id` keinen Standardwert, der Test gab keine ID mit; die lokale Attrappe hatte einen). Nach Korrektur der 5 Tests: **alle bestanden** (169 Ergebnisse inkl. einer Zusatzprüfung). Aufgeräumt.
3. Advisor (Sicherheit): nur erwartete Hinweise – 3× „RLS ohne Policy“ (`audit_log`, `character_backups`, `payment_events`, bewusst: Clients haben dort keinen Zugriff) und 8× „SECURITY DEFINER aufrufbar“ für die 7 beabsichtigten Spieler-Funktionen (`username_available` auch anonym, gewollt, prüft nur Format/Vergabe).
4. Advisor (Performance): `auth.uid()` in den 3 Lese-Policies wird jetzt als `(select auth.uid())` einmal je Abfrage ausgewertet; Indizes auf `character_backups(account_id)` und `payment_events(account_id)` ergänzt (Migration `ruinwalk_perf_fixes`).
5. **Live-RLS-Prüfung** (`supabase/tests/live_rls_test.sql`) nach den Policy-Änderungen mit zwei echten Testkonten über die Rollen `authenticated`: **31 von 31 bestanden**, danach aufgeräumt (0 Konten, 0 Charaktere).

## Live-RLS-Prüfung – abgedeckt
A/B sehen nur eigene Charaktere, Profile, Berechtigungen · kein direktes UPDATE/DELETE · fremde Charaktere lassen sich weder speichern noch löschen noch verschieben (alle Daten danach unverändert) · Rückerstattung: Platz 3 nicht lesbar, als gesperrt markiert, nicht speicherbar, Spielstand bleibt · Verschieben scheitert bei belegtem Ziel · erneute Freischaltung: wieder lesbar und speicherbar · Verschieben auf freien Platz im eigenen Konto, Spielstand erhalten, Audit-Log und Löschsicherung vorhanden.

## Übereinstimmung Dateien ↔ Supabase
`supabase/tests/fingerprint.sql` bildet Fingerabdrücke (Funktionen ohne Kommentare, Policies, Indizes, Trigger, Spalten, Constraints, RLS, Tabellenrechte, Funktionsrechte). Lokal (`schema.sql`) und im Projekt verglichen: **alle Struktur-Fingerabdrücke identisch**. Einziger Unterschied: In Supabase hat `service_role` standardmäßig EXECUTE auf den Funktionen (Supabase-Voreinstellung); die lokale Attrappe vergibt das nicht. `anon`/`authenticated` sind identisch, `service_role` ist rein serverseitig – kein Sicherheitsproblem.

## Lokale Tests nach der Änderung
- SQL-Suite lokal: 168/168 in beiden Modi (neue und ältere Projekte); Attrappe jetzt ohne ID-Standardwert (wie echtes Supabase).
- Editor-Variante lokal: 168/168.
- Spieltests: 95/95.

## Noch offen (vor/mit Phase 2 Frontend)
Dashboard-Einstellungen (E-Mail-Bestätigung an, anonyme Anmeldung aus, Passwort min. 8, Site-URL/Redirects), eigener SMTP-Versand (eingebauter nur 2 Mails/h), CAPTCHA/Rate-Limits, Aufräumjob für unbestätigte Konten.
