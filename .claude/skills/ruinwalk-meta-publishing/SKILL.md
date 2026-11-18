---
name: ruinwalk-meta-publishing
description: Anbindung von Ruin Walk an Instagram und Facebook über Meta Business Suite und die offizielle Graph API – benötigte Konten, Berechtigungen, sichere Token-Hinterlegung, Statusprüfung, Insights lesen und Veröffentlichen freigegebener Beiträge (Trockenlauf als Standard, doppelte Freigabesperre). Nutzen, wenn Accounts verbunden, Berechtigungen geprüft, Kennzahlen gelesen oder ein freigegebener Beitrag veröffentlicht werden soll.
---

# Meta-Anbindung (Instagram + Facebook)

Anleitung für Pascal: `marketing/meta/ANBINDUNG.md`. Berechtigungsliste: `marketing/meta/BERECHTIGUNGEN.md`.

## Stand
- Noch **keine** Accounts, keine Meta-App, kein Token (Stand 18.11.2026). Pascal legt die Accounts selbst an.
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
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md>            # Trockenlauf
node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen <entwurf.md> --senden   # nur nach Freigabe
```
Veröffentlichen verlangt im Entwurf: `status: freigegeben`, `freigegeben_von: Pascal …`, `kanal: instagram|facebook|instagram,facebook`, `bild_url: https://…` (öffentlich erreichbar – Instagram lädt das Bild selbst; z. B. GitHub Pages nach Push auf `main` oder eine von Pascal gewählte Ablage). Abschnitte `## Caption Instagram`, `## Text Facebook`, `## Alt-Text`.

## Sicherheitssperren (alle drei gelten)
1. Skript sendet nur mit `--senden` und nur bei `status: freigegeben` + Freigabe durch Pascal.
2. Hook `.claude/hooks/meta-guard.sh` erzwingt vor jedem schreibenden Meta-Aufruf (Skript mit `--senden`, `curl -X POST/DELETE` an graph.facebook.com/graph.instagram.com) eine Bestätigung durch den Menschen – auch im Auto-Modus.
3. Agent `rw-marketing` hat die Regel, ohne Pascals Freigabe nichts zu veröffentlichen, zu kommentieren, zu liken, zu folgen oder Nachrichten zu senden.

## Grenzen der API (vor Nutzung in der aktuellen Doku prüfen)
- Instagram: Veröffentlichung in zwei Schritten (Container → `media_publish`), Bild per öffentlicher URL (JPEG empfohlen), Tageslimit für API-Beiträge (Endpunkt `content_publishing_limit`), Reels/Karussells mit eigenen Parametern, Stories nur für Business-Konten.
- Facebook-Seite: Beiträge über `/{page-id}/feed` bzw. `/photos` mit Seiten-Token.
- Musik aus der Instagram-Bibliothek ist per API nicht wählbar → Reels mit Musik postet Pascal manuell.
- Das Skript ist ohne echten Account nur im Trockenlauf geprüft. Der erste echte Lauf: `status`, dann ein Testbeitrag nach Freigabe.
