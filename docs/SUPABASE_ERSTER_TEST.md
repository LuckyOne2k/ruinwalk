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

## 2. Schritte für den ersten echten Datenbanktest
Du (Konten und Schlüssel liegen bei dir):
1. Auf supabase.com ein **neues, leeres Testprojekt** anlegen (Region EU/Frankfurt, sicheres Datenbankpasswort notieren). Nicht das spätere Produktivprojekt.
2. Unter Authentication einstellen: E-Mail-Registrierung **an**, „Confirm email" **an**, Anonyme Anmeldung **aus**, Mindestpasswortlänge mindestens 8. Unter URL Configuration als Site URL `https://luckyone2k.github.io/ruinwalk/` und zusätzlich `http://localhost:8765` als erlaubte Weiterleitung eintragen.
3. Im SQL Editor den kompletten Inhalt von `supabase/schema.sql` einmal ausführen (nicht wiederholbar; bei Fehlern ein neues Projekt nehmen).
4. Optional den vollständigen SQL-Testlauf gegen dieses frische Projekt starten: `PGURL='postgresql://postgres:…@db.….supabase.co:5432/postgres' bash supabase/tests/run_remote.sh` (braucht `psql` auf deinem Rechner). Das prüft Rechte, RLS und Trigger in der echten Supabase-Umgebung.
5. Im Dashboard unter Settings → API die **Project URL** und den **anon/publishable key** kopieren. Den `service_role`-Schlüssel nie ins Spiel oder in Chats geben.

Ich (nach deiner Freigabe):
6. Registrierungs- und Anmeldebildschirm bauen (Phase 2), die URL und den anon-Key in die Konfiguration übernehmen.
7. Echter Durchlauf mit zwei Testkonten: Registrierung → Bestätigungsmail (an deine Adresse) → Anmeldung → Charakter anlegen/speichern/löschen → Abmelden → Anmelden auf anderem Gerät. Dabei die HTTP-Statuscodes und Fehlermeldungen prüfen.
8. Advisor-Meldungen im Dashboard durchgehen (nur die erwarteten `SECURITY DEFINER`-Hinweise dürfen bleiben).

Vor dem öffentlichen Start zusätzlich: eigener SMTP-Anbieter, CAPTCHA für die Registrierung, Rate-Limits prüfen, Aufräum-Job für unbestätigte Konten, tägliches Datenbank-Backup (im Free-Tarif nicht enthalten, daher Export einplanen).
