# Supabase: Kompatibilität und erster echter Datenbanktest

## 1. Kompatibilitätsprüfung des Schemas (Stand 13.11.2026)
Geprüft anhand der Supabase-Dokumentation und Changelogs. Im Test mit PostgreSQL 16 nachgestellt, aber **noch nicht gegen ein echtes Projekt ausgeführt**.

| Thema | Befund | Maßnahme im Schema |
|---|---|---|
| Profil-Trigger auf `auth.users` | Üblicher Supabase-Weg. Der Trigger läuft im Registrierungsvorgang; wirft er, antwortet Supabase nur mit dem generischen Fehler „Database error saving new user" (HTTP 500). Die Funktion muss `SECURITY DEFINER` mit festem `search_path` sein, sonst „permission denied". | Umgesetzt. Das Frontend muss den Namen vorher mit `username_available` prüfen und Fehler allgemein melden. Die Ursache steht in den Postgres-Logs. |
| `auth.role()` | In Supabase veraltet. | Ersetzt durch `auth.jwt() ->> 'role'`. |
| Standardrechte für neue Tabellen | Neue Projekte seit 30.05.2026 vergeben keine Data-API-Rechte mehr automatisch; für bestehende Projekte war die Umstellung für 30.10.2026 angekündigt (laut Changelog und Berichten). Ältere Projekte vergeben noch alles an `anon`/`authenticated`/`service_role`. | Schema vergibt und entzieht Rechte ausdrücklich, auch für `service_role`. Tests laufen in **beiden** Modi. |
| Entzug von Rechten bei Dashboard-Tabellen | Tabellen, die später im Dashboard angelegt werden, können Standardrechte erhalten. | Nur per SQL-Migration anlegen, danach `revoke`/`grant` wie im Schema. |
| Security Advisor | Meldet `SECURITY DEFINER`-Funktionen, die angemeldete Nutzer aufrufen dürfen. | Beabsichtigt (`create/save/delete/move/list_characters`, `touch_login`); jede prüft `auth.uid()`. Warnungen dokumentieren, nicht „beheben". |
| E-Mail-Versand | Der eingebaute Versand ist stark begrenzt (zuletzt 2 Mails/Stunde im Projekt) und liefert nur an Mitglieder des Projektteams. | Für den ersten Test mit deiner eigenen Adresse reicht er. Für echte Spieler eigenen SMTP-Anbieter einrichten (danach standardmäßig 30/h, einstellbar). |
| Anmeldung ohne Benutzername | Im Dashboard angelegte Nutzer haben keine Metadaten, der Profil-Trigger lehnt sie ab. | Testnutzer über die Registrierung/Admin-API mit `username` anlegen, nicht über „Add user" im Dashboard. Anonyme Anmeldung und nicht benötigte Anbieter (Google usw.) abschalten, sie hätten keinen Benutzernamen. |
| HTTP-Statuscodes | Eigene Fehler nutzen `PT403`/`PT404`/`PT409` (PostgREST wandelt `PTxxx` in HTTP-Status). | **Im echten Test prüfen**, ob die Statuscodes ankommen; der Client wertet ohnehin `message` aus. |
| E-Mail-Bestätigung | `email_confirmed_at` wird erst nach Klick (oder bei abgeschalteter Bestätigung sofort) gesetzt. Die Funktionen verlangen es. | Bestätigung in den Auth-Einstellungen eingeschaltet lassen. Bei erneuter Registrierung mit bekannter Adresse gibt Supabase absichtlich keinen Fehler zurück (Schutz vor Adress-Abfrage). |

## 2. Erster echter Datenbanktest im Projekt „ruinwalk" (Frankfurt), ohne zusätzliche Software
Am besten am Computer. Das Projekt muss leer sein (keine eigenen Tabellen in `public`).

**A. Auth-Einstellungen** (Dashboard → Authentication)
1. *Sign In / Providers* → Email: einschalten; „Confirm email" **an**; „Allow new users to sign up" **an**; „Allow anonymous sign-ins" **aus**; alle anderen Anbieter aus.
2. Mindestpasswortlänge auf 8 setzen (Standard ist 6; Stelle je nach Dashboard-Version im Email-Anbieter bzw. in den Passwort-Einstellungen).
3. *URL Configuration* → Site URL `https://luckyone2k.github.io/ruinwalk`, Redirect URLs `https://luckyone2k.github.io/ruinwalk/**` und `http://localhost:8765/**`.

**B. Schema einspielen:** SQL Editor → New query → Inhalt von `supabase/schema.sql` einfügen → Run. Erwartet: „Success". Nicht ein zweites Mal ausführen.

**C. Datenbanktest:** neue Query → Inhalt von `supabase/tests/editor_test.sql` einfügen → Run. Das Ergebnis steht in der letzten Zeile: „✅ ALLE 168 TESTS BESTANDEN" oder „❌ … FEHLGESCHLAGEN: …". (Der Editor fragt evtl. wegen DELETE-Befehlen nach Bestätigung: bestätigen.)

**D. Aufräumen:** neue Query → `supabase/tests/editor_cleanup.sql` → Run. Erwartet „aufgeräumt | 0 | 0".

**E. Advisor prüfen:** Dashboard → Advisors (Security). Erwartet sind nur Hinweise zu den Funktionen `create_character`, `save_character`, `delete_character`, `move_character`, `list_characters`, `touch_login`, `username_available`. Alles andere melden.

Erst wenn C „ALLE … BESTANDEN" zeigt und E nichts Unerwartetes, beginnt Phase 2. Niemals das Datenbankpasswort oder den `service_role`-Schlüssel weitergeben.

Danach (Phase 2): Registrierung/Login im Spiel, URL und anon/publishable key eintragen, echter Durchlauf mit zwei Testkonten (Mails an dein Teamkonto), HTTP-Statuscodes prüfen. Vor dem öffentlichen Start: eigener SMTP-Anbieter, CAPTCHA, Rate-Limits, Aufräum-Job für unbestätigte Konten, regelmäßiger Datenbank-Export.
