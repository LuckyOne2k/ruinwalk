# Ruinwalk – Accountsystem: Phase 1 (Architektur und Datenmodell)

Grundlage: Produktspezifikation „Accountsystem, Charakterauswahl und Charakterplätze". Gewähltes Backend: **Supabase** (Auth + Postgres + Row Level Security).

## Architektur
- **Frontend:** bleibt `index.html` auf GitHub Pages. Es spricht nur mit der Supabase-API (öffentlicher anon-Key ist vorgesehen und unkritisch, Schutz erfolgt über RLS).
- **Auth:** Supabase Auth (E-Mail + Passwort, E-Mail-Verifizierung, Passwort-Reset, Sitzungen, Brute-Force-Schutz, CAPTCHA gegen Massenanmeldung). Passwort-Hashes liegen ausschließlich dort.
- **Datenbank:** `supabase/schema.sql` (profiles, account_entitlements, payment_events, characters, character_backups, audit_log).
- **Zahlung (Phase 5):** Zahlungsanbieter ruft eine Edge Function (Webhook) auf, sie prüft die Signatur und schreibt mit der Service-Role `account_entitlements`. Der Browser kann nie schreiben. `payment_events.provider_event_id` ist Primärschlüssel, dadurch doppelt verarbeitete Webhooks wirkungslos.

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
