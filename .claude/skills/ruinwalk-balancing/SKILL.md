---
name: ruinwalk-balancing
description: Methode und Werkzeug für Balancing, Wirtschaft und Progression in Ruin Walk – exportiert die echten Spieldaten (Monster je Gebietsstufe, Spielerwerte, Klassen, Pfade, Items, Sets, Rezepte) aus index.html und gibt Prüfregeln für Kampfwerte, XP-Kurve, Loot, Münzquellen/-senken und Klassenbalance. Nutzen bei Zahlenänderungen, neuen Gegnern/Items/Klassenfähigkeiten oder Wirtschaftsfragen.
---

# Balancing und Wirtschaft

## 1. Immer mit echten Daten arbeiten
```bash
node .claude/skills/ruinwalk-balancing/scripts/spieldaten-export.js            # → docs/balancing/export/
node .claude/skills/ruinwalk-balancing/scripts/spieldaten-export.js /tmp/x     # anderer Zielordner
```
Erzeugt `spieldaten.json` (MOBS, mobsByBand, BSC, ABIL, CLASSES, PATHS, ITEMS, NODES, RECIPES, SETS, TIERS, QUESTS, Spielerbasis je Level) und `monsterwerte.md`. Nur lesend, lädt das echte Spiel im Testmodus. Den Export nur committen, wenn er als Vergleichsstand gebraucht wird.

## 2. Bekannte Kernformeln (aus `index.html`, vor Änderungen nachprüfen)
- Spieler: `maxHP = round((100 + 10·(lv−1)) · (1 + Klassen-hpb + Set-hpb)) + Ausrüstung`, `atk = 10 + 2·lv + Ausrüstung`. XP für nächstes Level = `lv · 40` (49.000 bis 50). Regeneration im Sekundentakt.
- Monster skaliert per `mobOf(e)` mit `BSC.hp/dmg[tier][stufe−1]`, XP nach Zielstufe `BAND_LV`, Münzen × `BCOIN=[1,1.6,2.6,4,6]`. XP sinken, wenn Spieler > 6 Level über Monster (min. 25 %).
- Pfadmodifikatoren `m:{hpb, def, dm, crit, heal}` je Stufe in `PATHS`, Fähigkeiten `sk:{en, cd, mult, …}`.
- Bekannte Schwäche (Bestandsaufnahme): fester Monsterschaden vs. wachsendes Spielerleben – durch Phase A (Skalierung je Gebietsstufe) teilweise behoben.

## 3. Prüfregeln für jede Balance-Änderung
1. **Zeit bis Sieg / Zeit bis Niederlage** je Gebietsstufe und Monsterart für ein typisches Level im Stufenbereich berechnen (Leben ÷ Schaden pro Sekunde beider Seiten). Normal: Spieler gewinnt sicher, Elite: knapp mit Fähigkeiten/Trank, Boss: braucht Ausrüstung bzw. Mechanik.
2. **Progressionstempo:** XP pro Stunde (Kills + Sammeln) gegen XP-Kurve – wie viele Spielstunden pro Level? Sprünge vermeiden.
3. **Klassen/Pfade vergleichen:** Schaden pro Energie und pro Abklingzeit, Überleben (hpb, def, heal). Kein Pfad darf in allen Achsen vorn liegen.
4. **Wirtschaft:** Münzquellen (Drops, Verkauf, Quests) vs. Senken (Upgrade-Gebühr `UPFEE`, Reparatur, Trank). Neue Quelle → passende Senke benennen. Kein unendlicher Kreislauf (z. B. kaufen < verkaufen).
5. **Loot:** Drop-Chancen und Qualitätsverteilung (`DROPCH`, `DROPQ`, `RDROPCH`) – erwartete Zeit bis Set-Teil.
6. **Spielstände:** Änderungen dürfen bestehende Spielstände nicht zerstören (`sanitize()`, Migrationsmarker `gv`). Wertänderungen an gespeicherten Items bedenken.
7. **Tests:** betroffene Fälle in `tests/cases/combat.js`, `gear.js`, `craft.js`, `gebiete.js` anpassen bzw. ergänzen; `npm test` grün.
8. **Dokumentieren:** Vorher/Nachher-Tabelle in `docs/` (Balance-Tabellen sollen laut Plan die gemeinsame Quelle werden).

## 4. Instanzkampf
Zahlen in `server/instance/engine/content.mjs` sind **Testwerte** (H2 offen). Balance dort erst nach Entscheidung D4 und in Absprache mit `rw-instanzkampf`; Golden-Referenzen ändern sich dadurch.

## 5. Offene Designentscheidungen (nicht eigenmächtig treffen)
Attribute/Talente ja/nein · Hauptgeschichte vs. Sandbox · Bossziel-Regel T2 · Belohnungsobergrenzen D4. Vorschläge mit Varianten und Folgen formulieren, Pascal entscheidet.
