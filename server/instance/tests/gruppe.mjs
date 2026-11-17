// DB-Tests Gruppenverwaltung und instance_view: node server/instance/tests/gruppe.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, nextFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
import { decideRevive } from '../sim/bots.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const cl = await startCluster(54395);
const PB = null;
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s);
const CFG = { bossHp: 150, bossAtk: 8 };
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  const KL = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker'], ['magier', 'frost'], ['bogenschuetze', 'fallensteller']];
  for (let n = 1; n <= 24; n++) { const [g, p] = KL[n % KL.length]; await q(`insert into rwi.players values ('u${n}', 10, '${g}', '${p}', 3)`); }
  await q(`insert into rwi.players values ('low', 4, 'krieger', 'ritter', 3), ('nocls', 12, null, null, 0)`);
  const U = (...n) => n.map((x) => 'u' + x);
  const mk = async (players, { kind = 'dungeon', fights = 2, ends = null, event = null } = {}) =>
    J(await q(`select rwi.create_group('${kind}', array[${players.map((p) => `'${p}'`).join(',')}]::text[], ${fights}, ${event ?? 'null'}, ${ends ? `clock_timestamp() + interval '${ends}'` : 'null'})`));
  const call = async (fn, ...a) => J(await q(`select rwi.${fn}(${a.map((x) => typeof x === 'number' ? x : `'${x}'`).join(', ')})`));
  const ready = async (iid, ps) => { let r; for (const p of ps) r = await call('set_ready', iid, p); return r; };
  const fightsOf = async (iid) => J(await q(`select coalesce(json_agg(row_to_json(f) order by id), '[]') from (select id, status, round_no, state from rwi.fights where instance_id=${iid}) f`));
  const start = async (iid) => {
    const roster = J(await q(`select rwi.roster(${iid})`)), prev = (await fightsOf(iid)).pop(), S = prev ? nextFight(prev.state, roster, CFG) : newFight(roster, CFG);
    return J(await q(`select rwi.start_fight(${iid}, $j$${JSON.stringify(S)}$j$::jsonb)`));
  };
  const run = async (fid) => {
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
    const c = J(await q(`select rwi.claim_resolution(${fid}, (select round_no from rwi.fights where id=${fid}))`)); if (c.status !== 'ok') return { c };
    const res = resolveClaim(c.input);
    const k = J(await q(`select rwi.commit_round(${fid}, ${c.input.round_no}, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`));
    return { c, res, k };
  };
  const playOut = async (iid) => {
    const fid = +(await q(`select max(id) from rwi.fights where instance_id=${iid}`));
    for (let g = 0; g < 60; g++) {
      const f = J(await q(`select row_to_json(f) from (select round_no, status, state from rwi.fights where id=${fid}) f`)); if (f.status !== 'active') return { fid, status: f.status };
      for (const m of f.state.members) if (m.alive && !m.gone) await q(`select rwi.submit_action_for('${m.id}', ${fid}, ${f.round_no}, $j$${JSON.stringify(decideRevive(f.state, m))}$j$::jsonb)`);
      await run(fid);
    }
    return { fid, status: 'timeout' };
  };
  const ent = async (iid, p) => J(await q(`select coalesce(json_agg(json_build_object('f', fight_no, 'k', kind, 'void', void) order by fight_no, kind), '[]') from rwi.entitlements where instance_id=${iid} and player='${p}'`));
  const inst = async (iid) => J(await q(`select row_to_json(i) from (select status, stage, outcome, fight_no from rwi.instances where id=${iid}) i`));
  const mem = async (iid, p) => { const r = await q(`select row_to_json(m) from (select * from rwi.members where instance_id=${iid} and player='${p}') m`); return r ? J(r) : null; };

  // als Sitzung eines authentifizierten Spielers ausführen (wie auth.uid() aus dem Token)
  const as = async (player, sql) => J(await q(`set request.jwt.claim.sub = '${player}'; ${sql}`));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parallel = async (sqls, leadMs = 700) => {                 // alle Aufrufe warten in der Datenbank auf denselben Zeitpunkt
    const at = await q(`select to_char(clock_timestamp() + interval '${leadMs} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`);
    return Promise.all(sqls.map((s) => cl.psql(`select pg_sleep_until('${at}'::timestamp::timestamptz); ${s}`)));
  };
  const setMem = (iid, p, set) => q(`update rwi.members set ${set} where instance_id=${iid} and player='${p}'`);

  // 1) Gruppengröße: feste Größen je Typ, keine frei wählbaren Parameter
  ok((await mk(U(1))).status === 'bad_size', 'normales Dungeon: eine Person unter Mindestgröße 2 abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5))).status === 'bad_size' && (await mk(U(1, 2, 3, 4, 5, 6, 7, 8))).status === 'bad_size', 'normales Dungeon: fünf und mehr Personen über Höchstgröße 4 abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5, 6, 7, 8, 9), { kind: 'special' })).status === 'bad_size' && (await mk(U(1, 2, 3, 4, 5, 6, 7, 8, 9), { kind: 'weltboss', fights: 1, event: 1, ends: '1 hour' })).status === 'bad_size', 'besonderes Dungeon und Weltboss: neun Personen über Höchstgröße 8 abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5), { kind: 'special' })).status === 'bad_size' && (await mk(U(1, 2, 3, 4, 5), { kind: 'weltboss', fights: 1, event: 1, ends: '1 hour' })).status === 'bad_size', 'besonderes Dungeon und Weltboss: unter 6 Spielern abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5, 6), { kind: 'special' })).status === 'ok' && (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).status === 'ok', 'besonderes Dungeon mit 6 und mit 8 Spielern wird angelegt');
  ok((await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1, event: 70, ends: '1 hour' })).status === 'ok', 'Weltboss mit 6 Spielern wird angelegt');
  ok((await mk(U(1, 2), { fights: 1 })).status === 'single_fight_dungeon', 'normales Ein-Kampf-Dungeon ist nicht vorgesehen und wird ausdrücklich abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 2, event: 1, ends: '1 hour' })).status === 'bad_weltboss' && (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1 })).status === 'bad_weltboss', 'Weltboss: genau ein Kampf und ein Event mit Endzeit nötig');
  ok((await mk(U(1, 2, 3, 4, 5, 6), { kind: 'special', event: 5, ends: '1 hour' })).status === 'bad_weltboss' && (await mk(U(1, 2), { kind: 'quatsch' })).status === 'bad_kind', 'nur der Weltboss hat Event und Endzeit, unbekannte Typen abgelehnt');
  { const pr = await q(`select pg_get_function_arguments(oid) from pg_proc where proname='create_group'`); ok(!/min|max/i.test(pr), 'create_group hat keine Parameter für Mindest- oder Höchstgröße', pr); }
  { const bad = [];
    for (const [k, mn, mx] of [['dungeon', 1, 4], ['dungeon', 3, 4], ['dungeon', 2, 8], ['dungeon', 2, 5], ['special', 2, 8], ['special', 6, 4], ['weltboss', 2, 8], ['weltboss', 6, 9]]) { const r = await cl.psql(`insert into rwi.instances(kind, min_size, max_size) values ('${k}', ${mn}, ${mx})`); if (!r.code) bad.push(`${k}/${mn}/${mx}`); }
    ok(bad.length === 0, 'auch ein direkter Eintrag mit freien Größen wird von der Datenbank abgelehnt (Prüfregel instances_size_rule)', bad.join(','));
    const good = [];
    for (const [k, mn, mx] of [['dungeon', 2, 4], ['special', 6, 8], ['weltboss', 6, 8]]) { const r = await cl.psql(`insert into rwi.instances(kind, min_size, max_size) values ('${k}', ${mn}, ${mx})`); if (r.code) good.push(k); }
    ok(good.length === 0, 'die verbindlichen Größen (2–4 / 6–8 / 6–8) werden direkt akzeptiert', good.join(','));
    const G = (await mk(U(1, 2))).instance; const upd = await cl.psql(`update rwi.instances set max_size = 8 where id=${G}`); ok(upd.code !== 0, 'Höchstgröße eines normalen Dungeons lässt sich nachträglich nicht auf 8 anheben'); }
  ok((await mk(['u1', 'low'])).status === 'not_eligible' && (await mk(['u1', 'nocls'])).status === 'not_eligible', 'Instanzzugang erst ab Level 5 mit Grundklasse');
  ok((await mk(['u1', 'u1'])).status === 'duplicate', 'doppelter Spieler abgelehnt');
  ok((await mk(U(1, 2, 3, 4))).status === 'ok' && (await mk(U(1, 2))).status === 'ok', 'normales Dungeon mit 4 und mit 2 Spielern wird angelegt');

  // 2) Beitritt, Warteliste, Nachrücken (normales Mehrkampf-Dungeon, 8 Plätze, 3 Kämpfe)
  const G1 = (await mk(U(1, 2), { fights: 3 })).instance;
  { let all = true; for (const n of [3, 4]) all = all && (await call('join', G1, 'u' + n)).status === 'joined'; ok(all, 'vor dem ersten Kampf: Beitritt bis zur Höchstgröße 4'); }
  const w9 = await call('join', G1, 'u5'), w10 = await call('join', G1, 'u6');
  ok(w9.status === 'waitlisted' && w9.position === 1 && w10.position === 2, 'voll: Warteliste in Reihenfolge', JSON.stringify([w9, w10]));
  ok((await call('join', G1, 'u5')).status === 'already_waiting' && (await call('join', G1, 'u1')).status === 'already_member' && (await call('join', G1, 'low')).status === 'not_eligible', 'doppelte Anmeldung und Unberechtigte werden abgewiesen');
  ok((await call('set_ready', G1, 'u5')).status === 'not_member', 'Wartende können nicht „Bereit“ sagen');
  await ready(G1, U(1, 2, 3));
  ok((await start(G1)).status === 'not_all_ready', 'Start nur wenn alle bereit sind');
  { const roster = J(await q(`select rwi.roster(${G1})`)), S = newFight(roster.slice(0, 3), CFG); S.members[0].legacy = true;
    await call('set_ready', G1, 'u4');
    ok(J(await q(`select rwi.start_fight(${G1}, $j$${JSON.stringify(S)}$j$::jsonb)`)).status === 'legacy_rejected', 'Referenzprofil (legacy) wird beim Kampfstart abgelehnt');
    ok(J(await q(`select rwi.start_fight(${G1}, $j$${JSON.stringify(newFight(roster.slice(0, 3), CFG))}$j$::jsonb)`)).status === 'state_mismatch', 'Kampfzustand muss genau die aktiven Mitglieder enthalten'); }
  const s1 = await start(G1); ok(s1.status === 'ok' && s1.fight_no === 1 && (await inst(G1)).stage === 'fight', 'Kampf 1 startet');
  ok((await call('join', G1, 'u7')).status === 'waitlisted', 'während eines Kampfes: nur Warteliste, keine Teilnahme');
  ok((await call('set_ready', G1, 'u1')).status === 'not_ready_phase', '„Bereit“ nur in der Bereitschaftsphase');
  { const fid = s1.fight, rr = await q(`select round_no from rwi.fights where id=${fid}`);
    ok(J(await q(`select rwi.submit_action_for('u5', ${fid}, ${rr}, '{"ability":"standard"}'::jsonb)`)).status === 'forbidden', 'Wartende können keine Aktion in einem laufenden Kampf abgeben'); }
  ok((await call('leave', G1, 'u6')).status === 'left_waitlist', 'Austritt von der Warteliste');
  const pl1 = await playOut(G1); ok(pl1.status === 'won', 'Kampf 1 gewonnen', pl1.status);
  ok((await inst(G1)).stage === 'ready', 'nach dem Sieg beginnt die Bereitschaftsphase');
  const e1 = await ent(G1, 'u1'); ok(e1.length === 2 && e1.every((x) => !x.void), 'Teilnehmer erhalten Kampf-EP- und Beute-Berechtigung für Kampf 1');
  ok((await ent(G1, 'u5')).length === 0 && (await ent(G1, 'u7')).length === 0, 'Wartende erhalten nichts für Kampf 1');
  { const m1 = await mem(G1, 'u1'); ok(m1.ready === false && m1.ready_due !== null, 'neue Bereitschaftsfrist (60 s) für alle'); }
  ok((await call('leave', G1, 'u2')).status === 'left', 'freiwilliger Austritt');
  { const e = await ent(G1, 'u2'); ok(e.find((x) => x.k === 'kampf_ep' && !x.void) && e.find((x) => x.k === 'beute' && x.void), 'Austritt: Beute entfällt, bereits gutgeschriebene Kampf-EP bleiben', JSON.stringify(e)); }
  { const m9 = await mem(G1, 'u5'), m11 = await mem(G1, 'u7'); ok(m9 && m9.mstate === 'active' && m9.potions === 3 && m9.joined_after_fights === 1 && !m11, 'frei gewordener Platz: Nachrücker u5 (erste in der Warteliste) mit 3 eigenen Heiltränken'); }
  ok((await call('join', G1, 'u2')).status === 'no_rejoin', 'kein Wiederbeitritt nach freiwilligem Austritt');
  ok((await ent(G1, 'u5')).length === 0, 'Nachrücker erhält keine rückwirkenden Ansprüche');
  ok((await call('set_ready', G1, 'u5')).status === 'ok', 'Nachrücker kann Bereitschaft bestätigen');
  await ready(G1, U(1, 3, 4));
  ok((await call('set_ready', G1, 'u1')).status === 'ok', 'Bereitschaft ist wiederholbar, aber nicht widerrufbar');
  const s2 = await start(G1); ok(s2.status === 'ok' && s2.fight_no === 2, 'Kampf 2 startet mit den verbliebenen Spielern');
  { const f2 = (await fightsOf(G1)).pop(), f1 = (await fightsOf(G1))[0], by = Object.fromEntries(f2.state.members.map((m) => [m.id, m])), b1 = Object.fromEntries(f1.state.members.map((m) => [m.id, m]));
    ok(!by.u2 && by.u5 && f1.state.members.every((m) => m.id !== 'u5'), 'Kampfzustand: u2 weg, u5 neu, u5 war nicht im ersten Kampf');
    ok(by.u5.hp === Math.floor(by.u5.maxhp / 2) && Object.keys(by.u5.cd).length === 0, 'Nachrücker: Platzhalter-Lebensanteil (50 %), keine Abklingzeiten');
    ok(['u1', 'u3', 'u4'].every((k) => by[k].alive && by[k].st.length === 0 && by[k].revives === 0 && by[k].deaths === 0 && by[k].hp === (b1[k].alive ? b1[k].hp : Math.floor(b1[k].maxhp / 10))), 'Bestehende: HP bleiben, Status weg, Wiederbelebungslimit neu');
    ok(f2.state.monster.hp === 150 && f2.state.monster.maxhp === 150, 'neuer Kampf: Gegner unabhängig konfiguriert'); }
  { const G = (await mk(U(1, 2), { fights: 3 })).instance; await ready(G, U(1, 2)); await start(G);
    const j = await call('join', G, 'u13'); ok(j.status === 'waitlisted' && (await mem(G, 'u13')) === null && +(await q(`select count(*) from rwi.members where instance_id=${G}`)) === 2, 'freier Platz, aber Kampf läuft: Aufnahme erst zwischen Kämpfen (keine Teilnahme am laufenden Kampf)', JSON.stringify(j));
    const pl = await playOut(G); const m = await mem(G, 'u13'); ok(pl.status === 'won' && m && m.mstate === 'active' && m.joined_after_fights === 1 && (await ent(G, 'u13')).length === 0, 'nach dem Kampf rückt sie nach, ohne Ansprüche für den abgeschlossenen Kampf'); }

  // 3) Austritt/Entfernung im letzten Kampf: Ansprüche und Abschlussbelohnung
  const G2 = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance;
  await ready(G2, U(1, 2, 3, 4)); await start(G2); await playOut(G2);
  await ready(G2, U(1, 2, 3, 4)); const s22 = await start(G2); ok(s22.fight_no === 2, 'G2: letzter Kampf läuft');
  ok((await call('join', G2, 'u9')).status === 'no_join', 'im letzten Kampf kein Nachrücken mehr');
  await call('leave', G2, 'u2'); await q(`update rwi.members set disc_since = clock_timestamp() - interval '301 seconds', connected = false where instance_id=${G2} and player='u3'`);
  const tk = J(await q(`select rwi.group_tick()`)); ok(tk.removed === 1 && (await mem(G2, 'u3')).leave_reason === 'abwesenheit' && (await mem(G2, 'u3')).mstate === 'removed', 'Abwesenheit 5 Minuten: automatisch entfernt, Ursache „abwesenheit“', JSON.stringify(tk));
  const pl2 = await playOut(G2); ok(pl2.status === 'won', 'G2: Kampf 2 trotz Austritt und Entfernung gewonnen', pl2.status);
  { const l = await q(`select input->'snapshot'->'left' from rwi.round_results where fight_id=${s22.fight} and round_no=1`); ok(l === '["u2", "u3"]', 'Snapshot meldet Ausgeschiedene an die Engine', l); }
  { const f = (await fightsOf(G2)).pop(); ok(f.state.members.find((m) => m.id === 'u2').gone && f.state.members.find((m) => m.id === 'u3').gone, 'Engine markiert beide als ausgeschieden'); }
  { const e2 = await ent(G2, 'u2'), e3 = await ent(G2, 'u3'), e1 = await ent(G2, 'u1');
    ok(e2.filter((x) => x.f === 2).every((x) => x.void) && e3.filter((x) => x.f === 2).every((x) => x.void), 'wer während des Kampfes ausscheidet: keine Berechtigung aus diesem Kampf');
    ok(e1.length === 4 && e1.every((x) => !x.void), 'Verbliebene behalten alle Ansprüche');
    ok(e3.find((x) => x.f === 1 && x.k === 'beute' && !x.void) && e3.find((x) => x.f === 1 && x.k === 'kampf_ep' && !x.void), 'automatisch Entfernter behält verdiente Ansprüche aus Kampf 1');
    ok(e2.find((x) => x.f === 1 && x.k === 'beute' && x.void) && e2.find((x) => x.f === 1 && x.k === 'kampf_ep' && !x.void), 'freiwillig Ausgetretener: Beute aus Kampf 1 entfällt, Kampf-EP bleiben'); }
  ok(+(await q(`select count(*) from rwi.rewards where instance_id=${G1}`)) === 0, 'keine Abschlussbelohnung nach Einzelkämpfen (G1 läuft noch)');
  { const fin = (await q(`select string_agg(test_member, ',' order by test_member) from rwi.rewards where instance_id=${G2} and reward_id like 'final:%'`)); ok(fin === 'u1,u4', 'Abschlussbelohnung nur für Verbliebene; u2 (freiwillig) und u3 (ohne Beitrag im letzten Kampf) nicht', fin); }
  ok((await inst(G2)).outcome === 'won' && (await inst(G2)).stage === 'done', 'Instanz endet mit Sieg');
  ok((await call('join', G2, 'u3')).status !== 'joined' && (await call('join', G2, 'u9')).status !== 'joined', 'nach Instanzende kein Beitritt');

  // 3b) Abschlussbelohnung bei automatischer Entfernung nach Beitrag (Regel: verdiente Ansprüche gehen nicht pauschal verloren)
  { const BIG = { bossHp: 700, bossAtk: 6 }; const G = (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).instance;
    await ready(G, U(1, 2, 3, 4, 5, 6, 7, 8)); await start(G); await playOut(G); await ready(G, U(1, 2, 3, 4, 5, 6, 7, 8));
    const roster = J(await q(`select rwi.roster(${G})`)), prev = (await fightsOf(G)).pop(), S = nextFight(prev.state, roster, BIG);
    const sf = J(await q(`select rwi.start_fight(${G}, $j$${JSON.stringify(S)}$j$::jsonb)`)); ok(sf.status === 'ok', '3b: letzter Kampf mit stärkerem Gegner läuft');
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '301 seconds', connected = false where instance_id=${G} and player='u4'`); await q(`select rwi.group_tick()`);   // u4: entfernt, bevor er etwas getan hat
    const fid = sf.fight; const f0 = J(await q(`select row_to_json(f) from (select round_no, state from rwi.fights where id=${fid}) f`));
    for (const m of f0.state.members) if (m.alive && !['u4'].includes(m.id)) await q(`select rwi.submit_action_for('${m.id}', ${fid}, ${f0.round_no}, $j$${JSON.stringify(decideRevive(f0.state, m))}$j$::jsonb)`);
    await run(fid);                                                                            // Runde 1: u2, u3, u5, u6 handeln
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '301 seconds', connected = false where instance_id=${G} and player='u3'`); await q(`select rwi.group_tick()`);   // u3: nach Beitrag entfernt
    await call('leave', G, 'u2');                                                              // u2: nach Beitrag freiwillig ausgetreten
    const pl = await playOut(G); ok(pl.status === 'won', '3b: Kampf gewonnen', pl.status);
    const fin = await q(`select string_agg(test_member, ',' order by test_member) from rwi.rewards where instance_id=${G} and reward_id like 'final:%'`);
    ok(fin === 'u1,u3,u5,u6,u7,u8', 'Entfernt nach Beitrag (u3): Abschlussbelohnung bleibt. Entfernt ohne Beitrag (u4) und freiwillig Ausgetretene (u2) erhalten sie nicht', fin);
    const e3 = await ent(G, 'u3'), e4 = await ent(G, 'u4'); ok(e3.filter((x) => x.f === 1).every((x) => !x.void) && e3.filter((x) => x.f === 2).every((x) => x.void), 'u3: Ansprüche aus Kampf 1 bleiben, Kampf 2 (beim Entfernen laufend) nicht abgeschlossen');
    ok((await mem(G, 'u3')).leave_reason === 'abwesenheit' && (await mem(G, 'u2')).leave_reason === 'freiwillig', 'Ursachen bleiben unterscheidbar (abwesenheit / freiwillig)');
    ok(+(await q(`select rwi.contribution(${G}, 'u3')`)) >= 1 && +(await q(`select rwi.contribution(${G}, 'u4')`)) === 0, 'Beitragszählung: u3 mindestens eine Aktion, u4 keine'); }
  { const G = (await mk(U(1, 2, 3), { fights: 2 })).instance; await ready(G, U(1, 2, 3)); await start(G); await playOut(G); await ready(G, U(1, 2, 3));
    await q(`update rwi.cfg set v = 99 where k='contribution_min'`); const roster = J(await q(`select rwi.roster(${G})`)), prev = (await fightsOf(G)).pop();
    const sf = J(await q(`select rwi.start_fight(${G}, $j$${JSON.stringify(nextFight(prev.state, roster, { bossHp: 400, bossAtk: 6 }))}$j$::jsonb)`)); await run(sf.fight);
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '301 seconds', connected = false where instance_id=${G} and player='u3'`); await q(`select rwi.group_tick()`); await playOut(G);
    ok(!(await q(`select string_agg(test_member, ',') from rwi.rewards where instance_id=${G} and reward_id like 'final:%'`)).includes('u3'), 'Beitragsschwelle ist konfigurierbar (Balance): unter der Schwelle keine Abschlussbelohnung'); await q(`update rwi.cfg set v = 1 where k='contribution_min'`); }

  // 4) Bereitschaftsfristen, Abwesenheit, Mindestgröße, Abbruch (besonderes Dungeon: Mindestgröße 6)
  { const G = (await mk(U(1, 2, 3, 4, 5, 6, 7), { kind: 'special', fights: 2 })).instance;
    await call('set_ready', G, 'u1'); await setMem(G, 'u2', `ready_due = clock_timestamp() - interval '1 second'`);
    let t = J(await q(`select rwi.group_tick()`)); const m2 = await mem(G, 'u2');
    ok(t.removed === 1 && m2.mstate === 'removed' && m2.leave_reason === 'bereitschaft', 'verbundener Spieler ohne Bereitschaft nach 60 s: entfernt (Ursache „bereitschaft“)');
    ok((await inst(G)).status === 'active', '6 von min. 6 verbleiben: weiter');
    ok((await call('join', G, 'u2')).status === 'no_rejoin', 'Entfernter kann nicht erneut beitreten');
    await call('set_connection', G, 'u3', 'false'); const d = await mem(G, 'u3'); ok(d.ready_due === null && d.disc_since !== null, 'getrennter Spieler: Bereitschaftsfrist ruht, Abwesenheit läuft');
    t = J(await q(`select rwi.group_tick()`)); ok(t.removed === 0, 'getrennter Spieler wird durch die Bereitschaftsfrist nicht entfernt');
    await q(`select rwi.set_connection(${G}, 'u3', true)`); const r3 = await mem(G, 'u3'); ok(r3.disc_since === null && r3.ready_due !== null, 'Wiederverbindung innerhalb der Frist: Abwesenheit zurückgesetzt, 60 s ab Wiederverbindung');
    await q(`select rwi.set_connection(${G}, 'u1', false)`); ok((await mem(G, 'u1')).ready === true, 'bestätigte Bereitschaft bleibt bei Verbindungsabbruch');
    ok((await inst(G)).stage === 'ready' && (await q(`select (paused_at is not null) from rwi.instances where id=${G}`)) === 'f', 'in der Bereitschaftsphase keine Gruppenpause');
    await setMem(G, 'u1', `disc_since = clock_timestamp() - interval '299 seconds'`); t = J(await q(`select rwi.group_tick()`)); ok((await mem(G, 'u1')).mstate === 'active', 'Abwesenheit knapp unter 5 Minuten: noch nicht entfernt');
    await setMem(G, 'u1', `disc_since = clock_timestamp() - interval '600 seconds'`); await q(`insert into rwi.system_gaps(from_at, to_at) values (clock_timestamp() - interval '500 seconds', clock_timestamp() - interval '100 seconds')`);
    t = J(await q(`select rwi.group_tick()`)); ok((await mem(G, 'u1')).mstate === 'active', 'Störungsfenster zählt nicht als Abwesenheit');
    await q(`delete from rwi.system_gaps`);
    await setMem(G, 'u3', `ready_due = clock_timestamp() - interval '1 second'`); t = J(await q(`select rwi.group_tick()`));
    const ii = await inst(G); ok(t.aborted === 1 && ii.status === 'aborted' && ii.outcome === 'aborted', 'automatische Entfernung unter die Mindestgröße (6): Instanz abgebrochen', JSON.stringify(ii)); }
  { const G = (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).instance;
    for (const k of ['u2', 'u3', 'u4']) await call('leave', G, k);
    ok((await inst(G)).status === 'active' && +(await q(`select count(*) from rwi.members where instance_id=${G} and mstate='active'`)) === 5, 'freiwilliger Austritt unter die Mindestgröße: Gruppe darf weiterspielen');
    await setMem(G, 'u8', `ready_due = clock_timestamp() - interval '1 second'`); const t = J(await q(`select rwi.group_tick()`));
    ok((await inst(G)).status === 'aborted', 'danach führt eine automatische Entfernung zum Abbruch (auch wenn schon freiwillig darunter)', JSON.stringify(t));
    const G6 = (await mk(U(5, 6), { fights: 2 })).instance; await call('leave', G6, 'u5'); const l = await call('leave', G6, 'u6'); ok(l.instance_ended && (await inst(G6)).status === 'aborted', 'wenn alle freiwillig gehen, endet die Instanz'); }
  { const G = (await mk(U(1, 2, 3, 4, 5, 6, 7), { kind: 'special', fights: 2 })).instance; await call('leave', G, 'u7'); await call('leave', G, 'u6'); await ready(G, U(1, 2, 3, 4, 5));
    ok((await start(G)).status === 'below_min', 'erster Kampf startet nicht unter der Mindestgröße'); }
  { const G = (await mk(U(1, 2, 3), { fights: 2 })).instance; for (const k of ['u1', 'u2', 'u3']) await q(`select rwi.set_connection(${G}, '${k}', false)`);
    ok((await q(`select (paused_at is not null) from rwi.instances where id=${G}`)) === 'f', 'alle getrennt in der Bereitschaftsphase: keine Pause'); }
  { const G = (await mk(U(1, 2), { fights: 2 })).instance; await ready(G, U(1, 2)); const t = J(await q(`select rwi.watchdog_tick()`)); ok(t.group.start.includes(G), 'Watchdog meldet startbereite Gruppe'); }

  // 4b) Fristen unter der Instanzsperre: Ready, Wiederverbindung, Worker-Verzögerung, Parallelität
  { const G = (await mk(U(1, 2, 3), { fights: 2 })).instance;
    await setMem(G, 'u1', `ready_due = clock_timestamp() + interval '1500 milliseconds'`);
    const a = await call('set_ready', G, 'u1'); ok(a.status === 'ok' && (await mem(G, 'u1')).ready, 'Ready kurz vor Fristablauf wird angenommen');
    await setMem(G, 'u2', `ready_due = clock_timestamp() - interval '1 millisecond'`);
    const b = await call('set_ready', G, 'u2'); const m2 = await mem(G, 'u2');
    ok(b.status === 'removed' && b.reason === 'bereitschaft' && m2.mstate === 'removed' && !m2.ready, 'Ready eine Millisekunde nach Fristablauf: abgelehnt, Spieler entfernt – ohne dass group_tick gelaufen ist');
    ok(+(await q(`select count(*) from rwi.group_log where instance_id=${G} and event='ausgeschieden' and player='u2'`)) === 1, 'genau ein Austrittseintrag');
    const t = J(await q(`select rwi.group_tick()`)); ok(t.removed === 0 && +(await q(`select count(*) from rwi.group_log where instance_id=${G} and event='ausgeschieden' and player='u2'`)) === 1, 'Worker-Verzögerung: der spätere Tick entfernt nicht noch einmal');
    ok((await call('set_ready', G, 'u2')).status === 'not_member', 'entfernter Spieler kann nicht mehr bestätigen');
    await setMem(G, 'u3', `ready_due = clock_timestamp() - interval '5 seconds'`); const c = await call('set_ready', G, 'u3'); ok(c.status === 'removed', 'deutlich verspätetes Ready: abgelehnt'); }
  { const G = (await mk(U(1, 2, 3), { fights: 2 })).instance;
    await call('set_ready', G, 'u1'); await setMem(G, 'u1', `ready_due = null`);                  // bereits bestätigt
    await q(`update rwi.members set ready_due = clock_timestamp() - interval '1 second' where instance_id=${G} and player='u2'`);
    await call('set_ready', G, 'u2'); /* verspätet */ const t = J(await q(`select rwi.group_tick()`));
    ok((await mem(G, 'u1')).mstate === 'active' && (await mem(G, 'u1')).ready, 'rechtzeitig bestätigte Bereitschaft bleibt auch bei verspätetem Worker gültig'); }
  { const G = (await mk(U(1, 2, 3), { fights: 2 })).instance;
    await q(`select rwi.set_connection(${G}, 'u1', false)`);
    await setMem(G, 'u1', `disc_since = clock_timestamp() - interval '299 seconds'`); const ok1 = J(await q(`select rwi.set_connection(${G}, 'u1', true)`));
    ok(ok1.status !== 'removed' && (await mem(G, 'u1')).mstate === 'active' && (await mem(G, 'u1')).disc_since === null, 'Wiederverbindung nach 299 s: bleibt, Abwesenheit zurückgesetzt');
    await q(`select rwi.set_connection(${G}, 'u2', false)`); await setMem(G, 'u2', `disc_since = clock_timestamp() - interval '301 seconds'`);
    const late = J(await q(`select rwi.set_connection(${G}, 'u2', true)`)); const m2 = await mem(G, 'u2');
    ok(late.status === 'removed' && late.reason === 'abwesenheit' && m2.mstate === 'removed' && m2.leave_reason === 'abwesenheit', 'Wiederverbindung nach 301 s: entfernt, obwohl der Worker noch nicht lief');
    ok(m2.connected === false && m2.disc_since === null, 'entfernter Spieler gilt nicht als verbunden');
    await q(`select rwi.set_connection(${G}, 'u3', false)`); await setMem(G, 'u3', `disc_since = clock_timestamp() - interval '400 seconds'`); await q(`insert into rwi.system_gaps(from_at, to_at) values (clock_timestamp() - interval '390 seconds', clock_timestamp() - interval '20 seconds')`);
    ok(J(await q(`select rwi.set_connection(${G}, 'u3', true)`)).status !== 'removed' && (await mem(G, 'u3')).mstate === 'active', 'Wiederverbindung nach Störungsfenster: Abwesenheit zählt erst ab dem Ende des Fensters');
    await q(`delete from rwi.system_gaps`); }
  { // Abwesenheit auch bei Gruppenpause und im laufenden Kampf: Frist läuft weiter, Pause bleibt davon unberührt
    const G = (await mk(U(1, 2), { fights: 2 })).instance; await ready(G, U(1, 2)); await start(G);
    await q(`select rwi.set_connection(${G}, 'u1', false)`); await q(`select rwi.set_connection(${G}, 'u2', false)`);
    ok((await q(`select (paused_at is not null) from rwi.instances where id=${G}`)) === 't', 'im Kampf: niemand verbunden = Gruppenpause');
    await setMem(G, 'u1', `disc_since = clock_timestamp() - interval '301 seconds'`); await q(`select rwi.set_connection(${G}, 'u1', true)`);
    ok((await mem(G, 'u1')).mstate === 'removed' && (await mem(G, 'u1')).leave_reason === 'abwesenheit', 'Abwesenheitsfrist läuft während der Gruppenpause weiter'); }
  { // Absicherung gegen inkonsistente Altwerte: bestätigte Bereitschaft und Kampfphase werden nie durch eine alte Frist entfernt
    const G = (await mk(U(1, 2, 3), { fights: 2 })).instance;
    await setMem(G, 'u1', `ready = true, ready_due = clock_timestamp() - interval '10 seconds'`); await q(`select rwi.group_tick()`);
    ok((await mem(G, 'u1')).mstate === 'active', 'bestätigte Bereitschaft wird auch mit alter Frist nicht entfernt');
    const H = (await mk(U(4, 5), { fights: 2 })).instance; await ready(H, U(4, 5)); await start(H);
    await setMem(H, 'u4', `ready = false, ready_due = clock_timestamp() - interval '10 seconds'`); await q(`select rwi.group_tick()`);
    ok((await mem(H, 'u4')).mstate === 'active', 'im laufenden Kampf gilt keine Bereitschaftsfrist'); }
  // parallel: Ready gegen Worker rund um die Frist; Wiederverbindung gegen Worker rund um die 5 Minuten
  { let bad = 0, ready_ok = 0, removed = 0;
    for (let k = 0; k < 14; k++) {
      const G = (await mk(U(1, 2, 3), { fights: 2 })).instance; const lead = 700, off = (k % 7 - 3) * 40;            // Frist −120 … +120 ms um den Startzeitpunkt
      await q(`update rwi.members set ready_due = clock_timestamp() + interval '${lead + off} milliseconds' where instance_id=${G} and player='u1'`);
      const [r1] = await parallel([`select rwi.set_ready(${G}, 'u1')`, `select rwi.group_tick()`, `select rwi.watchdog_tick()`], lead);
      const res = J(r1.out), m = await mem(G, 'u1');
      const consistent = (res.status === 'ok' && m.mstate === 'active' && m.ready) || (res.status === 'removed' && m.mstate === 'removed' && !m.ready) || (res.status === 'not_member' && m.mstate === 'removed' && !m.ready);
      const logs = +(await q(`select count(*) from rwi.group_log where instance_id=${G} and event='ausgeschieden' and player='u1'`));
      if (!consistent || logs > 1 || (m.mstate === 'removed' && logs !== 1)) bad++; if (m.mstate === 'active') ready_ok++; else removed++;
    }
    ok(bad === 0 && ready_ok > 0 && removed > 0, 'parallele Ready- und Worker-Aufrufe um die Frist: immer ein eindeutiges Ergebnis (angenommen ODER entfernt, nie beides, nie doppelt)', `angenommen=${ready_ok}, entfernt=${removed}, Fehler=${bad}`); }
  { let bad = 0, stay = 0, gone = 0;
    for (let k = 0; k < 14; k++) {
      const G = (await mk(U(1, 2, 3), { fights: 2 })).instance; const lead = 700, off = (k % 7 - 3) * 40;
      await q(`select rwi.set_connection(${G}, 'u1', false)`); await q(`update rwi.members set disc_since = clock_timestamp() - interval '300 seconds' + interval '${lead + off} milliseconds' where instance_id=${G} and player='u1'`);
      const [r1] = await parallel([`set request.jwt.claim.sub = 'u1'; select rwi.heartbeat(${G})`, `select rwi.group_tick()`, `select rwi.watchdog_tick()`], lead);
      const res = J(r1.out.split('\n').pop()), m = await mem(G, 'u1');
      const consistent = (res.status !== 'removed' && res.status !== 'not_member' && m.mstate === 'active' && m.disc_since === null && m.connected) || (['removed', 'not_member'].includes(res.status) && m.mstate === 'removed' && m.leave_reason === 'abwesenheit');
      const logs = +(await q(`select count(*) from rwi.group_log where instance_id=${G} and event='ausgeschieden' and player='u1'`));
      if (!consistent || logs > 1) bad++; if (m.mstate === 'active') stay++; else gone++;
    }
    ok(bad === 0 && stay > 0 && gone > 0, 'parallele Heartbeat- und Worker-Aufrufe um die 5-Minuten-Grenze: eindeutig (bleibt verbunden ODER entfernt)', `bleibt=${stay}, entfernt=${gone}, Fehler=${bad}`); }

  // 4c) Heartbeat: nur Serverzeit, Identität nur aus der Sitzung, atomar
  { const G = (await mk(U(1, 2), { fights: 2 })).instance;
    const sig = await q(`select pg_get_function_arguments(oid) from pg_proc where proname='heartbeat'`); ok(sig === 'p_instance bigint', 'heartbeat nimmt weder Zeit noch Spieler-ID entgegen', sig);
    const r = await cl.psql(`select rwi.heartbeat(${G}, now() + interval '1 day')`); ok(r.code !== 0, 'ein Aufruf mit Clientzeit wird von der Datenbank abgelehnt (keine solche Funktion)');
    const r2 = await cl.psql(`select rwi.heartbeat(${G}, 'u1')`); ok(r2.code !== 0, 'ein Aufruf mit Spieler-ID als Parameter wird abgelehnt');
    ok(J(await q(`select rwi.heartbeat(${G})`)).status === 'unauthenticated', 'ohne authentifizierte Sitzung: abgewiesen');
    ok((await as('u9', `select rwi.heartbeat(${G})`)).status === 'not_member', 'Sitzung eines Fremden: nichts');
    await setMem(G, 'u1', `last_seen_at = '2000-01-01', connected = false`); await q(`delete from rwi.system_heartbeat`);
    const lo = await q(`select clock_timestamp()`); const hb = await as('u1', `set timezone = 'Pacific/Auckland'; set rwi.now = '2099-01-01'; select rwi.heartbeat(${G})`); const hi = await q(`select clock_timestamp()`);
    const seen = await q(`select last_seen_at from rwi.members where instance_id=${G} and player='u1'`), sys = await q(`select at from rwi.system_heartbeat`);
    ok(hb.status !== 'removed' && seen >= lo.slice(0, 23) && seen <= hi && (await q(`select (last_seen_at >= '${lo}'::timestamptz and last_seen_at <= '${hi}'::timestamptz and (select at between '${lo}'::timestamptz and '${hi}'::timestamptz from rwi.system_heartbeat)) from rwi.members where instance_id=${G} and player='u1'`)) === 't', 'Anwesenheit und Systemherzschlag tragen ausschließlich die Serverzeit (Clientzeit und Zeitzone wirkungslos)', `${seen} / ${sys}`);
    const m1 = await mem(G, 'u1'); ok(m1.connected === true && m1.disc_since === null, 'Anwesenheit und Verbindungsstatus gemeinsam aktualisiert');
    await setMem(G, 'u2', `disc_since = clock_timestamp() - interval '301 seconds', connected = false, last_seen_at = '2000-01-01'`); const late = await as('u2', `select rwi.heartbeat(${G})`); const m2 = await mem(G, 'u2');
    ok(late.status === 'removed' && m2.mstate === 'removed' && m2.last_seen_at.slice(0, 4) !== '' && (await q(`select (last_seen_at < clock_timestamp() - interval '1 second') from rwi.members where instance_id=${G} and player='u2'`)) === 't', 'Heartbeat nach abgelaufener Abwesenheit: Entfernung statt Verbindung, last_seen wird nicht gesetzt');
    ok((await as('u2', `select rwi.heartbeat(${G})`)).status === 'not_member', 'Entfernter kann sich nicht per Heartbeat zurückmelden'); }

  // 4d) Obergrenze 4 gilt auch bei direkten SQL-Aufrufen (nicht nur über join)
  { const G = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance;
    const r = await cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at) values (${G}, 'u5', 'u5', clock_timestamp())`);
    ok(r.code !== 0 && /Gruppe voll/.test(r.err || r.out || '') && +(await q(`select count(*) from rwi.members where instance_id=${G}`)) === 4, 'direktes Einfügen eines fünften Spielers in ein normales Dungeon scheitert (Tabellenwächter)', r.err || '');
    const r2 = await cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at) select ${G}, 'u' || x, 'u' || x, clock_timestamp() from generate_series(5, 9) x`);
    ok(r2.code !== 0 && +(await q(`select count(*) from rwi.members where instance_id=${G}`)) === 4, 'auch mehrere Zeilen in einer Anweisung werden zusammen abgelehnt');
    await q(`insert into rwi.waitlist(instance_id, player) values (${G}, 'u5'), (${G}, 'u6')`);
    ok(J(await q(`select rwi.promote_waitlist(${G})`)) === 0 && +(await q(`select count(*) from rwi.members where instance_id=${G} and mstate='active'`)) === 4, 'direkter Aufruf von promote_waitlist nimmt bei voller Gruppe niemanden auf');
    await call('leave', G, 'u4'); ok(+(await q(`select count(*) from rwi.members where instance_id=${G} and mstate='active'`)) === 4 && (await mem(G, 'u5')).mstate === 'active' && (await mem(G, 'u6')) === null && J(await q(`select rwi.promote_waitlist(${G})`)) === 0, 'nach einem Austritt rückt genau eine Person nach (4 aktive), ein weiterer Aufruf nimmt niemanden mehr auf');
    await q(`update rwi.members set mstate='left', leave_reason='freiwillig' where instance_id=${G} and player='u1'`);
    const back = await cl.psql(`update rwi.members set mstate='active' where instance_id=${G} and player='u1'`);
    ok(+(await q(`select count(*) from rwi.members where instance_id=${G} and mstate='active'`)) <= 4, 'Reaktivieren über direkte Aktualisierung kann die Obergrenze nicht überschreiten');
    const W = (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).instance; const r3 = await cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at) values (${W}, 'u9', 'u9', clock_timestamp())`);
    ok(r3.code !== 0 && /Gruppe voll/.test(r3.err || r3.out || ''), 'besonderes Dungeon: neunter Spieler direkt eingefügt scheitert'); }
  { const G = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance; const w = await call('join', G, 'u5');
    ok(w.status === 'waitlisted' && (await call('join', G, 'u6')).position === 2, 'normales Dungeon voll mit 4: weitere Spieler landen auf der Warteliste'); }

  // 4e) Nachrücken und Mindestgröße nach automatischer Entfernung, je Aufrufweg
  { // Workerweg: group_tick entfernt, der Wartende rückt nach
    const G = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance; await call('join', G, 'u5'); await setMem(G, 'u4', `ready_due = clock_timestamp() - interval '1 second'`);
    const t = J(await q(`select rwi.group_tick()`)); const m5 = await mem(G, 'u5');
    ok(t.removed === 1 && (await mem(G, 'u4')).mstate === 'removed' && m5 && m5.mstate === 'active', 'Worker: automatische Entfernung (Ready-Frist) lässt den Wartenden nachrücken'); }
  { // Clientweg über set_ready
    const G = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance; await call('join', G, 'u5'); await setMem(G, 'u4', `ready_due = clock_timestamp() - interval '1 second'`);
    const r = await call('set_ready', G, 'u4'); const m5 = await mem(G, 'u5');
    ok(r.status === 'removed' && m5 && m5.mstate === 'active', 'Client (set_ready): automatische Entfernung lässt den Wartenden nachrücken'); }
  { // Clientweg über Wiederverbindung/Heartbeat (Abwesenheit)
    const G = (await mk(U(1, 2, 3, 4), { fights: 2 })).instance; await call('join', G, 'u5'); await setMem(G, 'u3', `disc_since = clock_timestamp() - interval '301 seconds', connected = false`);
    const r = await as('u3', `select rwi.heartbeat(${G})`); const m5 = await mem(G, 'u5');
    ok(r.status === 'removed' && m5 && m5.mstate === 'active', 'Client (Heartbeat nach Abwesenheit): Wartender rückt nach'); }
  { // Mindestgrößenabbruch, normales Dungeon (2 Spieler), beide Wege
    const A = (await mk(U(1, 2), { fights: 2 })).instance; await setMem(A, 'u2', `ready_due = clock_timestamp() - interval '1 second'`); const t = J(await q(`select rwi.group_tick()`));
    ok(t.aborted === 1 && (await inst(A)).status === 'aborted', 'Worker: Entfernung unter Mindestgröße 2 bricht die Instanz ab');
    const B = (await mk(U(1, 2), { fights: 2 })).instance; await setMem(B, 'u2', `ready_due = clock_timestamp() - interval '1 second'`); const r = await call('set_ready', B, 'u2');
    ok(r.status === 'removed' && r.instance_aborted === true && (await inst(B)).status === 'aborted', 'Client (set_ready): Entfernung unter Mindestgröße 2 bricht die Instanz ab');
    const C = (await mk(U(1, 2), { fights: 2 })).instance; await setMem(C, 'u2', `disc_since = clock_timestamp() - interval '301 seconds', connected = false`); const h = await as('u2', `select rwi.heartbeat(${C})`);
    ok(h.status === 'removed' && (await inst(C)).status === 'aborted', 'Client (Heartbeat): Abwesenheit unter Mindestgröße bricht die Instanz ab'); }
  { // Störungsfenster auf beiden Wegen
    const G = (await mk(U(1, 2, 3), { fights: 2 })).instance;
    await setMem(G, 'u1', `disc_since = clock_timestamp() - interval '400 seconds', connected = false`); await setMem(G, 'u2', `disc_since = clock_timestamp() - interval '400 seconds', connected = false`);
    await q(`insert into rwi.system_gaps(from_at, to_at) values (clock_timestamp() - interval '390 seconds', clock_timestamp() - interval '20 seconds')`);
    const t = J(await q(`select rwi.group_tick()`)); const h = await as('u2', `select rwi.heartbeat(${G})`);
    ok(t.removed === 0 && (await mem(G, 'u1')).mstate === 'active' && h.status !== 'removed' && (await mem(G, 'u2')).mstate === 'active', 'Störungsfenster: weder Worker noch Heartbeat entfernen wegen Abwesenheit im Fenster');
    await q(`delete from rwi.system_gaps`); }

  // 5) Weltboss (Typ) und besondere Dungeons: Beitritt, kein Nachrücken, Eventende
  { const G = (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1, event: 77, ends: '1 hour' })).instance;
    ok((await call('join', G, 'u9')).status === 'joined' && (await call('join', G, 'u10')).status === 'joined' && (await call('join', G, 'u11')).status === 'full', 'Weltboss: Beitritt vor dem Start bis 8, danach voll, keine Warteliste');
    await ready(G, U(1, 2, 3, 4, 5, 6, 9, 10)); const s = await start(G); ok(s.status === 'ok', 'Weltboss-Kampf startet');
    ok((await call('join', G, 'u11')).status === 'no_join', 'Weltboss: kein Nachrücken nach dem Start'); }
  { const G = (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'special', fights: 1 })).instance; ok((await call('join', G, 'u7')).status === 'joined' && (await call('join', G, 'u8')).status === 'joined' && (await call('join', G, 'u9')).status === 'full', 'besonderes Ein-Kampf-Dungeon: Beitritt nur mit freiem Platz, keine Warteliste (kein Übergang)');
    const G2b = (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).instance; const w = await call('join', G2b, 'u9'); ok(w.status === 'waitlisted', 'besonderes Mehrkampf-Dungeon: Warteliste möglich'); }
  { const G = (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1, event: 78, ends: '1 hour' })).instance; await q(`update rwi.instances set kind = 'special' where id=${G}`);
    ok(J(await q(`select rwi.join(${G}, 'u9')`)).status === 'joined', 'Einkampf-Verhalten hängt am Typ UND an der Kampfzahl, nicht allein an einem von beiden (special mit 1 Kampf verhält sich wie Einkampf)'); }
  for (const [name, fn] of [['join', (G) => call('join', G, 'u9')], ['set_ready', (G) => call('set_ready', G, 'u1')], ['start_fight', async (G) => { const S = newFight(J(await q(`select rwi.roster(${G})`)), CFG); return J(await q(`select rwi.start_fight(${G}, $j$${JSON.stringify(S)}$j$::jsonb)`)); }], ['leave', (G) => call('leave', G, 'u1')], ['heartbeat', (G) => as('u1', `select rwi.heartbeat(${G})`)]]) {
    const G = (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1, event: 79, ends: '1 hour' })).instance;
    if (name === 'start_fight') await ready(G, U(1, 2, 3, 4, 5, 6));
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${G}`);
    const r = await fn(G); const st = (await inst(G)).status;
    ok(r.status === 'event_ended' && st === 'event_ended', `Eventende: ${name} wird abgewiesen, Instanz beendet`, `${r.status}/${st}`);
    if (name === 'start_fight') ok(+(await q(`select count(*) from rwi.fights where instance_id=${G}`)) === 0, 'nach Eventende startet kein Kampf'); }

  // 6) instance_view
  const GA = (await mk(U(1, 2, 3), { fights: 2 })).instance, GB = (await mk(U(11, 12), { fights: 2 })).instance;
  await ready(GA, U(1, 2, 3)); const sA = await start(GA); await ready(GB, U(11, 12)); await start(GB);
  const V = async (iid, p, kv = null) => J(await q(`select rwi.instance_view(${iid}, '${p}', ${kv ?? 'null'})`));
  ok((await V(GA, 'u11')).status === 'forbidden' && (await V(GB, 'u1')).status === 'forbidden', 'fremde Gruppeninstanzen werden nicht offengelegt');
  ok(JSON.stringify(await V(999999, 'u1')) === JSON.stringify(await V(GB, 'u1')), 'unbekannte und fremde Instanz sind nicht unterscheidbar');
  ok((await V(GA, 'u9')).status === 'forbidden', 'Spieler ohne Beziehung zur Instanz: nichts');
  const rn = +(await q(`select round_no from rwi.fights where id=${sA.fight}`));
  await q(`select rwi.submit_action_for('u1', ${sA.fight}, ${rn}, '{"ability":"wuchtschlag","target":"boss"}'::jsonb)`);
  const v1 = await V(GA, 'u1'), v2 = await V(GA, 'u2'), txt2 = JSON.stringify(v2);
  ok(v1.fight.my_action && v1.fight.my_action.ability === 'wuchtschlag', 'eigene bestätigte Aktion ist sichtbar');
  ok(v2.fight.my_action === null && !txt2.includes('wuchtschlag') && v2.fight.members.find((m) => m.key === 'u1').confirmed === true && v2.fight.members.find((m) => m.key === 'u3').confirmed === false, 'fremde Aktionen: nur „bestätigt ja/nein“, keine Inhalte');
  { const bad = ['seed', 'claim_token', 'snapshot', 'input_hash', 'lease_until', 'actions', 'revive_ok', 'item_ok', 'last_seen_at', 'engine_stuck', 'profile']; const keys = new Set(); const walk = (o) => { if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { keys.add(k); walk(x); } }; walk(v2);
    ok(bad.every((k) => !keys.has(k)), 'keine internen Felder (Seed, Token, Snapshot, Aktionsdaten) in der Antwort', [...keys].filter((k) => bad.includes(k)).join(',')); }
  ok(!JSON.stringify(v2).includes('u11') && !JSON.stringify(v2).includes('u12'), 'nichts aus der anderen Gruppe');
  ok(v1.fight.can_act === true && v1.fight.remaining_ms > 0 && v1.fight.remaining_ms <= 60000, 'Restzeit und Handlungsfähigkeit kommen vom Server');
  ok((await V(GA, 'u1', v1.version)).stale === false && (await V(GA, 'u1', v1.version - 1)).stale === true && (await V(GA, 'u1')).stale === true, 'veraltete Clientversion wird erkannt');
  const tabs = (await q(`select table_name from information_schema.tables where table_schema='rwi' and table_type='BASE TABLE' order by 1`)).split('\n');
  const dump = async () => { const o = []; for (const t of tabs) o.push(t + ':' + (await q(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from rwi.${t} x`))); return o.join(';'); };
  const before = await dump(); for (const p of ['u1', 'u2', 'u3', 'u11']) { await V(GA, p); await V(GB, p); } await V(999, 'u1'); const after = await dump();
  ok(before === after, 'instance_view verändert keine Tabelle (alle rwi-Tabellen unverändert)');
  ok((await q(`select provolatile from pg_proc where proname='instance_view'`)) === 's', 'instance_view ist als STABLE deklariert (die Datenbank verbietet Schreibzugriffe)');
  { const G = (await mk(U(1, 2, 3, 4, 5, 6), { kind: 'weltboss', fights: 1, event: 80, ends: '1 hour' })).instance; await ready(G, U(1, 2, 3, 4, 5, 6)); await start(G);
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${G}`);
    const b = await dump(); const v = await V(G, 'u1'); const a = await dump();
    ok(v.instance.status === 'event_ended' && v.instance.stage === 'done' && v.instance.outcome === 'event_ended' && v.fight.can_act === false, 'Eventende gilt in der Ansicht sofort, auch bevor der Watchdog gelaufen ist');
    ok(b === a && (await inst(G)).status === 'active', 'Ansicht schreibt das Ende nicht selbst (Datenbankstand bleibt), das tut erst der Watchdog');
    await q(`select rwi.watchdog_tick()`); ok((await inst(G)).status === 'event_ended' && (await V(G, 'u1')).instance.status === 'event_ended', 'danach hält der Watchdog das Ende fest'); }
  { const G = (await mk(U(1, 2, 3, 4, 5, 6, 7, 8), { kind: 'special', fights: 2 })).instance; await call('join', G, 'u9'); const vw = await V(G, 'u9');
    ok(vw.me.state === 'waiting' && vw.me.position === 1 && !('group' in vw) && !('fight' in vw), 'Wartende sehen nur Platz und Instanzstatus');
    await call('leave', G, 'u2'); const vl = await V(G, 'u2'), va = await V(G, 'u9');
    ok(vl.me.state === 'left' && vl.me.reason === 'freiwillig' && !('group' in vl) && !('fight' in vl), 'Ausgeschiedene sehen nur ihren eigenen Status');
    ok(va.me.state === 'active' && va.group.length === 8, 'frei gewordener Platz in der Bereitschaftsphase: Wartende rückt nach und sieht ihre Gruppe'); }
  { const b = await dump(); const h = await as('u1', `select rwi.heartbeat(${GA})`); const a = await dump(); ok(h.status !== 'not_member' && b !== a, 'heartbeat ist der einzige schreibende Weg für Anwesenheit'); ok((await as('u11', `select rwi.heartbeat(${GA})`)).status === 'not_member', 'heartbeat nur für Mitglieder'); }
} catch (e) { fail++; console.log('NICHT OK - Testlauf abgebrochen:', e.stack.split('\n').slice(0, 4).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
