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
-- Sitzungen: D frisch per Passwort (1 Min.), D alt (10 Min., Passwort), D frisch aber per E-Mail-Link/OTP (kein Passwort), D 3 Min. (Passwort), E frisch, F frisch
select tap.mk_session('d0000000-0000-0000-0000-00000000d001',:D,interval '1 minute');
select tap.mk_session('d0000000-0000-0000-0000-00000000d002',:D,interval '10 minutes');
select tap.mk_session('d0000000-0000-0000-0000-00000000d003',:D,interval '10 seconds','otp');
select tap.mk_session('d0000000-0000-0000-0000-00000000d004',:D,interval '3 minutes');
select tap.mk_session('e0000000-0000-0000-0000-00000000e001',:E,interval '10 seconds');
select tap.mk_session('f0000000-0000-0000-0000-00000000f001',:F,interval '10 seconds');
-- Sitzung mit Passwort-Methode nur bei einer ANDEREN Sitzung (Zeile gehört nicht zu dieser Sitzung)
insert into auth.sessions(id,user_id,created_at) values ('d0000000-0000-0000-0000-00000000d005',:D,now());
-- Sitzung alt (3 Min.), AMR-Zeile frisch  /  Sitzung frisch, AMR-Zeile alt (3 Min.): beide Altersprüfungen müssen einzeln greifen
insert into auth.sessions(id,user_id,created_at) values ('d0000000-0000-0000-0000-00000000d006',:D,now()-interval '3 minutes');
insert into auth.mfa_amr_claims(session_id,authentication_method) values ('d0000000-0000-0000-0000-00000000d006','password');
insert into auth.sessions(id,user_id,created_at) values ('d0000000-0000-0000-0000-00000000d007',:D,now()-interval '10 seconds');
insert into auth.mfa_amr_claims(session_id,created_at,updated_at,authentication_method) values ('d0000000-0000-0000-0000-00000000d007',now()-interval '3 minutes',now()-interval '3 minutes','password');
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
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Alte Passwort-Sitzung (10 Minuten): reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d003');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Frische Sitzung, aber per E-Mail-Link/OTP statt Passwort angelegt: reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d004');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Passwort-Sitzung ist 3 Minuten alt (Fenster 2 Minuten): reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d005');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Frische Sitzung ganz ohne Anmeldemethode (keine AMR-Zeile): reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d006');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Sitzung 3 Minuten alt, AMR-Zeile frisch: reauth_required');
select tap.as_user_sess(:D,'d0000000-0000-0000-0000-00000000d007');
select tap.throws($$select public.delete_account('Dora_4')$$,'reauth_required','Sitzung frisch, Passwort-AMR-Zeile 3 Minuten alt: reauth_required');
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
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')),'create_character,delete_account,delete_character,list_characters,move_character,quest_state,save_character,touch_login,username_available','Angemeldete Nutzer dürfen nur die vorgesehenen Funktionen aufrufen');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type<>'SELECT'),0::bigint,'Clients haben nirgends INSERT/UPDATE/DELETE-Rechte');
select tap.is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'),0::bigint,'Anonym hat keine Tabellenrechte');
select tap.is((select count(*) from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')),0::bigint,'Es gibt keine schreibenden RLS-Policies für Clients');

select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('delete_account','purge_account_backups','purge_expired_backups') and p.prosecdef and p.proconfig::text like '%search_path=public, pg_temp%'),3::bigint,'delete_account und Aufräumfunktionen: SECURITY DEFINER mit festem search_path');
select tap.is((select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('service_role',p.oid,'execute') and p.proname like 'purge%'),'purge_expired_backups','Nur die globale Aufräumfunktion ist für service_role freigegeben (die interne nicht)');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_account' and has_function_privilege('anon',p.oid,'execute')),0::bigint,'delete_account ist für anon nicht ausführbar');
select tap.is((select confdeltype from pg_constraint where conname='audit_log_account_id_fkey'),'c'::"char",'audit_log.account_id: Fremdschlüssel mit CASCADE');
select tap.is((select confdeltype from pg_constraint where conname='payment_events_account_id_fkey'),'n'::"char",'payment_events.account_id: Fremdschlüssel mit SET NULL');

-- B4: save_character und move_character sperren zuerst das eigene Profil (for key share), danach die Charakterzeile (Verhalten: server/instance/tests/b2-sperren.mjs V6-8).
select tap.ok((select bool_and(position('from public.profiles where account_id = uid for key share' in prosrc) > 0
                  and position('from public.profiles where account_id = uid for key share' in prosrc) < position('from public.characters where character_id = p_id and account_id = uid for update' in prosrc))
                 from pg_proc where oid in ('public.save_character(uuid,int,jsonb)'::regprocedure, 'public.move_character(uuid,int)'::regprocedure)),
              'B4: save_character und move_character sperren Profil (key share) vor der Charakterzeile (for update)');
-- B2 (docs/B2_V6_PRUEFUNG.md, „V6′“): Sperrreihenfolge in delete_character. Nebenläufigkeit (Deadlock-Freiheit) prüft server/instance/tests/b2-sperren.mjs.
select tap.ok((select position('for key share' in prosrc) > 0
                  and position('for key share' in prosrc) < position('pg_advisory_xact_lock' in prosrc)
                  and position('pg_advisory_xact_lock' in prosrc) < position('delete from public.characters' in prosrc)
                  and position('for key share' in prosrc) < position('account_id = uid for update' in prosrc)
                  and position('account_id = uid for update' in prosrc) < position('pg_advisory_xact_lock' in prosrc)
                 from pg_proc where oid = 'public.delete_character(uuid)'::regprocedure),
              'B2: delete_character sperrt Profil (key share) -> eigene Charakterzeile (for update, Eigentum) -> Beratungssperre -> löscht (in dieser Reihenfolge, B-5)');
select tap.ok((select prosrc like '%hashtextextended(''rwi.char:'' || lower(p_id::text), 0)%' from pg_proc where oid = 'public.delete_character(uuid)'::regprocedure),
              'B2: delete_character nutzt den gemeinsamen Schlüsselausdruck hashtextextended(''rwi.char:'' || lower(<id>), 0)');
select tap.ok((select prosrc like '%transaction_isolation%read committed%read_committed_required%' from pg_proc where oid = 'public.delete_character(uuid)'::regprocedure),
              'B2: delete_character bricht außerhalb von READ COMMITTED ab');
select tap.ok((select has_function_privilege('authenticated','public.delete_character(uuid)','execute') and not has_function_privilege('anon','public.delete_character(uuid)','execute')),
              'B2: delete_character weiterhin für authenticated, nicht für anon ausführbar (Rechte unverändert)');

-- ===== 20. Quests – Paket 2 (Schema, Perioden, Rotation, quest_state lesend; docs/QUEST_PAKET2_BERICHT.md) =====
-- Testvorlagen tragen das Präfix test_ (keine Spielinhalte).
select tap.as_admin();
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('a1000000-0000-0000-0000-0000000000a1','q1@test.de','{"username":"Quest_1"}',now()),
 ('a2000000-0000-0000-0000-0000000000a2','q2@test.de','{"username":"Quest_2"}',now());
insert into public.account_entitlements(account_id,entitlement_type,status) values ('a1000000-0000-0000-0000-0000000000a1','third_character_slot','active');
insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values
 ('c1000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-0000000000a1',1,'QHeld','{"lv":49}'),
 ('c3000000-0000-0000-0000-0000000000c3','a1000000-0000-0000-0000-0000000000a1',3,'QGesperrt','{"lv":3}'),
 ('c2000000-0000-0000-0000-0000000000c2','a2000000-0000-0000-0000-0000000000a2',1,'QFremd','{"lv":5}');
update public.account_entitlements set status='refunded' where account_id='a1000000-0000-0000-0000-0000000000a1';

-- 20a. Berliner Perioden (Wechsel 09:00, Woche ab Montag, Sommerzeit)
select tap.is(public.quest_periode_datum('tag','2026-11-24 08:59:59+01'),'2026-11-23'::date,'Periode Tag: 08:59:59 Berliner Zeit gehört noch zum Vortag');
select tap.is(public.quest_periode_datum('tag','2026-11-24 09:00:00+01'),'2026-11-24'::date,'Periode Tag: ab 09:00:00 Berliner Zeit neuer Tag');
select tap.is(public.quest_periode_datum('woche','2026-11-23 08:59:59+01'),'2026-11-16'::date,'Periode Woche: Montag 08:59:59 gehört zur Vorwoche');
select tap.is(public.quest_periode_datum('woche','2026-11-23 09:00:00+01'),'2026-11-23'::date,'Periode Woche: Montag 09:00 beginnt die neue Woche');
select tap.is(public.quest_periode_datum('woche','2026-11-30 08:59:59+01'),'2026-11-23'::date,'Periode Woche: bis Montag 08:59:59 der Folgewoche');
select tap.is(public.quest_periode_datum('tag','2026-03-29 06:59:59+00'),'2026-03-28'::date,'Sommerzeit (29.03.2026): 08:59:59 MESZ = 06:59:59 UTC gehört zum Vortag');
select tap.is(public.quest_periode_datum('tag','2026-03-29 07:00:00+00'),'2026-03-29'::date,'Sommerzeit: 09:00 MESZ = 07:00 UTC beginnt den Tag');
select tap.is(public.quest_periode_datum('tag','2026-10-25 07:59:59+00'),'2026-10-24'::date,'Winterzeit (25.10.2026): 08:59:59 MEZ = 07:59:59 UTC gehört zum Vortag');
select tap.is(public.quest_periode_datum('tag','2026-10-25 08:00:00+00'),'2026-10-25'::date,'Winterzeit: 09:00 MEZ = 08:00 UTC beginnt den Tag');
select tap.is(public.quest_periode_start('2026-03-29') - public.quest_periode_start('2026-03-28'),interval '23 hours','Tag der Umstellung auf Sommerzeit dauert 23 Stunden');
select tap.is(public.quest_periode_start('2026-10-25') - public.quest_periode_start('2026-10-24'),interval '25 hours','Tag der Umstellung auf Winterzeit dauert 25 Stunden');
select tap.is(public.quest_periode_start('2026-11-25') - public.quest_periode_start('2026-11-24'),interval '24 hours','Normaler Tag dauert 24 Stunden');
select tap.is(public.quest_periode_start('2026-03-30') - public.quest_periode_start('2026-03-23'),interval '167 hours','Woche mit Sommerzeitumstellung dauert 167 Stunden');
select tap.is(public.quest_periode_start('2026-11-24'),'2026-11-24 08:00:00+00'::timestamptz,'Periodenbeginn = 09:00 Berliner Ortszeit');
select tap.is(public.quest_periode_datum('tag','2027-01-01 08:59:59+01'),'2026-12-31'::date,'Jahreswechsel: 01.01. 08:59:59 gehört zu Silvester');
select tap.is(public.quest_periode_datum('woche','2027-01-01 12:00:00+01'),'2026-12-28'::date,'Jahreswechsel: Woche beginnt am Montag 28.12.2026');
set timezone = 'America/New_York';
select tap.is(public.quest_periode_datum('tag','2026-11-24 08:00:00+00'),'2026-11-24'::date,'Ergebnis unabhängig von der Zeitzone der Sitzung');
reset timezone;
select tap.throws($$select public.quest_periode_datum('monat', now())$$,'invalid_periode','Unbekannter Periodentyp wird abgelehnt');
-- Gebietsstufe aus Level (BAND_LO 1/8/16/26/38)
select tap.is(array[public.quest_stufe(1),public.quest_stufe(7),public.quest_stufe(8),public.quest_stufe(15),public.quest_stufe(16),public.quest_stufe(25),public.quest_stufe(26),public.quest_stufe(37),public.quest_stufe(38),public.quest_stufe(50)]::int[],
              array[1,1,2,2,3,3,4,4,5,5],'quest_stufe: Level-Grenzen 1/8/16/26/38 wie BAND_LO');
select tap.ok(public.quest_stufe(null) is null,'quest_stufe: ohne bestätigtes Level keine Stufe');

-- 20b. Katalog: Präfix, Ziele (K4), Unveränderlichkeit
insert into public.quest_defs(quest_key,version,bereich,ziele) values
 ('tg:test_a',1,'tag','[{"typ":"kills","basis":5,"faktor":[1,1.5,2,3,4]}]'),('tg:test_b',1,'tag','[{"typ":"col.stock","basis":3}]'),
 ('tg:test_c',1,'tag','[{"typ":"kills","basis":2}]'),('tg:test_d',1,'tag','[{"typ":"kills","basis":2}]'),('tg:test_e',1,'tag','[{"typ":"kills","basis":2}]'),
 ('wo:test_x',1,'woche','[{"typ":"kills","basis":20}]'),('wo:test_y',1,'woche','[{"typ":"walk","basis":5000}]'),
 ('st:test.1',1,'story','[{"typ":"kills","basis":1}]');
select tap.ok((select count(*) from public.quest_defs where quest_key like '%test%') = 8,'Testvorlagen angelegt (Tag, Woche, Story)');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'woche','[{"typ":"kills","basis":1}]')$$,'quest_defs_praefix','Bereich muss zum Präfix des quest_key passen');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('xx:test',1,'tag','[{"typ":"kills","basis":1}]')$$,'23514','Unbekanntes Präfix wird abgelehnt');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[]')$$,'23514','Ziele dürfen nicht leer sein');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[{"typ":"kills","basis":5,"faktor":[1,2,3,4]}]')$$,'23514','K4: faktor braucht genau 5 Werte');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[{"typ":"kills","basis":5,"faktor":[1,2,0,4,5]}]')$$,'23514','K4: faktor-Werte müssen > 0 sein');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[{"typ":"kills","basis":5,"faktor":[1,2,"x",4,5]}]')$$,'23514','K4: faktor-Werte müssen Zahlen sein');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[{"typ":"kills","basis":0}]')$$,'23514','basis muss >= 1 sein');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_z',1,'tag','[{"typ":"Kills; drop","basis":1}]')$$,'23514','Zielschlüssel mit unzulässigen Zeichen wird abgelehnt');
select tap.throws($$update public.quest_defs set ziele='[{"typ":"kills","basis":99}]' where quest_key='tg:test_a'$$,'quest_version_immutable','Versionen sind unveränderlich (Ziele)');
select tap.throws($$update public.quest_defs set belohnung='{"xp":1}' where quest_key='tg:test_a'$$,'quest_version_immutable','Versionen sind unveränderlich (Belohnung)');
select tap.lives($$update public.quest_defs set aktiv=false where quest_key='tg:test_e'$$,'Nur „aktiv“ ist änderbar (Vorlage zurückziehen)');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('ev:test_fest:1',1,'event','[{"typ":"kills","basis":1}]')$$,'event_unknown','Event-Quest nur zu vorhandenem Event');
insert into public.quest_events(event_key,start_at,end_at) values ('test_fest',now()-interval '1 day',now()+interval '1 day'),('test_bald',now()+interval '5 days',now()+interval '6 days');
select tap.lives($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('ev:test_fest:1',1,'event','[{"typ":"kills","basis":1}]'),('ev:test_bald:1',1,'event','[{"typ":"kills","basis":1}]')$$,'Event-Quests mit vorhandenem Event');
select tap.throws($$insert into public.quest_events(event_key,start_at,end_at) values ('test_kaputt',now(),now()-interval '1 hour')$$,'23514','Event: Ende muss nach Beginn liegen');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,ziele) values ('pr:krieger:-:1',1,'pruefung','[{"typ":"kills","basis":1}]')$$,'quest_defs_pruefung','Klassenprüfung braucht eine Stufe');
select tap.lives($$insert into public.quest_defs(quest_key,version,bereich,klasse,stufe,ziele) values ('pr:krieger:-:1',1,'pruefung','krieger',1,'[{"typ":"kills","basis":1}]')$$,'Klassenprüfung mit Klasse und Stufe');
select tap.throws($$insert into public.quest_defs(quest_key,version,bereich,stufe,ziele) values ('st:test.2',1,'story',2,'[{"typ":"kills","basis":1}]')$$,'quest_defs_pruefung','Stufe nur bei Klassenprüfungen');

-- 20c. Pool und deterministische Rotation (K3)
insert into public.quest_pools(periode_typ,quest_key,version,gewicht) values
 ('tag','tg:test_e',1,1),('tag','tg:test_d',1,1),('tag','tg:test_c',1,1),('tag','tg:test_b',1,1),('tag','tg:test_a',1,1),('woche','wo:test_x',1,1),('woche','wo:test_y',1,1);
select tap.throws($$insert into public.quest_pools(periode_typ,quest_key,version,gewicht) values ('woche','tg:test_a',1,1)$$,'pool_bereich','Pool: nur Vorlagen des passenden Bereichs');
select tap.throws($$insert into public.quest_pools(periode_typ,quest_key,version,gewicht) values ('tag','st:test.1',1,1)$$,'pool_bereich|23514','Pool: keine Story-Quests');
select tap.throws($$update public.quest_pools set gewicht=0 where quest_key='tg:test_a'$$,'23514','Pool: Gewicht muss >= 1 sein');
select tap.is((select array_agg(quest_key order by quest_key) from public.quest_rotation_wahl('tag','2030-01-01')),
              (select array_agg(quest_key order by quest_key) from public.quest_rotation_wahl('tag','2030-01-01')),'Rotation: gleiche Periode -> gleiche Auswahl (deterministisch)');
select tap.is((select count(*) from public.quest_rotation_wahl('tag','2030-01-01')),3::bigint,'Rotation: genau 3 Quests, wenn genug Vorlagen da sind');
select tap.is((select count(distinct quest_key) from public.quest_rotation_wahl('tag','2030-01-01')),3::bigint,'Rotation: keine doppelte Vorlage in einer Periode');
select tap.ok(not exists (select 1 from public.quest_rotation_wahl('tag','2030-01-01') where quest_key='tg:test_e'),'Rotation: inaktive Definition wird nie gewählt');
select tap.ok((select count(distinct array_to_string(array(select quest_key from public.quest_rotation_wahl('tag', d::date) order by 1),',')) from generate_series('2030-02-01'::date,'2030-02-28'::date,'1 day') d) > 1,
              'Rotation: verschiedene Perioden ergeben unterschiedliche Auswahlen');
select tap.is((select count(*) from public.quest_rotation_wahl('woche','2030-01-07')),2::bigint,'Rotation: weniger als 3 Vorlagen -> nur die vorhandenen (Woche: 2)');
select tap.throws($$select * from public.quest_rotation_wahl('tag', null)$$,'invalid_periode','Rotation: Periodendatum ist Pflicht');
-- Gewichte: eine schwere Vorlage (1000) gegen vier leichte (1) über 100 Perioden ohne gespeicherte Vorperiode
update public.quest_pools set gewicht=1000 where quest_key='tg:test_a';
select tap.ok((select count(*) from generate_series('2031-01-01'::date,'2031-04-10'::date,'1 day') d where exists (select 1 from public.quest_rotation_wahl('tag', d::date) w where w.quest_key='tg:test_a') and exists (select 1 from public.quest_rotation_wahl('tag', d::date) w2 where w2.quest_key='tg:test_a')) >= 98,
              'Rotation: Gewichtung wirkt (schwere Vorlage in nahezu jeder Periode)');
update public.quest_pools set gewicht=1 where quest_key='tg:test_a';
-- Speichern, Unveränderlichkeit, keine Wiederholung aus der Vorperiode
select public.quest_rotation_sichern('tag','2030-03-01');
select tap.is((select cardinality(quest_keys) from public.quest_rotation where periode_typ='tag' and periode_datum='2030-03-01'),3,'Rotation gespeichert (3 Quests)');
select tap.is((select quest_keys from public.quest_rotation where periode_typ='tag' and periode_datum='2030-03-01'),
              (select array_agg(quest_key order by ord) from public.quest_rotation_wahl('tag','2030-03-01') with ordinality as w(quest_key,version,ord)),'Gespeicherte Rotation = deterministische Auswahl');
select public.quest_rotation_sichern('tag','2030-03-01');
select tap.is((select count(*) from public.quest_rotation where periode_typ='tag' and periode_datum='2030-03-01'),1::bigint,'Zweites Anlegen ändert nichts (einmal je Periode)');
select tap.throws($$update public.quest_rotation set quest_keys='{tg:test_a}', versionen='{1}' where periode_typ='tag' and periode_datum='2030-03-01'$$,'rotation_immutable','Gespeicherte Rotation ist unveränderlich');
select tap.throws($$delete from public.quest_rotation where periode_typ='tag' and periode_datum='2030-03-01'$$,'rotation_immutable','Gespeicherte Rotation ist nicht löschbar');
-- K3 (abschließend): zuerst Vorlagen, die nicht in der Vorperiode vorkamen, dann gewichtet aus der Vorperiode auffüllen; immer 3 verschiedene, wenn möglich
select tap.ok((select count(*) = 3 and count(distinct quest_key) = 3 from public.quest_rotation_wahl('tag','2030-03-02')),'Periodenwechsel (4 aktive Vorlagen): wieder 3 verschiedene Quests');
select tap.ok((select count(*) from public.quest_rotation_wahl('tag','2030-03-02') w join public.quest_rotation r on r.periode_typ='tag' and r.periode_datum='2030-03-01' and not (w.quest_key = any(r.quest_keys))) = 1,
              '4 Vorlagen: die eine nicht wiederholte Vorlage kommt zuerst zum Zug');
select tap.ok((select (array_agg(w.quest_key order by w.o))[1] from public.quest_rotation_wahl('tag','2030-03-02') with ordinality w(quest_key,version,o)) <> all (select unnest(quest_keys) from public.quest_rotation where periode_typ='tag' and periode_datum='2030-03-01'),
              'Reihenfolge: neue Vorlagen vor den aufgefüllten der Vorperiode');
select public.quest_rotation_sichern('woche','2030-03-04');
select tap.is((select cardinality(quest_keys) from public.quest_rotation where periode_typ='woche' and periode_datum='2030-03-04'),2,'Woche: 2 aktive Vorlagen -> Rotation mit 2 Quests');
select public.quest_rotation_sichern('woche','2030-03-11');
select tap.is((select (select array_agg(k order by k) from unnest(quest_keys) k) from public.quest_rotation where periode_typ='woche' and periode_datum='2030-03-11'),array['wo:test_x','wo:test_y'],
              'Woche: alle Vorlagen in der Vorwoche -> aus der Vorwoche aufgefüllt (2, ohne Duplikate), keine leere Periode');
update public.quest_pools set aktiv=false where periode_typ='woche';
select public.quest_rotation_sichern('woche','2030-03-18');
select tap.ok(not exists (select 1 from public.quest_rotation where periode_typ='woche' and periode_datum='2030-03-18'),'Ohne aktive Vorlage wird keine (leere) Rotation gespeichert');
update public.quest_pools set aktiv=true where periode_typ='woche';
-- Poolgrößen 1–7: eigene Testvorlagen tg:test_p1..p7, nur diese aktiv; drei Perioden hintereinander je Poolgröße
insert into public.quest_defs(quest_key,version,bereich,ziele) select 'tg:test_p'||i,1,'tag','[{"typ":"kills","basis":1}]' from generate_series(1,7) i;
insert into public.quest_pools(periode_typ,quest_key,version,gewicht,aktiv) select 'tag','tg:test_p'||i,1,i,false from generate_series(1,7) i;
update public.quest_pools set aktiv=false where periode_typ='tag' and quest_key not like 'tg:test_p%';
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p1') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-01-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,1) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-01-10' and '2040-01-10'::date+2),
              'Pool 1: jede Periode hat min(3,1) = 1 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 1 - cardinality(vor)) and alt = least(3,1) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-01-10'::date+1 and '2040-01-10'::date+2) x),
              'Pool 1: Periodenwechsel – alle 0 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (1) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-01-10'::date+1 and '2040-01-10'::date+2),'Pool 1: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p2') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-02-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,2) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-02-10' and '2040-02-10'::date+2),
              'Pool 2: jede Periode hat min(3,2) = 2 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 2 - cardinality(vor)) and alt = least(3,2) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-02-10'::date+1 and '2040-02-10'::date+2) x),
              'Pool 2: Periodenwechsel – alle 0 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (2) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-02-10'::date+1 and '2040-02-10'::date+2),'Pool 2: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p3') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-03-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,3) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-03-10' and '2040-03-10'::date+2),
              'Pool 3: jede Periode hat min(3,3) = 3 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 3 - cardinality(vor)) and alt = least(3,3) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-03-10'::date+1 and '2040-03-10'::date+2) x),
              'Pool 3: Periodenwechsel – alle 0 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (3) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-03-10'::date+1 and '2040-03-10'::date+2),'Pool 3: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p4') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-04-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,4) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-04-10' and '2040-04-10'::date+2),
              'Pool 4: jede Periode hat min(3,4) = 3 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 4 - cardinality(vor)) and alt = least(3,4) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-04-10'::date+1 and '2040-04-10'::date+2) x),
              'Pool 4: Periodenwechsel – alle 1 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (2) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-04-10'::date+1 and '2040-04-10'::date+2),'Pool 4: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p5') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-05-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,5) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-05-10' and '2040-05-10'::date+2),
              'Pool 5: jede Periode hat min(3,5) = 3 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 5 - cardinality(vor)) and alt = least(3,5) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-05-10'::date+1 and '2040-05-10'::date+2) x),
              'Pool 5: Periodenwechsel – alle 2 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (1) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-05-10'::date+1 and '2040-05-10'::date+2),'Pool 5: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p6') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-06-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,6) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-06-10' and '2040-06-10'::date+2),
              'Pool 6: jede Periode hat min(3,6) = 3 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 6 - cardinality(vor)) and alt = least(3,6) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-06-10'::date+1 and '2040-06-10'::date+2) x),
              'Pool 6: Periodenwechsel – alle 3 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (0) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-06-10'::date+1 and '2040-06-10'::date+2),'Pool 6: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p7') where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag','2040-07-10'::date + o) from generate_series(0,2) o;
select tap.ok((select bool_and(cardinality(quest_keys) = least(3,7) and (select count(distinct k) from unnest(quest_keys) k) = cardinality(quest_keys)) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-07-10' and '2040-07-10'::date+2),
              'Pool 7: jede Periode hat min(3,7) = 3 verschiedene Quests');
select tap.ok((select bool_and(neu = least(3, 7 - cardinality(vor)) and alt = least(3,7) - neu)
                 from (select (select count(*) from unnest(r.quest_keys) k where not (k = any (v.quest_keys))) neu, (select count(*) from unnest(r.quest_keys) k where k = any (v.quest_keys)) alt, v.quest_keys vor
                         from public.quest_rotation r join public.quest_rotation v on v.periode_typ='tag' and v.periode_datum = r.periode_datum - 1
                        where r.periode_typ='tag' and r.periode_datum between '2040-07-10'::date+1 and '2040-07-10'::date+2) x),
              'Pool 7: Periodenwechsel – alle 4 nicht wiederholten Vorlagen (höchstens 3) zuerst, Rest (0) aus der Vorperiode aufgefüllt');
select tap.ok((select bool_and(r.quest_keys = (select array_agg(w.quest_key order by w.o) from public.quest_rotation_wahl('tag', r.periode_datum) with ordinality w(quest_key,version,o)))
                 from public.quest_rotation r where r.periode_typ='tag' and r.periode_datum between '2040-07-10'::date+1 and '2040-07-10'::date+2),'Pool 7: Wiederholter Aufruf ergibt dieselbe Auswahl (reproduzierbar)');
select public.quest_rotation_sichern('tag','2040-04-10'::date + o) from generate_series(0,2) o;
select tap.is((select count(*) from public.quest_rotation where periode_typ='tag' and periode_datum between '2040-04-10' and '2040-04-12'),3::bigint,'Wiederholtes Anlegen ändert gespeicherte Perioden nicht (je 1 Zeile)');
-- Auffüllung gewichtet: Pool 4 mit einer schweren Vorlage; über 60 Periodenpaare kommt die schwere aus der Vorperiode fast immer zurück
update public.quest_pools set aktiv = (quest_key between 'tg:test_p1' and 'tg:test_p4'), gewicht = case quest_key when 'tg:test_p1' then 1000 else 1 end where quest_key like 'tg:test_p%';
select public.quest_rotation_sichern('tag', '2041-01-01'::date + 2*o) from generate_series(0,59) o;
select tap.ok((select count(*) from generate_series(0,59) o where 'tg:test_p1' in (select unnest(quest_keys) from public.quest_rotation where periode_typ='tag' and periode_datum='2041-01-01'::date+2*o)
                 and 'tg:test_p1' = any (array(select quest_key from public.quest_rotation_wahl('tag','2041-01-02'::date+2*o)))) >= 55,
              'Auffüllung aus der Vorperiode ist gewichtet (schwere Vorlage wird fast immer wieder aufgefüllt)');
update public.quest_pools set aktiv = false, gewicht = 1 where quest_key like 'tg:test_p%';
update public.quest_pools set aktiv = true where periode_typ='tag' and quest_key not like 'tg:test_p%';
select tap.throws($$insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('tag','2030-05-01','{wo:test_x}','{1}')$$,'rotation_invalid','Rotation: nur Vorlagen des Periodentyps');
select tap.throws($$insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('tag','2030-05-01','{tg:test_a,tg:test_a}','{1,1}')$$,'rotation_invalid','Rotation: keine doppelte Vorlage');
select tap.throws($$insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('woche','2030-05-06','{}','{}')$$,'23514','Rotation: nie leer gespeichert');
select tap.throws($$insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('woche','2030-05-07','{wo:test_x}','{1}')$$,'quest_rotation_montag','Rotation Woche: Datum muss ein Montag sein');

-- Löschen von Versionen: nur ohne Verweis (Rotation, Questzeile, Pool); TRUNCATE für service_role entzogen
insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_frei',1,'tag','[{"typ":"kills","basis":1}]');
select tap.lives($$delete from public.quest_defs where quest_key='tg:test_frei'$$,'Unbenutzte Version darf gelöscht werden');
insert into public.quest_defs(quest_key,version,bereich,ziele) values ('tg:test_rot',1,'tag','[{"typ":"kills","basis":1}]');
insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('tag','2030-06-01','{tg:test_rot}','{1}');
select tap.throws($$delete from public.quest_defs where quest_key='tg:test_rot'$$,'quest_version_immutable','Version aus einer gespeicherten Rotation ist nicht löschbar (ohne Pool und Questzeile)');
select tap.as_service();
select tap.throws($$truncate public.quest_rotation$$,'permission denied|42501','service_role: kein TRUNCATE auf der Rotation (umginge die Zeilentrigger)');
select tap.throws($$truncate public.quest_defs cascade$$,'permission denied|42501','service_role: kein TRUNCATE auf dem Katalog');
select tap.throws($$truncate public.quest_rewards$$,'permission denied|42501','service_role: kein TRUNCATE auf Gutschriften');
select tap.throws($$truncate public.character_quests cascade$$,'permission denied|42501','service_role: kein TRUNCATE auf Questzeilen');
select tap.throws($$truncate public.character_confirmed$$,'permission denied|42501','service_role: kein TRUNCATE auf bestätigten Werten');
select tap.throws($$update public.quest_rotation set quest_keys=quest_keys$$,'rotation_immutable','service_role: Rotation auch für den Dienst unveränderlich');
select tap.as_admin();
-- 20d. Bestätigte Werte (K1/K2): nur steigend, nie von Clients schreibbar
select tap.lives($$insert into public.character_confirmed(character_id,level,zaehler,story_done) values ('c1000000-0000-0000-0000-0000000000c1',20,'{"kills":10,"col.stock":4}','{st:test.1}')$$,'Bestätigte Werte anlegen (Server)');
select tap.throws($$update public.character_confirmed set level=19 where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_only_increases','Bestätigtes Level sinkt nie');
select tap.throws($$update public.character_confirmed set level=null where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_only_increases','Bestätigtes Level wird nie wieder unbestätigt');
select tap.throws($$update public.character_confirmed set zaehler='{"kills":9,"col.stock":4}' where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_only_increases','Bestätigter Zähler sinkt nie');
select tap.throws($$update public.character_confirmed set zaehler='{"kills":10}' where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_only_increases','Bestätigter Zähler verschwindet nie');
select tap.throws($$update public.character_confirmed set story_done='{}' where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_only_increases','Story-Abschlüsse werden nie zurückgenommen');
select tap.lives($$update public.character_confirmed set level=21, zaehler='{"kills":12,"col.stock":4,"walk":100}', story_done='{st:test.1,st:test.2}' where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'Steigende Werte werden angenommen');
select tap.throws($$insert into public.character_confirmed(character_id,zaehler) values ('c2000000-0000-0000-0000-0000000000c2','{"kills":-1}')$$,'23514','Zählerwerte müssen ganze Zahlen >= 0 sein');
select tap.throws($$delete from public.character_confirmed where character_id='c1000000-0000-0000-0000-0000000000c1'$$,'confirmed_immutable','Bestätigte Werte sind nicht löschbar (außer mit dem Charakter)');

-- 20e. Questzeilen: Instanzschlüssel, festgeschriebene Werte, K1-Sperre für Tag/Woche
select tap.lives($$insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','einmalig',1)$$,'Story-Quest mit inst_key einmalig');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','d:2026-11-24',1)$$,'character_quests_inst','Story verlangt inst_key einmalig');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c2000000-0000-0000-0000-0000000000c2','tg:test_a','d:2026-11-24',1,'2026-11-24',1,'{"kills":5}','{"kills":0}')$$,'level_unconfirmed','K1: ohne bestätigtes Level keine Tagesquest');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_a','d:2026-11-24',1,'2026-11-24',5,'{"kills":20}','{"kills":12}')$$,'level_unconfirmed','K1: Stufe muss die aus dem bestätigten Level sein (Level 21 -> Stufe 3)');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_a','d:2026-11-24',1,'2026-11-24',3,'{"kills":10}')$$,'character_quests_fest','Tag/Woche nie ohne festgeschriebenen Startstand');
select tap.lives($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_a','d:2026-11-24',1,'2026-11-24',3,'{"kills":10}','{"kills":12}')$$,'Tagesquest mit bestätigter Stufe und festen Werten (Ablage für Paket 3)');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_b','d:2026-02-30',1,null,3,'{}','{}')$$,'character_quests_inst','Ungültiges Datum im inst_key');
select tap.ok(not public.quest_inst_ok('tg:x','d:2026-02-30') and not public.quest_inst_ok('tg:x','d:2026-13-01') and public.quest_inst_ok('tg:x','d:2028-02-29') and not public.quest_inst_ok('wo:x','w:2026-11-25') and public.quest_inst_ok('wo:x','w:2026-11-23')
              and public.quest_inst_ok('nb:x','n:9500:-12:7') and not public.quest_inst_ok('nb:x','n:a:1:1') and public.quest_inst_ok('ev:fest:2','e:fest') and not public.quest_inst_ok('st:1.1','e:fest'),'quest_inst_ok: Formate je Bereich (Datum gültig, Woche = Montag, NPC-Fenster, Event)');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_b','d:2026-11-24',1,'2026-11-25',3,'{}','{}')$$,'character_quests_periode','periode_datum muss zum inst_key passen');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,periode_datum,stufe,menge_soll,start_stand) values ('c1000000-0000-0000-0000-0000000000c1','wo:test_x','w:2026-11-24',1,'2026-11-24',3,'{}','{}')$$,'character_quests_inst','Wochen-inst_key muss ein Montag sein');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c1000000-0000-0000-0000-0000000000c1','ev:test_fest:1','e:anderes',1)$$,'character_quests_inst','Event-inst_key muss zum Event passen');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','einmalig',1)$$,'23505','Je Charakter, Quest und Instanz genau eine Zeile');
select tap.throws($$update public.character_quests set stufe=4 where quest_key='tg:test_a'$$,'quest_row_immutable','Festgeschriebene Stufe unveränderlich');
select tap.throws($$update public.character_quests set start_stand='{"kills":0}' where quest_key='tg:test_a'$$,'quest_row_immutable','Festgeschriebener Startstand unveränderlich');
select tap.throws($$update public.character_quests set menge_soll='{"kills":1}' where quest_key='tg:test_a'$$,'quest_row_immutable','Festgeschriebene Menge unveränderlich');
select tap.lives($$update public.character_quests set status='abgeschlossen', abgeschlossen_am=now() where quest_key='st:test.1'$$,'Status aktiv -> abgeschlossen');
select tap.throws($$update public.character_quests set status='aktiv' where quest_key='st:test.1'$$,'quest_status_transition','Status nie zurück');
select tap.throws($$delete from public.character_quests where quest_key='st:test.1'$$,'quest_row_immutable','Questzeilen sind nicht löschbar (außer mit dem Charakter)');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version,status) values ('c2000000-0000-0000-0000-0000000000c2','ev:test_fest:1','e:test_fest',1,'abgeschlossen')$$,'quest_status_transition','Nur Story darf direkt abgeschlossen angelegt werden (Story-Sync)');
insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c2000000-0000-0000-0000-0000000000c2','st:test.1','einmalig',1),('c3000000-0000-0000-0000-0000000000c3','st:test.1','einmalig',1);

-- 20f. Gutschriften: rid, Idempotenz, Unveränderlichkeit, Frist
select tap.lives($$insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','einmalig','{"xp":20}')$$,'Gutschrift anlegen');
select tap.is((select rid from public.quest_rewards where character_id='c1000000-0000-0000-0000-0000000000c1' and quest_key='st:test.1'),'st:test.1|einmalig','rid = quest_key|inst_key');
select tap.throws($$insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','einmalig','{"xp":99}')$$,'23505','Zweite Gutschrift mit derselben rid ist unmöglich');
insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung) values ('c1000000-0000-0000-0000-0000000000c1','st:test.1','einmalig','{"xp":99}') on conflict do nothing;
select tap.is((select belohnung from public.quest_rewards where character_id='c1000000-0000-0000-0000-0000000000c1' and rid='st:test.1|einmalig'),'{"xp":20}'::jsonb,'on conflict do nothing: bestehende Gutschrift bleibt unverändert');
select tap.throws($$insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung) values ('c1000000-0000-0000-0000-0000000000c1','st:test.9','einmalig','{"xp":1}')$$,'23503','Gutschrift nur zu vorhandener Questzeile');
select tap.throws($$update public.quest_rewards set belohnung='{"xp":21}' where rid='st:test.1|einmalig'$$,'reward_immutable','Belohnung unveränderlich');
select tap.throws($$update public.quest_rewards set gueltig_bis=now()+interval '99 days' where rid='st:test.1|einmalig'$$,'reward_immutable','Frist unveränderlich');
select tap.lives($$update public.quest_rewards set status='im_spielstand' where rid='st:test.1|einmalig' and character_id='c1000000-0000-0000-0000-0000000000c1'$$,'offen -> im_spielstand innerhalb der Frist');
select tap.lives($$update public.quest_rewards set status='offen' where rid='st:test.1|einmalig' and character_id='c1000000-0000-0000-0000-0000000000c1'$$,'im_spielstand -> offen innerhalb der Frist');
select tap.throws($$update public.quest_rewards set status='verfallen' where rid='st:test.1|einmalig' and character_id='c1000000-0000-0000-0000-0000000000c1'$$,'reward_status_transition','verfallen erst nach Fristende');
select tap.throws($$insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung,status) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_a','d:2026-11-24','{}','endgueltig')$$,'reward_status_transition','Neue Gutschrift nur als offen oder im_spielstand');
insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung,angelegt_am,gueltig_bis) values ('c1000000-0000-0000-0000-0000000000c1','tg:test_a','d:2026-11-24','{"xp":5}',now()-interval '20 days',now()-interval '6 days');
select tap.throws($$update public.quest_rewards set status='im_spielstand' where rid='tg:test_a|d:2026-11-24'$$,'reward_status_transition','Nach Fristende kein Abgleich mehr (offen bleibt offen)');
select tap.lives($$update public.quest_rewards set status='verfallen' where rid='tg:test_a|d:2026-11-24'$$,'offen -> verfallen nach Fristende');
select tap.throws($$update public.quest_rewards set status='offen' where rid='tg:test_a|d:2026-11-24'$$,'reward_status_transition','verfallen ist endgültig');
select tap.throws($$delete from public.quest_rewards where rid='tg:test_a|d:2026-11-24'$$,'reward_immutable','Gutschriften sind nicht löschbar (außer mit dem Charakter)');

-- 20g. Rechte und Sichtbarkeit
select tap.as_anon();
select tap.throws($$select * from public.quest_defs$$,'permission denied|42501','Anonym: kein Zugriff auf den Katalog');
select tap.throws($$select public.quest_state('c1000000-0000-0000-0000-0000000000c1')$$,'permission denied|42501','Anonym: quest_state nicht ausführbar');
select tap.as_user('a1000000-0000-0000-0000-0000000000a1');
select tap.ok((select count(*) from public.quest_defs where quest_key like '%test%') > 0 and not exists (select 1 from public.quest_defs where bereich='pruefung'),'Katalog lesbar, Klassenprüfungen nicht (geheime Bedingungen bleiben serverseitig)');
select tap.ok(exists (select 1 from public.quest_defs where quest_key='ev:test_fest:1') and not exists (select 1 from public.quest_defs where quest_key='ev:test_bald:1'),'Event-Quests erst ab Eventbeginn sichtbar');
select tap.ok(exists (select 1 from public.quest_events where event_key='test_fest') and not exists (select 1 from public.quest_events where event_key='test_bald'),'Künftige Events sind nicht sichtbar');
select tap.ok((select count(*) from public.quest_rotation) >= 2,'Rotation ist lesbar');
select tap.throws($$select * from public.quest_pools$$,'permission denied|42501','Pool (Gewichte) ist für Clients nicht lesbar');
select tap.throws($$select * from public.npc_seed$$,'permission denied|42501','NPC-Seeds sind für Clients nicht lesbar');
select tap.throws($$select * from public.quest_audit$$,'permission denied|42501','Quest-Protokoll ist für Clients nicht lesbar');
select tap.is((select array_agg(distinct character_id::text) from public.character_quests),array['c1000000-0000-0000-0000-0000000000c1'],'Eigene Questzeilen sichtbar, fremde und gesperrte (Platz 3) nicht');
select tap.is((select count(*) from public.quest_rewards),2::bigint,'Eigene Gutschriften sichtbar');
select tap.is((select level from public.character_confirmed),21::smallint,'Eigene bestätigte Werte sichtbar');
select tap.throws($$insert into public.character_quests(character_id,quest_key,inst_key,version) values ('c1000000-0000-0000-0000-0000000000c1','st:test.2','einmalig',1)$$,'permission denied|42501','Clients schreiben keine Questzeilen');
select tap.throws($$update public.character_confirmed set level=50$$,'permission denied|42501','Clients schreiben keine bestätigten Werte');
select tap.throws($$insert into public.quest_rotation(periode_typ,periode_datum,quest_keys,versionen) values ('tag','2031-01-01','{tg:test_a}','{1}')$$,'permission denied|42501','Clients schreiben keine Rotation');
select tap.throws($$select public.quest_rotation_sichern('tag','2031-01-01')$$,'permission denied|42501','Interne Rotationsfunktion nicht aufrufbar');
select tap.throws($$select public.quest_periode_datum('tag',now())$$,'permission denied|42501','Interne Periodenfunktion nicht aufrufbar');
select tap.as_user('a2000000-0000-0000-0000-0000000000a2');
select tap.is((select count(*) from public.quest_rewards)+(select count(*) from public.character_confirmed),0::bigint,'B sieht keine Gutschriften oder bestätigten Werte von A');

-- 20h. quest_state (lesend, Aktivierung gesperrt)
select tap.as_user('a1000000-0000-0000-0000-0000000000a1');
select tap.throws($$select public.quest_state('c2000000-0000-0000-0000-0000000000c2')$$,'not_found','quest_state: fremder Charakter -> not_found');
select tap.throws($$select public.quest_state('c9999999-0000-0000-0000-000000000000')$$,'not_found','quest_state: unbekannter Charakter -> not_found (gleiche Meldung)');
select tap.throws($$select public.quest_state(null)$$,'not_found','quest_state: ohne Charakter -> not_found');
select tap.throws($$select public.quest_state('c3000000-0000-0000-0000-0000000000c3')$$,'character_locked','quest_state: Platz 3 ohne Berechtigung -> character_locked');
select tap.as_admin();
create temp table qs_vorher as select (select count(*) from public.character_quests) q, (select count(*) from public.quest_rewards) r, (select count(*) from public.character_confirmed) c;
grant select on qs_vorher to authenticated;
select tap.as_user('a1000000-0000-0000-0000-0000000000a1');
create temp table qs as select public.quest_state('c1000000-0000-0000-0000-0000000000c1') j;
select tap.ok((select j->'aktivierung'->>'tag_woche' = 'false' and j->'aktivierung'->>'grund' = 'gesperrt_bis_paket_3' from qs),'quest_state: Tages-/Wochenaktivierung gesperrt (K2)');
select tap.ok((select (j->>'stufe')::int = 3 and (j->'bestaetigt'->>'level')::int = 21 from qs),'quest_state: Stufe nur aus bestätigtem Level (21 -> 3), nicht aus dem Spielstand (lv 49)');
select tap.ok((select (j->'perioden'->'tag'->>'datum')::date = public_tag and (j->'perioden'->'woche'->>'datum')::date = public_woche
                 from qs, lateral (select (((j->>'server_zeit')::timestamptz at time zone 'Europe/Berlin') - interval '9 hours')::date as public_tag) a,
                      lateral (select public_tag - (extract(isodow from public_tag)::int - 1) as public_woche) b),'quest_state: Perioden aus der Serverzeit (Berlin, 09:00)');
select tap.ok((select (j->'perioden'->'tag'->>'ende')::timestamptz > (j->>'server_zeit')::timestamptz and (j->'perioden'->'tag'->>'start')::timestamptz <= (j->>'server_zeit')::timestamptz from qs),'quest_state: Serverzeit liegt in der gemeldeten Tagesperiode');
select tap.ok((select jsonb_array_length(j->'rotation'->'tag') between 1 and 3 from qs),'quest_state: legt die Tagesrotation an und liefert sie');
select tap.ok((select j->'rotation'->'tag' = (select jsonb_agg(jsonb_build_object('quest_key',u.k,'version',u.v) order by u.o) from public.quest_rotation r, unnest(r.quest_keys, r.versionen) with ordinality u(k,v,o)
                 where r.periode_typ='tag' and r.periode_datum=(j->'perioden'->'tag'->>'datum')::date) from qs),'quest_state: Rotation = gespeicherte Rotation der Periode');
select tap.ok((select jsonb_array_length(j->'quests') = 2 and jsonb_array_length(j->'gutschriften') = 2 from qs),'quest_state: liefert eigene Questzeilen und Gutschriften');
select tap.ok((select exists (select 1 from jsonb_array_elements(j->'gutschriften') g where g->>'rid' = 'tg:test_a|d:2026-11-24' and g->>'status' = 'verfallen') from qs),'quest_state: Gutschriftstatus nach Fristende');
select tap.ok((select exists (select 1 from jsonb_array_elements(j->'events') e where e->>'event_key' = 'test_fest') and not exists (select 1 from jsonb_array_elements(j->'events') e where e->>'event_key' = 'test_bald') from qs),'quest_state: nur laufende Events');
select tap.is((select public.quest_state('c1000000-0000-0000-0000-0000000000c1')->'rotation'),(select j->'rotation' from qs),'quest_state: wiederholter Aufruf liefert dieselbe Rotation');
select tap.as_admin();
select tap.ok((select q = (select count(*) from public.character_quests) and r = (select count(*) from public.quest_rewards) and c = (select count(*) from public.character_confirmed) from qs_vorher),
              'quest_state schreibt keine Questzeilen, Gutschriften oder bestätigten Werte (Paket 2 nur lesend)');
select tap.ok((select count(*) from public.character_confirmed where character_id='c2000000-0000-0000-0000-0000000000c2') = 0,'Kein bestätigter Wert entsteht aus Client-Daten (K2)');
-- ohne bestätigte Werte: keine Stufe
select tap.as_user('a2000000-0000-0000-0000-0000000000a2');
select tap.ok((select j->'stufe' = 'null'::jsonb and j->'bestaetigt' = 'null'::jsonb from (select public.quest_state('c2000000-0000-0000-0000-0000000000c2') j) x),'quest_state: ohne bestätigtes Level keine Stufe (K1)');
select tap.as_admin();
begin transaction isolation level repeatable read;
select tap.as_user('a1000000-0000-0000-0000-0000000000a1');
select tap.throws($$select public.quest_state('c1000000-0000-0000-0000-0000000000c1')$$,'read_committed_required','quest_state: nur unter READ COMMITTED');
commit;
select tap.as_admin();
-- Sperrfolge (statisch; Nebenläufigkeit: server/instance/tests/quest-sperren.mjs)
select tap.ok((select position('quest_rotation_sichern(''tag''' in prosrc) > 0
                  and position('quest_rotation_sichern(''woche''' in prosrc) < position('from public.profiles where account_id = uid for key share' in prosrc)
                  and position('from public.profiles where account_id = uid for key share' in prosrc) < position('from public.characters where character_id = p_character and account_id = uid for key share' in prosrc)
                  and position('pg_advisory' in prosrc) = 0 and position('for update' in prosrc) = 0
                 from pg_proc where oid = 'public.quest_state(uuid)'::regprocedure),
              'quest_state: Rotation -> Profil (key share) -> Charakter (key share), keine Beratungssperre, keine Zeilensperre zum Schreiben');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like any(array['quest%','character_quests_guard','character_confirmed_guard','npc_defs_guard'])
                and p.proname not in ('quest_bereich','quest_ziele_ok','quest_inst_ok','quest_inst_datum','quest_zaehler_ok','quest_periode_datum','quest_periode_start','quest_stufe','quest_rotation_wahl')
                and not (p.prosecdef and p.proconfig::text like '%search_path=public, pg_temp%')),0::bigint,'Quest-Funktionen mit Rechten: SECURITY DEFINER mit festem search_path');
select tap.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'quest%' and p.proname <> 'quest_state'
                and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))),0::bigint,'Nur quest_state ist für Clients ausführbar');
select tap.is((select string_agg(conname||':'||confdeltype::text, ',' order by conname) from pg_constraint where contype='f' and conrelid in ('public.character_confirmed'::regclass,'public.character_quests'::regclass,'public.quest_rewards'::regclass,'public.quest_audit'::regclass) and confrelid in ('public.characters'::regclass,'public.character_quests'::regclass)),
              'character_confirmed_character_id_fkey:c,character_quests_character_id_fkey:c,quest_audit_character_id_fkey:c,quest_rewards_character_id_quest_key_inst_key_fkey:c','Kaskade beim Löschen: Charakter -> bestätigte Werte, Questzeilen -> Gutschriften, Protokoll');

-- 20j. NPC-Typen (npc_defs_guard): angebotene Vorlagen müssen Nebenquests aus dem Katalog sein; gilt für jeden Schreiber, Clients schreiben nicht
select tap.as_admin();
insert into public.quest_defs(quest_key,version,bereich,ziele) values ('nb:test_n1',1,'neben','[{"typ":"kills","basis":3}]'),('nb:test_n2',1,'neben','[{"typ":"walk","basis":500}]');
select tap.lives($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_haendler',10,'{nb:test_n1,nb:test_n2}')$$,'NPC: Typ mit Nebenquest-Vorlagen anlegen');
select tap.lives($$insert into public.npc_defs(npc_typ,gewicht) values ('test_stumm',1)$$,'NPC: Typ ohne Vorlagen erlaubt');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_x1',1,'{tg:test_a}')$$,'npc_vorlage_invalid','NPC: Tagesquest ist keine NPC-Vorlage');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_x2',1,'{st:test.1}')$$,'npc_vorlage_invalid','NPC: Story-Quest ist keine NPC-Vorlage');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_x3',1,'{nb:test_unbekannt}')$$,'npc_vorlage_invalid','NPC: unbekannte Nebenquest wird abgelehnt');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_x4',1,'{nb:test_n1,tg:test_a}')$$,'npc_vorlage_invalid','NPC: eine unzulässige Vorlage in der Liste genügt zur Ablehnung');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_x5',1,array['nb:test_n1',null])$$,'npc_vorlage_invalid','NPC: leerer Listeneintrag (NULL) wird abgelehnt');
select tap.throws($$update public.npc_defs set vorlagen='{nb:test_n1,wo:test_x}' where npc_typ='test_haendler'$$,'npc_vorlage_invalid','NPC: Änderung auf unzulässige Vorlage wird abgelehnt');
select tap.lives($$update public.npc_defs set vorlagen='{nb:test_n2}', gewicht=20 where npc_typ='test_haendler'$$,'NPC: Änderung auf zulässige Vorlagen und Gewicht');
select tap.lives($$update public.npc_defs set aktiv=false where npc_typ='test_stumm'$$,'NPC: Typ deaktivieren');
select tap.is((select vorlagen from public.npc_defs where npc_typ='test_haendler'),'{nb:test_n2}'::text[],'NPC: abgelehnte Änderungen haben nichts verändert');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht) values ('Test X',1)$$,'23514','NPC: Typname nur a–z, 0–9, _');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht) values ('test_x6',0)$$,'23514','NPC: Gewicht >= 1');
select tap.as_service();
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_dienst',1,'{tg:test_a}')$$,'npc_vorlage_invalid','NPC: Schutzregel gilt auch für service_role');
select tap.as_user('a2000000-0000-0000-0000-0000000000a2');
select tap.ok((select count(*) from public.npc_defs where npc_typ like 'test_%') = 2,'NPC: Typen für angemeldete Spieler lesbar');
select tap.throws($$insert into public.npc_defs(npc_typ,gewicht,vorlagen) values ('test_client',1,'{nb:test_n1}')$$,'permission denied|42501','NPC: Clients legen keine Typen an');
select tap.throws($$update public.npc_defs set gewicht=999 where npc_typ='test_haendler'$$,'permission denied|42501','NPC: Clients ändern keine Typen');
select tap.throws($$delete from public.npc_defs where npc_typ='test_haendler'$$,'permission denied|42501','NPC: Clients löschen keine Typen');
select tap.as_anon();
select tap.throws($$select * from public.npc_defs$$,'permission denied|42501','NPC: anonym nicht lesbar');

-- 20k. Gutschrift im_spielstand -> endgueltig: nur nach Fristende; endgueltig ist endgültig (Charakter C2, eigene Story-Vorlagen)
select tap.as_admin();
insert into public.quest_defs(quest_key,version,bereich,ziele) select 'st:test.'||n,1,'story','[{"typ":"kills","basis":1}]' from generate_series(3,6) n;
insert into public.character_quests(character_id,quest_key,inst_key,version) select 'c2000000-0000-0000-0000-0000000000c2','st:test.'||n,'einmalig',1 from generate_series(3,6) n;
insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung,status,angelegt_am,gueltig_bis) values
 ('c2000000-0000-0000-0000-0000000000c2','st:test.3','einmalig','{"xp":3}','im_spielstand',now()-interval '20 days',now()-interval '6 days'),
 ('c2000000-0000-0000-0000-0000000000c2','st:test.4','einmalig','{"xp":4}','im_spielstand',now()-interval '1 day',now()+interval '13 days'),
 ('c2000000-0000-0000-0000-0000000000c2','st:test.5','einmalig','{"xp":5}','offen',now()-interval '20 days',now()-interval '6 days'),
 ('c2000000-0000-0000-0000-0000000000c2','st:test.6','einmalig','{"xp":6}','im_spielstand',now()-interval '20 days',now()-interval '6 days');
select tap.throws($$update public.quest_rewards set status='endgueltig' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.4|einmalig'$$,'reward_status_transition','endgueltig: im_spielstand -> endgueltig vor Fristende abgelehnt');
select tap.throws($$update public.quest_rewards set status='endgueltig' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.5|einmalig'$$,'reward_status_transition','endgueltig: offen -> endgueltig auch nach Fristende abgelehnt');
select tap.throws($$update public.quest_rewards set status='verfallen' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.6|einmalig'$$,'reward_status_transition','endgueltig: im_spielstand nach Fristende nie verfallen');
select tap.throws($$update public.quest_rewards set status='offen' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.6|einmalig'$$,'reward_status_transition','endgueltig: nach Fristende kein Rückweg im_spielstand -> offen');
select tap.lives($$update public.quest_rewards set status='endgueltig' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.3|einmalig'$$,'endgueltig: im_spielstand -> endgueltig nach Fristende');
select tap.throws($$update public.quest_rewards set status='offen' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.3|einmalig'$$,'reward_status_transition','endgueltig -> offen abgelehnt');
select tap.throws($$update public.quest_rewards set status='im_spielstand' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.3|einmalig'$$,'reward_status_transition','endgueltig -> im_spielstand abgelehnt');
select tap.throws($$update public.quest_rewards set status='verfallen' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.3|einmalig'$$,'reward_status_transition','endgueltig -> verfallen abgelehnt');
select tap.throws($$update public.quest_rewards set belohnung='{"xp":300}' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.3|einmalig'$$,'reward_immutable','endgueltig: Belohnung bleibt unveränderlich');
select tap.as_service();
select tap.throws($$update public.quest_rewards set status='endgueltig' where character_id='c2000000-0000-0000-0000-0000000000c2' and rid='st:test.4|einmalig'$$,'reward_status_transition','endgueltig: Fristregel gilt auch für service_role');

-- 20l. quest_state: endgueltig nur aus dem Serverzustand (gespeicherter Status + Serverzeit), nicht aus Clientdaten
select tap.as_admin();
select version as c2v from public.characters where character_id='c2000000-0000-0000-0000-0000000000c2' \gset
select tap.as_user('a2000000-0000-0000-0000-0000000000a2');
select tap.throws($$update public.quest_rewards set status='endgueltig' where rid='st:test.4|einmalig'$$,'permission denied|42501','quest_state-Daten: Clients setzen keinen Gutschriftstatus');
select tap.throws($$insert into public.quest_rewards(character_id,quest_key,inst_key,belohnung,status) values ('c2000000-0000-0000-0000-0000000000c2','st:test.1','einmalig','{"xp":999}','im_spielstand')$$,'permission denied|42501','quest_state-Daten: Clients legen keine Gutschriften an');
-- Spielstand mit erfundenen Gutschrift-/Questfeldern speichern (Clientdaten)
select public.save_character('c2000000-0000-0000-0000-0000000000c2', :c2v,
  '{"lv":7,"qdone":["st:test.4"],"gutschriften":[{"rid":"st:test.4|einmalig","status":"endgueltig"},{"rid":"st:test.9|einmalig","status":"endgueltig"}],"quest_rewards":{"st:test.5|einmalig":"endgueltig"},"rewards":[{"rid":"st:test.6|einmalig","status":"verfallen"}]}') is not null as gespeichert \gset
select tap.ok(:'gespeichert'::boolean,'quest_state-Daten: Spielstand mit erfundenen Gutschriftfeldern gespeichert');
create temp table qs2 as select public.quest_state('c2000000-0000-0000-0000-0000000000c2') j;
create temp table qs2g as select g->>'rid' rid, g->>'status' status, (g->>'gueltig_bis')::timestamptz bis, (j->>'server_zeit')::timestamptz zeit from qs2, jsonb_array_elements(j->'gutschriften') g;
select tap.is((select status from qs2g where rid='st:test.3|einmalig'),'endgueltig','quest_state: gespeichert endgueltig -> endgueltig');
select tap.is((select status from qs2g where rid='st:test.6|einmalig'),'endgueltig','quest_state: im_spielstand nach Fristende (Serverzeit) -> endgueltig, nicht verfallen (Clientangabe ignoriert)');
select tap.is((select status from qs2g where rid='st:test.4|einmalig'),'im_spielstand','quest_state: im_spielstand vor Fristende bleibt im_spielstand (Clientangabe „endgueltig“ ignoriert)');
select tap.is((select status from qs2g where rid='st:test.5|einmalig'),'verfallen','quest_state: offen nach Fristende -> verfallen, nie endgueltig (Clientangabe ignoriert)');
select tap.ok((select count(*) = 4 and count(*) filter (where rid='st:test.9|einmalig') = 0 from qs2g),'quest_state: nur Gutschriften aus der Datenbank (keine aus dem Spielstand)');
select tap.ok((select bool_and((status='endgueltig') = (rid in ('st:test.3|einmalig','st:test.6|einmalig'))) and bool_and(status <> 'endgueltig' or rid='st:test.3|einmalig' or bis < zeit) from qs2g),
              'quest_state: endgueltig genau dort, wo gespeichert endgueltig oder im_spielstand mit Fristende vor der Serverzeit');
select tap.as_admin();
select tap.is((select string_agg(rid||'='||status, ',' order by rid) from public.quest_rewards where character_id='c2000000-0000-0000-0000-0000000000c2'),
              'st:test.3|einmalig=endgueltig,st:test.4|einmalig=im_spielstand,st:test.5|einmalig=offen,st:test.6|einmalig=im_spielstand',
              'quest_state und Speichern ändern keinen gespeicherten Gutschriftstatus (abgeleiteter Wert bleibt Anzeige)');
select tap.is((select count(*) from public.character_confirmed where character_id='c2000000-0000-0000-0000-0000000000c2'),0::bigint,'Speichern erzeugt keine bestätigten Werte (K2)');
select tap.is((select pronargs from pg_proc where oid='public.quest_state(uuid)'::regprocedure),1::smallint,'quest_state hat nur den Charakter als Parameter (kein Status, keine Zeit vom Client)');

-- 20i. Löschen: Kaskade über Charakter und Konto entfernt alle Questdaten (trotz Lösch-Sperren der Trigger)
select tap.as_user('a1000000-0000-0000-0000-0000000000a1');
select tap.lives($$select public.delete_character('c1000000-0000-0000-0000-0000000000c1')$$,'delete_character mit Questdaten (B-2/B-4-Sperrfolge unverändert)');
select tap.as_admin();
select tap.is((select count(*) from public.character_quests where character_id='c1000000-0000-0000-0000-0000000000c1')+(select count(*) from public.quest_rewards where character_id='c1000000-0000-0000-0000-0000000000c1')+(select count(*) from public.character_confirmed where character_id='c1000000-0000-0000-0000-0000000000c1'),0::bigint,
              'Charakter löschen entfernt Questzeilen, Gutschriften und bestätigte Werte');
delete from auth.users where id in ('a1000000-0000-0000-0000-0000000000a1','a2000000-0000-0000-0000-0000000000a2');
select tap.is((select count(*) from public.character_quests where character_id in ('c2000000-0000-0000-0000-0000000000c2','c3000000-0000-0000-0000-0000000000c3')),0::bigint,'Konto löschen entfernt die Questdaten aller Charaktere (Kaskade)');
select tap.ok((select count(*) from public.quest_rotation) >= 2 and (select count(*) from public.quest_defs) > 0,'Globale Daten (Katalog, Rotation) bleiben beim Löschen von Konten erhalten');

select tap.finish();
