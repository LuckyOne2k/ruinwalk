# S-A (Registrierung mit Marker in `raw_app_meta_data`): Untersuchung und Empfehlung

**Status: nur untersucht, nicht implementiert.** `supabase/schema.sql` ist unverändert. Das Verhalten der Variante wurde in einer Wegwerf-Datenbank geprüft (`server/instance/tests/sa-untersuchung.mjs`, 15 Prüfungen). Die Quellen zu Supabase stehen am Ende.

## Ausgangslage (Befund F7)
`handle_new_user` verlangt `raw_user_meta_data.username` im Format `^[A-Za-z0-9_]{3,20}$` und legt das Profil an. Ohne gültigen Namen scheitert die Anlage des Kontos (`invalid_username`). Das gilt für **jeden** Anlageweg, auch für Support-/Dashboard-Konten ohne Spielernamen. Heute müssten diese Konten einen gültigen, freien Spielernamen tragen.

## Vorschlag S-A
Ein Marker, den nur die Server-Seite setzen kann, z. B. `raw_app_meta_data.rw_staff = true` (JSON-Wert `true`). Hat das neue Konto den Marker, vergibt der Trigger den Namen `staff_<8 hex der Konto-ID>` statt den Namen aus den Registrierungsdaten zu verlangen. Alle anderen Konten verhalten sich wie bisher.

## 1. Manipulationsschutz: User-Metadaten gegen App-Metadaten
- `raw_user_meta_data` (`user_metadata`) kann der angemeldete Nutzer selbst setzen, bei der Registrierung (`options.data`) und später mit `auth.updateUser({data})`. Supabase rät ausdrücklich davon ab, dort Berechtigungsdaten abzulegen.
- `raw_app_meta_data` (`app_metadata`) kann der Nutzer über die normalen Client-Aufrufe **nicht** ändern. Schreiben können sie nur die Admin-API mit dem `service_role`-Schlüssel (serverseitig), ein Auth Hook oder direkter SQL-Zugriff des Datenbankbesitzers. Dort steht auch, was GoTrue selbst einträgt (`provider`, `providers`).
- Getestet (lokal, Attrappe): Ein Marker in `raw_user_meta_data` (`{"rw_staff":true}`) wird **ignoriert**, das Konto wird mit `invalid_username` abgelehnt. Ein verschachteltes `app_metadata` innerhalb der User-Metadaten macht niemanden zum Staff-Konto.
- Typstrenge: Nur der JSON-Wert `true` zählt. `"true"` (String), `1`, `false`, `null` und ein fehlender Schlüssel gelten nicht als Marker (getestet). Das schließt Verwechslungen durch Typumwandlung aus.
- **Restrisiko:** Wer den `service_role`-Schlüssel oder direkten SQL-Zugriff hat, kann den Marker setzen. Diese Person kann ohnehin alles umgehen (RLS-Bypass, direkte Tabellenzugriffe). S-A erweitert also den Kreis derer, die ein Staff-Konto anlegen können, nicht.

## 2. Normale Registrierungen
Unverändert: Name aus `raw_user_meta_data`, Formatprüfung, Eindeutigkeit ohne Beachtung der Schreibweise, Ablehnung ohne Namen. Getestet: gültiger Name wird übernommen, fehlender Name → `invalid_username`, kein Konto ohne Profil bleibt zurück.

## 3. Support- und Dashboard-Konten
- Anlage über die Admin-API (`auth.admin.createUser` mit `app_metadata: { rw_staff: true }`): mit S-A möglich, Profil `staff_<hex>`.
- Anlage über das Supabase-Dashboard („Add user“): **offen**. Ob das Dashboard `app_metadata` beim Anlegen setzen kann, ist nicht belegt. Wenn nicht, bleibt für diese Konten nur die Admin-API oder ein gültiger Name.
- **Wichtiges offenes Risiko (Reihenfolge):** In einem öffentlichen Fehlerbericht von GoTrue (`supabase/auth` Issue 1280) wird beschrieben, dass `app_metadata` beim Anlegen über die Admin-API **erst nach** dem INSERT per UPDATE gesetzt werden kann. Der AFTER-INSERT-Trigger sähe den Marker dann nicht, und die Anlage des Staff-Kontos würde mit `invalid_username` scheitern. Ob das bei der aktuellen GoTrue-Version noch so ist, lässt sich lokal **nicht** klären. Die lokale Attrappe zeigt nur: Wenn der Marker beim INSERT fehlt, scheitert die Anlage (getestet). **Das muss vor einer Entscheidung gegen echtes GoTrue im Dev-Projekt geprüft werden.** Falls es zutrifft, ist S-A in dieser Form nicht brauchbar; Alternativen wären ein zusätzlicher Trigger auf UPDATE (mit Wettlauf-Risiko) oder die Anlage in zwei Schritten.

## 4. Admin-API
Die Admin-API verlangt den `service_role`-Schlüssel und darf nur serverseitig laufen. Mit S-A braucht der Support-Prozess genau diesen Weg. Der Schlüssel darf nirgends im Client oder in Logs auftauchen (bestehende Regel).

## 5. Auswirkungen auf `handle_new_user`
Eine zusätzliche Verzweigung (3 Zeilen) vor der Namensprüfung. Der Trigger bleibt `SECURITY DEFINER` mit festem `search_path`. Keine Änderung an Tabellen, Rechten, RLS oder anderen Funktionen. Staff-Konten haben ein Profil, daher funktionieren `delete_account`, Berechtigungen und Charaktere unverändert.
- **Feststellung:** Ein Spieler kann sich selbst `staff_abc12345` nennen (Format erlaubt es; getestet). Das ist nur ein Name ohne Recht. Wenn das stören soll, müsste das Präfix für Spielernamen reserviert werden (eigene Entscheidung, nicht Teil von S-A).

## 6. Auswirkungen auf bestehende Benutzer
Keine. Der Trigger feuert nur bei INSERT; bestehende Profile ändern sich nicht (getestet). Es ist keine Datenmigration nötig. Ein späteres Setzen des Markers bei einem bestehenden Konto hat keine Wirkung (bewusst: kein UPDATE-Trigger).

## Empfehlung
S-A ist **sicherheitstechnisch vertretbar**: Der Marker liegt in einem Feld, das der Spieler nicht schreiben kann; die Prüfung ist typstreng; normale Registrierungen und Bestandskonten sind unberührt. Die Regel „kein Spielerkonto ohne Namen“ bleibt vollständig.
**Aber:** Ich empfehle, S-A **nicht umzusetzen, bevor** zwei Dinge gegen das echte Dev-Projekt belegt sind: (1) setzt GoTrue `app_metadata` bei `admin.createUser` schon im INSERT, sodass der Trigger den Marker sieht; (2) ob das Dashboard Staff-Konten anlegen kann. Ist (1) nicht erfüllt, bleibt S-C (heutiges Verhalten: Support-Konten mit gültigem, freiem Namen anlegen) die sicherere Wahl, weil sie nichts an `schema.sql` ändert. Für den Spielbetrieb ist keine der beiden Varianten dringend.

## Quellen
- Supabase-Dokumentation zur Benutzerverwaltung (Trigger auf `auth.users`, `raw_user_meta_data`): https://supabase.com/docs/guides/auth/auth-user-management
- Supabase-Referenz `auth.admin.createUser` (nur serverseitig, mit `service_role`): https://supabase.com/docs/reference/javascript/auth-api-createuser
- Erklärung `app_metadata` (nicht durch den Nutzer änderbar) gegenüber `user_metadata` (durch den Nutzer änderbar): https://www.guardlayer.io/blog/supabase-app-metadata-vs-user-metadata (Drittquelle)
- GoTrue Issue 1280, Reihenfolge von INSERT und `app_metadata`-Update: https://www.github.com/supabase/auth/issues/1280 (Fehlerbericht, Stand und Behebung nicht geprüft)
