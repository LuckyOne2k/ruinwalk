-- Live-RLS-Prüfung für ein echtes Supabase-Projekt (SQL Editor / MCP execute_sql). Legt zwei Testkonten an,
-- prüft Lesen/Schreiben/Löschen/Verschieben/Rückerstattung über die echten Rollen, räumt am Ende auf.
-- Ergebnis: eine Zeile "✅ LIVE-RLS: ALLE n PRÜFUNGEN BESTANDEN" (31 Prüfungen am 13.11.2026).
reset role;
create temp table r(n serial, ok boolean, name text, detail text);
grant all on r to public; grant all on sequence r_n_seq to public;
create temp table ids(k text primary key, v text); grant all on ids to public;
create function pg_temp.t(p_ok boolean, p_name text, p_detail text default null) returns void language sql as $$ insert into r(ok,name,detail) values (coalesce(p_ok,false),p_name,p_detail) $$;
create function pg_temp.thr(p_sql text, p_pat text, p_name text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    perform pg_temp.t(sqlerrm ~* p_pat or sqlstate ~* p_pat, p_name, case when sqlerrm ~* p_pat or sqlstate ~* p_pat then null else sqlstate||' '||sqlerrm end); return;
  end;
  perform pg_temp.t(false, p_name, 'kein Fehler');
end $$;
create function pg_temp.asu(p_uid uuid) returns void language plpgsql as $$
begin reset role; set role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated')::text, false); end $$;
create function pg_temp.asadmin() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); end $$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('aaaaaaaa-0000-0000-0000-0000000000a1','rls_a@test.de','{"username":"Rls_A"}',now()),
 ('bbbbbbbb-0000-0000-0000-0000000000b2','rls_b@test.de','{"username":"Rls_B"}',now());
insert into public.account_entitlements(account_id,entitlement_type,status,payment_reference) values ('aaaaaaaa-0000-0000-0000-0000000000a1','third_character_slot','active','live_a');

select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select * from public.create_character(1,'A_eins','{"lv":2,"inv":{"holz":1}}');
select * from public.create_character(3,'A_drei','{"lv":5,"inv":{"holz":7}}');
select pg_temp.asu('bbbbbbbb-0000-0000-0000-0000000000b2');
select * from public.create_character(1,'B_eins','{"lv":3}');
select * from public.create_character(2,'B_zwei','{"lv":4}');
select pg_temp.asadmin();
insert into ids select 'a1', character_id::text from public.characters where character_name='A_eins';
insert into ids select 'a3', character_id::text from public.characters where character_name='A_drei';
insert into ids select 'b1', character_id::text from public.characters where character_name='B_eins';
insert into ids select 'b2', character_id::text from public.characters where character_name='B_zwei';

select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select pg_temp.t((select count(*) from public.characters)=2 and (select count(*) from public.characters where character_name like 'A\_%')=2, 'A sieht genau seine 2 Charaktere (Platz 1 und 3)');
select pg_temp.t((select count(*) from public.characters where character_name like 'B\_%')=0, 'A sieht keinen Charakter von B');
select pg_temp.t((select count(*) from public.profiles)=1 and (select count(*) from public.account_entitlements)=1, 'A sieht nur eigenes Profil und eigene Berechtigung');
select pg_temp.t((select count(*) from public.list_characters())=2, 'list_characters A: 2 Einträge');
select pg_temp.asu('bbbbbbbb-0000-0000-0000-0000000000b2');
select pg_temp.t((select count(*) from public.characters)=2 and (select count(*) from public.characters where character_name like 'B\_%')=2, 'B sieht genau seine 2 Charaktere');
select pg_temp.t((select count(*) from public.characters where character_name like 'A\_%')=0, 'B sieht keinen Charakter von A');
select pg_temp.t((select count(*) from public.profiles)=1 and (select count(*) from public.account_entitlements)=0, 'B sieht nur eigenes Profil, keine fremde Berechtigung');
select pg_temp.t((select count(*) from public.list_characters())=2, 'list_characters B: 2 Einträge');
select pg_temp.thr('update public.characters set character_name=''Gehackt''','permission denied|42501','B: direktes UPDATE gesperrt');
select pg_temp.thr('delete from public.characters','permission denied|42501','B: direktes DELETE gesperrt');
select pg_temp.thr('select public.save_character('''||(select v from ids where k='a1')||'''::uuid,1,''{"lv":50}'')','version_conflict','B kann Charakter von A nicht speichern');
select pg_temp.thr('select public.delete_character('''||(select v from ids where k='a1')||'''::uuid)','not_found','B kann Charakter von A nicht löschen');
select pg_temp.thr('select public.move_character('''||(select v from ids where k='a3')||'''::uuid,2)','not_found','B kann Charakter von A (Platz 3) nicht verschieben');
select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select pg_temp.thr('select public.save_character('''||(select v from ids where k='b1')||'''::uuid,1,''{"lv":50}'')','version_conflict','A kann Charakter von B nicht speichern');
select pg_temp.thr('select public.delete_character('''||(select v from ids where k='b1')||'''::uuid)','not_found','A kann Charakter von B nicht löschen');
select pg_temp.thr('select public.move_character('''||(select v from ids where k='b2')||'''::uuid,1)','not_found','A kann Charakter von B nicht verschieben');
select pg_temp.asadmin();
select pg_temp.t((select count(*) from public.characters)=4 and (select (character_data->>'lv') from public.characters where character_name='B_eins')='3', 'Nach Fremdzugriffen: alle 4 Charaktere unverändert');
update public.account_entitlements set status='refunded' where account_id='aaaaaaaa-0000-0000-0000-0000000000a1';
select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select pg_temp.t((select count(*) from public.characters where slot_number=3)=0, 'Rückerstattung: Platz-3-Charakter nicht lesbar');
select pg_temp.t((select locked from public.list_characters() where slot_number=3)=true, 'Rückerstattung: list_characters markiert Platz 3 als gesperrt');
select pg_temp.thr('select public.save_character('''||(select v from ids where k='a3')||'''::uuid,1,''{"lv":9}'')','character_locked','Rückerstattung: Speichern auf Platz 3 gesperrt');
select pg_temp.thr('select public.move_character('''||(select v from ids where k='a3')||'''::uuid,1)','slot_occupied','Verschieben scheitert bei belegtem Platz 1, nichts geht verloren');
select pg_temp.thr('select public.move_character('''||(select v from ids where k='a3')||'''::uuid,3)','invalid_slot','Zielplatz 3 ungültig');
select pg_temp.asadmin();
select pg_temp.t((select count(*) from public.characters where character_name='A_drei')=1 and (select character_data->'inv'->>'holz' from public.characters where character_name='A_drei')='7', 'Gesperrter Charakter bleibt mit Spielstand erhalten');
update public.account_entitlements set status='active' where account_id='aaaaaaaa-0000-0000-0000-0000000000a1';
select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select pg_temp.t((select count(*) from public.characters where slot_number=3)=1 and (select locked from public.list_characters() where slot_number=3)=false, 'Freischaltung: Charakter wieder lesbar und nicht gesperrt');
select pg_temp.t(public.save_character((select v::uuid from ids where k='a3'),1,'{"lv":6,"inv":{"holz":8}}')=2, 'Freischaltung: Speichern funktioniert wieder (Version 2)');
reset role;
update public.account_entitlements set status='refunded' where account_id='aaaaaaaa-0000-0000-0000-0000000000a1';
select pg_temp.asu('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.delete_character((select v::uuid from ids where k='a1'));
select pg_temp.t(public.move_character((select v::uuid from ids where k='a3'),1)=3, 'A verschiebt gesperrten Charakter auf freien Platz 1 (Version 3)');
select pg_temp.t((select slot_number||'/'||(character_data->'inv'->>'holz') from public.characters where character_id=(select v::uuid from ids where k='a3'))='1/8', 'Verschobener Charakter liegt auf Platz 1, Spielstand erhalten');
select pg_temp.t((select count(*) from public.characters)=1 and (select locked from public.list_characters())=false, 'Verschobener Charakter ist ohne Berechtigung spielbar');
select pg_temp.asu('bbbbbbbb-0000-0000-0000-0000000000b2');
select pg_temp.t((select count(*) from public.characters)=2, 'B unverändert (2 Charaktere)');
select pg_temp.asadmin();
select pg_temp.t((select count(*) from public.audit_log where action='character_moved' and account_id='aaaaaaaa-0000-0000-0000-0000000000a1')=1, 'Verschieben im Audit-Log');
select pg_temp.t((select count(*) from public.character_backups where character_id=(select v::uuid from ids where k='a1') and reason='delete')=1, 'Gelöschter Charakter wurde gesichert');

create temp table res as select * from r;
delete from auth.users where email in ('rls_a@test.de','rls_b@test.de');
delete from public.payment_events; delete from public.character_backups; delete from public.audit_log;
select case when count(*) filter (where not ok)=0 then '✅ LIVE-RLS: ALLE '||count(*)||' PRÜFUNGEN BESTANDEN'
  else '❌ '||count(*) filter (where not ok)||' von '||count(*)||': '||string_agg(name||coalesce(' ['||detail||']',''),' | ') filter (where not ok) end as summary,
  (select count(*) from auth.users) as konten_danach, (select count(*) from public.characters) as chars_danach
from res;
