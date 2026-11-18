# Roadmap und offene Entscheidungen

**Hinweis:** Eine einzelne Datei „Master-Roadmap“ gibt es im Repository nicht. `INSTANZKAMPF_PLAN.md` wird in den
Berichten als Grundlage genannt, liegt aber nicht im Repository. Die verbindliche Planung ergibt sich aus den
folgenden Dokumenten. Fehlt etwas: Pascal fragen, nicht ergänzen.

## Erledigt (Stand 18.11.2026)
- Accountsystem Phase 1–2 (Schema, Auth im Client), Phase 3 (3a–3f Cloud-Spielbetrieb), S1 live.
- Datenschutz/Kontolöschung D1–D4 (D3-Migration live).
- Phase A Gebietsstufen (Weltstufe, Heimat-Schutzring, Spawn-Gating, Skalierung, Lebensraum-Ressourcen, Tutorial).
- Instanzkampf: Architekturbericht Fassung 1 + 2.1 (eingefroren laut O.3), Phase-0/1-Prototyp mit Gruppenverwaltung, Eventende K.2, Produktionssicherheit Phase 1.

## Spiel-Entwicklungsplan (`docs/BESTANDSAUFNAHME_SPIEL.md` Abschnitt 4)
- **Phase A** – Grundlagen (Weltschwierigkeit, Wertekurve, Lebensraum-Ressourcen, Tutorial) → umgesetzt, Wertekurve/Balance-Tabelle nur teilweise.
- **Phase B** – Fortschrittsrückgrat: Questsystem (Datenmodell, Ketten, Hauptstrang 1–50, Nebenquests), Erkundung, Erfolge/Titel.
- **Phase C** – Kampf und Charakter: Mechaniken der 5 Bosse, neue Gegner je Gebietsstufe, Attribute/Talente (Entscheidung offen), Verbrauchsgegenstände.
- **Phase D** – Wirtschaft und Handwerk: Veredelung, Set-Crafting, Lebensfertigkeits-Freischaltungen, Händler nach Fortschritt, Geldsenken.
- **Phase E** – Inhalte in Masse (Tabellen), Events/Tageszeit/Wetter.
- **Phase F** – Endgame und Soziales: Dungeons (Instanzkampf), Mehrspieler, Marktplatz, Ranglisten.
- Querschnitt: Einstellungen/Ton, PWA, Testmodus-Regelung vor Handel/Rangliste, Balance-Tabellen als gemeinsame Quelle.

**Offene Produktentscheidungen (Bestandsaufnahme 5):** (1) Weltschwierigkeit-Modell – durch Phase A beantwortet (feste Weltstufe + Heimatring). (2) Attribute/Talente ja/nein. (3) Hauptgeschichte oder Sandbox mit Aufgabenlisten.

## Instanzkampf-Freigabephasen (Bericht V2, O.2)
| Phase | Inhalt | Eintritt |
|---|---|---|
| 0 | Technische Voraussetzungen, Tarifprüfung (Abschnitt M, 15 Punkte) | – |
| 1 | Engine-/Watchdog-Test mit Bots | M komplett, D2 + D3 entschieden, D4-Werte |
| 2 | Geschlossener PvE-Test (Allowlist), normale Dungeons 2–4, nur EP/Münzen mit Obergrenzen | I.1 komplett, D1 entschieden |
| 3 | Öffentlicher Betrieb, alle Instanzarten, volle Belohnung | Beobachtungszeitraum ohne Doppelbuchung/Hänger, D5 umgesetzt |

**Offene Entscheidungen (Pascal):** D1 Belohnungsfolge `technical_end` · D2 Störungsfenster T1 annehmen/verwerfen · D3 Engine in Edge Function oder SQL (nach Messung) · D4 Zahlenwerte (Dauerläufe, Zeit H, Belohnungsobergrenzen, Beobachtungszeitraum) · D5 Herkunftssicherung C1 oder C2.

**Offene Kampfregeln** (`server/instance/README.md`, belegt durch `tests/offen.mjs`): E1 Energie, D1–D3 DoT-Zeitpunkt/Reihenfolge, B1 Brennen-Sprung, T1/T2 Bossansage und -ziel (T2 = Entscheidung nötig), H2 Balancewerte, W1 Wipe-Wiederaufnahme.

## Konto/Zahlung
- Platz-3-Kauf: Schema vorbereitet (`account_entitlements`, `payment_events`), Zahlung „Phase 5“ über Webhook-Edge-Function – nicht umgesetzt.
