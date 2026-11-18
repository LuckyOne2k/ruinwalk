// Installation, zweiter Versuch, Rollback und Wiederholung: node server/instance/tests/installation.mjs
// Prüft supabase/dev/{00_preflight,build.sh,rollback_dev.sql,cleanup_test_accounts.sql} auf einer lokalen PostgreSQL-Instanz mit der Supabase-Attrappe
// (supabase/tests/00_stub.sql, Modus legacy = Standardrechte für API-Rollen wie auf Dev). Lokal, NICHT auf einem echten Supabase-Projekt.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// (das PL/pgSQL-Blockende `end;` in Funktionskörpern ist keine Transaktionssteuerung und deshalb hier nicht gelistet)
// vorher: "kein eigenes BEGIN/COMMIT (Transaktion gehört dem Aufrufer)". Jetzt gilt (stärker, nicht schwächer): die Datei besitzt ihre Transaktion selbst, und zwar GENAU EINE; die eingebundenen Teile steuern keine Transaktion.
const txCtl = /^\s*(begin|commit|rollback|start\s+transaction|savepoint|release|abort)\s*(transaction|work)?\s*;/gim;
const parts = [PRE, readFileSync(join(root, 'supabase/schema.sql'), 'utf8'), ...['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion'].map((f) => readFileSync(join(root, `server/instance/sql/${f}.sql`), 'utf8'))];
ok(parts.every((x) => (x.match(txCtl) || []).length === 0), 'die eingebundenen Teile (preflight, schema.sql, rwi 01-05) enthalten keinerlei Transaktionssteuerung (nichts Verschachteltes, nichts Widersprüchliches)');
const ctl = (INSTALL.match(txCtl) || []).map((x) => x.trim().toLowerCase());
ok(ctl.length === 2 && ctl[0] === 'begin;' && ctl[1] === 'commit;' && /^begin;/m.test(INSTALL.split('\n').filter((l) => !l.startsWith('--') && l.trim()).join('\n')) && INSTALL.trimEnd().endsWith('commit;'), 'install_dev.sql enthält genau ein BEGIN (vor allem anderen, auch vor der Zielprüfung) und genau ein COMMIT (ganz am Ende), sonst nichts');
ok(INSTALL.indexOf('begin;') < INSTALL.indexOf('-- ZIELPRÜFUNG') && INSTALL.lastIndexOf('commit;') > INSTALL.indexOf('===== 05_produktion.sql ====='), 'BEGIN steht vor der Zielprüfung, COMMIT nach dem letzten Teil');

const DEV_REF = 'jlkqktmvqxibqdcobbhf', PROD_REF = 'malbiahllucctiafzydv', DEV_SYSID = '7707768362984748398';
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
const SID = await q('select system_identifier::text from pg_control_system()');
// Test-Umgebung: NUR die fest hinterlegte Datenbankkennung von Dev wird durch die der lokalen Attrappe ersetzt (ein Test prüft, dass sie je Datei genau einmal vorkommt); die Referenz kommt wie im Betrieb von außen.
const adapt = (x) => x.replace(DEV_SYSID, SID), T = `set local rw.project_ref = '${DEV_REF}';\n`;
const cnt = async (s) => +(await q(s));
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q('\\set legacy 1\n' + STUB);
  const pristine = await fp();
  const pf = await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(PRE)); ok(pf.code === 0 && /preflight ok/.test(pf.err), 'Preflight auf frischer Umgebung: ok', (pf.err || '').split('\n')[0].slice(0, 70));
  ok((await fp()) === pristine, 'Preflight verändert nichts (Katalog-Fingerabdruck gleich)');

  // --- Preflight-Ablehnungen ---
  await q('create function public.fremd() returns int language sql as $$ select 1 $$');
  ok(/public enthält bereits 1 Funktionen/.test((await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(PRE))).err), 'Preflight lehnt ein nicht leeres public ab (fremde Funktion)');
  await q('drop function public.fremd()');
  await q('create table public.fremd(id int)');
  ok(/public enthält bereits 1 Relationen/.test((await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(PRE))).err), 'Preflight lehnt ein nicht leeres public ab (fremde Tabelle)');
  await q('drop table public.fremd');
  ok((await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(PRE).replace("array['anon','authenticated','service_role']", "array['anon','authenticated','service_role','gibt_es_nicht']"))).err.includes('Rolle gibt_es_nicht fehlt'), 'Preflight erkennt eine fehlende API-Rolle');
  ok((await fp()) === pristine, 'Ablehnungen haben nichts verändert');

  // =====  NEU: Zielprojektprüfung (zwingend, ohne Ersatzwert, unabhängig vom Zustand von public)  =====
  const none = (x) => `set rw.project_ref = '';\n` + x;
  const tgtErr = async (setting, sql) => { const r = await cl.psql((setting === null ? '' : `set rw.project_ref = '${setting}';\n`) + sql); return r; };
  const zUn = (x) => x.slice(x.indexOf('-- ZIELPRÜFUNG'), x.indexOf('end $$;', x.indexOf('-- ZIELPRÜFUNG')) + 7);
  ok(zUn(PRE) === zUn(ROLLBACK) && zUn(PRE) === zUn(CLEAN) && zUn(PRE).includes(DEV_REF) && zUn(PRE).includes(DEV_SYSID), 'Zielprüfung steht wortgleich in preflight, rollback und cleanup und enthält Dev-Referenz und -Datenbankkennung fest');
  ok(INSTALL.indexOf('-- ZIELPRÜFUNG') >= 0 && INSTALL.indexOf('-- ZIELPRÜFUNG') < INSTALL.indexOf('preflight: PostgreSQL 15') && INSTALL.indexOf('-- ZIELPRÜFUNG') < INSTALL.indexOf('===== schema.sql ====='), 'in install_dev.sql steht die Zielprüfung vor jeder anderen Prüfung und vor schema.sql');
  ok([PRE, ROLLBACK, CLEAN].every((x) => x.split(DEV_SYSID).length === 2), 'Dev-Datenbankkennung steht je Datei genau einmal (Test-Ersetzung betrifft nur diese Stelle)');
  const prodUse = zUn(PRE).split(PROD_REF).length - 1;
  ok(prodUse === 1 && /want = prod_ref then raise exception 'ziel: Produktion ist ausdrücklich ausgeschlossen/.test(PRE), 'die Produktionsreferenz kommt in der Zielprüfung nur als ausdrücklicher Ausschluss vor');
  for (const [name, sql] of [['preflight', PRE], ['install_dev.sql', INSTALL]]) {
    const r0 = await tgtErr(null, (name === 'preflight' ? adapt(sql) : 'begin;\n' + adapt(sql) + '\ncommit;'));
    ok(r0.code !== 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(r0.err), `${name}: ohne gesetzte Projektreferenz Abbruch (kein Ersatzwert)`);
    const r1 = await tgtErr('', adapt(sql));
    ok(r1.code !== 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(r1.err), `${name}: leere Projektreferenz gilt als nicht gesetzt`);
    const r2 = await tgtErr(PROD_REF, adapt(sql));
    ok(r2.code !== 0 && /Produktion ist ausdrücklich ausgeschlossen/.test(r2.err), `${name}: Produktionsreferenz wird ausdrücklich abgelehnt`);
    const r3 = await tgtErr('abcdefghijklmnopqrst', adapt(sql));
    ok(r3.code !== 0 && /weicht von ruinwalk-dev ab/.test(r3.err), `${name}: abweichende Referenz wird abgelehnt`);
    const r4 = await tgtErr(DEV_REF.toUpperCase(), adapt(sql));
    ok(r4.code !== 0 && /weicht von ruinwalk-dev ab/.test(r4.err), `${name}: Referenz wird exakt verglichen (Großschreibung gilt als abweichend)`);
    const r5 = await tgtErr(DEV_REF, sql);   // richtige Referenz, aber unveränderte Dev-Kennung: die lokale Datenbank ist NICHT ruinwalk-dev
    ok(r5.code !== 0 && /Datenbankkennung gehört nicht zu ruinwalk-dev/.test(r5.err), `${name}: richtige Referenz, aber falsche Datenbank (andere Kennung): Abbruch`);
  }
  ok((await fp()) === pristine, 'alle Zielprüfungs-Ablehnungen haben nichts verändert');
  // unabhängig vom Zustand von public: auch bei nicht leerem public kommt zuerst die Zielprüfung, bei richtigem Ziel dann die public-Prüfung
  await q('create table public.fremd(id int)');
  const nz = await tgtErr(PROD_REF, adapt(PRE)), nz2 = await tgtErr(DEV_REF, adapt(PRE));
  ok(/ziel: Produktion/.test(nz.err) && !/public enthält/.test(nz.err) && /public enthält bereits 1 Relationen/.test(nz2.err), 'Zielprüfung ist unabhängig vom Zustand von public (falsches Ziel scheitert zuerst, richtiges Ziel erst danach an public)');
  await q('drop table public.fremd');
  ok((await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(PRE))).code === 0, 'Preflight mit richtiger Referenz und passender Datenbankkennung bleibt erfolgreich');

  // Wrapper-Skript install_dev.sh: bricht vor dem Aufruf von psql ab (psql ist hier eine Attrappe, die nur den Aufruf aufzeichnet)
  const fake = mkdtempSync(join(tmpdir(), 'rwfake-')), calls = join(fake, 'calls.txt');
  writeFileSync(join(fake, 'psql'), `#!/usr/bin/env bash\necho "$@" >> '${calls}'\ncat > '${calls}.stdin'\n`, { mode: 0o755 });
  const sha = createHash('sha256').update(INSTALL).digest('hex'), instFile = join(fake, 'install_dev.sql'); writeFileSync(instFile, INSTALL);
  const run = (env, arg) => spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), ...(arg === undefined ? [] : [arg])], { encoding: 'utf8', env: { PATH: fake + ':' + process.env.PATH, RW_INSTALL_FILE: instFile, ...env } });
  const URLOK = `postgresql://postgres.${DEV_REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  const called = () => { try { return readFileSync(calls, 'utf8').trim().length > 0; } catch { return false; } };
  const cases = [
    ['ohne RW_PROJECT_REF', { RW_DB_URL: URLOK }, sha, /RW_PROJECT_REF ist nicht gesetzt/],
    ['Produktionsreferenz', { RW_PROJECT_REF: PROD_REF, RW_DB_URL: URLOK }, sha, /Produktion ist ausdrücklich ausgeschlossen/],
    ['abweichende Referenz', { RW_PROJECT_REF: 'abcdefghijklmnopqrst', RW_DB_URL: URLOK }, sha, /weicht von ruinwalk-dev ab/],
    ['ohne Verbindung', { RW_PROJECT_REF: DEV_REF }, sha, /RW_DB_URL ist nicht gesetzt/],
    ['Verbindung ohne Dev-Referenz', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: 'postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }, sha, /Referenz von ruinwalk-dev nicht/],
    ['Verbindung nennt Produktion', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: `postgresql://postgres:x@db.${PROD_REF}.supabase.co/postgres?x=${DEV_REF}` }, sha, /Produktionsreferenz/],
    ['ohne Hash-Argument', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, undefined, /SHA-256 der install_dev.sql fehlt/],
    ['falscher Hash', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, '0'.repeat(64), /weicht vom erwarteten Wert ab/],
  ];
  for (const [n, env, arg, re] of cases) { const r = run(env, arg); ok(r.status === 2 && re.test(r.stderr) && !called() && !r.stdout.includes('x@'), `install_dev.sh bricht ab (${n}), psql wird nicht aufgerufen`); }
  const good = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, sha);
  const sent = readFileSync(calls + '.stdin', 'utf8');
  ok(good.status === 0 && called() && (/ -v ON_ERROR_STOP=1 -f -$/m.test(readFileSync(calls, 'utf8')) && !/ -1( |$)/m.test(readFileSync(calls, 'utf8'))) && sent.startsWith(`set rw.project_ref = '${DEV_REF}';\n`) && sent.includes(INSTALL) && !good.stdout.includes('x@') && !good.stderr.includes('x@'), 'install_dev.sh mit allen richtigen Angaben: ON_ERROR_STOP=1 und kein -1 (die Datei besitzt ihre Transaktion), Referenz vor der Datei gesetzt, Verbindungszeichenfolge nicht ausgegeben');

  // --- Installation ---
  const inst = await tx(T + adapt(INSTALL));
  ok(inst.code === 0, 'kombinierte Installation in einer Transaktion', (inst.err || '').split('\n').filter((l) => /ERROR/.test(l))[0] || '');
  const after = await fp();
  ok(after !== pristine, 'Installation hat den Katalog verändert');
  ok((await cnt(`select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'`)) === 6 && (await cnt(`select count(*) from pg_class where relnamespace='rwi'::regnamespace and relkind='r'`)) === 18, '6 Tabellen in public, 18 in rwi');
  ok((await cnt(`select count(*) from pg_proc where pronamespace='public'::regnamespace`)) === 38 && (await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace`)) >= 55, '38 Funktionen in public (19 Schema + 8 Client-Wrapper + 11 Worker-/Betriebs-Wrapper), mindestens 55 in rwi');
  ok((await cnt(`select count(*) from pg_default_acl where defaclnamespace='public'::regnamespace`)) === 3, 'Default-ACLs in public unverändert (3 Einträge aus der Umgebung, von der Installation nicht angefasst)');

  // --- zweiter Installationsversuch ---
  const again = await tx(T + adapt(INSTALL));
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
  const noConfirm = await tx(T + adapt(ROLLBACK));
  ok(noConfirm.code !== 0 && /Bestätigung fehlt/.test(noConfirm.err) && (await fp()) === after, 'Rollback ohne Bestätigung bricht ab und ändert nichts');
  const wrong = await tx(T + `set rw.rollback_confirm = 'ja'; ` + adapt(ROLLBACK));
  ok(wrong.code !== 0 && (await fp()) === after, 'Rollback mit falscher Bestätigung bricht ab');
  const rb = await tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(rb.code === 0, 'Rollback mit Bestätigung in einer Transaktion', (rb.err || '').split('\n').filter((l) => /ERROR/.test(l))[0] || (rb.err.match(/rollback entfernt[^\n]*/) || [''])[0]);
  ok((await fp()) === pristine, 'nach dem Rollback ist der Katalog-Fingerabdruck wieder der Ausgangszustand (Relationen, Funktionen, Rechte, Trigger, Policies, Default-ACLs)');
  ok((await cnt(`select count(*) from auth.users`)) === 2, 'Testkonten in auth.users bleiben nach dem Rollback bestehen (bekannt, getrennte Bereinigung)');
  ok((await cnt(`select count(*) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`)) === 0, 'Trigger auf auth.users entfernt');
  const cl1 = await tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(CLEAN));
  ok(cl1.code === 0 && (await cnt(`select count(*) from auth.users`)) === 1 && (await q(`select email from auth.users`)) === 'echt@example.org', 'cleanup_test_accounts löscht nur @rwtest.invalid, andere Konten bleiben');
  ok((await tx(T + adapt(CLEAN))).code !== 0, 'cleanup ohne Bestätigung bricht ab');
  await q(`delete from auth.users`);
  const rb2 = await tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(rb2.code === 0 && (await fp()) === pristine, 'Rollback ohne Installation ist wiederholbar (idempotent, ändert nichts)', (rb2.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 120));

  // --- Wiederholung nach Rollback ---
  const re = await tx(T + adapt(INSTALL));
  ok(re.code === 0, 'erneute Installation nach Rollback gelingt');
  ok((await fp()) === after, 'Installation ist reproduzierbar: gleicher Katalog-Fingerabdruck wie beim ersten Mal');

  // --- Rollback-Abbruch bei fremden Abhängigkeiten ---
  await q(`create view public.fremde_sicht as select account_id from public.profiles`);
  const dep = await tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(dep.code !== 0 && /Sichten hängen/.test(dep.err), 'Rollback bricht ab, wenn fremde Sichten von unseren Tabellen abhängen (kein stilles CASCADE)');
  await q(`drop view public.fremde_sicht`);

  // =====  NEU: Rollback gegen externe Abhängigkeiten  =====
  const RBX = (x = '') => tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + x + adapt(ROLLBACK));
  const noZiel = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK)), noZielC = await tx(`set local rw.rollback_confirm = 'ja-loeschen';\n` + adapt(CLEAN));
  ok(noZiel.code !== 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(noZiel.err) && noZielC.code !== 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(noZielC.err), 'Rollback und cleanup verlangen ebenfalls die Zielprüfung (ohne Referenz Abbruch, trotz gesetzter Bestätigung)');
  const tabs = async () => `${await cnt(`select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname not like 'fremd%'`)}/${await cnt(`select count(*) from pg_class where relnamespace='rwi'::regnamespace and relkind='r' and relname not like 'fremd%'`)}`;
  ok((await tabs()) === '6/18', 'Ausgangslage für die Rollback-Absicherung: 6 Tabellen in public, 18 in rwi installiert');
  await q('create schema fremd');
  const cases2 = [
    ['Sicht in einem fremden Schema über rwi.cfg', 'create view fremd.v as select * from rwi.cfg', 'drop view fremd.v', /fremd\.v|view v/],
    ['Fremdschlüssel einer fremden Tabelle auf rwi.instances', 'create table fremd.t(i bigint references rwi.instances(id))', 'drop table fremd.t', /fremd|constraint/],
    ['SQL-Funktion (BEGIN ATOMIC) in fremdem Schema mit Verweis auf rwi.cfg', 'create function fremd.f() returns bigint language sql begin atomic select count(*) from rwi.cfg; end', 'drop function fremd.f()', /function fremd\.f/],
    ['Trigger auf fremder Tabelle mit rwi-Triggerfunktion', 'create table fremd.t2(i int); create trigger fremd_trg before update on fremd.t2 for each row execute function rwi.ops_log_append_only()', 'drop table fremd.t2', /trigger fremd_trg|fremd_trg/],
    ['Fremdschlüssel einer public-Tabelle auf public.profiles (vom alten Schutz nicht erfasst)', 'create table public.fremd_fk(a uuid references public.profiles(account_id))', 'drop table public.fremd_fk', /fremd_fk/],
    ['Richtlinie einer fremden Tabelle, die eine rwi-Funktion benutzt', 'create table fremd.t3(i int); alter table fremd.t3 enable row level security; create policy p on fremd.t3 using (rwi.eligible($$x$$))', 'drop table fremd.t3', /policy p|fremd/],
  ];
  for (const [n, mk, rm, re] of cases2) {
    const made = await cl.psql(mk);
    if (made.code) { ok(false, `Aufbau: ${n}`, made.err.split('\n')[0]); await cl.psql(rm); continue; }
    const before = await fp(), r = await RBX();
    ok(r.code !== 0 && /Objekte außerhalb des Installationsumfangs hängen von zu löschenden Objekten ab/.test(r.err) && re.test(r.err), `Rollback bricht bei externer Abhängigkeit ab: ${n}`, (r.err.split('\n').find((l) => /ERROR|rollback:/.test(l)) || '').slice(0, 90));
    ok((await fp()) === before && (await tabs()) === '6/18', '  ... und hat nichts gelöscht (Katalog unverändert, Tabellen vorhanden)');
    await q(rm);
  }
  // Manifest: fremde Objekte INNERHALB von rwi
  for (const [n, mk, rm, re] of [['fremde Tabelle', 'create table rwi.fremde_tabelle(i int)', 'drop table rwi.fremde_tabelle', /Tabellen, die nicht.*fremde_tabelle/], ['fremde Funktion', 'create function rwi.fremde_fn() returns int language sql as $$ select 1 $$', 'drop function rwi.fremde_fn()', /Funktionen, die nicht.*fremde_fn/], ['fremder Typ', "create type rwi.fremder_typ as enum ('a')", 'drop type rwi.fremder_typ', /Typen außerhalb.*fremder_typ/], ['fremde Sicht', 'create view rwi.fremde_sicht as select 1 as x', 'drop view rwi.fremde_sicht', /Relationen außerhalb.*fremde_sicht/]]) {
    const made = await cl.psql(mk); if (made.code) { ok(false, `Aufbau: ${n}`, made.err.split('\n')[0]); continue; }
    const before = await fp(), r = await RBX();
    ok(r.code !== 0 && re.test(r.err) && (await fp()) === before && (await tabs()) === '6/18', `Rollback bricht ab, wenn rwi ein nicht vorgesehenes Objekt enthält: ${n}`, (r.err.split('\n').find((l) => /rollback:/.test(l)) || '').slice(0, 100));
    await q(rm);
  }
  ok((await cnt(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'fremd%'`)) === 0, 'künstliche Fremdobjekte wieder entfernt');
  // Fall ohne externe Abhängigkeit: die Prüfung lässt den vorgesehenen Rollback durch
  const clean = await RBX();
  ok(clean.code === 0 && /rollback entfernt/.test(clean.err) && !/außerhalb des Installationsumfangs/.test(clean.err), 'Fall ohne externe Abhängigkeit: Rollback läuft durch', (clean.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 100));
  ok((await cnt(`select count(*) from pg_namespace where nspname='fremd'`)) === 1, 'ein fremdes Schema (fremd) ist vom Rollback unberührt geblieben');
  await q('drop schema fremd');
  ok((await fp()) === pristine, 'danach Ausgangszustand wieder hergestellt (Katalog-Fingerabdruck wie unberührt)');

  // =====  NEU (zweite Runde): Manifest mit Struktur/Fingerabdruck, Transaktion, Sperren, Wrapper mit echtem psql  =====
  ok((await tx(T + adapt(INSTALL))).code === 0, 'Neuinstallation für die zweite Runde der Rollback-Prüfungen');
  const RB = (pre = '') => tx(T + `set local rw.rollback_confirm = 'ja-loeschen';\n` + pre + adapt(ROLLBACK));
  const defOf = async (sig) => q(`select pg_get_functiondef('${sig}'::regprocedure)`);
  const fn0 = await defOf('rwi.eligible(text)');
  const fx = [
    ['ersetzte Funktion (gleicher Name, anderer Quelltext)', "create or replace function rwi.eligible(p_player text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select true $$", fn0, /Funktionen, die nicht.*eligible/],
    ['Funktion mit geänderter Eigenschaft (search_path)', 'alter function rwi.eligible(text) set search_path = public', fn0, /Funktionen, die nicht.*eligible/],
    ['Funktion mit geänderter Sicherheitsart (SECURITY INVOKER)', 'alter function rwi.eligible(text) security invoker', fn0, /Funktionen, die nicht.*eligible/],
    ['zusätzliche Überladung gleichen Namens', 'create function rwi.eligible(a int, b int) returns boolean language sql as $$ select true $$', 'drop function rwi.eligible(int, int)', /Funktionen, die nicht.*eligible/],
    ['Tabelle mit zusätzlicher Spalte', 'alter table rwi.cfg add column zusatz int', 'alter table rwi.cfg drop column zusatz', /Tabellen, die nicht.*cfg/],
    ['Tabelle mit geändertem Spaltentyp', 'alter table rwi.ops_alerts add column z2 int; alter table rwi.ops_alerts alter column z2 type bigint', 'alter table rwi.ops_alerts drop column z2', /Tabellen, die nicht.*ops_alerts/],
    ['zusätzlicher Index', 'create index fremd_idx on rwi.cfg ((1))', 'drop index rwi.fremd_idx', /Indizes außerhalb.*fremd_idx/],
    ['zusätzlicher Trigger', 'create trigger fremd_tr before update on rwi.cfg for each row execute function rwi.ops_log_append_only()', 'drop trigger fremd_tr on rwi.cfg', /Trigger außerhalb.*fremd_tr/],
    ['zusätzliche Richtlinie', 'create policy fremd_p on rwi.cfg using (true)', 'drop policy fremd_p on rwi.cfg', /Richtlinien außerhalb.*fremd_p/],
    ['zusätzliche eigenständige Sequenz', 'create sequence rwi.fremd_seq', 'drop sequence rwi.fremd_seq', /Relationen außerhalb.*fremd_seq/],
  ];
  for (const [n, mk, rm, re] of fx) {
    const m = await cl.psql(mk); if (m.code) { ok(false, `Aufbau: ${n}`, m.err.split('\n')[0]); await cl.psql(rm.startsWith('create') ? rm : rm); continue; }
    const before = await fp(), r = await RB();
    ok(r.code !== 0 && re.test(r.err) && (await fp()) === before, `Manifest erkennt: ${n}`, (r.err.split('\n').find((l) => /rollback:/.test(l)) || r.err.split('\n')[0]).slice(0, 110));
    const back = await cl.psql(rm); if (back.code) ok(false, `Rückbau: ${n}`, back.err.split('\n')[0]);
  }
  ok((await tabs()) === '6/18' && (await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace and proname='eligible'`)) === 1, 'alle Manipulationen zurückgebaut, Ausgangslage unverändert');
  ok((await RB()).code === 0 && (await fp()) === pristine, 'danach läuft der Rollback sauber durch (Manifest passt zum unveränderten Stand)');
  ok((await tx(T + adapt(INSTALL))).code === 0, 'erneute Installation (Transaktion, Sperren, Autocommit-Prüfungen)');

  // Transaktion: Das Skript sichert sich selbst (begin/commit), auch ohne psql -1 und ohne ON_ERROR_STOP. Ein fehlgeschlagener Check darf nichts löschen.
  await q('create schema fremd; create view fremd.v as select * from rwi.cfg');
  const loose = (sql) => cl.psql(sql, 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  const looseRb = await loose(`set rw.project_ref = '${DEV_REF}';\nset rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(/außerhalb des Installationsumfangs/.test(looseRb.err) && (await tabs()) === '6/18' && (await cnt(`select count(*) from pg_namespace where nspname='rwi'`)) === 1, 'Rollback ohne psql -1 und ohne ON_ERROR_STOP: der fehlgeschlagene Check verhindert alle späteren Löschungen');
  const looseNoRef = await loose(`set rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(/ziel: rw.project_ref ist nicht gesetzt/.test(looseNoRef.err) && (await tabs()) === '6/18', 'Rollback ohne Referenz, ohne -1 und ohne ON_ERROR_STOP: nichts gelöscht');
  await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('cccccccc-0000-4000-8000-000000000001','t@rwtest.invalid','{"username":"Spieler_C"}',now())`);
  const looseCl = await loose(`set rw.rollback_confirm = 'ja-loeschen';\n` + adapt(CLEAN));
  ok(/ziel: rw.project_ref ist nicht gesetzt/.test(looseCl.err) && (await cnt(`select count(*) from auth.users where email like '%@rwtest.invalid'`)) === 1, 'cleanup ohne Referenz, ohne -1 und ohne ON_ERROR_STOP: kein Konto gelöscht');
  const rbBlock = (x) => x.slice(x.indexOf('set local lock_timeout'), x.indexOf('end $$;', x.indexOf('set local lock_timeout')) + 7);
  ok(/^begin;/m.test(ROLLBACK) && /commit;\s*$/.test(ROLLBACK) && /^begin;/m.test(CLEAN) && /commit;\s*$/.test(CLEAN), 'rollback_dev.sql und cleanup_test_accounts.sql enthalten begin und commit (Löschvorgang und Prüfungen in derselben Transaktion)');
  await q('drop schema fremd cascade');
  await q(`delete from auth.users where email like '%@rwtest.invalid'`);

  // Sperren: Der Sperrblock hält die Tabellen bis zum Transaktionsende; ein gleichzeitiger Versuch, eine Sicht darauf anzulegen, wartet (hier: Zeitüberschreitung)
  const holder = cl.psql(`begin;\n${rbBlock(ROLLBACK)}\nselect pg_sleep(4);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const blocked = await cl.psql(`set statement_timeout = '1500ms'; create schema if not exists fremd; create view fremd.v2 as select * from rwi.cfg;`);
  ok(blocked.code !== 0 && /statement timeout|canceling/.test(blocked.err), 'während der Rollback-Sperren wird das gleichzeitige Anlegen einer Sicht auf rwi.cfg blockiert');
  await holder;
  await q('drop schema if exists fremd cascade');
  const fkBlock = cl.psql(`begin;\n${rbBlock(ROLLBACK)}\nselect pg_sleep(4);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const blockedW = await cl.psql(`set statement_timeout = '1500ms'; update rwi.cfg set key = key;`.replace('key', (await q(`select attname from pg_attribute where attrelid='rwi.cfg'::regclass and attnum=1`))));
  ok(blockedW.code !== 0 && /statement timeout|canceling/.test(blockedW.err), 'während der Rollback-Sperren werden gleichzeitige Schreibzugriffe auf rwi-Tabellen blockiert');
  await fkBlock;

  // Wrapper mit ECHTEM psql (nur die Verbindung wird auf die lokale Testdatenbank umgeleitet): eine Transaktion, Abbruch bei erstem Fehler, Zielprüfung in der Datenbank
  const real = join(fake, 'bin'); await q('select 1');
  const wrapDir = mkdtempSync(join(tmpdir(), 'rwwrap-')); writeFileSync(join(wrapDir, 'psql'), `#!/usr/bin/env bash\nshift\nexec ${cl.BIN}/psql -h ${cl.tmp} -p ${cl.port} -U postgres -X -q -d rwi "$@"\n`, { mode: 0o755 });
  const runReal = (file, extraEnv = {}) => { writeFileSync(join(wrapDir, 'inst.sql'), file); const h = createHash('sha256').update(file).digest('hex'); return spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), h], { encoding: 'utf8', env: { PATH: wrapDir + ':' + process.env.PATH, RW_INSTALL_FILE: join(wrapDir, 'inst.sql'), RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK, ...extraEnv } }); };
  const rbOk = await RB(); ok(rbOk.code === 0 && (await fp()) === pristine, 'Ausgangszustand für den Wrapper-Test');
  const wrongDb = runReal(INSTALL);   // unveränderte Dev-Kennung: lokale Datenbank ist nicht ruinwalk-dev
  ok(wrongDb.status !== 0 && /Datenbankkennung gehört nicht zu ruinwalk-dev/.test(wrongDb.stderr) && (await fp()) === pristine, 'install_dev.sh mit echtem psql gegen eine andere Datenbank: Abbruch durch die Zielprüfung, nichts verändert');
  const wrapOk = runReal(adapt(INSTALL));
  ok(wrapOk.status === 0 && (await tabs()) === '6/18', 'install_dev.sh mit echtem psql und passender Datenbankkennung: Installation in einer Transaktion gelungen', (wrapOk.stderr.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 100));
  await q('create table public.fremd_blockiert(i int)');
  const wrapTwice = runReal(adapt(INSTALL));
  ok(wrapTwice.status !== 0 && (await tabs()) === '6/18', 'zweiter Wrapper-Lauf bricht ab (Preflight), nichts verändert');
  await q('drop table public.fremd_blockiert');
  // Wrapper: Hash wird über genau die ausgeführte Datei gebildet
  const shSrc = readFileSync(join(root, 'supabase/dev/install_dev.sh'), 'utf8');
  ok(/cp "\$FILE" "\$TMP"/.test(shSrc) && /sha256sum "\$TMP"/.test(shSrc) && /cat "\$TMP"/.test(shSrc) && !/cat "\$FILE"/.test(shSrc), 'install_dev.sh hasht und führt dieselbe private Kopie aus (kein zweites Lesen der Originaldatei)');
  const badUrls = [['Überschreibung des Hosts über Abfrageparameter', `postgresql://postgres.${DEV_REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?host=db.abc.supabase.co`], ['Dev-Referenz nur im Passwort', `postgresql://postgres:${DEV_REF}@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`], ['Dev-Referenz nur im Datenbanknamen', `postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/${DEV_REF}`], ['keine URL (Schlüssel-Wert-Form)', `host=db.${DEV_REF}.supabase.co user=postgres`], ['Pooler-Benutzer ohne Referenz', 'postgresql://postgres:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres']];
  for (const [n, u] of badUrls) { const r = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: u }, sha); ok(r.status === 2 && /ABBRUCH/.test(r.stderr), `install_dev.sh lehnt ab: ${n}`); }
  const direct = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: `postgresql://postgres:x@db.${DEV_REF}.supabase.co:5432/postgres` }, sha);
  ok(direct.status === 0, 'install_dev.sh akzeptiert die direkte Dev-Verbindung db.<ref>.supabase.co');
  await q(`select 1`);
  const fin = await RB(); ok(fin.code === 0 && (await fp()) === pristine, 'Aufräumen: Rollback, Ausgangszustand');

  // =====  NEU (dritte Runde): Rollback ohne CASCADE, atomare Löschsequenz, transaktionssichere Installation  =====
  const code = (x) => x.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/--[^\n']*$/gm, '');
  ok(!/\bcascade\b/i.test(code(ROLLBACK)) && /execute 'drop schema rwi'/.test(ROLLBACK), 'rollback_dev.sql enthält im ausführbaren Teil kein CASCADE; das Schema wird mit gewöhnlichem DROP SCHEMA (RESTRICT) gelöscht');
  ok((await tx(T + adapt(INSTALL))).code === 0, 'Installation für die Löschsequenz-Prüfungen');
  const trigs = async () => `${await cnt(`select count(*) from pg_trigger where tgname='on_auth_user_created'`)}/${await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace`)}/${await tabs()}`;
  ok((await trigs()) === '1/67/6/18', 'Ausgangslage: Trigger auf auth.users, 67 rwi-Funktionen, 6/18 Tabellen');
  await q(`create schema fremd; create function fremd.boom() returns event_trigger language plpgsql as $f$ declare r record; begin
    for r in select * from pg_event_trigger_dropped_objects() loop
      if (current_setting('fremd.stufe', true) = 'tabelle' and r.object_type = 'table' and r.schema_name = 'rwi')
         or (current_setting('fremd.stufe', true) = 'funktion' and r.object_type = 'function' and r.schema_name = 'rwi')
         or (current_setting('fremd.stufe', true) = 'schema' and r.object_type = 'schema')
         or (current_setting('fremd.stufe', true) = 'public-tabelle' and r.object_type = 'table' and r.schema_name = 'public') then
        raise exception 'BOOM-%', current_setting('fremd.stufe', true); end if;
    end loop; end $f$; create event trigger fremd_boom on sql_drop execute function fremd.boom();`);
  for (const stufe of ['tabelle', 'public-tabelle', 'funktion', 'schema']) {
    const b4 = await fp(), r = await RB(`set local fremd.stufe = '${stufe}';\n`);
    ok(r.code !== 0 && new RegExp(`BOOM-${stufe}`).test(r.err) && (await fp()) === b4 && (await trigs()) === '1/67/6/18', `Fehler in der Löschsequenz (Stufe ${stufe}): gesamter Rollback zurückgenommen, nichts bleibt gelöscht`, (r.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 80));
  }
  // Nachzügler: Während der Löschsequenz taucht ein NEUES Objekt in rwi auf (Parallelitätsfall nach der Prüfung) -> DROP SCHEMA ohne CASCADE scheitert, alles wird zurückgerollt
  await q(`create function fremd.nachzuegler() returns event_trigger language plpgsql as $f$ begin
    if current_setting('fremd.stufe', true) = 'nachzuegler' and not exists (select 1 from pg_proc where proname = 'nachzuegler_fn') then
      execute 'create function rwi.nachzuegler_fn() returns int language sql as $g$ select 1 $g$'; end if; end $f$; create event trigger fremd_nach on ddl_command_end when tag in ('DROP TABLE') execute function fremd.nachzuegler();`);
  const b5 = await fp(), nzr = await RB(`set local fremd.stufe = 'nachzuegler';\n`);
  ok(nzr.code !== 0 && /cannot drop schema rwi because other objects depend on it|nachzuegler_fn/.test(nzr.err) && (await fp()) === b5 && (await trigs()) === '1/67/6/18', 'neues Objekt in rwi nach der Prüfung (Nachzügler): DROP SCHEMA ohne CASCADE scheitert, vollständig zurückgerollt');
  await q('drop event trigger fremd_boom; drop event trigger fremd_nach; drop schema fremd cascade');
  // eigene Default-ACL-Einträge in rwi fallen mit dem Schema (auto), ohne CASCADE
  await q('alter default privileges in schema rwi grant select on tables to authenticated');
  const dacl = await cnt(`select count(*) from pg_default_acl where defaclnamespace='rwi'::regnamespace`);
  const rbAcl = await RB(); ok(dacl >= 1 && rbAcl.code === 0 && (await fp()) === pristine, 'Rollback ohne CASCADE entfernt auch eigene Default-ACL-Einträge in rwi, nichts anderes bleibt zurück', (rbAcl.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 100));

  // Installation: atomar, auch ohne psql -1 und ohne ON_ERROR_STOP (psql läuft hier absichtlich weiter!)
  const inj = (stelle, stmt) => adapt(INSTALL).replace(stelle, stmt + '\n' + stelle);
  const mitte = '-- ===== 03_windows.sql =====', ende = '\ncommit;';
  const looseInst = (txt) => cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + txt, 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  const rm1 = await looseInst(inj(mitte, 'select 1/0;'));
  ok(/division by zero/.test(rm1.err) && (await fp()) === pristine, 'Fehler mitten in der Installation (nach schema.sql, 01, 02): ohne -1 und ohne ON_ERROR_STOP bleibt nichts installiert (Katalog = unberührt)');
  const lastStmt = adapt(INSTALL).replace(/\ncommit;\s*$/, '\nselect 1/0;\ncommit;\n');
  const rm2 = await looseInst(lastStmt);
  ok(/division by zero/.test(rm2.err) && (await fp()) === pristine, 'Fehler im allerletzten Statement vor COMMIT: nichts bleibt installiert');
  const rm3 = await cl.psql(adapt(INSTALL), 'rwi', ['-v', 'ON_ERROR_STOP=0']);   // ohne gesetzte Referenz
  ok(/ziel: rw.project_ref ist nicht gesetzt/.test(rm3.err) && (await fp()) === pristine, 'Zielprüfung unverändert wirksam: ohne Referenz, ohne -1, ohne ON_ERROR_STOP nichts installiert');
  const rm4 = await cl.psql(`set rw.project_ref = '${PROD_REF}';\n` + adapt(INSTALL), 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  ok(/Produktion ist ausdrücklich ausgeschlossen/.test(rm4.err) && (await fp()) === pristine, 'Zielprüfung unverändert wirksam: Produktionsreferenz, ohne -1, ohne ON_ERROR_STOP nichts installiert');
  const rm5 = await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + INSTALL, 'rwi', ['-v', 'ON_ERROR_STOP=0']);   // richtige Referenz, andere Datenbank
  ok(/Datenbankkennung gehört nicht zu ruinwalk-dev/.test(rm5.err) && (await fp()) === pristine, 'Zielprüfung unverändert wirksam: richtige Referenz, falsche Datenbank, ohne -1, ohne ON_ERROR_STOP nichts installiert');
  await q('create table public.fremd_pf(i int)');
  const rm6 = await looseInst(adapt(INSTALL));
  ok(/public enthält bereits/.test(rm6.err), 'Preflight meldet das nicht leere public');
  await q('drop table public.fremd_pf');
  ok((await fp()) === pristine, 'Preflight-Fehler (nicht leeres public) ohne -1/ON_ERROR_STOP: nichts installiert');
  // Wrapper: Fehlerverhalten mit echtem psql
  const failInst = inj(mitte, 'select 1/0;'), shaF = createHash('sha256').update(failInst).digest('hex');
  writeFileSync(join(wrapDir, 'inst.sql'), failInst);
  const wf = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), shaF], { encoding: 'utf8', env: { PATH: wrapDir + ':' + process.env.PATH, RW_INSTALL_FILE: join(wrapDir, 'inst.sql'), RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  ok(wf.status !== 0 && /division by zero/.test(wf.stderr) && /FEHLGESCHLAGEN/.test(wf.stderr) && !/ohne Fehler abgeschlossen/.test(wf.stderr + wf.stdout) && (await fp()) === pristine, 'Wrapper: Fehler in der Installation => Exit-Status ungleich 0, Meldung FEHLGESCHLAGEN, keine Erfolgsmeldung, nichts installiert');
  const wokR = runReal(adapt(INSTALL));
  ok(wokR.status === 0 && /ohne Fehler abgeschlossen/.test(wokR.stderr) && (await tabs()) === '6/18', 'Wrapper: erfolgreiche Installation meldet den Erfolg erst nach fehlerfreiem psql');
  // psql-Attrappe, die mit Fehlercode endet: der Wrapper darf nicht Erfolg melden
  const fake2 = mkdtempSync(join(tmpdir(), 'rwfake2-')); writeFileSync(join(fake2, 'psql'), '#!/usr/bin/env bash\ncat > /dev/null\nexit 7\n', { mode: 0o755 });
  const wx = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), sha], { encoding: 'utf8', env: { PATH: fake2 + ':' + process.env.PATH, RW_INSTALL_FILE: instFile, RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  ok(wx.status !== 0 && /FEHLGESCHLAGEN/.test(wx.stderr) && !/ohne Fehler abgeschlossen/.test(wx.stderr + wx.stdout), 'Wrapper: psql-Exit-Status 7 wird als Fehler gemeldet (kein Erfolg)');
  const rbF = await RB(); ok(rbF.code === 0 && (await fp()) === pristine, 'Aufräumen: Rollback, Ausgangszustand');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
