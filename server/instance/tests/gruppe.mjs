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
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s);
const CFG = { bossHp: 150, bossAtk: 8 };
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  const KL = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker'], ['magier', 'frost'], ['bogenschuetze', 'fallensteller']];
  for (let n = 1; n <= 24; n++) { const [g, p] = KL[n % KL.length]; await q(`insert into rwi.players values ('u${n}', 10, '${g}', '${p}', 3)`); }
  await q(`insert into rwi.players values ('low', 4, 'krieger', 'ritter', 3), ('nocls', 12, null, null, 0)`);
  const U = (...n) => n.map((x) => 'u' + x);
  const mk = async (players, { kind = 'dungeon', min = 2, max = 8, fights = 2, ends = null, event = null } = {}) =>
    J(await q(`select rwi.create_group('${kind}', array[${players.map((p) => `'${p}'`).join(',')}]::text[], ${min}, ${max}, ${fights}, ${event ?? 'null'}, ${ends ? `clock_timestamp() + interval '${ends}'` : 'null'})`));
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

  // 1) Gruppengröße
  ok((await mk(U(1), { min: 2 })).status === 'bad_size', 'eine Person unter Mindestgröße 2: abgelehnt');
  ok((await mk(U(1, 2, 3, 4, 5, 6, 7, 8, 9), { max: 8 })).status === 'bad_size', 'neun Personen über Höchstgröße 8: abgelehnt');
  ok((await mk(U(1, 2), { max: 9 })).status === 'bad_size', 'Höchstgröße über 8 nicht einstellbar');
  ok((await mk(U(1, 2), { min: 3, max: 2 })).status === 'bad_size', 'Mindestgröße über Höchstgröße abgelehnt');
  ok((await mk(U(1, 2), { kind: 'weltboss', min: 2, fights: 2 })).status === 'bad_size', 'Weltboss ist ein Einkampf-Instanztyp');
  ok((await mk(['u1', 'low'])).status === 'not_eligible' && (await mk(['u1', 'nocls'])).status === 'not_eligible', 'Instanzzugang erst ab Level 5 mit Grundklasse');
  ok((await mk(['u1', 'u1'])).status === 'duplicate', 'doppelter Spieler abgelehnt');
  { const a = await mk(U(1, 2)), b = await mk(U(1, 2, 3, 4, 5, 6, 7, 8)); ok(a.status === 'ok' && b.status === 'ok', 'Gruppen mit 2 und mit 8 Spielern werden angelegt'); }

  // 2) Beitritt, Warteliste, Nachrücken (Mehrkampf-Dungeon, max 4, 3 Kämpfe)
  const G1 = (await mk(U(1, 2), { min: 2, max: 4, fights: 3 })).instance;
  ok((await call('join', G1, 'u3')).status === 'joined' && (await call('join', G1, 'u4')).status === 'joined', 'vor dem ersten Kampf: Beitritt bis zur Höchstgröße');
  const w5 = await call('join', G1, 'u5'), w6 = await call('join', G1, 'u6');
  ok(w5.status === 'waitlisted' && w5.position === 1 && w6.position === 2, 'voll: Warteliste in Reihenfolge', JSON.stringify([w5, w6]));
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
    ok((await call('submit_action_for', 'u5', fid, +rr, '{"ability":"standard"}')).status !== 'ok' && J(await q(`select rwi.submit_action_for('u5', ${fid}, ${rr}, '{"ability":"standard"}'::jsonb)`)).status === 'forbidden', 'Wartende können keine Aktion in einem laufenden Kampf abgeben'); }
  ok((await call('leave', G1, 'u6')).status === 'left_waitlist', 'Austritt von der Warteliste');
  const pl1 = await playOut(G1); ok(pl1.status === 'won', 'Kampf 1 gewonnen', pl1.status);
  ok((await inst(G1)).stage === 'ready', 'nach dem Sieg beginnt die Bereitschaftsphase');
  const e1 = await ent(G1, 'u1'); ok(e1.length === 2 && e1.every((x) => !x.void), 'Teilnehmer erhalten Kampf-EP- und Beute-Berechtigung für Kampf 1');
  ok((await ent(G1, 'u5')).length === 0 && (await ent(G1, 'u7')).length === 0, 'Wartende erhalten nichts für Kampf 1');
  { const m1 = await mem(G1, 'u1'); ok(m1.ready === false && m1.ready_due !== null, 'neue Bereitschaftsfrist (60 s) für alle'); }
  // freiwilliger Austritt zwischen Kämpfen: Beute entfällt, Kampf-EP bleiben; Nachrücker in Reihenfolge
  ok((await call('leave', G1, 'u2')).status === 'left', 'freiwilliger Austritt');
  { const e = await ent(G1, 'u2'); ok(e.find((x) => x.k === 'kampf_ep' && !x.void) && e.find((x) => x.k === 'beute' && x.void), 'Austritt: Beute entfällt, bereits gutgeschriebene Kampf-EP bleiben', JSON.stringify(e)); }
  { const m5 = await mem(G1, 'u5'), m7 = await mem(G1, 'u7'); ok(m5 && m5.mstate === 'active' && m5.potions === 3 && m5.joined_after_fights === 1 && !m7, 'frei gewordener Platz: Nachrücker u5 (erste in der Warteliste) mit 3 eigenen Heiltränken'); }
  ok((await call('join', G1, 'u2')).status === 'no_rejoin', 'kein Wiederbeitritt nach freiwilligem Austritt');
  ok((await ent(G1, 'u5')).length === 0, 'Nachrücker erhält keine rückwirkenden Ansprüche');
  ok((await call('set_ready', G1, 'u5')).status === 'ok', 'Nachrücker kann Bereitschaft bestätigen');
  const m4 = await call('set_ready', G1, 'u1'); await call('set_ready', G1, 'u3'); await call('set_ready', G1, 'u4');
  ok((await call('set_ready', G1, 'u1')).status === 'ok', 'Bereitschaft ist wiederholbar, aber nicht widerrufbar');
  const s2 = await start(G1); ok(s2.status === 'ok' && s2.fight_no === 2, 'Kampf 2 startet mit den verbliebenen Spielern');
  { const f2 = (await fightsOf(G1)).pop(), f1 = (await fightsOf(G1))[0], by = Object.fromEntries(f2.state.members.map((m) => [m.id, m])), b1 = Object.fromEntries(f1.state.members.map((m) => [m.id, m]));
    ok(!by.u2 && by.u5 && f1.state.members.every((m) => m.id !== 'u5'), 'Kampfzustand: u2 weg, u5 neu, u5 war nicht im ersten Kampf');
    ok(by.u5.hp === Math.floor(by.u5.maxhp / 2) && Object.keys(by.u5.cd).length === 0, 'Nachrücker: Platzhalter-Lebensanteil (50 %), keine Abklingzeiten');
    ok(['u1', 'u3', 'u4'].every((k) => by[k].alive && by[k].st.length === 0 && by[k].revives === 0 && by[k].deaths === 0 && by[k].hp === (b1[k].alive ? b1[k].hp : Math.floor(b1[k].maxhp / 10))), 'Bestehende: HP bleiben, Status weg, Wiederbelebungslimit neu');
    ok(f2.state.monster.hp === 150 && f2.state.monster.maxhp === 150, 'neuer Kampf: Gegner unabhängig konfiguriert'); }

  { const G = (await mk(U(1, 2), { min: 2, max: 4, fights: 3 })).instance; await ready(G, U(1, 2)); await start(G);
    const j = await call('join', G, 'u13'); ok(j.status === 'waitlisted' && (await mem(G, 'u13')) === null && +(await q(`select count(*) from rwi.members where instance_id=${G}`)) === 2, 'freier Platz, aber Kampf läuft: Aufnahme erst zwischen Kämpfen (keine Teilnahme am laufenden Kampf)', JSON.stringify(j));
    const pl = await playOut(G); const m = await mem(G, 'u13'); ok(pl.status === 'won' && m && m.mstate === 'active' && m.joined_after_fights === 1 && (await ent(G, 'u13')).length === 0, 'nach dem Kampf rückt sie nach, ohne Ansprüche für den abgeschlossenen Kampf'); }

  // 3) Austritt/Entfernung während des letzten Kampfes, Abschlussbelohnung, Ansprüche
  const G2 = (await mk(U(1, 2, 3, 4), { min: 2, max: 6, fights: 2 })).instance;
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
  { const fin = (await q(`select string_agg(test_member, ',' order by test_member) from rwi.rewards where instance_id=${G2} and reward_id like 'final:%'`)); ok(fin === 'u1,u4', 'Abschlussbelohnung nur für Verbliebene', fin); }
  ok((await inst(G2)).outcome === 'won' && (await inst(G2)).stage === 'done', 'Instanz endet mit Sieg');
  ok((await call('join', G2, 'u3')).status !== 'joined' && (await call('join', G2, 'u9')).status !== 'joined', 'nach Instanzende kein Beitritt');

  // 4) Bereitschaftsfristen, Abwesenheit, Mindestgröße, Abbruch
  { const G = (await mk(U(1, 2, 3, 4), { min: 3, max: 5, fights: 2 })).instance;
    await call('set_ready', G, 'u1'); await q(`update rwi.members set ready_due = clock_timestamp() - interval '1 second' where instance_id=${G} and player='u2'`);
    let t = J(await q(`select rwi.group_tick()`)); const m2 = await mem(G, 'u2');
    ok(t.removed === 1 && m2.mstate === 'removed' && m2.leave_reason === 'bereitschaft', 'verbundener Spieler ohne Bereitschaft nach 60 s: entfernt (Ursache „bereitschaft“)');
    ok((await inst(G)).status === 'active', '3 von min. 3 verbleiben: weiter');
    ok((await call('join', G, 'u2')).status === 'no_rejoin', 'Entfernter kann nicht erneut beitreten');
    // getrennter Spieler: Bereitschaftsfrist ruht
    await call('set_connection', G, 'u3', 'false'); const d = await mem(G, 'u3'); ok(d.ready_due === null && d.disc_since !== null, 'getrennter Spieler: Bereitschaftsfrist ruht, Abwesenheit läuft');
    t = J(await q(`select rwi.group_tick()`)); ok(t.removed === 0, 'getrennter Spieler wird durch die Bereitschaftsfrist nicht entfernt');
    await q(`select rwi.set_connection(${G}, 'u3', true)`); const r3 = await mem(G, 'u3'); ok(r3.disc_since === null && r3.ready_due !== null, 'Wiederverbindung: Abwesenheit zurückgesetzt, 60 s ab Wiederverbindung');
    // bestätigte Bereitschaft bleibt bei Trennung
    await q(`select rwi.set_connection(${G}, 'u1', false)`); ok((await mem(G, 'u1')).ready === true, 'bestätigte Bereitschaft bleibt bei Verbindungsabbruch');
    ok((await inst(G)).stage === 'ready' && (await q(`select (paused_at is not null) from rwi.instances where id=${G}`)) === 'f', 'in der Bereitschaftsphase keine Gruppenpause');
    // Abwesenheit knapp unter 5 Minuten: noch nicht entfernt; Störungsfenster zählen nicht mit
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '299 seconds' where instance_id=${G} and player='u1'`); t = J(await q(`select rwi.group_tick()`)); ok((await mem(G, 'u1')).mstate === 'active', 'Abwesenheit knapp unter 5 Minuten: noch nicht entfernt');
    await q(`update rwi.members set disc_since = clock_timestamp() - interval '600 seconds' where instance_id=${G} and player='u1'; insert into rwi.system_gaps(from_at, to_at) values (clock_timestamp() - interval '500 seconds', clock_timestamp() - interval '100 seconds')`);
    t = J(await q(`select rwi.group_tick()`)); ok((await mem(G, 'u1')).mstate === 'active', 'Störungsfenster zählt nicht als Abwesenheit');
    await q(`delete from rwi.system_gaps`);
    // Entfernung unter Mindestgröße: Abbruch
    await q(`update rwi.members set ready_due = clock_timestamp() - interval '1 second' where instance_id=${G} and player='u3'`); t = J(await q(`select rwi.group_tick()`));
    const ii = await inst(G); ok(t.aborted === 1 && ii.status === 'aborted' && ii.outcome === 'aborted', 'automatische Entfernung unter die Mindestgröße: Instanz abgebrochen', JSON.stringify(ii)); }
  { const G = (await mk(U(1, 2, 3, 4), { min: 3, max: 4, fights: 2 })).instance;
    await call('leave', G, 'u2'); await call('leave', G, 'u3');
    ok((await inst(G)).status === 'active' && rwi_count(await q(`select count(*) from rwi.members where instance_id=${G} and mstate='active'`)) === 2, 'freiwilliger Austritt unter die Mindestgröße: Gruppe darf weiterspielen');
    await q(`update rwi.members set ready_due = clock_timestamp() - interval '1 second' where instance_id=${G} and player='u4'`); const t = J(await q(`select rwi.group_tick()`));
    ok((await inst(G)).status === 'aborted', 'danach führt eine automatische Entfernung zum Abbruch (auch wenn schon freiwillig darunter)', JSON.stringify(t));
    const G6 = (await mk(U(5, 6), { min: 2, fights: 2 })).instance; await call('leave', G6, 'u5'); const l = await call('leave', G6, 'u6'); ok(l.instance_ended && (await inst(G6)).status === 'aborted', 'wenn alle freiwillig gehen, endet die Instanz'); }
  { const G = (await mk(U(1, 2, 3), { min: 3, fights: 2 })).instance; await call('leave', G, 'u3'); await ready(G, U(1, 2));
    ok((await start(G)).status === 'below_min', 'erster Kampf startet nicht unter der Mindestgröße'); }
  { const G = (await mk(U(1, 2, 3), { min: 2, fights: 2 })).instance; for (const k of ['u1', 'u2', 'u3']) await q(`select rwi.set_connection(${G}, '${k}', false)`);
    ok((await q(`select (paused_at is not null) from rwi.instances where id=${G}`)) === 'f', 'alle getrennt in der Bereitschaftsphase: keine Pause'); }
  { const G = (await mk(U(1, 2), { min: 2, fights: 2 })).instance; await ready(G, U(1, 2)); const t = J(await q(`select rwi.watchdog_tick()`)); ok(t.group.start.includes(G), 'Watchdog meldet startbereite Gruppe'); }

  // 5) Weltboss: Beitritt, kein Nachrücken, Eventende
  { const G = (await mk(U(1, 2), { kind: 'weltboss', min: 2, max: 3, fights: 1, event: 77, ends: '1 hour' })).instance;
    ok((await call('join', G, 'u9')).status === 'joined' && (await call('join', G, 'u10')).status === 'full', 'Weltboss: Beitritt vor dem Start bis zur Höchstgröße, keine Warteliste');
    await ready(G, U(1, 2, 9)); const s = await start(G); ok(s.status === 'ok', 'Weltboss-Kampf startet');
    ok((await call('join', G, 'u11')).status === 'no_join', 'Weltboss: kein Nachrücken nach dem Start'); }
  for (const [name, fn] of [['join', (G) => call('join', G, 'u9')], ['set_ready', (G) => call('set_ready', G, 'u1')], ['start_fight', async (G) => { const S = newFight(J(await q(`select rwi.roster(${G})`)), CFG); return J(await q(`select rwi.start_fight(${G}, $j$${JSON.stringify(S)}$j$::jsonb)`)); }], ['leave', (G) => call('leave', G, 'u1')]]) {
    const G = (await mk(U(1, 2), { kind: 'weltboss', min: 2, max: 3, fights: 1, event: 78, ends: '1 hour' })).instance;
    if (name === 'start_fight') await ready(G, U(1, 2));
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${G}`);
    const r = await fn(G); const st = (await inst(G)).status;
    ok(r.status === 'event_ended' && st === 'event_ended', `Eventende: ${name} wird abgewiesen, Instanz beendet`, `${r.status}/${st}`);
    if (name === 'start_fight') ok(+(await q(`select count(*) from rwi.fights where instance_id=${G}`)) === 0, 'nach Eventende startet kein Kampf'); }

  // 6) instance_view
  const GA = (await mk(U(1, 2, 3), { min: 2, max: 4, fights: 2 })).instance, GB = (await mk(U(11, 12), { min: 2, max: 4, fights: 2 })).instance;
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
  // schreibfrei: kein Zustand ändert sich durch den Aufruf
  const tabs = (await q(`select table_name from information_schema.tables where table_schema='rwi' and table_type='BASE TABLE' order by 1`)).split('\n');
  const dump = async () => { const o = []; for (const t of tabs) o.push(t + ':' + (await q(`select coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from rwi.${t} x`))); return o.join(';'); };
  const before = await dump(); for (const p of ['u1', 'u2', 'u3', 'u11']) { await V(GA, p); await V(GB, p); } await V(999, 'u1'); const after = await dump();
  ok(before === after, 'instance_view verändert keine Tabelle (alle rwi-Tabellen unverändert)');
  ok((await q(`select provolatile from pg_proc where proname='instance_view'`)) === 's', 'instance_view ist als STABLE deklariert (die Datenbank verbietet Schreibzugriffe)');
  // Weltboss-Ende bei veralteter Ansicht
  { const G = (await mk(U(1, 2), { kind: 'weltboss', min: 2, fights: 1, event: 79, ends: '1 hour' })).instance; await ready(G, U(1, 2)); const s = await start(G);
    await q(`update rwi.instances set ends_at = clock_timestamp() - interval '1 second' where id=${G}`);
    const b = await dump(); const v = await V(G, 'u1'); const a = await dump();
    ok(v.instance.status === 'event_ended' && v.instance.stage === 'done' && v.instance.outcome === 'event_ended' && v.fight.can_act === false, 'Eventende gilt in der Ansicht sofort, auch bevor der Watchdog gelaufen ist');
    ok(b === a && (await inst(G)).status === 'active', 'Ansicht schreibt das Ende nicht selbst (Datenbankstand bleibt), das tut erst der Watchdog');
    await q(`select rwi.watchdog_tick()`); ok((await inst(G)).status === 'event_ended' && (await V(G, 'u1')).instance.status === 'event_ended', 'danach hält der Watchdog das Ende fest'); }
  // Ausgeschiedene und Wartende sehen nur sich selbst
  { const G = (await mk(U(1, 2, 3), { min: 2, max: 3, fights: 2 })).instance; await call('join', G, 'u9'); await call('leave', G, 'u3');
    const vw = await V(G, 'u9'), vl = await V(G, 'u3');
    ok(vw.me.state === 'active' && vw.group.length === 3, 'frei gewordener Platz in der Bereitschaftsphase: Wartende rückt nach und sieht ihre Gruppe'); ok(vl.me.state === 'left' && !('group' in vl), 'Ausgetretener sieht nur seinen Status'); }
  { const G = (await mk(U(1, 2), { min: 2, max: 2, fights: 2 })).instance; await call('join', G, 'u9'); const vw = await V(G, 'u9');
    ok(vw.me.state === 'waiting' && vw.me.position === 1 && !('group' in vw) && !('fight' in vw), 'Wartende sehen nur Platz und Instanzstatus');
    await call('leave', G, 'u2'); const vl = await V(G, 'u2');
    ok(vl.me.state === 'left' && vl.me.reason === 'freiwillig' && !('group' in vl) && !('fight' in vl), 'Ausgeschiedene sehen nur ihren eigenen Status'); }
  // Herzschlag ist der schreibende Weg
  { const b = await dump(); const h = await call('heartbeat', GA, 'u1'); const a = await dump(); ok(h.status !== 'not_member' && b !== a, 'heartbeat ist der einzige schreibende Weg für Anwesenheit'); ok((await call('heartbeat', GA, 'u11')).status === 'not_member', 'heartbeat nur für Mitglieder'); }
  // Pausenbudget-Abbruch bleibt wirksam
} catch (e) { fail++; console.log('NICHT OK - Testlauf abgebrochen:', e.stack.split('\n').slice(0, 4).join(' | ')); }
finally { cl.stop(); }
function rwi_count(x) { return +x; }
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
