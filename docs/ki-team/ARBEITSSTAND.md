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

## Quest-System (Stand 27.11.2026, main `7ed3010`)
- Erledigt: PR #14 (Quest Paket 1/1b/2, Server-Grundgerüst Q1) und PR #16 (QA-Lücken, `lock_timeout` in Migration/Rollback Q1) auf main; CI dort vollständig grün. Bericht: `docs/QUEST_PAKET2_BERICHT.md` (§9 = PR #16).
- Q1 ist vorbereitet, aber **weder in Dev noch in Produktion installiert** (laut Repo-Dokumentation; nicht live geprüft); Dev-Installation braucht eine eigene Freigabe (`docs/DEV_INSTALLATIONSFREIGABE.md`).
- Offen: Paket 3 (schreibender Teil); NPC-Verweisschutz als Auflage für das erste Paket, das `npc_defs.vorlagen` ausliest; Produktionsmigrationen B2/B4.

## Feste Regeln (Kurz)
- Abgleichpflicht vor jedem Commit (Skill `ruinwalk-ablauf`), Zeile `Abgleich: …` in der Commit-Nachricht.
- Keine Änderung an der produktiven Datenbank, kein Push auf `main` ohne PR, keine Secrets im Repository.
- Eingefrorene Instanzkampf-Architektur nur mit ausdrücklicher Freigabe ändern.
- `rw-projektpflege` fasst nichts an, was in Bearbeitung ist.
