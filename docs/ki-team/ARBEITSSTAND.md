# Arbeitsstand (Übergabe) – wird nach dem Komprimieren automatisch geladen

Kurz halten (≤ 80 Zeilen). Pflege: Hauptsitzung nach jedem abgeschlossenen Auftrag.
Diese Datei ist öffentlich im Repository. Sie enthält **keine** lokalen Pfade, Prüfsummen,
Zugangs-, Secret- oder Projekthinweise und keine Veröffentlichungszeitpläne. Solche Angaben
gehören nur in den lokalen Schnappschuss `.claude/arbeitsstand/` (von Git ausgeschlossen).

## Grundlage
- Verbindliche Planung: `docs/analyse/ENTWICKLUNGSROADMAP_2026-11-19.md` (aktuelle Fassung im Kopf der Datei).
- Bestandsaufnahme: `docs/analyse/GESAMTANALYSE_2026-11-19.md`.

## Aktueller Stand
- Planung abgeschlossen; Umsetzung erfolgt phasenweise nach der Roadmap und nur mit Pascals Freigabe je Phase.
- Offene Entscheidungen und Freigaben: Roadmap, Abschnitt F.

## Feste Regeln (Kurz)
- Abgleichpflicht vor jedem Commit (Skill `ruinwalk-ablauf`), Zeile `Abgleich: …` in der Commit-Nachricht.
- Keine Änderung an der produktiven Datenbank, kein Push auf `main` ohne PR, keine Secrets im Repository.
- Eingefrorene Instanzkampf-Architektur nur mit ausdrücklicher Freigabe ändern.
- `rw-projektpflege` fasst nichts an, was in Bearbeitung ist.
