---
name: ruinwalk-social-content
description: Arbeitsablauf für Instagram- und Facebook-Inhalte von Ruin Walk – Formatwahl (Post, Karussell, Reel, Story, Facebook-Beitrag), Caption-Aufbau, Hooks, Hashtags, Alt-Text, Reel-Skript, Ablage als Entwurf und verpflichtender Freigabeprozess durch Pascal vor jeder Veröffentlichung. Nutzen, wenn ein Beitrag, eine Story, ein Reel, eine Umfrage oder ein Redaktionsplan erstellt oder überarbeitet wird.
---

# Social Content – vom Thema zur Freigabe

Grundlagen: `ruinwalk-marke` (Ton, Wahrheitsregeln), `marketing/04_instagram.md`, `05_facebook.md`, `09_hashtags_keywords.md`, Kalender `06_redaktionskalender_30_tage.md`, Ideen `07_content_ideen.md`, Vorlagen `08_vorlagen.md`.

## Ablauf
1. **Thema wählen** aus Kalender/Ideenliste oder aktuellem Entwicklungsstand (`git log`, neue Docs). Ziel festlegen: Reichweite, Bindung, Feedback oder Besuch der Landingpage.
2. **Fakten prüfen** gegen `ruinwalk-projektwissen`. Jede Spielaussage braucht eine Fundstelle (Code/Doc).
3. **Format wählen:**
   - Karussell (Erklären, Klassen, Updates) · Einzelpost (Teaser, Zitat, Ankündigung) · Reel (Gameplay, „draußen spielen“, Entwicklung) · Story (Umfrage, Frage, Blick hinter die Kulissen) · Facebook-Beitrag (längerer Text, Gruppen, Link).
4. **Texte schreiben** mit Vorlage aus `marketing/08_vorlagen.md`:
   - Hook (erste Zeile ≤ 125 Zeichen, macht neugierig, kein Clickbait)
   - Kern (2–5 kurze Absätze oder Stichpunkte)
   - Ein Call-to-Action
   - 3–5 Hashtags nach `09_hashtags_keywords.md` (Nische vor Breite, rotieren)
   - Alt-Text (sachlich, was ist zu sehen)
5. **Grafik** mit Skill `ruinwalk-grafik` (Entwurf nach `marketing/grafiken/entwuerfe/`), Reel als Skript + Shotliste (keine erfundenen Spielszenen).
6. **Selbstprüfung** (Kurzprüfung aus `ruinwalk-marke`) und Gegenlesen auf typische KI-Floskeln („tauche ein“, „entfessle“, „Reise beginnt“ gehäuft, Dreierlisten ohne Inhalt, Gedankenstrich-Ketten).
7. **Als Entwurf ablegen:** `marketing/freigabe/entwuerfe/JJJJ-MM-TT_<kanal>_<thema>.md` nach `marketing/freigabe/VORLAGE_BEITRAG.md` (Status `entwurf`).
8. **Freigabe einholen:** Pascal den Entwurf zeigen (Text + Bild). Nur Pascal setzt `status: freigegeben` mit Datum (oder sagt es ausdrücklich im Chat; dann trägt der Agent „freigegeben durch Pascal am … im Chat“ ein).
9. **Veröffentlichen** erst danach – manuell durch Pascal (Meta Business Suite) oder per API (Skill `ruinwalk-meta-publishing`, jeder Aufruf löst zusätzlich eine Bestätigungsabfrage aus). Danach Datei nach `veroeffentlicht/` verschieben und Link/Datum eintragen.
10. **Auswerten** nach 7 Tagen in `marketing/analyse/` (Vorlage `KPI_VORLAGE.md`).

## Harte Regeln
- Nichts öffentlich ohne `status: freigegeben`. Kein Kommentieren, Liken, Folgen, Direktnachrichten im Namen von Ruin Walk ohne Freigabe.
- Keine gekauften Follower, keine Engagement-Gruppen, keine Fake-Accounts, keine Bewertungen im Namen anderer.
- Keine fremden Inhalte ohne Rechte (Musik in Reels nur aus der Plattform-Bibliothek, beim Posten durch Pascal gewählt).
- Spieler-Inhalte (Screenshots, Zitate) nur mit Einwilligung, ohne Standortdaten. Karten-Screenshots: keine echten Wohnorte erkennbar machen (Testmodus-Position Augsburg-Zentrum oder neutrale Gegend nutzen).
- Werbung/Anzeigen sind ein separater Auftrag (Budget!) – nicht eigenmächtig planen oder schalten.
