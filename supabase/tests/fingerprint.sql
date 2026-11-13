-- Fingerabdruck des Schemas (Kommentare/Leerraum werden ignoriert). Lokal und in Supabase ausführen und vergleichen.
with n as (select 'public'::regnamespace as ns),
items as (
  select 'fn' c, p.oid::regprocedure::text k,
         md5(concat_ws('|', p.prosecdef, p.provolatile, coalesce(p.proconfig::text,''), p.prorettype::regtype::text,
             regexp_replace(regexp_replace(p.prosrc,'--[^\n]*','','g'),'\s+',' ','g'))) h
    from pg_proc p where p.pronamespace='public'::regnamespace
  union all select 'policy', tablename||'.'||policyname, md5(concat_ws('|',cmd,roles::text,regexp_replace(coalesce(qual,''),'\s+',' ','g'),regexp_replace(coalesce(with_check,''),'\s+',' ','g')))
    from pg_policies where schemaname='public'
  union all select 'index', indexname, md5(regexp_replace(indexdef,'\s+',' ','g')) from pg_indexes where schemaname='public'
  union all select 'trigger', c.relname||'.'||t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and (c.relnamespace='public'::regnamespace or (c.relnamespace='auth'::regnamespace and c.relname='users'))
  union all select 'column', table_name||'.'||column_name, md5(concat_ws('|',data_type,is_nullable,coalesce(column_default,'')))
    from information_schema.columns where table_schema='public'
  union all select 'constraint', conrelid::regclass::text||'.'||conname, md5(pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace
  union all select 'rls', relname, md5(relrowsecurity::text) from pg_class where relnamespace='public'::regnamespace and relkind='r'
  union all select 'tablegrant', table_name||'.'||grantee||'.'||privilege_type, 'x' from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
  union all select 'fngrant', p.oid::regprocedure::text||'.'||r.rolname, 'x' from pg_proc p cross join pg_roles r
    where p.pronamespace='public'::regnamespace and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'execute')
)
select c||'|'||k||'|'||left(h,8) as line from items order by 1;
