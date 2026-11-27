---
name: ruinwalk-tests
description: Alle Test-Suites von Ruin Walk mit Befehlen, Voraussetzungen, CI-Zuordnung und Prüfmethode (Mutationsprobe). Nutzen, um Änderungen zu verifizieren, Regressionen zu finden, neue Tests zu schreiben oder CI-Fehler zu analysieren.
---

# Tests bei Ruin Walk

## Suites

| Suite | Befehl | Prüft | Voraussetzung |
|---|---|---|---|
| Spiel (Browser) | `npm test` | `index.html` in Chromium: Spielstand, Ausrüstung, Crafting, Kampf, Welt, GPS, UI-Tippgrößen, Konto, Cloud-Sync, Kontolöschung (20 Dateien `tests/cases/*.js`, >200 Tests) | Playwright (vorinstalliert; `npm install` holt das Paket), Chromium |
| Supabase-Schema | `bash supabase/tests/run.sh` | RLS, RPCs, Rechte in Modus „neu“ und „legacy“ | PostgreSQL-Binaries + pgcrypto |
| Instanzkampf Engine | `node server/instance/tests/{golden,combat,struktur,trennung,offen}.mjs` | Referenzkämpfe, Kernregeln, Klassenstruktur, Trennung Legacy | Node 22 |
| Instanzkampf DB | `node server/instance/tests/{run,fenster,gruppe,eventende,semantik,produktion}.mjs` | Claim/Commit/Lease, Fristen, Gruppen, Eventende, Rollenrechte | PostgreSQL-Binaries |
| Determinismus | `bash server/instance/tests/run-determinism.sh` | gleiches Ergebnis Node/Bun/Deno | lokal: `REQUIRE_RUNTIMES=node` |
| Quest-Sperren (Q1) | `node server/instance/tests/quest-sperren.mjs` | QS-1–QS-9 Sperrfolge der Quest-RPCs gegen Löschen/Speichern, Rotation, Mischlast; QS-10 Migration/Rollback Q1 = `schema.sql`; QS-11/QS-12 `lock_timeout` in Migration/Rollback | PostgreSQL 16/17 |
| Alle DB-Suites | `bash server/instance/tests/run-all-db.sh` (`PG_MAJOR=17` für PG17) | Installation/Rollback, Rechte-Audit, Konto/Löschung, B-2- und Quest-Sperren, Worker, Operator, stuck, k2 | PostgreSQL 16/17 |
| Dungeon-Simulation | `node server/instance/sim/run-dungeon.mjs --seed 3 --ruhig` | komplette Auftragskette | PostgreSQL |

Die Instanzkampf-Befehle stehen vollständig im Skill `ruinwalk-instanzkampf`.

## Testtechnik im Spiel
- `tests/harness.js` startet einen lokalen Server und Chromium, `tests/leaflet-stub.js` ersetzt die Karte, `tests/fake_supabase.js` ist die Supabase-Attrappe.
- Zugriff auf Spielinterna nur über `window.__RW` (existiert nur mit `window.__RW_TEST=true`).
- Neue Testdatei: `tests/cases/<thema>.js` nach Vorbild einer bestehenden; `tests/run.js` lädt alle.

## CI
- `.github/workflows/spieltests.yml` – Baustein (`workflow_call`, nur Leserechte), läuft nie allein: Job `browser` (`npm test`, Playwright/Chromium) und Job `positivliste` (`node --test tests/pages/site.test.mjs tests/pages/workflows.test.mjs`, `node tools/pages/site.mjs pruefen`). Auf GitHub heißen die Prüfungen `spieltests / browser` und `spieltests / positivliste`.
- `.github/workflows/instance-tests.yml` – Push mit Pfadfilter (u. a. `index.html`, `tests/**`, `server/instance/**`, `supabase/…`, alle Workflows), Pull Requests ohne Filter. Jobs: `determinism`, `database`, `database-pg17`, `spieltests` (Baustein), `pages-positivliste` und `bestehende-tests`.
  - `pages-positivliste` und `bestehende-tests` sind Pflichtprüfungen im Ruleset `protect-main` (mit `determinism`, `database`). Beide warten auf `spieltests` und werden nur grün, wenn dessen Ergebnis `success` ist; `bestehende-tests` führt danach `bash supabase/tests/run.sh` aus. Namen nicht ändern, sonst wartet jeder PR auf eine Prüfung, die es nicht mehr gibt.
- `.github/workflows/pages.yml` – Push auf `main` und manueller Start: zuerst `spieltests` (Baustein), dann `deploy` mit `needs: spieltests` und `if: github.ref == 'refs/heads/main'`. Rote Spieltests oder ein anderer Zweig → kein Deployment. Rechte: global keine, `deploy` allein `pages: write`/`id-token: write`.
- Die Regeln dazu prüft `tests/pages/workflows.test.mjs`. Lokal trotzdem vor jedem Push `npm test`.

## Prüfmethode (Pflicht für QA)
1. Betroffene Suites vollständig laufen lassen, Ausgabe (Anzahl grün/rot) im Bericht nennen.
2. **Mutationsprobe** für neue Schutzregeln: Schutz absichtlich entfernen → Test muss rot werden → Schutz wiederherstellen. (So arbeiten alle bisherigen Phasen.)
3. Flackernde Tests nie wegdrücken: Ursache finden (Beispiel `kontoloeschen`, SICHERHEIT_PHASE1 5a).
4. Kein Test wird abgeschaltet, übersprungen oder aufgeweicht, um grün zu werden.
5. Ehrlich berichten: was lokal, was gegen Attrappe, was nicht gegen echtes Supabase geprüft ist.
