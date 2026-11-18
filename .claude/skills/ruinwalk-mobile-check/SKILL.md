---
name: ruinwalk-mobile-check
description: Automatische Mobile-Prüfung von Ruin Walk im Hochformat (320–412 px, Touch) mit Screenshots, Überlauf- und Tippflächen-Prüfung plus UX-Regeln für das Browserspiel. Nutzen nach jeder Änderung an Oberfläche, CSS, Menüs, HUD oder Kampf-Layout, für UX-Analysen und um Screenshots für Berichte oder Marketing zu erzeugen.
---

# Mobile & UX – Prüfung

## Automatische Prüfung
```bash
node .claude/skills/ruinwalk-mobile-check/scripts/mobile-check.js                       # → docs/mobile-check/
node .claude/skills/ruinwalk-mobile-check/scripts/mobile-check.js /tmp/mc --breiten=320,390
RW_MOBILE_PROBE=1 node .claude/skills/ruinwalk-mobile-check/scripts/mobile-check.js /tmp/probe   # Selbsttest: muss Befunde melden
```
- Lädt das echte `index.html` im Testmodus (Karte als Attrappe, kein Netz, keine Supabase), startet „Erst ohne GPS testen“, öffnet Karte, Inventar, Herstellen, Quests, Charakter, Mehr.
- **Befund** (Exit 1): UI-Element ragt über den Bildschirmrand, oder JavaScript-Fehler. **Hinweis**: Tippfläche < 40 px (Projektregel aus `tests/cases/ui.js`/Bestandsaufnahme: ≥ 40 px).
- Ergebnis: `bericht.md`, `bericht.json`, Screenshots `w<breite>_<ansicht>.png`. Ausgabeordner `docs/mobile-check/` nur committen, wenn ausdrücklich gewünscht.
- Grenzen: Kartenkacheln, Overpass-Lebensräume und echtes GPS fehlen im Testmodus; Kampfansicht wird nicht automatisch geöffnet (für Kampf `tests/cases/combat.js` bzw. `T.place()` aus `tests/util.js` nutzen).

**Bekannte Hinweise (18.11.2026):** Schließen-Knopf `[data-a=shx]` 33×32 px, mehrere Listenknöpfe 32–33 px hoch (`use`, `craft`, Einstellungen). Nicht automatisch ändern – als UX-Vorschlag an Pascal.

## UX-Regeln für Ruin Walk
1. **Einhandbedienung im Hochformat:** wichtige Aktionen in der unteren Daumenzone (Kampf-Layout „Daumenzone“, Fähigkeiten im Bogen, Navigationsleiste unten). Nichts Wichtiges oben rechts.
2. **Tippflächen ≥ 40 px**, Abstand zwischen Tippzielen; destruktive Aktionen mit zweitem Tipp bestätigen (bestehendes Muster: Löschen, Verkaufen, Upgrade – Doppeltipp-Schutz).
3. **Safe Areas:** `env(safe-area-inset-*)` beachten (`--sb`, `--st`), `viewport-fit=cover` ist gesetzt.
4. **Unterwegs spielbar:** kurze Interaktionen, lesbar bei Sonne (Kontrast), keine Pflicht zu Präzisionsgesten, kein Hover.
5. **Kein Überlauf** bei 320 px Breite. Texte kürzen statt verkleinern.
6. **Performance:** eine Datei ohne Build – keine schweren Bibliotheken nachladen; Marker-Anzahl und Timer im Blick behalten; Akku (GPS-Watch, Sekundentakt).
7. **Browser-Kompatibilität:** iOS Safari (Standortberechtigung, `visibilitychange`/`pagehide` beim Speichern, kein `beforeunload`), Android Chrome. Kein PWA-Manifest vorhanden (Querschnittsthema laut Roadmap).
8. Änderungen an Layout/CSS immer: `npm test` (enthält Tippgrößen- und Überlauftests bei 320–412 px) **und** dieses Skript.
