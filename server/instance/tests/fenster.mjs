// DB-Tests Todesfenster, Wiederbelebung, Wipe-Halt, Gruppenpause: node server/instance/tests/fenster.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
import { REAL5, REAL_BOSS_HP } from '../sim/fight.mjs';
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const cl = await startCluster(54390);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 300)); return r.out; };
const J = (s) => JSON.parse(s);
try {
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe']) await q(readFileSync(join(here, `../sql/${f}.sql`), 'utf8'));
  // Testkampf mit Gruppe REAL5; dead: Ids der toten Mitglieder (deaths=1), items: Wiederbelebungsitems je Mitglied
  const setup = async ({ dead = [], items = {}, deaths = 1 } = {}) => {
    const S = newFight(REAL5, { bossHp: REAL_BOSS_HP });
    for (const m of S.members) if (dead.includes(m.id)) { m.alive = false; m.hp = 0; m.deaths = deaths; }
    const r = await q(`with i as (insert into rwi.instances(event_id, ends_at) values (null, null) returning id),
      m as (insert into rwi.members(instance_id, key, last_seen_at, revive_items) select i.id, k.k, clock_timestamp(), coalesce((($j$${JSON.stringify(items)}$j$::jsonb)->>k.k)::int, 0) from i, unnest(array['p1','p2','p3','p4','p5']) k(k)),
      f as (insert into rwi.fights(instance_id, due_at, state) select id, clock_timestamp() + interval '30 seconds', $j$${JSON.stringify(S)}$j$::jsonb from i returning id, instance_id)
      select id || ',' || instance_id from f`);
    const [fid, iid] = r.split(',').map(Number);
    await q(`select rwi.sync_windows(${fid}, ${iid}, (select state from rwi.fights where id=${fid}), false)`);
    return { fid, iid };
  };
  const sub = async (fid, key, a, rn) => J(await q(`select rwi.submit_action(${fid}, '${key}', ${rn ?? (+(await q(`select round_no from rwi.fights where id=${fid}`)))}, $j$${JSON.stringify(a)}$j$::jsonb)`));
  const rev = (target, ability, death = 1) => ({ ability, target, mode: 'revive', death });
  const run = async (fid) => {                                     // Runde auflösen wie die Edge Function: claim → Engine → commit
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
    const c = J(await q(`select rwi.claim_resolution(${fid}, (select round_no from rwi.fights where id=${fid}))`)); if (c.status !== 'ok') return { c };
    const res = resolveClaim(c.input);
    const k = J(await q(`select rwi.commit_round(${fid}, ${c.input.round_no}, '${c.token}', ${c.round_version}, '${c.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`));
    return { c, res, k };
  };
  const mem = async (fid, id) => J(await q(`select m from rwi.fights f, jsonb_array_elements(f.state->'members') m where f.id=${fid} and m->>'id'='${id}'`));
  const win = async (fid, key) => J(await q(`select coalesce(json_agg(row_to_json(w)), '[]') from (select member_key, death_no, status, closed_reason, item_open, until is null as paused from rwi.death_windows where fight_id=${fid} and member_key='${key}' order by death_no) w`));
  const logs = (res) => (res?.log || []);

  // 1) Zwei Wiederbelebungsversuche auf dasselbe Ziel
  { const { fid } = await setup({ dead: ['p1'] });
    const a = await sub(fid, 'p4', rev('p1', 'heiliger_schild')), b = await sub(fid, 'p5', rev('p1', 'kraeuterbalsam'));
    ok(a.status === 'ok' && b.status === 'ok', 'beide Versuche werden rechtzeitig angenommen', a.status + '/' + b.status);
    const r = await run(fid), L = logs(r.res), p1 = await mem(fid, 'p1');
    ok(L.filter((e) => e.e === 'revive').length === 1 && p1.alive && p1.revives === 1, 'nur der erste Versuch zählt, Limit 1 verbraucht', `revive=${L.filter((e) => e.e === 'revive').length}`);
    const v = L.filter((e) => e.e === 'verfall'); ok(v.length === 1, 'der zweite Versuch verfällt', JSON.stringify(v));
    const p5 = await mem(fid, 'p5'), p4 = await mem(fid, 'p4');
    ok(Object.keys(p4.cd).length + Object.keys(p5.cd).length >= 0 && (v[0] && ((v[0].a === 'p5' && !p5.cd.kraeuterbalsam) || (v[0].a === 'p4' && !p4.cd.heiliger_schild))), 'verfallener Versuch: kein Cooldown (Erstattung), kein Schild');
    const w = (await win(fid, 'p1'))[0]; ok(w.status === 'closed' && w.closed_reason === 'revived', 'Fenster nach Erfolg geschlossen'); }

  // 2) Normale Heilung auf ein totes Ziel
  { const { fid } = await setup({ dead: ['p1'] });
    const a = await sub(fid, 'p4', { ability: 'heilendes_licht', target: 'p1' });
    ok(a.status === 'ok', 'normale Heilung wird als normale Aktion angenommen');
    const r = await run(fid), L = logs(r.res), p1 = await mem(fid, 'p1'), p4 = await mem(fid, 'p4');
    ok(!p1.alive && p1.revives === 0 && !L.some((e) => e.e === 'revive'), 'tote Spielerin wird nicht wiederbelebt');
    ok(L.some((e) => e.e === 'verfall' && e.a === 'p4' && e.why === 'ziel_tot') && !p4.cd.heilendes_licht, 'Heilung verfällt, Cooldown erstattet'); }

  // 3) rechtzeitig angenommen, nach Fensterablauf aufgelöst
  { const { fid } = await setup({ dead: ['p1'] });
    const a = await sub(fid, 'p4', rev('p1', 'heiliger_schild')); await q(`update rwi.death_windows set until = clock_timestamp() - interval '5 seconds' where fight_id=${fid}`);
    const late = await sub(fid, 'p5', rev('p1', 'kraeuterbalsam')); const wd = J(await q(`select rwi.watchdog_tick()`));
    const w = (await win(fid, 'p1'))[0];
    ok(a.status === 'ok' && late.status === 'no_window', 'nach Ablauf wird keine neue Wiederbelebung mehr angenommen', late.status);
    ok(w.status === 'closed' && w.closed_reason === 'expired' && wd.windows_expired === 1, 'Fenster läuft ab');
    const r = await run(fid), p1 = await mem(fid, 'p1');
    ok(p1.alive && logs(r.res).some((e) => e.e === 'revive' && e.a === 'p4'), 'rechtzeitig angenommener Versuch gilt trotz späterer Auflösung'); }

  // 4) zwei gleichzeitig offene Todesfenster, unabhängig voneinander
  { const { fid } = await setup({ dead: ['p1', 'p2'] });
    await q(`update rwi.death_windows set until = clock_timestamp() - interval '1 second' where fight_id=${fid} and member_key='p1'`); await q(`select rwi.watchdog_tick()`);
    const w1 = (await win(fid, 'p1'))[0], w2 = (await win(fid, 'p2'))[0];
    ok(w1.status === 'closed' && w2.status === 'open', 'Fenster laufen unabhängig ab', `${w1.status}/${w2.status}`);
    const x = await sub(fid, 'p4', rev('p1', 'heiliger_schild')), y = await sub(fid, 'p5', rev('p2', 'kraeuterbalsam'));
    ok(x.status === 'no_window' && y.status === 'ok', 'nur das offene Fenster nimmt eine Wiederbelebung an', `${x.status}/${y.status}`);
    await run(fid); ok(!(await mem(fid, 'p1')).alive && (await mem(fid, 'p2')).alive, 'p2 lebt wieder, p1 bleibt tot');
    const z = await sub(fid, 'p4', rev('p2', 'heiliger_schild', 1)); ok(z.status === 'no_window', 'Lebende Spieler können nicht „wiederbelebt“ werden'); }

  // 5) falscher Todesfall und Limit
  { const { fid } = await setup({ dead: ['p1'], deaths: 2 });
    ok((await sub(fid, 'p4', rev('p1', 'heiliger_schild', 1))).status === 'no_window', 'Bindung an den Todesfall: alte Todesnummer wird abgelehnt');
    const { fid: f2 } = await setup({ dead: ['p1'] }); await q(`update rwi.fights set state = jsonb_set(state, '{members,0,revives}', '2') where id=${f2}`);
    ok((await sub(f2, 'p4', rev('p1', 'heiliger_schild'))).status === 'no_window', 'Limit von 2 Wiederbelebungen ausgeschöpft: keine Annahme'); }

  // 6) Wipe mit offenem Fenster (Item): Kampf angehalten, danach Wiederaufnahme
  { const { fid, iid } = await setup({ dead: ['p1', 'p2', 'p3', 'p4', 'p5'], items: { p5: 1 } });
    const r = await run(fid), st = J(await q(`select row_to_json(f) from (select status, phase from rwi.fights f where id=${fid}) f`));
    ok(r.k.status === 'committed' && r.k.hold === true && st.status === 'active' && st.phase === 'wipe_wait', 'alle tot, Fenster mit Item offen: Kampf angehalten', JSON.stringify(st));
    const c = J(await q(`select rwi.claim_resolution(${fid}, (select round_no from rwi.fights where id=${fid}))`)); ok(c.status === 'not_due', 'angehaltener Kampf wird nicht aufgelöst');
    const u = J(await q(`select rwi.use_revive_item(${fid}, 'p5')`)); ok(u.status === 'ok', 'Item-Einsatz im Fenster angenommen');
    const r2 = await run(fid), p5 = await mem(fid, 'p5'), items = +(await q(`select revive_items from rwi.members where instance_id=${iid} and key='p5'`));
    ok(r2.k.outcome === 'continue' && p5.alive && p5.revives === 1 && items === 0, 'Wiederaufnahme: Spielerin lebt, Item erst jetzt verbraucht', `outcome=${r2.k.outcome} items=${items}`);
    ok(r2.res.log.some((e) => e.e === 'wipe_resume'), 'Wiederaufnahme ist im Protokoll vermerkt'); }

  // 7) Niederlage nach Ablauf aller Fenster
  { const { fid } = await setup({ dead: ['p1', 'p2', 'p3', 'p4', 'p5'], items: { p5: 1, p3: 1 } });
    await run(fid); await q(`update rwi.death_windows set until = clock_timestamp() - interval '1 second' where fight_id=${fid} and member_key='p5'`);
    const w1 = J(await q(`select rwi.watchdog_tick()`)), s1 = await q(`select status from rwi.fights where id=${fid}`);
    ok(s1 === 'active' && w1.lost_finalized === 0, 'ein Fenster noch offen: Kampf bleibt angehalten', s1);
    await q(`update rwi.death_windows set until = clock_timestamp() - interval '1 second' where fight_id=${fid} and member_key='p3'`);
    const w2 = J(await q(`select rwi.watchdog_tick()`)), s2 = J(await q(`select row_to_json(f) from (select status, phase from rwi.fights f where id=${fid}) f`));
    ok(w2.lost_finalized === 1 && s2.status === 'lost' && s2.phase === 'done', 'alle Fenster abgelaufen: Niederlage', JSON.stringify(s2)); }

  // 8) Wipe ohne nutzbares Fenster: sofort Niederlage; „Abwarten“ beendet nur die Item-Option
  { const { fid } = await setup({ dead: ['p1', 'p2', 'p3', 'p4', 'p5'] }); const r = await run(fid);
    ok(r.k.outcome === 'lost' && !r.k.hold, 'Wipe ohne Item: sofort Niederlage');
    const { fid: f2 } = await setup({ dead: ['p1', 'p2', 'p3', 'p4', 'p5'], items: { p5: 1 } }); await run(f2);
    await q(`select rwi.decline_revive_item(${f2}, 'p5')`); await q(`select rwi.watchdog_tick()`);
    ok((await q(`select status from rwi.fights where id=${f2}`)) === 'lost', 'Item-Fenster verworfen: Niederlage'); }

  // 9) Gruppenpause: Fenster friert mit Restzeit ein
  { const { fid, iid } = await setup({ dead: ['p1'] });
    for (const k of ['p1', 'p2', 'p3', 'p4']) await q(`select rwi.set_connection(${iid}, '${k}', false)`);
    const before = J(await q(`select rwi.set_connection(${iid}, 'p5', true)`));
    ok(before.status === 'unchanged', 'ein Mitglied verbunden: keine Pause');
    const p = J(await q(`select rwi.set_connection(${iid}, 'p5', false)`)); const w = (await win(fid, 'p1'))[0];
    ok(p.status === 'paused' && w.paused, 'niemand verbunden: Pause, Fenster angehalten');
    const rem = +(await q(`select remaining_ms from rwi.death_windows where fight_id=${fid}`)); ok(rem > 55000 && rem <= 60000, 'Restzeit bleibt erhalten', String(rem));
    await q(`select pg_sleep(1.2)`); const rem2 = +(await q(`select remaining_ms from rwi.death_windows where fight_id=${fid}`)); ok(rem2 === rem, 'Restzeit läuft während der Pause nicht ab');
    const ex = J(await q(`select rwi.watchdog_tick()`)); ok(ex.windows_expired === 0, 'pausiertes Fenster läuft nicht ab');
    const rs = J(await q(`select rwi.set_connection(${iid}, 'p2', true)`)); const until = +(await q(`select extract(epoch from until - clock_timestamp()) from rwi.death_windows where fight_id=${fid}`));
    ok(rs.status === 'resumed' && until > 54 && until <= 60, 'Wiederaufnahme: Fenster läuft mit Restzeit weiter', until.toFixed(1)); }

  // 10) Eventende / Instanzende schließt Fenster (K.2 Regel 4)
  { const { fid, iid } = await setup({ dead: ['p1'] }); await q(`select rwi.end_instance(${iid})`);
    ok((await win(fid, 'p1'))[0].closed_reason === 'fight_end', 'Instanzende schließt offene Fenster'); }
  // 11) Eventende in der Lücke zwischen ends_at und dem Aufräumen: jede Eingangsfunktion lehnt selbst ab (je Funktion ein eigener Kampf)
  for (const [name, call] of [
    ['claim_resolution', (fid) => `select rwi.claim_resolution(${fid}, 1)`],
    ['submit_action', (fid) => `select rwi.submit_action(${fid}, 'p4', 1, '{"ability":"standard"}'::jsonb)`],
    ['use_revive_item', (fid) => `select rwi.use_revive_item(${fid}, 'p5')`]]) {
    const { fid, iid } = await setup({ dead: ['p5'], items: { p5: 1 } });
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid}; update rwi.instances set ends_at = clock_timestamp() - interval '1 second', event_id = 7 where id=${iid}`);
    const r = J(await q(call(fid))), st = await q(`select status from rwi.instances where id=${iid}`), fs = await q(`select status from rwi.fights where id=${fid}`);
    ok(r.status === 'event_ended' && st === 'event_ended' && fs === 'event_ended', `${name}: nach ends_at wird abgelehnt und die Instanz beendet`, `${r.status}/${st}/${fs}`);
    ok((await win(fid, 'p5'))[0].closed_reason === 'fight_end', `${name}: offene Fenster werden mit beendet`); }
} catch (e) { fail++; console.log('NICHT OK - Testlauf abgebrochen:', e.message); }
finally { cl.stop(); }
console.log(`\n${fail === 0 ? 'ALLE TESTS OK' : 'FEHLER'}: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
