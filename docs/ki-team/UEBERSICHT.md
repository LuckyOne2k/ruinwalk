# Ruin Walk – KI-Team: zentrale Übersicht

Stand 18.11.2026. Hier steht jederzeit, welche Agenten und Skills es gibt, was sie tun und wie du sie nutzt.
Ausführlicher Aufbaubericht: `ABSCHLUSSBERICHT.md`. Bewertung fremder Skills: `SKILL_BEWERTUNG.md`.

## So benutzt du das Team
Einfach die Aufgabe in Claude Code beschreiben – die Hauptsitzung (Rolle Projektarchitekt) wählt die passenden Agenten. Du kannst sie auch direkt ansprechen:
- „Lass **rw-architekt** planen, wie wir Questketten einbauen.“
- „**rw-qa**: prüf bitte den letzten Commit.“
- „**rw-marketing**: bereite die Beiträge für Woche 1 vor.“
- Skills direkt aufrufen: `/ruinwalk-ablauf`, `/ruinwalk-tests`, `/ruinwalk-grafik` …

Du entscheidest und gibst frei. Ohne deine Freigabe passiert nichts an der Live-Datenbank und kein Push auf `main`. Instagram-Beiträge postet `rw-marketing` im Modus `autonom` selbst (Not-Aus: „Marketing pausieren“).

## Agenten (`.claude/agents/`)
| Agent | Aufgabe | Darf | Vorgeladene Skills |
|---|---|---|---|
| `rw-architekt` | Gesamtarchitektur, Planung, Abhängigkeiten, Konsistenz, wählt Spezialisten | nur lesen | projektwissen, ablauf, instanzkampf |
| `rw-backend-security` | Supabase, PostgreSQL, RLS, RPCs, Migrationen, Sicherheitsreviews, Datenintegrität | Code/SQL ändern; Live-DB nur lesen | projektwissen, db-aenderung, supabase, supabase-postgres-best-practices, tests |
| `rw-gamedesign` | Mechaniken, Klassen, Fähigkeiten, Kampfwerte, Balancing, Loot, Wirtschaft, Crafting, Progression | Client-Code ändern | projektwissen, balancing, tests |
| `rw-instanzkampf` | Gruppen, Dungeons, Weltboss, Rundenkampf-Engine, Fristen, Eventende, Manipulationsschutz | `server/instance/` ändern (Schutzregeln!) | projektwissen, instanzkampf, tests, supabase-postgres-best-practices |
| `rw-welt-ki` | Welt, Quests, NPCs, Geschichten, KI-generierte Inhalte mit Validierung | Vorschläge/Dateien erstellen | projektwissen, ki-inhalte, balancing |
| `rw-qa` | Tests, Regression, Review, Mutationsproben, CI, Sicherheitsprüfung – unabhängig | Tests schreiben, alles prüfen | projektwissen, tests, instanzkampf, mobile-check |
| `rw-mobile-ux` | Hochformat, Touch, Responsive, Performance, Screenshots | UI/CSS ändern | projektwissen, mobile-check, tests |
| `rw-marketing` | Marke, Instagram/Facebook, Content, Grafiken, Kalender, Community, Analyse | Entwürfe erstellen; Instagram-Beiträge selbst posten im Modus `autonom` | projektwissen, marke, social-content, grafik, meta-publishing |

**Bewusst keine eigenen Agenten** für Economy, Balancing, Doku, Release, Analytics, Community: Das sind Teilaufgaben bestehender Agenten (gamedesign, architekt, qa, marketing). Eigene Agenten würden doppelte Zuständigkeiten erzeugen.

## Skills (`.claude/skills/`)
| Skill | Art | Inhalt | Werkzeug |
|---|---|---|---|
| `ruinwalk-projektwissen` | Wissensbasis | Architektur, Spielsysteme mit Zahlen, Datenbank, Roadmap, Doku-Wegweiser | – |
| `ruinwalk-ablauf` | Arbeitsablauf | Zuständigkeitsmatrix, Abläufe Feature/Bugfix/DB/Instanzkampf/Balancing/KI-Inhalt/Marketing/Release | – |
| `ruinwalk-instanzkampf` | Schutzregeln | eingefrorene Architektur, Sicherheitsgrenze, Prüfliste, Pflichttests | – |
| `ruinwalk-db-aenderung` | Arbeitsablauf | Migration, Rollback, Rechte, Tests, Prüfbericht, Freigabe | – |
| `ruinwalk-tests` | Wissen | alle Test-Suites, CI, Mutationsprobe | – |
| `ruinwalk-balancing` | Methode + Werkzeug | Formeln, Prüfregeln, Export der echten Spieldaten | `scripts/spieldaten-export.js` |
| `ruinwalk-mobile-check` | Werkzeug + Regeln | Mobile-Prüfung 320–412 px mit Screenshots | `scripts/mobile-check.js` |
| `ruinwalk-ki-inhalte` | Methode + Werkzeug | Weltkanon, Vorschlagsformat, Validierung gegen Spieldaten | `scripts/inhalt-pruefen.js` |
| `ruinwalk-marke` | Leitfaden | Positionierung, Ton, Farben, Schriften, Wahrheitsregeln | – |
| `ruinwalk-social-content` | Arbeitsablauf | vom Thema zur Freigabe, Caption-Aufbau, Regeln | – |
| `ruinwalk-grafik` | Werkzeug | Post/Story/Quadrat/Banner aus echten Assets | `scripts/render.js`, `scripts/sprites-export.js`, `vorlagen/vorlage.html` |
| `ruinwalk-meta-publishing` | Werkzeug + Anleitung | Meta-Anbindung, Status, Insights, Veröffentlichen mit Freigabesperre | `scripts/meta-api.js` |
| `supabase` | extern (Supabase, MIT) | Plattformwissen, Sicherheits-Checkliste | – |
| `supabase-postgres-best-practices` | extern (Supabase, MIT) | Postgres-Regeln (RLS, Locks, Indizes …) | – |

Global (in Claude eingebaut, nicht im Repo): `skill-creator`, `code-review`, `security-review`, `simplify` u. a.

## Wissensbasen
- **Projekt:** `CLAUDE.md` (immer geladen) + Skill `ruinwalk-projektwissen` + `docs/`.
- **Marketing:** `marketing/` (Strategie, Marke, Zielgruppen, Konzepte, Kalender, Ideen, Vorlagen, Hashtags, Community, Gameplay-Plan, Meta, Freigabe, Analyse, Feedback).

## Automatische Abläufe (Hooks, `.claude/settings.json`)
| Hook | Wann | Wirkung |
|---|---|---|
| `hooks/schutz.js` | vor Bash-, Datei- und MCP-Aufrufen | Rückfrage an dich bei: Änderung des Veröffentlichungsmodus, Meta-Schreibzugriff außerhalb des Modus `autonom`, schreibendem SQL/Migration/Edge Function am Live-Supabase, `git push` auf `main` |
| `hooks/hinweise.js` | nach Dateiänderungen | erinnert Claude an die passenden Tests/Regeln (Instanzkampf, SQL, index.html, Freigaben, Team-Dateien) |

Selbsttest des ganzen Systems: `node .claude/tests/team-check.js`

## Ständige Erlaubnis (18.11.2026)
Claude darf ohne Rückfrage Agenten anlegen/verbessern und Skills erstellen oder (nach Prüfung) herunterladen. Jede solche Änderung wird hier und in `SKILL_BEWERTUNG.md` nachgetragen.

## Freigaben, die nur du erteilst
1. Den Veröffentlichungsmodus (`marketing/meta/modus.json`: `autonom` | `freigabe` | `pause`). Aktuell `autonom` für Instagram; Facebook, Kommentare und Nachrichten weiter nur mit deiner Freigabe.
2. Änderungen an der Live-Datenbank.
3. Änderungen an eingefrorenen Teilen der Instanzkampf-Architektur.
4. Push/Merge auf `main` (= Deploy).
5. Produkt-/Designentscheidungen (offene Liste in `ruinwalk-projektwissen/references/roadmap.md`).

## Offene Punkte
Siehe `ABSCHLUSSBERICHT.md`, Abschnitt „Offene Punkte und Einschränkungen“.
