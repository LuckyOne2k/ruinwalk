// Lösch-Trigger (Charakter/Konto gelöscht -> Instanzmitgliedschaft beenden): node server/instance/tests/loesch-trigger.mjs
// Szenarien: laufende Runde, Gruppenpause, laufende Rundenauflösung, bestätigte Aktion, Konto mit mehreren Charakteren, mehrere Instanzen, Gleichzeitigkeit, Fehler in rwi.leave, Rollback.
// NICHT ECHT: auth.* ist die Attrappe (kein GoTrue); delete_account wird mit gestellter Passwortsitzung aufgerufen.
import { setup, counter, J } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { decideRevive } from '../sim/bots.mjs';
const { ok, done } = counter();
const E = await setup(54470); const { q, as, parallel, group } = E;
const act = { type: 'attack' };
const fightOf = async (ch, fights = 2) => {                 // Instanz mit Kampf in Runde 1 (Planung)
  const g = await group(ch, fights); for (const c of ch) await q(`select rwi.set_ready(${g.instance}, '${c}')`);
  const S = engine.newFight(J(await q(`select rwi.roster(${g.instance})`)), { bossHp: 400, bossAtk: 8 });
  await q(`select rwi.start_fight(${g.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`);
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${g.instance}`));
  return { inst: g.instance, fid, due: () => q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid} and phase='planning'`) };
};
const claim = async (F) => J(await q(`select rwi.claim_resolution(${F.fid}, (select round_no from rwi.fights where id=${F.fid}))`));
const commit = async (F, c) => { const res = engine.resolveClaim(c.input); return J(await q(`select rwi.commit_round(${F.fid}, ${c.input.round_no}, '${c.token}', ${c.round_version}, '${c.input_hash}', '${engine.ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`)); };
const mstate = (inst, ch) => q(`select mstate || '/' || coalesce(leave_reason,'') from rwi.members where instance_id=${inst} and player='${ch}'`);
// Konsistenzprüfung über ALLE Instanzen: keine Geistermitglieder, keine hängenden Aufträge/Kämpfe in beendeten Instanzen, kein Profil ohne Charakter
const consistent = async () => {
  const v = [];
  const n = (sql, msg) => q(sql).then((x) => { if (x !== '0') v.push(`${msg}=${x}`); });
  await n(`select count(*) from rwi.members m where m.mstate='active' and not exists (select 1 from public.characters c where c.character_id::text = m.player)`, 'aktive Mitglieder ohne Charakter');
  await n(`select count(*) from rwi.waitlist w where w.status='waiting' and not exists (select 1 from public.characters c where c.character_id::text = w.player)`, 'Wartende ohne Charakter');
  await n(`select count(*) from rwi.players p where not exists (select 1 from public.characters c where c.character_id::text = p.player) and p.player ~ '^cccc'`, 'Profile ohne Charakter');
  await n(`select count(*) from rwi.fights f join rwi.instances i on i.id=f.instance_id where i.status<>'active' and f.status='active'`, 'aktive Kämpfe in beendeten Instanzen');
  await n(`select count(*) from rwi.resolve_jobs j join rwi.fights f on f.id=j.fight_id join rwi.instances i on i.id=f.instance_id where i.status<>'active' and j.status in ('pending','claimed','stuck')`, 'offene Aufträge in beendeten Instanzen');
  await n(`select count(*) from rwi.instances i where i.status='active' and i.stage<>'done' and not exists (select 1 from rwi.members m where m.instance_id=i.id and m.mstate='active')`, 'aktive Instanzen ohne aktives Mitglied');
  await n(`select count(*) from (select fight_id, round_no from rwi.round_results group by 1,2 having count(*)>1) x`, 'doppelte Rundenergebnisse');
  return v.join('; ') || 'ok';
};
const alerts = (what) => q(`select count(*) from rwi.ops_alerts where what='${what}'`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  // ---- Prüfhilfe: protokolliert beim Austritt, was zu diesem Zeitpunkt im Konto-/Charakterbestand noch sichtbar ist (Reihenfolge der Kaskade) ----
  await q(`create table public.probe(at timestamptz default clock_timestamp(), ch text, chars_visible int, profile_visible int, user_visible int, siblings int);
    create function public.probe_fn() returns trigger language plpgsql security definer as $$ begin
      if new.event = 'ausgeschieden' then insert into public.probe(ch, chars_visible, profile_visible, user_visible, siblings) values (new.player,
        (select count(*) from public.characters where character_id::text = new.player),
        (select count(*) from public.profiles p where p.account_id = rwi.account_of(new.player) or p.account_id in (select account_id from public.characters where character_id::text = new.player)),
        (select count(*) from auth.users),
        (select count(*) from public.characters)); end if; return new; end $$;
    create trigger probe_t before insert on rwi.group_log for each row execute function public.probe_fn();`);

  // ===== 1. Charakterlöschung während einer laufenden Runde (Planung) + 4. bereits bestätigte Aktion =====
  { const A = await E.account('L1A'), B = await E.account('L1B'), C = await E.account('L1C');
    const F = await fightOf([A.chars[0], B.chars[0], C.chars[0]]);
    const keyB = await q(`select key from rwi.members where instance_id=${F.inst} and player='${B.chars[0]}'`);
    const stt = J(await q(`select state from rwi.fights where id=${F.fid}`)); const me = stt.members.find((x) => x.id === keyB);
    const sa = J(await q(`select rwi.submit_action_for('${B.chars[0]}', ${F.fid}, 1, $j$${JSON.stringify(decideRevive(stt, me))}$j$::jsonb)`));
    ok(await q(`select (actions ? '${keyB}')::text from rwi.fights where id=${F.fid}`) === 'true', 'Vorbereitung: Aktion des Charakters B ist bestätigt', JSON.stringify(sa).slice(0, 80));
    const r = await E.cl.psql(`delete from public.characters where character_id='${B.chars[0]}'`);
    ok(r.code === 0, 'Charakter mit bestätigter Aktion in laufender Runde löschen gelingt', r.err);
    ok((await mstate(F.inst, B.chars[0])).startsWith('left'), 'bestätigte Aktion: Mitglied ist ausgetreten (freiwillig)');
    ok(await q(`select (actions ? '${keyB}')::text from rwi.fights where id=${F.fid}`) === 'true', 'die bereits bestätigte Aktion bleibt als Verlauf stehen (wird nicht gelöscht, nicht verändert)');
    ok((await q(`select status || '/' || phase from rwi.fights where id=${F.fid}`)) === 'active/planning' && (await q(`select status from rwi.instances where id=${F.inst}`)) === 'active', 'Kampf und Instanz laufen weiter (zwei aktive Mitglieder)');
    await F.due(); const c = await claim(F);
    ok(c.status === 'ok' && (c.input.snapshot.left || []).includes(keyB), 'nächster Claim: ausgeschiedenes Mitglied steht in der Austrittsliste des eingefrorenen Snapshots', JSON.stringify(c.input.snapshot.left));
    const k = await commit(F, c);
    ok(['committed', 'continue', 'won', 'lost'].includes(k.status) || k.status === 'ok' || k.status === 'committed', 'Runde wird regulär committet', JSON.stringify(k).slice(0, 100));
    const st = J(await q(`select state from rwi.fights where id=${F.fid}`)); const mb = st.members.find((x) => x.id === keyB);
    ok(mb && mb.gone === true, 'Engine setzt das gelöschte Mitglied auf „gone“ (nimmt nicht mehr am Kampf teil)');
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }

  // ===== 2. Charakterlöschung während einer Gruppenpause =====
  { const A = await E.account('L2A'), B = await E.account('L2B'), C = await E.account('L2C');
    const F = await fightOf([A.chars[0], B.chars[0], C.chars[0]]);
    for (const c of [A, B, C]) await q(`select rwi.set_connection(${F.inst}, '${c.chars[0]}', false)`);
    const paused = await q(`select (paused_at is not null)::text from rwi.instances where id=${F.inst}`);
    ok(paused === 'true', 'Vorbereitung: alle getrennt im Kampf -> Gruppenpause');
    const used0 = await q(`select pause_used_ms from rwi.instances where id=${F.inst}`);
    const r = await E.cl.psql(`delete from public.characters where character_id='${B.chars[0]}'`);
    ok(r.code === 0 && (await mstate(F.inst, B.chars[0])).startsWith('left'), 'Löschen während der Pause: Mitglied ausgetreten', r.err);
    ok((await q(`select (paused_at is not null)::text || '/' || status from rwi.instances where id=${F.inst}`)) === 'true/active', 'die Gruppenpause besteht unverändert weiter, Instanz aktiv');
    ok((await q(`select pause_used_ms from rwi.instances where id=${F.inst}`)) === used0, 'verbrauchtes Pausenbudget wird durch das Löschen nicht verändert');
    await q(`select rwi.set_connection(${F.inst}, '${A.chars[0]}', true)`);
    ok((await q(`select (paused_at is null)::text from rwi.instances where id=${F.inst}`)) === 'true', 'Wiederverbindung eines Mitglieds beendet die Pause wie bisher');
    // gelöschter war das letzte aktive Mitglied bei Pause: Instanz wird (bestehende Austrittsregel) abgebrochen
    const A2 = await E.account('L2D'), B2 = await E.account('L2E'); const F2 = await fightOf([A2.chars[0], B2.chars[0]]);
    for (const c of [A2, B2]) await q(`select rwi.set_connection(${F2.inst}, '${c.chars[0]}', false)`);
    await E.cl.psql(`delete from public.characters where character_id in ('${A2.chars[0]}','${B2.chars[0]}')`);
    ok((await q(`select status from rwi.instances where id=${F2.inst}`)) === 'aborted' && (await q(`select count(*) from rwi.fights where instance_id=${F2.inst} and status='active'`)) === '0', 'beide gelöscht: Instanz regulär abgebrochen, kein aktiver Kampf bleibt');
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }

  // ===== 3. Charakterlöschung während einer laufenden Rundenauflösung (Claim vergeben, Commit steht aus) =====
  { const A = await E.account('L3A'), B = await E.account('L3B'), C = await E.account('L3C');
    const F = await fightOf([A.chars[0], B.chars[0], C.chars[0]]); await F.due(); const c = await claim(F);
    ok(c.status === 'ok' && (await q(`select phase from rwi.fights where id=${F.fid}`)) === 'resolving', 'Vorbereitung: Runde wird aufgelöst (Claim, Lease läuft)');
    const r = await E.cl.psql(`delete from public.characters where character_id='${B.chars[0]}'`);
    ok(r.code === 0 && (await mstate(F.inst, B.chars[0])).startsWith('left'), 'Löschen während der Auflösung gelingt, Mitglied ausgetreten', r.err);
    ok((await q(`select claim_token::text from rwi.fights where id=${F.fid}`)) === c.token && (await q(`select phase from rwi.fights where id=${F.fid}`)) === 'resolving', 'Lease, Token und Phase des laufenden Claims bleiben unverändert');
    const k = await commit(F, c);
    ok(k.status === 'committed' || k.status === 'ok', 'Commit mit dem vor dem Löschen eingefrorenen Snapshot ist weiterhin gültig (kein input_mismatch, kein superseded)', JSON.stringify(k).slice(0, 100));
    ok((await q(`select count(*) from rwi.round_results where fight_id=${F.fid}`)) === '1', 'genau ein Rundenergebnis');
    // letztes aktives Mitglied wird gelöscht, während noch aufgelöst wird
    const A2 = await E.account('L3D'), B2 = await E.account('L3E'); const F2 = await fightOf([A2.chars[0], B2.chars[0]]); await F2.due(); const c2 = await claim(F2);
    await E.cl.psql(`delete from public.characters where character_id in ('${A2.chars[0]}','${B2.chars[0]}')`);
    const k2 = await commit(F2, c2);
    ok(!['committed', 'ok'].includes(k2.status) && (await q(`select count(*) from rwi.round_results where fight_id=${F2.fid}`)) === '0', 'alle ausgetreten während der Auflösung: Instanz abgebrochen, der späte Commit wird ohne Wirkung abgewiesen', JSON.stringify(k2));
    ok((await q(`select status from rwi.instances where id=${F2.inst}`)) === 'aborted', 'Instanz im Zustand aborted');
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }

  // ===== 5/6. Kontolöschung mit mehreren Charakteren in mehreren laufenden Instanzen; Reihenfolge und Verfügbarkeit =====
  { const A = await E.account('L5A', 3), R1 = await E.account('L5R1'), R2 = await E.account('L5R2'), R3 = await E.account('L5R3'), R4 = await E.account('L5R4'), R5 = await E.account('L5R5');
    const F1 = await fightOf([A.chars[0], R1.chars[0], R2.chars[0]]), F2 = await fightOf([A.chars[1], R3.chars[0], R4.chars[0]]);
    const g3 = await group([A.chars[2], R5.chars[0]]);
    await q(`select rwi.join(${g3.instance}, '${R1.chars[0]}')`);
    await q('truncate public.probe');
    const r = await E.cl.psql(`delete from auth.users where id='${A.id}'`);
    ok(r.code === 0, 'Kontolöschung (auth.users, Kaskade) mit 3 Charakteren in 3 Instanzen gelingt', r.err);
    for (const [i, c] of [[F1.inst, A.chars[0]], [F2.inst, A.chars[1]], [g3.instance, A.chars[2]]]) ok((await mstate(i, c)).startsWith('left'), `Charakter ${c.slice(0, 8)}… ist in Instanz ${i} ausgetreten`);
    ok((await q(`select count(*) from rwi.members where instance_id=${F1.inst} and mstate='active'`)) === '2' && (await q(`select count(*) from rwi.members where instance_id=${F2.inst} and mstate='active'`)) === '2' && (await q(`select count(*) from rwi.members where instance_id=${g3.instance} and mstate='active'`)) === '2', 'in jeder Instanz bleiben die anderen Mitglieder aktiv (2/2/2)');
    ok((await q(`select count(*) from rwi.instances where id in (${F1.inst},${F2.inst},${g3.instance}) and status='active'`)) === '3', 'alle drei Instanzen laufen weiter');
    const pr = (await q('select ch || \'|\' || chars_visible || \'|\' || profile_visible || \'|\' || user_visible from public.probe order by at')).split('\n');
    ok(pr.length === 3 && pr.every((x) => x.split('|')[1] === '0'), 'Reihenfolge: zum Zeitpunkt des Austritts ist die Charakterzeile bereits gelöscht (AFTER DELETE), rwi.leave kommt ohne sie aus', pr.join(' ; '));
    ok(pr.every((x) => x.split('|')[2] === '0'), 'Reihenfolge: das Profil des Kontos ist bei der Kaskade zu diesem Zeitpunkt ebenfalls nicht mehr sichtbar', pr.join(' ; '));
    ok((await q(`select count(*) from rwi.members where account='${A.id}'`)) === '0' && (await q(`select count(*) from rwi.players where player in ('${A.chars.join("','")}')`)) === '0', 'Kontokennung und Spielerprofile entfernt');
    ok((await alerts('char_cleanup_failed')) === '0', 'kein Bereinigungsalarm im Normalfall');
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }
  // Welche rwi-Funktionen lesen public.characters? Nur Identität/Konto-Hook (Beweis, dass rwi.leave den Bestand nicht braucht)
  { const dep = await q(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace='rwi'::regnamespace and prosrc ilike '%public.characters%'`);
    ok(dep === 'account_of,derive_profile,own_character,profile_of', 'nur own_character, account_of und die Profilableitung (derive_profile, profile_of) lesen public.characters; weder rwi.leave noch der Lösch-Trigger brauchen den Charakterbestand (nur OLD)', dep); }

  // ===== 7. Gleichzeitig: Löschung und Rundenauflösung =====
  { let bad = 0, errs = [], both = 0; const N = 6;
    for (let n = 0; n < N; n++) {
      const A = await E.account('L7A' + n), B = await E.account('L7B' + n), C = await E.account('L7C' + n);
      const F = await fightOf([A.chars[0], B.chars[0], C.chars[0]]); await F.due();
      // Worker-Schleife (Claim + Commit) gegen Löschung. Das Rundenergebnis wird vorab aus dem Claim gerechnet, damit der Commit direkt nach dem Claim folgt.
      const res = await Promise.all([
        (async () => { const c = await claim(F); if (c.status !== 'ok') return { c }; return { c, k: await commit(F, c) }; })().then((x) => { return new Promise((r1) => r1(x)); }),
        E.cl.psql(`select pg_sleep(${(n % 3) * 0.03}); delete from public.characters where character_id='${B.chars[0]}'`)]);
      // die Löschung wurde nicht abgestimmt gestartet (Zeitversatz nur gestaffelt); Zweck: beide Reihenfolgen kommen vor
      if (res[1].code !== 0) errs.push(res[1].err.split('\n')[0]);
      const rr = await q(`select count(*) from rwi.round_results where fight_id=${F.fid}`);
      if (rr !== '1' || !(await mstate(F.inst, B.chars[0])).startsWith('left') || (await consistent()) !== 'ok') bad++;
      if (res[0].k && res[0].k.status !== 'committed' && res[0].k.status !== 'ok') both++;
    }
    ok(bad === 0 && errs.length === 0, `${N} Läufe gestaffelt: Löschung und Claim/Commit gleichzeitig: ein Rundenergebnis, Mitglied ausgetreten, Konsistenz, keine Fehler`, `abweichend=${bad} fehler=${errs.join('|')} commit_nicht_ok=${both}`); }
  // Sperrreihenfolge: zwei Konten, jeweils zwei Charaktere in denselben zwei Instanzen, entgegengesetzte Reihenfolge, gleichzeitige Kontolöschung. Künstliche Verzögerung im Austritt, damit Überschneidung sicher auftritt.
  { await q(`create function public.slow_fn() returns trigger language plpgsql as $$ begin perform pg_sleep(0.25); return new; end $$;
             create trigger slow_t before insert on rwi.group_log for each row execute function public.slow_fn();`);
    const run = async (lock) => {
      const X = await E.account('L8X' + lock, 2), Y = await E.account('L8Y' + lock, 2), P = await E.account('L8P' + lock), Q = await E.account('L8Q' + lock);
      const i1 = await group([X.chars[0], P.chars[0], Y.chars[1]]), i2 = await group([Y.chars[0], Q.chars[0], X.chars[1]]);
      // X: Charakter 0 in Instanz 1, Charakter 1 in Instanz 2; Y: Charakter 0 in Instanz 2, Charakter 1 in Instanz 1 -> gegenläufige Reihenfolge der Kaskade
      if (!lock) await q('alter table public.profiles disable trigger profiles_rwi_lock');
      const res = await parallel([`delete from auth.users where id='${X.id}'`, `delete from auth.users where id='${Y.id}'`], 700);
      if (!lock) await q('alter table public.profiles enable trigger profiles_rwi_lock');
      return { res, i1: i1.instance, i2: i2.instance, X, Y };
    };
    const withLock = await run(1);
    ok(withLock.res.every((r) => r.code === 0), 'gleichzeitige Kontolöschung in gegenläufiger Instanzreihenfolge: beide gelingen, kein Deadlock (Vorab-Sperre in aufsteigender ID)', withLock.res.map((r) => r.err.split('\n')[0]).join(' | '));
    ok((await q(`select count(*) from rwi.members where instance_id in (${withLock.i1},${withLock.i2}) and mstate='active'`)) === '2' && (await alerts('char_cleanup_failed')) === '0', 'danach nur die beiden Fremdmitglieder aktiv, kein Bereinigungsalarm');
    const ctl = await run(0);
    const dead = ctl.res.filter((r) => /deadlock/i.test(r.err)).length, swallowed = +(await alerts('char_cleanup_failed'));
    ok(dead + swallowed > 0, 'Kontrollversuch ohne Vorab-Sperre zeigt das Problem (Deadlock oder abgefangener Fehler): die Prüfung ist wirksam', `deadlock=${dead} alarm=${swallowed}`);
    await q('drop trigger slow_t on rwi.group_log'); await q(`delete from rwi.ops_alerts`);
    ok((await consistent()) === 'ok', 'Konsistenz auch nach dem Kontrollversuch', await consistent()); }

  // ===== 8. Fehler in rwi.leave (Fehlerinjektion) =====
  { await q(`create function public.boom() returns trigger language plpgsql as $$ begin if new.event = 'ausgeschieden' then raise exception 'injizierter Fehler in leave'; end if; return new; end $$;
             create trigger boom_t before insert on rwi.group_log for each row execute function public.boom();`);
    await q('drop trigger probe_t on rwi.group_log');
    const A = await E.account('L9A'), B = await E.account('L9B'), C = await E.account('L9C');
    const F = await fightOf([A.chars[0], B.chars[0], C.chars[0]]);
    const bk0 = await q(`select count(*) from public.character_backups where character_id='${B.chars[0]}'`);
    const r = await E.cl.psql(`delete from public.characters where character_id='${B.chars[0]}'`);
    ok(r.code === 0, 'Fehler in rwi.leave blockiert das Löschen des Charakters nicht', r.err);
    ok((await mstate(F.inst, B.chars[0])) === 'left/freiwillig', 'Stufe 2: Mitglied ist trotzdem nicht mehr aktiv (left/freiwillig wie bei rwi.drop_member) – kein Geistermitglied');
    ok((await alerts('char_cleanup_failed')) === '1', 'Alarm char_cleanup_failed wurde geschrieben');
    ok((await q(`select status from rwi.instances where id=${F.inst}`)) === 'active' && (await q(`select count(*) from rwi.members where instance_id=${F.inst} and mstate='active'`)) === '2', 'übrige Instanz unverändert aktiv mit zwei Mitgliedern');
    ok((await q(`select count(*) from public.characters where character_id='${B.chars[0]}'`)) === '0' && (await q(`select count(*) from public.character_backups where character_id='${B.chars[0]}' and reason='delete'`)) === String(+bk0 + 1), 'Charakter gelöscht und Löschsicherung angelegt');
    // Stufe 2 scheitert ebenfalls -> alles wird zurückgerollt
    await q(`create function public.boom2() returns trigger language plpgsql as $$ begin if new.leave_reason = 'freiwillig' and new.mstate = 'left' then raise exception 'injizierter Fehler in Stufe 2'; end if; return new; end $$;
             create trigger boom2_t before update on rwi.members for each row execute function public.boom2();`);
    const bk1 = await q(`select count(*) from public.character_backups where character_id='${C.chars[0]}'`), al0 = await alerts('char_cleanup_failed');
    const r2 = await E.cl.psql(`delete from public.characters where character_id='${C.chars[0]}'`);
    ok(r2.code !== 0 && /Stufe 2/.test(r2.err), 'Fehler auch in Stufe 2: das Löschen wird abgewiesen', r2.err.split('\n')[0]);
    ok((await q(`select count(*) from public.characters where character_id='${C.chars[0]}'`)) === '1' && (await mstate(F.inst, C.chars[0])) === 'active/' && (await q(`select count(*) from rwi.players where player='${C.chars[0]}'`)) === '1', 'Rollback: Charakter, aktive Mitgliedschaft und Spielerprofil sind unverändert');
    ok((await q(`select count(*) from public.character_backups where character_id='${C.chars[0]}'`)) === bk1 && (await alerts('char_cleanup_failed')) === String(al0), 'Rollback: keine Löschsicherung und kein Alarm bleiben zurück (alles in einer Transaktion)');
    // Konto: delete_account mit mehreren Charakteren, Fehler in Stufe 2 -> gesamtes Konto bleibt unverändert
    const D = await E.account('L9D', 2), G2 = await E.account('L9G'); const FD = await fightOf([D.chars[0], G2.chars[0], (await E.account('L9H')).chars[0]]);
    const sid = '20000000-0000-4000-8000-000000000001';
    await q(`insert into auth.sessions(id,user_id) values ('${sid}','${D.id}'); insert into auth.mfa_amr_claims(session_id,authentication_method) values ('${sid}','password')`);
    await q(`insert into public.payment_events(provider_event_id, account_id, kind, payload) values ('evt_l9','${D.id}','paid','{"amount":5,"currency":"EUR","email":"x@y.de"}')`);
    await q(`insert into public.audit_log(account_id, character_id, action) values ('${D.id}','${D.chars[0]}','test')`);
    const delAcc = () => as('authenticated', D.id, `set request.jwt.claims = '${JSON.stringify({ sub: D.id, role: 'authenticated', session_id: sid })}'; select public.delete_account('${D.name}')`);
    const before = await q(`select (select count(*) from auth.users where id='${D.id}') || '/' || (select count(*) from public.profiles where account_id='${D.id}') || '/' || (select count(*) from public.characters where account_id='${D.id}') || '/' || (select count(*) from public.audit_log where account_id='${D.id}') || '/' || (select payload ? 'email' from public.payment_events where provider_event_id='evt_l9')`);
    const r3 = await delAcc();
    ok(r3.code !== 0, 'delete_account scheitert, wenn die Instanzbereinigung nicht möglich ist (Stufe 2 injiziert)', r3.err.split('\n')[0]);
    const after = await q(`select (select count(*) from auth.users where id='${D.id}') || '/' || (select count(*) from public.profiles where account_id='${D.id}') || '/' || (select count(*) from public.characters where account_id='${D.id}') || '/' || (select count(*) from public.audit_log where account_id='${D.id}') || '/' || (select payload ? 'email' from public.payment_events where provider_event_id='evt_l9')`);
    ok(before === after && before === '1/1/2/1/true', 'Rollback der gesamten Kontolöschung: Konto, Profil, beide Charaktere, Protokoll und Zahlungsereignis (nicht geschwärzt) unverändert', `${before} -> ${after}`);
    ok((await mstate(FD.inst, D.chars[0])) === 'active/', 'und die Instanzmitgliedschaft ist unverändert aktiv');
    // Fehlerursache beheben -> Wiederholung gelingt vollständig
    await q('drop trigger boom2_t on rwi.members; drop trigger boom_t on rwi.group_log');
    const r4 = await delAcc();
    ok(r4.code === 0 && (await q(`select count(*) from auth.users where id='${D.id}'`)) === '0' && (await mstate(FD.inst, D.chars[0])).startsWith('left'), 'nach Behebung gelingt die Wiederholung vollständig; Mitglied sauber ausgetreten', r4.err.split('\n')[0]);
    // Stufe 2 gelingt, aber die Folgeprüfung (Abbruch bei Mindestgröße) scheitert -> ebenfalls alles zurück (kein halb bereinigter Endzustand)
    { await q(`create trigger boom_t before insert on rwi.group_log for each row execute function public.boom();
               create function public.boom3() returns trigger language plpgsql as $$ begin if new.status = 'aborted' and old.status <> 'aborted' then raise exception 'injizierter Fehler in der Folgeprüfung'; end if; return new; end $$;
               create trigger boom3_t before update on rwi.instances for each row execute function public.boom3();`);
      const P = await E.account('L9P'), Q = await E.account('L9Q'); const FP = await fightOf([P.chars[0], Q.chars[0]]);
      const bkp = await q(`select count(*) from public.character_backups where character_id='${Q.chars[0]}'`);
      const r5 = await E.cl.psql(`delete from public.characters where character_id='${Q.chars[0]}'`);
      ok(r5.code !== 0 && /Folgeprüfung/.test(r5.err), 'Fehler in der Folgeprüfung nach erfolgreicher Stufe 2: das Löschen wird abgewiesen', r5.err.split('\n')[0]);
      ok((await q(`select count(*) from public.characters where character_id='${Q.chars[0]}'`)) === '1' && (await mstate(FP.inst, Q.chars[0])) === 'active/' && (await q(`select status from rwi.instances where id=${FP.inst}`)) === 'active' && (await q(`select count(*) from public.character_backups where character_id='${Q.chars[0]}'`)) === bkp, 'Rollback: Charakter, Mitgliedschaft, Instanzstatus und Sicherungen unverändert (kein Geistermitglied, kein halber Zustand)');
      await q('drop trigger boom3_t on rwi.instances; drop trigger boom_t on rwi.group_log');
      const r6 = await E.cl.psql(`delete from public.characters where character_id='${Q.chars[0]}'`);
      ok(r6.code === 0 && (await mstate(FP.inst, Q.chars[0])).startsWith('left') && (await consistent()) === 'ok', 'nach Behebung gelingt das Löschen; Zustand konsistent', r6.err.split('\n')[0]); }
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }

  // ===== 9. Wartelisteneintrag beim Löschen =====
  { const A = await E.account('LWa'), B = await E.account('LWb'), C = await E.account('LWc'), D = await E.account('LWd'), W = await E.account('LWw');
    const g = await group([A.chars[0], B.chars[0], C.chars[0], D.chars[0]]); await q(`select rwi.join(${g.instance}, '${W.chars[0]}')`);
    await E.cl.psql(`delete from public.characters where character_id='${W.chars[0]}'`);
    ok((await q(`select status from rwi.waitlist where instance_id=${g.instance} and player='${W.chars[0]}'`)) === 'cancelled', 'wartender Charakter gelöscht: Wartelisteneintrag storniert (kein Nachrücken eines Geistes)');
    ok((await consistent()) === 'ok', 'Konsistenz über alle Instanzen', await consistent()); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());
