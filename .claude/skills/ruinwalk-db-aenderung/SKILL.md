---
name: ruinwalk-db-aenderung
description: Verbindlicher Ablauf für jede Datenbank- oder RLS-Änderung bei Ruin Walk (Supabase/PostgreSQL) – Migration, Rollback, schema.sql, Rechte, Tests in beiden Rechte-Modi, Prüfbericht, Freigabe vor Live-Einspielung. Nutzen bei neuen Tabellen, Spalten, Funktionen, Policies, Triggern oder Rechten.
---

# Datenbankänderung – Ablauf

Ergänzend: `supabase-postgres-best-practices` (allgemeine Regeln) und `supabase` (Plattform-Fallen). Diese Datei regelt, **wie es in Ruin Walk gemacht wird**.

## Harte Regeln
- **Kein Schreibzugriff auf das Live-Projekt** (`malbiahllucctiafzydv`) ohne ausdrücklichen Auftrag von Pascal in dieser Sitzung. Das betrifft `apply_migration`, `execute_sql` mit DDL/DML, Edge Functions, Branches. Lesen (Tabellen, Advisors, Logs) ist erlaubt.
- **Dev-Projekt `ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`)**: lesende Prüfungen erlaubt. Installation/Rollback/Cleanup nur mit Freigabe und nur über die Skripte in `supabase/dev/` (Zweig `nacht/operator-edge-function`): `install_dev.sh <sha256>` mit Direktverbindung oder Session-Pooler (Port 5432), Rollback mit `psql -X -v ON_ERROR_STOP=1`, ohne `-1`. Vorher Projektwissen `references/supabase-integration.md` lesen.
- Echte Spielerkonten existieren: Live-Prüfungen nur mit Testkonten; nie Daten echter Konten lesen, ändern oder exportieren.
- Erst lokal testen (temporäres Postgres mit Attrappe), dann berichten, dann auf Freigabe live.

## Schritte
1. **Verstehen:** `supabase/schema.sql` und betroffene RPCs lesen; Skill `ruinwalk-projektwissen` → `references/datenbank.md`.
2. **Entwurf** im Muster des Projekts:
   - RLS aktiv, Clients höchstens SELECT mit `(select auth.uid())`-Policy; Schreiben nur per `SECURITY DEFINER`-Funktion mit `set search_path = public, pg_temp` und `auth.uid()`-Prüfung in jeder Anweisung.
   - Nach jeder neuen Funktion: `revoke all on function … from public, anon, authenticated;` dann gezielt `grant execute … to authenticated`.
   - Fehlermeldungen dürfen nicht verraten, ob fremde IDs existieren.
   - Fremdschlüssel bekommen einen Index. Konto-Löschkaskade bedenken (Datenschutz D2/D3).
   - Instanzkampf (`rwi`): zusätzlich Rechteklasse in `server/instance/sql/05_produktion.sql`.
3. **Dateien:** `supabase/migration_<kürzel>_<thema>.sql`, `supabase/rollback_<kürzel>_<thema>.sql`, `supabase/schema.sql` auf Endstand bringen (idempotent einspielbar).
4. **Tests:** neue Fälle in `supabase/tests/10_tests.sql` (positiv **und** negativ: fremdes Konto, anon, gesperrter Platz 3). Ausführen: `bash supabase/tests/run.sh` (prüft beide Modi „neu“/„legacy“). Bei Clientbezug zusätzlich `npm test`. Mutationsprobe: einen Schutz absichtlich entfernen → Test muss rot werden.
5. **Advisors** (falls Live-Lesezugriff vorhanden): MCP `get_advisors` (security + performance) lesen und Befunde bewerten.
6. **Prüfbericht** in `docs/` (Vorbild `D3_PRUEFBERICHT.md`): was geändert, warum, Tests, Risiken, Rollback, was nicht live geprüft.
7. **Freigabe einholen:** Pascal die Migration + Bericht vorlegen. Erst nach „Ja, live einspielen“ anwenden, danach Live-Prüfung mit Testkonto und Ergebnis im Bericht nachtragen.

## Typische Fallen (aus dem Projekt)
- Seit 2026 keine automatischen Tabellenrechte (Data API opt-in) – Rechte ausdrücklich vergeben.
- UPDATE braucht eine SELECT-Policy; Clients haben aber bewusst keine Schreib-Policies.
- Views umgehen RLS → `security_invoker = true` oder nicht exponieren.
- `now()` = Transaktionsbeginn; für Fristen nach Sperre `clock_timestamp()`.
- Trigger auf `auth.users` nur als `postgres` im SQL-Editor anlegbar.
