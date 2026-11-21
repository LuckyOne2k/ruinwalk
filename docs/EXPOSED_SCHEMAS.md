# Leitfaden: „Exposed schemas“ prüfen (Dev, nach Installation)

Zwei getrennte Ebenen: **(A) Dashboard-Einstellung** – welche Schemas PostgREST überhaupt anbietet; **(B) SQL-Rechte** – wer darin was ausführen darf. Beides muss stimmen.

## A. Dashboard (Dev-Projekt `ruinwalk-dev`)
1. Project Settings → **API** (oder Data API) → *Exposed schemas*.
2. Erwartet: **`public`** (und ggf. `graphql_public`, falls schon vorhanden). **`rwi` darf nicht enthalten sein.**
3. *Extra search path* darf `rwi` nicht erzwingen.
4. Wenn `rwi` auftaucht: nicht stillschweigend ändern, melden. Entfernen ist eine Dashboard-Änderung → Freigabe.

## B. SQL-Rechte (nur lesen, Dev; Abfragen ändern nichts)
```sql
-- 1. Schemarechte: anon/authenticated dürfen rwi nicht verwenden
select r, has_schema_privilege(r,'rwi','USAGE') from unnest(array['anon','authenticated','service_role']) r;      -- erwartet: false/false/(egal)
-- 2. In public: nur beabsichtigte Funktionen ausführbar
select p.proname, has_function_privilege('anon',p.oid,'EXECUTE') anon, has_function_privilege('authenticated',p.oid,'EXECUTE') auth, has_function_privilege('service_role',p.oid,'EXECUTE') svc
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'rw\_%' order by 1;
-- erwartet: rw_worker_*/rw_ops_* nur svc=true; Client-Wrapper (Gruppe/Charakter, 8 Stück) auth=true, anon=false
-- 3. Tabellenrechte in rwi
select c.relname, has_table_privilege('anon',c.oid,'SELECT') a, has_table_privilege('authenticated',c.oid,'SELECT') u from pg_class c where relnamespace='rwi'::regnamespace and relkind='r';   -- erwartet: überall false
-- 4. Interne Funktionen in rwi nicht für Clients ausführbar
select p.proname from pg_proc p where p.pronamespace='rwi'::regnamespace and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));   -- erwartet: leer
```
Zusätzlich: `supabase/tests/` und `rechte-audit.mjs` enthalten dieselben Prüfungen für die lokale Simulation; echtes Verhalten (REST sieht `rwi` nicht) zeigt nur ein Aufruf mit dem Dev-Anon-Key auf `/rest/v1/rpc/rw_ops_resume` (erwartet 401/403/404) und Profil-Header `Accept-Profile: rwi` (erwartet Fehler).
