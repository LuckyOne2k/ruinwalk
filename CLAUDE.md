# Ruin Walk – Projektregeln für Claude

Ruin Walk ist ein mobiles GPS-Fantasy-RPG im Browser („The Forgotten World“). Auftraggeber und Entscheider: Pascal.
Sprache im Projekt: **Deutsch**, Du-Form, kurz und konkret. Code-Bezeichner bleiben, wie sie sind.

Diese Datei wird in jeder Sitzung automatisch geladen. Ausführliches Wissen steht im Skill
`ruinwalk-projektwissen` (`.claude/skills/ruinwalk-projektwissen/`). Die Übersicht über Agenten und Skills
steht in `docs/ki-team/UEBERSICHT.md`.

## Projekt in 10 Zeilen

- **Client:** `index.html` (eine Datei, ~3.100 Zeilen, Vanilla JS, Leaflet/OSM) + `sprites*.js`, Bilder in `figs/`, `items/`, `status/`, `assets/`. Spielstand `S` lokal (localStorage) und optional in der Cloud.
- **Backend:** Supabase (Projekt `malbiahllucctiafzydv`), Schema `supabase/schema.sql` (Konten, Charaktere, Plätze, Sicherungen, Audit, RLS). Migrationen liegen als SQL-Dateien daneben (kein Supabase-CLI-Projekt).
- **Instanzkampf (Prototyp):** `server/instance/` – Schema `rwi`, deterministische Engine (`engine/*.mjs`), SQL `sql/01–05`, Tests gegen temporäres lokales Postgres. **Nicht** live, **nicht** im Client eingebunden.
- **Tests:** `npm test` (Playwright, Spiel in Chromium), `bash supabase/tests/run.sh` (SQL), `server/instance/tests/*.mjs`. CI: `.github/workflows/instance-tests.yml`. Deployment: GitHub Pages bei Push auf `main` (`pages.yml`).
- **Marketing:** `marketing/` (Strategie, Kalender, Vorlagen, Meta-Anbindung, Freigaben). Noch keine Social-Media-Accounts.

## Grundregeln (gelten für alle Agenten)

1. **Bestehendes erhalten.** Erst den vorhandenen Code und die zugehörigen Docs lesen, dann ändern. Keine Umbauten „nebenbei“, keine Überarchitektur.
2. **Nichts erfinden.** Nur Funktionen, Zahlen und Inhalte nennen, die im Code oder in `docs/` belegt sind. Unsicheres als Annahme kennzeichnen. Fehlt eine Information: Pascal fragen.
3. **Serverautorität.** Clientdaten sind nicht vertrauenswürdig. Spielrelevante Entscheidungen (Kampf in Instanzen, Belohnungen, Gruppen, Fristen) trifft der Server.
4. **Instanzkampf-Architektur ist geschützt.** Die eingefrorenen Teile (Bericht V2, Abschnitt O.3) werden nicht ohne ausdrückliche Freigabe geändert. Vor jeder Änderung in `server/instance/` den Skill `ruinwalk-instanzkampf` lesen.
5. **Datenbank:** Keine Änderung an der produktiven Supabase-Datenbank ohne ausdrücklichen Auftrag von Pascal. Jede Schemaänderung = Migration + Rollback + Tests + Doku (Skill `ruinwalk-db-aenderung`).
6. **Tests.** Jede relevante Änderung bekommt Tests. Vor dem Abschluss die betroffenen Suites laufen lassen (Skill `ruinwalk-tests`). Rote Tests nie verschweigen, nie Tests abschalten.
7. **Sicherheit.** Keine Secrets ins Repo (nur der öffentliche Publishable Key steht im Client). Kein `service_role`-Schlüssel im Client. Fremde Skills/Skripte vor Nutzung vollständig prüfen.
8. **Öffentlichkeit.** Nichts veröffentlichen (Issues in fremden Repos, E-Mails, Kommentare, Nachrichten) ohne Pascals Freigabe. **Ausnahme Instagram-Beiträge:** Im Modus `autonom` (`marketing/meta/modus.json`, entschieden von Pascal am 18.11.2026) postet `rw-marketing` selbstständig – nur über `meta-api.js`, nur nach bestandener Qualitätsprüfung, innerhalb der Limits. Den Modus ändert nur Pascal.
9. **Dokumentieren.** Entscheidungen und Änderungen in `docs/` festhalten. Berichte ehrlich: was getestet, was nicht.
10. **Commits** auf Deutsch, beschreibend. Kein Push auf `main` ohne Auftrag.

## Team und Zuständigkeiten (Kurzfassung)

Die Hauptsitzung koordiniert (Rolle „Projektarchitekt“) und ruft Spezialisten als Subagenten auf. Subagenten
können selbst keine weiteren Subagenten starten – die Koordination liegt daher immer bei der Hauptsitzung.

| Agent | Zuständig für |
|---|---|
| `rw-architekt` | Architektur-Analyse, Planung, Abhängigkeiten, Konsistenzprüfung, wählt Spezialisten (nur lesend) |
| `rw-backend-security` | Supabase, PostgreSQL, RLS, RPCs, Migrationen, Sicherheit, Datenintegrität |
| `rw-gamedesign` | RPG-Mechaniken, Klassen, Fähigkeiten, Kampfwerte, Balancing, Loot, Wirtschaft, Crafting, Progression |
| `rw-instanzkampf` | Gruppen, Dungeon-Instanzen, Rundenkampf-Engine, Fristen, Eventende, Manipulationsschutz |
| `rw-welt-ki` | Welt, Gebiete, Quests, NPCs, Geschichten, KI-generierte Inhalte (nur serverseitig validiert) |
| `rw-qa` | Tests, Regression, Sicherheitsprüfung, CI, Codequalität – prüft kritisch und unabhängig |
| `rw-mobile-ux` | Mobile Bedienung, Hochformat, Touch, Responsive, Performance im Browser |
| `rw-marketing` | Marke, Instagram/Facebook, Content, Redaktionsplan, Community, Marketinganalyse |

Standardabläufe (Feature, Bugfix, DB-Änderung, Marketing-Beitrag, Release): Skill `ruinwalk-ablauf`.
