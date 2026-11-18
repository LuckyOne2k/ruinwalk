---
name: ruinwalk-ki-inhalte
description: Weltentwicklung und KI-generierte Inhalte für Ruin Walk – Weltkanon (Gebietsstufen, Lebensräume, Monster, Ton), Format für Quest-/NPC-/Ereignis-Vorschläge, Prüfskript gegen die echten Spieldaten und der verbindliche Weg „KI schlägt vor → Prüfung → Pascal gibt frei → Server validiert“. Nutzen bei Quests, NPCs, Geschichten, Ereignissen, Gebietsnamen oder Planung dynamischer Inhalte.
---

# Welt und KI-Inhalte

## Weltkanon (belegt)
- Untertitel „The Forgotten World“. Ton: mystisch, ernst, leicht düster; die echte Umgebung des Spielers ist das Spielfeld („Deine Welt ist das Spielfeld“).
- **Gebietsstufen** (`BAND_N`): 1 Randland (ab Lv 1) · 2 Wildland (ab 8) · 3 Fernmark (ab 16) · 4 Schreckensmark (ab 26) · 5 Ruinenreich (ab 38). Heimat und Umgebung sind immer sicher (Schutzring).
- **Lebensräume** aus OSM: `w` Wald · `g` Wiese & Feld · `s` Sumpf & Wasser · `f` Fels & Berg · `r` Ruinen & Siedlung. Monster haben Lebensräume (`MOBS[*].hab`).
- Monster, Bosse, Gebietsbosse, Klassen: siehe `ruinwalk-projektwissen/references/spielsysteme.md`. Keine neuen Kreaturen, Orte oder Fraktionen als „existierend“ ausgeben.
- Es gibt **noch keine** Hauptgeschichte, keine NPCs außer Händlern, keine Orte/Landmarken, keine Ereignisse. Ob es eine Hauptgeschichte gibt, ist eine offene Entscheidung von Pascal.

## Grundsatz: KI-Inhalte sind Vorschläge, keine Spielwahrheit
1. **Erzeugen** (Agent oder später Server-Job) → strukturiertes JSON im Format unten, nie direkt Code oder Spielstand.
2. **Automatisch prüfen:** `node .claude/skills/ruinwalk-ki-inhalte/scripts/inhalt-pruefen.js <datei.json>` – nur vorhandene IDs, erlaubte Zieltypen, Gebietsstufe passt zum Monster, Belohnungs-Obergrenzen, Textlängen, keine Links/Skripte/Werbung/personenbezogenen Daten.
3. **Menschliche Freigabe** durch Pascal (Ton, Kanon, Spaß).
4. **Einbau** durch Gamedesign/Entwicklung mit Tests.
5. **Später live (Phase B+):** Dieselben Prüfungen laufen **serverseitig** (z. B. SQL-Funktion oder Edge Function mit `pg_jsonschema`, verfügbar aber nicht installiert). Belohnungen bucht nur der Server. Ein Client oder Modell kann nie selbst Belohnungen, Items oder Ziele festlegen. Gespeicherte Inhalte versioniert, mit Quelle und Freigabevermerk.

## Vorschlagsformat
```json
{ "typ": "quest|npc|ereignis", "id": "a-z0-9_", "gebietsstufe": 1, "lebensraum": "w|g|s|f|r (optional)",
  "titel": "≤ 40 Zeichen", "text": "≤ 400 Zeichen",
  "ziele": [{ "typ": "besiegen|sammeln|herstellen|item_besitzen", "ziel": "<echte ID>", "menge": 1 }],
  "belohnung": { "xp": 0, "muenzen": 0, "items": { "trank": 1 } },
  "zeilen": ["NPC-Text ≤ 160 Zeichen"], "quelle": "KI-Entwurf, Datum" }
```
Beispiele: `beispiele/quest_gut.json` (besteht), `beispiele/quest_schlecht.json` (6 Fehler – Selbsttest des Prüfers).
IDs nachschlagen: Export aus `ruinwalk-balancing` (`MOBS`, `NODES`, `ITEMS`, `RECIPES`).

**Obergrenzen** im Skript (`CAP`) sind konservative Platzhalter (XP ≤ 60 × Stufe, Münzen ≤ 120 × Stufe, ≤ 5 Stück je Item, keine Ausrüstung/Sets/seltenen Drops). Echte Werte legt Pascal fest (Balance) – dann im Skript und hier anpassen.

## Hinweis zur Umsetzung
Heute sind Quests Code (`QUESTS` mit `goals()`-Funktionen, linear). Datengetriebene Quests brauchen erst das Questsystem aus Phase B (Datenmodell für Ziele und Belohnungen). Bis dahin: Vorschläge sammeln in `docs/inhalte/` (Ordner bei Bedarf anlegen), nicht ins Spiel einbauen.
