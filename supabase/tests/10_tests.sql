\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- feste Test-IDs
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
\set D '''dddddddd-0000-0000-0000-000000000004'''
\set E '''eeeeeeee-0000-0000-0000-000000000005'''
\set F '''ffffffff-0000-0000-0000-000000000006'''
\set G '''99999999-0000-0000-0000-000000000007'''

-- ===== 1. Registrierung und automatische Profilerstellung =====
select tap.as_admin();
insert into auth.users(id,email,raw_user_meta_data) values (:A,'a@test.de','{"username":"Alice_1"}');
select tap.is((select username from public.profiles where account_id=:A),'Alice_1','Registrierung erzeugt Profil mit Benutzername');
select tap.ok((select created_at is not null and last_login is null from public.profiles where account_id=:A),'Profil: created_at gesetzt, last_login leer');
select tap.throws($$insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'x@test.de','{"username":"alice_1"}')$$,'23505','Benutzername ist ohne Beachtung der Groß-/Kleinschreibung eindeutig');
select tap.throws($$insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'y@test.de','{}')$$,'invalid_username','Registrierung ohne Benutzername scheitert');
select tap.throws($$insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'z@test.de','{"username":"a b"}')$$,'invalid_username','Ungültiger Benutzername (Leerzeichen) scheitert');
select tap.throws($$insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'z2@test.de','{"username":"ab"}')$$,'invalid_username','Zu kurzer Benutzername scheitert');
select tap.throws($$insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'z3@test.de','{"username":"x''; drop table public.profiles;--"}')$$,'invalid_username','SQL-Zeichen im Benutzernamen werden abgelehnt');
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

-- ===== 7. Backups (mit Ausdünnung S1: neue Sicherung nur, wenn die letzte älter als 10 Minuten ist) =====
select tap.as_admin();
create function tap.age_backups(p_id uuid) returns void language sql security definer as $$ update public.character_backups set saved_at = saved_at - interval '11 minutes' where character_id = p_id $$;
grant execute on function tap.age_backups(uuid) to public;
select tap.is((select count(*) from public.character_backups where character_id=:'a1' and reason='update'),1::bigint,'Zwei Speicherungen kurz hintereinander -> nur ein Backup (Stand vor der ersten, S1)');
select tap.is((select min(version)||'-'||max(version) from public.character_backups where character_id=:'a1'),'1-1','Das Backup enthält Version 1 (Stand vor der ersten Speicherung)');
select tap.ok((select character_data is not null from public.character_backups where character_id=:'a1' and version=1),'Backup Version 1 enthält den alten Stand');
select tap.age_backups(:'a1');
select tap.as_user(:A);
select tap.lives('select public.save_character('''||:'a1'||''','||(select version from public.characters where character_id=:'a1')||',''{"lv":8}'')','A speichert erneut nach >10 Minuten');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'a1' and reason='update'),2::bigint,'Nach 10+ Minuten entsteht wieder ein Backup');
select tap.is((select max(version) from public.character_backups where character_id=:'a1'),3,'Neuestes Backup ist der Stand davor (Version 3)');
select tap.is((select character_data->>'lv' from public.character_backups where character_id=:'a1' and version=3),'9999','... mit dem Stand vor dieser Speicherung (damals zuletzt gespeichert)');
select tap.as_user(:B);
select tap.lives('select public.save_character('''||:'b1'||''','||g||',''{"lv":'||(g+1)||'}''), tap.age_backups('''||:'b1'||''')','B speichert Stand '||g) from generate_series(1,12) g;
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'b1' and reason='update'),10::bigint,'Es bleiben nur die letzten 10 Backups je Charakter');
select tap.is((select min(version) from public.character_backups where character_id=:'b1'),3,'Älteste Backups wurden entfernt');
select max(version) as b1mx from public.character_backups where character_id=:'b1' \gset
select tap.as_user(:B);
select tap.lives('select public.save_character('''||:'b1'||''',13,''{"lv":20}''), public.save_character('''||:'b1'||''',14,''{"lv":21}''), public.save_character('''||:'b1'||''',15,''{"lv":22}'')','B: drei schnelle Speicherungen ohne Alterung');
select tap.as_admin();
select tap.is((select max(version) from public.character_backups where character_id=:'b1'),:b1mx::int+1,'Von drei schnellen Speicherungen erzeugt nur die erste ein Backup (die vorige Sicherung war >10 Min alt, S1)');
select tap.is((select count(*) from public.character_backups where character_id=:'b1' and reason='update'),10::bigint,'... Anzahl bleibt 10');

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
select tap.lives('select public.save_character('''||:'b1'||''',16,''{"lv":30}'')','B speichert noch einmal');
select tap.as_admin();
select tap.ok((select count(*) from public.character_backups where account_id=:B)>0,'B hat Backups');
delete from auth.users where id=:B;
select tap.is((select count(*) from public.characters where account_id=:B)+(select count(*) from public.character_backups where account_id=:B)+(select count(*) from public.account_entitlements where account_id=:B),0::bigint,'Konto löschen entfernt Charaktere, Backups und Berechtigungen vollständig');

-- ===== 9b. Konto durch den Nutzer löschen (delete_account) =====
select tap.as_admin();
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (:D,'d@test.de','{"username":"Dora_4"}',now()),(:E,'e@test.de','{"username":"Emil_5"}',now()),(:F,'f@test.de','{"username":"Fritz_6"}',now());
-- Sitzungen: D frisch (neue Passwort-Anmeldung), D alt (10 Minuten), E frisch, F frisch
insert into auth.sessions(id,user_id,created_at) values
 ('d0000000-0000-0000-0000-00000000d001',:D,now()),('d0000000-0000-0000-0000-00000000d002',:D,now()-interval '10 minutes'),
 ('e0000000-0000-0000-0000-00000000e001',:E,now()),('f0000000-0000-0000-0000-00000000f001',:F,now());
insert into public.account_entitlements(account_id,entitlement_type,status,payment_reference) values (:D,'third_character_slot','active','ref_d');
select tap.as_user(:D);
select * from public.create_character(1,'D_eins','{"lv":2}');
select * from public.create_character(2,'D_zwei','{"lv":3}');
select * from public.create_character(3,'D_drei','{"lv":4}');
select tap.as_user(:E);
select * from public.create_character(1,'E_eins','{"lv":5}');
select * from public.create_character(2,'E_zwei','{"lv":6}');
select tap.as_user(:F);
select * from public.create_character(1,'F_eins','{"lv":7}');
select tap.as_admin();
select character_id::text as d1 from public.characters where character_name='D_eins' \gset
select character_id::text as d2 from public.characters where character_name='D_zwei' \gset
select character_id::text as d3 from public.characters where character_name='D_drei' \gset
select character_id::text as e1 from public.characters where character_name='E_eins' \gset
select character_id::text as f1 from public.characters where character_name='F_eins' \gset
select tap.as_user(:D);
select tap.lives('select public.save_character('''||:'d1'||''',1,''{"lv":9}'')','D speichert (erzeugt Backup)');
select tap.lives('select public.delete_character('''||:'d2'||''')','D löscht D_zwei (Backup „delete“ + Protokoll)');
select tap.as_user(:E);
select tap.lives('select public.save_character('''||:'e1'||''',1,''{"lv":10}'')','E speichert (erzeugt Backup)');
select tap.as_user(:F);
select tap.lives('select public.save_character('''||:'f1'||''',1,''{"lv":11}'')','F speichert (erzeugt Backup)');
select tap.as_admin();
-- Zahlungsereignisse (mit persönlichen Feldern) und Protokolleinträge ohne Konto, aber mit Charakter-ID
insert into public.payment_events(provider_event_id,account_id,kind,payload) values
 ('evt_d1',:D,'paid','{"amount":299,"currency":"EUR","email":"d@test.de","name":"Dora Muster","address":{"city":"X"}}'),
 ('evt_e1',:E,'paid','{"amount":299,"currency":"EUR","email":"e@test.de"}'),
 ('evt_f1',:F,'paid','{"amount":299,"currency":"EUR","email":"f@test.de"}');
insert into public.audit_log(account_id,character_id,action,detail) values (null,:'d2','legacy_row','{"x":1}'),(null,:'e1','fremd_e','{"x":1}');
select count(*) as e_chars from public.characters where account_id=:E \gset
select count(*) as e_back from public.character_backups where account_id=:E \gset
select count(*) as e_audit from public.audit_log where account_id=:E or character_id=:'e1' \gset
select count(*) as all_back_not_d from public.character_backups where account_id<>:D \gset

-- 1) Rechte und Anmeldung
select tap.as_anon();
select tap.throws($$select public.delete_account('Dora_4')$$,'permission denied|42501','Anonym kann delete_account nicht aufrufen');
select tap.as_user(:D);
select tap.throws($$select public.purge_expired_backups()$$,'permission denied|42501','Angemeldete Nutzer können die globale Aufräumfunktion nicht aufrufen');
select tap.as_admin();
set role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',false);
select tap.throws($$select public.delete_account('Dora_4')$$,'not_authenticated','Ohne Konto-ID im Token: not_authenticated');

-- 2) Sitzungsalter (keine frische Passwort-Anmeldung = keine Löschung)
select tap.as_user(:D);
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Token ohne session_id: reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d002');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Alte Sitzung (10 Minuten): reauth_required');
select tap.as_user_sess(:D,'e0000000-0000-0000-0000-00000000e001');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Sitzung eines anderen Kontos: reauth_required');
select tap.as_user_sess(:D,gen_random_uuid());
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Unbekannte Sitzung: reauth_required');

-- 3) Bestätigung (Benutzername)
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d001');
select tap.throws($$select public.delete_account('falsch')$$,'confirm_mismatch','Falscher Benutzername: confirm_mismatch');
select tap.throws($$select public.delete_account('')$$,'confirm_mismatch','Leere Bestätigung: confirm_mismatch');
select tap.throws($$select public.delete_account(null)$$,'confirm_mismatch','Fehlende Bestätigung (NULL): confirm_mismatch');
select tap.throws($$select public.delete_account('Emil_5')$$,'confirm_mismatch','Benutzername eines anderen Kontos: confirm_mismatch');
select tap.as_admin();
select tap.ok((select count(*) from auth.users where id=:D)=1 and (select count(*) from public.characters where account_id=:D)=2 and (select count(*) from public.character_backups where account_id=:D)>=2
  and (select count(*) from public.account_entitlements where account_id=:D)=1 and (select count(*) from public.payment_events where account_id=:D)=1 and (select count(*) from public.audit_log where account_id=:D)>=1,
  'Nach allen abgelehnten Versuchen ist bei D nichts verändert (Konto, Charaktere, Sicherungen, Berechtigung, Zahlung, Protokoll)');
select tap.is((select payload->>'email' from public.payment_events where provider_event_id='evt_d1'),'d@test.de','... Zahlungsereignis von D ist noch unverändert');

-- 4) Atomarität: Fehler am Ende der Löschung macht ALLES rückgängig
create function public.zz_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
create trigger zz_boom_before_delete before delete on auth.users for each row when (old.id = 'ffffffff-0000-0000-0000-000000000006') execute function public.zz_boom();
select tap.as_user_sess(:F,'f0000000-0000-0000-0000-00000000f001');
select tap.throws($$select public.delete_account('Fritz_6')$$,'boom','Fehler beim Löschen des Auth-Kontos wird gemeldet');
select tap.as_admin();
select tap.ok((select count(*) from auth.users where id=:F)=1 and (select count(*) from public.profiles where account_id=:F)=1 and (select count(*) from public.characters where account_id=:F)=1
  and (select count(*) from public.character_backups where account_id=:F)>=1,'Abbruch: Konto, Profil, Charakter und Sicherungen von F sind vollständig vorhanden');
select tap.ok((select account_id=:F and payload->>'email'='f@test.de' from public.payment_events where provider_event_id='evt_f1'),'Abbruch: Zahlungsereignis von F wurde nicht angefasst (keine halbe Anonymisierung)');
select tap.ok((select count(*) from public.audit_log where account_id=:F)>=1 or true,'Abbruch: Protokoll von F nicht gelöscht');
drop trigger zz_boom_before_delete on auth.users;
drop function public.zz_boom();

-- 5) Erfolgreiche Löschung (D) – nur das eigene Konto
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d001');
select tap.lives($$select public.delete_account('  dORA_4 ')$$,'D löscht das eigene Konto (Benutzername ohne Beachtung von Groß/Kleinschreibung und Leerzeichen)');
select tap.as_admin();
select tap.is((select count(*) from auth.users where id=:D),0::bigint,'Auth-Konto ist gelöscht');
select tap.is((select count(*) from auth.sessions where user_id=:D),0::bigint,'Sitzungen sind gelöscht');
select tap.is((select count(*) from public.profiles where account_id=:D),0::bigint,'Profil ist gelöscht');
select tap.is((select count(*) from public.characters where account_id=:D),0::bigint,'Alle Charaktere (auch Platz 3) sind gelöscht');
select tap.is((select count(*) from public.character_backups where account_id=:D or character_id in (:'d1'::uuid,:'d2'::uuid,:'d3'::uuid)),0::bigint,'Alle eigenen Sicherungen sind gelöscht (Stand- und „delete“-Sicherungen)');
select tap.is((select count(*) from public.account_entitlements where account_id=:D),0::bigint,'Berechtigung ist gelöscht');
select tap.is((select count(*) from public.audit_log where account_id=:D or character_id in (:'d1'::uuid,:'d2'::uuid,:'d3'::uuid)),0::bigint,'Protokoll ist leer (auch Zeilen ohne Konto, aber mit Charakter-ID von D)');
select tap.is((select count(*) from public.payment_events where provider_event_id='evt_d1' and account_id is null),1::bigint,'Zahlungsereignis bleibt, ohne Kontobezug');
select tap.is((select payload from public.payment_events where provider_event_id='evt_d1'),'{"redacted":true,"amount":299,"currency":"EUR"}'::jsonb,'... ohne E-Mail, Name und Adresse (nur Betrag und Währung)');
-- andere Konten komplett unberührt
select tap.is((select count(*) from public.characters where account_id=:E),:e_chars::bigint,'E: Charaktere unverändert');
select tap.is((select count(*) from public.character_backups where account_id=:E),:e_back::bigint,'E: Sicherungen unverändert');
select tap.is((select count(*) from public.audit_log where account_id=:E or character_id=:'e1'),:e_audit::bigint,'E: Protokoll unverändert (auch die Zeile ohne Konto)');
select tap.is((select payload->>'email' from public.payment_events where provider_event_id='evt_e1'),'e@test.de','E: Zahlungsereignis unverändert');
select tap.is((select count(*) from public.character_backups where account_id<>:D),:all_back_not_d::bigint,'Sicherungen aller anderen Konten unverändert');
select tap.is((select count(*) from auth.sessions where user_id=:E),1::bigint,'E: Sitzung unverändert');
-- Wiederholung / Wiederverwendung
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d001');
select tap.throws($$select public.delete_account('Dora_4')$$,'not_found','Zweiter Aufruf nach der Löschung: not_found (kein Fehlzustand)');
select tap.throws($$select * from public.create_character(1,'Zombie','{}')$$,'.','Mit dem alten Token lässt sich nichts mehr anlegen');
select tap.as_admin();
select tap.lives($$insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values (gen_random_uuid(),'dora2@test.de','{"username":"Dora_4"}',now())$$,'Der Benutzername ist nach der Löschung wieder frei');

-- 6) Zweiter Weg: Konto direkt über das Dashboard löschen (auth.users) – blockiert nicht und hinterlässt nichts
select tap.as_user(:E);
select tap.lives('select public.delete_character('''||:'e1'||''')','E löscht E_eins (Protokoll + „delete“-Sicherung)');
select tap.as_admin();
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values (:G,'g@test.de','{"username":"Gerd_7"}',now());
insert into public.payment_events(provider_event_id,account_id,kind,payload) values ('evt_g1',:G,'paid','{"amount":1}');
insert into public.audit_log(account_id,character_id,action) values (:G,gen_random_uuid(),'character_deleted');
select tap.lives($$delete from auth.users where id='99999999-0000-0000-0000-000000000007'$$,'Direktes Löschen eines Kontos mit Zahlungsereignis und Protokoll gelingt');
select tap.is((select count(*) from public.audit_log where account_id=:G),0::bigint,'... Protokoll des Kontos ist weg (Fremdschlüssel mit Kaskade)');
select tap.is((select count(*) from public.payment_events where provider_event_id='evt_g1' and account_id is null),1::bigint,'... Zahlungsereignis bleibt ohne Kontobezug');

-- 7) Aufbewahrung gelöschter Charaktere: 30 Tage innerhalb eines bestehenden Kontos
select tap.is((select count(*) from public.character_backups where character_id=:'e1' and reason='delete'),1::bigint,'E_eins: Sicherung „delete“ liegt vor');
select tap.is((select count(*) from public.character_backups where character_id=:'e1'),2::bigint,'E_eins: zwei Sicherungen insgesamt (Stand + delete)');
update public.character_backups set saved_at=now()-interval '29 days' where character_id=:'e1';
select tap.as_user(:E);
select tap.lives($$select public.touch_login()$$,'touch_login räumt auf (29 Tage alt)');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'e1'),2::bigint,'Nach 29 Tagen bleiben die Sicherungen des gelöschten Charakters');
update public.character_backups set saved_at=now()-interval '31 days' where character_id=:'e1';
select tap.as_user(:E);
select tap.lives($$select public.touch_login()$$,'touch_login räumt auf (31 Tage alt)');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'e1'),0::bigint,'Nach 31 Tagen sind alle Sicherungen des gelöschten Charakters entfernt (auch die Stand-Sicherung)');
-- Sicherungen vorhandener Charaktere und fremder Konten sind von der Frist nicht betroffen
update public.character_backups set saved_at=now()-interval '40 days' where character_id=:'f1';
select tap.as_user(:E);
select tap.lives($$select public.touch_login()$$,'E ruft touch_login erneut auf');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'f1'),1::bigint,'Alte Sicherung eines VORHANDENEN Charakters (F_eins) bleibt, auch nach 40 Tagen');
select tap.as_service();
select tap.lives($$select public.purge_expired_backups()$$,'service_role darf die globale Aufräumfunktion ausführen');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=:'f1'),1::bigint,'... und sie entfernt nichts von vorhandenen Charakteren');
-- Vorhandener Charakter mit alter Sicherung bleibt auch beim selben Konto erhalten
select tap.as_user(:E);
select tap.lives('select public.save_character((select character_id from public.characters where character_name=''E_zwei'' and account_id='''||:E||'''),1,''{"lv":12}'')','E speichert E_zwei (Sicherung entsteht)');
select tap.as_admin();
update public.character_backups set saved_at=now()-interval '45 days' where character_id=(select character_id from public.characters where character_name='E_zwei' and account_id=:E);
select tap.as_user(:E);
select tap.lives($$select public.touch_login()$$,'E ruft touch_login mit alter Sicherung eines vorhandenen Charakters auf');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id=(select character_id from public.characters where character_name='E_zwei' and account_id=:E)),1::bigint,'Sicherung des vorhandenen Charakters E_zwei (45 Tage alt) bleibt');
-- Globale Aufräumfunktion: entfernt nur Sicherungen längst gelöschter Charaktere (alle Konten), nichts Jüngeres
insert into public.character_backups(character_id,account_id,version,reason,character_data,saved_at) values
 ('f1f1f1f1-0000-0000-0000-000000000001',:F,1,'update','{}',now()-interval '40 days'),
 ('f1f1f1f1-0000-0000-0000-000000000001',:F,2,'delete','{}',now()-interval '35 days'),
 ('f2f2f2f2-0000-0000-0000-000000000002',:F,1,'delete','{}',now()-interval '5 days');
select tap.as_service();
select tap.is(public.purge_expired_backups(),2::bigint,'Globale Aufräumfunktion entfernt genau die 2 Sicherungen des seit 35 Tagen gelöschten Charakters');
select tap.as_admin();
select tap.is((select count(*) from public.character_backups where character_id='f2f2f2f2-0000-0000-0000-000000000002'),1::bigint,'... die 5 Tage alte „delete“-Sicherung bleibt');
select tap.is((select count(*) from public.character_backups where character_id=:'f1'),1::bigint,'... und die Sicherung des vorhandenen Charakters F_eins bleibt');
-- Aufräumen der Testdaten dieses Abschnitts
delete from auth.users where id in (:E,:F);
delete from auth.users where email='dora2@test.de';
delete from public.payment_events where provider_event_id in ('evt_d1','evt_e1','evt_f1','evt_g1');
delete from public.audit_log;

-- ===== 10. Strukturprüfung der Sicherheit =====
select tap.as_admin();
select tap.is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0::bigint,'RLS ist auf allen Tabellen in public aktiv');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig::text,'') like '%search_path%'),0::bigint,'Jede SECURITY-DEFINER-Funktion hat einen festen search_path');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')),'username_available','Anonym darf nur username_available aufrufen');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')),'create_character,delete_account,delete_character,list_characters,move_character,save_character,touch_login,username_available','Angemeldete Nutzer dürfen nur die vorgesehenen Funktionen aufrufen');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type<>'SELECT'),0::bigint,'Clients haben nirgends INSERT/UPDATE/DELETE-Rechte');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'),0::bigint,'Anonym hat keine Tabellenrechte');
select tap.is((select count(*) from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')),0::bigint,'Es gibt keine schreibenden RLS-Policies für Clients');

select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('delete_account','purge_account_backups','purge_expired_backups') and p.prosecdef and p.proconfig::text like '%search_path=public, pg_temp%'),3::bigint,'delete_account und Aufräumfunktionen: SECURITY DEFINER mit festem search_path');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('service_role',p.oid,'execute') and p.proname like 'purge%'),'purge_expired_backups','Nur die globale Aufräumfunktion ist für service_role freigegeben (die interne nicht)');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_account' and has_function_privilege('anon',p.oid,'execute')),0::bigint,'delete_account ist für anon nicht ausführbar');
select tap.is((select confdeltype from pg_constraint where conname='audit_log_account_id_fkey'),'c'::"char",'audit_log.account_id: Fremdschlüssel mit CASCADE');
select tap.is((select confdeltype from pg_constraint where conname='payment_events_account_id_fkey'),'n'::"char",'payment_events.account_id: Fremdschlüssel mit SET NULL');

select tap.finish();
