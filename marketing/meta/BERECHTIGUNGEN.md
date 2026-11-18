# Benötigte Zugriffsrechte (minimal)

Weg: Meta-App (Typ Business) + System-User im Business-Portfolio + Seiten-/Instagram-Assets (Facebook-Login-for-Business-Weg; deckt Facebook-Seite **und** Instagram mit einem Token ab).
Berechtigungsnamen nach Meta-Doku (Stand 2026); vor dem Erzeugen in der App-Oberfläche abgleichen.

## Stufe 2a – Lesen und Kennzahlen (empfohlen zuerst)
| Berechtigung | Wofür |
|---|---|
| `pages_show_list` | Seite finden |
| `pages_read_engagement` | Beiträge und Interaktionen der Seite lesen (auch Voraussetzung fürs Posten) |
| `read_insights` | Seitenstatistiken |
| `instagram_basic` | Instagram-Profil und Medien lesen |
| `instagram_manage_insights` | Instagram-Statistiken (Reichweite, Speicherungen …) |
| `business_management` | nur falls Meta es für Portfolio-Assets verlangt |

## Stufe 2b – Veröffentlichen (erst wenn Stufe 2a läuft und du es willst)
| Berechtigung | Wofür |
|---|---|
| `pages_manage_posts` | Beiträge auf der Facebook-Seite erstellen |
| `instagram_content_publish` | Beiträge/Reels/Karussells auf Instagram veröffentlichen |

## Nicht benötigt (bewusst nicht erteilen)
`pages_manage_engagement` / `instagram_manage_comments` (Kommentare verwalten – erst bei separatem Auftrag), `instagram_manage_messages`, `pages_messaging` (Direktnachrichten), `ads_management`, `ads_read` (Werbung), `pages_manage_metadata`, Rollen „Admin“ für den System-User.

## Alternative nur für Instagram
„Instagram API mit Instagram-Login“ (Host `graph.instagram.com`): `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`. Funktioniert ohne Facebook-Seite, deckt aber Facebook nicht ab – daher nicht empfohlen. Das Skript ist auf `graph.facebook.com` ausgelegt.

## Was Claude in der Umgebung braucht
- Netzwerk-Geheimnis für `graph.facebook.com` (Header `Authorization: Bearer <Token>`), hinterlegt über das sichere Formular.
- Erlaubter Netzwerkzugriff auf `graph.facebook.com` (wird mit dem Geheimnis freigegeben).
- Für Instagram-Bilder: öffentlich erreichbare Bild-URL (z. B. GitHub Pages nach Push auf `main` – nur mit deiner Freigabe – oder ein anderer Ablageort deiner Wahl).
