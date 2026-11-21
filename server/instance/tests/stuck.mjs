// stuck-Status, Alarmierung und kontrollierte Wiederaufnahme: node server/instance/tests/stuck.mjs
// Lokal, ohne externe Benachrichtigung. Der Alarm ist ein Datensatz in rwi.ops_alerts (state open/resolved) – die Zustellung nach außen ist NICHT Teil dieses Tests und bewusst offen.
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { runTick } from '../worker/core.mjs';
import { a1Db, opsA1 } from '../worker/a1.mjs';
const { ok, done } = counter();
const E = await setup(54490); const { q, rpcAs, parallel } = E;
const svc = rpcAs('service_role'); const db = a1Db(svc), ops = opsA1(svc);
const OP = (await E.account('OpPascal', 0)).id; await q(`select rwi.set_operator('${OP}', 'Pascal', array['resume','terminate','engine'])`);
const broken = { ...engine, resolveClaim: () => { throw new Error('Engine kaputt (Test)'); } };
let n = 0;
const mkFight = async () => {
  const ps = []; for (let k = 0; k < 2; k++) ps.push(await E.account('S' + (++n) + 'x' + k));
  const g = await E.group(ps.map((p) => p.chars[0])); for (const p of ps) await q(`select rwi.set_ready(${g.instance}, '${p.chars[0]}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 400, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  const due = () => q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
  const expire = () => q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${fid} and phase='resolving'`);
  await due();
  return { inst: g.instance, fid, due, expire };
};
const alerts = (fid) => q(`select count(*) from rwi.ops_alerts where what='stuck' and fight_id=${fid}`);
const open = (fid) => q(`select count(*) from rwi.ops_alerts where what='stuck' and fight_id=${fid} and state='open'`);
const job = (fid) => q(`select status || '/' || attempts || '/' || resumes from rwi.resolve_jobs where fight_id=${fid}`);
const stuckInst = (inst) => q(`select engine_stuck::text from rwi.instances where id=${inst}`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q(`update rwi.cfg set v = 6 where k = 'max_attempts'`);

  // ---- 1. Wiederholungen 5/10/20/40/60 s, danach stuck ----
  const F = await mkFight(); const waits = [], stat = [];
  for (let k = 0; k < 6; k++) {
    const t = await runTick(db, broken); const r = t.results.find((x) => x.fight === F.fid); stat.push(r?.status);
    const rep = r?.report; if (rep) waits.push(rep.retry_in);
    if (k < 5) await F.expire();
  }
  ok(JSON.stringify(waits) === '[5,10,20,40,60,60]', 'Wartezeiten bis zur Wiederholung 5/10/20/40/60 s (danach 60 s)', JSON.stringify(waits));
  ok((await job(F.fid)) === 'stuck/6/0', 'nach max_attempts (6): Auftrag stuck', await job(F.fid));
  ok((await stuckInst(F.inst)) === 'true', 'Instanz engine_stuck = true');
  ok((await alerts(F.fid)) === '1' && (await open(F.fid)) === '1', 'GENAU EIN Alarm beim Übergang nach stuck');
  const al = J(await q(`select row_to_json(a) from rwi.ops_alerts a where fight_id=${F.fid}`));
  ok(al.dedupe_key === `stuck:${F.fid}:1:0` && al.what === 'stuck' && al.round_no === 1 && al.state === 'open', 'Alarm ist eindeutig identifizierbar (Kampf, Runde, Episode) und offen', al.dedupe_key);
  const lease = await q(`select extract(epoch from (lease_until - clock_timestamp()))::int from rwi.fights where id=${F.fid}`);
  ok(+lease > 40 && +lease <= 60, 'Lease wurde auf höchstens 60 s verkürzt (kein Warten bis zum Lease-Ablauf)', lease);

  // ---- 2. weitere Meldungen und wiederholte Watchdog-Läufe erzeugen keinen zweiten Alarm ----
  const rtoken = await q(`select claim_token from rwi.fights where id=${F.fid}`);
  const again = await db.reportFailure(F.fid, 1, rtoken, 'noch ein Fehler');
  ok(again.status === 'already_stuck' && (await job(F.fid)) === 'stuck/6/0' && (await alerts(F.fid)) === '1', 'weitere Fehlermeldung nach stuck: already_stuck, Zähler und Alarmanzahl unverändert');
  let newest = 0; for (let k = 0; k < 5; k++) { const w = await db.watchdog(); newest += w.stuck_new; }
  ok(newest === 0 && (await alerts(F.fid)) === '1', '5 wiederholte Watchdog-Läufe: stuck_new = 0, weiterhin genau ein Alarm');
  const w1 = await db.watchdog();
  ok(!w1.due.includes(F.fid) && !w1.redispatch.includes(F.fid) && w1.stuck_open >= 1, 'Watchdog verteilt den hängenden Kampf NICHT erneut und meldet stuck_open', JSON.stringify(w1).slice(0, 120));
  await F.expire();
  ok((await db.claim(F.fid, 1)).status === 'stuck', 'selbst bei abgelaufener Lease: ein Claim wird abgewiesen (status stuck) – keine automatische Wiederholung');
  const tt = await runTick(db, engine);
  ok(!tt.results.some((x) => x.fight === F.fid) && (await job(F.fid)) === 'stuck/6/0', 'ein Worker-Tick mit funktionierender Engine fasst den hängenden Kampf nicht an');
  ok((await q(`select count(*) from rwi.round_results where fight_id=${F.fid}`)) === '0', 'es existiert kein Rundenergebnis (nichts geschrieben, nichts doppelt)');
  ok((await ops.stuckList()).some((x) => x.fight === F.fid && x.attempts === 6 && /kaputt/.test(x.last_error || '')) , 'Betreiberübersicht zeigt Kampf, Runde, Instanz, Versuche und letzte Fehlermeldung');
  // Sicherheitsnetz: Alarm fehlt (z. B. manuell gelöscht) -> der Watchdog legt GENAU EINEN neu an
  await q(`delete from rwi.ops_alerts where fight_id=${F.fid}`);
  const wn = await db.watchdog(); const wn2 = await db.watchdog();
  ok(wn.stuck_new === 1 && wn2.stuck_new === 0 && (await alerts(F.fid)) === '1', 'Sicherheitsnetz: fehlender Alarm wird einmal nachgelegt, nie doppelt');

  // ---- 3. Alarmierung beschädigt die Instanzdaten nicht ----
  const before = await q(`select md5((select string_agg(state::text || actions::text, '|') from rwi.fights where id=${F.fid}) || (select string_agg(player || mstate, ',' order by id) from rwi.members where instance_id=${F.inst}))`);
  for (let k = 0; k < 3; k++) await db.watchdog();
  ok(before === await q(`select md5((select string_agg(state::text || actions::text, '|') from rwi.fights where id=${F.fid}) || (select string_agg(player || mstate, ',' order by id) from rwi.members where instance_id=${F.inst}))`), 'Kampfzustand, Aktionen und Mitglieder bleiben durch Alarmierung/Watchdog unverändert');

  // ---- 4. kontrollierte Wiederaufnahme ----
  ok((await ops.resume(F.fid, 1, OP, 'kurz')).status === 'invalid_input', 'Wiederaufnahme ohne Begründung (<10 Zeichen): invalid_input');
  ok((await ops.resume(F.fid, 1, '00000000-0000-4000-8000-000000000999', 'Ursache analysiert, Engine behoben')).status === 'not_operator', 'Wiederaufnahme mit unbekannter Betreiberkennung: not_operator (Freitext/fremde ID zählt nicht)');
  ok((await ops.resume(F.fid, 2, OP, 'Ursache analysiert, Engine behoben')).status === 'stale', 'falsche (nicht aktuelle) Runde: stale, keine Wirkung');
  ok((await ops.resume(999999, 1, OP, 'Ursache analysiert, Engine behoben')).status === 'unknown_fight', 'unbekannter Kampf: unknown_fight');
  const H = await mkFight();
  ok((await ops.resume(H.fid, 1, OP, 'Ursache analysiert, Engine behoben')).status === 'not_stuck' && (await ops.terminate(H.fid, OP, 'darf einen gesunden Kampf nie beenden')).status === 'not_stuck', 'gesunder Kampf: weder Wiederaufnahme noch Beendigung möglich (not_stuck)');
  const oldTok = await q(`select claim_token from rwi.fights where id=${F.fid}`);
  const rs = await ops.resume(F.fid, 1, OP, 'Ursache: Engine-Fehler im Test behoben');
  ok(rs.status === 'resumed' && rs.resumes === 1, 'kontrollierte Wiederaufnahme: resumed (Episode 1)', JSON.stringify(rs));
  ok((await job(F.fid)) === 'pending/0/1' && (await stuckInst(F.inst)) === 'false' && (await open(F.fid)) === '0', 'Auftrag pending (Versuche 0, Wiederaufnahmen 1), engine_stuck zurückgesetzt, Alarm erledigt');
  const lg = J(await q(`select row_to_json(l) from rwi.ops_log l where fight_id=${F.fid} and kind='resume'`));
  ok(lg.operator_id === OP && lg.operator === 'Pascal' && /behoben/.test(lg.note) && lg.round_no === 1, 'Wiederaufnahme ist protokolliert (Betreiber, Begründung, Zeit, Kampf, Runde)');
  ok((await ops.resume(F.fid, 1, OP, 'Ursache: Engine-Fehler im Test behoben')).status === 'not_stuck', 'zweite Wiederaufnahme derselben Episode: not_stuck (keine Doppelausführung)');
  ok((await q(`select count(*) from rwi.ops_log where kind='resume' and fight_id=${F.fid}`)) === '1', 'genau ein Protokolleintrag');
  const sup = await db.commit(F.fid, 1, oldTok, 99, 'a'.repeat(64), engine.ENGINE_VERSION, { outcome: 'continue', state: { members: [], monster: { hp: 1 } } });
  ok(sup.status === 'superseded', 'Commit mit dem alten Token nach der Wiederaufnahme: superseded', sup.status);
  const w2 = await db.watchdog(); ok(w2.redispatch.includes(F.fid), 'nach der Wiederaufnahme wird der Kampf wieder verteilt (redispatch)');
  const t2 = await runTick(db, engine); const r2 = t2.results.find((x) => x.fight === F.fid);
  ok(r2 && r2.status === 'committed' && (await q(`select count(*) from rwi.round_results where fight_id=${F.fid} and round_no=1`)) === '1', 'behobene Engine: Runde wird genau einmal aufgelöst und committet', JSON.stringify(r2));
  ok((await ops.resume(F.fid, 1, OP, 'Ursache: Engine-Fehler im Test behoben')).status === 'stale', 'bereits abgeschlossene Runde kann nie erneut aufgenommen werden (stale/already_resolved)');
  ok((await q(`select count(*) from rwi.round_results where fight_id=${F.fid}`)) === '1', 'weiterhin genau ein Rundenergebnis');

  // ---- 5. erneutes stuck nach Wiederaufnahme = neue Episode, neuer Alarm ----
  { const K = await mkFight(); for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await K.expire(); }
    ok((await job(K.fid)) === 'stuck/6/0' && (await alerts(K.fid)) === '1', 'Episode 0: stuck, ein Alarm');
    await ops.resume(K.fid, 1, OP, 'erster Versuch nach Analyse (Test)');
    for (let k = 0; k < 6; k++) { await K.expire(); await runTick(db, broken); }
    ok((await job(K.fid)) === 'stuck/6/1' && (await alerts(K.fid)) === '2' && (await open(K.fid)) === '1', 'Episode 1: erneut stuck -> NEUER Alarm (insgesamt 2, einer offen, einer erledigt)', `${await job(K.fid)} alarme=${await alerts(K.fid)}`);
    ok(new Set((await q(`select dedupe_key from rwi.ops_alerts where fight_id=${K.fid} order by id`)).split('\n')).size === 2, 'beide Alarme haben verschiedene Schlüssel');
    // ---- 6. technische Beendigung ----
    const tm = await ops.terminate(K.fid, OP, 'Ursache nicht behebbar, Instanz technisch beenden');
    ok(tm.status === 'terminated' && (await q(`select status from rwi.instances where id=${K.inst}`)) === 'aborted' && (await q(`select status from rwi.fights where id=${K.fid}`)) === 'technical_end', 'technische Beendigung: Instanz aborted, Kampf technical_end');
    ok((await q(`select count(*) from rwi.rewards where instance_id=${K.inst}`)) === '0' && (await open(K.fid)) === '0' && (await q(`select count(*) from rwi.ops_log where kind='terminate' and fight_id=${K.fid}`)) === '1', 'keine Belohnung, Alarm erledigt, Beendigung protokolliert');
    ok((await ops.terminate(K.fid, OP, 'zweiter Versuch darf nichts mehr tun')).status === 'not_active', 'zweite Beendigung: not_active'); }

  // ---- 7. gleichzeitig: zwei Wiederaufnahmen; mehrere Fehlermeldungen am Übergang ----
  { const K = await mkFight(); for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await K.expire(); }
    const res = (await parallel([1, 2, 3].map((i) => `select public.rw_ops_resume(${K.fid}, 1, '${OP}', 'gleichzeitige Wiederaufnahme Nummer ${i}')`))).map((r) => J(r.out).status).sort();
    ok(res.filter((x) => x === 'resumed').length === 1 && res.filter((x) => x === 'not_stuck').length === 2, 'drei gleichzeitige Wiederaufnahmen: genau eine wirkt, zwei not_stuck', res.join(','));
    ok((await q(`select count(*) from rwi.ops_log where kind='resume' and fight_id=${K.fid}`)) === '1', 'genau ein Protokolleintrag');
    const M = await mkFight(); await q(`update rwi.cfg set v = 1 where k = 'max_attempts'`);
    const c = await db.claim(M.fid, 1);
    const rr = (await parallel([1, 2, 3, 4].map(() => `select public.rw_worker_report_failure(${M.fid}, 1, '${c.token}', 'gleichzeitig')`))).map((r) => J(r.out).status).sort();
    ok((await alerts(M.fid)) === '1' && rr.filter((x) => x === 'stuck').length === 1, 'vier gleichzeitige Fehlermeldungen am Übergang: ein stuck, ein Alarm', rr.join(','));
    await q(`update rwi.cfg set v = 6 where k = 'max_attempts'`); }

  // ---- 8. stuck über die Invariantenprüfung (commit_round) ----
  { const K = await mkFight(); const c = await db.claim(K.fid, 1); const good = engine.resolveClaim(c.input); const bad = JSON.parse(JSON.stringify(good)); bad.state.members[0].hp = 99999;
    const seen = []; for (let k = 0; k < 8; k++) seen.push((await db.commit(K.fid, 1, c.token, c.round_version, c.input_hash, engine.ENGINE_VERSION, bad)).status);
    ok(seen.slice(0, 6).every((x) => x === 'invalid') && seen.slice(6).every((x) => x === 'stuck_locked') && (await job(K.fid)).startsWith('stuck/') && (await alerts(K.fid)) === '1', 'Invariantenverletzung: stuck nach max_attempts, weitere Commits sind gesperrt (stuck_locked, kein Zähler), nur EIN Alarm', seen.join(',') + ' ' + await job(K.fid));
    const hf = await db.commit(K.fid, 1, c.token, c.round_version, c.input_hash, 'proto-0.2-hotfix', good);
    ok(hf.status === 'stuck_locked' && (await open(K.fid)) === '1' && (await q(`select count(*) from rwi.round_results where fight_id=${K.fid}`)) === '0', 'Hotfix-Commit mit neuer Engine-Version ohne Operatorentscheidung wird abgewiesen: Sperre und Alarm bleiben', hf.status);
    ok((await ops.registerEngine(OP, 'proto-0.2-hotfix', 1, 'Hotfix')).status === 'registered', 'neue Engine-Version registriert');
    const rs = await ops.resume(K.fid, 1, OP, 'Fehlerursache analysiert, Hotfix eingespielt', 'proto-0.2-hotfix');
    ok(rs.status === 'resumed' && rs.new_engine === 'proto-0.2-hotfix' && rs.old_engine === engine.ENGINE_VERSION && (await open(K.fid)) === '0', 'kontrollierte Wiederaufnahme mit neuer Engine-Version: alte und neue Version im Ergebnis, Alarm erledigt', JSON.stringify(rs));
    const c2 = await db.claim(K.fid, 1); const hf2 = await db.commit(K.fid, 1, c2.token, c2.round_version, c2.input_hash, 'proto-0.2-hotfix', engine.resolveClaim(c2.input));
    ok(hf2.status === 'committed' && (await q(`select count(*) from rwi.ops_log where kind='resume' and fight_id=${K.fid} and old_engine='${engine.ENGINE_VERSION}' and new_engine='proto-0.2-hotfix'`)) === '1', 'nach der Wiederaufnahme wird die Runde mit der freigegebenen Version committet; Betriebsprotokoll enthält alte und neue Version', hf2.status); }

  // ---- 9. Instanz endet, während stuck: Alarm wird vom Watchdog geschlossen ----
  { const K = await mkFight(); for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await K.expire(); }
    ok((await open(K.fid)) === '1', 'Vorbereitung: offener Alarm'); await q(`select rwi.abort_instance(${K.inst}, 'Test')`);
    const w = await db.watchdog(); ok((await open(K.fid)) === '0' && (await alerts(K.fid)) === '1', 'Instanz beendet: der Watchdog schließt den Alarm automatisch (kein dauerhaft offener Alarm)'); }

  // ---- 10. Weltboss stuck, ends_at vorbei, Watchdog noch nicht gelaufen: technische Beendigung ergibt Eventende (K.2/K.3), nicht aborted ----
  { const ps = []; for (let k = 0; k < 6; k++) ps.push(await E.account('W' + (++n) + 'x' + k));
    const g = J(await q(`select rwi.create_group('weltboss', array[${ps.map((p) => `'${p.chars[0]}'`).join(',')}]::text[], 1, ${9000 + n}, clock_timestamp() + interval '12 seconds')`));
    for (const p of ps) await q(`select rwi.set_ready(${g.instance}, '${p.chars[0]}')`);
    const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 4000, bossAtk: 8 });
    await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
    const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`);
    for (let k = 0; k < 6; k++) { await runTick(db, broken); if (k < 5) await q(`update rwi.fights set lease_until = clock_timestamp() - interval '1 second' where id=${fid} and phase='resolving'`); }
    ok((await job(fid)).startsWith('stuck/'), 'Vorbereitung: Weltboss-Kampf stuck vor dem Eventende', await job(fid));
    while (+(await q(`select (clock_timestamp() < ends_at)::int from rwi.instances where id=${g.instance}`)) === 1) await new Promise((r) => setTimeout(r, 250));
    const tm = await ops.terminate(fid, OP, 'Ursache nicht behebbar, Weltboss technisch beenden');
    const st = await q(`select status from rwi.instances where id=${g.instance}`);
    ok(tm.status === 'event_ended' && st === 'event_ended' && (await q(`select count(*) from rwi.rewards where instance_id=${g.instance}`)) === '0',
       'technische Beendigung nach ends_at: Status event_ended (Eventende schlägt alles, kein aborted), keine Belohnung', `${tm.status} / ${st}`);
    await db.watchdog(); ok((await open(fid)) === '0', 'danach schließt der Watchdog den stuck-Alarm'); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());
