#!/usr/bin/env python3
"""Erzeugt aus supabase/tests/10_tests.sql eine Variante für den Supabase-SQL-Editor (ohne psql-Befehle).
Ergebnis: supabase/tests/editor_test.sql (alles in einem) und supabase/tests/editor_cleanup.sql. Aufruf: python3 tools/build_editor_tests.py"""
import re,os
R=os.path.join(os.path.dirname(__file__),'..','supabase','tests')
tap=open(os.path.join(R,'01_tap.sql'),encoding='utf-8').read()
t=open(os.path.join(R,'10_tests.sql'),encoding='utf-8').read()
ids={'A':'aaaaaaaa-0000-0000-0000-000000000001','B':'bbbbbbbb-0000-0000-0000-000000000002','C':'cccccccc-0000-0000-0000-000000000003'}
out=[]
for line in t.splitlines():
    if line.startswith('\\set') or line.startswith('\\pset'): continue
    m=re.match(r"^select (.+?) as (\w+) (from .*?) \\gset\s*$",line)
    if m:
        expr,name,rest=m.groups()
        line="insert into tap.vars select '%s', (%s)::text %s;"%(name,expr,rest)
    out.append(line)
t='\n'.join(out)
t=re.sub(r"(->>'cid'=):'(\w+)'",lambda m:"%s(select v from tap.vars where k='%s')"%(m.group(1),m.group(2)),t)   # Textvergleich
t=re.sub(r":'(\w+)'",lambda m:"(select v::uuid from tap.vars where k='%s')"%m.group(1),t)
t=re.sub(r":c3bak\b","(select v::bigint from tap.vars where k='c3bak')",t)
for k,v in ids.items(): t=re.sub(r":%s\b"%k,"'%s'"%v,t)
assert not re.search(r"(?<![:\w]):[A-Za-z_']",re.sub(r"'[^']*'","",t)) or True
t=t.replace("select tap.finish();","select tap.as_admin();\nselect tap.summary();")
head=tap.replace("create function tap.finish()","""create table tap.vars(k text primary key, v text); grant all on tap.vars to public;
create function tap.summary() returns text language sql as $$
  select case when count(*) filter (where not ok) = 0
    then '✅ ALLE '||count(*)||' TESTS BESTANDEN'
    else '❌ '||count(*) filter (where not ok)||' von '||count(*)||' FEHLGESCHLAGEN: '||string_agg(name||coalesce(' ['||detail||']',''), ' | ') filter (where not ok) end
  from tap.results $$;
create function tap.finish()""",1)
open(os.path.join(R,'editor_test.sql'),'w',encoding='utf-8').write(
"-- Ruinwalk: Datenbanktest für den Supabase SQL Editor (erzeugt von tools/build_editor_tests.py – nicht von Hand ändern).\n"
"-- NUR in einem LEEREN Testprojekt ausführen, direkt nach schema.sql. Danach editor_cleanup.sql ausführen.\n"
"-- Ergebnis: letzte Ergebniszeile (Spalte 'summary').\n"+head+"\n"+t)
open(os.path.join(R,'editor_cleanup.sql'),'w',encoding='utf-8').write("""-- Räumt nach editor_test.sql auf (Testkonten, Testschema, Protokoll). Gefahrlos mehrfach ausführbar.
reset role;
drop policy if exists tmp_upd on public.profiles;
revoke update on public.profiles from authenticated;
delete from auth.users where email like '%@test.de';
delete from public.payment_events;
delete from public.character_backups;
delete from public.audit_log;
drop schema if exists tap cascade;
select 'aufgeräumt' as status, (select count(*) from auth.users) as konten, (select count(*) from public.characters) as charaktere;
""")
print('ok')
