# Supabase-Integration des Instanzkampfs (Stand 18.11.2026)

**Wo:** Zweig `nacht/operator-edge-function` (Kopf `ce29fd0`, lokal weiterbearbeitet). **Nicht auf `main`.** Wer auf `main` arbeitet, sieht diese Dateien nicht; vor Aussagen zum aktuellen Stand `git fetch origin nacht/operator-edge-function` und `git show origin/nacht/operator-edge-function:<pfad>` nutzen.

## Projekte
| Projekt | Ref | Zweck | Regeln |
|---|---|---|---|
| ruinwalk | `malbiahllucctiafzydv` | **Produktion** (echte Konten), PG 17.11 | nur lesen; jede Änderung nur mit Pascals Auftrag |
| ruinwalk-dev | `jlkqktmvqxibqdcobbhf` | Entwicklung, PG 17.12, Kennung `7707768362984748398` | lesen erlaubt; Installation/Rollback/Deploy/DDL nur nach Freigabe, nur über die Skripte |

Read-only-Befund ruinwalk-dev (18.11.2026): public leer, `rwi` fehlt, `auth.users` 0 Zeilen, Realtime ohne Tabellen, Event-Trigger nur NOTIFY/Extension-bezogen, Default-ACLs in public vergeben Rechte an anon/authenticated/service_role (der Kommentar in `schema.sql` „keine Standardrechte“ trifft auf Dev nicht zu), supautils erlaubt `postgres` DROP TRIGGER auf `auth.users`, Probe-Reste `rwprobe` + 1 Vault-Secret + Cron/Net-Extensions. Details: `docs/DEV_INSTALLATIONSFREIGABE.md` (Zweig).

## Bausteine auf dem Zweig
- **Dev-Installation** `supabase/dev/`: `00_preflight.sql` (Zielprüfung Projektreferenz + Datenbankkennung, Leer-/Rechteprüfung), `build.sh` erzeugt `install_dev.sql` (preflight + schema.sql + rwi 01–05 in EINER Transaktion, `lock_timeout` 5 s), `install_dev.sh` (Wrapper: nur ruinwalk-dev, nur Port 5432, SHA-256-Pflicht, bereinigte PG-Umgebung, `psql -X`, Referenz als `set local` nach `begin;`), `rollback_dev.sql` (Manifest mit Fingerabdrücken, ohne CASCADE, atomar), `cleanup_test_accounts.sql`, `real-test.mjs`.
- **Worker** `server/instance/worker/core.mjs` (transportunabhängig, Datenbank ist einzige Wahrheit: Lease/Token/round_version), `a1.mjs` (Schnittstelle A1). Doku: `INSTANZKAMPF_WORKER_ARCHITEKTUR.md`, `WORKER_A1_SCHNITTSTELLE.md`.
- **Edge Function** `supabase/functions/operator/` (Deno, Betreiberwerkzeug, `verify_jwt = true` in `supabase/config.toml`, eigene JWT-Prüfung, MFA-Pflicht, Secret-Key nur serverseitig). **Nicht bereitgestellt.** Doku: `OPERATOREN.md`, `STUCK_ABLAUF.md`.
- **Profilableitung** aus `public.characters` (F5/F9), **Lösch-Trigger** für Konto/Charakter, **stuck**-Ablauf mit Alarm und Wiederaufnahme. Doku: `PROFILABLEITUNG.md`, `LOESCHVORGANG.md`.
- `supabase/config.toml` existiert dort **nur** für die Edge-Function-Einstellungen (kein vollständiges CLI-Projekt, keine Migrationsordner).

## Tests (Zweig)
`bash server/instance/tests/run-all-db.sh` (alle DB-Suites, Protokolle nach `results/`; `PG_MAJOR=17` für PG17). Wichtig: `installation.mjs` (Installation/Rollback/Wrapper, Pooling-Simulation, lock_timeout), `rollback-manifest.mjs`, `rechte-audit.mjs`, `operator-*.mjs`, `worker*.mjs`, `stuck.mjs`, `k2-compare.mjs`. CI prüft PG16 und PG17 (`.github/workflows/instance-tests.yml` auf dem Zweig).

## Offene Punkte (Stand 18.11.2026)
K2-Deadlock (ein Lauf, ungeklärt) · Eindeutigkeit der Datenbankkennung je Projekt unbelegt · DROP TRIGGER per supautils nur konfiguriert, nicht ausgeführt · Rollback/Cleanup ohne Wrapper (Pooler-Hinweis nur im Kommentar) · service_role EXECUTE auf internen public-Funktionen · Probe-Reste auf Dev · Data-API-Schemas (`rwi` darf nicht exponiert sein) nur im Dashboard prüfbar.
