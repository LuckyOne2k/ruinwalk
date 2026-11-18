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
| Dungeon-Simulation | `node server/instance/sim/run-dungeon.mjs --seed 3 --ruhig` | komplette Auftragskette | PostgreSQL |

Die Instanzkampf-Befehle stehen vollständig im Skill `ruinwalk-instanzkampf`.

## Testtechnik im Spiel
- `tests/harness.js` startet einen lokalen Server und Chromium, `tests/leaflet-stub.js` ersetzt die Karte, `tests/fake_supabase.js` ist die Supabase-Attrappe.
- Zugriff auf Spielinterna nur über `window.__RW` (existiert nur mit `window.__RW_TEST=true`).
- Neue Testdatei: `tests/cases/<thema>.js` nach Vorbild einer bestehenden; `tests/run.js` lädt alle.

## CI
`.github/workflows/instance-tests.yml` (Jobs `determinism`, `database`, `bestehende-tests`) – läuft nur bei Änderungen an `server/instance/**`, `supabase/schema.sql`, `supabase/tests/00_stub.sql`.
**Lücke:** Änderungen nur an `index.html` lösen keinen CI-Lauf aus, und `pages.yml` deployt `main` ohne Tests. Deshalb vor jedem Push `npm test` lokal.

## Prüfmethode (Pflicht für QA)
1. Betroffene Suites vollständig laufen lassen, Ausgabe (Anzahl grün/rot) im Bericht nennen.
2. **Mutationsprobe** für neue Schutzregeln: Schutz absichtlich entfernen → Test muss rot werden → Schutz wiederherstellen. (So arbeiten alle bisherigen Phasen.)
3. Flackernde Tests nie wegdrücken: Ursache finden (Beispiel `kontoloeschen`, SICHERHEIT_PHASE1 5a).
4. Kein Test wird abgeschaltet, übersprungen oder aufgeweicht, um grün zu werden.
5. Ehrlich berichten: was lokal, was gegen Attrappe, was nicht gegen echtes Supabase geprüft ist.
