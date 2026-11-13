-- Minimales Testgerüst (pgTAP-ähnlich). Läuft als beliebige Rolle, daher für alle freigegeben.
create schema tap; grant usage on schema tap to public;
create table tap.results(n serial, ok boolean, name text, detail text); grant all on tap.results to public; grant all on sequence tap.results_n_seq to public;
create function tap.rec(p_ok boolean, p_name text, p_detail text default null) returns text language plpgsql as $$
declare i int; begin
  insert into tap.results(ok,name,detail) values (coalesce(p_ok,false),p_name,p_detail) returning n into i;
  return (case when coalesce(p_ok,false) then 'ok ' else 'NICHT OK ' end)||i||' - '||p_name||coalesce(' ['||p_detail||']','');
end $$;
create function tap.ok(p_cond boolean, p_name text) returns text language sql as $$ select tap.rec(p_cond,p_name) $$;
create function tap.is(got anyelement, want anyelement, p_name text) returns text language sql as $$
  select tap.rec(got is not distinct from want, p_name, case when got is not distinct from want then null else 'erhalten='||coalesce(got::text,'NULL')||' erwartet='||coalesce(want::text,'NULL') end) $$;
-- führt SQL mit der aktuellen Rolle aus und erwartet einen Fehler, dessen Text oder SQLSTATE zum Muster passt
create function tap.throws(p_sql text, p_pattern text, p_name text) returns text language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    return tap.rec(sqlerrm ~* p_pattern or sqlstate = p_pattern, p_name, case when sqlerrm ~* p_pattern or sqlstate = p_pattern then null else 'Fehler='||sqlstate||' '||sqlerrm end);
  end;
  return tap.rec(false,p_name,'es gab keinen Fehler');
end $$;
create function tap.lives(p_sql text, p_name text) returns text language plpgsql as $$
begin begin execute p_sql; exception when others then return tap.rec(false,p_name,sqlstate||' '||sqlerrm); end; return tap.rec(true,p_name); end $$;
-- Rollenwechsel wie bei Supabase: PostgREST setzt Rolle und JWT-Claims
create function tap.as_user(p_uid uuid) returns text language plpgsql as $$
begin reset role; set role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated')::text, false); return ''; end $$;
create function tap.as_anon() returns text language plpgsql as $$
begin reset role; set role anon; perform set_config('request.jwt.claims', json_build_object('role','anon')::text, false); return ''; end $$;
create function tap.as_service() returns text language plpgsql as $$
begin reset role; set role service_role; perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, false); return ''; end $$;
create function tap.as_admin() returns text language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims','',false); return ''; end $$;
create function tap.finish() returns text language plpgsql as $$
declare f int; t int; begin reset role; select count(*) filter (where not ok), count(*) into f,t from tap.results;
  if f>0 then raise exception '% von % Tests fehlgeschlagen', f, t; end if; return t||' Tests bestanden'; end $$;
