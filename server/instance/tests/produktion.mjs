// Sicherheitstests Spieleridentität und Datenbankzugriffe (Produktionsschicht): node server/instance/tests/produktion.mjs
// Echte Rollen (SET ROLE anon | authenticated | service_role) in einer Datenbank mit Supabase-Attrappe (supabase/tests/00_stub.sql: Rollen, auth.uid()),
// dem echten Schema supabase/schema.sql und den Instanz-Skripten 01–05. Zwei Läufe: Modus „neu“ (keine Standardrechte) und Modus „legacy“
// (Supabase-Altmodus: Standardrechte für alle API-Rollen, auch im Schema rwi – der ungünstigste Fall). Lokal getestet, NICHT auf einer echten Supabase-Instanz.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, nextFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
const STUB = readFileSync(join(here, '../../../supabase/tests/00_stub.sql'), 'utf8');
const SCHEMA = readFileSync(join(here, '../../../supabase/schema.sql'), 'utf8');
let pass = 0, fail = 0; const lines = [];
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const J = (s) => JSON.parse(s);
const CFG = { bossHp: 150, bossAtk: 8 };
const UID = { A: 'aaaaaaaa-0000-4000-8000-000000000001', B: 'bbbbbbbb-0000-4000-8000-000000000002', C: 'cccccccc-0000-4000-8000-000000000003', D: 'dddddddd-0000-4000-8000-000000000004', E: 'eeeeeeee-0000-4000-8000-000000000005', F: 'ffffffff-0000-4000-8000-000000000006' };
const CH = { A1: 'a1a1a1a1-0000-4000-8000-000000000001', A2: 'a2a2a2a2-0000-4000-8000-000000000002', A3: 'a3a3a3a3-0000-4000-8000-000000000003', B1: 'b1b1b1b1-0000-4000-8000-000000000001', C1: 'c1c1c1c1-0000-4000-8000-000000000001', D1: 'd1d1d1d1-0000-4000-8000-000000000001', E1: 'e1e1e1e1-0000-4000-8000-000000000001', LOW: '10101010-0000-4000-8000-000000000001', F1: 'f1f1f1f1-0000-4000-8000-000000000001' };
const CLASSES = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker'], ['magier', 'frost'], ['bogenschuetze', 'fallensteller']];

async function suite(mode) {
  const strip05 = () => SQL('05_produktion').replace(/create function rwi\.own_character[\s\S]*?end \$\$;\n/, '').replace(/create function rwi\.on_character_deleted[\s\S]*?end \$\$;\n/, '').replace(/create trigger characters_rwi_cleanup[^\n]*\n/, '').replace(/create function rwi\.on_profile_deleting[\s\S]*?end \$\$;\n/, '').replace(/create function rwi\.on_profile_deleted[\s\S]*?end \$\$;\n/, '').replace(/create trigger profiles_rwi_(lock|cleanup)[^\n]*\n/g, '').replace(/create function public\.group_[\s\S]*?end \$\$;\n/g, '').replace(/create function public\.rw_[\s\S]*?end \$\$;\n/g, '');   // 05 erneut ausführen, ohne die bereits vorhandenen Objekte neu anzulegen (Rechte-Block und Wächter bleiben)
  const legacy = mode === 'legacy';
  const cl = await startCluster(legacy ? 54398 : 54397);
  const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
  const sess = (role, uid) => `set role ${role}; ${uid ? `set request.jwt.claim.sub = '${uid}';` : ''}`;
  const as = (role, uid, sql) => cl.psql(sess(role, uid) + sql);                       // Rohergebnis {code,out,err}
  const asJ = async (role, uid, sql) => { const r = await as(role, uid, sql); if (r.code) throw new Error(r.err); return J(r.out.split('\n').pop()); };
  const denied = (r) => r.code !== 0 && /permission denied/.test(r.err);
  const failsWith = (r, re) => r.code !== 0 && re.test(r.err);
  const tag = `[${mode}]`;
  try {
    await q((legacy ? '\\set legacy 1\n' : '') + STUB);
    await q(SCHEMA);
    if (legacy) await q(`create schema if not exists rwi; alter default privileges in schema rwi grant all on tables to anon, authenticated, service_role; alter default privileges in schema rwi grant all on sequences to anon, authenticated, service_role; alter default privileges in schema rwi grant all on functions to anon, authenticated, service_role; grant usage, create on schema rwi to public, anon, authenticated, service_role;`);   // ungünstigster Fall: auch das Schema ist für alle freigegeben
    for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));

    // Testdaten: 5 Konten, Charaktere über das echte Schema; A hat zwei freie Plätze und einen gesperrten dritten Platz
    for (const [k, id] of Object.entries(UID)) await q(`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${k.toLowerCase()}@test.de','{"username":"Spieler_${k}"}')`);
    const mkChar = (id, uid, slot, name) => `insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values ('${id}','${uid}',${slot},'${name}','{}')`;
    await q(mkChar(CH.A1, UID.A, 1, 'A1') + ';' + mkChar(CH.A2, UID.A, 2, 'A2') + ';' + mkChar(CH.B1, UID.B, 1, 'B1') + ';' + mkChar(CH.C1, UID.C, 1, 'C1') + ';' + mkChar(CH.D1, UID.D, 1, 'D1') + ';' + mkChar(CH.E1, UID.E, 1, 'E1') + ';' + mkChar(CH.LOW, UID.E, 2, 'Low') + ';' + mkChar(CH.F1, UID.F, 1, 'F1'));
    await q(`insert into public.account_entitlements(account_id,entitlement_type,status,granted_at) values ('${UID.A}','third_character_slot','active',now())`);
    await q(mkChar(CH.A3, UID.A, 3, 'A3'));
    await q(`update public.account_entitlements set status='refunded' where account_id='${UID.A}'`);          // Platz 3 ist nun gesperrt
    let n = 0; for (const c of ['A1', 'A2', 'A3', 'B1', 'C1', 'D1', 'E1', 'F1']) { const [g, p] = CLASSES[n++ % CLASSES.length]; await q(`insert into rwi.players values ('${CH[c]}', 10, '${g}', '${p}', 3)`); }
    await q(`insert into rwi.players values ('${CH.LOW}', 4, 'krieger', 'ritter', 3)`);
    const svc = async (sql) => { const r = await as('service_role', null, sql); if (r.code) throw new Error(r.err + '\n' + sql.slice(0, 200)); return r.out; };
    const mkG = async (chars, fights = 2) => J(await svc(`select rwi.create_group('dungeon', array[${chars.map((c) => `'${CH[c]}'`).join(',')}]::text[], ${fights})`));

    // ---------- 1. Inventar und Rechte-Matrix (aus dem Systemkatalog, nicht aus der Annahme) ----------
    const FN = await q(`select p.proname || '|' || p.oid::regprocedure::text || '|' || has_function_privilege('anon', p.oid, 'execute') || '|' || has_function_privilege('authenticated', p.oid, 'execute') || '|' || has_function_privilege('service_role', p.oid, 'execute') ||
      '|' || coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), true)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'rwi' order by p.proname, p.oid::regprocedure::text`);
    const rows = FN.split('\n').map((l) => l.split('|'));
    const TEST = ['join', 'leave', 'set_ready', 'submit_action', 'submit_action_for', 'instance_view', 'heartbeat', 'heartbeat_for', 'use_revive_item', 'decline_revive_item', 'current_player'];
    const TRIG = ['members_size_guard', 'on_fight_end', 'reward_filter', 'on_character_deleted', 'account_guard', 'on_profile_deleting', 'on_profile_deleted'];
    ok(rows.length >= 45, `${tag} Inventar: ${rows.length} Funktionen im Schema rwi gefunden`);
    ok(rows.every((r) => r[2] === 'false' && r[3] === 'false'), `${tag} KEINE rwi-Funktion ist für anon oder authenticated ausführbar`, rows.filter((r) => r[2] !== 'false' || r[3] !== 'false').map((r) => r[0]).join(','));
    ok(rows.every((r) => r[5] === 'false'), `${tag} KEINE rwi-Funktion hat ein PUBLIC-Recht (auch nicht das Standard-EXECUTE)`, rows.filter((r) => r[5] !== 'false').map((r) => r[0]).join(','));
    ok(rows.filter((r) => TEST.includes(r[0]) || TRIG.includes(r[0]) || r[0] === 'own_character').every((r) => r[4] === 'false'), `${tag} Testfunktionen mit Spielerparameter, Triggerfunktionen und own_character sind auch für service_role gesperrt`);
    ok(rows.filter((r) => !TEST.includes(r[0]) && !TRIG.includes(r[0]) && r[0] !== 'own_character').every((r) => r[4] === 'true'), `${tag} Serverfunktionen sind für service_role ausführbar`);
    ok((await q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rwi'`)) === String(rows.length), `${tag} Inventar vollständig (Anzahl stimmt mit Systemkatalog überein)`);
    const SCH = (await q(`select has_schema_privilege('anon','rwi','usage') || '|' || has_schema_privilege('authenticated','rwi','usage') || '|' || has_schema_privilege('service_role','rwi','usage') || '|' || has_schema_privilege('public','rwi','usage')`)).split('|');
    ok(SCH.join() === 'false,false,true,false', `${tag} Schema rwi: kein USAGE für anon/authenticated/PUBLIC, USAGE für service_role`, SCH.join());
    const TB = await q(`select c.relname || '|' || (select count(*) from (values ('anon'),('authenticated'),('public')) r(x) where has_table_privilege(r.x, c.oid, 'select,insert,update,delete,truncate,references,trigger')) || '|' || c.relrowsecurity::text || '|' || has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'rwi' and c.relkind in ('r','p') order by 1`);
    const tbs = TB.split('\n').map((l) => l.split('|'));
    ok(tbs.length >= 15 && tbs.every((t) => t[1] === '0'), `${tbs.length} rwi-Tabellen: anon/authenticated/PUBLIC haben kein einziges Tabellenrecht`.replace(/^/, tag + ' '));
    ok(tbs.every((t) => t[2] === 'true'), `${tag} Row Level Security ist auf allen rwi-Tabellen aktiv (zweite Schicht)`);
    ok(tbs.every((t) => t[3] === 'true'), `${tag} service_role hat Tabellenrechte auf rwi`);
    const WR = ['group_join', 'group_leave', 'group_ready', 'group_heartbeat', 'group_view', 'group_action', 'group_revive_use', 'group_revive_decline'];
    const wr = (await q(`select p.proname || '|' || has_function_privilege('anon', p.oid, 'execute') || '|' || has_function_privilege('authenticated', p.oid, 'execute') || '|' || has_function_privilege('service_role', p.oid, 'execute') || '|' || coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), true)::text || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'group\\_%' order by p.proname`)).split('\n').map((l) => l.split('|'));
    ok(wr.map((r) => r[0]).join() === [...WR].sort().join(), `${tag} genau die acht Client-Wrapper existieren in public`, wr.map((r) => r[0]).join(','));
    ok(wr.every((r) => r[1] === 'false' && r[2] === 'true' && r[3] === 'false' && r[4] === 'false'), `${tag} Wrapper: nur authenticated darf ausführen (kein anon, kein PUBLIC, kein service_role)`);
    ok(wr.every((r) => r[5] === 'true' && /search_path=public, pg_temp/.test(r[6])), `${tag} Wrapper: SECURITY DEFINER mit festem search_path`);
    const SD = await q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rwi' and p.prosecdef and p.proname not in ('own_character', 'on_character_deleted', 'account_guard', 'account_of', 'on_profile_deleting', 'on_profile_deleted')`);
    ok(SD === '0', `${tag} im Schema rwi sind nur own_character, account_of, die Lösch-/Konto-Trigger und account_guard SECURITY DEFINER (kein verstecktes Definer-Recht)`);
    ok((await q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ~* 'reward|claim|belohn') and has_function_privilege('authenticated', p.oid, 'execute')`)) === '0',
      `${tag} es gibt (noch) keine für Clients ausführbare Belohnungs-Abruf- oder Einlösefunktion – Belohnungstabellen sind unerreichbar`);
    // Wächter: eine neue, nicht eingeordnete rwi-Funktion bricht die Rechte-Skript-Ausführung ab
    await q(`create function rwi.neu_unklassifiziert() returns int language sql as $$ select 1 $$`);
    const g = await cl.psql(strip05());
    ok(failsWith(g, /nicht \(eindeutig\) klassifiziert/), `${tag} Wächter: neue rwi-Funktion ohne Einordnung lässt das Rechte-Skript scheitern`);
    await q(`drop function rwi.neu_unklassifiziert()`);

    // ---------- 2. anon: keine Aktion, kein Lesen ----------
    const G1 = await mkG(['B1', 'C1']);
    ok(G1.status === 'ok', `${tag} Gruppe per service_role angelegt (create_group bleibt Serverfunktion)`);
    const I1 = G1.instance;
    for (const [fn, args] of [['group_join', `${I1}, '${CH.A1}'`], ['group_leave', `${I1}`], ['group_ready', `${I1}`], ['group_heartbeat', `${I1}`], ['group_view', `${I1}`], ['group_action', `1, 1, '{}'::jsonb`], ['group_revive_use', `1`], ['group_revive_decline', `1`]]) {
      const r = await as('anon', null, `select public.${fn}(${args})`);
      ok(denied(r), `${tag} anon: public.${fn} ist nicht ausführbar`, r.err.split('\n')[0]);
    }
    for (const s of [`select rwi.join(${I1}, '${CH.B1}')`, `select rwi.create_group('dungeon', array['x','y']::text[], 2)`, `select * from rwi.members`, `select * from rwi.rewards`, `select rwi.instance_view(${I1}, '${CH.B1}')`])
      ok(denied(await as('anon', null, s)), `${tag} anon: direkter Zugriff abgewiesen: ${s.slice(0, 60)}`);

    // ---------- 3. authenticated ohne Sitzungsidentität ----------
    for (const [fn, args] of [['group_join', `${I1}, '${CH.A1}'`], ['group_leave', `${I1}`], ['group_ready', `${I1}`], ['group_heartbeat', `${I1}`], ['group_view', `${I1}`], ['group_action', `1, 1, '{}'::jsonb`], ['group_revive_use', `1`]]) {
      const r = await as('authenticated', null, `select public.${fn}(${args})`);
      ok(failsWith(r, /not_authenticated|forbidden/), `${tag} authenticated ohne Sitzungsidentität (auth.uid() leer): ${fn} scheitert`, r.err.split('\n')[0]);
    }
    ok(failsWith(await as('authenticated', null, `select public.group_join(${I1}, '${CH.A1}')`), /not_authenticated/), `${tag} … und zwar mit not_authenticated`);

    // ---------- 4. fremde und manipulierte Charakter-IDs ----------
    const snap = async (iid) => q(`select md5(coalesce((select string_agg(m::text, ';' order by m.id) from rwi.members m where instance_id=${iid}), '') || '#' || coalesce((select string_agg(w::text, ';' order by w.id) from rwi.waitlist w where instance_id=${iid}), '') || '#' || (select i::text from rwi.instances i where id=${iid}) || '#' || (select count(*) from rwi.group_log where instance_id=${iid}))`);
    const before = await snap(I1);
    for (const [label, args, who] of [
      ['A tritt als Charakter von B bei', `${I1}, '${CH.B1}'`, 'group_join'], ['A tritt mit gesperrtem Platz 3 bei', `${I1}, '${CH.A3}'`, 'group_join'],
      ['A tritt mit unbekannter Charakter-ID bei', `${I1}, '99999999-9999-4999-8999-999999999999'`, 'group_join'],
      ['A verlässt die Gruppe von B (als B)', `${I1}, '${CH.B1}'`, 'group_leave'], ['A bestätigt Bereitschaft für B', `${I1}, '${CH.C1}'`, 'group_ready'],
      ['A sendet Herzschlag für B', `${I1}, '${CH.B1}'`, 'group_heartbeat'], ['A liest die Ansicht als B', `${I1}, null, '${CH.B1}'`, 'group_view'],
      ['A liest die Ansicht einer Gruppe, in der er nicht ist', `${I1}`, 'group_view'], ['A verlässt eine Gruppe, in der er nicht ist', `${I1}`, 'group_leave'],
      ['A bestätigt in fremder Gruppe (ohne Charakterangabe)', `${I1}`, 'group_ready'], ['A sendet Herzschlag in fremde Gruppe', `${I1}`, 'group_heartbeat'],
    ]) { const r = await as('authenticated', UID.A, `select public.${who}(${args})`); ok(failsWith(r, /forbidden/), `${tag} ${label}: abgewiesen (forbidden)`, r.err.split('\n')[0]); }
    ok((await snap(I1)) === before, `${tag} Zustand der Gruppe von B/C nach allen Fremdzugriffen unverändert (Mitglieder, Warteliste, Instanz, Protokoll)`);
    for (const bad of [`'; drop table rwi.members;--`, `'not-a-uuid'`, `'a1a1a1a1-0000-4000-8000-000000000001 or 1=1'`]) {
      const r = await as('authenticated', UID.A, `select public.group_join(${I1}, ${bad.startsWith("'") ? bad.replace(/'/g, "''").replace(/^''/, "'").replace(/''$/, "'") : bad})`);
      ok(r.code !== 0, `${tag} manipulierte Charakter-ID wird abgewiesen: ${bad.slice(0, 30)}`, r.err.split('\n')[0]);
    }
    ok((await q(`select count(*) from rwi.members`)) !== '0' && (await q(`select to_regclass('rwi.members') is not null`)) === 't', `${tag} Tabellen nach den Einschleusungsversuchen noch vorhanden`);
    // Sitzung eines Kontos ohne jeden Charakter
    ok(failsWith(await as('authenticated', 'ffffffff-0000-4000-8000-000000000009', `select public.group_join(${I1}, '${CH.A1}')`), /forbidden/), `${tag} Konto ohne Charakter kann keinen fremden Charakter verwenden`);

    // ---------- 5. eigener Weg über die Wrapper: Beitritt, Bereitschaft, Herzschlag, Austritt ----------
    const rj = await asJ('authenticated', UID.A, `select public.group_join(${I1}, '${CH.A1}')`);
    ok(['joined', 'waitlisted'].includes(rj.status), `${tag} A tritt mit eigenem Charakter bei`, rj.status);
    const memA = await q(`select count(*) from rwi.members where instance_id=${I1} and player='${CH.A1}' and mstate='active'`);
    ok(memA === '1', `${tag} Mitglied ist der Charakter von A (Spielerschlüssel = character_id), nicht die Konto-ID`);
    ok((await q(`select count(*) from rwi.members where instance_id=${I1} and player='${UID.A}'`)) === '0', `${tag} die Konto-ID taucht nie als Spielerschlüssel auf`);
    const rj2 = await asJ('authenticated', UID.A, `select public.group_join(${I1}, '${CH.A1}')`);
    ok(['already_member', 'already_waiting'].includes(rj2.status), `${tag} zweiter Beitritt ist wirkungslos`, rj2.status);
    // Account-Regel (Beschluss): ein Account stellt je Instanz höchstens einen Charakter -> zweiter eigener Charakter wird abgewiesen, die Ableitung ohne Charakterangabe ist damit eindeutig
    const rA2 = await asJ('authenticated', UID.A, `select public.group_join(${I1}, '${CH.A2}')`);
    ok(rA2.status === 'account_in_instance', `${tag} A kann keinen zweiten eigenen Charakter in dieselbe Instanz bringen (Account-Regel)`, rA2.status);
    ok((await asJ('authenticated', UID.A, `select public.group_ready(${I1})`)).status === 'ok', `${tag} ohne Charakterangabe wird der einzige eigene Charakter der Instanz abgeleitet (eindeutig, kein Raten)`);
    ok((await asJ('authenticated', UID.A, `select public.group_ready(${I1}, '${CH.A1}')`)).status === 'ok', `${tag} mit Charakterangabe (eigener Charakter) geht es ebenfalls`);
    const rB = await asJ('authenticated', UID.B, `select public.group_ready(${I1})`);
    ok(rB.status === 'ok', `${tag} B bestätigt Bereitschaft ohne Charakterangabe (aus Sitzung und Mitgliedschaft abgeleitet)`);
    ok((await q(`select ready from rwi.members where instance_id=${I1} and player='${CH.B1}'`)) === 't' && (await q(`select ready from rwi.members where instance_id=${I1} and player='${CH.C1}'`)) === 'f', `${tag} nur B ist bereit, C unverändert`);
    const lsB0 = await q(`select last_seen_at from rwi.members where instance_id=${I1} and player='${CH.B1}'`), lsC0 = await q(`select last_seen_at from rwi.members where instance_id=${I1} and player='${CH.C1}'`);
    const hb = await asJ('authenticated', UID.B, `select public.group_heartbeat(${I1})`);
    ok(['ok', 'unchanged'].includes(hb.status), `${tag} Herzschlag von B`, hb.status);
    ok((await q(`select last_seen_at > '${lsB0}' from rwi.members where instance_id=${I1} and player='${CH.B1}'`)) === 't' && (await q(`select last_seen_at = '${lsC0}' from rwi.members where instance_id=${I1} and player='${CH.C1}'`)) === 't', `${tag} Herzschlag setzt nur die Anwesenheit von B (Serverzeit), nie die von C`);
    const v = await asJ('authenticated', UID.B, `select public.group_view(${I1})`);
    ok(v.status === 'ok' && v.me.key === CH.B1, `${tag} Ansicht von B zeigt B`);
    ok((await asJ('authenticated', UID.C, `select public.group_view(${I1})`)).me.key === CH.C1, `${tag} Ansicht von C zeigt C`);
    ok(!JSON.stringify(v).includes(UID.A) && !JSON.stringify(v).includes(UID.B), `${tag} die Ansicht enthält keine Konto-IDs`);

    // ---------- 6. Kampf über die Wrapper, Aktionen und Fremdzugriffe ----------
    await asJ('authenticated', UID.C, `select public.group_ready(${I1})`);
    const members = J(await q(`select coalesce(json_agg(player order by id),'[]') from rwi.members where instance_id=${I1} and mstate='active'`));
    ok(members.includes(CH.A1) && members.includes(CH.B1) && members.includes(CH.C1), `${tag} Gruppe aus A, B, C steht (${members.length} Mitglieder)`);
    await asJ('authenticated', UID.A, `select public.group_ready(${I1}, '${CH.A1}')`).catch(() => null);
    const roster = J(await svc(`select rwi.roster(${I1})`)), S = newFight(roster, CFG);
    const sf = J(await svc(`select rwi.start_fight(${I1}, $j$${JSON.stringify(S)}$j$::jsonb)`));
    ok(sf.status === 'ok' || sf.fight, `${tag} Kampfstart durch service_role`, JSON.stringify(sf).slice(0, 80));
    const fid = +(await q(`select max(id) from rwi.fights where instance_id=${I1}`)), rn = +(await q(`select round_no from rwi.fights where id=${fid}`));
    const act = { ability: 'standard', target: 'boss' };
    ok(failsWith(await as('authenticated', UID.D, `select public.group_action(${fid}, ${rn}, '${JSON.stringify(act)}'::jsonb)`), /forbidden/), `${tag} D (Konto ohne Mitgliedschaft) kann keine Aktion abgeben`);
    ok(failsWith(await as('authenticated', UID.D, `select public.group_action(${fid}, ${rn}, '${JSON.stringify(act)}'::jsonb, '${CH.B1}')`), /forbidden/), `${tag} D kann nicht als B handeln (Charakterparameter fremd)`);
    ok(failsWith(await as('authenticated', UID.A, `select public.group_action(${fid}, ${rn}, '${JSON.stringify(act)}'::jsonb, '${CH.B1}')`), /forbidden/), `${tag} A kann nicht als B handeln, obwohl A in derselben Gruppe ist`);
    ok(failsWith(await as('authenticated', UID.A, `select public.group_action(999999, 1, '{}'::jsonb)`), /forbidden/), `${tag} unbekannter Kampf: forbidden (gleiche Antwort wie fremder Kampf)`);
    ok((await q(`select actions = '{}'::jsonb from rwi.fights where id=${fid}`)) === 't', `${tag} nach den Fehlversuchen liegt keine Aktion vor`);
    const ra = await asJ('authenticated', UID.A, `select public.group_action(${fid}, ${rn}, '${JSON.stringify(act)}'::jsonb)`);
    ok(ra.status === 'ok', `${tag} A gibt eine Aktion für den eigenen Charakter ab`, JSON.stringify(ra).slice(0, 80));
    const acts = J(await q(`select actions from rwi.fights where id=${fid}`));
    ok(Object.keys(acts).join() === CH.A1, `${tag} die Aktion wurde dem Schlüssel von A zugeordnet, nur diesem`, Object.keys(acts).join());
    ok(failsWith(await as('authenticated', UID.D, `select public.group_revive_use(${fid})`), /forbidden/) && failsWith(await as('authenticated', UID.D, `select public.group_revive_decline(${fid})`), /forbidden/), `${tag} D kann für den Kampf der Gruppe weder Revive-Item nutzen noch ablehnen`);
    ok(failsWith(await as('authenticated', UID.A, `select public.group_revive_use(${fid}, '${CH.B1}')`), /forbidden/) && failsWith(await as('authenticated', UID.A, `select public.group_revive_decline(${fid}, '${CH.B1}')`), /forbidden/), `${tag} A kann für B kein Revive-Item nutzen oder ablehnen`);
    const rv = await asJ('authenticated', UID.A, `select public.group_revive_decline(${fid})`);
    ok(['ok', 'no_window'].includes(rv.status), `${tag} eigenes Revive-Verhalten läuft über den Wrapper`, rv.status);
    const rv2 = await asJ('authenticated', UID.B, `select public.group_revive_use(${fid})`);
    ok(['no_window', 'ok', 'no_item'].includes(rv2.status), `${tag} B: group_revive_use erreicht die Kernfunktion mit B's Schlüssel`, rv2.status);
    // Fremde Gruppe: A kann in einer Gruppe von D/E nichts sehen oder tun
    const G2 = await mkG(['D1', 'E1']); const I2 = G2.instance;
    const b2 = await snap(I2);
    for (const s of [`select public.group_view(${I2})`, `select public.group_leave(${I2})`, `select public.group_ready(${I2})`, `select public.group_heartbeat(${I2})`, `select public.group_view(${I2}, null, '${CH.D1}')`, `select public.group_leave(${I2}, '${CH.D1}')`])
      ok(failsWith(await as('authenticated', UID.A, s), /forbidden/), `${tag} A gegen Gruppe von D/E: ${s.replace(/select public\./, '').slice(0, 50)} abgewiesen`);
    ok((await snap(I2)) === b2, `${tag} fremde Gruppe unverändert`);
    // Revive-Item: die Wirkung trifft nur den Schlüssel des Aufrufers (echtes offenes Todesfenster)
    const G3 = await mkG(['D1', 'E1']); const I3 = G3.instance;
    await asJ('authenticated', UID.D, `select public.group_ready(${I3})`); await asJ('authenticated', UID.E, `select public.group_ready(${I3})`);
    await svc(`select rwi.start_fight(${I3}, $j$${JSON.stringify(newFight(J(await svc(`select rwi.roster(${I3})`)), CFG))}$j$::jsonb)`);
    const f3 = +(await q(`select max(id) from rwi.fights where instance_id=${I3}`));
    await q(`update rwi.fights set state = jsonb_set(state, '{members}', (select jsonb_agg(case when m->>'id' = '${CH.E1}' then m || '{"alive":false,"hp":0,"deaths":1,"revives":0,"gone":false}'::jsonb else m end) from jsonb_array_elements(state->'members') m)) where id=${f3}`);
    await q(`update rwi.members set revive_items = 1 where instance_id=${I3}`);
    await q(`insert into rwi.death_windows(fight_id, member_key, death_no, opened_at, remaining_ms) values (${f3}, '${CH.E1}', 1, clock_timestamp(), 60000)`);
    ok(failsWith(await as('authenticated', UID.D, `select public.group_revive_use(${f3}, '${CH.E1}')`), /forbidden/), `${tag} D kann das Revive-Item nicht für E's Charakter einsetzen`);
    const ru = await asJ('authenticated', UID.E, `select public.group_revive_use(${f3})`);
    ok(ru.status === 'ok' && (await q(`select item_ok::text from rwi.fights where id=${f3}`)) === `["${CH.E1}"]`, `${tag} E setzt das Revive-Item ein: wirkt auf E's Schlüssel, nicht auf einen anderen`, JSON.stringify(ru));
    await q(`insert into rwi.death_windows(fight_id, member_key, death_no, opened_at, remaining_ms) values (${f3}, '${CH.E1}', 2, clock_timestamp(), 60000), (${f3}, '${CH.D1}', 1, clock_timestamp(), 60000)`);
    ok((await asJ('authenticated', UID.E, `select public.group_revive_decline(${f3})`)).status === 'ok', `${tag} E lehnt das Item für den eigenen Charakter ab`);
    ok((await q(`select string_agg(member_key || ':' || death_no || ':' || item_open::text, ',' order by member_key, death_no) from rwi.death_windows where fight_id=${f3} and status='open' and death_no=2 or (fight_id=${f3} and member_key='${CH.D1}')`)).includes(`${CH.D1}:1:true`)
      && (await q(`select item_open from rwi.death_windows where fight_id=${f3} and member_key='${CH.E1}' and death_no=2`)) === 'f', `${tag} das Ablehnen schloss nur E's Fenster; das Fenster von D blieb offen`);
    // Belohnungen: Tabellen unerreichbar, Ansicht zeigt nur eigene Ansprüche
    ok(denied(await as('authenticated', UID.A, `select * from rwi.rewards`)) && denied(await as('authenticated', UID.A, `select * from rwi.entitlements`)), `${tag} authenticated: Belohnungs- und Anspruchstabellen nicht lesbar`);
    await q(`insert into rwi.entitlements(instance_id, player, fight_no, kind) values (${I1}, '${CH.B1}', 1, 'final')`).catch(() => null);
    const vA = await asJ('authenticated', UID.A, `select public.group_view(${I1})`);
    ok(!JSON.stringify(vA.me.entitlements ?? []).includes(CH.B1), `${tag} die Ansicht von A enthält keine Ansprüche von B`);

    // ---------- 7. Testfunktionen: für keine Clientrolle ausführbar, auch nicht mit gültiger Sitzung ----------
    const attempts = [`select rwi.join(${I1}, '${CH.B1}')`, `select rwi.leave(${I1}, '${CH.B1}')`, `select rwi.set_ready(${I1}, '${CH.B1}')`, `select rwi.submit_action_for('${CH.B1}', ${fid}, ${rn}, '{}'::jsonb)`, `select rwi.submit_action(${fid}, '${CH.B1}', ${rn}, '{}'::jsonb)`,
      `select rwi.instance_view(${I1}, '${CH.B1}')`, `select rwi.heartbeat(${I1})`, `select rwi.heartbeat_for(${I1}, '${CH.B1}')`, `select rwi.use_revive_item(${fid}, '${CH.B1}')`, `select rwi.decline_revive_item(${fid}, '${CH.B1}')`, `select rwi.current_player()`, `select rwi.own_character('${CH.B1}')`];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      let all = true; for (const s of attempts) { const r = await as(role, role === 'anon' ? null : UID.A, s); if (!denied(r)) { all = false; console.log('   OFFEN:', role, s.slice(0, 60), r.err.split('\n')[0]); } }
      ok(all, `${tag} ${role}: alle ${attempts.length} Testfunktionen mit Spielerparameter sind nicht ausführbar`);
    }
    ok(denied(await as('authenticated', UID.A, `select rwi.create_group('dungeon', array['${CH.A1}','${CH.B1}']::text[], 2)`)), `${tag} authenticated kann keine Gruppe mit frei gewählten Spielern anlegen`);
    ok(denied(await as('authenticated', UID.A, `insert into rwi.members(instance_id, player, key) values (${I2}, '${CH.A1}', '${CH.A1}')`)), `${tag} authenticated kann sich nicht per INSERT in eine Gruppe schreiben`);
    ok(denied(await as('authenticated', UID.A, `update rwi.members set ready=true`)) && denied(await as('authenticated', UID.A, `delete from rwi.members`)), `${tag} authenticated kann Mitglieder weder ändern noch löschen`);
    ok(denied(await as('authenticated', UID.A, `select * from rwi.players`)), `${tag} authenticated kann die Spielertabelle (Stufe/Klasse) nicht lesen oder schreiben`);

    // ---------- 8. berechtigte interne Serverfunktionen funktionieren weiter (service_role) ----------
    const tick = await as('service_role', null, `select rwi.group_tick()`); ok(tick.code === 0, `${tag} service_role: group_tick`, tick.err.split('\n')[0]);
    const wd = await as('service_role', null, `select rwi.watchdog_tick()`); ok(wd.code === 0, `${tag} service_role: watchdog_tick`, wd.err.split('\n')[0]);
    const sw = await as('service_role', null, `select rwi.sweep_events()`); ok(sw.code === 0, `${tag} service_role: sweep_events`, sw.err.split('\n')[0]);
    const sc = await as('service_role', null, `select rwi.set_connection(${I1}, '${CH.C1}', false)`); ok(sc.code === 0, `${tag} service_role: set_connection (Verbindungsabbruch durch den Server)`, sc.err.split('\n')[0]);
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
    const cl1 = J(await svc(`select rwi.claim_resolution(${fid}, ${rn})`)); ok(cl1.status === 'ok', `${tag} service_role: claim_resolution`, cl1.status);
    if (cl1.status === 'ok') {
      const res = resolveClaim(cl1.input);
      const cm = J(await svc(`select rwi.commit_round(${fid}, ${cl1.input.round_no}, '${cl1.token}', ${cl1.round_version}, '${cl1.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`));
      ok(['committed', 'event_ended'].includes(cm.status), `${tag} service_role: commit_round (Triggerfunktionen laufen ohne eigenes EXECUTE-Recht)`, cm.status);
    }
    ok(J(await svc(`select rwi.create_group('weltboss', array['${CH.A1}','${CH.B1}','${CH.C1}','${CH.D1}','${CH.E1}','${CH.F1}']::text[], 1, 7, clock_timestamp() + interval '1 hour')`)).status === 'ok', `${tag} service_role: create_group Weltboss (6 Spieler) – Servergruppierung funktioniert`);
    // gleiche Daten als Superuser: der Prototyp-Weg (Tests mit Spielerparametern) bleibt für den Tabelleneigentümer erhalten
    const own = J(await q(`select rwi.instance_view(${I1}, '${CH.B1}')`)); ok(own.status === 'ok', `${tag} Tabelleneigentümer (Migrationsrolle) kann die Testfunktionen weiter nutzen`);
    // Rechte stabil nach erneuter Ausführung
    await q(strip05());
    const again = (await q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rwi' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`));
    ok(again === '0', `${tag} Rechte-Skript ist wiederholbar und lässt keine Clientrechte zurück`);
    // Ausgabe der Matrix für den Bericht (nur Ausgabe, keine Prüfung)
    lines.push(`# Rechte-Matrix ${tag}\n` + rows.map((r) => `${r[0].padEnd(26)} anon=${r[2]} authenticated=${r[3]} service_role=${r[4]} public=${r[5]}`).join('\n'));
  } finally { cl.stop(); }
}

await suite('neu');
await suite('legacy');
if (process.env.MATRIX) console.log(lines.join('\n'));
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
