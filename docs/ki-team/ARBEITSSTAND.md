# Arbeitsstand (Übergabe) – wird nach dem Komprimieren automatisch geladen

Stand: 18.11.2026 abends. Kurz halten (≤ 80 Zeilen). Pflege: Hauptsitzung nach jedem abgeschlossenen Auftrag.

## Orte
- **Hauptordner** `/home/user/ruinwalk`, Zweig `ccr-2e014f58-1i6nm4` (KI-Team, Marketing; Instagram-Läufe committen hierher). `main` = KI-Team seit PR #1.
- **Zweig-Ordner** `/home/user/ruinwalk-nacht`, Zweig `nacht/operator-edge-function` (Kopf `d49a417`, gepusht). Kein weiterer Commit/Push ohne Pascals Freigabe.
- Weitere Remote-Zweige (Arbeit aus Pascals normalem Chat): `nacht/supabase-integration`, `analyse/client-modularisierung` – nur lesen.

## Letzter Auftrag
Folgeauftrag „Rollback und Cleanup gegen Transaktions-Pooling absichern“ (Zweig-Ordner, ohne Commit):
- Umgesetzt: gemeinsame Schutzlogik `supabase/dev/_ziel_wrapper.sh`; `install_dev.sh`, neu `rollback_dev.sh`, `cleanup_dev.sh` (Referenz + Bestätigung als `set local` nach `begin;`, nur Port 5432, PG-Umgebung bereinigt, `psql -X`, SHA-Pflicht); `lock_timeout` 5 s in Rollback/Cleanup; Doku in `docs/DEV_INSTALLATIONSFREIGABE.md`.
- **Committet+gepusht `d49a417`** (Positivliste URL, genau ein Host, Passwort per pgpass, psql -X -w; installation 273/273, run-all-db PG16 grün, 28/28 Mutationsproben). CI-Lauf 44400939204: database 16/17, Vergleich, determinism grün; `bestehende-tests` rot durch wackeligen Browser-Test `status` (Timer 1:29 statt 1:30, Zeit-Wettlauf im Test, lokal 1/20, unabhängig vom Commit). Wartet auf Pascal (Lauf neu starten? Test reparieren? verify-full/PGREQUIREAUTH?).
- SHA-256 `install_dev.sql`: `2206042d22f047044f6a7813bcfa6eea9d778c3fd376033042bf454000adebf3`.

## Offene Entscheidungen (Pascal)
1. Wackeligen Test `status` (Timer) reparieren bzw. CI-Lauf neu starten; `verify-full`/`PGREQUIREAUTH` verbindlich machen?
2. Hook-Lücke: direkte `psql`-/Supabase-CLI-Aufrufe werden vom Schutz-Hook nicht abgefangen – schließen?
3. Optional: echter Git-`commit-msg`-Hook für die Abgleichpflicht; Erlaubnis für `inventar.js` in `settings.json`.
4. Live-Projekt-Kennung lesend abfragen (Eindeutigkeit der Datenbankkennung)?
5. `service_role`-EXECUTE auf internen public-Funktionen (nur über `schema.sql` änderbar, gesperrt).
6. Probe-Reste auf ruinwalk-dev (`rwprobe`, Vault-Secret) bereinigen?

## Feste Regeln (Kurz)
- Abgleichpflicht vor jedem Commit (Matrix Skill `ruinwalk-ablauf`), Zeile `Abgleich: …` – Hook erzwingt.
- Ständige Erlaubnis: Agenten/Skills anlegen/verbessern ohne Rückfrage; NICHT für Live-DB, Installation/Deploy, `main`, Secrets, Veröffentlichungsmodus, eingefrorenen Instanzkampf.
- `rw-projektpflege` fasst nichts an, was IN BEARBEITUNG ist.
- Instagram @ruinwalk.official: Modus `autonom`, Mo/Mi/Fr 17:35, Spiel noch nicht öffentlich (keine Links). Teaser 001 online (https://www.instagram.com/p/Df48x9TFzFk/); nächste: 002 Fr, 003 Mo, 004 Mi. Token läuft ~17.01.2027 ab (Erinnerung 07.01.).
- Kontext: Auto-Komprimieren ab 80 % (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`), Sicherung per PreCompact-/SessionStart-Hook (`.claude/hooks/kontext-sicherung.js`).
