# Bewertung externer Skills (18.11.2026)

Kriterien: Qualität · Aktualität · Kompatibilität mit Ruin Walk/Claude Code · Sicherheit (Skripte, Netzzugriffe, Datenabfluss) · tatsächlicher Nutzen. Alle Kandidaten wurden vor der Entscheidung vollständig heruntergeladen und gelesen (in einem isolierten Arbeitsordner, nichts ausgeführt).

## Übernommen
| Skill | Quelle | Lizenz | Prüfung | Anpassung |
|---|---|---|---|---|
| `supabase` | github.com/supabase/agent-skills (Commit c9be0e9, 02.10.2026) | MIT | nur Markdown, keine Skripte; offizielle Supabase-Quelle; Sicherheits-Checkliste (RLS, SECURITY DEFINER, Views, Tokens) deckt sich mit Projektpraxis | Ruin-Walk-Hinweis vorangestellt (kein CLI-Projekt, keine schreibenden Live-Aufrufe ohne Freigabe); Feedback-Funktion entfernt, weil sie Issues in einem fremden Repo anlegen würde |
| `supabase-postgres-best-practices` | dto. | MIT | 35 Referenzdateien, nur Markdown; Regeln zu RLS-Performance, Locks, SKIP LOCKED, Indizes passen direkt zu `schema.sql` und `rwi` | Hinweis auf `ruinwalk-db-aenderung` vorangestellt |

## Selbst erstellt nach der ständigen Erlaubnis (18.11.2026)
| Skill | Zweck | Prüfung |
|---|---|---|
| `ruinwalk-projektpflege` | Ordnung, Inventar, Archivierung, Abgleichpflicht, Schutz laufender Arbeit | eigenes Werkzeug `inventar.js` (nur lesend: git und Dateisystem, kein Netz); Konsistenz mit `rw-architekt` abgeglichen; `team-check.js` |
| `ruinwalk-pixelart` + Agent `rw-pixelart` | Pixel-Art auf Profi-Niveau (Figuren, Items, Status, Monster) | eigenes Werkzeug `pixel.py` (nur Pillow, lokal, kein Netz): Raster→PNG, verlustfreier Import, Qualitätsprüfung, Vorher/Nachher-Bogen; Regeln aus dem gemessenen Bestand. Keine fremden Bilder, keine Online-Bildgeneratoren |

## Geprüft und verworfen
| Kandidat | Grund |
|---|---|
| anthropics/skills `webapp-testing` (Apache-2.0) | Python-Playwright; das Projekt hat einen ausgereiften Node-Playwright-Harness – eigener Skill `ruinwalk-mobile-check` nutzt diesen und ist mit den bestehenden Tests konsistent |
| anthropics/skills `frontend-design` (Apache-2.0) | gute Gestaltungsprinzipien, rät aber gezielt von dunklen Serif-/Gold-Looks ab – Ruin Walk hat bereits eine feste Bildsprache; Widerspruch zum Markenleitfaden vermeiden. Bei einem späteren UI-Redesign erneut prüfen |
| anthropics/skills `canvas-design` (5,6 MB, Apache-2.0) | erzeugt freie Kunst-Poster; Ruin Walk braucht Grafiken aus echten Spielassets → eigener Skill `ruinwalk-grafik` |
| anthropics/skills `theme-factory`, `brand-guidelines` | allgemeine bzw. Anthropic-eigene Themen, kein Bezug |
| sergebulaev/instagram-skills (MIT, sehr aktiv) | solide Grundsätze (wenige, passend große Hashtags, Freigabe vor Veröffentlichung), aber englisch und generisch; Datenteil liest Instagram über den Drittanbieter Apify (Scraping, Token, Datenabfluss). Gute Grundsätze sind in `ruinwalk-social-content` und `09_hashtags_keywords.md` eingeflossen |
| social-media-skills/skills (106 Skills) | zu breit (TikTok, LinkedIn, Pinterest, Musik-KI …), viele Überschneidungen und widersprüchliche Anweisungen – „nicht möglichst viele Skills“ |
| hyperfx-ai/marketing-skills | setzt proprietären „Hyper MCP“ eines Drittanbieters voraus (Daten und Tokens laufen über Dritte) |
| Game-Dev-Sammlungen (z. B. Unity-, Roblox-, Defold-Pakete, Agenten-„Studios“ mit 40+ Agenten) | engine-spezifisch bzw. generisch; Ruin Walk ist Vanilla-JS + Supabase. Projektspezifische Skills liefern mehr Nutzen |

## Bereits global verfügbar (nicht installiert, nur genutzt)
`skill-creator` (Skills erstellen/verbessern), `code-review`, `security-review`, `simplify`, `docs`, `pdf`, `xlsx` u. a. sind in der Claude-Umgebung eingebaut und stehen allen Agenten der Hauptsitzung zur Verfügung. Empfehlung: `security-review` vor Releases mit Auth-/DB-Bezug, `code-review` als Zweitmeinung neben `rw-qa`.

## Meta-/Social-Connectoren
Kein offizieller Meta-Connector im Claude-Verzeichnis. Gefunden: Windsor.ai, Supermetrics, Zapier, Adspirer (Drittanbieter). Nicht eingerichtet – nur auf ausdrücklichen Wunsch, da Daten über Dritte laufen. Empfohlen: offizielle Graph API mit eigenem System-User (siehe `marketing/meta/`).
