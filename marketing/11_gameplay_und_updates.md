# Plan: Gameplay-Veröffentlichung und Entwickler-Updates

## Grundsatz
Gezeigt wird nur, was im Spiel existiert. Material kommt aus (1) echten Bildschirmaufnahmen draußen, (2) dem Testmodus, (3) automatischen Screenshots (`ruinwalk-mobile-check`), (4) Sprites/Assets. Prototypen werden nur als Text/Grafik „in Entwicklung“ gezeigt.

## Material-Bibliothek aufbauen (einmalig, dann laufend)
| Material | Wer | Wie |
|---|---|---|
| Standbilder aller Menüs | Agent (`rw-mobile-ux`) | `mobile-check.js … --breiten=390` → `grafiken/screenshots/` |
| Kampf gegen normales Monster | Pascal | Bildschirmaufnahme im Testmodus (Augsburg) oder draußen in neutraler Gegend |
| Gebietsboss mit Telegraph | Pascal | Testmodus in Gebietsstufe ≥ 4 (Entwicklerwerkzeug „Heimat“/Testmodus) |
| Spaziergang-Szenen | Pascal | Handy-Aufnahme draußen (Hände, Weg, Bildschirm) ohne erkennbare Adressen |
| Klassen/Figuren | Agent | `figs/*.png` über Vorlage `klasse` |

## Entwickler-Update-Rhythmus
- **Alle 2 Wochen** ein Update (Story-Serie + Beitrag), Quelle: `git log`, neue Docs in `docs/`.
- Aufbau: Was ist neu (live) · Was ist in Arbeit · Eine Frage an die Community.
- Zuordnung Entwicklungsstand → Kommunikation:

| Entwicklungsstand | Kommunikation |
|---|---|
| Commit/Feature live auf Pages | „Neu im Spiel“ mit Screenshot |
| Feature auf Arbeitszweig, nicht live | nicht als verfügbar zeigen; höchstens „in Arbeit“ |
| Architektur/Prototyp (z. B. Instanzkampf) | „Hinter den Kulissen“: Konzept, Grafik ohne Spielszene, ehrlich „kein Termin“ |
| Offene Entscheidung | Community fragen (Umfrage) – Ergebnis ist Empfehlung, Pascal entscheidet |

## Meilenstein-Kampagnen (Vorlagen, Start nur wenn erreicht)
| Meilenstein | Kampagne (2–3 Wochen) |
|---|---|
| Accounts live | Rasterstart + 30-Tage-Plan |
| Questsystem / Hauptstrang (Roadmap Phase B) | Teaser (Story-Rätsel) → Ankündigung → „Erste Quest gemeinsam“ |
| Neue Bosse/Gegner (Phase C) | Boss-Steckbriefe, Reel mit Mechanik |
| Gruppen-Dungeons geschlossener Test (Instanzkampf Freigabephase 2) | Aufruf zur Allowlist-Bewerbung, Regeln, Feedback-Kanal, Danke-Beitrag |
| Öffentlicher Gruppenbetrieb (Phase 3) | Launch-Woche: Reel, Karussell „So funktionieren Gruppen“, Live-Event (Weltboss), Presse |
| Platz-3-Kauf (falls umgesetzt) | sachliche Information, keine Druckmittel |

## Freigaben
Jede Veröffentlichung über `freigabe/` (Status `freigegeben` durch Pascal). Meilenstein-Kampagnen zusätzlich mit Pascal abstimmen, ob der Stand wirklich live ist.
