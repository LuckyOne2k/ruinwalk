// Account-Eindeutigkeit je Instanz: node server/instance/tests/konto-regel.mjs
// Regel: Ein Account stellt in einer Instanz höchstens EINEN Charakter (Mitglied in jedem Zustand oder wartend). Verschiedene Instanzen dürfen verschiedene Charaktere desselben Accounts enthalten.
// Läuft auf lokalem PostgreSQL mit schema.sql + 01–05. NICHT ECHT: auth.* ist die Attrappe (kein GoTrue/PostgREST).
import { setup, counter, J } from './prod-env.mjs';
const { ok, done } = counter();
const E = await setup(54460); const { q, as, parallel, group, rpcAs } = E;
const st = (r) => { try { return J(r.out).status; } catch { return `FEHLER:${(r.err || '').split('\n')[0]}`; } };
const rows = (inst, acc) => q(`select (select count(*) from rwi.members where instance_id=${inst} and account='${acc}') + (select count(*) from rwi.waitlist where instance_id=${inst} and account='${acc}' and status='waiting')`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  const A = await E.account('Anna', 3), B = await E.account('Boris'), C = await E.account('Clara'), D = await E.account('Dirk'), F = await E.account('Eva'), G = await E.account('Gero');
  const join = (inst, ch) => q(`select rwi.join(${inst}, '${ch}')`).then(J);

  // 1. nacheinander
  const g1 = await group([A.chars[0], B.chars[0]]);
  ok(g1.status === 'ok', 'Gruppe mit zwei verschiedenen Accounts wird angelegt');
  ok((await join(g1.instance, A.chars[1])).status === 'account_in_instance', 'zweiter Charakter desselben Accounts (Mitglied) nacheinander: account_in_instance');
  const jc = await join(g1.instance, C.chars[0]); ok(jc.status === 'joined', 'anderer Account mit einem Charakter: reguläre Aufnahme (freier Platz in der Bereitschaftsphase)', JSON.stringify(jc));
  ok((await join(g1.instance, C.chars[0])).status === 'already_member', 'derselbe Charakter erneut: already_member (bestehende Regel bleibt)');
  ok((await rows(g1.instance, A.id)) === '1' && (await rows(g1.instance, C.id)) === '1', 'je Account genau eine Zeile (Mitglied oder wartend) in der Instanz');

  // 2. Warteliste (volle Gruppe: vier Mitglieder)
  const cc = await E.account('Clara2', 2);
  const g2 = await group([B.chars[0], D.chars[0], F.chars[0], G.chars[0]]);
  ok((await join(g2.instance, cc.chars[0])).status === 'waitlisted', 'Charakter 1 eines Accounts wartet');
  ok((await join(g2.instance, cc.chars[1])).status === 'account_in_instance', 'Charakter 2 desselben Accounts darf nicht zusätzlich auf die Warteliste (wartender Account zählt)');
  ok(J(await q(`select rwi.leave(${g2.instance}, '${cc.chars[0]}')`)).status === 'left_waitlist', 'Austritt aus der Warteliste');
  ok((await join(g2.instance, cc.chars[1])).status === 'waitlisted', 'nach Rückzug von der Warteliste (nie teilgenommen) darf der andere Charakter warten');

  // 3. Nachrücken aus der Warteliste und danach
  const g3 = await group([B.chars[0], D.chars[0], F.chars[0], G.chars[0]]); const hh = await E.account('Hans', 2);
  ok((await join(g3.instance, hh.chars[0])).status === 'waitlisted', 'Charakter wartet bei voller Gruppe');
  await q(`select rwi.leave(${g3.instance}, '${G.chars[0]}')`);          // Platz wird frei, Bereitschaftsphase: Nachrücken
  ok((await q(`select count(*) from rwi.members where instance_id=${g3.instance} and player='${hh.chars[0]}' and mstate='active'`)) === '1', 'wartender Charakter ist nachgerückt (Mitglied)');
  ok((await join(g3.instance, hh.chars[1])).status === 'account_in_instance', 'nach dem Nachrücken: zweiter Charakter desselben Accounts weiter gesperrt');

  // 4. Gruppenwechsel: Austritt aus Instanz 1, Beitritt einer anderen Instanz mit demselben Charakter; anderer Charakter derselben ersten Instanz bleibt gesperrt
  const gA = await group([A.chars[0], B.chars[0]]), gB = await group([G.chars[0], D.chars[0]]);
  ok(J(await q(`select rwi.leave(${gA.instance}, '${A.chars[0]}')`)).status === 'left', 'Austritt aus Instanz A');
  ok(['joined', 'waitlisted'].includes((await join(gB.instance, A.chars[0])).status), 'Gruppenwechsel: derselbe Charakter kann einer ANDEREN Instanz beitreten');
  ok((await join(gA.instance, A.chars[1])).status === 'account_in_instance', 'nach Austritt zählt der Account in Instanz A weiter (streng): anderer Charakter kann nicht nachtreten');
  ok((await join(gA.instance, A.chars[0])).status === 'no_rejoin', 'derselbe Charakter: kein Wiederbeitritt (bestehende Regel)');

  // 5. mehrere Instanzen mit unterschiedlichen Charakteren desselben Accounts
  const m1 = await group([A.chars[0], B.chars[0]]), m2 = await group([A.chars[1], D.chars[0]]), m3 = await group([A.chars[2], G.chars[0]]);
  ok([m1, m2, m3].every((x) => x.status === 'ok'), 'drei Instanzen mit drei verschiedenen Charakteren desselben Accounts (Platz 3 berechtigt) sind erlaubt');
  ok((await q(`select count(distinct instance_id) from rwi.members where account='${A.id}' and instance_id in (${m1.instance},${m2.instance},${m3.instance})`)) === '3', 'Account steht in drei Instanzen mit je einer Mitgliedszeile');

  // 6. create_group mit zwei Charakteren eines Accounts
  const cnt = await q('select count(*) from rwi.instances');
  const bad = J(await q(`select rwi.create_group('dungeon', array['${A.chars[0]}','${A.chars[1]}']::text[], 2)`));
  ok(bad.status === 'account_duplicate' && (await q('select count(*) from rwi.instances')) === cnt, 'create_group mit zwei Charakteren eines Accounts: account_duplicate, keine Instanz angelegt');

  // 7. Umgehungsversuche direkt auf den Tabellen (jeder Schreibweg)
  const T = await group([G.chars[0], D.chars[0]]);
  let r = await E.cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at) values (${T.instance}, '${B.chars[0]}', 'x1', now()); insert into rwi.members(instance_id, player, key, last_seen_at) values (${T.instance}, '${B.chars[0].replace('cccc', 'cccc')}', 'x2', now())`);
  ok(r.code !== 0, 'direkter Doppel-Insert desselben Spielers wird abgewiesen (bestehende Regel)');
  const b2 = await E.account('Boris2', 2);
  r = await E.cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at) values (${T.instance}, '${b2.chars[0]}', 'k1', now()), (${T.instance}, '${b2.chars[1]}', 'k2', now())`);
  ok(r.code !== 0 && /account_in_instance/.test(r.err), 'ein einziges INSERT mit zwei Charakteren desselben Accounts wird vom Trigger abgewiesen', r.err.split('\n')[0]);
  ok((await rows(T.instance, b2.id)) === '0', 'nach dem Fehlschlag ist nichts eingefügt (Anweisung atomar)');
  await q(`insert into rwi.members(instance_id, player, key, last_seen_at) values (${T.instance}, '${b2.chars[0]}', 'k1', now())`);
  r = await E.cl.psql(`insert into rwi.waitlist(instance_id, player) values (${T.instance}, '${b2.chars[1]}')`);
  ok(r.code !== 0 && /account_in_instance/.test(r.err), 'direkter Wartelisten-Insert eines zweiten Charakters des Mitglieds-Accounts wird abgewiesen', r.err.split('\n')[0]);
  await q('alter table rwi.members disable trigger members_account_guard');
  r = await E.cl.psql(`insert into rwi.members(instance_id, player, key, last_seen_at, account) values (${T.instance}, '${b2.chars[1]}', 'k2', now(), '${b2.id}')`);
  await q('alter table rwi.members enable trigger members_account_guard');
  ok(r.code !== 0 && /members_account_uq|unique|duplicate/i.test(r.err), 'dritte Schicht: selbst ohne Trigger verhindert der Unique-Index eine zweite Mitgliedszeile des Accounts', r.err.split('\n')[0]);
  ok((await as('authenticated', B.id, `update rwi.members set account = null`)).err.includes('permission denied'), 'Clients können die Kontokennung nicht ändern (kein Tabellenrecht auf rwi.members)');
  await q(`delete from rwi.members where instance_id=${T.instance} and player in ('${b2.chars[0]}','${b2.chars[1]}')`);

  // 8. gleichzeitig: zwei Charaktere desselben Accounts, mehrere Runden mit wechselnder Reihenfolge
  let both = 0, errs = 0, zero = 0, dupl = 0;
  for (let n = 0; n < 8; n++) {
    const a = await E.account('Par' + n, 2), x = await E.account('ParX' + n), y = await E.account('ParY' + n);
    const g = await group([x.chars[0], y.chars[0]]);
    const res = await parallel([`select rwi.join(${g.instance}, '${a.chars[0]}')`, `select rwi.join(${g.instance}, '${a.chars[1]}')`, `select rwi.join(${g.instance}, '${a.chars[n % 2]}')`]);
    const sts = res.map(st); errs += sts.filter((s) => s.startsWith('FEHLER')).length;
    const good = sts.filter((s) => s === 'waitlisted' || s === 'joined').length; if (good === 0) zero++; if ((await rows(g.instance, a.id)) !== '1') dupl++; if (good > 1) both++;
  }
  ok(errs === 0 && dupl === 0 && both === 0 && zero === 0, '8 Läufe: drei gleichzeitige Beitritte desselben Accounts (zwei Charaktere, einer doppelt) -> genau eine Zeile, nie zwei, nie null, keine Fehler', `Fehler=${errs} doppelt=${dupl} zwei_erfolgreich=${both} keiner=${zero}`);

  // 9. gleichzeitig über die Client-Wrapper (authenticated, auth.uid() aus der Sitzung)
  let d2 = 0, e2 = 0;
  for (let n = 0; n < 6; n++) {
    const a = await E.account('Wr' + n, 2), x = await E.account('WrX' + n), y = await E.account('WrY' + n);
    const g = await group([x.chars[0], y.chars[0]]);
    const res = await parallel(a.chars.map((c) => `set role authenticated; set search_path = "$user", public; set request.jwt.claims = '${JSON.stringify({ sub: a.id, role: 'authenticated' })}'; select public.group_join(${g.instance}, '${c}')`));
    const sts = res.map(st); e2 += sts.filter((s) => s.startsWith('FEHLER')).length;
    const good = sts.filter((s) => s === 'waitlisted' || s === 'joined').length;
    if (good !== 1 || !sts.includes('account_in_instance') || (await rows(g.instance, a.id)) !== '1') d2++;
  }
  ok(d2 === 0 && e2 === 0, '6 Läufe: parallele group_join desselben Accounts mit zwei Charakteren: genau EIN Erfolg, der andere account_in_instance', `abweichend=${d2} fehler=${e2}`);

  // 10. zwei verschiedene Accounts mit je einem Charakter gleichzeitig: beide erfolgreich
  let bad2 = 0;
  for (let n = 0; n < 5; n++) {
    const p = await E.account('Z1_' + n), s = await E.account('Z2_' + n), x = await E.account('ZX' + n), y = await E.account('ZY' + n);
    const g = await group([x.chars[0], y.chars[0]]);
    const res = (await parallel([`select rwi.join(${g.instance}, '${p.chars[0]}')`, `select rwi.join(${g.instance}, '${s.chars[0]}')`])).map(st);
    if (!res.every((x1) => x1 === 'waitlisted' || x1 === 'joined')) bad2++;
  }
  ok(bad2 === 0, '5 Läufe: zwei verschiedene Accounts mit je einem Charakter treten gleichzeitig bei: beide erfolgreich (keine falsche Sperre)');

  // 11. gleichzeitig Beitritt und Nachrücken/Bereitschaft (Wartelisten-Promotion) desselben Accounts
  let d3 = 0;
  for (let n = 0; n < 5; n++) {
    const a = await E.account('Pr' + n, 2), x = await E.account('PrX' + n), y = await E.account('PrY' + n);
    const g = await group([x.chars[0], y.chars[0]]);
    await q(`select rwi.join(${g.instance}, '${a.chars[0]}')`);
    const res = await parallel([`select rwi.join(${g.instance}, '${a.chars[1]}')`, `select rwi.set_ready(${g.instance}, '${x.chars[0]}')`, `select rwi.set_ready(${g.instance}, '${y.chars[0]}')`]);
    if (res.some((r1) => r1.code !== 0) || (await rows(g.instance, a.id)) !== '1') d3++;
  }
  ok(d3 === 0, '5 Läufe: Beitritt des zweiten Charakters gleichzeitig mit dem Nachrücken des ersten: weiter genau eine Zeile, keine Fehler');

  // 12. Prototyp-Spieler ohne Konto (keine Zuordnung) werden nicht beschränkt
  await q(`insert into rwi.players values ('proto1', 10, 'krieger', 'ritter', 3), ('proto2', 10, 'heiler', 'priester', 3), ('proto3', 10, 'magier', 'feuer', 3)`);
  const gp = J(await q(`select rwi.create_group('dungeon', array['proto1','proto2']::text[], 2)`));
  ok(gp.status === 'ok' && J(await q(`select rwi.join(${gp.instance}, 'proto3')`)).status === 'joined', 'Spielerschlüssel ohne Charakter/Konto (reine Prototypdaten) bleiben unbeschränkt');

  // 13. Konto gelöscht: Kennung wird entfernt
  const del = await E.account('Weg', 1), o1 = await E.account('Rest');
  const gd = await group([del.chars[0], o1.chars[0]]);
  await q(`delete from auth.users where id='${del.id}'`);
  ok((await q(`select count(*) from rwi.members where account='${del.id}'`)) === '0' && (await q(`select mstate from rwi.members where instance_id=${gd.instance} and player='${del.chars[0]}'`)) === 'left', 'Kontolöschung: Kontokennung entfernt, Mitglied ausgetreten, Verlaufszeile bleibt');

  // 14. Beschluss: auch AUTOMATISCH entfernte Mitglieder zählen weiter (drop_member ist der gemeinsame Weg aller automatischen Entfernungen)
  for (const reason of ['abwesenheit', 'bereitschaft']) {
    const ac = await E.account('Au' + reason.slice(0, 3), 2), pa = await E.account('Ap' + reason.slice(0, 3)), pb = await E.account('Aq' + reason.slice(0, 3));
    const ga = await group([ac.chars[0], pa.chars[0], pb.chars[0]]);
    await q(`select rwi.drop_member(${ga.instance}, '${ac.chars[0]}', '${reason}')`);
    ok((await q(`select mstate || ':' || leave_reason from rwi.members where instance_id=${ga.instance} and player='${ac.chars[0]}'`)) === `removed:${reason}`, `Vorbereitung: Mitglied automatisch entfernt (${reason})`);
    ok((await join(ga.instance, ac.chars[1])).status === 'account_in_instance', `automatisch entfernt (${reason}): anderer Charakter desselben Accounts darf NICHT erneut beitreten`);
    ok((await join(ga.instance, ac.chars[0])).status === 'no_rejoin', `automatisch entfernt (${reason}): derselbe Charakter kein Wiederbeitritt (bestehende Regel)`);
    const asAcc = rpcAs('authenticated', ac.id);
    let st = null; try { st = (await asAcc('group_join', { p_instance: ga.instance, p_character: ac.chars[1] })).status; } catch (e) { st = 'fehler:' + e.message; }
    ok(st === 'account_in_instance', `auch über den Client-Wrapper (${reason}) abgewiesen`, st);
    ok((await q(`select count(*) from rwi.members where instance_id=${ga.instance} and account='${ac.id}'`)) === '1', `genau eine Zeile des Accounts in der Instanz (${reason})`);
    const gb = await group([ac.chars[1], pa.chars[0]]);
    ok(gb.status === 'ok', `in einer ANDEREN Instanz darf derselbe Account einen anderen Charakter stellen (${reason})`, gb.status);
  }
  // 15. Warteliste + automatische Entfernung: ein aus der Warteliste nachgerückter und später entfernter Charakter zählt weiter
  { const w = await E.account('Warte', 2), f = [await E.account('Wf1'), await E.account('Wf2'), await E.account('Wf3'), await E.account('Wf4')];
    const g = await group(f.map((x) => x.chars[0])); ok((await join(g.instance, w.chars[0])).status === 'waitlisted', 'Warteliste: Charakter 1 wartet');
    await q(`select rwi.drop_member(${g.instance}, '${f[0].chars[0]}', 'abwesenheit'); select rwi.after_auto_removal(${g.instance})`);
    ok((await q(`select mstate from rwi.members where instance_id=${g.instance} and player='${w.chars[0]}'`)) === 'active', 'Wartender rückt nach');
    await q(`select rwi.drop_member(${g.instance}, '${w.chars[0]}', 'abwesenheit')`);
    ok((await join(g.instance, w.chars[1])).status === 'account_in_instance', 'nachgerückt und automatisch entfernt: zweiter Charakter weiter gesperrt'); }
  // 16. Kontolöschung: Kennung weg, Verlauf bleibt; der gelöschte Account taucht nicht mehr auf; ein ANDERER Account ist nicht betroffen
  { const d = await E.account('Del2', 2), o = await E.account('Rest2'), o2 = await E.account('Rest3'), fresh = await E.account('Fresh');
    const g = await group([d.chars[0], o.chars[0], o2.chars[0]]); await q(`delete from auth.users where id='${d.id}'`);
    ok((await q(`select count(*) from rwi.members where instance_id=${g.instance} and account is not null and account='${d.id}'`)) === '0', 'Kontolöschung: keine Zeile trägt die Kennung des gelöschten Accounts');
    ok((await join(g.instance, fresh.chars[0])).status !== 'account_in_instance', 'unbeteiligter Account wird durch die Löschung nicht blockiert', (await q(`select 1`))); }
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 3).join(' | ')); }
finally { E.stop(); }
process.exit(done());
