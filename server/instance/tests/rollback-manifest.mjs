// Erzeugt das Manifest-SQL für supabase/dev/rollback_dev.sql aus einer frisch installierten lokalen Datenbank (Attrappe, PostgreSQL lokal).
// Aufruf:  node server/instance/tests/rollback-manifest.mjs > /tmp/manifest-values.json   (wird nach Änderungen an den rwi-SQL-Dateien gebraucht;
// installation.mjs wird rot, solange das Manifest in rollback_dev.sql nicht dazu passt).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { startCluster } from './pg.mjs';
const root = new URL('../../..', import.meta.url).pathname;
export const FN_FP = `md5(concat_ws('|', p.prosecdef, p.provolatile, p.proleakproof, p.proisstrict, p.proretset, l.lanname, p.prorettype::regtype::text, coalesce(p.proconfig::text, ''), p.prokind, p.proparallel, pg_get_function_identity_arguments(p.oid), p.prosrc))`;
export const TAB_FP = `md5((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text, ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped))`;
const cl = await startCluster(54470);
try {
  const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err); return r.out; };
  await q('\\set legacy 1\n' + readFileSync(root + 'supabase/tests/00_stub.sql', 'utf8'));
  const sid = await q('select system_identifier::text from pg_control_system()');
  const preRel = await q("select string_agg(quote_literal(relname), ',') from pg_class where relnamespace = 'public'::regnamespace") || "''", prePro = await q("select string_agg(oid::text, ',') from pg_proc where pronamespace = 'public'::regnamespace") || '0';
  const b = spawnSync('bash', [root + 'supabase/dev/build.sh', '/tmp/manifest-inst.sql'], { encoding: 'utf8' });
  const I = readFileSync('/tmp/manifest-inst.sql', 'utf8').replace('7707768362984748398', sid);
  const r = await cl.psql(`begin;\nset local rw.project_ref='jlkqktmvqxibqdcobbhf';\n${I}\ncommit;`); if (r.code) throw new Error(r.err);
  const list = async (s) => (await q(s)).split('\n').filter(Boolean);
  const out = {
    tables: await list(`select c.relname || '=' || ${TAB_FP} from pg_class c where c.relnamespace = 'rwi'::regnamespace and c.relkind = 'r' order by 1`),
    functions: await list(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || ${FN_FP} from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'rwi'::regnamespace order by 1`),
    ptables: await list(`select c.relname || '=' || ${TAB_FP} from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in (${preRel}) order by 1`),
    pfunctions: await list(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || ${FN_FP} from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.oid not in (${prePro}) order by 1`),
    triggers: await list(`select c.relname || '.' || g.tgname from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'rwi'::regnamespace and not g.tgisinternal order by 1`),
    indexes: await list(`select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid where c.relnamespace = 'rwi'::regnamespace and not exists (select 1 from pg_constraint k where k.conindid = i.oid) order by 1`),
    policies: await list(`select tablename || '.' || policyname from pg_policies where schemaname = 'rwi' order by 1`),
  };
  console.log(JSON.stringify(out));
} finally { cl.stop(); }
