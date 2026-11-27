// Quest-System Paket 2 (docs/QUEST_PAKET2_BERICHT.md): Sperrreihenfolge von public.quest_state gegen Speichern und Löschen (B-4/B-6),
// Wettlauf beim Anlegen der Rotation und Gleichwertigkeit von migration_q1/rollback_q1 mit supabase/schema.sql.
// Lokales PostgreSQL mit Attrappe der Supabase-Rollen (prod-env.mjs: schema.sql + rwi 01–05). NICHT ECHT: kein GoTrue, kein PostgREST.
// Haltepunkte nur in der Testdatenbank (Schema testhook): eine Sitzung hält ihre Sperren an einem Tor, bis der Test es öffnet.
import { setup, counter, STUB, SCHEMA } from './prod-env.mjs';
import { startCluster } from './pg.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = +(process.env.PORT || 54791);
const MIX = +(process.env.Q_MIX || 40);
const { ok, done } = counter();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const E = await setup(PORT); const { q, cl } = E;
const dl = (r) => /deadlock detected/.test(r.err || '');
const line = (r) => ((r.err || r.out || '').split('\n').find((l) => /ERROR/.test(l)) || (r.err || r.out || '')).slice(0, 140);
const S = (name, body, o = {}) => cl.psql([`set application_name = '${name}';`, `set statement_timeout = '40s';`,
  o.role ? `set role ${o.role}; set search_path = "$user", public;` : '', o.claims ? `set request.jwt.claims = '${JSON.stringify(o.claims)}';` : '', body].join('\n'));
const user = (a, extra = {}) => ({ role: 'authenticated', claims: { sub: a.id, role: 'authenticated', ...extra } });
const state = async (name) => q(`select coalesce(string_agg(coalesce(wait_event_type,'') || ':' || coalesce(wait_event,'') || ':' || state, ','),'') from pg_stat_activity where application_name = '${name}'`);
const waitState = async (name, re, ms = 15000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await state(name); if (re.test(s)) return s; await sleep(40); } throw new Error(`Zeitüberschreitung: ${name} erreicht ${re} nicht (zuletzt ${s})`); };
const LOCKROW = /Lock:(tuple|transactionid)/, GATE = /Lock:advisory/;
let gk = 700000, nacc = 0;
await q(`create schema testhook; grant usage on schema testhook to public;
create function testhook.gate(k bigint) returns void language plpgsql as $$ begin perform pg_advisory_lock_shared(k); perform pg_advisory_unlock_shared(k); end $$;
grant execute on all functions in schema testhook to public;`);
// Tor: hält eine exklusive Beratungssperre; Sitzungen, die testhook.gate(k) aufrufen, warten dort (mit allen bis dahin genommenen Sperren)
const gate = async () => { const k = ++gk; const p = cl.psql(`set application_name = 'GATE${k}'; select pg_advisory_lock(${k}); select pg_sleep(600);`);
  const t0 = Date.now(); while (+(await q(`select count(*) from pg_locks where locktype='advisory' and objid=${k} and granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('Tor nicht gesetzt'); await sleep(30); }
  return { k, open: async () => { await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'GATE${k}'`); await p; } }; };
const acc = async (n = 1) => { const a = await E.account(`qsp${++nacc}`, n);
  for (const c of a.chars) await q(`insert into public.character_confirmed(character_id, level, zaehler) values ('${c}', 30, '{"kills":5}');
    insert into public.character_quests(character_id, quest_key, inst_key, version) values ('${c}', 'st:test.1', 'einmalig', 1);
    insert into public.quest_rewards(character_id, quest_key, inst_key, belohnung) values ('${c}', 'st:test.1', 'einmalig', '{"xp":1}');`);
  return a; };
const session = async (a) => { const sid = await q(`select gen_random_uuid()`); await q(`insert into auth.sessions(id,user_id,created_at) values ('${sid}','${a.id}', now()); insert into auth.mfa_amr_claims(session_id,authentication_method,created_at) values ('${sid}','password', now())`); return sid; };
const QS = (a, c) => `select public.quest_state('${c}')`;
const leftovers = async (a) => +(await q(`select (select count(*) from public.character_quests q where not exists (select 1 from public.characters c where c.character_id = q.character_id))
  + (select count(*) from public.quest_rewards r where not exists (select 1 from public.characters c where c.character_id = r.character_id))
  + (select count(*) from public.character_confirmed f where not exists (select 1 from public.characters c where c.character_id = f.character_id))`));
const scen = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name}: Ablauf`, e.message.slice(0, 160)); } };

// Testkatalog (keine Spielinhalte): Story-Vorlage für Questzeilen, Tagesvorlagen für die Rotation
await q(`insert into public.quest_defs(quest_key,version,bereich,ziele) values ('st:test.1',1,'story','[{"typ":"kills","basis":1}]'),
  ('tg:test_a',1,'tag','[{"typ":"kills","basis":5}]'),('tg:test_b',1,'tag','[{"typ":"kills","basis":5}]'),('tg:test_c',1,'tag','[{"typ":"kills","basis":5}]'),('tg:test_d',1,'tag','[{"typ":"kills","basis":5}]');
  insert into public.quest_pools(periode_typ,quest_key,version,gewicht) values ('tag','tg:test_a',1,1),('tag','tg:test_b',1,2),('tag','tg:test_c',1,3),('tag','tg:test_d',1,4);`);

// QS-1/QS-2: quest_state ∥ delete_account (Profil exklusiv), beide Reihenfolgen
await scen('QS-1', async () => { const A = await acc(1), g = await gate(), sid = await session(A);
  const H = S('QS', `begin; ${QS(A, A.chars[0])}; select testhook.gate(${g.k}); commit;`, user(A)); await waitState('QS', GATE);
  const D = S('DA', `select public.delete_account('${A.name}')`, user(A, { session_id: sid })); const ws = await waitState('DA', LOCKROW);
  await g.open(); const [rh, rd] = await Promise.all([H, D]);
  ok(!dl(rh) && !dl(rd) && rh.code === 0 && rd.code === 0 && (await q(`select count(*) from public.profiles where account_id='${A.id}'`)) === '0' && (await leftovers()) === 0,
     `QS-1: quest_state hält Profil (key share) und Charakter ∥ delete_account – Löschung wartet am Profil (${ws}), 0 × 40P01, Questdaten mit dem Konto entfernt`, `${line(rh)} | ${line(rd)}`); });
await scen('QS-2', async () => { const A = await acc(1), g = await gate(), sid = await session(A);
  const D = S('DA', `begin; select public.delete_account('${A.name}'); select testhook.gate(${g.k}); commit;`, user(A, { session_id: sid })); await waitState('DA', GATE);
  const H = S('QS', QS(A, A.chars[0]), user(A)); const ws = await waitState('QS', LOCKROW);
  await g.open(); const [rd, rh] = await Promise.all([D, H]);
  ok(!dl(rh) && !dl(rd) && rd.code === 0 && /not_found/.test(rh.err) && (await leftovers()) === 0,
     `QS-2: delete_account hält Profil (exklusiv) ∥ quest_state – quest_state wartet am Profil (${ws}), danach not_found, 0 × 40P01`, `${line(rd)} | ${line(rh)}`); });
// QS-3/QS-4: quest_state ∥ save_character (Profil key share -> Charakter for update), beide Reihenfolgen
await scen('QS-3', async () => { const A = await acc(1), g = await gate(); const v = await q(`select version from public.characters where character_id='${A.chars[0]}'`);
  const H = S('QS', `begin; ${QS(A, A.chars[0])}; select testhook.gate(${g.k}); commit;`, user(A)); await waitState('QS', GATE);
  const W = S('SC', `select public.save_character('${A.chars[0]}', ${v}, '{"lv":31}')`, user(A)); const ws = await waitState('SC', LOCKROW);
  await g.open(); const [rh, rw] = await Promise.all([H, W]);
  ok(!dl(rh) && !dl(rw) && rh.code === 0 && rw.code === 0 && (await q(`select level from public.characters where character_id='${A.chars[0]}'`)) === '31',
     `QS-3: quest_state hält Charakter (key share) ∥ save_character – Speichern wartet kurz (${ws}) und gelingt, 0 × 40P01`, `${line(rh)} | ${line(rw)}`); });
await scen('QS-4', async () => { const A = await acc(1), g = await gate(); const v = await q(`select version from public.characters where character_id='${A.chars[0]}'`);
  const W = S('SC', `begin; select public.save_character('${A.chars[0]}', ${v}, '{"lv":32}'); select testhook.gate(${g.k}); commit;`, user(A)); await waitState('SC', GATE);
  const H = S('QS', QS(A, A.chars[0]), user(A)); const ws = await waitState('QS', LOCKROW);
  await g.open(); const [rw, rh] = await Promise.all([W, H]);
  const st = rh.code === 0 ? JSON.parse(rh.out.split('\n').pop()) : null;
  ok(!dl(rh) && !dl(rw) && rw.code === 0 && st && st.stufe === 4 && st.bestaetigt.level === 30,
     `QS-4: save_character hält Charakter (for update) ∥ quest_state – quest_state wartet (${ws}), Stufe bleibt aus dem bestätigten Level (30 -> 4), nicht aus dem gespeicherten lv 32`, `${line(rw)} | ${line(rh)}`); });
// QS-5/QS-6: quest_state ∥ delete_character (Profil key share -> Charakter -> Beratungssperre -> Löschen, B-2/B-5), beide Reihenfolgen
await scen('QS-5', async () => { const A = await acc(1), g = await gate();
  const H = S('QS', `begin; ${QS(A, A.chars[0])}; select testhook.gate(${g.k}); commit;`, user(A)); await waitState('QS', GATE);
  const D = S('DC', `select public.delete_character('${A.chars[0]}')`, user(A)); const ws = await waitState('DC', LOCKROW);
  await g.open(); const [rh, rd] = await Promise.all([H, D]);
  ok(!dl(rh) && !dl(rd) && rh.code === 0 && rd.code === 0 && (await leftovers()) === 0,
     `QS-5: quest_state hält Charakter ∥ delete_character – Löschung wartet an der Charakterzeile (${ws}), danach Questdaten per Kaskade entfernt, 0 × 40P01`, `${line(rh)} | ${line(rd)}`); });
await scen('QS-6', async () => { const A = await acc(1), g = await gate();
  const D = S('DC', `begin; select public.delete_character('${A.chars[0]}'); select testhook.gate(${g.k}); commit;`, user(A)); await waitState('DC', GATE);
  const H = S('QS', QS(A, A.chars[0]), user(A)); const ws = await waitState('QS', LOCKROW);
  await g.open(); const [rd, rh] = await Promise.all([D, H]);
  ok(!dl(rh) && !dl(rd) && rd.code === 0 && /not_found/.test(rh.err) && (await leftovers()) === 0,
     `QS-6: delete_character hält Charakter ∥ quest_state – quest_state wartet (${ws}), danach not_found, 0 × 40P01`, `${line(rd)} | ${line(rh)}`); });
// QS-7: mehrzeiliges DELETE (B-6, Übergangstabelle + sortierte Beratungssperren) hält ∥ quest_state auf einem der Charaktere
await scen('QS-7', async () => { const A = await acc(2), g = await gate();
  const D = S('MD', `begin; delete from public.characters where character_id in ('${A.chars[0]}','${A.chars[1]}'); select testhook.gate(${g.k}); commit;`); await waitState('MD', GATE);
  const H = S('QS', QS(A, A.chars[1]), user(A)); const ws = await waitState('QS', LOCKROW);
  await g.open(); const [rd, rh] = await Promise.all([D, H]);
  ok(!dl(rh) && !dl(rd) && rd.code === 0 && /not_found/.test(rh.err) && (await leftovers()) === 0,
     `QS-7: Mehrzeilen-DELETE auf characters (B-6) ∥ quest_state – quest_state wartet (${ws}), danach not_found; Kaskade entfernt Questdaten, 0 × 40P01`, `${line(rd)} | ${line(rh)}`); });
// QS-8: Rotation gleichzeitig anlegen (zwei Sitzungen, gleiche neue Periode) – genau eine Zeile, gleiche Auswahl; nach Abbruch der ersten legt die zweite an
await scen('QS-8', async () => { const g = await gate(), d = '2032-06-01';
  const R1 = S('R1', `begin; select public.quest_rotation_sichern('tag','${d}'); select testhook.gate(${g.k}); commit;`); await waitState('R1', GATE);
  const R2 = S('R2', `select public.quest_rotation_sichern('tag','${d}')`); const ws = await waitState('R2', LOCKROW);
  await g.open(); const [r1, r2] = await Promise.all([R1, R2]);
  const n = await q(`select count(*) from public.quest_rotation where periode_typ='tag' and periode_datum='${d}'`);
  const same = await q(`select (select quest_keys from public.quest_rotation where periode_typ='tag' and periode_datum='${d}') = (select array_agg(quest_key order by o) from public.quest_rotation_wahl('tag','${d}') with ordinality w(quest_key,version,o))`);
  ok(r1.code === 0 && r2.code === 0 && n === '1' && same === 't', `QS-8: gleichzeitiges Anlegen der Rotation – zweite Sitzung wartet am Schlüssel (${ws}) und ändert nichts; genau 1 Zeile = deterministische Auswahl`, `${line(r1)} | ${line(r2)} | n=${n}`);
  const g2 = await gate(), d2 = '2032-06-03';
  const A1 = S('R3', `begin; select public.quest_rotation_sichern('tag','${d2}'); select testhook.gate(${g2.k}); rollback;`); await waitState('R3', GATE);
  const A2 = S('R4', `select public.quest_rotation_sichern('tag','${d2}')`); await waitState('R4', LOCKROW);
  await g2.open(); await Promise.all([A1, A2]);
  ok((await q(`select count(*) from public.quest_rotation where periode_typ='tag' and periode_datum='${d2}'`)) === '1', 'QS-8b: bricht die erste Sitzung ab, legt die wartende Sitzung die Rotation an (genau 1 Zeile)'); });
// QS-9: Mischlast ohne Tor – quest_state, save_character, delete_character, delete_account gleichzeitig
await scen('QS-9', async () => { let n40 = 0, bad = 0;
  for (let i = 0; i < MIX; i++) { const A = await acc(2), sid = await session(A); const v = await q(`select version from public.characters where character_id='${A.chars[0]}'`);
    const set = (a) => `set role authenticated; set search_path = "$user", public; set request.jwt.claims = '${JSON.stringify(a)}';`;
    const rs = await E.parallel([
      `${set({ sub: A.id, role: 'authenticated' })} ${QS(A, A.chars[0])}`,
      `${set({ sub: A.id, role: 'authenticated' })} ${QS(A, A.chars[1])}`,
      `${set({ sub: A.id, role: 'authenticated' })} select public.save_character('${A.chars[0]}', ${v}, '{"lv":33}')`,
      i % 2 ? `${set({ sub: A.id, role: 'authenticated' })} select public.delete_character('${A.chars[1]}')` : `${set({ sub: A.id, role: 'authenticated', session_id: sid })} select public.delete_account('${A.name}')`], 300);
    n40 += rs.filter(dl).length; bad += rs.filter((r) => r.code && !/not_found|version_conflict/.test(r.err)).length; }
  ok(n40 === 0 && bad === 0 && (await leftovers()) === 0, `QS-9: Mischlast (${MIX} Runden: 2 × quest_state ∥ save_character ∥ delete_character/delete_account) – 0 × 40P01, nur erwartete Meldungen, keine verwaisten Questdaten`, `40P01=${n40} andere=${bad}`); });

// QS-10: Migration Q1 und Rollback Q1 entsprechen schema.sql (Katalogvergleich; altes Schema = schema.sql ohne den Q1-Teil)
const MIG = readFileSync(join(ROOT, 'supabase/migration_q1_quest_grundlage.sql'), 'utf8'), RB = readFileSync(join(ROOT, 'supabase/rollback_q1_quest_grundlage.sql'), 'utf8');
const altesSchema = () => {
  const a = SCHEMA.indexOf('------------------------------------------------------------------------------------------------\n-- Quests – Paket 2'), b = SCHEMA.indexOf('------------------------------------------------------------------------------------------------\n-- Rechte: erst alles entziehen');
  const c = SCHEMA.indexOf('-- Quests (Paket 2): Katalog lesbar'), d = SCHEMA.indexOf('grant execute on function public.create_character');
  if ([a, b, c, d].some((x) => x < 0) || !(a < b && b < c && c < d)) throw new Error('Q1-Abschnitte in schema.sql nicht gefunden');
  const OLD = (SCHEMA.slice(0, a) + SCHEMA.slice(b, c) + SCHEMA.slice(d)).split('\n')
    .filter((l) => !/^alter table public\.(quest_\w+|npc_\w+|character_confirmed|character_quests) +enable row level security;$/.test(l) && !/^grant execute on function public\.quest_state\(uuid\)/.test(l) && !/^revoke truncate on public\.quest_defs/.test(l) && !/^-- Quests: TRUNCATE umginge/.test(l)).join('\n');
  return OLD; };
// Katalog-Fingerabdruck des Schemas public (Tabellen, Spalten, Constraints, Indizes, Trigger, Policies, Funktionen, Rechte)
const FP = `select md5(string_agg(x, E'\\n' order by x)) from (
      select 'rel ' || c.relname || ' ' || c.relkind::text || ' rls=' || c.relrowsecurity || ' ' || coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '') || ':' || a.attgenerated::text, ',' order by a.attnum)
               from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')
             || ' acl=' || coalesce((select string_agg(g.grantee::regrole::text || ':' || g.privilege_type, ',' order by 1) from aclexplode(c.relacl) g), '') as x
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S','i')
      union all select 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
      union all select 'idx ' || indexrelid::regclass || ' ' || pg_get_indexdef(indexrelid) from pg_index where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      union all select 'trg ' || pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      union all select 'pol ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') from pg_policies where schemaname = 'public'
      union all select 'fn ' || p.oid::regprocedure || ' ' || md5(concat_ws('|', p.prosecdef, p.provolatile, p.proisstrict, p.prorettype::regtype::text, coalesce(p.proconfig::text, ''), p.prosrc))
             || ' acl=' || coalesce((select string_agg(case when g.grantee = 0 then 'PUBLIC' else g.grantee::regrole::text end || ':' || g.privilege_type, ',' order by 1) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g), '')
        from pg_proc p where p.pronamespace = 'public'::regnamespace) s`;
await scen('QS-10', async () => {
  const OLD = altesSchema();
  ok(!/quest_|npc_|character_confirmed/.test(OLD), 'QS-10: altes Schema (ohne Q1) enthält keine Quest-Objekte mehr', '');
  for (const legacy of [false, true]) {
    // getrennte Cluster für altes und neues Schema (die Attrappe legt globale Rollen an)
    const CA = await startCluster(PORT + (legacy ? 3 : 1)), CN = await startCluster(PORT + (legacy ? 4 : 2));
    const run = async (C, s) => { const x = await C.psql(s); if (x.code) throw new Error(x.err.slice(0, 300)); return x.out; };
    try {
      for (const C of [CA, CN]) await run(C, (legacy ? '\\set legacy 1\n' : '') + STUB);
      await run(CN, SCHEMA); await run(CA, OLD);
      const fpOld = await run(CA, FP);
      await run(CA, MIG); const fpMig = await run(CA, FP), fpNew = await run(CN, FP);
      ok(fpMig === fpNew, `QS-10: ${legacy ? 'legacy' : 'neu'} – altes Schema + migration_q1 = schema.sql (Tabellen, Spalten, Constraints, Indizes, Trigger, Policies, Funktionen, Rechte)`, `${fpMig} / ${fpNew}`);
      await run(CA, RB); const fpBack = await run(CA, FP);
      ok(fpBack === fpOld, `QS-10: ${legacy ? 'legacy' : 'neu'} – rollback_q1 stellt das alte Schema wieder her`, `${fpBack} / ${fpOld}`);
    } finally { CA.stop(); CN.stop(); }
  }
});

// QS-11: lock_timeout der Migration – genau einmal „set local lock_timeout = '5s'“ als erste Anweisung nach begin, bricht hinter einer schreibenden Transaktion
// auf public.characters nach 4,5–6,5 s ab statt zu warten, rollt vollständig zurück und ändert weder Sitzung noch andere Verbindungen.
await scen('QS-11', async () => {
  const kopf = MIG.split('\n').filter((l) => l.trim() && !l.startsWith('--'));
  const m = /^set local lock_timeout = '(\d+)s';$/.exec(kopf[1] || '');
  ok(kopf[0] === 'begin;' && m && +m[1] === 5 && kopf.filter((l) => /lock_timeout/.test(l)).length === 1 && !kopf.some((l) => /^set (session )?lock_timeout/i.test(l)),
     `QS-11: Migration setzt direkt nach begin genau einmal „set local lock_timeout = '5s'“`, kopf.slice(0, 2).join(' | '));
  const C = await startCluster(PORT + 1);
  const run = async (s) => { const x = await C.psql(s); if (x.code) throw new Error(x.err.slice(0, 300)); return x.out; };
  try {
    await run(STUB); await run(altesSchema());
    const block = C.psql(`set application_name = 'QS11_SCHREIBER'; begin; lock table public.characters in row exclusive mode; select pg_sleep(60); commit;`);
    const t0 = Date.now(); while (+(await run(`select count(*) from pg_locks l join pg_stat_activity a using (pid) where a.application_name = 'QS11_SCHREIBER' and l.relation = 'public.characters'::regclass and l.granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('Schreibsperre nicht gesetzt'); await sleep(30); }
    const t1 = Date.now(); const r = await C.psql(MIG); const dt = Date.now() - t1;
    const reste = await run(`select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname ~ '^(quest_|npc_|character_confirmed|character_quests)'`)
      + '/' + await run(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname ~ '^(quest_|npc_)'`);
    ok(r.code !== 0 && /lock timeout/.test(r.err) && dt >= 4500 && dt < 6500 && reste === '0/0',
       `QS-11: hinter offener Schreibtransaktion auf characters bricht die Migration nach ${(dt / 1000).toFixed(1)} s ab (lock timeout) und hinterlässt nichts (${reste})`, (r.err || '').slice(0, 160));
    await run(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'QS11_SCHREIBER'`); await block;
    const nach = await run(MIG + `\nshow lock_timeout;`);
    const andere = await run(`show lock_timeout`);
    ok(nach.split('\n').pop() === '0' && andere === '0' && (await run(`select count(*) from pg_class where relname = 'quest_rewards'`)) === '1',
       'QS-11: ohne Blocker läuft die Migration durch; danach gilt in derselben Sitzung und in anderen Verbindungen wieder lock_timeout = 0', `${nach.split('\n').pop()} / ${andere}`);
  } finally { C.stop(); }
});

// QS-12: lock_timeout des Rollbacks – wie QS-11: hinter offener Schreibtransaktion auf characters spätestens nach 5 s Abbruch,
// vollständiges Zurückrollen (Katalog und Questdaten unverändert), danach gilt die Einstellung weder in der Sitzung noch anderswo.
await scen('QS-12', async () => {
  const kopf = RB.split('\n').filter((l) => l.trim() && !l.startsWith('--'));
  const m = /^set local lock_timeout = '(\d+)s';$/.exec(kopf[1] || '');
  ok(kopf[0] === 'begin;' && m && +m[1] === 5 && kopf.filter((l) => /lock_timeout/.test(l)).length === 1,
     `QS-12: Rollback setzt direkt nach begin genau einmal „set local lock_timeout = '5s'“`, kopf.slice(0, 2).join(' | '));
  const C = await startCluster(PORT + 1);
  const run = async (s) => { const x = await C.psql(s); if (x.code) throw new Error(x.err.slice(0, 300)); return x.out; };
  try {
    await run(STUB); await run(altesSchema()); await run(MIG);
    await run(`insert into public.quest_defs(quest_key,version,bereich,ziele) values ('st:qs12.1',1,'story','[{"typ":"kills","basis":1}]')`);
    const fpVor = await run(FP);
    const block = C.psql(`set application_name = 'QS12_SCHREIBER'; begin; lock table public.characters in row exclusive mode; select pg_sleep(60); commit;`);
    const t0 = Date.now(); while (+(await run(`select count(*) from pg_locks l join pg_stat_activity a using (pid) where a.application_name = 'QS12_SCHREIBER' and l.relation = 'public.characters'::regclass and l.granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('Schreibsperre nicht gesetzt'); await sleep(30); }
    const t1 = Date.now(); const r = await C.psql(RB); const dt = Date.now() - t1;
    const fpNach = await run(FP), daten = await run(`select count(*) from public.quest_defs where quest_key = 'st:qs12.1'`);
    ok(r.code !== 0 && /lock timeout/.test(r.err) && dt >= 4500 && dt < 6500 && fpNach === fpVor && daten === '1',
       `QS-12: hinter offener Schreibtransaktion auf characters bricht das Rollback nach ${(dt / 1000).toFixed(1)} s ab (lock timeout); Katalog unverändert, Questdaten erhalten`, `${(r.err || '').slice(0, 120)} | ${fpNach === fpVor} | ${daten}`);
    await run(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'QS12_SCHREIBER'`); await block;
    const nach = await run(RB + `\nshow lock_timeout;`);
    const andere = await run(`show lock_timeout`);
    ok(nach.split('\n').pop() === '0' && andere === '0' && (await run(`select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname ~ '^(quest_|npc_|character_confirmed|character_quests)'`)) === '0',
       'QS-12: ohne Blocker läuft das Rollback durch; danach gilt in derselben Sitzung und in anderen Verbindungen wieder lock_timeout = 0', `${nach.split('\n').pop()} / ${andere}`);
  } finally { C.stop(); }
});

E.stop(); process.exit(done());
