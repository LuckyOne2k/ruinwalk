---
name: ruinwalk-meta-publishing
description: Anbindung von Ruin Walk an Instagram und Facebook über Meta Business Suite und die offizielle Graph API – benötigte Konten, Berechtigungen, sichere Token-Hinterlegung, Statusprüfung, Insights lesen und Veröffentlichen freigegebener Beiträge (Trockenlauf als Standard, doppelte Freigabesperre). Nutzen, wenn Accounts verbunden, Berechtigungen geprüft, Kennzahlen gelesen oder ein freigegebener Beitrag veröffentlicht werden soll.
---

# Meta-Anbindung (Instagram + Facebook)

Anleitung für Pascal: `marketing/meta/ANBINDUNG.md`. Berechtigungsliste: `marketing/meta/BERECHTIGUNGEN.md`.

## Stand
- Instagram **@ruinwalk.official** (Business-Konto, 18.11.2026), Weg: Instagram-API mit Instagram-Login (`api_host: graph.instagram.com` in `marketing/meta/config.json`). Token noch nicht hinterlegt. Keine Facebook-Seite.
- **Bilder öffentlich:** Ist `bild_url` leer, erzeugt das Skript automatisch `https://raw.githubusercontent.com/LuckyOne2k/ruinwalk/<commit>/<pfad>` aus dem auf GitHub gepushten Stand des aktuellen Zweigs (Commit-Hash = unveränderliche Adresse). Bilder müssen JPEG sein und **vor** dem Posten committet und gepusht werden. Kein Push auf `main` nötig.
- **Karussell:** `bild: …_1.jpg (+ _2 bis _N)` → alle Seiten `_1…_N` (max. 10) werden als Karussell gepostet.
- Kein offizieller Meta-Connector in der Claude-Umgebung vorhanden. Drittanbieter-Connectoren (z. B. Windsor.ai, Zapier) wären möglich, leiten aber Daten über Dritte – nur auf ausdrücklichen Wunsch.

## Zwei Wege – Empfehlung
1. **Start (sofort, ohne Technik): Meta Business Suite manuell.** Agent liefert fertigen Entwurf (Bild + Text + Alt-Text + Hashtags + Wunschzeit), Pascal plant/veröffentlicht in der Business Suite. Kennzahlen exportiert Pascal dort (CSV) nach `marketing/analyse/`.
2. **Später: Graph API mit eigener Meta-App** (Typ „Business“) und einem **System-User-Token** aus dem Meta-Business-Portfolio, der nur die Ruin-Walk-Seite und das verknüpfte Instagram-Konto verwalten darf. Für eigene Konten genügt „Standard Access“ ohne App Review, solange nur Personen/System-User mit Rolle in der App/dem Portfolio betroffen sind (vor Einrichtung in der aktuellen Meta-Doku bestätigen).

## Token sicher hinterlegen
- **Nie** ins Repo, nie in den Chat, nie in `config.json`.
- Claude-Cloud-Umgebung: als Netzwerk-Geheimnis für Host `graph.facebook.com` (Header `Authorization: Bearer …`) – der Agent fordert das über das sichere Formular an (`request_credential`), Pascal trägt den Wert ein. Der Proxy setzt den Header, der Agent sieht den Wert nie.
- Lokal: Umgebungsvariable `META_TOKEN` (nicht committen).
- `marketing/meta/config.json` enthält nur öffentliche IDs: `api_version`, `page_id`, `ig_user_id`.

## Befehle
```bash
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js status                      # Token, Rechte, Seite, IG-Verknüpfung (lesend)
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js insights 7                  # letzte Beiträge (lesend)
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js pruefen <entwurf.md>        # Qualitätsprüfung
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md>            # Trockenlauf
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md> --senden   # nur nach Freigabe
```
Veröffentlichen verlangt im Entwurf: `status: autonom` (Modus autonom) oder `status: freigegeben` + `freigegeben_von: Pascal …`, `kanal: instagram|facebook|instagram,facebook`, `bild_url: https://…` (öffentlich erreichbar – Instagram lädt das Bild selbst; z. B. GitHub Pages nach Push auf `main` oder eine von Pascal gewählte Ablage). Abschnitte `## Caption Instagram`, `## Text Facebook`, `## Alt-Text`.

## Veröffentlichungsmodus (`marketing/meta/modus.json`)
| Modus | Wirkung |
|---|---|
| `autonom` (aktuell, entschieden von Pascal 18.11.2026) | Skript veröffentlicht Entwürfe mit `status: autonom` oder `freigegeben`, wenn die Qualitätsprüfung besteht, der Kanal in `erlaubte_kanaele` steht (derzeit nur `instagram`) und Tages-/Wochenlimit frei sind. Hook fragt nicht nach. |
| `freigabe` | nur `status: freigegeben` + `freigegeben_von: Pascal`; Hook fragt vor jedem Senden |
| `pause` | Skript verweigert jede Veröffentlichung (Not-Aus) |

## Sicherheitssperren
1. Skript: sendet nur mit `--senden`, prüft Modus, Status, Qualität (`pruefen`: Hook ≤ 125 Zeichen, 3–5 Hashtags mit #ruinwalk, Alt-Text, Faktenprüfung mit Belegen, „in Entwicklung“ ehrlich benannt, keine Superlative/fremden Links/Gewinnspiele, Bilddatei vorhanden), Kanal und Limits; protokolliert in `marketing/freigabe/veroeffentlicht/LOG.md`.
2. Hook `.claude/hooks/schutz.js`: jede Änderung an `modus.json` → Rückfrage an Pascal; rohe Schreibaufrufe an die Graph API (`curl -X POST` …) → immer Rückfrage; `meta-api.js --senden` nur im Modus `autonom` und nur als schlichter Einzelbefehl ohne Rückfrage.
3. Agent `rw-marketing`: kommentiert, liked, folgt, schreibt Nachrichten und löscht nie ohne Freigabe; heikle Themen gehen trotz Modus `autonom` an Pascal.

## Automatischer Zeitplan (nach API-Anbindung)
Ein geplanter Auftrag (scheduled task der Claude-Umgebung) kann zu festen Zeiten den nächsten passenden Entwurf aus dem Redaktionskalender prüfen und veröffentlichen. Einrichtung erst, wenn Token und `config.json` stehen und ein erster Beitrag manuell erfolgreich war.

## Grenzen der API (vor Nutzung in der aktuellen Doku prüfen)
- Instagram: Veröffentlichung in zwei Schritten (Container → `media_publish`), Bild per öffentlicher URL (JPEG empfohlen), Tageslimit für API-Beiträge (Endpunkt `content_publishing_limit`), Reels/Karussells mit eigenen Parametern, Stories nur für Business-Konten.
- Facebook-Seite: Beiträge über `/{page-id}/feed` bzw. `/photos` mit Seiten-Token.
- Musik aus der Instagram-Bibliothek ist per API nicht wählbar → Reels mit Musik postet Pascal manuell.
- Das Skript ist ohne echten Account nur im Trockenlauf geprüft. Der erste echte Lauf: `status`, dann ein Testbeitrag nach Freigabe.
