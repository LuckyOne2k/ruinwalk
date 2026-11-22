// B-2/B-3: Sperrreihenfolge Beitritt / Charakterlöschung / Kontolöschung (docs/B2_V6_PRUEFUNG.md, „V5 + V6′“).
// Nebenläufigkeitstests mit echten Zwei-Sitzungs-Abläufen auf lokalem PostgreSQL (Attrappe der Supabase-Rollen, prod-env.mjs). NICHT ECHT: kein GoTrue, kein PostgREST.
// Haltepunkte nur in der Testdatenbank: Schema testhook (Beratungssperren als „Tor“), zusätzliche Trigger bzw. umbenannte Hüllfunktionen – Produktionscode bleibt unverändert.
// Tests: K1-9g1–g3, B2-1 (= K1-9g4 neu), B2-2, B2-3, B2-3b, GP-1/V6-1, V6-2, V6-3, B2-9, B2-10, B2-11 (B-5, beide Reihenfolgen), B2-12 (A vor I), V6-4, V6-7, V6-8 (B-4 behoben, beide Reihenfolgen), V6-8c (B-4-Mechanismus bei direktem Löschen, mit Endzustand), V6-9/GP-6, V6-10, V6-11, V6-15 (Migration B4), V6-12/V6-12b/GP-4, V6-14a/b (drei gleichzeitige delete_character), GP-2, GP-3, GP-5, V6-13, B6-1/B6-2/B6-3/B6-4 (Mehrzeilen-Löschungen, Lösch-Block des Cleanup-Skripts).
import { setup, SQL, STUB, J, counter } from './prod-env.mjs';
import { startCluster } from './pg.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../..');
const PORT = +(process.env.PORT || 54741);
const MIX = +(process.env.B2_MIX || 200);
const { ok, done } = counter();
const known = [];                                   // bestätigte bekannte Fehler (getrennt gezählt)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const E = await setup(PORT); const { q, cl } = E;
const UUID = `'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;
const INV = async () => +(await q(`select (select count(*) from rwi.members m where m.mstate='active' and m.player ~* ${UUID} and not exists (select 1 from public.characters c where c.character_id::text = lower(m.player)))
  + (select count(*) from rwi.waitlist w where w.status='waiting' and w.player ~* ${UUID} and not exists (select 1 from public.characters c where c.character_id::text = lower(w.player)))`));
const dl = (r) => /deadlock detected/.test(r.err || '');
const line = (r) => ((r.err || r.out || '').split('\n').find((l) => /ERROR|status/.test(l)) || (r.err || r.out || '')).slice(0, 140);
let nsess = 0;
const S = (name, body, o = {}) => cl.psql([`set application_name = '${name}';`, `set statement_timeout = '${o.timeout || '40s'}';`,
  o.role ? `set role ${o.role}; set search_path = "$user", public;` : '', o.claims ? `set request.jwt.claims = '${JSON.stringify(o.claims)}';` : '', body].join('\n'));
const user = (a, extra = {}) => ({ role: 'authenticated', claims: { sub: a.id, role: 'authenticated', ...extra } });
const state = async (name) => (await q(`select coalesce(string_agg(coalesce(wait_event_type,'') || ':' || coalesce(wait_event,'') || ':' || state, ','),'') from pg_stat_activity where application_name = '${name}'`));
const waitState = async (name, re, ms = 15000) => { const t0 = Date.now(); let s = ''; while (Date.now() - t0 < ms) { s = await state(name); if (re.test(s)) return s; await sleep(40); } throw new Error(`Zeitüberschreitung: ${name} erreicht ${re} nicht (zuletzt ${s})`); };
let gk = 900000;
const gate = async () => { const k = ++gk; const p = cl.psql(`set application_name = 'GATE${k}'; select pg_advisory_lock(${k}); select pg_sleep(600);`);
  const t0 = Date.now(); while (+(await q(`select count(*) from pg_locks where locktype='advisory' and objsubid=1 and classid=0 and objid=${k} and granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('Tor nicht gesetzt'); await sleep(30); }
  const open = once(async () => { await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'GATE${k}'`); await p; });
  return { k, open }; };
const key = async (id) => await q(`select hashtextextended('rwi.char:' || lower('${id}'), 0)`);
let nacc = 0;
const acc = (n = 1) => E.account(`b2u${++nacc}`, n);
const grp = async (chars, fights = 2) => { const g = await E.group(chars, fights); if (g.status !== 'ok') throw new Error('create_group: ' + JSON.stringify(g)); return g.instance; };
const session = async (a) => { const sid = await q(`select gen_random_uuid()`); await q(`insert into auth.sessions(id,user_id,created_at) values ('${sid}','${a.id}', now()); insert into auth.mfa_amr_claims(session_id,authentication_method,created_at) values ('${sid}','password', now())`); return sid; };
const delAcc = async (name, a) => { const sid = await session(a); return () => S(name, `select public.delete_account('${a.name}')`, user(a, { session_id: sid })); };

// ---------- Haltepunkte (nur Testdatenbank) ----------
await q(`create schema testhook; grant usage on schema testhook to public;
create function testhook.gate(k bigint) returns void language plpgsql as $$ begin perform pg_advisory_lock_shared(k); perform pg_advisory_unlock_shared(k); end $$;
create function testhook.tg_char() returns trigger language plpgsql security definer as $$
begin if old.character_id::text = tg_argv[1] then perform testhook.gate(tg_argv[0]::bigint); end if; if tg_op = 'DELETE' then return old; end if; return new; end $$;
create function testhook.tg_char_ins() returns trigger language plpgsql security definer as $$
begin if new.account_id::text = tg_argv[1] then perform testhook.gate(tg_argv[0]::bigint); end if; return new; end $$;
create function testhook.tg_prof() returns trigger language plpgsql security definer as $$
begin if old.account_id::text = tg_argv[1] then perform testhook.gate(tg_argv[0]::bigint); end if; return old; end $$;
grant execute on all functions in schema testhook to public;`);
const cleanup = [];                                  // Aufräumen nach jedem Szenario (auch bei Fehlern), damit ein roter Fall keine Folgefehler erzeugt
const once = (f) => { let d = false; const g = async () => { if (!d) { d = true; await f(); } }; cleanup.push(g); return g; };
const trg = async (name, when, ev, table, fn, k, id) => { await q(`create trigger ${name} ${when} ${ev} on public.${table} for each row execute function testhook.${fn}('${k}', '${id}')`); return once(() => q(`drop trigger if exists ${name} on public.${table}`)); };
const wrapEligible = async (W, k) => { await q(`alter function rwi.eligible(text) rename to eligible_orig;
  create function rwi.eligible(p_player text) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
  declare r boolean; begin r := rwi.eligible_orig(p_player); if p_player = '${W}' then perform testhook.gate(${k}); end if; return r; end $$;`);
  return once(() => q(`drop function rwi.eligible(text); alter function rwi.eligible_orig(text) rename to eligible;`)); };
const wrapOwn = async (W, k) => { await q(`alter function rwi.own_character(uuid, bigint, boolean) rename to own_character_orig;
  create function rwi.own_character(p_character uuid, p_instance bigint default null, p_need_entitlement boolean default false) returns text language plpgsql security definer set search_path = public, pg_temp as $$
  declare r text; begin r := rwi.own_character_orig(p_character, p_instance, p_need_entitlement); if p_character::text = '${W}' then perform testhook.gate(${k}); end if; return r; end $$;`);
  return once(() => q(`drop function rwi.own_character(uuid, bigint, boolean); alter function rwi.own_character_orig(uuid, bigint, boolean) rename to own_character;`)); };
const scen = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name}: Ablauf`, e.message.slice(0, 160)); }
  finally { while (cleanup.length) { try { await cleanup.pop()(); } catch (e) { console.log("  (Aufräumen fehlgeschlagen: " + e.message.slice(0, 200) + ")"); } } await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name ~ '^(GATE|HOLD|J|DC|DA|DD|P|JX|CG|ADM|OP|Jw|NEU)'`); await sleep(100); } };
// Wartestellung auf Zeilen-/Transaktionssperre (Löschen/Sperren) bzw. Beratungssperre
const LOCKROW = /Lock:(tuple|transactionid)/, LOCKADV = /Lock:advisory/;

try {
  console.log('PostgreSQL', await q('show server_version'));

  // ===== K1-9g1: Charakterlöschung, Nachrücken hält I zuerst =====
  await scen('K1-9g1', async () => {
    const [A1, A2, W] = [await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    await q(`insert into rwi.waitlist(instance_id, player) values (${I}, '${W.chars[0]}')`);   // wartend (account setzt account_guard)
    const G = await gate();
    const P = S('P', `begin; select 1 from rwi.instances where id = ${I} for update; select testhook.gate(${G.k}); select rwi.promote_waitlist(${I}); commit;`);
    await waitState('P', LOCKADV);
    const D = S('DC', `select public.delete_character('${W.chars[0]}')`, user(W)); const ws = await waitState('DC', LOCKROW);
    await G.open(); const [rp, rd] = await Promise.all([P, D]);
    const m = await q(`select coalesce(string_agg(mstate || '/' || coalesce(leave_reason,''), ','),'') from rwi.members where instance_id = ${I} and player = '${W.chars[0]}'`);
    ok(rp.code === 0 && rd.code === 0 && !dl(rp) && !dl(rd) && m === 'left/freiwillig' && (await q(`select count(*) from public.characters where character_id='${W.chars[0]}'`)) === '0'
       && (await q(`select count(*) from rwi.players where player='${W.chars[0]}'`)) === '0' && (await INV()) === 0,
       'K1-9g1: Nachrücken hält I, Charakterlöschung wartet (' + ws + '), W nachgerückt und danach als left/freiwillig entfernt, kein 40P01, INV-1 = 0', `${line(rp)} | ${line(rd)} | ${m}`);
  });

  // ===== K1-9g2: Kontolöschung, Nachrücken hält I zuerst =====
  await scen('K1-9g2', async () => {
    const [A1, A2, W] = [await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    await q(`insert into rwi.waitlist(instance_id, player) values (${I}, '${W.chars[0]}')`);
    const G = await gate(); const P = S('P', `begin; select 1 from rwi.instances where id = ${I} for update; select testhook.gate(${G.k}); select rwi.promote_waitlist(${I}); commit;`);
    await waitState('P', LOCKADV); const da = await delAcc('DA', W); const D = da(); const ws = await waitState('DA', LOCKROW);
    await G.open(); const [rp, rd] = await Promise.all([P, D]);
    const m = await q(`select coalesce(string_agg(mstate || '/' || coalesce(account::text,'null'), ','),'') from rwi.members where instance_id = ${I} and player = '${W.chars[0]}'`);
    ok(rp.code === 0 && rd.code === 0 && !dl(rp) && !dl(rd) && m === 'left/null' && (await q(`select count(*) from auth.users where id='${W.id}'`)) === '0' && (await INV()) === 0,
       'K1-9g2: Nachrücken hält I, Kontolöschung wartet in on_profile_deleting (' + ws + '), W danach entfernt, account NULL, kein 40P01, INV-1 = 0', `${line(rp)} | ${line(rd)} | ${m}`);
  });

  // ===== K1-9g3: Löschung hält I zuerst, Beitritt eines Dritten wartet =====
  await scen('K1-9g3', async () => {
    const [A1, A2, W, X] = [await acc(), await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    await q(`insert into rwi.waitlist(instance_id, player) values (${I}, '${W.chars[0]}')`);
    const G = await gate(); const un = await trg('characters_zz_gate', 'after', 'delete', 'characters', 'tg_char', G.k, W.chars[0]);
    const D = S('DC', `select public.delete_character('${W.chars[0]}')`, user(W)); await waitState('DC', LOCKADV);
    const Jx = S('JX', `select public.group_join(${I}, '${X.chars[0]}')`, user(X)); const ws = await waitState('JX', LOCKROW);
    await G.open(); const [rd, rj] = await Promise.all([D, Jx]); await un();
    const wl = await q(`select coalesce(string_agg(status, ','),'') from rwi.waitlist where instance_id=${I} and player='${W.chars[0]}'`);
    const wm = await q(`select count(*) from rwi.members where instance_id=${I} and player='${W.chars[0]}'`);
    ok(rd.code === 0 && rj.code === 0 && !dl(rd) && !dl(rj) && wl === 'cancelled' && wm === '0' && (await INV()) === 0,
       'K1-9g3: Löschung hält I, Beitritt eines Dritten wartet (' + ws + '); W storniert und nicht nachgerückt, kein 40P01, INV-1 = 0', `${line(rd)} | ${line(rj)} | ${wl}`);
  });

  // ===== B2-1 (= K1-9g4 neu, B-2 behoben): Beitritt hält A(W), Charakterlöschung startet – Dungeon (Warteliste) und Weltboss (Einkampf, Mitglied) =====
  for (const variante of ['dungeon', 'weltboss']) await scen('B2-1 ' + variante, async () => {
    const W = await acc(); let I;
    if (variante === 'dungeon') { const [A1, A2] = [await acc(), await acc()]; I = await grp([A1.chars[0], A2.chars[0]]); }
    else { const P6 = []; for (let i = 0; i < 6; i++) P6.push((await acc()).chars[0]); I = J(await q(`select rwi.create_group('weltboss', array[${P6.map((c) => `'${c}'`).join(',')}]::text[], 1, ${700 + nacc}, clock_timestamp() + interval '2 hours')`)).instance; }
    const G = await gate(); const un = await wrapEligible(W.chars[0], G.k);
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); await waitState('J', LOCKADV);
    // GP-6: die gehaltene Beratungssperre ist die 64-Bit-Form (objsubid = 1) mit genau dem gemeinsamen Schlüssel
    const k = BigInt(await key(W.chars[0])); const hi = (k >> 32n) & 0xffffffffn, lo = k & 0xffffffffn;
    const held = await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = 'J' and l.locktype = 'advisory' and l.granted and l.objsubid = 1 and l.classid::bigint = ${hi} and l.objid::bigint = ${lo}`);
    const D = S('DC', `select public.delete_character('${W.chars[0]}')`, user(W)); const ws = await waitState('DC', LOCKADV);
    await G.open(); const [rj, rd] = await Promise.all([Jw, D]); await un();
    const act = await q(`select count(*) from rwi.members where instance_id=${I} and player='${W.chars[0]}' and mstate='active'`);
    const wt = await q(`select count(*) from rwi.waitlist where instance_id=${I} and player='${W.chars[0]}' and status='waiting'`);
    ok(rj.code === 0 && rd.code === 0 && !dl(rj) && !dl(rd) && act === '0' && wt === '0' && (await INV()) === 0,
       `B2-1/K1-9g4 neu (${variante}): Beitritt hält A(W), Löschung wartet auf die Beratungssperre (${ws}); danach räumt die Löschung W auf – kein Geist mehr, INV-1 = 0`, `${line(rj)} | ${line(rd)}`);
    if (variante === 'dungeon') ok(held === '1', 'GP-6/V6-9: gehaltene Sperre ist die bigint-Form (objsubid = 1) mit dem gemeinsamen Schlüssel hashtextextended(\'rwi.char:\' || lower(id), 0)', `gefunden=${held}`);
  });

  // ===== B2-2: Charakterlöschung hält A(W) (vor dem Löschen), Beitritt startet =====
  await scen('B2-2', async () => {
    const [A1, A2, W] = [await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    const G = await gate(); const un = await trg('characters_zz_gate', 'before', 'delete', 'characters', 'tg_char', G.k, W.chars[0]);
    const D = S('DC', `select public.delete_character('${W.chars[0]}')`, user(W)); await waitState('DC', LOCKADV);
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); const ws = await waitState('J', LOCKADV);
    await G.open(); const [rd, rj] = await Promise.all([D, Jw]); await un();
    const rows = await q(`select (select count(*) from rwi.members where instance_id=${I} and player='${W.chars[0]}') + (select count(*) from rwi.waitlist where instance_id=${I} and player='${W.chars[0]}')`);
    ok(rd.code === 0 && rj.code === 0 && /not_eligible/.test(rj.out) && rows === '0' && (await INV()) === 0,
       'B2-2: Löschung hält A(W), Beitritt wartet (' + ws + ') und endet danach mit not_eligible; kein Eintrag für W, INV-1 = 0', `${line(rd)} | ${rj.out.slice(0, 80)}`);
  });

  // ===== B2-3: Kontolöschung hält A(W) und Instanzen, Beitritt startet; B2-3b: Konto hat einen zweiten Charakter in I (Zyklusprobe J ↔ D) =====
  for (const zweiter of [false, true]) await scen('B2-3' + (zweiter ? 'b' : ''), async () => {
    const [A1, A2] = [await acc(), await acc()]; const W = await acc(zweiter ? 2 : 1); const I = await grp(zweiter ? [A1.chars[0], W.chars[1]] : [A1.chars[0], A2.chars[0]]);
    const G = await gate(); const un = await trg('profiles_zz_gate', 'before', 'delete', 'profiles', 'tg_prof', G.k, W.id);
    const da = await delAcc('DA', W); const D = da(); await waitState('DA', LOCKADV);
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); const ws = await waitState('J', /Lock:/);
    await G.open(); const [rd, rj] = await Promise.all([D, Jw]); await un();
    ok(rd.code === 0 && !dl(rd) && !dl(rj) && (rj.code !== 0 ? /forbidden|not_found|not_eligible|not_authenticated/.test(rj.err) : /not_eligible|forbidden/.test(rj.out)) && (await INV()) === 0,
       `B2-3${zweiter ? 'b' : ''}: Kontolöschung hält A(alle) ${zweiter ? 'und I' : ''}, Beitritt wartet (${ws}); kein 40P01, kein Eintrag ohne Charakter`, `${line(rd)} | ${line(rj)}`);
  });

  // ===== B2-8 (B-2b): create_group hält A(X) (Haltepunkt nach eligible), Charakterlöschung von X startet =====
  await scen('B2-8', async () => {
    const [A1, X] = [await acc(), await acc()];
    const G = await gate(); const un = await wrapEligible(X.chars[0], G.k);
    const CG = S('CG', `select rwi.create_group('dungeon', array['${A1.chars[0]}','${X.chars[0]}']::text[], 2)`); await waitState('CG', LOCKADV);
    const D = S('DC', `select public.delete_character('${X.chars[0]}')`, user(X)); const ws = await waitState('DC', LOCKADV);
    await G.open(); const [rg, rd] = await Promise.all([CG, D]); await un();
    ok(rg.code === 0 && rd.code === 0 && !dl(rg) && !dl(rd) && (await INV()) === 0,
       'B2-8 (B-2b): create_group hält A(X), Charakterlöschung wartet (' + ws + '); danach räumt die Löschung X aus der neuen Instanz auf, INV-1 = 0', `${rg.out.slice(0, 60)} | ${line(rd)}`);
  });

  // ===== B2-12 (aus QA-Probe „A vor I“): Beitritt hält A(W) vor der Instanzsperre, Kontolöschung desselben Kontos mit zweitem Charakter in I =====
  // Prüft die Position der Sperrschleife in on_profile_deleting: A muss VOR den Instanzsperren genommen werden, sonst Zyklus J(A→I) ↔ D(I→A).
  await scen('B2-12', async () => {
    const A1 = await acc(); const W = await acc(2); const I = await grp([A1.chars[0], W.chars[1]]);
    const G = await gate();
    await q(`alter function rwi.join(bigint, text) rename to join_orig;
      create function rwi.join(p_instance bigint, p_player text) returns jsonb language plpgsql as $$ begin if p_player = '${W.chars[0]}' then perform testhook.gate(${G.k}); end if; return rwi.join_orig(p_instance, p_player); end $$;`);
    once(() => q(`drop function rwi.join(bigint, text); alter function rwi.join_orig(bigint, text) rename to "join";`));
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); await waitState('J', LOCKADV);
    const da = await delAcc('DA', W); const D = da(); const ws = await waitState('DA', LOCKADV);
    await G.open(); const [rj, rd] = await Promise.all([Jw, D]);
    ok(!dl(rj) && !dl(rd) && rd.code === 0 && (await q(`select count(*) from auth.users where id='${W.id}'`)) === '0' && (await INV()) === 0,
       `B2-12: Beitritt hält A(W) vor I, Kontolöschung (zweiter Charakter in I) wartet auf A (${ws}) statt I zu halten; kein 40P01, INV-1 = 0`, `${line(rj)} | ${line(rd)}`);
  });

  // ===== B6: Mehrzeilen-Löschungen ∥ create_group / group_join (docs/B6_BERICHT.md) =====
  // Hilfen: zwei Konten mit je einem Charakter, deren Schlüssel absteigend zur Anlagereihenfolge liegen (Zeilenreihenfolge ≠ Schlüsselreihenfolge).
  const pairDesc = async () => { for (let i = 0; i < 40; i++) { const a = await acc(), b = await acc(); if (BigInt(await key(a.chars[0])) > BigInt(await key(b.chars[0]))) return [a, b]; } throw new Error('kein absteigendes Paar'); };
  const holdKey = async (k) => { const h = cl.psql(`set application_name='HOLD'; select pg_advisory_lock(${k}); select pg_sleep(600);`);
    const t0 = Date.now(); while (+(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='HOLD' and l.locktype='advisory' and l.granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('HOLD'); await sleep(30); }
    return async () => { await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='HOLD'`); await h; }; };

  // B6-1: ein DELETE über zwei Charakterzeilen (Zeile 1 hat den größeren Schlüssel) ∥ create_group mit beiden (sortiert: kleiner Schlüssel zuerst)
  await scen('B6-1', async () => {
    const [A1, B1] = await pairDesc(); const x = A1.chars[0], y = B1.chars[0];          // key(x) > key(y), Zeile x vor Zeile y
    const free = await holdKey(await key(x));                                             // A(x) fremd gehalten: DELETE und create_group stehen an
    const Dd = S('DD', `delete from public.characters where character_id in ('${x}', '${y}')`); await waitState('DD', LOCKADV);
    const CG = S('CG', `select rwi.create_group('dungeon', array['${x}','${y}']::text[], 2)`); const ws = await waitState('CG', LOCKADV);
    await free(); const [rd, rc] = await Promise.all([Dd, CG]);
    ok(!dl(rd) && !dl(rc) && rd.code === 0 && (await q(`select count(*) from public.characters where character_id in ('${x}','${y}')`)) === '0'
       && (await q(`select count(*) from rwi.members where player in ('${x}','${y}') and mstate='active'`)) === '0' && (await INV()) === 0,
       `B6-1: mehrzeiliges DELETE (Zeilenfolge ≠ Schlüsselfolge) ∥ create_group mit beiden Charakteren – create_group wartet (${ws}); 0 × 40P01, kein aktives Mitglied ohne Charakter`, `${line(rd)} | ${rc.out.slice(0, 60)}${line(rc)}`);
  });

  // B6-2: ein DELETE über zwei Charakterzeilen, x ist Mitglied in I ∥ Beitritt von y nach I hält A(y) (angehalten vor rwi.join, d. h. vor der Instanzsperre)
  await scen('B6-2', async () => {
    const [A1, B1] = await pairDesc(); const x = A1.chars[0], y = B1.chars[0]; const O = await acc(); const I = await grp([O.chars[0], x]);
    const G = await gate();
    await q(`alter function rwi.join(bigint, text) rename to join_orig;
      create function rwi.join(p_instance bigint, p_player text) returns jsonb language plpgsql as $$ begin if p_player = '${y}' then perform testhook.gate(${G.k}); end if; return rwi.join_orig(p_instance, p_player); end $$;`);
    once(() => q(`drop function rwi.join(bigint, text); alter function rwi.join_orig(bigint, text) rename to "join";`));
    const Jy = S('J', `select public.group_join(${I}, '${y}')`, user(B1)); await waitState('J', LOCKADV);
    const Dd = S('DD', `delete from public.characters where character_id in ('${x}', '${y}')`); const ws = await waitState('DD', /Lock:/);
    const haeltI = +(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='DD' and l.locktype='tuple' and l.granted`))
                 + +(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid join pg_class c on c.oid = l.relation where a.application_name='DD' and c.relname='instances' and l.mode='RowShareLock'`));
    await G.open(); const [rj, rd] = await Promise.all([Jy, Dd]);
    ok(!dl(rj) && !dl(rd) && rd.code === 0 && (await q(`select count(*) from public.characters where character_id in ('${x}','${y}')`)) === '0' && (await INV()) === 0,
       `B6-2: mehrzeiliges DELETE (x Mitglied in I) ∥ Beitritt von y nach I – DELETE wartet auf A(y) (${ws}), bevor es eine Instanz sperrt (Instanz-Zeilensperren gehalten: ${haeltI}); 0 × 40P01, INV-1 = 0`, `${line(rj)} | ${line(rd)}`);
    ok(haeltI === 0, 'B6-2: DELETE hält beim Warten auf A(y) keine Instanzsperre (alle Beratungssperren vor der ersten Instanzsperre)', `haeltI=${haeltI}`);
  });

  // B6-3: Löschung ZWEIER Konten in EINER Anweisung ∥ create_group mit je einem Charakter beider Konten.
  // ohne Vorab-Sperre: bekannter Restfall B-6b (Kaskade sperrt je Konto, nicht global sortiert) – genau ein 40P01;
  // mit Vorab-Sperre: der ECHTE Lösch-Block aus supabase/dev/cleanup_test_accounts.sql (Prädikat auf die Testkonten dieses Falls eingeengt) – 0 × 40P01.
  const CLEAN_SRC = readFileSync(join(ROOT, 'supabase/dev/cleanup_test_accounts.sql'), 'utf8');
  const cleanBlock = (muster) => { const a = CLEAN_SRC.indexOf('do $$\ndeclare n bigint; k bigint;'); const e = CLEAN_SRC.indexOf('end $$;', a); if (a < 0 || e < 0) throw new Error('Lösch-Block nicht gefunden');
    const b = CLEAN_SRC.slice(a, e + 7); if (!b.includes("'%@rwtest.invalid'")) throw new Error('Prädikat nicht gefunden'); return b.split("'%@rwtest.invalid'").join(`'${muster}%@rwtest.invalid'`); };
  let ncl = 0; const pairDescNamed = async (pre) => { for (let i = 0; i < 40; i++) { const a = await E.account(`${pre}a${++ncl}`, 2), b = await E.account(`${pre}b${++ncl}`, 1);
    if (BigInt(await key(a.chars[0])) > BigInt(await key(b.chars[0])) && BigInt(await key(a.chars[0])) > BigInt(await key(a.chars[1]))) return [a, b]; } throw new Error('kein passendes Paar'); };
  for (const vorab of [false, true]) await scen('B6-3 ' + (vorab ? 'mit' : 'ohne') + ' Vorab-Sperre', async () => {
    const pre = `b6c${++ncl}x`; const [A1, B1] = await pairDescNamed(pre); const x = A1.chars[0], y = B1.chars[0]; const ids = `'${A1.id}','${B1.id}'`;
    const free = await holdKey(await key(x));
    const sql = vorab ? `begin; set local rw.rollback_confirm = 'ja-loeschen'; ${cleanBlock(pre)} commit;` : `begin; delete from auth.users where id in (${ids}); commit;`;
    const ADM = S('ADM', sql); await waitState('ADM', LOCKADV);
    const CG = S('CG', `select rwi.create_group('dungeon', array['${x}','${y}']::text[], 2)`); const ws = await waitState('CG', LOCKADV);
    await free(); const [ra, rc] = await Promise.all([ADM, CG]); const n = [ra, rc].filter(dl).length;
    const konten = await q(`select count(*) from auth.users where id in (${ids})`);
    if (vorab) ok(n === 0 && ra.code === 0 && konten === '0' && (await INV()) === 0, `B6-3 (echter Lösch-Block aus cleanup_test_accounts.sql): Löschung zweier Konten in einer Anweisung ∥ create_group – create_group wartet (${ws}); 0 × 40P01, beide Konten gelöscht, INV-1 = 0`, `40P01=${n} | ${line(ra)} | ${line(rc)}`);
    else { const bestaetigt = n === 1 && (await INV()) === 0; ok(bestaetigt, 'BEKANNT B-6b: Löschung zweier Konten in EINER Anweisung OHNE Vorab-Sperre ∥ create_group – genau ein 40P01, atomar (Betriebsregel: Konten einzeln oder mit Vorab-Sperre löschen)', `40P01=${n} konten=${konten} | ${line(ra)} | ${line(rc)}`);
      if (bestaetigt) known.push('B-6b Mehrkonten-Löschung ohne Vorab-Sperre'); }
  });

  // B6-4: Gegenprobe zur Sperrreihenfolge des Lösch-Blocks (U -> Pr -> A): der Block steht in seiner Vorab-Sperre (wartet auf das größte A) ∥ delete_character
  // eines Charakters desselben Testkontos (Pr zuerst). Korrekt: delete_character wartet am Profil, ohne eine Sperre zu halten; mit A vor Pr verklemmten sich beide.
  await scen('B6-4', async () => {
    const pre = `b6d${++ncl}x`; const [A1, B1] = await pairDescNamed(pre); const big = A1.chars[0], other = A1.chars[1];   // key(big) ist das Maximum, key(other) < key(big)
    const free = await holdKey(await key(big));
    const ADM = S('ADM', `begin; set local rw.rollback_confirm = 'ja-loeschen'; ${cleanBlock(pre)} commit;`); await waitState('ADM', LOCKADV);
    const DC = S('DC', `select public.delete_character('${other}')`, user(A1)); const ws = await waitState('DC', /Lock:/);
    await free(); const [ra, rd] = await Promise.all([ADM, DC]);
    ok(LOCKROW.test(ws) && !dl(ra) && !dl(rd) && ra.code === 0 && (await q(`select count(*) from auth.users where id in ('${A1.id}','${B1.id}')`)) === '0' && (await INV()) === 0,
       `B6-4: Lösch-Block (U -> Pr -> A) ∥ delete_character desselben Testkontos – delete_character wartet am Profil (${ws}), nicht an A; 0 × 40P01, Konten gelöscht`, `${line(ra)} | ${line(rd)}`);
  });

  // ===== B2-9: direktes Löschen eines Charakters (service_role/postgres, ohne delete_character) ∥ Beitritt hält A(W) – Schutz durch on_character_deleted =====
  await scen('B2-9', async () => {
    const [A1, A2, W] = [await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    const G = await gate(); const un = await wrapEligible(W.chars[0], G.k);
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); await waitState('J', LOCKADV);
    const D = S('DC', `delete from public.characters where character_id = '${W.chars[0]}'`); const ws = await waitState('DC', LOCKADV);
    await G.open(); const [rj, rd] = await Promise.all([Jw, D]); await un();
    ok(rj.code === 0 && rd.code === 0 && !dl(rj) && !dl(rd) && (await INV()) === 0,
       'B2-9: direktes Löschen (ohne delete_character) wartet im Trigger on_character_deleted auf A(W) (' + ws + ') und räumt den gleichzeitig bestätigten Beitritt auf, INV-1 = 0', `${line(rj)} | ${line(rd)}`);
  });

  // ===== GP-1/V6-1 und V6-2: Kontolöschung ∥ Charakterlöschung desselben Kontos (beide Reihenfolgen), X ohne bzw. mit Instanz =====
  for (const mitInstanz of [false, true]) {
    const tag = mitInstanz ? 'V6-2' : 'GP-1/V6-1';
    await scen(tag + ' D zuerst', async () => {
      const K = await acc(2); if (mitInstanz) { const A1 = await acc(); await grp([A1.chars[0], K.chars[1]]); }
      const G = await gate(); const un = await trg('profiles_zz_gate', 'before', 'delete', 'profiles', 'tg_prof', G.k, K.id);
      const da = await delAcc('DA', K); const D = da(); await waitState('DA', LOCKADV);
      const C = S('DC', `select public.delete_character('${K.chars[1]}')`, user(K)); const ws = await waitState('DC', /Lock:/);
      await G.open(); const [rd, rc] = await Promise.all([D, C]); await un();
      ok(rd.code === 0 && !dl(rd) && !dl(rc) && /not_found/.test(rc.err) && (await q(`select count(*) from public.characters where account_id='${K.id}'`)) === '0' && (await INV()) === 0,
         `${tag}: Kontolöschung hält das Profil zuerst, Charakterlöschung wartet am Profil (${ws}) und endet mit not_found; kein 40P01`, `${line(rd)} | ${line(rc)}`);
    });
    await scen(tag + ' D′ zuerst', async () => {
      const K = await acc(2); if (mitInstanz) { const A1 = await acc(); await grp([A1.chars[0], K.chars[1]]); }
      const G = await gate(); const un = await trg('characters_aa_gate', 'before', 'delete', 'characters', 'tg_char', G.k, K.chars[1]);   // vor backup_character (Name)
      const C = S('DC', `select public.delete_character('${K.chars[1]}')`, user(K)); await waitState('DC', LOCKADV);
      const da = await delAcc('DA', K); const D = da(); const ws = await waitState('DA', /Lock:/);
      await G.open(); const [rc, rd] = await Promise.all([C, D]); await un();
      ok(rc.code === 0 && rd.code === 0 && !dl(rc) && !dl(rd) && (await q(`select count(*) from auth.users where id='${K.id}'`)) === '0' && (await INV()) === 0,
         `${tag}: Charakterlöschung hält Profil (key share), A und C vor der Sicherung; Kontolöschung wartet am Profil (${ws}); beide erfolgreich, kein 40P01`, `${line(rc)} | ${line(rd)}`);
    });
  }

  // ===== V6-3: Löschen des Nutzers direkt (Supabase-Admin, delete from auth.users) ∥ Charakterlöschung =====
  for (const zuerst of ['admin', 'char']) await scen('V6-3 ' + zuerst, async () => {
    const K = await acc(2); const G = await gate();
    let un, first, second, ws;
    if (zuerst === 'admin') { un = await trg('profiles_zz_gate', 'before', 'delete', 'profiles', 'tg_prof', G.k, K.id); first = S('ADM', `delete from auth.users where id = '${K.id}'`); await waitState('ADM', LOCKADV);
      second = S('DC', `select public.delete_character('${K.chars[1]}')`, user(K)); ws = await waitState('DC', LOCKROW); }
    else { un = await trg('characters_aa_gate', 'before', 'delete', 'characters', 'tg_char', G.k, K.chars[1]); first = S('DC', `select public.delete_character('${K.chars[1]}')`, user(K)); await waitState('DC', LOCKADV);
      second = S('ADM', `delete from auth.users where id = '${K.id}'`); ws = await waitState('ADM', LOCKROW); }
    await G.open(); const rs = await Promise.all([first, second]); await un();
    ok(rs.every((r) => !dl(r) && (r.code === 0 || /not_found/.test(r.err))) && rs.filter((r) => r.code === 0).length >= 1 && (await q(`select count(*) from auth.users where id='${K.id}'`)) === '0'
       && (await q(`select count(*) from public.characters where account_id='${K.id}'`)) === '0' && (await INV()) === 0,
       `V6-3 (${zuerst} zuerst): Löschen des Nutzers direkt über auth.users ∥ Charakterlöschung, zweiter wartet (${ws}); kein 40P01`, rs.map(line).join(' | '));
  });

  // ===== B2-10: create_character ∥ Admin-Löschung desselben Kontos (Vollständigkeit der Sperrmenge in on_profile_deleting) =====
  for (const zuerst of ['neu', 'admin']) await scen('B2-10 ' + zuerst, async () => {
    const K = await acc(1); const [A1] = [await acc()]; await grp([A1.chars[0], K.chars[0]]); const G = await gate();
    const NEU = () => S('NEU', `select public.create_character(2, 'neu', '{"cls":"krieger","lv":5}'::jsonb)`, user(K));
    let un, first, second, ws;
    if (zuerst === 'neu') { un = await trg('characters_zz_gate', 'after', 'insert', 'characters', 'tg_char_ins', G.k, K.id); first = NEU(); await waitState('NEU', LOCKADV);
      second = S('ADM', `delete from auth.users where id = '${K.id}'`); ws = await waitState('ADM', /Lock:/); }
    else { un = await trg('profiles_zz_gate', 'before', 'delete', 'profiles', 'tg_prof', G.k, K.id); first = S('ADM', `delete from auth.users where id = '${K.id}'`); await waitState('ADM', LOCKADV);
      second = NEU(); ws = await waitState('NEU', /Lock:/); }
    await G.open(); const rs = await Promise.all([first, second]); await un();
    const adm = zuerst === 'neu' ? rs[1] : rs[0], neu = zuerst === 'neu' ? rs[0] : rs[1];
    ok(rs.every((r) => !dl(r)) && adm.code === 0 && (zuerst === 'admin' || neu.code === 0)
       && (await q(`select count(*) from public.characters where account_id='${K.id}'`)) === '0' && (await INV()) === 0,
       `B2-10 (${zuerst} zuerst): create_character ∥ Admin-Löschung desselben Kontos, zweiter wartet (${ws}); kein 40P01, kein verwaister Charakter, INV-1 = 0`, rs.map(line).join(' | '));
  });

  // ===== B2-11: B-5 (früher bekannter Betriebsfall): direktes Löschen (service_role/postgres/Dashboard) ∥ delete_character desselben Charakters, beide Reihenfolgen =====
  // delete_character sperrt die eigene Charakterzeile VOR der Beratungssperre – dieselbe Reihenfolge wie ein direktes DELETE (Zeile -> Trigger -> A). Kein Zyklus mehr.
  for (const zuerst of ['direkt', 'rpc']) await scen('B2-11 ' + zuerst, async () => {
    const K = await acc(2); const [A1] = [await acc()]; await grp([A1.chars[0], K.chars[1]]);
    const G = await gate(); const un = await trg('characters_aa_gate', 'before', 'delete', 'characters', 'tg_char', G.k, K.chars[1]);
    const DIR = () => S('DD', `delete from public.characters where character_id = '${K.chars[1]}'`), RPC = () => S('DC', `select public.delete_character('${K.chars[1]}')`, user(K));
    let first, second, ws;
    if (zuerst === 'direkt') { first = DIR(); await waitState('DD', LOCKADV); second = RPC(); ws = await waitState('DC', LOCKROW); }
    else { first = RPC(); await waitState('DC', LOCKADV); second = DIR(); ws = await waitState('DD', LOCKROW); }
    await G.open(); const [r1, r2] = await Promise.all([first, second]); await un();
    const [rDir, rRpc] = zuerst === 'direkt' ? [r1, r2] : [r2, r1];
    ok(!dl(r1) && !dl(r2) && rDir.code === 0 && (zuerst === 'rpc' ? rRpc.code === 0 : /not_found/.test(rRpc.err))
       && (await q(`select count(*) from public.characters where character_id='${K.chars[1]}'`)) === '0' && (await INV()) === 0,
       `B2-11 (${zuerst} zuerst): direktes DELETE ∥ delete_character desselben Charakters, zweiter wartet an der Charakterzeile (${ws}); kein 40P01 (B-5 behoben), INV-1 = 0`, `${line(r1)} | ${line(r2)}`);
  });

  // ===== V6-8c: Restfall zu B-5 mit dem Mechanismus von B-4 (bewusst NICHT behoben): direktes DELETE eines Charakters ∥ delete_account desselben Kontos =====
  // D_dir hält C(X) und braucht für die Löschsicherung Pr(ks); D hält Pr(upd) und wartet in der Kaskade auf C(X). Unabhängig von B2 (bestand vorher), nur Betrieb.
  await scen('V6-8c', async () => {
    const K = await acc(2);
    const G = await gate(); const un = await trg('characters_aa_gate', 'before', 'delete', 'characters', 'tg_char', G.k, K.chars[1]);
    const Dd = S('DD', `delete from public.characters where character_id = '${K.chars[1]}'`); await waitState('DD', LOCKADV);
    const da = await delAcc('DA', K); const D = da(); await waitState('DA', LOCKROW);
    await G.open(); const rs = await Promise.all([Dd, D]); await un();
    const [rDir, rAcc] = rs; const n = rs.filter(dl).length;
    const konto = await q(`select count(*) from auth.users where id='${K.id}'`), profil = await q(`select count(*) from public.profiles where account_id='${K.id}'`);
    const x = await q(`select count(*) from public.characters where character_id='${K.chars[1]}'`), y = await q(`select count(*) from public.characters where character_id='${K.chars[0]}'`);
    // Endzustand vollständig: genau ein Opfer; dessen Wirkung vollständig zurückgerollt, die des anderen vollständig ausgeführt
    const opferKonto = dl(rAcc) && rDir.code === 0 && konto === '1' && profil === '1' && x === '0' && y === '1';   // Kontolöschung abgebrochen: Konto/Profil/zweiter Charakter bleiben, X gelöscht
    const opferDirekt = dl(rDir) && rAcc.code === 0 && konto === '0' && profil === '0' && x === '0' && y === '0';  // direktes DELETE abgebrochen: Konto samt beiden Charakteren gelöscht
    const bestaetigt = n === 1 && (opferKonto || opferDirekt) && (await INV()) === 0;
    ok(bestaetigt, `BEKANNT (B-4-Mechanismus, Betrieb): direktes DELETE eines Charakters ∥ delete_account desselben Kontos – genau ein 40P01 (Opfer: ${opferKonto ? 'Kontolöschung' : opferDirekt ? 'direktes DELETE' : '?'}), Endzustand atomar: Ergebnis der Kontolöschung, Konto, Profil und beide Charaktere geprüft, INV-1 = 0 (unabhängig von B2)`,
       `40P01=${n} konto=${konto} profil=${profil} X=${x} Y=${y} | ${rs.map(line).join(' | ')}`);
    if (bestaetigt) known.push('B-4c direktes Löschen ∥ Kontolöschung');
  });

  // ===== V6-14: drei gleichzeitige delete_character desselben Charakters (Doppel-/Dreifachtipp) =====
  // Die Zeilensperre muss exklusiv sein (for update): mit for share/for key share erhalten alle drei die Zeile, warten auf A, und der Gewinner verklemmt sich beim Löschen mit den anderen.
  // (a) gesteuert: A(X) wird extern gehalten, alle drei starten; korrekt: einer wartet auf A, zwei an der Charakterzeile. (b) ungesteuert gleichzeitig, B2_DOPPEL Durchläufe.
  await scen('V6-14a', async () => {
    const K = await acc(2); const [A1] = [await acc()]; await grp([A1.chars[0], K.chars[1]]);
    const k = await key(K.chars[1]); const hold = cl.psql(`set application_name='HOLD'; select pg_advisory_lock(${k}); select pg_sleep(600);`);
    await (async () => { const t0 = Date.now(); while (+(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='HOLD' and l.locktype='advisory' and l.granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('HOLD'); await sleep(30); } })();
    const R1 = S('DC', `select public.delete_character('${K.chars[1]}')`, user(K)); const w1 = await waitState('DC', LOCKADV);
    const R2 = S('DC2', `select public.delete_character('${K.chars[1]}')`, user(K)), R3 = S('DC3', `select public.delete_character('${K.chars[1]}')`, user(K));
    const w2 = await waitState('DC2', /Lock:/), w3 = await waitState('DC3', /Lock:/);
    await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='HOLD'`); await hold;
    const rs = await Promise.all([R1, R2, R3]);
    ok(LOCKROW.test(w2) && LOCKROW.test(w3) && rs.every((r) => !dl(r)) && rs[0].code === 0 && /not_found/.test(rs[1].err) && /not_found/.test(rs[2].err)
       && (await q(`select count(*) from public.characters where character_id='${K.chars[1]}'`)) === '0' && (await INV()) === 0,
       `V6-14a: drei delete_character desselben Charakters bei gehaltener Beratungssperre – erster wartet auf A (${w1}), zweiter/dritter an der Charakterzeile (${w2}; ${w3}); 0 × 40P01, genau ein Erfolg, zwei not_found`, rs.map(line).join(' | '));
  });
  await scen('V6-14b', async () => {
    const N = +(process.env.B2_DOPPEL || 40); let d = 0, bad = 0; const info = [];
    for (let i = 0; i < N; i++) {
      const K = await acc(2); if (i % 2) { const A1 = await acc(); await grp([A1.chars[0], K.chars[1]]); }
      const sql = `set role authenticated; set request.jwt.claims = '${JSON.stringify({ sub: K.id, role: 'authenticated' })}'; select public.delete_character('${K.chars[1]}')`;
      const rs = await E.parallel([sql, sql, sql], 300);
      d += rs.filter(dl).length;
      if (rs.filter((r) => r.code === 0).length !== 1 || rs.some((r) => r.code !== 0 && !/not_found/.test(r.err)) || (await INV()) !== 0) { bad++; info.push(rs.map(line).join('/')); }
    }
    ok(d === 0 && bad === 0, `V6-14b: ${N} × drei ungesteuert gleichzeitige delete_character desselben Charakters (jeder zweite in einer Instanz): 0 × 40P01, je genau ein Erfolg, Rest not_found, INV-1 = 0`, `40P01=${d} abweichend=${bad} ${info.slice(0, 2).join(' ; ')}`);
  });

  // ===== V6-4: zwei Charakterlöschungen desselben Kontos gleichzeitig (Charaktere in zwei Instanzen; ein Konto darf je Instanz nur einen Charakter stellen) =====
  await scen('V6-4', async () => {
    const K = await acc(2); const [A1, A2] = [await acc(), await acc()]; await grp([A1.chars[0], K.chars[0]]); await grp([A2.chars[0], K.chars[1]]);
    const rs = await E.parallel(K.chars.map((c) => `set application_name='DC'; set role authenticated; set request.jwt.claims = '${JSON.stringify({ sub: K.id, role: 'authenticated' })}'; select public.delete_character('${c}')`));
    ok(rs.every((r) => r.code === 0 && !dl(r)) && (await q(`select count(*) from public.characters where account_id='${K.id}'`)) === '0' && (await INV()) === 0,
       'V6-4: zwei gleichzeitige Charakterlöschungen desselben Kontos (Profil key share verträglich), beide erfolgreich, kein 40P01, INV-1 = 0', rs.map(line).join(' | '));
  });

  // ===== V6-7: Charakterlöschung ∥ save_character / move_character desselben Charakters (beide Reihenfolgen) =====
  for (const op of ['save', 'move']) for (const zuerst of ['op', 'del']) await scen(`V6-7 ${op} ${zuerst}`, async () => {
    const K = await acc(3); const c = op === 'move' ? K.chars[2] : K.chars[0];
    if (op === 'move') await q(`delete from public.characters where character_id = '${K.chars[1]}'`);                       // Platz 2 frei machen (Zielplatz)
    const v = await q(`select version from public.characters where character_id='${c}'`);
    const opSql = op === 'save' ? `select public.save_character('${c}', ${v}, '{"cls":"krieger","lv":50,"x":1}'::jsonb)` : `select public.move_character('${c}', 2)`;
    const G = await gate(); let un, first, second, ws;
    if (zuerst === 'op') { un = await trg('characters_zz_gate', 'before', 'update', 'characters', 'tg_char', G.k, c); first = S('OP', opSql, user(K)); await waitState('OP', LOCKADV);
      second = S('DC', `select public.delete_character('${c}')`, user(K)); ws = await waitState('DC', LOCKROW); }
    else { un = await trg('characters_zz_gate', 'before', 'delete', 'characters', 'tg_char', G.k, c); first = S('DC', `select public.delete_character('${c}')`, user(K)); await waitState('DC', LOCKADV);
      second = S('OP', opSql, user(K)); ws = await waitState('OP', LOCKROW); }
    await G.open(); const rs = await Promise.all([first, second]); await un();
    const [rOp, rDel] = zuerst === 'op' ? rs : [rs[1], rs[0]];
    ok(rs.every((r) => !dl(r)) && rDel.code === 0 && (zuerst === 'op' ? rOp.code === 0 : (rOp.code !== 0 && /version_conflict|not_found/.test(rOp.err)))
       && (await q(`select count(*) from public.characters where character_id='${c}'`)) === '0',
       `V6-7: ${op}_character ∥ delete_character (${zuerst === 'op' ? op : 'Löschen'} zuerst), zweiter wartet (${ws}); kein 40P01, Charakter danach gelöscht`, rs.map(line).join(' | '));
  });

  // ===== V6-8 (B-4 behoben): delete_account ∥ save_character / move_character desselben Kontos, beide Reihenfolgen =====
  // save/move nehmen die Profilsperre (for key share) als erste Sperre; delete_account hält das Profil (for update). Beide warten am Profil, keiner hält die Charakterzeile.
  for (const op of ['save', 'move']) for (const zuerst of ['op', 'konto']) await scen(`V6-8 ${op} ${zuerst}`, async () => {
    const K = await acc(3); const c = op === 'move' ? K.chars[2] : K.chars[0];
    if (op === 'move') await q(`delete from public.characters where character_id = '${K.chars[1]}'`);
    const v = await q(`select version from public.characters where character_id='${c}'`);
    const opSql = op === 'save' ? `select public.save_character('${c}', ${v}, '{"cls":"krieger","lv":50,"x":2}'::jsonb)` : `select public.move_character('${c}', 2)`;
    const G = await gate(); let un, first, second, ws;
    if (zuerst === 'op') {   // op hält Profil (ks) und Charakterzeile, angehalten vor Sicherung/Audit; Kontolöschung muss am Profil warten
      un = await trg('characters_aa_gate', 'before', 'update', 'characters', 'tg_char', G.k, c);
      first = S('OP', opSql, user(K)); await waitState('OP', LOCKADV);
      const da = await delAcc('DA', K); second = da(); ws = await waitState('DA', LOCKROW);
    } else {                 // Kontolöschung hält das Profil (for update), angehalten beim Löschen des Profils; save/move muss am Profil warten, ohne C zu halten
      un = await trg('profiles_zz_gate', 'before', 'delete', 'profiles', 'tg_prof', G.k, K.id);
      const da = await delAcc('DA', K); first = da(); await waitState('DA', LOCKADV);
      second = S('OP', opSql, user(K)); ws = await waitState('OP', LOCKROW);
    }
    const haeltC = +(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = 'OP' and l.locktype = 'transactionid' and l.granted and l.mode = 'ExclusiveLock'`));
    await G.open(); const [r1, r2] = await Promise.all([first, second]); await un();
    const [ro, rd] = zuerst === 'op' ? [r1, r2] : [r2, r1];
    const konto = await q(`select count(*) from auth.users where id='${K.id}'`), chars = await q(`select count(*) from public.characters where account_id='${K.id}'`);
    const erwOp = zuerst === 'op' ? ro.code === 0 : (ro.code !== 0 && (op === 'save' ? /version_conflict/ : /not_found/).test(ro.err));
    ok(!dl(ro) && !dl(rd) && rd.code === 0 && erwOp && konto === '0' && chars === '0' && (zuerst === 'op' || haeltC === 0) && (await INV()) === 0,
       `V6-8 (B-4 behoben): ${op}_character ∥ delete_account desselben Kontos (${zuerst === 'op' ? op : 'Kontolöschung'} zuerst) – zweiter wartet am Profil (${ws})${zuerst === 'op' ? '' : ', ohne eine Schreibsperre zu halten'}; 0 × 40P01, Konto vollständig gelöscht, ${zuerst === 'op' ? op + ' erfolgreich' : op + ' endet mit ' + (op === 'save' ? 'version_conflict' : 'not_found')}`,
       `40P01=${[ro, rd].filter(dl).length} konto=${konto} chars=${chars} haeltC=${haeltC} | ${line(ro)} | ${line(rd)}`);
  });

  // ===== V6-9: gemeinsamer Schlüsselausdruck in public und rwi =====
  const src = J(await q(`select json_object_agg(p.oid::regprocedure::text, p.prosrc) from pg_proc p where p.oid in ('public.delete_character(uuid)'::regprocedure, 'public.group_join(bigint,uuid)'::regprocedure, 'rwi.on_character_deleted()'::regprocedure, 'rwi.on_profile_deleting()'::regprocedure, 'rwi.create_group(text,text[],integer,bigint,timestamp with time zone)'::regprocedure)`));
  ok(Object.keys(src).length === 5 && Object.values(src).every((s) => s.includes(`hashtextextended('rwi.char:' || lower(`) && s.includes('pg_advisory_xact_lock(')),
     'V6-9: alle fünf Stellen (delete_character, group_join, on_character_deleted, on_profile_deleting, create_group) nutzen hashtextextended(\'rwi.char:\' || lower(…), 0)', Object.keys(src).join(','));
  ok((await q(`select hashtextextended('rwi.char:' || lower(upper('cccc0001-0000-4000-8000-000000000000')), 0) = hashtextextended('rwi.char:' || lower('cccc0001-0000-4000-8000-000000000000'::uuid::text), 0)`)) === 't',
     'V6-9: Schlüssel unabhängig von Groß-/Kleinschreibung und gleich für uuid::text und Text');
  ok((await q(`begin; select pg_advisory_xact_lock(7002, 1); select count(*) from pg_locks where locktype='advisory' and pid = pg_backend_pid() and objsubid = 2 and classid = 7002 and objid = 1; commit;`)).split('\n').pop() === '1',
     'GP-6: bestehende (int4,int4)-Sperren (7001–7003) liegen im Schlüsselraum objsubid = 2, getrennt von der neuen bigint-Sperre (objsubid = 1)');

  // ===== GP-2: Mehrfachsperren dedupliziert und nach 64-Bit-Schlüssel sortiert (Schleife) =====
  ok(['rwi.on_profile_deleting()', 'rwi.create_group(text,text[],integer,bigint,timestamp with time zone)'].every((f) => /for kk in select distinct hashtextextended\('rwi\.char:' \|\| lower\([^)]*\), 0\) from [^;]* order by 1 loop\s+perform pg_advisory_xact_lock\(kk\);\s+end loop;/.test(src[f])),
     'GP-2 (strukturell): on_profile_deleting und create_group sperren per Schleife über deduplizierte, nach dem Schlüssel sortierte Werte (K-a); erzwungene Kollisionen sind ohne Änderung der Hashfunktion nicht herstellbar');

  // ===== V6-10: Rechte und Eigenschaften =====
  const props = await q(`select string_agg(p.oid::regprocedure::text || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ';'), '') || ':' || pg_get_userbyid(p.proowner), ' | ' order by 1) from pg_proc p where p.oid in ('public.delete_character(uuid)'::regprocedure, 'public.group_join(bigint,uuid)'::regprocedure, 'rwi.on_character_deleted()'::regprocedure, 'rwi.on_profile_deleting()'::regprocedure)`);
  ok(props.split(' | ').every((s) => /:true:search_path=public, pg_temp:postgres$/.test(s)), 'V6-10: delete_character, group_join, on_character_deleted, on_profile_deleting: SECURITY DEFINER, search_path = public, pg_temp, Eigentümer postgres', props);
  ok((await q(`select has_function_privilege('authenticated','public.delete_character(uuid)','execute') and not has_function_privilege('anon','public.delete_character(uuid)','execute')
             and has_function_privilege('authenticated','public.group_join(bigint,uuid)','execute') and not has_function_privilege('anon','public.group_join(bigint,uuid)','execute')
             and not has_function_privilege('authenticated','rwi.create_group(text,text[],integer,bigint,timestamp with time zone)','execute')`)) === 't',
     'V6-10: Ausführungsrechte unverändert (delete_character/group_join: authenticated ja, anon nein; create_group nicht für Clients)');

  // ===== V6-12 / GP-4: fremder Charakter – keine Sperre fremder Schlüssel (Eigentum vor der Beratungssperre) =====
  await scen('V6-12/GP-4', async () => {
    const [Own, Other, A1, A2] = [await acc(), await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    const k = await key(Own.chars[0]); const hold = cl.psql(`set application_name='HOLD'; select pg_advisory_lock(${k}); select pg_sleep(600);`);
    await (async () => { const t0 = Date.now(); while (+(await q(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='HOLD' and l.locktype='advisory' and l.granted`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('HOLD'); await sleep(30); } })();
    const t0 = Date.now(); const rd = await S('X1', `select public.delete_character('${Own.chars[0]}')`, { ...user(Other), timeout: '5s' }); const d1 = Date.now() - t0;
    const t1 = Date.now(); const rj = await S('X2', `select public.group_join(${I}, '${Own.chars[0]}')`, { ...user(Other), timeout: '5s' }); const d2 = Date.now() - t1;
    await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='HOLD'`); await hold;
    ok(/not_found/.test(rd.err) && d1 < 3000, `V6-12: delete_character mit fremdem Charakter endet sofort mit not_found, obwohl dessen Beratungssperre gehalten wird (${d1} ms) – keine Sperre fremder Schlüssel`, line(rd));
    const holdC = cl.psql(`set application_name='HOLD'; begin; select 1 from public.characters where character_id = '${Own.chars[0]}' for update; select pg_sleep(600);`);
    await (async () => { const t0 = Date.now(); while (+(await q(`select count(*) from pg_stat_activity where application_name='HOLD' and query like '%pg_sleep%' and state = 'active'`)) === 0) { if (Date.now() - t0 > 10000) throw new Error('HOLDC'); await sleep(30); } })();
    const t2 = Date.now(); const rc = await S('X3', `select public.delete_character('${Own.chars[0]}')`, { ...user(Other), timeout: '5s' }); const d3 = Date.now() - t2;
    await q(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='HOLD'`); await holdC;
    ok(/not_found/.test(rc.err) && d3 < 3000, `V6-12b: delete_character mit fremdem Charakter, dessen Zeile gesperrt ist, endet sofort mit not_found (${d3} ms) – die Zeilensperre (for update) greift nur auf eigene Zeilen`, line(rc));
    ok(/forbidden/.test(rj.err) && d2 < 3000, `GP-4: group_join mit fremdem Charakter endet sofort mit forbidden (${d2} ms) – Sperre erst nach der Eigentumsprüfung (K-b)`, line(rj));
  });

  // ===== GP-3: andere Isolationsstufe als READ COMMITTED wird abgewiesen =====
  await scen('GP-3', async () => {
    const [W, A1, A2, K] = [await acc(), await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]); const sid = await session(K);
    const rr = 'begin isolation level repeatable read;';
    const r1 = await S('RR1', `${rr} select public.group_join(${I}, '${W.chars[0]}');`, user(W));
    const r2 = await S('RR2', `${rr} select public.delete_character('${W.chars[0]}');`, user(W));
    const r3 = await S('RR3', `${rr} select rwi.create_group('dungeon', array['${A1.chars[0]}','${W.chars[0]}']::text[], 2);`);
    const r4 = await S('RR4', `${rr} select public.delete_account('${K.name}');`, user(K, { session_id: sid }));
    const r5 = await S('RR5', `begin isolation level serializable; delete from public.characters where character_id = '${W.chars[0]}';`);
    const all = [r1, r2, r3, r4, r5];
    ok(all.every((r) => r.code !== 0 && /read_committed_required/.test(r.err)) && (await q(`select count(*) from public.characters where character_id='${W.chars[0]}'`)) === '1' && (await q(`select count(*) from auth.users where id='${K.id}'`)) === '1',
       'GP-3: group_join, delete_character, create_group, delete_account (Trigger on_profile_deleting) und direktes Löschen (Trigger on_character_deleted) brechen unter REPEATABLE READ/SERIALIZABLE mit read_committed_required ab; nichts geändert', all.map(line).join(' | '));
  });

  // ===== GP-5: Charakter wird zwischen Eigentumsprüfung und Beratungssperre gelöscht =====
  await scen('GP-5', async () => {
    const [A1, A2, W] = [await acc(), await acc(), await acc()]; const I = await grp([A1.chars[0], A2.chars[0]]);
    const G = await gate(); const un = await wrapOwn(W.chars[0], G.k);
    const Jw = S('J', `select public.group_join(${I}, '${W.chars[0]}')`, user(W)); await waitState('J', LOCKADV);
    const rd = await S('DC', `select public.delete_character('${W.chars[0]}')`, user(W));
    await G.open(); const rj = await Jw; await un();
    ok(rd.code === 0 && rj.code === 0 && /not_eligible/.test(rj.out) && (await INV()) === 0, 'GP-5: Löschung zwischen own_character und Sperre -> Beitritt endet mit not_eligible (eligible liest nach der Sperre neu), INV-1 = 0', `${line(rd)} | ${rj.out.slice(0, 60)}`);
  });

  // ===== V6-11: Migration und Rollback gegen den Stand vor B2 (Upgrade-Pfad), beide Rechte-Modi =====
  for (const legacy of [false, true]) await scen('V6-11', async () => {
    const C2 = await startCluster(PORT + 1 + (legacy ? 1 : 0)); const q2 = async (s) => { const r = await C2.psql(s); if (r.code) throw new Error(r.err.slice(0, 300)); return r.out; };
    try {
      // Altstand unabhängig vom Git-Stand (CI-Checkout ist flach, nach dem Commit enthält HEAD schon V6′): schema.sql mit der Fassung aus der Rollback-Datei
      const fn = (t) => { const a = t.indexOf('create or replace function public.delete_character(p_id uuid)'); const e = t.indexOf('end $$;', a); if (a < 0 || e < 0) throw new Error('delete_character nicht gefunden'); return [a, e + 7]; };
      const neu = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8'), rb = readFileSync(join(ROOT, 'supabase/rollback_b2_loeschreihenfolge.sql'), 'utf8');
      const [na, ne] = fn(neu), [ra, re] = fn(rb); const old = neu.slice(0, na) + rb.slice(ra, re) + neu.slice(ne);
      const d3 = readFileSync(join(ROOT, 'supabase/migration_d3_konto_loeschen.sql'), 'utf8'); const [da3, de3] = fn(d3);
      ok(d3.slice(da3, de3) === rb.slice(ra, re), 'V6-11: Rollback-Fassung von delete_character ist wörtlich die Fassung aus migration_d3_konto_loeschen.sql (Stand vor B2)', '');
      if (old === neu || !/pg_advisory_xact_lock/.test(neu.slice(na, ne)) || /pg_advisory_xact_lock/.test(rb.slice(ra, re))) throw new Error('Altstand nicht ableitbar');
      await q2((legacy ? '\\set legacy 1\n' : '') + STUB); await q2(old);
      const md5 = () => q2(`select md5(prosrc) || ':' || prosecdef || ':' || array_to_string(proconfig, ';') || ':' || coalesce(array_to_string(proacl, ';'), '') from pg_proc where oid = 'public.delete_character(uuid)'::regprocedure`);
      const vorher = await md5(); await q2(readFileSync(join(ROOT, 'supabase/migration_b2_loeschreihenfolge.sql'), 'utf8')); const nach = await md5();
      const ziel = await q(`select md5(prosrc) from pg_proc where oid = 'public.delete_character(uuid)'::regprocedure`);
      await q2(readFileSync(join(ROOT, 'supabase/rollback_b2_loeschreihenfolge.sql'), 'utf8')); const zurueck = await md5();
      ok(nach.split(':')[0] === ziel && vorher !== nach && zurueck === vorher, `V6-11 (${legacy ? 'legacy' : 'neu'}): Migration auf dem Stand vor B2 ergibt exakt die neue Fassung aus schema.sql; Rollback stellt Quelltext, SECURITY DEFINER, search_path und ACL wieder her`, `${vorher.slice(0, 8)} -> ${nach.slice(0, 8)} -> ${zurueck.slice(0, 8)}`);
    } finally { C2.stop(); }
  });

  // ===== V6-15: Migration und Rollback B4 auf dem Stand vor B4 (Upgrade-Pfad), beide Rechte-Modi =====
  for (const legacy of [false, true]) await scen('V6-15', async () => {
    const C2 = await startCluster(PORT + 3 + (legacy ? 1 : 0)); const q2 = async (s) => { const r = await C2.psql(s); if (r.code) throw new Error(r.err.slice(0, 300)); return r.out; };
    try {
      const fn = (t, n) => { const a = t.indexOf(`create or replace function public.${n}(`); const e = t.indexOf('end $$;', a); if (a < 0 || e < 0) throw new Error(n + ' nicht gefunden'); return [a, e + 7]; };
      const neu = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8'), rb = readFileSync(join(ROOT, 'supabase/rollback_b4_speichern_reihenfolge.sql'), 'utf8');
      let old = neu; for (const n of ['save_character', 'move_character']) { const [na, ne] = fn(old, n), [ra, re] = fn(rb, n); if (/for key share/.test(rb.slice(ra, re))) throw new Error('Rollback enthält schon die Profilsperre'); old = old.slice(0, na) + rb.slice(ra, re) + old.slice(ne); }
      if (old === neu) throw new Error('Altstand nicht ableitbar');
      await q2((legacy ? '\\set legacy 1\n' : '') + STUB); await q2(old);
      const sig = { save_character: 'uuid,integer,jsonb', move_character: 'uuid,integer' };
      const md5 = async () => { const o = []; for (const n of Object.keys(sig)) o.push(await q2(`select md5(prosrc) || ':' || prosecdef || ':' || array_to_string(proconfig, ';') || ':' || coalesce(array_to_string(proacl, ';'), '') from pg_proc where oid = 'public.${n}(${sig[n]})'::regprocedure`)); return o.join('|'); };
      const vorher = await md5(); await q2(readFileSync(join(ROOT, 'supabase/migration_b4_speichern_reihenfolge.sql'), 'utf8')); const nach = await md5();
      const ziel = []; for (const n of Object.keys(sig)) ziel.push(await q(`select md5(prosrc) from pg_proc where oid = 'public.${n}(${sig[n]})'::regprocedure`));
      await q2(readFileSync(join(ROOT, 'supabase/rollback_b4_speichern_reihenfolge.sql'), 'utf8')); const zurueck = await md5();
      ok(nach.split('|').map((x) => x.split(':')[0]).join('|') === ziel.join('|') && vorher !== nach && zurueck === vorher,
         `V6-15 (${legacy ? 'legacy' : 'neu'}): Migration B4 auf dem Stand vor B4 ergibt exakt save_character/move_character aus schema.sql; Rollback stellt Quelltext, SECURITY DEFINER, search_path und ACL wieder her`, `${vorher.slice(0, 8)} -> ${nach.slice(0, 8)} -> ${zurueck.slice(0, 8)}`);
    } finally { C2.stop(); }
  });

  // ===== V6-13: Belastungsmischung =====
  // Mischung A ohne save/move: 0 × 40P01 gefordert. Mischung B mit save/move: ebenfalls 0 × 40P01 gefordert (B-4 behoben, docs/B4_BERICHT.md).
  const allowed = /email_not_verified|violates foreign key|not_authenticated|not_found|not_eligible|version_conflict|slot_occupied|forbidden|account_in_instance|already|no_rejoin|full/;
  for (const mix of ['A', 'B']) {
    let dlA = 0, dlB4 = 0, other = 0, invBad = 0, unexpected = [];
    for (let it = 0; it < MIX; it++) {
      const A = await acc(2), B = await acc(mix === 'B' ? 3 : 1), C = await acc(), Dd = await acc(), Ee = await acc(), F = await acc();
      if (mix === 'B') await q(`delete from public.characters where character_id = '${B.chars[1]}'`);
      const I = await grp([B.chars[0], C.chars[0]]); await grp([A.chars[1], Ee.chars[0]]);
      await q(`insert into rwi.waitlist(instance_id, player) values (${I}, '${A.chars[0]}')`);
      const sidA = await session(A), sidB = await session(B), sidF = await session(F);
      const as = (a, sid, sql) => `set role authenticated; set request.jwt.claims = '${JSON.stringify({ sub: a.id, role: 'authenticated', ...(sid ? { session_id: sid } : {}) })}'; ${sql}`;
      const ops = [
        ['D′', as(A, null, `select public.delete_character('${A.chars[0]}')`)],
        ['D', as(A, sidA, `select public.delete_account('${A.name}')`)],
        ['J', as(Dd, null, `select public.group_join(${I}, '${Dd.chars[0]}')`)],
        ['P', `select rwi.leave(${I}, '${C.chars[0]}')`],
        ['CG', `select rwi.create_group('dungeon', array['${F.chars[0]}','${Ee.chars[0]}']::text[], 2)`],
        ['Dadm', `delete from auth.users where id = '${F.id}'`],
        ['D′2', as(Dd, null, `select public.delete_character('${Dd.chars[0]}')`)],
        ['Ddir', `delete from public.characters where character_id = '${Dd.chars[0]}'`],
        ['NEUF', as(F, null, `select public.create_character(2, 'f${it}', '{"cls":"krieger","lv":5}'::jsonb)`)],
        ['NEU', as(Dd, null, `select public.create_character(2, 'n${it}', '{"cls":"krieger","lv":5}'::jsonb)`)],
      ];
      if (mix === 'B') {
        const vB = await q(`select version from public.characters where character_id='${B.chars[0]}'`);
        ops.push(['S', as(B, null, `select public.save_character('${B.chars[0]}', ${vB}, '{"cls":"krieger","lv":50,"it":${it}}'::jsonb)`)],
                 ['M', as(B, null, `select public.move_character('${B.chars[2]}', 2)`)],
                 ['DB', as(B, sidB, `select public.delete_account('${B.name}')`)]);
      }
      const rs = await E.parallel(ops.map(([, s]) => `select pg_backend_pid(); ${s}`), 300);
      const pidOp = {}; rs.forEach((r, i) => { const p = (r.out.match(/^\d+/m) || [])[0]; if (p) pidOp[p] = ops[i][0]; });
      rs.forEach((r, i) => { const n = ops[i][0];
        // B-4 nur, wenn ALLE in der Deadlock-Meldung genannten Prozesse zu save/move bzw. der Kontolöschung desselben Kontos (DB) gehören
        const beteiligt = [...(r.err || '').matchAll(/[Pp]rocess (\d+)/g)].map((m) => pidOp[m[1]] || '?');
        if (dl(r)) { if (mix === 'B' && beteiligt.length && beteiligt.every((o) => ['S', 'M', 'DB'].includes(o)) && beteiligt.includes('DB')) dlB4++; else { dlA++; unexpected.push(`${it}:${n}:deadlock(${beteiligt.join('+')})`); } }
        else if (r.code !== 0 && !allowed.test(r.err)) { other++; unexpected.push(`${it}:${n}:${(r.err.split('\n').find((l) => /ERROR/.test(l)) || r.err).slice(0, 80)}`); } });
      if ((await INV()) !== 0) { invBad++; unexpected.push(`${it}:INV`); }
    }
    ok(dlA === 0 && dlB4 === 0 && other === 0 && invBad === 0, `V6-13 Mischung ${mix} (${MIX} Durchläufe, gleichzeitig: Charakterlöschung (RPC und direkt), Kontolöschung, Admin-Löschung, Beitritt, Nachrücken, create_group, create_character${mix === 'B' ? ', save/move + Kontolöschung' : ''}): 0 × 40P01 (auch nicht zwischen save/move und Kontolöschung, B-4 behoben), keine unerwarteten Fehler, INV-1 = 0 nach jedem Durchlauf`, `40P01=${dlA} B-4=${dlB4} sonstige=${other} INV=${invBad} ${unexpected.slice(0, 4).join(' ; ')}`);
    if (mix === 'B') console.log(`  (Mischung B: Verklemmungen save/move ∥ Kontolöschung (früher B-4, jetzt Fehler): ${dlB4})`);
  }
} catch (e) { ok(false, 'Ablauf', e.message.slice(0, 300)); }
finally { E.stop(); }
console.log(`\nBEKANNTE FEHLER BESTÄTIGT: ${known.length}${known.length ? ' (' + known.join(', ') + ')' : ''}`);
process.exit(done());
