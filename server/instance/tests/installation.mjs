// Installation, zweiter Versuch, Rollback und Wiederholung: node server/instance/tests/installation.mjs
// Prüft supabase/dev/{00_preflight,build.sh,rollback_dev.sql,cleanup_test_accounts.sql} auf einer lokalen PostgreSQL-Instanz mit der Supabase-Attrappe
// (supabase/tests/00_stub.sql, Modus legacy = Standardrechte für API-Rollen wie auf Dev). Lokal, NICHT auf einem echten Supabase-Projekt.
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCluster } from './pg.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const STUB = readFileSync(join(root, 'supabase/tests/00_stub.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
// Testpasswort mit Sonderzeichen für die pgpass-Maskierung (\ und :); taucht nie in URLs auf
const PW = 'pw\\mit:doppelpunkt', PW_PGPASS = 'pw\\\\mit\\:doppelpunkt';

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
  writeFileSync(join(fake, 'psql'), `#!/usr/bin/env bash\necho "$@" >> '${calls}'\nenv | grep -E '^(PG|PSQLRC)' > '${calls}.env'\ncat > '${calls}.stdin'\n[ -n "$PGPASSFILE" ] && { cat "$PGPASSFILE" > '${calls}.pgpass'; stat -c %a "$PGPASSFILE" > '${calls}.pgpassmode'; echo "$PGPASSFILE" > '${calls}.pgpasspath'; } || true\n`, { mode: 0o755 });
  const sha = createHash('sha256').update(INSTALL).digest('hex'), instFile = join(fake, 'install_dev.sql'); writeFileSync(instFile, INSTALL);
  const run = (env, arg) => spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), ...(arg === undefined ? [] : [arg])], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: fake + ':' + process.env.PATH, RW_INSTALL_FILE: instFile, ...env } });
  const URLOK = `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  const called = () => { try { return readFileSync(calls, 'utf8').trim().length > 0; } catch { return false; } };
  const cases = [
    ['ohne RW_PROJECT_REF', { RW_DB_URL: URLOK }, sha, /RW_PROJECT_REF ist nicht gesetzt/],
    ['Produktionsreferenz', { RW_PROJECT_REF: PROD_REF, RW_DB_URL: URLOK }, sha, /Produktion ist ausdrücklich ausgeschlossen/],
    ['abweichende Referenz', { RW_PROJECT_REF: 'abcdefghijklmnopqrst', RW_DB_URL: URLOK }, sha, /weicht von ruinwalk-dev ab/],
    ['ohne Verbindung', { RW_PROJECT_REF: DEV_REF }, sha, /RW_DB_URL ist nicht gesetzt/],
    ['Verbindung ohne Dev-Referenz', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }, sha, /Referenz von ruinwalk-dev nicht/],
    ['Verbindung nennt Produktion', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: `postgresql://postgres@db.${PROD_REF}.supabase.co/postgres?x=${DEV_REF}` }, sha, /Produktionsreferenz/],
    ['ohne Hash-Argument', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, undefined, /SHA-256 der install_dev.sql fehlt/],
    ['falscher Hash', { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, '0'.repeat(64), /weicht vom erwarteten Wert ab/],
  ];
  for (const [n, env, arg, re] of cases) { const r = run(env, arg); ok(r.status === 2 && re.test(r.stderr) && !called() && !r.stdout.includes(PW), `install_dev.sh bricht ab (${n}), psql wird nicht aufgerufen`); }
  const good = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK }, sha);
  const sent = readFileSync(calls + '.stdin', 'utf8');
  const REFLINE = `set local rw.project_ref = '${DEV_REF}';\n`;
  ok(good.status === 0 && called() && (/ -X -w -v ON_ERROR_STOP=1 -f -$/m.test(readFileSync(calls, 'utf8')) && !/ -1( |$)/m.test(readFileSync(calls, 'utf8'))) && !/^set rw\.project_ref/m.test(sent) && sent.includes('\nbegin;\n' + REFLINE) && sent.indexOf(REFLINE) < sent.indexOf('-- ZIELPRÜFUNG') && sent.replace(REFLINE, '') === INSTALL && !good.stdout.includes(PW) && !good.stderr.includes(PW), 'install_dev.sh mit allen richtigen Angaben: psql -X, ON_ERROR_STOP=1, kein -1; Referenz als set local direkt nach dem begin der Datei (in der Transaktion, vor der Zielprüfung), sonst unveränderter Inhalt; Verbindungszeichenfolge nicht ausgegeben');

  // --- Installation ---
  const inst = await tx(T + adapt(INSTALL));
  ok(inst.code === 0, 'kombinierte Installation in einer Transaktion', (inst.err || '').split('\n').filter((l) => /ERROR/.test(l))[0] || '');
  const after = await fp();
  ok(after !== pristine, 'Installation hat den Katalog verändert');
  ok((await cnt(`select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'`)) === 16 && (await cnt(`select count(*) from pg_class where relnamespace='rwi'::regnamespace and relkind='r'`)) === 18, '16 Tabellen in public (6 + 10 Quest Paket 2), 18 in rwi');
  ok((await cnt(`select count(*) from pg_proc where pronamespace='public'::regnamespace`)) === 56 && (await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace`)) >= 55, '56 Funktionen in public (19 Schema + 18 Quest Paket 2 + 8 Client-Wrapper + 11 Worker-/Betriebs-Wrapper), mindestens 55 in rwi');
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
  ok((await tabs()) === '16/18', 'Ausgangslage für die Rollback-Absicherung: 16 Tabellen in public (6 + 10 Quest), 18 in rwi installiert');
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
    ok((await fp()) === before && (await tabs()) === '16/18', '  ... und hat nichts gelöscht (Katalog unverändert, Tabellen vorhanden)');
    await q(rm);
  }
  // Manifest: fremde Objekte INNERHALB von rwi
  for (const [n, mk, rm, re] of [['fremde Tabelle', 'create table rwi.fremde_tabelle(i int)', 'drop table rwi.fremde_tabelle', /Tabellen, die nicht.*fremde_tabelle/], ['fremde Funktion', 'create function rwi.fremde_fn() returns int language sql as $$ select 1 $$', 'drop function rwi.fremde_fn()', /Funktionen, die nicht.*fremde_fn/], ['fremder Typ', "create type rwi.fremder_typ as enum ('a')", 'drop type rwi.fremder_typ', /Typen außerhalb.*fremder_typ/], ['fremde Sicht', 'create view rwi.fremde_sicht as select 1 as x', 'drop view rwi.fremde_sicht', /Relationen außerhalb.*fremde_sicht/]]) {
    const made = await cl.psql(mk); if (made.code) { ok(false, `Aufbau: ${n}`, made.err.split('\n')[0]); continue; }
    const before = await fp(), r = await RBX();
    ok(r.code !== 0 && re.test(r.err) && (await fp()) === before && (await tabs()) === '16/18', `Rollback bricht ab, wenn rwi ein nicht vorgesehenes Objekt enthält: ${n}`, (r.err.split('\n').find((l) => /rollback:/.test(l)) || '').slice(0, 100));
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
  ok((await tabs()) === '16/18' && (await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace and proname='eligible'`)) === 1, 'alle Manipulationen zurückgebaut, Ausgangslage unverändert');
  ok((await RB()).code === 0 && (await fp()) === pristine, 'danach läuft der Rollback sauber durch (Manifest passt zum unveränderten Stand)');
  ok((await tx(T + adapt(INSTALL))).code === 0, 'erneute Installation (Transaktion, Sperren, Autocommit-Prüfungen)');

  // Transaktion: Das Skript sichert sich selbst (begin/commit), auch ohne psql -1 und ohne ON_ERROR_STOP. Ein fehlgeschlagener Check darf nichts löschen.
  await q('create schema fremd; create view fremd.v as select * from rwi.cfg');
  const loose = (sql) => cl.psql(sql, 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  const looseRb = await loose(`set rw.project_ref = '${DEV_REF}';\nset rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(/außerhalb des Installationsumfangs/.test(looseRb.err) && (await tabs()) === '16/18' && (await cnt(`select count(*) from pg_namespace where nspname='rwi'`)) === 1, 'Rollback ohne psql -1 und ohne ON_ERROR_STOP: der fehlgeschlagene Check verhindert alle späteren Löschungen');
  const looseNoRef = await loose(`set rw.rollback_confirm = 'ja-loeschen';\n` + adapt(ROLLBACK));
  ok(/ziel: rw.project_ref ist nicht gesetzt/.test(looseNoRef.err) && (await tabs()) === '16/18', 'Rollback ohne Referenz, ohne -1 und ohne ON_ERROR_STOP: nichts gelöscht');
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
  const runReal = (file, extraEnv = {}) => { writeFileSync(join(wrapDir, 'inst.sql'), file); const h = createHash('sha256').update(file).digest('hex'); return spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), h], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: wrapDir + ':' + process.env.PATH, RW_INSTALL_FILE: join(wrapDir, 'inst.sql'), RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK, ...extraEnv } }); };
  const rbOk = await RB(); ok(rbOk.code === 0 && (await fp()) === pristine, 'Ausgangszustand für den Wrapper-Test');
  const wrongDb = runReal(INSTALL);   // unveränderte Dev-Kennung: lokale Datenbank ist nicht ruinwalk-dev
  ok(wrongDb.status !== 0 && /Datenbankkennung gehört nicht zu ruinwalk-dev/.test(wrongDb.stderr) && (await fp()) === pristine, 'install_dev.sh mit echtem psql gegen eine andere Datenbank: Abbruch durch die Zielprüfung, nichts verändert');
  const wrapOk = runReal(adapt(INSTALL));
  ok(wrapOk.status === 0 && (await tabs()) === '16/18', 'install_dev.sh mit echtem psql und passender Datenbankkennung: Installation in einer Transaktion gelungen', (wrapOk.stderr.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 100));
  await q('create table public.fremd_blockiert(i int)');
  const wrapTwice = runReal(adapt(INSTALL));
  ok(wrapTwice.status !== 0 && (await tabs()) === '16/18', 'zweiter Wrapper-Lauf bricht ab (Preflight), nichts verändert');
  await q('drop table public.fremd_blockiert');
  // Wrapper: Hash wird über genau die ausgeführte Datei gebildet
  // (angepasst, gleich streng: die Schutzlogik liegt jetzt gemeinsam in _ziel_wrapper.sh; alle drei Wrapper binden sie ein und lesen keine Datei selbst)
  const shSrc = readFileSync(join(root, 'supabase/dev/_ziel_wrapper.sh'), 'utf8');
  const fileUse = shSrc.split('\n').filter((l) => l.includes('"$FILE"') && !/^\s*#/.test(l));
  const wrappers = ['install_dev.sh', 'rollback_dev.sh', 'cleanup_dev.sh'].map((w) => readFileSync(join(root, 'supabase/dev', w), 'utf8'));
  ok(/cp "\$FILE" "\$TMP"/.test(shSrc) && /sha256sum "\$TMP"/.test(shSrc) && /\{ print \}' "\$TMP"/.test(shSrc) && fileUse.length === 2 && fileUse.every((l) => /\[ -f "\$FILE" \]|cp "\$FILE" "\$TMP"/.test(l))
     && wrappers.every((w) => /source "\$D\/_ziel_wrapper\.sh"/.test(w) && /^rw_pruefe_ziel$/m.test(w) && /^rw_fuehre_aus /m.test(w) && !/\b(cat|psql|sha256sum)\b/.test(w.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'))),
     'Wrapper hashen und führen dieselbe private Kopie aus (gemeinsame Schutzlogik _ziel_wrapper.sh; install/rollback/cleanup lesen keine Datei selbst und rufen psql nicht selbst auf)');
  const badUrls = [['Überschreibung des Hosts über Abfrageparameter', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?host=db.abc.supabase.co`], ['Dev-Referenz nur im Passwort', `postgresql://postgres:${DEV_REF}@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`], ['Dev-Referenz nur im Datenbanknamen', `postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/${DEV_REF}`], ['keine URL (Schlüssel-Wert-Form)', `host=db.${DEV_REF}.supabase.co user=postgres`], ['Pooler-Benutzer ohne Referenz', 'postgresql://postgres@aws-0-eu-central-1.pooler.supabase.com:5432/postgres']];
  for (const [n, u] of badUrls) { const r = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: u }, sha); ok(r.status === 2 && /ABBRUCH/.test(r.stderr), `install_dev.sh lehnt ab: ${n}`); }
  const direct = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: `postgresql://postgres@db.${DEV_REF}.supabase.co:5432/postgres` }, sha);
  ok(direct.status === 0, 'install_dev.sh akzeptiert die direkte Dev-Verbindung db.<ref>.supabase.co');
  await q(`select 1`);
  const fin = await RB(); ok(fin.code === 0 && (await fp()) === pristine, 'Aufräumen: Rollback, Ausgangszustand');

  // =====  NEU (dritte Runde): Rollback ohne CASCADE, atomare Löschsequenz, transaktionssichere Installation  =====
  const code = (x) => x.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/--[^\n']*$/gm, '');
  ok(!/\bcascade\b/i.test(code(ROLLBACK)) && /execute 'drop schema rwi'/.test(ROLLBACK), 'rollback_dev.sql enthält im ausführbaren Teil kein CASCADE; das Schema wird mit gewöhnlichem DROP SCHEMA (RESTRICT) gelöscht');
  ok((await tx(T + adapt(INSTALL))).code === 0, 'Installation für die Löschsequenz-Prüfungen');
  const trigs = async () => `${await cnt(`select count(*) from pg_trigger where tgname='on_auth_user_created'`)}/${await cnt(`select count(*) from pg_proc where pronamespace='rwi'::regnamespace`)}/${await tabs()}`;
  ok((await trigs()) === '1/67/16/18', 'Ausgangslage: Trigger auf auth.users, 67 rwi-Funktionen, 16/18 Tabellen');
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
    ok(r.code !== 0 && new RegExp(`BOOM-${stufe}`).test(r.err) && (await fp()) === b4 && (await trigs()) === '1/67/16/18', `Fehler in der Löschsequenz (Stufe ${stufe}): gesamter Rollback zurückgenommen, nichts bleibt gelöscht`, (r.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 80));
  }
  // Nachzügler: Während der Löschsequenz taucht ein NEUES Objekt in rwi auf (Parallelitätsfall nach der Prüfung) -> DROP SCHEMA ohne CASCADE scheitert, alles wird zurückgerollt
  await q(`create function fremd.nachzuegler() returns event_trigger language plpgsql as $f$ begin
    if current_setting('fremd.stufe', true) = 'nachzuegler' and not exists (select 1 from pg_proc where proname = 'nachzuegler_fn') then
      execute 'create function rwi.nachzuegler_fn() returns int language sql as $g$ select 1 $g$'; end if; end $f$; create event trigger fremd_nach on ddl_command_end when tag in ('DROP TABLE') execute function fremd.nachzuegler();`);
  const b5 = await fp(), nzr = await RB(`set local fremd.stufe = 'nachzuegler';\n`);
  ok(nzr.code !== 0 && /cannot drop schema rwi because other objects depend on it|nachzuegler_fn/.test(nzr.err) && (await fp()) === b5 && (await trigs()) === '1/67/16/18', 'neues Objekt in rwi nach der Prüfung (Nachzügler): DROP SCHEMA ohne CASCADE scheitert, vollständig zurückgerollt');
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
  const wf = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), shaF], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: wrapDir + ':' + process.env.PATH, RW_INSTALL_FILE: join(wrapDir, 'inst.sql'), RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  ok(wf.status !== 0 && /division by zero/.test(wf.stderr) && /FEHLGESCHLAGEN/.test(wf.stderr) && !/ohne Fehler abgeschlossen/.test(wf.stderr + wf.stdout) && (await fp()) === pristine, 'Wrapper: Fehler in der Installation => Exit-Status ungleich 0, Meldung FEHLGESCHLAGEN, keine Erfolgsmeldung, nichts installiert');
  const wokR = runReal(adapt(INSTALL));
  ok(wokR.status === 0 && /ohne Fehler abgeschlossen/.test(wokR.stderr) && (await tabs()) === '16/18', 'Wrapper: erfolgreiche Installation meldet den Erfolg erst nach fehlerfreiem psql');
  // psql-Attrappe, die mit Fehlercode endet: der Wrapper darf nicht Erfolg melden
  const fake2 = mkdtempSync(join(tmpdir(), 'rwfake2-')); writeFileSync(join(fake2, 'psql'), '#!/usr/bin/env bash\ncat > /dev/null\nexit 7\n', { mode: 0o755 });
  const wx = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), sha], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: fake2 + ':' + process.env.PATH, RW_INSTALL_FILE: instFile, RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  ok(wx.status !== 0 && /FEHLGESCHLAGEN/.test(wx.stderr) && !/ohne Fehler abgeschlossen/.test(wx.stderr + wx.stdout), 'Wrapper: psql-Exit-Status 7 wird als Fehler gemeldet (kein Erfolg)');

  // =====  NEU (vierte Runde): Transaktions-Pooler, Port, Umgebungsvariablen, lock_timeout  =====
  const rbP = await RB(); ok(rbP.code === 0 && (await fp()) === pristine, 'Ausgangszustand für die Pooler-/Sperrtests');
  // Port und Verbindungsart
  for (const [n, u, soll] of [
    ['Transaktions-Pooler (Port 6543)', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`, false],
    ['Direktverbindung auf Port 6543', `postgresql://postgres@db.${DEV_REF}.supabase.co:6543/postgres`, false],
    ['unbekannter Port', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:15432/postgres`, false],
    ['Port über Abfrageparameter', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?port=6543`, false],
    ['Sitzungsoptionen über Abfrageparameter', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?options=-c%20x%3Dy`, false],
    ['sslmode=disable', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=disable`, false],
    ['Session-Pooler (Port 5432)', URLOK, true],
    ['Direktverbindung ohne Portangabe', `postgresql://postgres@db.${DEV_REF}.supabase.co/postgres`, true],
    ['sslmode=require', `postgresql://postgres.${DEV_REF}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`, true]]) {
    try { writeFileSync(calls, ''); } catch {}
    const r = run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: u }, sha);
    ok(soll ? r.status === 0 && called() : r.status === 2 && /ABBRUCH/.test(r.stderr) && !called(), `install_dev.sh ${soll ? 'akzeptiert' : 'lehnt ab'}: ${n}`, (r.stderr || '').split('\n').find((l) => /ABBRUCH/.test(l)) || '');
  }
  // Umgebungsvariablen können Ziel/Port/Optionen/TLS nicht umlenken, ~/.psqlrc wird nicht gelesen
  writeFileSync(calls, '');
  const evil = { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK, PGHOSTADDR: '203.0.113.7', PGHOST: 'evil.example', PGPORT: '6543', PGOPTIONS: '-c session_replication_role=replica', PGSERVICE: 'evil', PGSERVICEFILE: '/tmp/evil', PGSSLMODE: 'disable', PGTARGETSESSIONATTRS: 'any', PSQLRC: '/tmp/evil_psqlrc', PGPASSWORD: 'nur-passwort' };
  const ev = run(evil, sha), envSeen = readFileSync(calls + '.env', 'utf8');
  ok(ev.status === 0 && !/PGHOSTADDR|PGHOST=|PGPORT|PGOPTIONS|PGSERVICE|PGTARGETSESSIONATTRS|PSQLRC/.test(envSeen) && /^PGSSLMODE=require$/m.test(envSeen) && !/^PGPASSWORD=/m.test(envSeen) && /^PGPASSFILE=/m.test(envSeen) && readFileSync(calls + '.pgpass', 'utf8').endsWith(':nur-passwort\n') && / -X /.test(readFileSync(calls, 'utf8')),
    'install_dev.sh: PGHOSTADDR/PGHOST/PGPORT/PGOPTIONS/PGSERVICE/PGSSLMODE/PSQLRC aus der Umgebung erreichen psql nicht, PGSSLMODE=require, PGPASSWORD erreicht psql nur über die private pgpass-Datei, psql -X', envSeen.replace(/\n/g, ' ').slice(0, 120));
  // Datei, deren erste Anweisung nicht begin; ist: Abbruch vor psql (die Referenz könnte sonst außerhalb der Transaktion landen)
  writeFileSync(calls, '');
  const noBegin = INSTALL.replace(/^begin;$/m, '-- begin entfernt'), noBeginFile = join(fake, 'nobegin.sql'); writeFileSync(noBeginFile, noBegin);
  const nb = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), createHash('sha256').update(noBegin).digest('hex')], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: fake + ':' + process.env.PATH, RW_INSTALL_FILE: noBeginFile, RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  ok(nb.status === 2 && /beginnt nicht mit\s+begin;/.test(nb.stderr) && !called(), 'install_dev.sh: Datei ohne einleitendes begin; wird nicht ausgeführt');

  // Transaktions-Pooling simuliert: alles VOR dem einleitenden begin; läuft auf einem Backend, alles ab begin; auf einem ANDEREN (eigener psql-Prozess = eigenes Backend).
  const poolFile = join(fake, 'pool.sql'), poolTxt = adapt(INSTALL); writeFileSync(poolFile, poolTxt); writeFileSync(calls, '');
  const pr = spawnSync('bash', [join(root, 'supabase/dev/install_dev.sh'), createHash('sha256').update(poolTxt).digest('hex')], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: fake + ':' + process.env.PATH, RW_INSTALL_FILE: poolFile, RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK } });
  const stream = readFileSync(calls + '.stdin', 'utf8'), cut = (x) => { const k = x.search(/^begin;$/m); return [x.slice(0, k), x.slice(k)]; };
  const [vorA, abA] = cut(stream);
  const bA1 = await cl.psql(vorA || 'select 1'), bA2 = await cl.psql(abA);
  ok(pr.status === 0 && bA1.code === 0 && bA2.code === 0 && (await tabs()) === '16/18', 'Pooling-Simulation, neuer Wrapper: Teil vor begin auf Backend A, Rest auf Backend B => Referenz, Zielprüfung und Installation trotzdem in EINER Transaktion, Installation gelungen', (bA2.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 90));
  const rbP2 = await RB(); ok(rbP2.code === 0 && (await fp()) === pristine, 'Pooling-Simulation: zurückgesetzt');
  const [vorB, abB] = cut(`set rw.project_ref = '${DEV_REF}';\n` + poolTxt);   // altes Verfahren: Referenz vor der Datei
  const bB1 = await cl.psql(vorB), bB2 = await cl.psql(abB, 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  ok(bB1.code === 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(bB2.err) && (await fp()) === pristine, 'Gegenprobe altes Verfahren (set vor der Datei): auf getrenntem Backend fehlt die Referenz, Abbruch, nichts installiert');

  // lock_timeout: steht direkt nach begin; vor Zielprüfung und vor schema.sql und wirkt
  const stmts = INSTALL.split('\n').filter((l) => l.trim() && !/^\s*--/.test(l));
  ok(stmts[0] === 'begin;' && stmts[1] === "set local lock_timeout = '5s';" && INSTALL.indexOf("set local lock_timeout = '5s';") < INSTALL.indexOf('-- ZIELPRÜFUNG') && INSTALL.indexOf("set local lock_timeout") < INSTALL.indexOf('===== schema.sql ====='), 'install_dev.sql: set local lock_timeout = 5s ist die erste Anweisung nach begin; (vor Zielprüfung und vor der ersten Sperre)');
  const holder2 = cl.psql(`begin;\nlock table auth.users in row exclusive mode;\nselect pg_sleep(9);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const t0 = Date.now(), lk = await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(INSTALL)), dt = Date.now() - t0;
  ok(lk.code !== 0 && /lock timeout/.test(lk.err) && dt < 8000 && (await fp()) === pristine, `lock_timeout wirkt: offene Schreibtransaktion auf auth.users => Installation bricht nach ~5 s mit "lock timeout" ab (${dt} ms), nichts installiert`, (lk.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 90));
  await holder2;
  const nachSperre = await cl.psql(`set rw.project_ref = '${DEV_REF}';\n` + adapt(INSTALL));
  ok(nachSperre.code === 0 && (await tabs()) === '16/18', 'nach Ende der fremden Transaktion: Installation gelingt');

  // =====  NEU (fünfte Runde): Rollback und Cleanup mit demselben Schutz wie die Installation  =====
  const rb5 = await RB(); ok(rb5.code === 0 && (await fp()) === pristine, 'Ausgangszustand für die Rollback-/Cleanup-Wrapper-Tests');
  const runW = (script, env, arg, path = fake) => spawnSync('bash', [join(root, 'supabase/dev', script), ...(arg === undefined ? [] : [arg])], { encoding: 'utf8', env: { PGPASSWORD: PW, PATH: path + ':' + process.env.PATH, ...env } });
  const RBFILE = join(fake, 'rb.sql'), CLFILE = join(fake, 'cl.sql'), rbTxt = adapt(ROLLBACK), clTxt = adapt(CLEAN);
  writeFileSync(RBFILE, rbTxt); writeFileSync(CLFILE, clTxt);
  const shaRb = createHash('sha256').update(rbTxt).digest('hex'), shaCl = createHash('sha256').update(clTxt).digest('hex');
  const BASE_RB = { RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK, RW_ROLLBACK_CONFIRM: 'ja-loeschen', RW_ROLLBACK_FILE: RBFILE, RW_CLEANUP_FILE: CLFILE };
  // Abbrüche vor psql (je Wrapper)
  for (const [script, shaX] of [['rollback_dev.sh', shaRb], ['cleanup_dev.sh', shaCl]]) {
    for (const [n, env, arg, re] of [
      ['ohne RW_PROJECT_REF', { ...BASE_RB, RW_PROJECT_REF: '' }, shaX, /RW_PROJECT_REF ist nicht gesetzt/],
      ['falsche Projektreferenz (Produktion)', { ...BASE_RB, RW_PROJECT_REF: PROD_REF }, shaX, /Produktion ist ausdrücklich ausgeschlossen/],
      ['falsche Projektreferenz (fremd)', { ...BASE_RB, RW_PROJECT_REF: 'abcdefghijklmnopqrst' }, shaX, /weicht von ruinwalk-dev ab/],
      ['ohne Bestätigung', { ...BASE_RB, RW_ROLLBACK_CONFIRM: '' }, shaX, /RW_ROLLBACK_CONFIRM=ja-loeschen fehlt/],
      ['falsche Bestätigung', { ...BASE_RB, RW_ROLLBACK_CONFIRM: 'ja' }, shaX, /RW_ROLLBACK_CONFIRM=ja-loeschen fehlt/],
      ['Transaktions-Pooler (6543)', { ...BASE_RB, RW_DB_URL: URLOK.replace(':5432', ':6543') }, shaX, /nur Port 5432/],
      ['fremder Host', { ...BASE_RB, RW_DB_URL: 'postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }, shaX, /Referenz von ruinwalk-dev nicht/],
      ['ohne Hash', BASE_RB, undefined, /SHA-256 der .* fehlt/],
      ['falscher Hash', BASE_RB, '0'.repeat(64), /weicht vom erwarteten Wert ab/]]) {
      writeFileSync(calls, ''); const r = runW(script, env, arg);
      ok(r.status === 2 && re.test(r.stderr) && !called() && !(r.stdout + r.stderr).includes(PW), `${script} bricht ab (${n}), psql wird nicht aufgerufen`);
    }
  }
  // Erfolgsfall mit Attrappe: Referenz UND Bestätigung als set local direkt nach begin; Umgebung bereinigt; psql -X ohne -1
  for (const [script, shaX, txt] of [['rollback_dev.sh', shaRb, rbTxt], ['cleanup_dev.sh', shaCl, clTxt]]) {
    writeFileSync(calls, '');
    const r = runW(script, { ...BASE_RB, PGHOSTADDR: '203.0.113.7', PGPORT: '6543', PGOPTIONS: '-c session_replication_role=replica', PGSERVICE: 'evil', PSQLRC: '/tmp/evil', PGSSLMODE: 'disable', PGTARGETSESSIONATTRS: 'any' }, shaX);
    const st = readFileSync(calls + '.stdin', 'utf8'), ev = readFileSync(calls + '.env', 'utf8'), args = readFileSync(calls, 'utf8');
    const ins = `begin;\nset local rw.project_ref = '${DEV_REF}';\nset local rw.rollback_confirm = 'ja-loeschen';\n`;
    ok(r.status === 0 && st.includes(ins) && st.replace(`set local rw.project_ref = '${DEV_REF}';\nset local rw.rollback_confirm = 'ja-loeschen';\n`, '') === txt && !/^set rw\./m.test(st)
       && / -X -w -v ON_ERROR_STOP=1 -f -$/m.test(args) && !/ -1( |$)/m.test(args) && !/PGHOSTADDR|PGPORT|PGOPTIONS|PGSERVICE|PGTARGETSESSIONATTRS|PSQLRC/.test(ev) && /^PGSSLMODE=require$/m.test(ev),
       `${script}: Referenz und Bestätigung als set local in der Transaktion, Inhalt sonst unverändert, manipulierte PG-Umgebung erreicht psql nicht, psql -X ohne -1`, ev.replace(/\n/g, ' ').slice(0, 80));
  }
  // lock_timeout: steht in rollback und cleanup direkt nach begin; (vor jeder Sperre), Rollback-Sperrphase 5 s statt 15 s
  for (const [n, txt] of [['rollback_dev.sql', ROLLBACK], ['cleanup_test_accounts.sql', CLEAN]]) {
    const st2 = txt.split('\n').filter((l) => l.trim() && !/^\s*--/.test(l));
    ok(st2[0] === 'begin;' && /set_config\('lock_timeout', '5s', true\)/.test(st2[1]) && txt.indexOf("set_config('lock_timeout'") < txt.indexOf('-- ZIELPRÜFUNG'), `${n}: lock_timeout 5 s ist die erste Anweisung nach begin;`);
  }
  ok(!/lock_timeout = '15s'/.test(ROLLBACK) && /set local lock_timeout = '5s'/.test(ROLLBACK), 'rollback_dev.sql: Sperrphase mit lock_timeout 5 s (vorher 15 s)');

  // echtes psql: Rollback über den Wrapper – falsche Datenbankkennung bricht ab, richtige setzt zurück (ohne CASCADE, siehe statische Prüfung oben)
  const realRb = (file, extra = {}) => { writeFileSync(join(wrapDir, 'w.sql'), file); return runW('rollback_dev.sh', { ...BASE_RB, RW_ROLLBACK_FILE: join(wrapDir, 'w.sql'), ...extra }, createHash('sha256').update(file).digest('hex'), wrapDir); };
  const realCl = (file, extra = {}) => { writeFileSync(join(wrapDir, 'w.sql'), file); return runW('cleanup_dev.sh', { ...BASE_RB, RW_CLEANUP_FILE: join(wrapDir, 'w.sql'), ...extra }, createHash('sha256').update(file).digest('hex'), wrapDir); };
  ok((await tx(T + adapt(INSTALL))).code === 0 && (await tabs()) === '16/18', 'Installation für die Rollback-Wrapper-Tests');
  const rbWrongDb = realRb(ROLLBACK);   // unveränderte Dev-Kennung = falsche Datenbank
  ok(rbWrongDb.status !== 0 && /Datenbankkennung gehört nicht zu ruinwalk-dev/.test(rbWrongDb.stderr) && /FEHLGESCHLAGEN/.test(rbWrongDb.stderr) && (await tabs()) === '16/18', 'rollback_dev.sh mit echtem psql gegen falsche Datenbank: Abbruch durch die Zielprüfung, nichts gelöscht');
  const rbOkW = realRb(rbTxt);
  ok(rbOkW.status === 0 && /der Rollback ohne Fehler abgeschlossen/.test(rbOkW.stderr) && (await fp()) === pristine, 'rollback_dev.sh mit echtem psql: Rollback ohne CASCADE vollständig, Ausgangszustand', (rbOkW.stderr.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 90));

  // Transaktions-Pooling simuliert für den Rollback: Teil vor begin; auf Backend A, Rest auf Backend B
  ok((await tx(T + adapt(INSTALL))).code === 0, 'Installation für die Rollback-Pooling-Simulation');
  writeFileSync(calls, ''); runW('rollback_dev.sh', BASE_RB, shaRb);
  const [rbVor, rbAb] = cut(readFileSync(calls + '.stdin', 'utf8'));
  const pA = await cl.psql(rbVor || 'select 1'), pB = await cl.psql(rbAb);
  ok(pA.code === 0 && pB.code === 0 && (await fp()) === pristine, 'Pooling-Simulation Rollback: Referenz, Bestätigung, Zielprüfung und Löschung trotzdem in EINER Transaktion – Rollback gelungen', (pB.err.split('\n').find((l) => /ERROR/.test(l)) || '').slice(0, 90));
  ok((await tx(T + adapt(INSTALL))).code === 0, 'Installation für die Gegenprobe');
  const [oVor, oAb] = cut(`set rw.project_ref = '${DEV_REF}';\nset rw.rollback_confirm = 'ja-loeschen';\n` + rbTxt);
  const oA = await cl.psql(oVor), oB = await cl.psql(oAb, 'rwi', ['-v', 'ON_ERROR_STOP=0']);
  ok(oA.code === 0 && /ziel: rw.project_ref ist nicht gesetzt/.test(oB.err) && (await tabs()) === '16/18', 'Gegenprobe altes Verfahren (set vor der Datei, getrenntes Backend): Abbruch, nichts gelöscht');

  // Sperrkonflikt beim Rollback: offene Schreibtransaktion auf auth.users => DROP TRIGGER wartet höchstens ~5 s, dann alles zurück
  const holdRb = cl.psql(`begin;\nlock table auth.users in row exclusive mode;\nselect pg_sleep(9);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const t1 = Date.now(), rbLock = realRb(rbTxt), d1 = Date.now() - t1;
  ok(rbLock.status !== 0 && /lock timeout/.test(rbLock.stderr) && d1 < 8000 && (await tabs()) === '16/18' && (await cnt(`select count(*) from pg_trigger where tgname='on_auth_user_created'`)) === 1, `Rollback bei Sperrkonflikt: Abbruch nach ~5 s (${d1} ms), nichts gelöscht`);
  await holdRb;

  // Cleanup: nur vorgesehene Testkonten, auch mit Pooling-Simulation
  const konten = [['dddddddd-0000-4000-8000-000000000001', 't1@rwtest.invalid'], ['dddddddd-0000-4000-8000-000000000002', 't2@rwtest.invalid'], ['dddddddd-0000-4000-8000-000000000003', 'echt2@example.org'], ['dddddddd-0000-4000-8000-000000000004', 'x@rwtest.invalid.example.org'], ['dddddddd-0000-4000-8000-000000000005', 'rwtest.invalid@example.org']];
  for (const [id, mail] of konten) await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('${id}','${mail}','{"username":"Konto${id.slice(-1)}"}', now())`);
  writeFileSync(calls, ''); runW('cleanup_dev.sh', BASE_RB, shaCl);
  const [cVor, cAb] = cut(readFileSync(calls + '.stdin', 'utf8'));
  const cA = await cl.psql(cVor || 'select 1'), cB = await cl.psql(cAb);
  const rest = await q(`select string_agg(email, ',' order by email) from auth.users where id::text like 'dddddddd-%'`);
  ok(cA.code === 0 && cB.code === 0 && rest === 'echt2@example.org,rwtest.invalid@example.org,x@rwtest.invalid.example.org', 'Cleanup (Pooling-Simulation): nur die zwei @rwtest.invalid-Konten gelöscht; echtes Konto und ähnlich aussehende Adressen bleiben', rest);
  // Cleanup bei falscher Datenbankkennung und bei Sperrkonflikt
  await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('dddddddd-0000-4000-8000-000000000006','t3@rwtest.invalid','{"username":"Konto6"}', now())`);
  const clWrong = realCl(CLEAN);
  ok(clWrong.status !== 0 && /Datenbankkennung gehört nicht zu ruinwalk-dev/.test(clWrong.stderr) && (await cnt(`select count(*) from auth.users where email='t3@rwtest.invalid'`)) === 1, 'cleanup_dev.sh gegen falsche Datenbank: Abbruch, kein Konto gelöscht');
  const holdCl = cl.psql(`begin;\nlock table auth.users in share mode;\nselect pg_sleep(9);\ncommit;`);
  await new Promise((r) => setTimeout(r, 1200));
  const t2 = Date.now(), clLock = realCl(clTxt), d2 = Date.now() - t2;
  ok(clLock.status !== 0 && /lock timeout/.test(clLock.stderr) && d2 < 8000 && (await cnt(`select count(*) from auth.users where email='t3@rwtest.invalid'`)) === 1, `Cleanup bei Sperrkonflikt: Abbruch nach ~5 s (${d2} ms), kein Konto gelöscht`);
  await holdCl;
  const clOk = realCl(clTxt);
  ok(clOk.status === 0 && (await cnt(`select count(*) from auth.users where email like '%@rwtest.invalid'`)) === 0 && (await cnt(`select count(*) from auth.users where id::text like 'dddddddd-%'`)) === 3, 'cleanup_dev.sh mit echtem psql: Testkonto gelöscht, die drei anderen bleiben');
  await q(`delete from auth.users where id::text like 'dddddddd-%'`);
  const rbEnd = await RB(); ok(rbEnd.code === 0 && (await fp()) === pristine, 'Ausgangszustand nach den Rollback-/Cleanup-Tests');
  // =====  NEU (sechste Runde): URL nur per Positivliste, genau ein Host, Passwort nur per pgpass an genau den geprüften Host  =====
  // libpq 16 (geprüft): dekodiert %xx in Parameternamen UND -werten, letzter doppelter Parameter gewinnt, & trennt, # ist KEIN Fragment,
  // h1,h2 = mehrere Hosts nacheinander, POSTGRESQL:// ist keine URL. Deshalb wird jede Abweichung von der exakten Form abgelehnt.
  const R = DEV_REF, POOL = 'aws-0-eu-central-1.pooler.supabase.com', DIR6 = `postgresql://postgres@db.${R}.supabase.co`, POOLU = `postgresql://postgres.${R}@${POOL}`;
  const urlFaelle = [
    ['kodierter Port ?%70ort=6543', `${DIR6}:5432/postgres?%70ort=6543`, 'Z'],
    ['kodierter Port ?p%6Frt=6543', `${POOLU}:5432/postgres?p%6Frt=6543`, 'Z'],
    ['kodierter Host ?%68ost=', `${DIR6}/postgres?%68ost=evil.example`, 'Z'],
    ['kodierter Hostaddr ?h%6Fstaddr=', `${DIR6}/postgres?h%6Fstaddr=203.0.113.7`, 'Z'],
    ['kodierter TLS-Wert sslmode=disab%6Ce', `${DIR6}/postgres?sslmode=disab%6Ce`, 'Z'],
    ['kodierter TLS-Name ss%6Cmode=disable', `${DIR6}/postgres?ss%6Cmode=disable`, 'Z'],
    ['kodierte Optionen ?%6Fptions=', `${DIR6}/postgres?%6Fptions=-c%20x%3Dy`, 'Z'],
    ['kodierter Punkt im Host', `postgresql://postgres@db%2E${R}.supabase.co/postgres`, 'Z'],
    ['kodierter Socket-Pfad als Host', `postgresql://postgres@%2Ftmp/postgres`, 'Z'],
    ['kodierte Datenbank mit ?port', `${DIR6}/postgres%3Fport%3D6543`, 'Z'],
    ['mehrere Hosts (fremder zuerst)', `postgresql://postgres.${R}@evil.example,${POOL}/postgres`, 'Z'],
    ['mehrere Hosts mit Ports (fremder zuerst)', `postgresql://postgres.${R}@evil.example:5432,${POOL}:5432/postgres`, 'Z'],
    ['mehrere Hosts (Dev zuerst, fremder danach)', `postgresql://postgres@db.${R}.supabase.co,evil.example/postgres`, 'Z'],
    ['IPv6-Klammernotation', 'postgresql://postgres@[::1]:5432/postgres', 'Z'],
    ['zusätzlicher Parameter mit &', `${DIR6}/postgres?sslmode=require&port=6543`, 'Z'],
    ['doppelter Parameter', `${DIR6}/postgres?sslmode=require&sslmode=disable`, 'Z'],
    ['zweites ? im Abfrageteil', `${DIR6}/postgres?sslmode=require?port=6543`, 'A'],
    ['leerer Abfrageteil ?', `${DIR6}/postgres?`, 'A'],
    ['leerer Parameter ?&', `${DIR6}/postgres?&`, 'Z'],
    ['Parameter ohne Wert', `${DIR6}/postgres?sslmode`, 'A'],
    ['Parameter mit leerem Wert', `${DIR6}/postgres?sslmode=`, 'A'],
    ['zusätzlicher Parameter application_name', `${DIR6}/postgres?application_name=x`, 'Z'],
    ['zusätzlicher Parameter target_session_attrs', `${DIR6}/postgres?target_session_attrs=any`, 'Z'],
    ['Großschreibung SSLMODE', `${DIR6}/postgres?SSLMODE=require`, 'Z'],
    ['Großschreibung im Schema', `POSTGRESQL://postgres@db.${R}.supabase.co/postgres`, 'Z'],
    ['Großschreibung im Host', `postgresql://postgres@DB.${R}.supabase.co/postgres`, 'Z'],
    ['ungültiger TLS-Modus disable', `${DIR6}/postgres?sslmode=disable`, 'A'],
    ['ungültiger TLS-Modus allow', `${DIR6}/postgres?sslmode=allow`, 'A'],
    ['ungültiger TLS-Modus prefer', `${DIR6}/postgres?sslmode=prefer`, 'A'],
    ['ungültiger TLS-Modus Verify-Full', `${DIR6}/postgres?sslmode=Verify-Full`, 'Z'],
    ['ungültiger TLS-Modus verify_full', `${DIR6}/postgres?sslmode=verify_full`, 'Z'],
    ['URL-Fragment #x', `${DIR6}/postgres#x`, 'Z'],
    ['URL-Fragment mit Port #?port=6543', `${DIR6}/postgres#?port=6543`, 'Z'],
    ['Passwort in der URL', `postgresql://postgres:geheim@db.${R}.supabase.co/postgres`, 'P'],
    ['leeres Passwort in der URL', `postgresql://postgres:@db.${R}.supabase.co/postgres`, 'P'],
    ['zwei @ (Userinfo mit fremdem Host)', `postgresql://postgres@evil.example@db.${R}.supabase.co/postgres`, 'F'],
    ['leere Userinfo', `postgresql://@db.${R}.supabase.co/postgres`, 'F'],
    ['ohne Userinfo', `postgresql://db.${R}.supabase.co/postgres`, 'F'],
    ['fremder Benutzer am Dev-Host', `postgresql://evil@db.${R}.supabase.co/postgres`, 'H'],
    ['Pooler-Benutzer am Direkt-Host', `postgresql://postgres.${R}@db.${R}.supabase.co/postgres`, 'H'],
    ['Direkt-Benutzer am Pooler', `postgresql://postgres@${POOL}/postgres`, 'H'],
    ['leerer Port host:', `${DIR6}:/postgres`, 'O'],
    ['Port 05432', `${DIR6}:05432/postgres`, 'O'],
    ['Port 6543 (Transaktions-Pooler)', `${POOLU}:6543/postgres`, 'O'],
    ['Port 15432', `${DIR6}:15432/postgres`, 'O'],
    ['zwei Ports', `${DIR6}:5432:6543/postgres`, 'F'],
    ['Host mit Schlusspunkt', `postgresql://postgres@db.${R}.supabase.co./postgres`, 'H'],
    ['fremde Domain hinter Dev-Host', `postgresql://postgres@db.${R}.supabase.co.evil.com/postgres`, 'H'],
    ['fremde Domain hinter Pooler', `postgresql://postgres.${R}@${POOL}.evil.com/postgres`, 'H'],
    ['Pooler unter fremder Endung (.co)', `postgresql://postgres.${R}@aws-0-eu-central-1.pooler.supabase.co/postgres`, 'H'],
    ['Pooler mit fremdem Präfix', `postgresql://postgres.${R}@evil.pooler.supabase.com/postgres`, 'H'],
    ['IP-Adresse statt Host', `postgresql://postgres@203.0.113.7:5432/postgres`, 'H'],
    ['Backslash im Host', `postgresql://postgres@db\\.${R}.supabase.co/postgres`, 'Z'],
    ['Leerzeichen', `${DIR6}/postgres port=6543`, 'Z'],
    ['Zeilenumbruch', `${DIR6}/postgres\nport=6543`, 'Z'],
    ['Tabulator', `${DIR6}/postgres\tport=6543`, 'Z'],
    ['doppelter Schrägstrich', `postgresql://postgres@db.${R}.supabase.co//postgres`, 'E'],
    ['andere Datenbank', `${DIR6}/template1`, 'E'],
    ['ohne Datenbank', DIR6, 'E'],
    ['Schema ohne //', `postgresql:postgres@db.${R}.supabase.co/postgres`, 'F'],
    ['Schlüssel-Wert-Form', `host=db.${R}.supabase.co port=5432 user=postgres dbname=postgres`, 'Z']];
  const GRUND = { Z: /unzulässige Zeichen/, A: /als Abfrageteil ist nur/, P: /Passwort gehört nicht in RW_DB_URL/, F: /keine URL der Form/, H: /nennt die Referenz von ruinwalk-dev nicht/, O: /nur Port 5432/, E: /nicht exakt der erlaubten Form/ };
  for (const [n, u, g] of urlFaelle) {
    const erg = [];
    for (const script of ['install_dev.sh', 'rollback_dev.sh', 'cleanup_dev.sh']) {
      try { writeFileSync(calls, ''); } catch {}
      const r = script === 'install_dev.sh' ? run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: u }, sha) : runW(script, { ...BASE_RB, RW_DB_URL: u }, script === 'rollback_dev.sh' ? shaRb : shaCl);
      erg.push(r.status === 2 && GRUND[g].test(r.stderr) && !called() && !(r.stdout + r.stderr).includes(PW) && !(r.stdout + r.stderr).includes(u));
    }
    ok(erg.every(Boolean), `URL abgelehnt von install/rollback/cleanup (Grund ${g}), psql nicht aufgerufen: ${n}`);
  }
  // Zulässige Formen: werden akzeptiert, pgpass ist an GENAU diesen Host/Benutzer gebunden
  for (const [n, u, host, user] of [
    ['direkt mit Port', `${DIR6}:5432/postgres`, `db.${R}.supabase.co`, 'postgres'],
    ['direkt ohne Port, Schema postgres://', `postgres://postgres@db.${R}.supabase.co/postgres`, `db.${R}.supabase.co`, 'postgres'],
    ['direkt mit sslmode=verify-full', `${DIR6}/postgres?sslmode=verify-full`, `db.${R}.supabase.co`, 'postgres'],
    ['direkt mit sslmode=verify-ca', `${DIR6}/postgres?sslmode=verify-ca`, `db.${R}.supabase.co`, 'postgres'],
    ['Session-Pooler mit sslmode=require', `${POOLU}:5432/postgres?sslmode=require`, POOL, `postgres.${R}`],
    ['Session-Pooler andere Region (aws-1-us-east-1)', `postgresql://postgres.${R}@aws-1-us-east-1.pooler.supabase.com/postgres`, 'aws-1-us-east-1.pooler.supabase.com', `postgres.${R}`]]) {
    for (const script of ['install_dev.sh', 'rollback_dev.sh', 'cleanup_dev.sh']) {
      writeFileSync(calls, ''); for (const x of ['.pgpass', '.pgpassmode', '.pgpasspath']) writeFileSync(calls + x, '');
      const r = script === 'install_dev.sh' ? run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: u }, sha) : runW(script, { ...BASE_RB, RW_DB_URL: u }, script === 'rollback_dev.sh' ? shaRb : shaCl);
      const args = readFileSync(calls, 'utf8'), envS = readFileSync(calls + '.env', 'utf8'), pp = readFileSync(calls + '.pgpasspath', 'utf8').trim();
      ok(r.status === 0 && called() && readFileSync(calls + '.pgpass', 'utf8') === `${host}:5432:postgres:${user}:${PW_PGPASS}\n` && readFileSync(calls + '.pgpassmode', 'utf8').trim() === '600'
        && !/^PGPASSWORD=/m.test(envS) && !args.includes(PW) && !args.includes('doppelpunkt') && pp !== '' && !existsSync(pp) && !(r.stdout + r.stderr).includes(PW),
        `${script} akzeptiert ${n}: pgpass (600) nur für ${host}/${user}, kein PGPASSWORD und kein Passwort in den psql-Argumenten, pgpass danach gelöscht`);
    }
  }
  // Passwortpflicht und -prüfung
  for (const [n, env, re] of [['ohne PGPASSWORD', { PGPASSWORD: '' }, /PGPASSWORD ist nicht gesetzt/], ['PGPASSWORD mit Zeilenumbruch', { PGPASSWORD: 'a\nb' }, /Steuerzeichen/]]) {
    const erg = [];
    for (const script of ['install_dev.sh', 'rollback_dev.sh', 'cleanup_dev.sh']) {
      writeFileSync(calls, '');
      const r = script === 'install_dev.sh' ? run({ RW_PROJECT_REF: DEV_REF, RW_DB_URL: URLOK, ...env }, sha) : runW(script, { ...BASE_RB, ...env }, script === 'rollback_dev.sh' ? shaRb : shaCl);
      erg.push(r.status === 2 && re.test(r.stderr) && !called());
    }
    ok(erg.every(Boolean), `alle drei Wrapper brechen ab (${n}), psql wird nicht aufgerufen`);
  }
  // Echte libpq: ein Lausch-Server fordert ein Klartext-Passwort an und zeichnet auf, was ankommt
  const lauscher = () => new Promise((res) => { const got = []; const srv = net.createServer((sock) => { let buf = Buffer.alloc(0), phase = 0;
    sock.on('error', () => {}); sock.on('data', (d) => { buf = Buffer.concat([buf, d]);
      for (;;) {
        if (phase === 0) { if (buf.length < 8) return; const len = buf.readInt32BE(0); if (buf.length < len) return; const code = buf.readInt32BE(4); buf = buf.subarray(len);
          if (code === 80877103 || code === 80877104) { sock.write('N'); continue; }
          phase = 1; const m = Buffer.alloc(9); m.write('R', 0); m.writeInt32BE(8, 1); m.writeInt32BE(3, 5); sock.write(m); continue; }
        if (buf.length < 5) return; const t = String.fromCharCode(buf[0]), len = buf.readInt32BE(1); if (buf.length < 1 + len) return;
        if (t === 'p') got.push(buf.subarray(5, len).toString()); buf = buf.subarray(1 + len); sock.end(); return; } }); });
    srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, got, close: () => srv.close() })); });
  const psqlA = (args, env) => new Promise((res) => { const p = spawn(`${cl.BIN}/psql`, ['-w', ...args], { env: { PATH: process.env.PATH, PGCONNECT_TIMEOUT: '3', ...env } }); let e = ''; p.stderr.on('data', (d) => { e += d; }); p.stdout.resume(); p.stdin.end(); p.on('close', (c) => res({ code: c, err: e })); });
  const pgp = (zeile) => { const f = join(mkdtempSync(join(tmpdir(), 'rwpgp-')), 'pgpass'); writeFileSync(f, zeile, { mode: 0o600 }); return f; };
  {
    const L = await lauscher();
    const g = await psqlA(['-X', '-c', 'select 1', `postgresql://postgres@127.0.0.1:${L.port}/postgres?sslmode=disable`], { PGPASSFILE: pgp(`127.0.0.1:${L.port}:postgres:postgres:${PW_PGPASS}\n`) });
    ok(L.got.length === 1 && L.got[0] === PW, 'Gegenprobe: pgpass für genau diesen Host - der Lausch-Server erhält das Passwort (Lauscher und Maskierung funktionieren)', L.got.join('|') + ' ' + g.err.trim().slice(0, 60));
    L.got.length = 0;
    const h = await psqlA(['-X', '-c', 'select 1', `postgresql://postgres@127.0.0.1:${L.port}/postgres?sslmode=disable`], { PGPASSFILE: pgp(`db.${R}.supabase.co:5432:postgres:postgres:${PW_PGPASS}\n`) });
    ok(L.got.length === 0 && h.code !== 0 && /no password supplied/.test(h.err), 'pgpass an den Dev-Host gebunden: ein anderer Host erhält das Passwort NICHT (libpq gibt es nicht heraus)', h.err.trim().slice(0, 80));
    const m = await psqlA(['-X', '-c', 'select 1', `postgresql://postgres@127.0.0.1:${L.port},db.${R}.supabase.invalid:5432/postgres?sslmode=disable`], { PGPASSFILE: pgp(`db.${R}.supabase.invalid:5432:postgres:postgres:${PW_PGPASS}\n`) });
    ok(L.got.length === 0 && m.code !== 0, 'Mehrfach-Host direkt an libpq (fremder Host zuerst): der fremde Host erhält das Passwort nicht', m.err.trim().split('\n')[0].slice(0, 80));
    // Ende-zu-Ende über den Wrapper: selbst wenn psql auf einen fremden Host umgelenkt würde, kennt die pgpass-Datei nur den geprüften Host
    const umlenk = mkdtempSync(join(tmpdir(), 'rwumlenk-'));
    writeFileSync(join(umlenk, 'psql'), `#!/usr/bin/env bash\nshift\nexec ${cl.BIN}/psql "postgresql://postgres@127.0.0.1:${L.port}/postgres?sslmode=disable" "$@"\n`, { mode: 0o755 });
    const w = await new Promise((res) => { const p = spawn('bash', [join(root, 'supabase/dev/install_dev.sh'), sha], { env: { PGPASSWORD: PW, PGCONNECT_TIMEOUT: '3', PATH: umlenk + ':' + process.env.PATH, RW_INSTALL_FILE: instFile, RW_PROJECT_REF: DEV_REF, RW_DB_URL: `${DIR6}:5432/postgres` } });
      let e = ''; p.stderr.on('data', (d) => { e += d; }); p.stdout.resume(); p.on('close', (c) => res({ code: c, err: e })); });
    ok(L.got.length === 0 && w.code === 2 && /no password supplied/.test(w.err) && /FEHLGESCHLAGEN/.test(w.err) && !w.err.includes(PW), 'Wrapper mit auf fremden Host umgelenktem psql: kein Passwort und auch keine SQL-Zeile als Passwortersatz beim fremden Host (psql -w), Abbruch als FEHLGESCHLAGEN', w.err.trim().split('\n').slice(-1)[0].slice(0, 80));
    L.close();
  }
  const rbF = await RB(); ok(rbF.code === 0 && (await fp()) === pristine, 'Aufräumen: Rollback, Ausgangszustand');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
