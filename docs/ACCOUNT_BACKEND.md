# Ruinwalk – Accountsystem: Phase 1 (Architektur und Datenmodell)

Grundlage: Produktspezifikation „Accountsystem, Charakterauswahl und Charakterplätze". Gewähltes Backend: **Supabase** (Auth + Postgres + Row Level Security).

## Architektur
- **Frontend:** bleibt `index.html` auf GitHub Pages. Es spricht nur mit der Supabase-API (öffentlicher anon-Key ist vorgesehen und unkritisch, Schutz erfolgt über RLS).
- **Auth:** Supabase Auth (E-Mail + Passwort, E-Mail-Verifizierung, Passwort-Reset, Sitzungen, Brute-Force-Schutz, CAPTCHA gegen Massenanmeldung). Passwort-Hashes liegen ausschließlich dort.
- **Datenbank:** `supabase/schema.sql` (profiles, account_entitlements, payment_events, characters, character_backups, audit_log).
- **Zahlung (Phase 5):** Zahlungsanbieter ruft eine Edge Function (Webhook) auf, sie prüft die Signatur und schreibt mit der Service-Role `account_entitlements`. Der Browser kann nie schreiben. `payment_events.provider_event_id` ist Primärschlüssel, dadurch doppelt verarbeitete Webhooks wirkungslos.

## Datenbank-Tests
`bash supabase/tests/run.sh` startet ein temporäres PostgreSQL 16, spielt eine Supabase-Attrappe (Rollen `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`), das Schema und 126 Prüfungen ein. Sie laufen mit echten Rollenwechseln, also unter den tatsächlichen RLS-Regeln. Ob die Tests Fehler finden, wurde per Gegenprobe geprüft: 10 absichtlich eingebaute Lücken (z. B. fehlende Versions- oder Kontoprüfung, zu weite Policy, fehlender `search_path`) wurden alle erkannt.

## Sicherheit (im Schema umgesetzt)
| Anforderung | Umsetzung |
|---|---|
| Server ist maßgeblich | RLS: Clients lesen nur eigene Zeilen; Entitlements/Zahlungen/Backups/Log ohne Client-Schreibrechte |
| Platz 3 nicht manipulierbar | Trigger `guard_slot` prüft aktive Berechtigung beim Insert |
| Kein Überschreiben fremder/anderer Charaktere | Update nur über `save_character` mit `account_id = auth.uid()`; `character_id`, `account_id`, `slot_number` unveränderlich |
| Parallele Änderungen | `version` + `p_expected_version` (Fehler `version_conflict`) |
| Kein leerer/ungültiger Stand | `save_character` verlangt ein JSON-Objekt; Größenlimit per CHECK |
| Serverseitige Backups | Trigger legt vor jedem Update den alten Stand ab (letzte 10 je Charakter) |
| Nachvollziehbarkeit | `audit_log` für Löschen, später Kauf und Migration |

## Charakterdaten
`characters.character_data` enthält den bereinigten Spielstand (`S`, wie `sanitize()` ihn liefert) und `cid` = `character_id`. Spalten `character_name`, `character_class`, `level` sind Kopien für die Auswahlliste. Im Spiel sind dafür bereits vorbereitet: `cid`, `name`, `created`, `played` (Spielzeit in s), `lp` (letzte Aktivität).

## Stand im Spiel (lokal, ohne Server)
- 3 Charakterplätze, 2 frei, Platz 3 gesperrt (`ENT.third_character_slot` ist nur Platzhalter, später Serverwert).
- Platz 1 nutzt den bisherigen Speicherschlüssel `ruinwalk_v1` (bestehende Spielstände bleiben ohne Migration erhalten), Platz 2/3 `ruinwalk_v1_s2` / `_s3`. Eigene Backup-/Corrupt-Kopien je Platz.
- Wechsel = Speichern + Neuladen, damit sich Zustände nie vermischen.
- Anlegen überschreibt nie einen belegten Platz, Löschen betrifft nur die Schlüssel des Platzes und braucht eine zweite Bestätigung.

## Nächste Schritte
1. Supabase-Projekt anlegen, `schema.sql` einspielen und gegen RLS testen (z. B. zwei Testaccounts).
2. Phase 2: Registrierung, Login, Passwort-Reset im Frontend.
3. Phase 3/4: lokalen Speicher hinter eine Schnittstelle (`load(slot)` / `save(slot, version)`) legen, Cloud-Speicherung und Migration des lokalen Platzes 1 einbauen (lokale Kopie bleibt als Sicherheitskopie).

## Sicherheitsprüfung des Schemas (Ergebnis)
Behoben gegenüber dem ersten Entwurf:
- `save_character` war `SECURITY INVOKER` ohne UPDATE-Policy und hätte nie funktioniert; jetzt `SECURITY DEFINER` mit fester `account_id = auth.uid()`-Bedingung in jeder Anweisung. Clients haben auf Tabellen nur SELECT, keine Schreibrechte und keine schreibenden Policies.
- Anlegen nur noch über `create_character` (kein direktes INSERT): Client kann weder ID, Version noch Zeitstempel setzen. Klasse und Level werden aus den Daten abgeleitet und begrenzt, `cid` in den Daten wird serverseitig überschrieben.
- Fehlermeldung bei fremdem oder unbekanntem Charakter ist identisch (`version_conflict`) und verrät nichts über fremde IDs.
- `has_entitlement` war über RPC aufrufbar (Abfrage fremder Käufe); jetzt nur intern.
- Alle SECURITY-DEFINER-Funktionen: fester `search_path`, `EXECUTE` für PUBLIC entzogen, nur gezielte Freigaben.
- Profil wird per Trigger bei der Registrierung angelegt (Benutzername aus den Registrierungsdaten, Format und Eindeutigkeit geprüft). Nachträgliche Änderungen der Nutzer-Metadaten wirken nicht auf das Profil; Umbenennen ist für Clients unmöglich (kein Recht, keine Policy, zusätzlich Trigger).
- Spielen/Speichern erst mit bestätigter E-Mail (Spezifikation 2.1).
- Sicherungen: auch beim Löschen eines Charakters, bleiben danach erhalten; beim Löschen des Kontos werden sie mitgelöscht.

Bekannte Grenzen und Hinweise:
- **Wegwerf-Registrierungen:** Unbestätigte Konten halten ihren Benutzernamen. Dafür später einen Aufräum-Job (z. B. nach 24 h ohne Bestätigung) einplanen.
- **Namensabfrage:** `username_available` ist anonym aufrufbar (nötig für die Registrierung) und erlaubt das Durchprobieren von Namen. Rate-Limit über Supabase/Edge Function setzen.
- **Speicherfrequenz:** Jedes Speichern legt den alten Stand (bis 1 MB) als Backup ab. Der Client sollte nicht alle 5 s, sondern gebündelt (z. B. bei Änderungen, höchstens alle 30–60 s) speichern; ein serverseitiges Rate-Limit fehlt noch.
- **Rückerstattung:** Ein bereits angelegter Charakter auf Platz 3 bleibt nach Rückerstattung bestehen und speicherbar, nur das Neuanlegen wird gesperrt. Falls anders gewünscht, ist das eine Produktentscheidung.
- **Supabase-Besonderheiten:** Der Trigger auf `auth.users` muss im SQL-Editor als `postgres` angelegt werden. Neue Funktionen in `public` erhalten standardmäßig EXECUTE für PUBLIC; nach jeder Erweiterung das `revoke ... from public` aus dem Schema wiederholen (Test „Angemeldete Nutzer dürfen nur die vorgesehenen Funktionen aufrufen" fängt das ab).
- **Nicht getestet:** Das echte Supabase (GoTrue, PostgREST, Edge Functions). Die Tests laufen gegen PostgreSQL mit Attrappe; vor dem Produktivstart ein Durchlauf mit zwei echten Testkonten.
