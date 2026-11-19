---
name: ruinwalk-projektpflege
description: Ordnung, Übersicht und Kompaktheit im Ruin-Walk-Repository – Inventar aller Dokumente mit Verweisen und Alter, tote und zweigübergreifende Pfadverweise, überholte oder doppelte Dokumente, Zweig-Übersicht, Pflege der Wissensbasis und Abgleichpflicht für Änderungen. Nutzen für Aufräumen, Doku-Konsolidierung, nach größeren Änderungen oder Merges, vor Releases und regelmäßig zur Projekthygiene.
---

# Projektpflege

## Werkzeug
```bash
node .claude/skills/ruinwalk-projektpflege/scripts/inventar.js        # Textbericht
node .claude/skills/ruinwalk-projektpflege/scripts/inventar.js --md   # Markdown-Bericht
git branch -r -vv && git log --oneline --all --graph -20                # Zweig-Lage
```
Das Inventar listet je Dokument Zeilen, letzten Commit, Anzahl Verweise und Hinweise auf „überholt“; dazu tote Pfadverweise, Verweise auf Dateien anderer Zweige, nirgends verwiesene Dokumente, sehr lange Dokumente (> 400 Zeilen) und ungetrackte Dateien. Es ändert nichts.

## Grundsätze
1. **Nichts geht verloren.** Kein Löschen von Inhalten mit Entscheidungswert. Überholtes kommt nach `docs/archiv/` (`git mv`, Historie bleibt) und bekommt oben einen Vermerk „Überholt durch … am …“. Gelöscht werden dürfen nur echte Duplikate und erzeugte Dateien.
2. **Eine Wahrheit je Thema.** Gibt es mehrere Dokumente zum selben Thema, gilt das neueste; ältere verweisen darauf („gilt: …“). Die Wissensbasis (`ruinwalk-projektwissen`) fasst zusammen, die Details stehen in `docs/`.
3. **Kompakt statt lang.** Berichte > 400 Zeilen bekommen oben eine Kurzfassung (≤ 15 Zeilen: Stand, Entscheidungen, offene Punkte). Kein Umschreiben der Inhalte, nur ergänzen.
4. **Code und Spiel nicht anfassen.** Projektpflege ändert Dokumentation in `docs/`, Wissensbasis, Indizes und `.gitignore` – `marketing/` und `CLAUDE.md` nur per Vorschlag (an `rw-marketing` bzw. die Hauptsitzung), nie `index.html`, SQL, Engine, Tests oder Workflows. Fällt dort etwas auf (toter Code, doppelte Hilfsfunktionen), wird es als Vorschlag an den zuständigen Agenten gemeldet.
5. **Zweige respektieren.** Dateien, die nur auf einem Arbeitszweig existieren (z. B. `nacht/operator-edge-function`), sind kein Fehler. Aufräumen nur auf dem eigenen Arbeitszweig, nie auf fremden Zweigen oder `main` ohne Freigabe.
6. **Laufende Arbeit hat Vorrang.** Dateien, die das Inventar als „IN BEARBEITUNG“ markiert (uncommittet in einem Worktree, auf einem nicht übernommenen Zweig geändert, in den letzten 72 h committet, laufende Entwürfe in `marketing/freigabe/entwuerfe/` und `kunst/entwuerfe/`), werden nicht angefasst. Sie werden im Bericht mit Grund und zuständigem Agenten zurückgestellt; die Hauptsitzung klärt mit diesem Agenten, ob und wann aufgeräumt werden darf. Erst nach dessen Freigabe bearbeiten.

## Regelmäßiger Pflegelauf (Checkliste)
1. Inventar laufen lassen, Befunde sichten. Alles unter „IN BEARBEITUNG“ sofort aus dem Lauf herausnehmen und als „zurückgestellt“ notieren.
2. Tote Verweise korrigieren (Pfad anpassen oder Verweis entfernen).
3. Nirgends verwiesene Dokumente in `docs/`: in einen Index aufnehmen (`docs-index.md`) oder archivieren. `marketing/freigabe/` ist laufende Arbeit und bleibt unberührt.
4. Überholte Fassungen archivieren bzw. mit Verweis versehen.
5. Wissensbasis gegen den Code prüfen (`team-check.js` prüft Kernbezeichner; neue Systeme in `references/` nachtragen).
6. `docs/ki-team/UEBERSICHT.md` aktuell (Agenten, Skills, Hooks).
7. Ergebnis als kurzer Pflegebericht: geändert / vorgeschlagen / offen.

## Abgleichpflicht (gilt für alle Agenten)
Jede Änderung wird vor dem Commit von den fachlich betroffenen Agenten auf Plausibilität geprüft – Matrix im Skill `ruinwalk-ablauf`, Abschnitt „Abgleich“. Der Commit nennt das Ergebnis in einer Zeile `Abgleich: …`; der Hook `schutz.js` verweigert Commits an Code, Schema, Server, Tests oder KI-Team-Dateien ohne diese Zeile.
