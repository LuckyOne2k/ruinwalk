---
name: ruinwalk-projektwissen
description: Zentrale, belegte Wissensbasis zu Ruin Walk (GPS-Browser-RPG) – Architektur, Dateien, Spielsysteme mit echten Zahlen, Datenbank/RLS, Instanzkampf-Stand, Tests, Roadmap und offene Entscheidungen. Laden, bevor du Code, Spielinhalte, Doku oder Marketingtexte zu Ruin Walk erstellst oder prüfst, oder wenn du wissen musst, was im Spiel wirklich existiert.
---

# Ruin Walk – Projektwissen

Gemeinsame Wissensbasis für alle Ruin-Walk-Agenten. Alles hier ist aus Code und `docs/` belegt
(Stand: 18.11.2026, Commit `8e423a3`). Bei Widerspruch gilt immer der aktuelle Code – dann diese Datei korrigieren.

## Wann welche Referenz lesen

| Frage | Datei |
|---|---|
| Wie ist das Projekt aufgebaut, wo liegt was? | `references/architektur.md` |
| Was gibt es im Spiel wirklich (Klassen, Monster, Items, Zahlen)? | `references/spielsysteme.md` |
| Tabellen, RPCs, RLS, Rollen, Migrationen | `references/datenbank.md` |
| Phasen, Roadmap, offene Entscheidungen D1–D5 | `references/roadmap.md` |
| Welches Dokument in `docs/` beantwortet was? | `references/docs-index.md` |

## Die fünf wichtigsten Fakten

1. **Das Spiel ist eine einzige Datei** `index.html` (Inline-Skript, kein Build, kein Framework). Kampf läuft in Echtzeit im Browser. Testschnittstelle `window.__RW` nur mit `window.__RW_TEST=true`.
2. **Der Server ist heute ein gesicherter Dokumentenspeicher**: Spielstand = ein JSON (`characters.character_data`), vom Client erzeugt. Schreiben nur über `SECURITY DEFINER`-RPCs mit Versionsprüfung. Kein Anti-Cheat für Solo-Fortschritt (bewusst, vor Handel/Ranglisten neu bewerten).
3. **Instanzkampf (Gruppen-Dungeons, Weltboss) ist ein isolierter Prototyp** in `server/instance/` (Schema `rwi`, lokal getestet, nicht live, nicht im Client). Erster Schritt zu echter Serverlogik.
4. **Mehrspieler im Live-Spiel existiert nicht** (`othersInFight()` liefert 0). Keine Dungeons im Live-Spiel. Keine Ranglisten, kein Handel, kein Marktplatz, keine Zahlung.
5. **Fertig und live:** GPS-Erkundung, Lebensräume aus OSM, Gebietsstufen 1–5 mit Heimat-Schutzring, 50 Monster, Gebietsbosse mit Mechaniken, 4 Klassen + 12 Pfade × 3 Stufen, Ausrüstung/Sets/+10, Crafting, Konten mit 3 Charakterplätzen und Cloud-Sync, Kontolöschung.

## Regeln für den Umgang mit diesem Wissen

- Nenne keine Funktion als „vorhanden“, die hier als ❌ oder „Prototyp“ steht – besonders nicht in Marketingtexten.
- Zahlen (Schaden, XP, Preise) immer im Code nachprüfen, bevor du sie änderst oder veröffentlichst: `grep -n "<KONSTANTE>" index.html`.
- Zeilennummern in Docs veralten. Suche nach Bezeichnern (`CLASSES`, `PATHS`, `MOBS`, `strike`, …), nicht nach Zeilen.
- Neue belegte Erkenntnisse hier nachtragen (kurz, mit Fundstelle).
