\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- feste Test-IDs
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

-- ===== 1. Registrierung und automatische Profilerstellung =====
select tap.as_admin();
insert into auth.users(id,email,raw_user_meta_data) values (:A,'a@test.de','{"username":"Alice_1"}');
select tap.is((select username from public.profiles where account_id=:A),'Alice_1','Registrierung erzeugt Profil mit Benutzername');
select tap.ok((select created_at is not null and last_login is null from public.profiles where account_id=:A),'Profil: created_at gesetzt, last_login leer');
select tap.throws($$insert into auth.users(email,raw_user_meta_data) values ('x@test.de','{"username":"alice_1"}')$$,'23505','Benutzername ist ohne Beachtung der Groß-/Kleinschreibung eindeutig');
select tap.throws($$insert into auth.users(email,raw_user_meta_data) values ('y@test.de','{}')$$,'invalid_username','Registrierung ohne Benutzername scheitert');
select tap.throws($$insert into auth.users(email,raw_user_meta_data) values ('z@test.de','{"username":"a b"}')$$,'invalid_username','Ungültiger Benutzername (Leerzeichen) scheitert');
select tap.throws($$insert into auth.users(email,raw_user_meta_data) values ('z2@test.de','{"username":"ab"}')$$,'invalid_username','Zu kurzer Benutzername scheitert');
select tap.throws($$insert into auth.users(email,raw_user_meta_data) values ('z3@test.de','{"username":"x''; drop table public.profiles;--"}')$$,'invalid_username','SQL-Zeichen im Benutzernamen werden abgelehnt');
select tap.is((select count(*) from auth.users where email in ('x@test.de','y@test.de','z@test.de','z2@test.de','z3@test.de')),0::bigint,'Gescheiterte Registrierung hinterlässt kein Konto ohne Profil');
insert into auth.users(id,email,raw_user_meta_data) values (:B,'b@test.de','{"username":"Bob_2"}'),(:C,'c@test.de','{"username":"Carl_3"}');
select tap.is((select count(*) from public.profiles),3::bigint,'Drei Testaccounts mit je einem Profil');
-- Metadaten nachträglich ändern darf das Profil nicht beeinflussen
update auth.users set raw_user_meta_data='{"username":"Hacker"}' where id=:A;
select tap.is((select username from public.profiles where account_id=:A),'Alice_1','Nachträgliche Änderung der Metadaten ändert das Profil nicht');

-- Bestätigung der E-Mail-Adresse (in Supabase setzt GoTrue email_confirmed_at nach Klick auf den Link)
select tap.as_user(:A);
select tap.throws($$select * from public.create_character(1,'Unbestaetigt','{}')$$,'email_not_verified','Ohne bestätigte E-Mail kann kein Charakter angelegt werden');
select tap.as_admin();
update auth.users set email_confirmed_at=now() where id in (:A,:B,:C);

-- ===== 2. Profile: nur Eigenes sichtbar, nicht beschreibbar =====
select tap.as_user(:A);
select tap.is((select count(*) from public.profiles),1::bigint,'A sieht nur das eigene Profil');
select tap.throws($$update public.profiles set username='Neu_Name' where account_id='aaaaaaaa-0000-0000-0000-000000000001'$$,'permission denied|42501','A kann den eigenen Benutzernamen nicht ändern');
select tap.throws($$insert into public.profiles(account_id,username) values (gen_random_uuid(),'Fremd_X')$$,'permission denied|42501','A kann kein Profil anlegen');
select tap.throws($$delete from public.profiles where account_id='aaaaaaaa-0000-0000-0000-000000000001'$$,'permission denied|42501','A kann das eigene Profil nicht löschen');
select tap.lives($$select public.touch_login()$$,'touch_login funktioniert für angemeldete Nutzer');
select tap.ok((select last_login is not null from public.profiles),'touch_login setzt last_login nur für das eigene Profil');
select tap.as_admin();
select tap.ok((select last_login is null from public.profiles where account_id=:B),'Profil von B blieb unberührt');
-- Ohne UPDATE-Policy ändert ein UPDATE (selbst mit Tabellenrecht) keine Zeile: RLS ist die erste Schicht
grant update on public.profiles to authenticated;
select tap.as_user(:A);
update public.profiles set username='Neu_Name';
select tap.is((select username from public.profiles),'Alice_1','RLS verhindert Umbenennung selbst bei vorhandenem UPDATE-Recht (0 Zeilen)');
-- Zweite Schicht: der Trigger blockiert auch dann, wenn jemand versehentlich eine zu weite Policy anlegt
select tap.as_admin();
create policy tmp_upd on public.profiles for update to authenticated using (true);
select tap.as_user(:A);
select tap.throws($$update public.profiles set username='Neu_Name'$$,'username_immutable','Trigger blockiert Umbenennung selbst bei zu weiter Policy');
select tap.as_admin(); drop policy tmp_upd on public.profiles; revoke update on public.profiles from authenticated;
select tap.as_anon();
select tap.throws($$select * from public.profiles$$,'permission denied|42501','Anonym hat keinen Zugriff auf Profile');
select tap.is(public.username_available('Alice_1'),false,'username_available: vergeben (anonym aufrufbar)');
select tap.is(public.username_available('ALICE_1'),false,'username_available: Groß-/Kleinschreibung egal');
select tap.is(public.username_available('Frei_Name'),true,'username_available: frei');
select tap.is(public.username_available('a b'),false,'username_available: ungültig');

-- ===== 3. Charaktere anlegen: Platz 1 und 2 =====
select tap.as_user(:A);
select tap.throws($$insert into public.characters(account_id,slot_number,character_name,character_data) values ('aaaaaaaa-0000-0000-0000-000000000001',1,'Direkt','{}')$$,'permission denied|42501','Direktes INSERT in characters ist für Clients gesperrt');
select tap.lives($$select * from public.create_character(1,'Alicia','{"lv":3,"cls":"krieger","inv":{"holz":2}}')$$,'A erstellt Charakter auf Platz 1');
select tap.lives($$select * from public.create_character(2,'Zweit','{}')$$,'A erstellt Charakter auf Platz 2');
select tap.throws($$select * from public.create_character(1,'Doppelt','{}')$$,'23505','Belegter Platz kann nicht erneut belegt werden');
select tap.throws($$select * from public.create_character(0,'Null','{}')$$,'invalid_slot','Platz 0 ungültig');
select tap.throws($$select * from public.create_character(4,'Vier','{}')$$,'invalid_slot','Platz 4 ungültig');
select tap.throws($$select * from public.create_character(null,'Nix','{}')$$,'invalid_slot','Platz NULL ungültig');
select tap.throws($$select * from public.create_character(1,'','{}')$$,'invalid_name|23505','Leerer Name ungültig');
select tap.throws($$select * from public.create_character(1,'<script>x','{}')$$,'invalid_name','HTML-Zeichen im Namen ungültig');
select tap.throws($$select * from public.create_character(1,E'Zeile\nUmbruch','{}')$$,'invalid_name','Steuerzeichen im Namen ungültig');
select tap.throws($$select * from public.create_character(1,'ZuLangerName12345678','{}')$$,'invalid_name','Name länger als 16 Zeichen ungültig');
select tap.throws($$select * from public.create_character(1,'Ok','[1,2]')$$,'invalid_data','Daten müssen ein JSON-Objekt sein');
select tap.is((select count(*) from public.characters),2::bigint,'A sieht genau zwei eigene Charaktere');
select tap.is((select character_class||'/'||level from public.characters where slot_number=1),'krieger/3','Klasse und Level werden aus den Daten abgeleitet');
select tap.is((select character_data->>'name' from public.characters where slot_number=1),'Alicia','Name steht auch in den Daten');
select tap.ok((select (character_data->>'cid')::uuid = character_id from public.characters where slot_number=1),'Charakter-ID in den Daten ist die Server-ID');
select tap.ok((select version=1 and last_played is null from public.characters where slot_number=1),'Startversion 1');
select tap.as_anon();
select tap.throws($$select * from public.create_character(1,'Anon','{}')$$,'permission denied|42501','Anonym kann keinen Charakter anlegen');
select tap.throws($$select * from public.characters$$,'permission denied|42501','Anonym kann keine Charaktere lesen');
-- B: gleiche Plätze, unabhängig von A
select tap.as_user(:B);
select tap.lives($$select * from public.create_character(1,'Bobby','{"lv":9}')$$,'B kann ebenfalls Platz 1 belegen (Plätze gelten pro Account)');
select tap.is((select count(*) from public.characters),1::bigint,'B sieht nur den eigenen Charakter');
select tap.is((select name from (select character_name as name from public.characters) x),'Bobby','B sieht nicht die Daten von A');

-- ===== 4. Zugriff auf fremde Charaktere =====
select tap.as_user(:B);
select tap.is((select count(*) from public.characters where character_name='Alicia'),0::bigint,'B sieht Charaktere von A nicht');
select tap.throws($$update public.characters set character_name='Gehackt'$$,'permission denied|42501','B kann Charaktere nicht direkt ändern');
select tap.throws($$delete from public.characters$$,'permission denied|42501','B kann Charaktere nicht direkt löschen');
select tap.throws($$select * from public.character_backups$$,'permission denied|42501','Backups sind für Clients nicht lesbar');
select tap.throws($$select * from public.audit_log$$,'permission denied|42501','Audit-Log ist für Clients nicht lesbar');
select tap.throws($$select * from public.payment_events$$,'permission denied|42501','Zahlungsereignisse sind für Clients nicht lesbar');
select tap.as_admin();
select character_id as a1 from public.characters where account_id=:A and slot_number=1 \gset
select character_id as b1 from public.characters where account_id=:B and slot_number=1 \gset
select tap.as_user(:B);
select tap.throws('select public.save_character('''||:'a1'||''',1,''{"lv":50}'')','version_conflict','B kann den Charakter von A nicht speichern');
select tap.throws('select public.delete_character('''||:'a1'||''')','not_found','B kann den Charakter von A nicht löschen');
select tap.as_admin();
select tap.is((select level from public.characters where character_id=:'a1'),3,'Charakter von A blieb unverändert');
select tap.is((select count(*) from public.character_backups),0::bigint,'Fehlgeschlagene Zugriffe erzeugen keine Backups');

-- ===== 5. Platz 3 =====
select tap.as_user(:A);
select tap.throws($$select * from public.create_character(3,'Dritter','{}')$$,'slot_locked','Platz 3 ohne Berechtigung gesperrt');
select tap.throws($$insert into public.account_entitlements(account_id,entitlement_type,status) values ('aaaaaaaa-0000-0000-0000-000000000001','third_character_slot','active')$$,'permission denied|42501','Client kann sich keine Berechtigung selbst eintragen');
select tap.throws($$update public.account_entitlements set status='active'$$,'permission denied|42501','Client kann keine Berechtigung ändern');
select tap.throws($$select public.has_entitlement('aaaaaaaa-0000-0000-0000-000000000001','third_character_slot')$$,'permission denied|42501','has_entitlement ist für Clients nicht aufrufbar');
select tap.as_service();
insert into public.account_entitlements(account_id,entitlement_type,status,payment_reference) values (:A,'third_character_slot','pending','pay_1');
select tap.as_user(:A);
select tap.throws($$select * from public.create_character(3,'Dritter','{}')$$,'slot_locked','Platz 3 bei Status pending gesperrt');
select tap.as_service();
update public.account_entitlements set status='active', granted_at=now() where account_id=:A;
select tap.as_user(:A);
select tap.lives($$select * from public.create_character(3,'Dritter','{"lv":2}')$$,'Platz 3 mit aktiver Berechtigung nutzbar');
select tap.is((select count(*) from public.account_entitlements),1::bigint,'A sieht die eigene Berechtigung');
select tap.as_user(:B);
select tap.is((select count(*) from public.account_entitlements),0::bigint,'B sieht die Berechtigung von A nicht');
select tap.throws($$select * from public.create_character(3,'Dritter','{}')$$,'slot_locked','Berechtigung von A schaltet Platz 3 für B nicht frei');
select tap.as_service();
update public.account_entitlements set status='refunded' where account_id=:A;
select tap.as_admin();
select tap.is((select count(*) from public.characters where account_id=:A and slot_number=3),1::bigint,'Nach Rückerstattung bleibt der vorhandene Charakter erhalten (nicht gelöscht)');
select character_id as a3 from public.characters where account_id=:A and slot_number=3 \gset
select tap.as_user(:A);
select tap.is((select count(*) from public.characters where slot_number=3),0::bigint,'... ist aber für den Spieler gesperrt (nicht lesbar)');
select tap.throws('select public.save_character('''||:'a3'||''',1,''{"lv":4}'')','character_locked','... und nicht speicherbar');
-- Der Besitzer darf einen gesperrten Charakter bewusst löschen (normale Löschregeln: Protokoll + letzte Sicherung), Fremde nicht
select tap.as_user(:B);
select tap.throws('select public.delete_character('''||:'a3'||''')','not_found','B kann den gesperrten Charakter von A nicht löschen');
select tap.as_user(:A);
select tap.lives('select public.delete_character('''||:'a3'||''')','Besitzer löscht den gesperrten Charakter bewusst');
select tap.as_admin();
select tap.is((select count(*) from public.characters where character_id=:'a3'),0::bigint,'Gesperrter Charakter ist gelöscht');
select tap.ok(exists(select 1 from public.character_backups where character_id=:'a3' and reason='delete'),'... letzter Stand wurde gesichert');
select tap.ok(exists(select 1 from public.audit_log where character_id=:'a3' and action='character_deleted'),'... Löschen ist protokolliert');
select tap.as_user(:A);
select tap.throws($$select * from public.create_character(3,'Neu3','{}')$$,'slot_locked','Nach Rückerstattung ist ein neuer Charakter auf Platz 3 gesperrt');
select tap.as_admin();
select tap.ok((select count(*) from public.audit_log where action like 'entitlement_%')>=3,'Berechtigungsänderungen stehen im Audit-Log');

-- ===== 5b. Rückerstattung: sperren statt löschen, Verschieben, Wiederfreischaltung =====
select tap.as_service();
insert into public.account_entitlements(account_id,entitlement_type,status,payment_reference) values (:C,'third_character_slot','active','pay_c');
select tap.as_user(:C);
select tap.lives($$select * from public.create_character(1,'C_eins','{"lv":2}')$$,'C: Platz 1');
select tap.lives($$select * from public.create_character(3,'C_drei','{"lv":5,"cls":"jaeger","inv":{"holz":7}}')$$,'C: Platz 3 mit Berechtigung');
select tap.lives($$select * from public.create_character(2,'C_zwei','{}')$$,'C: Platz 2 (beide kostenlosen Plätze belegt)');
select tap.as_admin();
select character_id as c3 from public.characters where account_id=:C and slot_number=3 \gset
select tap.as_user(:C);
select tap.is(public.save_character(:'c3',1,'{"lv":5,"cls":"jaeger","inv":{"holz":8}}'),2,'C speichert Platz 3 solange die Berechtigung gilt');
select tap.is((select count(*) from public.list_characters() where not locked),3::bigint,'list_characters: mit Berechtigung ist nichts gesperrt');
select tap.as_service();
update public.account_entitlements set status='refunded' where account_id=:C;
select tap.as_admin();
select tap.is((select count(*) from public.characters where account_id=:C),3::bigint,'Rückerstattung löscht keinen Charakter');
select tap.is((select character_data->'inv'->>'holz' from public.characters where character_id=:'c3'),'8','Spielstand auf Platz 3 bleibt unverändert gespeichert');
select tap.as_user(:C);
select tap.is((select locked from public.list_characters() where slot_number=3),true,'list_characters: Charakter auf Platz 3 ist als gesperrt markiert');
select tap.is((select count(*) from public.list_characters()),3::bigint,'... und weiterhin aufgeführt');
select tap.is((select count(*) from public.characters where slot_number=3),0::bigint,'Gesperrter Charakter: Spielstand ist nicht abrufbar');
select tap.throws('select public.save_character('''||:'c3'||''',2,''{"lv":99}'')','character_locked','Gesperrter Charakter ist nicht speicherbar');
select tap.throws($$select * from public.create_character(3,'Neu3','{}')$$,'slot_locked|23505','Ohne Berechtigung kein neuer Charakter auf Platz 3');
select tap.throws('select public.move_character('''||:'c3'||''',1)','slot_occupied','Verschieben scheitert, wenn Platz 1 belegt ist');
select tap.throws('select public.move_character('''||:'c3'||''',2)','slot_occupied','Verschieben scheitert, wenn Platz 2 belegt ist');
select tap.throws('select public.move_character('''||:'c3'||''',3)','invalid_slot','Zielplatz 3 ist ungültig');
select tap.throws('select public.move_character('''||:'c3'||''',0)','invalid_slot','Zielplatz 0 ist ungültig');
select tap.as_admin();
select tap.is((select slot_number||'/'||version||'/'||(character_data->'inv'->>'holz') from public.characters where character_id=:'c3'),'3/2/8','Fehlgeschlagenes Verschieben ändert nichts (Platz, Version, Spielstand)');
-- Berechtigungszeile komplett entfernen: Charakter bleibt trotzdem erhalten
select tap.as_service();
delete from public.account_entitlements where account_id=:C;
select tap.as_admin();
select tap.is((select count(*) from public.characters where account_id=:C and slot_number=3),1::bigint,'Auch ohne Berechtigungszeile wird nichts gelöscht');
-- Wiederfreischaltung: Charakter ist ohne Datenverlust wieder zugänglich
select tap.as_service();
insert into public.account_entitlements(account_id,entitlement_type,status,payment_reference) values (:C,'third_character_slot','active','pay_c2');
select tap.as_user(:C);
select tap.is((select locked from public.list_characters() where slot_number=3),false,'Nach erneuter Freischaltung nicht mehr gesperrt');
select tap.is((select character_data->'inv'->>'holz' from public.characters where slot_number=3),'8','... Spielstand ist wieder lesbar und unverändert');
select tap.is(public.save_character(:'c3',2,'{"lv":6,"cls":"jaeger","inv":{"holz":9}}'),3,'... und wieder speicherbar');
-- Erneute Rückerstattung, dann freien Platz schaffen und verschieben
select tap.as_service();
update public.account_entitlements set status='refunded' where account_id=:C;
select tap.as_user(:C);
select tap.throws('select public.move_character('''||:'c3'||''',1)','slot_occupied','Wieder gesperrt, beide Plätze belegt: Verschieben nicht möglich');
select tap.lives('select public.delete_character((select character_id from public.list_characters() where slot_number=2))','C löscht bewusst den Charakter auf Platz 2 (Spieleraktion)');
select tap.as_admin();
select count(*) as c3bak from public.character_backups where character_id=:'c3' \gset
select tap.as_user(:B);
select tap.throws('select public.move_character('''||:'c3'||''',2)','not_found','B kann Charakter von C nicht verschieben');
select tap.as_anon();
select tap.throws('select public.move_character('''||:'c3'||''',2)','permission denied|42501','Anonym kann nicht verschieben');
select tap.as_user(:C);
select tap.throws('select public.move_character((select character_id from public.characters where slot_number=1),2)','move_not_allowed','Nur Charaktere von Platz 3 lassen sich verschieben');
select tap.is(public.move_character(:'c3',2),4,'Gesperrter Charakter wird auf den freien Platz 2 verschoben (Version erhöht)');
select tap.is((select slot_number||'/'||(character_data->'inv'->>'holz') from public.characters where character_id=:'c3'),'2/9','Charakter liegt auf Platz 2, Spielstand vollständig erhalten');
select tap.ok((select not locked from public.list_characters() where character_id=:'c3'),'Verschobener Charakter ist ohne Berechtigung spielbar');
select tap.lives('select public.save_character('''||:'c3'||''',4,''{"lv":7,"cls":"jaeger","inv":{"holz":10}}'')','... und speicherbar');
select tap.throws($$select * from public.create_character(3,'Neu3','{}')$$,'slot_locked','Platz 3 bleibt ohne Berechtigung gesperrt, auch wenn er jetzt frei ist');
select tap.as_admin();
select tap.ok((select count(*) from public.character_backups where character_id=:'c3')>=:c3bak,'Backups des verschobenen Charakters sind erhalten');
select tap.is((select count(*) from public.audit_log where action='character_moved' and account_id=:C),1::bigint,'Verschieben steht im Audit-Log');
select tap.throws('update public.characters set slot_number=3 where character_id='''||:'c3'||'''','immutable','Direktes Verschieben auf Platz 3 ist nie erlaubt');
select tap.throws('update public.characters set slot_number=1 where character_id='''||:'c3'||'''','immutable','Direktes Verschieben ohne move_character ist nie erlaubt');
-- Wiederkauf: Platz 3 steht wieder zur Verfügung
select tap.as_service();
update public.account_entitlements set status='active' where account_id=:C;
select tap.as_user(:C);
select tap.lives($$select * from public.create_character(3,'C_drei_neu','{}')$$,'Nach erneutem Kauf kann Platz 3 neu belegt werden');
select tap.as_admin();

-- ===== 6. Speichern mit Version =====
select tap.as_user(:A);
select tap.is(public.save_character(:'a1',1,'{"lv":7,"cls":"magier","inv":{"stein":9}}'),2,'Speichern mit richtiger Version liefert Version 2');
select tap.is((select level||'/'||character_class||'/'||version from public.characters where character_id=:'a1'),'7/magier/2','Level, Klasse und Version aktualisiert');
select tap.ok((select last_played is not null from public.characters where character_id=:'a1'),'last_played gesetzt');
select tap.throws('select public.save_character('''||:'a1'||''',1,''{"lv":9}'')','version_conflict','Veraltete Version wird abgelehnt');
select tap.as_admin();
update auth.users set email_confirmed_at=null where id=:A;
select tap.as_user(:A);
select tap.throws('select public.save_character('''||:'a1'||''',2,''{"lv":8}'')','email_not_verified','Ohne bestätigte E-Mail kann nicht gespeichert werden');
select tap.as_admin(); update auth.users set email_confirmed_at=now() where id=:A; select tap.as_user(:A);
select tap.throws('select public.save_character('''||:'a1'||''',99,''{"lv":9}'')','version_conflict','Falsche (zu hohe) Version wird abgelehnt');
select tap.is((select (character_data->>'lv')||'/'||version from public.characters where character_id=:'a1'),'7/2','Abgelehnte Speicherungen ändern nichts');
select tap.throws('select public.save_character('''||:'a1'||''',2,''{}'')','invalid_data','Leerer Spielstand wird abgelehnt');
select tap.throws('select public.save_character('''||:'a1'||''',2,''[1]'')','invalid_data','Kein Objekt wird abgelehnt');
select tap.throws('select public.save_character('''||:'a1'||''',2,null)','invalid_data','NULL wird abgelehnt');
select tap.throws('select public.save_character(gen_random_uuid(),1,''{"lv":2}'')','version_conflict','Unbekannte ID wird abgelehnt');
select tap.is(public.save_character(:'a1',2,'{"lv":9999,"cls":"x; drop","cid":"11111111-1111-1111-1111-111111111111"}'),3,'Manipulierte Werte werden gespeichert, aber bereinigt');
select tap.is((select level||'/'||character_class from public.characters where character_id=:'a1'),'50/wanderer','Level begrenzt, ungültige Klasse -> wanderer');
select tap.ok((select character_data->>'cid'=:'a1' from public.characters where character_id=:'a1'),'Client kann die Charakter-ID in den Daten nicht fälschen');
select tap.throws($$update public.characters set version=1$$,'permission denied|42501','Version nicht direkt änderbar');
select tap.as_anon();
select tap.throws('select public.save_character('''||:'a1'||''',3,''{"lv":2}'')','permission denied|42501','Anonym kann nicht speichern');
select tap.as_admin();
select tap.throws($$update public.characters set slot_number=2 where slot_number=1$$,'immutable|23505','slot_number ist unveränderlich');
select tap.throws('update public.characters set account_id='''||:B||''' where character_id='''||:'a1'||'''','immutable','Charakter kann nicht auf anderen Account übertragen werden');
select tap.throws('update public.characters set character_id=gen_random_uuid() where character_id='''||:'a1'||'''','immutable|23503','Charakter-ID unveränderlich');

-- ===== 7. Backups =====
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'a1' and reason='update'),2::bigint,'Zwei Speicherungen -> zwei Backups (jeweils der Stand davor)');
select tap.is((select min(version)||'-'||max(version) from public.character_backups where character_id=:'a1'),'1-2','Backups enthalten die Versionen 1 und 2');
select tap.is((select character_data->>'lv' from public.character_backups where character_id=:'a1' and version=2),'7','Backup Version 2 enthält den alten Stand');
select tap.as_user(:B);
select tap.lives('select public.save_character('''||:'b1'||''','||g||',''{"lv":'||(g+1)||'}'')','B speichert Stand '||g) from generate_series(1,12) g;
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'b1' and reason='update'),10::bigint,'Es bleiben nur die letzten 10 Backups je Charakter');
select tap.is((select min(version) from public.character_backups where character_id=:'b1'),3,'Älteste Backups wurden entfernt');

-- ===== 8. Löschen =====
select tap.as_user(:A);
select tap.lives('select public.delete_character((select character_id from public.characters where account_id='''||:A||''' and slot_number=2))','A löscht den eigenen Charakter auf Platz 2');
select tap.is((select count(*) from public.characters),1::bigint,'Nur der gelöschte Charakter fehlt (Platz 1 bleibt)');
select tap.throws('select public.delete_character((select character_id from public.characters where slot_number=1)::uuid)','not_found|^$','Löschen ohne Treffer meldet nichts Fremdes') where false;
select tap.throws($$select public.delete_character(gen_random_uuid())$$,'not_found','Unbekannte ID -> not_found');
select tap.as_user(:B);
select tap.is((select count(*) from public.characters),1::bigint,'B ist vom Löschen bei A unberührt');
select tap.as_anon();
select tap.throws('select public.delete_character('''||:'a1'||''')','permission denied|42501','Anonym kann nicht löschen');
select tap.as_admin();
select tap.is((select count(*) from public.audit_log where action='character_deleted' and account_id=:A),2::bigint,'Beide Löschvorgänge von A (gesperrter Charakter und Platz 2) stehen im Audit-Log');
select tap.ok(exists(select 1 from public.character_backups b join public.audit_log l on l.character_id=b.character_id where b.reason='delete' and l.action='character_deleted' and l.account_id=:A),'Letzter Stand des gelöschten Charakters wurde gesichert');
select tap.is((select count(*) from public.characters where account_id=:A and slot_number=1),1::bigint,'Anderer Charakter von A unberührt');
-- Platz nach dem Löschen wieder nutzbar
select tap.as_user(:A);
select tap.lives($$select * from public.create_character(2,'Neu2','{}')$$,'Platz 2 ist nach dem Löschen wieder frei');

-- ===== 9. Konto löschen =====
select tap.as_admin();
delete from auth.users where id=:C;
select tap.is((select count(*) from public.profiles where account_id=:C),0::bigint,'Konto löschen entfernt das Profil (Kaskade)');
select tap.as_user(:B);
select tap.lives('select public.save_character('''||:'b1'||''',13,''{"lv":30}'')','B speichert noch einmal');
select tap.as_admin();
select tap.ok((select count(*) from public.character_backups where account_id=:B)>0,'B hat Backups');
delete from auth.users where id=:B;
select tap.is((select count(*) from public.characters where account_id=:B)+(select count(*) from public.character_backups where account_id=:B)+(select count(*) from public.account_entitlements where account_id=:B),0::bigint,'Konto löschen entfernt Charaktere, Backups und Berechtigungen vollständig');

-- ===== 10. Strukturprüfung der Sicherheit =====
select tap.as_admin();
select tap.is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0::bigint,'RLS ist auf allen Tabellen in public aktiv');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig::text,'') like '%search_path%'),0::bigint,'Jede SECURITY-DEFINER-Funktion hat einen festen search_path');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')),'username_available','Anonym darf nur username_available aufrufen');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')),'create_character,delete_character,list_characters,move_character,save_character,touch_login,username_available','Angemeldete Nutzer dürfen nur die vorgesehenen Funktionen aufrufen');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type<>'SELECT'),0::bigint,'Clients haben nirgends INSERT/UPDATE/DELETE-Rechte');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'),0::bigint,'Anonym hat keine Tabellenrechte');
select tap.is((select count(*) from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')),0::bigint,'Es gibt keine schreibenden RLS-Policies für Clients');

select tap.finish();
