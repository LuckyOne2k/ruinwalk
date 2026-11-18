---
name: ruinwalk-ablauf
description: Standardabläufe des Ruin-Walk-KI-Teams – welcher Agent wann, in welcher Reihenfolge, mit welchen Prüfungen und Freigaben (Feature, Bugfix, Datenbankänderung, Instanzkampf-Änderung, Balancing, KI-Inhalte, Marketing-Beitrag, Release). Laden, wenn eine Aufgabe mehrere Bereiche berührt, wenn unklar ist, wer zuständig ist, oder vor der Koordination mehrerer Subagenten.
---

# Abläufe und Zusammenarbeit

**Koordination:** Die Hauptsitzung ist der Koordinator (Rolle Projektarchitekt). Subagenten starten keine weiteren Subagenten. Ergebnisse eines Agenten gibt die Hauptsitzung gezielt an den nächsten weiter (Datei-/Funktionsnamen, Entscheidungen, offene Fragen). Unabhängige Analysen dürfen parallel laufen; schreibende Arbeiten an denselben Dateien nie parallel.

## Zuständigkeitsmatrix (genau ein Verantwortlicher)
| Thema | Verantwortlich | Prüft mit |
|---|---|---|
| Architektur, Abhängigkeiten, Plan | `rw-architekt` | – |
| Supabase, SQL, RLS, RPC, Migration (Schema `public`) | `rw-backend-security` | `rw-qa` |
| Schema `rwi`, Engine, Gruppen, Dungeons, Weltboss | `rw-instanzkampf` | `rw-backend-security` (Rechte), `rw-qa` |
| Spielregeln, Zahlen, Loot, Wirtschaft, Klassen (Client `index.html`) | `rw-gamedesign` | `rw-qa`, bei UI `rw-mobile-ux` |
| Quests, NPCs, Welt, KI-Inhalte | `rw-welt-ki` | `rw-gamedesign` (Belohnungen), `rw-qa` |
| Oberfläche, CSS, Touch, Layout | `rw-mobile-ux` | `rw-qa` |
| Tests, CI, Review, Sicherheitsprüfung | `rw-qa` | – (unabhängig) |
| Marke, Social Media, Community, Marketinganalyse | `rw-marketing` | `rw-architekt` bei Faktenfragen |

## Ablauf „Feature / Spieländerung“
1. `rw-architekt`: Analyse + Plan (betroffene Dateien, Risiken, Tests, Reihenfolge, offene Entscheidungen).
2. Offene Produkt-/Designentscheidungen → Pascal fragen (nicht raten).
3. Fachagent setzt um, schreibt Tests.
4. `rw-qa`: unabhängige Prüfung (Diff lesen, Suites laufen lassen, Mutationsprobe, Regression).
5. Bei Auth/RLS/Daten zusätzlich `rw-backend-security` (Sicherheitsreview).
6. Doku in `docs/` + ggf. Projektwissen aktualisieren. Commit auf Arbeitszweig. Kein Push auf `main` ohne Auftrag.

## Ablauf „Bugfix“
Reproduzieren (Test, der rot ist) → Ursache im Code belegen → minimaler Fix → Test grün → `rw-qa` prüft Regression → kurzer Bericht.

## Ablauf „Datenbankänderung“
Skill `ruinwalk-db-aenderung`. Live nur nach ausdrücklicher Freigabe.

## Ablauf „Instanzkampf“
Skill `ruinwalk-instanzkampf` (Prüfliste) → `rw-instanzkampf` → Rechte durch `rw-backend-security` → `rw-qa` mit allen Instanzkampf-Suites inkl. Determinismus. Eingefrorene Teile nur mit Freigabe.

## Ablauf „Balancing“
`rw-gamedesign` mit Export (`ruinwalk-balancing`) → Vorher/Nachher-Tabelle → Pascal entscheidet bei spürbaren Änderungen → Umsetzung + Tests → `rw-qa`.

## Ablauf „KI-Inhalt (Quest/NPC)“
`rw-welt-ki` erzeugt JSON → `inhalt-pruefen.js` → `rw-gamedesign` prüft Belohnungen → Pascal gibt frei → Einbau erst, wenn Questsystem (Phase B) existiert.

## Ablauf „Marketing-Beitrag“
`rw-marketing` nach Skill `ruinwalk-social-content`: Fakten prüfen → Text + Grafik → Entwurf in `marketing/freigabe/entwuerfe/` → **Pascal gibt frei** → Veröffentlichung (manuell oder API mit Bestätigung) → Auswertung nach 7 Tagen. Für Gameplay-Material liefert `rw-mobile-ux` echte Screenshots.

## Ablauf „Release“ (Deploy = Push auf `main` → GitHub Pages, ohne CI-Gate)
1. `npm test` + betroffene Suites grün (`rw-qa`).
2. Mobile-Prüfung bei UI-Änderungen.
3. Pascal gibt den Merge/Push auf `main` frei.
4. Nach Deploy: Startseite und Spiel im Browser öffnen (Smoke-Test), Ergebnis melden.
5. Optional: Entwickler-Update-Beitrag durch `rw-marketing` vorbereiten.

## Berichtsformat jedes Agenten (an die Hauptsitzung)
Ergebnis in 3–6 Sätzen · geänderte/neue Dateien · Tests (Befehl + Ergebnis) · offene Fragen/Entscheidungen für Pascal · Risiken.
