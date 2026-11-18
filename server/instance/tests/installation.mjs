// Installation, zweiter Versuch, Rollback und Wiederholung: node server/instance/tests/installation.mjs
// Prüft supabase/dev/{00_preflight,build.sh,rollback_dev.sql,cleanup_test_accounts.sql} auf einer lokalen PostgreSQL-Instanz mit der Supabase-Attrappe
// (supabase/tests/00_stub.sql, Modus legacy = Standardrechte für API-Rollen wie auf Dev). Lokal, NICHT auf einem echten Supabase-Projekt.
import { readFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCluster } from './pg.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const STUB = readFileSync(join(root, 'supabase/tests/00_stub.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };

const out = join(mkdtempSync(join(tmpdir(), 'rwbuild-')), 'install_dev.sql');
const b = spawnSync('bash', [join(root, 'supabase/dev/build.sh'), out], { encoding: 'utf8' });
ok(b.status === 0, 'build.sh erzeugt install_dev.sql', (b.stdout || b.stderr).trim().slice(0, 80));
const INSTALL = readFileSync(out, 'utf8'), ROLLBACK = readFileSync(join(root, 'supabase/dev/rollback_dev.sql'), 'utf8'), PRE = readFileSync(join(root, 'supabase/dev/00_preflight.sql'), 'utf8'), CLEAN = readFileSync(join(root, 'supabase/dev/cleanup_test_accounts.sql'), 'utf8');
const order = ['00_preflight.sql', 'schema.sql', '01_proto.sql', '02_actions.sql', '03_windows.sql', '04_gruppe.sql', '05_produktion.sql'].map((f) => INSTALL.indexOf(`===== ${f} =====`));
ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), 'Reihenfolge im Installationsskript: preflight, schema, 01, 02, 03, 04, 05');
ok(!/^\s*(begin|commit)\s*;/im.test(INSTALL), 'Installationsskript enthält kein eigenes BEGIN/COMMIT (Transaktion gehört dem Aufrufer)');

const cl = await startCluster(54430);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 160)); return r.out; };
const tx = (s) => cl.psql('begin;\n' + s + '\ncommit;');
const FP = `select md5(string_agg(x, '|' order by x)) from (
  select 'rel:' || n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || coalesce(c.relacl::text, '') as x from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
  union all select 'fn:' || p.oid::regprocedure::text || ':' || p.prosecdef || ':' || coalesce(p.proacl::text, '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog','information_schema')
  union all select 'trg:' || tgrelid::regclass::text || '.' || tgname from pg_trigger where not tgisinternal
  union all select 'ns:' || nspname || ':' || coalesce(nspacl::text, '') from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'
  union all select 'dacl:' || defaclrole::regrole::text || ':' || coalesce(defaclnamespace::regnamespace::text, '-') || ':' || defaclobjtype::text || ':' || defaclacl::text from pg_default_acl
  union all select 'pol:' || schemaname || '.' || tablename || '.' || policyname from pg_policies) s`;
const fp = () => q(FP);
const cnt = async (s) => +(await q(s));
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q('\\set legacy 1\n' + STUB);
  const pristine = await fp();
  const pf = await cl.psql(PRE); ok(pf.code === 0 && /preflight ok/.test(pf.err), 'Preflight auf frischer Umgebung: ok', (pf.err || '').split('\n')[0].slice(0, 70));
  ok((await fp()) === pristine, 'Preflight verändert nichts (Katalog-Fingerabdruck gleich)');

  // --- Preflight-Ablehnungen ---
  await q('create function public.fremd() returns int language sql as $$ select 1 $$');
  ok(/public enthält bereits 1 Funktionen/.test((await cl.psql(PRE)).err), 'Preflight lehnt ein nicht leeres public ab (fremde Funktion)');
  await q('drop function public.fremd()');
  await q('create table public.fremd(id int)');
  ok(/public enthält bereits 1 Relationen/.test((await cl.psql(PRE)).err), 'Preflight lehnt ein nicht leeres public ab (fremde Tabelle)');
  await q('drop table public.fremd');
  ok((await cl.psql(PRE.replace("array['anon','authenticated','service_role']", "array['anon','authenticated','service_role','gibt_es_nicht']"))).err.includes('Rolle gibt_es_nicht fehlt'), 'Preflight erkennt eine fehlende API-Rolle');
  ok((await fp()) === pristine, 'Ablehnungen haben nichts verändert');

  // --- Installation ---
  const inst = await tx(INSTALL);
  ok(inst.code === 0, 'kombinierte Installation in einer Transaktion', (inst.err || '').split('\n').filter((l) => /ERROR/.test(l))[0] || '');
  const after = await fp();
  ok(after !== pristine, 'Installation hat den Katalog verändert');
  ok((await cnt(`select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'`)) === 6 && (await cnt(`select count(*) from pg_class where relnamespace='rwi'::regnamespace and relkind='r'`)) === 16, '6 Tabellen in public, 16 in rwi');
  ok((await cnt(`select count(*) from pg_proc where pronamespace='public'::regnamespace`)) === 37 && (await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace`)) >= 55, '37 Funktionen in public (19 Schema + 8 Client-Wrapper + 10 Worker-/Betriebs-Wrapper), mindestens 55 in rwi');
  ok((await cnt(`select count(*) from pg_default_acl where defaclnamespace='public'::regnamespace`)) === 3, 'Default-ACLs in public unverändert (3 Einträge aus der Umgebung, von der Installation nicht angefasst)');

  // --- zweiter Installationsversuch ---
  const again = await tx(INSTALL);
  ok(again.code !== 0 && /bereits installiert/.test(again.err), 'zweiter Installationsversuch bricht mit klarer Meldung ab', (again.err.split('\n').find((l) => /preflight/.test(l)) || again.err.split('\n')[0]).slice(0, 90));
  ok((await fp()) === after, 'zweiter Versuch hat nichts verändert (auch nicht teilweise)');
  // Auch ohne Preflight (nur schema.sql allein) darf kein Überschreiben entstehen
  const raw = await tx(readFileSync(join(root, 'supabase/schema.sql'), 'utf8'));
  ok(raw.code !== 0 && (await fp()) === after, 'schema.sql allein ein zweites Mal: Fehler, nichts verändert');

  // --- Testdaten, damit der Rollback mit Inhalt geprüft wird ---
  await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('aaaaaaaa-0000-4000-8000-000000000001','a@rwtest.invalid','{"username":"Spieler_A"}',now()), ('bbbbbbbb-0000-4000-8000-000000000002','echt@example.org','{"username":"Spieler_B"}',now())`);
  await q(`insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values ('a1a1a1a1-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001',1,'A1','{}')`);
  await q(`insert into rwi.players values ('a1a1a1a1-0000-4000-8000-000000000001', 10, 'krieger', 'ritter', 3)`);

  // --- Rollback ---
  const noConfirm = await tx(ROLLBACK);
  ok(noConfirm.code !== 0 && /Bestätigung fehlt/.test(noConfirm.err) && (await fp()) === after, 'Rollback ohne Bestätigung bricht ab und ändert nichts');
  const wrong = await tx(`set rw.rollback_confirm = 'ja'; ` + ROLLBACK);
  ok(wrong.code !== 0 && (await fp()) === after, 'Rollback mit falscher Bestätigung bricht ab');
  const rb = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + ROLLBACK);
  ok(rb.code === 0, 'Rollback mit Bestätigung in einer Transaktion', (rb.err || '').split('\n').filter((l) => /ERROR/.test(l))[0] || (rb.err.match(/rollback entfernt[^\n]*/) || [''])[0]);
  ok((await fp()) === pristine, 'nach dem Rollback ist der Katalog-Fingerabdruck wieder der Ausgangszustand (Relationen, Funktionen, Rechte, Trigger, Policies, Default-ACLs)');
  ok((await cnt(`select count(*) from auth.users`)) === 2, 'Testkonten in auth.users bleiben nach dem Rollback bestehen (bekannt, getrennte Bereinigung)');
  ok((await cnt(`select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`)) === 0, 'Trigger auf auth.users entfernt');
  const cl1 = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + CLEAN);
  ok(cl1.code === 0 && (await cnt(`select count(*) from auth.users`)) === 1 && (await q(`select email from auth.users`)) === 'echt@example.org', 'cleanup_test_accounts löscht nur @rwtest.invalid, andere Konten bleiben');
  ok((await tx(CLEAN)).code !== 0, 'cleanup ohne Bestätigung bricht ab');
  await q(`delete from auth.users`);
  const rb2 = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + ROLLBACK);
  ok(rb2.code === 0 && (await fp()) === pristine, 'Rollback ohne Installation ist wiederholbar (idempotent, ändert nichts)', (rb2.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 120));

  // --- Wiederholung nach Rollback ---
  const re = await tx(INSTALL);
  ok(re.code === 0, 'erneute Installation nach Rollback gelingt');
  ok((await fp()) === after, 'Installation ist reproduzierbar: gleicher Katalog-Fingerabdruck wie beim ersten Mal');

  // --- Rollback-Abbruch bei fremden Abhängigkeiten ---
  await q(`create view public.fremde_sicht as select account_id from public.profiles`);
  const dep = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + ROLLBACK);
  ok(dep.code !== 0 && /Sichten hängen/.test(dep.err), 'Rollback bricht ab, wenn fremde Sichten von unseren Tabellen abhängen (kein stilles CASCADE)');
  await q(`drop view public.fremde_sicht`);
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
