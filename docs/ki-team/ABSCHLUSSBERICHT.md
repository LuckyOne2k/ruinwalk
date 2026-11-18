# Abschlussbericht: Aufbau des KI-Teams für Ruin Walk

Stand: 18.11.2026 · Basis-Commit `8e423a3` · Zweig `ccr-2e014f58-1i6nm4`.
**Nicht verändert:** `index.html`, Sprites, `supabase/`, `server/instance/`, Tests, Workflows, Live-Datenbank. Der Auftrag betraf ausschließlich das Agenten- und Skill-System.

## 1. Kurzfassung
- **8 Agenten**, **12 eigene Skills**, **2 geprüfte externe Skills** (Supabase, MIT), **2 Hooks**, zentrale Projektregeln (`CLAUDE.md`), Wissensbasis Projekt + Marketing.
- **5 eigene Werkzeuge** (alle getestet): Spieldaten-Export, Mobile-Prüfung, KI-Inhalts-Prüfer, Grafik-Renderer, Meta-API-Skript mit Freigabesperre. Dazu ein Selbsttest des ganzen Systems (`node .claude/tests/team-check.js`, 408 Prüfungen grün).
- **Marketing vorbereitet:** Strategie, Marke, Zielgruppen, Instagram- und Facebook-Konzept, 30-Tage-Kalender, 22 Content-Ideen, Vorlagen, Hashtags, Community-Plan, Gameplay-/Update-Plan, Anleitung zur Meta-Anbindung, 3 freigabefertige Beitragsentwürfe, 10 gerenderte Grafiken aus echten Spielassets.
- **Sicherheit:** Veröffentlichungen, Schreibzugriffe auf die Live-Datenbank und Push auf `main` lösen immer eine Rückfrage an Pascal aus (Hook, auch im Auto-Modus).

## 2. Ergebnis der Projektanalyse (Kurz)
| Bereich | Stand |
|---|---|
| Client | eine Datei `index.html` (3.108 Zeilen, Vanilla JS, Leaflet). Solo-Echtzeitkampf im Browser. GPS, Lebensräume aus OSM, Gebietsstufen 1–5, 50 Monster, 4 Klassen/12 Pfade, Sets, Crafting, 4 Quests |
| Backend | Supabase: Konten, 3 Charakterplätze, Cloud-Spielstand als JSON mit Versionsprüfung, RLS überall, Schreiben nur per SECURITY-DEFINER-RPC, Sicherungen, Kontolöschung |
| Instanzkampf | isolierter Prototyp (`server/instance/`, Schema `rwi`), deterministische Engine, Gruppenverwaltung, Eventende, Rollenrechte; lokal getestet, nicht live |
| Tests | `npm test` 229/229 grün (vor und nach dem Aufbau), SQL-Tests, 14 Instanzkampf-Suites, CI für Instanzkampf/Schema |
| Deployment | GitHub Pages bei Push auf `main`, **ohne** Testlauf |
| Lücken (dokumentiert, nicht behoben) | keine Master-Roadmap-Datei; `INSTANZKAMPF_PLAN.md` fehlt im Repo; CI prüft `index.html`-Änderungen nicht |

## 3. Installierte externe Skills
| Skill | Quelle | Prüfung | Anpassung |
|---|---|---|---|
| `supabase` | supabase/agent-skills, MIT | nur Markdown, offizielle Quelle | Projekt-Hinweis vorangestellt, Feedback-Funktion (Issues in fremdem Repo) entfernt |
| `supabase-postgres-best-practices` | dto. | nur Markdown, 35 Regeln | Projekt-Hinweis vorangestellt |

Verworfen (mit Begründung in `SKILL_BEWERTUNG.md`): webapp-testing, frontend-design, canvas-design, theme-factory, instagram-skills (Drittanbieter-Scraping), social-media-skills (106, zu breit), hyperfx (proprietärer Dritt-Connector), Engine-spezifische Game-Dev-Pakete.

## 4. Selbst entwickelte Skills
| Skill | Kern | Getestet |
|---|---|---|
| `ruinwalk-projektwissen` | belegte Wissensbasis (Architektur, Spielsysteme, DB, Roadmap, Doku-Index) | Fakten im Selbsttest gegen `index.html` geprüft |
| `ruinwalk-ablauf` | Zuständigkeiten und Standardabläufe | Erkennung in frischer Sitzung |
| `ruinwalk-instanzkampf` | eingefrorene Architektur, Sicherheitsgrenze, Prüfliste, Pflichttests | Agententest „Eventende pausieren“ (Abschnitt 8) |
| `ruinwalk-db-aenderung` | Migration/Rollback/Rechte/Tests/Freigabe | – (Ablauf) |
| `ruinwalk-tests` | alle Suites, CI, Mutationsprobe | Agententest QA |
| `ruinwalk-balancing` | Formeln, Prüfregeln + `spieldaten-export.js` | Export: 50 Monster × 5 Stufen, 12 Pfade, 46 Sets |
| `ruinwalk-mobile-check` | UX-Regeln + `mobile-check.js` | 24 Ansichten, Mutationsprobe (`RW_MOBILE_PROBE=1`) erkannt |
| `ruinwalk-ki-inhalte` | Weltkanon, Vorschlagsformat + `inhalt-pruefen.js` | gutes Beispiel 0 Fehler, schlechtes 6 Fehler erkannt |
| `ruinwalk-marke` | Markenleitfaden, Wahrheitsregeln | Agententest Marketing |
| `ruinwalk-social-content` | Ablauf Thema → Freigabe | Agententest Marketing |
| `ruinwalk-grafik` | Vorlage + `render.js` (Post/Story/Quadrat/Banner, JPG/PNG, Schriften lokal) | 10 Startgrafiken gerendert und gesichtet |
| `ruinwalk-meta-publishing` | Meta-Anbindung + `meta-api.js` | Entwurf abgelehnt, freigegebene Testkopie nur Trockenlauf, Netzsperre verständlich gemeldet |

## 5. Agenten und Aufgabenverteilung
Siehe `UEBERSICHT.md` (Tabelle mit Aufgaben, Rechten, Skills). Prinzip: **genau ein Verantwortlicher je Thema**, Prüfung durch einen zweiten (Matrix im Skill `ruinwalk-ablauf`). Zusätzliche Spezialisten (Economy, Balancing, Doku, Release, Analytics, Community) wurden geprüft und **bewusst nicht** als eigene Agenten angelegt – sie sind Teilaufgaben von `rw-gamedesign`, `rw-architekt`, `rw-qa` und `rw-marketing`; eigene Agenten hätten doppelte Zuständigkeiten erzeugt.

## 6. Zusammenarbeit von Agenten und Skills
- **Koordination durch die Hauptsitzung** (Rolle Projektarchitekt, verankert in `CLAUDE.md`). Claude-Code-Subagenten können keine weiteren Subagenten starten; deshalb plant `rw-architekt`, und die Hauptsitzung ruft die Spezialisten in der geplanten Reihenfolge auf und reicht Ergebnisse weiter.
- **Gemeinsames Wissen:** Jeder Agent lädt `ruinwalk-projektwissen` vor; Fachskills werden je Agent vorgeladen (Frontmatter `skills:`).
- **Gegenprüfung:** Code → `rw-qa`; Rechte/Identität → `rw-backend-security`; Belohnungen aus KI-Inhalten → `rw-gamedesign`; Gameplay-Material für Marketing → `rw-mobile-ux`.
- **Gemeinsames Berichtsformat** (Ergebnis, Dateien, Tests, Entscheidungen für Pascal, Risiken).

## 7. Sicherheitsprüfungen
| Prüfung | Ergebnis |
|---|---|
| Fremde Skills vor Übernahme vollständig gelesen, Skripte/Netzaufrufe geprüft | 2 übernommen (nur Markdown), Rest verworfen; nichts Fremdes ausgeführt |
| Secrets-Scan aller neuen Dateien (Meta-, Supabase-, GitHub-Tokenmuster) | keine Funde (Selbsttest) |
| Hook `schutz.js` mit 14 Fällen (Meta-Senden/POST, SQL lesend/schreibend inkl. versteckter DELETE in CTE und Mehrfachanweisung, Migration, Edge Function, Push auf main, harmlose Fälle) | alle korrekt |
| Rechte der Agenten | Architekt nur lesend; Marketing ohne Datenbankwerkzeuge; Backend Live-DB nur lesend (Hook fragt bei allem Schreibenden) |
| Live-Datenbank | nicht verändert, nicht abgefragt |
| Spielcode, Schema, Tests, Workflows | unverändert (`git status` zeigt nur neue Dateien) |
| Veröffentlichungen | keine; Meta-Skript dreifach gesperrt (Status-Prüfung, `--senden`, Hook-Rückfrage) |
| Pauschales Überspringen der Rechteprüfung für Agententests | wurde von der Umgebung abgelehnt → Tests stattdessen mit eng begrenzter Werkzeugliste in isolierter Repo-Kopie |

## 8. Funktionstests
| Test | Ergebnis |
|---|---|
| Frische Claude-Code-Sitzung erkennt Agenten/Skills | alle 8 Agenten und 14 Skills erkannt |
| Selbsttest `team-check.js` (Frontmatter, Verweise, Werkzeuge, Hooks, Doku, Fakten, Secrets) | 408/408; Mutationsprobe (falscher Skill-Name) erkannt |
| `npm test` nach dem Aufbau | siehe unten |
| Agententests (isolierte Kopie, echte Aufgaben) | siehe unten |

Ergebnisse der Agententests werden nach Abschluss ergänzt.

## 9. Verzeichnisstruktur
```
CLAUDE.md                         Projektregeln, immer geladen
.claude/
  settings.json                   Hooks, Rechte (allow/ask/deny)
  agents/rw-*.md                  8 Agenten
  skills/ruinwalk-*/              12 eigene Skills (+ scripts/, references/, vorlagen/, beispiele/, fonts/)
  skills/supabase*/               2 externe Skills (MIT, angepasst)
  hooks/schutz.js, hinweise.js    Schutz- und Hinweis-Hooks
  tests/team-check.js             Selbsttest des Systems
docs/ki-team/                     UEBERSICHT.md, ABSCHLUSSBERICHT.md, SKILL_BEWERTUNG.md
marketing/                        Wissensbasis 01–11, meta/, freigabe/, grafiken/, analyse/, feedback/
.gitignore                        node_modules, .env, Standard-Ausgabeordner der Werkzeuge
```
„Globale Skills“: bewusst keine installiert. Diese Cloud-Umgebung ist flüchtig; alles Dauerhafte liegt im Repo und gilt projektbezogen. Eingebaute globale Skills (`skill-creator`, `code-review`, `security-review` …) werden mitgenutzt.

## 10. Marketing
- **Strategie:** Build in Public, echte Spielgrafik, Community entscheidet mit, Draußen-Bezug, Qualität vor Menge, regional (Augsburg/DACH) zuerst. Ziele 30/90 Tage und 6–12 Monate (`01_strategie.md`).
- **Positionierung:** unabhängiges GPS-RPG im Browser mit echter RPG-Tiefe; engster Vergleich Orna (Community-Nähe als Vorbild).
- **Plattformen:** Instagram = Reichweite/Optik (3 Feed-Beiträge/Woche + Stories), Facebook = Gespräch, Gruppen, Links (2–3/Woche).
- **Vorbereitet:** 30-Tage-Kalender, 22 Ideen, Vorlagen (Captions, Karussell, Reel-Skript, Stories, Facebook, Gruppenbeitrag, Antwortbausteine, Alt-Text), Hashtag-Pools, Community-/Testspieler-Programm, Meilenstein-Kampagnen.
- **Entwürfe zur Freigabe:** `marketing/freigabe/entwuerfe/001–003` mit Grafiken in `marketing/grafiken/entwuerfe/` (Teaser, Karussell „Was ist Ruin Walk?“, Klassen, 2 Stories, Facebook-Titelbild).

## 11. Noch benötigte Zugriffsrechte und Schritte (Pascal)
1. Instagram-Profikonto und Facebook-Seite anlegen, im Meta-Business-Portfolio verbinden (`marketing/meta/ANBINDUNG.md`, Stufe 1).
2. Optional API: Meta-App (Business), System-User mit Rolle Mitarbeiter, Token mit den Rechten aus `marketing/meta/BERECHTIGUNGEN.md` (zuerst nur lesen; Veröffentlichen später). Token über das sichere Formular als Netzwerk-Geheimnis für `graph.facebook.com` hinterlegen – nie in den Chat.
3. `marketing/meta/config.json` mit Seiten-ID anlegen (keine Geheimnisse).
4. Für lokale Nutzung von Claude Code: einmal interaktiv starten und dem Arbeitsordner vertrauen, sonst ignoriert Claude die `allow`-Regeln der Projekteinstellungen (Hooks und Agenten funktionieren trotzdem).

## 12. Offene Punkte und Einschränkungen
1. **Öffentliches Repository + GitHub Pages veröffentlicht das ganze Verzeichnis:** Marketing-Strategie und Entwürfe sind öffentlich lesbar (auch unter der Pages-Adresse). Entscheidung nötig: so lassen, Entwürfe außerhalb des Repos halten oder `pages.yml` auf Spieldateien beschränken (Änderung am Deployment, daher nicht eigenmächtig gemacht).
2. **Master-Roadmap fehlt als Datei**, `INSTANZKAMPF_PLAN.md` liegt nicht im Repo. Die Roadmap ist aus den vorhandenen Dokumenten zusammengeführt (`ruinwalk-projektwissen/references/roadmap.md`). Empfehlung: Plan-Datei ergänzen.
3. **Meta-API ungetestet gegen echte Konten** (keine Accounts). Skript ist im Trockenlauf und bei Netzsperre geprüft; API-Version und Berechtigungsnamen vor dem ersten echten Lauf gegen die aktuelle Meta-Doku prüfen.
4. **Rechtliches:** Impressum/Datenschutz für Social-Media-Profile und Landingpage klären (Hinweis, keine Rechtsberatung).
5. **CI-Lücke:** `pages.yml` deployt ohne Tests; `index.html`-Änderungen lösen keinen CI-Lauf aus. Vorschlag (nicht umgesetzt): Pages-Deploy erst nach grünem `npm test`.
6. **UX-Hinweise aus der Mobile-Prüfung** (nicht geändert): Schließen-Knopf 33×32 px und mehrere Listenknöpfe 32–33 px hoch – unter der 40-px-Regel.
7. **MCP-Werkzeugnamen** hängen von der Umgebung ab (hier `mcp__Supabase__…`). Der Hook erkennt jeden Servernamen mit „supabase“; die Werkzeugliste des Backend-Agenten muss lokal ggf. angepasst werden.
8. **Testgrenzen der Werkzeuge:** Mobile-Prüfung ohne echte Kartenkacheln/GPS und ohne Kampfansicht; Determinismus lokal nur mit Node (Bun/Deno prüft die CI).
9. **Fehlende Fähigkeiten (bewusst später):** Analyse-Anbindung für Spielzahlen (bewusst kein Tracking), Discord/Community-Ort, Video-Schnitt-Automatisierung, Presse-Mappe, Anzeigenmanagement (separater Auftrag mit Budget).
10. **Offene Produktentscheidungen** (für Agenten gesperrt): Attribute/Talente, Hauptgeschichte vs. Sandbox, D1–D5 Instanzkampf, Questbelohnungs-Obergrenzen, Preis Platz 3, Community-Ort (Discord oder Facebook-Gruppe).
