# Dev-Freigabe: Read-only-Vorabprüfung

Geprüft: Branch `nacht/operator-edge-function`, Commit `afc5dfb`. Datum 18.11.2026.
Vorgehen: nur Lesen und lokale Rechenläufe. Dev, Production, Secrets, Edge-Deployment, `main`, `schema.sql` und `index.html` blieben unberührt. Diese Datei ist das einzige neue Arbeitsbaum-Objekt und ist **nicht committet**.

**Begriffsklärung (verbindlich für diesen Bericht):** Alle bisherigen Edge-Function- und Dev-Skript-Tests laufen gegen **Stubs** (GoTrue-Stub, HTTP-Stub). Sie sind **keine** echten GoTrue-, Deno- oder Supabase-Integrationstests. Lokal vorhanden ist kein Deno (nur Bun), `index.ts` wurde also **nie ausgeführt und nie typgeprüft**. Übersprungene Tests werden nicht als bestanden gewertet.

## 1. Gesamtempfehlung

**BEDINGTE FREIGABE, ausschließlich für die Datenbankinstallation auf Dev** (Abschnitt 6, Phase A).
**KEINE FREIGABE** für das Deployment der Edge Function und für die Ausführung des Dev-Workflows, bis die Korrekturen K1–K8 umgesetzt und erneut geprüft sind.

| Bereich | Status |
|---|---|
| Edge Function (Bereitstellung) | **KEINE FREIGABE** |
| MFA | **BEDINGT** (Test erst mit echtem aal2-Nutzer möglich) |
| Dev-Testkonten | **KEINE FREIGABE** (Skript nicht belastbar) |
| Dev-Workflow | **KEINE FREIGABE** |
| Datenbankinstallation (Phase A) | **BEDINGTE FREIGABE** |

## 2. Edge Function

### Befunde
| # | Befund | Fundstelle | Bewertung |
|---|---|---|---|
| E1 | JWT wird bei GoTrue geprüft (`GET /auth/v1/user` mit `apikey` + `Bearer`), danach `id` als UUID, `sub === id`, `role === 'authenticated'`, `exp` in der Zukunft. Logik plausibel; Signatur, Ablauf und Sitzungsstatus prüft GoTrue, nicht dieser Code. | `supabase/functions/operator/handler.mjs:14–19` | richtig im Entwurf, **real ungeprüft** |
| E2 | `aal` wird aus der Nutzlast gelesen, erst nachdem GoTrue das Token angenommen hat; fehlt der Claim, gilt `aal1` und MFA scheitert (geschlossen im Zweifel). `iss`/`aud` werden nicht selbst geprüft (GoTrue deckt das ab). | `handler.mjs:17–20`, `:49` | in Ordnung |
| E3 | Fremde Betreiber-ID: `operator`, `operator_id`, `account_id` und alle unbekannten Felder machen den Body ungültig (400); `p_operator` stammt nur aus `who.id`. Eine fremde ID kann nicht eingeschleust werden, solange GoTrue das Token nicht fälscht. | `handler.mjs:26`, `:52–54` | in Ordnung (Stub-Test belegt Logik) |
| E4 | `resume`/`terminate`: Berechtigung entscheidet allein `rwi.check_operator` in der Datenbank (aktiv + Umfang); Wrapper nur für `service_role`. Nicht-Betreiber erhalten 403 ohne Grund. | `handler.mjs:59`, `server/instance/sql/03_windows.sql:122–128` | in Ordnung |
| E5 | **Protokollflut:** Jeder angemeldete Nutzer (Registrierung ist offen) kann mit gültigem Body beliebig oft einen `denied`-Eintrag im anhängenden `ops_log` erzeugen; kein Limit, keine Zusammenfassung. | `03_windows.sql:127`, `handler.mjs:48–54` | **mittel** (Speicherwachstum, Lärm im Protokoll) |
| E6 | **Unbegrenztes Lesen des Bodys:** `await req.text()` liest vor dem Limit (`rawBody.length > 4096`, Zeichen statt Bytes) und vor der Authentifizierung. | `index.ts:18`, `handler.mjs:46` | niedrig–mittel |
| E7 | `config.toml` liegt in `supabase/functions/operator/`. Nach meinem Kenntnisstand liest die Supabase-CLI Funktionseinstellungen aus `supabase/config.toml` (`[functions.operator]`); dieses Projekt hat keine solche Datei. `verify_jwt` ist beim Deployment ohnehin standardmäßig an, die Datei ist aber wirkungslos und der Test darauf (`operator-edge.mjs:108`) beweist nichts. Bei neuen asymmetrischen Signaturschlüsseln des Projekts kann das Gateway-`verify_jwt` zusätzlich Anmeldungen ablehnen. | `config.toml:1–3`, `operator-edge.mjs:108` | mittel, **real klären** |
| E8 | Aufruf der Wrapper mit `apikey: svc` und `authorization: Bearer svc`. Bei den neuen Schlüsselformaten (`sb_secret_…`) ist das nicht gesichert; ebenso unklar, ob `SUPABASE_ANON_KEY` im Projekt noch ein altes JWT-Format liefert. | `index.ts:6`, `:11` | mittel, **real klären** |
| E9 | Fehlerpfade: 502 liefert nur `backend_error`; Log enthält Ereignis, Betreiber-ID, Aktion, Kampf, Status, nie Token oder Schlüssel. 403 unterscheidet `mfa_required` und `forbidden`; das verrät nur, dass MFA verlangt wird, nicht den Betreiberstatus. 400 vor 403 (Validierung vor Berechtigung) ist unkritisch. | `handler.mjs:49`, `:56–59` | in Ordnung |
| E10 | `service_role`-Schlüssel wird nur im Funktionsprozess aus der Umgebung gelesen, nie zurückgegeben. Die Tests dazu sind teils **statische Textprüfungen** (reguläre Ausdrücke auf `index.ts`), kein Laufzeitnachweis. | `index.ts:6`, `operator-edge.mjs:107` | in Ordnung im Entwurf, Nachweis schwach |
| E11 | Kein `OPTIONS`/CORS; Aufruf aus einer Webseite scheitert. Für Server-zu-Server/`curl` unerheblich. Fehlende Umgebungsvariablen führen zu 401/502 (geschlossen), aber ohne Startprüfung. | `index.ts:6–25` | niedrig |

### Fehlende reale Tests (alle offen)
1. Echtes GoTrue: gültiges Token (Nutzlast-Felder, `aal`, `session_id`), abgelaufenes, widerrufenes (Abmeldung), manipuliert, anderes Projekt, Anon-Key als Bearer, Rolle `service_role`, anonyme Anmeldung.
2. Echter Deno-Lauf: `deno check` und Start von `index.ts`, Import `./handler.mjs`, `atob`, `fetch` zur eigenen Projekt-URL.
3. Gateway: Verhalten mit `verify_jwt` an/aus, mit alten und neuen JWT-Signaturschlüsseln.
4. Aufruf der A1-Wrapper über echtes PostgREST mit dem echten Servicerolle-Schlüssel (Format, Header).
5. Echte Rechte: `anon`/`authenticated` können `rw_ops_*` und `rwi.*` nicht erreichen (Katalog + REST).
6. Echter Betreiberfluss: Konto mit MFA, Betreiberzeile per SQL, resume/terminate auf einem echten stuck-Kampf, `ops_log`.

## 3. MFA

- **Setzung für Dev:** `OPERATOR_REQUIRE_MFA` **nicht setzen** (Standard = MFA verlangt). Nur die exakte Zeichenfolge `false` schaltet die Prüfung ab (`index.ts:9`); `FALSE`, `0` usw. lassen MFA an. Den Wert setzt du, nicht ich; für die Abnahme sollte er nie `false` sein. Ein Test ohne MFA (`false`) ist nur als vorübergehende Fehlereingrenzung sinnvoll und danach zu entfernen.
- **Funktioniert es mit echtem aal2?** Nicht belegt. Der Code erwartet im Token `aal: "aal2"`, wie ihn GoTrue nach erfolgreicher TOTP-Verifizierung ausstellt. Bisher nur mit selbstgebauten Stub-Tokens getestet.
- **Voraussetzungen für einen reproduzierbaren Test (Vorschlag, nichts davon gebaut):**
  1. Dev-Auth: TOTP-MFA aktiviert (Dashboard-Einstellung, deine Entscheidung).
  2. Ein dauerhaftes Betreiber-Testkonto (eigene Adresse, bestätigt), per SQL als Betreiber eingetragen (`rwi.set_operator`).
  3. Pro Lauf: Faktor anmelden (`POST /auth/v1/factors`), Challenge, Code aus dem Faktor-Geheimnis nach RFC 6238 berechnen (nur im Speicher), verifizieren (`…/verify`); das neue Token trägt `aal2`. Am Ende Faktor wieder entfernen.
  4. Negativfälle: Token vor der Verifizierung (`aal1`) → 403 `mfa_required`; Nicht-Betreiber mit `aal2` → 403 `forbidden`.
  5. Ein echter stuck-Kampf auf Dev (serverseitig vorbereitet) für den positiven `resume`/`terminate`.

## 4. Dev-Testkonten

### Wie es gedacht ist (`supabase/dev/real-test.mjs`)
Anlegen: `POST /auth/v1/signup` mit Anon-Key (Zeile 41–45). Löschen: anmelden, dann `rpc('delete_account', {p_confirm: <Benutzername>})` mit dem eigenen Token (Zeile 35–38). Das benötigt **keine** Admin-Rechte: `delete_account` ist eine Funktion des eigenen Kontos (`supabase/schema.sql:221–249`; erneute Passwortanmeldung ≤ 2 Minuten, Bestätigung = eigener Benutzername). Sie kann nur `auth.uid()` löschen. Auch der Anmeldezeitpunkt liegt direkt vor dem Löschen, die Bedingung ist also erfüllbar. **Real nicht getestet** (nur lokal im Rollenstub und im HTTP-Stub).

### Befunde
| # | Befund | Fundstelle | Bewertung |
|---|---|---|---|
| T1 | **Nur eindeutig markierte Konten betroffen:** Löschen trifft nur die Konten dieses Laufs (`acct.A/B`, E-Mail `rwtest-<Lauf>-a@rwtest.invalid`, Name `rwt_<Lauf>_a`); fremde Konten können über `delete_account` nicht erreicht werden. `cleanup_test_accounts.sql` löscht dagegen **alle** `%@rwtest.invalid` (nur mit Bestätigung, Superuser-Weg). | `real-test.mjs:31`, `:35–38`, `cleanup_test_accounts.sql` | in Ordnung |
| T2 | **Aufräumen wird nicht als Fehler gewertet:** Scheitert Anmeldung oder `delete_account` im Cleanup, gibt es nur `HINWEIS`; der Lauf endet trotzdem mit Exit 0, wenn alle Schritte vorher grün waren. Verwaiste Konten bleiben unbemerkt. | `real-test.mjs:37–38`, `:101` | **hoch** |
| T3 | **Abbruch bei aktiver E-Mail-Bestätigung (Exit 3) hinterlässt Konten:** Konto A ist angelegt, aber unbestätigt; Anmeldung im Cleanup scheitert, Konto bleibt, anon kann es nicht löschen. Jeder Versuch erzeugt ein weiteres verwaistes Konto und eine Bestätigungs-Mail an `rwtest.invalid` (Rücklauf, Mail-Limits der Dev-Instanz). | `real-test.mjs:41–47` | **hoch** |
| T4 | Ohne bestätigte E-Mail ist `create_character` ohnehin verboten (`is_verified`, `schema.sql:92–94`). Der Test funktioniert also nur, wenn Dev die Bestätigung **abschaltet**. Ob GoTrue die Domain `rwtest.invalid` bei der Registrierung annimmt, ist ungeprüft. | `schema.sql:92–94`, `real-test.mjs:31` | hoch (Vorbedingung, deine Entscheidung) |
| T5 | Wird ein Kontoanlegen vom Server ausgeführt, aber die Antwort geht verloren (Zeitüberschreitung), ist `a.created` nicht gesetzt; das Konto bleibt unbemerkt. | `real-test.mjs:42–45` | niedrig |
| T6 | Wiederholung: Laufkennung (4 Zufallsbytes) verhindert Namenskollisionen; ein abgebrochener Lauf blockiert den nächsten nicht. Erkennen verwaister Konten: `supabase/dev/list_test_accounts.sql` (nur lesen); Löschen nur über `cleanup_test_accounts.sql` mit Freigabe. | `real-test.mjs:11`, `list_test_accounts.sql` | in Ordnung |

## 5. Dev-Workflow und Skript

### Befunde
| # | Befund | Fundstelle | Bewertung |
|---|---|---|---|
| W1 | **Berechtigungsfehler-Tests können leer bestehen:** `denied` ist „irgendein Nicht-2xx“, also auch Status 0 (Netz), 404 (Funktion fehlt), 5xx. Beispiel: Dev nicht erreichbar oder Wrapper nicht installiert ⇒ „verweigert“. Erwartet werden müssen 401/403 (bzw. dokumentiert 404 für nicht exponierte Schemas) plus eine Positivkontrolle. | `real-test.mjs:29`, `:81–87` | **hoch** |
| W2 | **Gruppenaktion falsch gebaut:** Das Skript sendet `{type:'standard'}`; `rwi.submit_action` verlangt `ability` (1–40 Zeichen), sonst `invalid`. Die Prüfung akzeptiert aber **jeden** Status-Text, auch `invalid`. Ebenso sind „Ready“ (`status !== 'error'`) und „Instanzansicht“ (irgendein Objekt) zu schwach. | `real-test.mjs:68–74`, `server/instance/sql/03_windows.sql:209–222` | **hoch** (falsch-positiv) |
| W3 | **Positive Gruppenschritte sind mit diesem Entwurf nicht ausführbar:** Instanzen entstehen nur über `rwi.create_group` mit **bereits vorhandenen, berechtigten** Charakteren (Dungeon ≥ 2 Spieler, Special/Weltboss ≥ 6 verschiedene Konten); der Testcharakter eines Laufs existiert erst danach. Beitritt zu Mehrkampf-Instanzen führt auf die Warteliste (`waitlisted`), nicht `joined`. Eine Aktion setzt voraus, dass der Charakter im **gestarteten** Kampf steht, der Start (`rw_worker_start_fight`) braucht aber `service_role`. Frische Konten pro Lauf und feste `DEV_TEST_FIGHT/ROUND` passen nicht zusammen. | `04_gruppe.sql:176–196`, `:200–230`; `real-test.mjs:66–75` | **hoch** (Konzeptfehler) |
| W4 | **Übersprungenes wird als Erfolg ausgeliefert:** Ohne `DEV_TEST_INSTANCE/FIGHT/ROUND` werden Beitritt/Ready/Ansicht/Aktion (positiv) übersprungen, der Lauf endet mit Exit 0, der Workflow ist grün. Der Schritt „Beitritt zu nicht vorhandener Instanz“ ersetzt keinen positiven Test. | `real-test.mjs:12`, `:72`, `:75`, `:101` | **hoch** |
| W5 | **Schlüsselprüfung zu eng:** Der Guard liest den Anon-Key als JWT (`ak.role === 'anon'`, `ref`). Ist der Dev-Key ein neuer `sb_publishable_…`-Schlüssel (so auch im Spielclient), scheitert die Prüfung und der Lauf bricht mit Exit 2 ab. Außerdem sendet das Skript für anonyme Aufrufe `Authorization: Bearer <Anon-Key>`; der Spielclient tut das nicht (nur mit Nutzer-Token). | `real-test.mjs:15–20`, `:25` | mittel |
| W6 | **Falsche Bestätigung ⇒ grüner Lauf:** Ist die `if:`-Bedingung falsch (Eingabe ≠ `dev`), wird der Job übersprungen; GitHub zeigt einen erfolgreichen Lauf ohne Ausführung. | `.github/workflows/dev-test.yml:19` | mittel |
| W7 | Negative Tests sind **scharf gegen Dev**: Wäre `rw_worker_tick` fälschlich für `authenticated` freigegeben, würde der Test einen echten Worker-Tick auslösen. | `real-test.mjs:83–85` | niedrig (nur bei Fehlkonfiguration) |
| W8 | Gut: Environment `dev-test` (Freigabe-Regel muss **in GitHub** eingerichtet sein, ist aus dem Repository nicht prüfbar), Bestätigungseingabe `dev`, nur `workflow_dispatch`, `permissions: contents: read`, Secrets `DEV_SUPABASE_URL`/`DEV_ANON_KEY`, Maskierung, Abbruch bei fehlenden Secrets (`exit 2`), Concurrency-Sperre. URL-Sperre: nur `https` + Host **gleich** `jlkqktmvqxibqdcobbhf.supabase.co` (lokal nur mit `DEV_TEST_ALLOW_LOCAL=1`), Production-Referenz verboten; kein `service_role` im Workflow. Keine Secret-Werte in Skriptausgaben. Der Environment-Zweigfilter (nur geschützte Zweige) fehlt als Empfehlung; wegen öffentlicher Secrets (URL, Anon-Key) niedriges Risiko. | `dev-test.yml:1–47`, `real-test.mjs:13–20` | in Ordnung |
| W9 | Fehler stoppen zuverlässig: erster Fehler bei Registrierung/Login beendet früh (Exit 1), sonst läuft der Rest durch und endet mit Exit 1, wenn `fail > 0`; unerwartete Ausnahmen lösen `finally`-Cleanup aus und beenden den Prozess ungleich 0. | `real-test.mjs:40`, `:95–101` | in Ordnung |

### Erfolgreich vs. übersprungen (Stand heute)
Mit einem Dev-Projekt ohne Testinstanz würden **ausgeführt** (und nur dann aussagekräftig, wenn W1/W5 behoben): Registrierung, Login, JWT-Form, Charaktererstellung/-liste/-laden, Fremdzugriff, Wiederverbindung (Charakterliste), Berechtigungsfehler (mit Schwächen), Charakterlöschung, Konto löschen. **Übersprungen** werden: Gruppenbeitritt, Ready, Instanzansicht, Gruppenaktion (positiv) und die Ansicht nach Wiederverbindung. Diese gelten als **nicht getestet**.

### Benötigte Testinstanz und Testkampf (Anforderungsbild)
Nötig ist ein serverseitig vorbereiteter Rahmen, der **vor** dem Lauf steht: 6 dauerhafte Dev-Testkonten mit je einem berechtigten Charakter (`create_group` verlangt 6–8 verschiedene Konten für Special/Weltboss; Dungeon 2–4, dann aber `waitlisted` statt `joined`), eine Instanz der Art `special` mit einem Kampf im Zustand `ready`, in der die Testcharaktere eines Laufs beitreten können. Für „Gruppenaktion“ muss zwischen „Ready“ und „Aktion“ ein serverseitiger Schritt (`rw_worker_start_fight` mit `service_role`) liegen. Das ist mit frischen Konten pro Lauf und ohne `service_role` im Workflow **nicht in einem Lauf** erreichbar. Realistisch: Gruppenschritte als getrennten, lokalen Lauf mit dauerhaften Testkonten und deinem Schlüssel (nicht in GitHub) oder Zwei-Phasen-Ablauf. Entscheidung nötig.

## 6. Installation: exakte Reihenfolge (nichts davon ausgeführt)

### Phase 0: Vorbereitung (nur Lesen/Entscheiden)
1. Bestätigen, dass das Zielprojekt `ruinwalk-dev` (`jlkqktmvqxibqdcobbhf`) ist; Production (`malbiahllucctiafzydv`) nie.
2. Inhalt von Dev lesend prüfen (Tabellen, vorhandene Funktionen, Rollen); Preflight-SQL (`supabase/dev/00_preflight.sql`) schreibt nichts.
3. Entscheidungen: E-Mail-Bestätigung für Dev, TOTP-MFA in Dev, JWT-/API-Schlüsselformat (alt/neu), `OPERATOR_REQUIRE_MFA` (Standard belassen).
**Vorher beseitigt sein muss:** Zielprojekt eindeutig, Stand von `afc5dfb` (oder später freigegebener Commit) festgelegt, schriftliche Freigabe von dir.

### Phase A: Datenbankinstallation (BEDINGTE FREIGABE)
1. `bash supabase/dev/build.sh` erzeugt `install_dev.sql`; Hash notieren (nicht einchecken).
2. Datei lesen, Preflight-Teil prüfen.
3. Als **eine** Transaktion/Migration einspielen (`psql -1 -v ON_ERROR_STOP=1 -f install_dev.sql` oder Migrationsweg).
4. Sofortprüfung aus dem Katalog (`docs/EXPOSED_SCHEMAS.md`): `rwi` nicht exponiert; `anon`/`authenticated` ohne EXECUTE auf `rw_worker_*`/`rw_ops_*`; kein Tabellenrecht auf `rwi.*`; 18 Tabellen in `rwi`, 6 in `public`.
5. Betreiber **noch nicht** anlegen.
**Rücksetzen:** `rollback_dev.sql` (mit `set rw.rollback_confirm = 'ja-loeschen'`), danach ggf. `cleanup_test_accounts.sql`. Nicht zurückgesetzt werden Rollen, Default-ACLs, Edge Functions, Migrationshistorie.
**Vorher beseitigt sein muss:** Katalogprüfung der Standard-Rechte (Supabase-Default-Berechtigungen für neue Funktionen), `rwi` nicht in den *Exposed schemas*, bestätigtes Rollback-Skript gegen reale Dev-Objekte (bisher nur lokal getestet).

### Phase B: Betreiber vorbereiten (nach A, eigene Freigabe)
1. Betreiber-Testkonto anlegen und bestätigen; `rwi.set_operator('<uuid>', 'Name', array[…])` per SQL.
2. Optional Engine-Version für den Hotfix-Test registrieren (`rwi.register_engine`, nur über SQL/Servicerolle).
**Rücksetzen:** `delete from rwi.operators …` (wird als `operator_change` protokolliert).

### Phase C: Edge-Function-Deployment (KEINE FREIGABE bis K4–K8 erledigt)
1. `supabase/config.toml` mit `[functions.operator]` anlegen/ablegen und `deno check` der Funktion.
2. Automatische Umgebung (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) und Schlüsselformat klären; `OPERATOR_REQUIRE_MFA` nicht setzen.
3. Auf **Dev** bereitstellen (durch dich oder mit ausdrücklicher Freigabe).
4. Smoke-Tests: ohne Token → 401; normaler Spieler → 403; Betreiber `aal1` → 403 `mfa_required`; Betreiber `aal2` auf nicht vorhandenen Kampf → `unknown_fight`; später echter stuck-Kampf.
**Rücksetzen:** Funktion löschen (nicht von `rollback_dev.sql` erfasst); `denied`-Einträge bleiben im Protokoll.
**Vorher beseitigt sein muss:** E5–E8 (Limit/Dedup für `denied`, Bodygrenze vor dem Lesen, Config-Ort, Schlüsselformate), Phase A grün, Betreiberkonto mit MFA.

### Phase D: Workflow-Ausführung (KEINE FREIGABE bis K1–K5, K9 erledigt)
1. GitHub-Environment `dev-test` mit erforderlichem Freigeber und Zweigbeschränkung anlegen; Secrets `DEV_SUPABASE_URL`, `DEV_ANON_KEY`.
2. Dev: Bestätigung für Testkonten abgestimmt; ggf. Testinstanz/-kampf (Abschnitt 5).
3. Erster Lauf manuell; Ergebnis prüfen (grün **und** keine übersprungenen Pflichtschritte).
4. Danach `list_test_accounts.sql`: keine Verwaisten.
**Rücksetzen:** verwaiste `@rwtest.invalid`-Konten über `cleanup_test_accounts.sql` mit Freigabe.
**Vorher beseitigt sein muss:** Skriptkorrekturen (W1–W6), Cleanup als Fehler (T2/T3), Entscheidung zur E-Mail-Bestätigung.

## 7. Notwendige Korrekturen

| Nr. | Korrektur | Betrifft |
|---|---|---|
| K1 | `denied` nur bei 401/403 (und bewusst dokumentiertem 404); Positivkontrolle der installierten Funktionen vor den Negativtests; Netzfehler (Status 0) = Fehler | W1 |
| K2 | `group_action`-Nutzlast mit `ability`; harte Statusprüfung (`joined`/`ok`, nicht „irgendein Text“) für Beitritt, Ready, Ansicht, Aktion | W2 |
| K3 | Cleanup-Fehler = Fehler (Exit ≠ 0); bei Vorbedingungsabbruch (Exit 3) keine Konten anlegen oder vorab Bestätigungsmodus prüfen; erwartetes Löschen verifizieren (Anmeldung schlägt danach fehl) | T2, T3, T5 |
| K4 | Konzept für Testinstanz/-kampf entscheiden (Abschnitt 5); bis dahin Gruppenschritte als „nicht getestet“ ausweisen, Exit-Code und Zusammenfassung unterscheiden (z. B. eigener Exit-Code und `::warning::`) | W3, W4 |
| K5 | Schlüsselprüfung für `sb_publishable_…` und anonyme Aufrufe ohne `Authorization: Bearer <Anon>` wie im Spielclient | W5, E8 |
| K6 | `denied`-Einträge begrenzen (z. B. je Konto/Zeitraum zusammenfassen) oder Funktionsaufrufe pro Konto begrenzen | E5 |
| K7 | Body mit Bytegrenze lesen, bevor er vollständig geladen wird; Authentifizierung vor Body-Lesen | E6 |
| K8 | `supabase/config.toml` statt Funktions-`config.toml`; `deno check`/Lauf in CI ergänzen; Verhalten von `verify_jwt` und Schlüsselformaten real klären; wirkungslosen Test ersetzen | E7, E8, E10 |
| K9 | Workflow: bei falscher Bestätigung ausdrücklich fehlschlagen statt Job überspringen; Environment-Regeln dokumentieren | W6 |
| K10 | Doku: Tests des Standes `afc5dfb` in allen Berichten als „Stub“ kennzeichnen; die CI-Läufe sind **keine** Supabase-Integrationstests | Begriffsklärung |

## 8. Offene technische Risiken (Kurzliste)
- Verhalten von GoTrue/Gateway/Deno ist vollständig ungeprüft (Abschnitt 2, „Fehlende reale Tests“).
- Neue API-/JWT-Schlüsselformate können Edge Function (E7/E8) und Dev-Skript (W5) unbrauchbar machen.
- E-Mail-Bestätigung und Mailversand von Dev sind Voraussetzung und Risiko (T3/T4).
- Positive Gruppentests brauchen serverseitige Vorbereitung und passen nicht zum aktuellen Workflow-Entwurf (W3).
- Rechte in der echten Supabase-Umgebung (Default-Berechtigungen) sind nur lokal simuliert (Phase A, Katalogprüfung zwingend).
- Der Datenbank-Eigentümer kann `ops_log` leeren (TRUNCATE); nur Rechte schützen.

## 9. Empfehlung
**BEDINGTE FREIGABE** für Phase A (Datenbankinstallation auf Dev, mit Katalogprüfung und Rollback-Bereitschaft).
**KEINE FREIGABE** für Edge-Function-Deployment (Phase C) und Workflow-Ausführung (Phase D), bis K1–K9 umgesetzt, lokal erneut getestet und die realen GoTrue-/Deno-Tests definiert sind. Ich warte auf deine Entscheidung.
