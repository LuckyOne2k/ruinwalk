// F9: nachträglich gesperrter Platz 3 (Beschluss 4): node server/instance/tests/slot3-f9.mjs
// Berechtigung wird bei Eintritt bzw. noch nicht abgegebenem Ready geprüft; das Charakterprofil wird danach FÜR DIE INSTANZ gespeichert. Entzug danach ändert nichts an der laufenden Instanz;
// neue Instanzen prüfen die aktuelle Berechtigung wieder. Lokal (Attrappe der Supabase-Rollen, kein echtes JWT).
import { setup, counter, J, charData } from './prod-env.mjs';
import * as engine from '../engine/v1.mjs';
import { hashOf } from '../engine/rng.mjs';
import { a1Db } from '../worker/a1.mjs';
const { ok, done } = counter();
const E = await setup(54492); const { q, rpcAs } = E;
const svc = rpcAs('service_role'); const db = a1Db(svc);
const grant = (id) => q(`insert into public.account_entitlements(account_id,entitlement_type,status,granted_at) values ('${id}','third_character_slot','active',now()) on conflict do nothing; update public.account_entitlements set status='active' where account_id='${id}' and entitlement_type='third_character_slot'`);
const revoke = (id) => q(`update public.account_entitlements set status='refunded' where account_id='${id}' and entitlement_type='third_character_slot'`);
const deny = async (p) => { try { await p; return null; } catch (e) { return /forbidden|403/.test(e.err || e.message) ? 'forbidden' : (e.err || e.message).split('\n')[0]; } };
const setChar = (id, g, pa, tier, lv = 50) => q(`update public.characters set character_class=(($cd$${charData(g, pa, tier, lv)}$cd$)::jsonb->>'cls'), level=${lv}, character_data=$cd$${charData(g, pa, tier, lv)}$cd$ where character_id='${id}'`);
const prof = (inst, ch) => q(`select profile::text from rwi.members where instance_id=${inst} and player='${ch}'`);
// Gruppe mit zwei Fremdkonten in der Bereitschaftsphase (Platz 3 des Testkontos tritt per Client-Wrapper bei)
const mk = async (tag) => { const b = await E.account(tag + 'b'), c = await E.account(tag + 'c'); const g = await E.group([b.chars[0], c.chars[0]], 2); return { ...g, b, c }; };
try {
  console.log('PostgreSQL', await q('show server_version'));
  const A = await E.account('F9a', 3); const c3 = A.chars[2], c1 = A.chars[0];   // Platz 3 berechtigt (Berechtigung wird in prod-env vergeben)
  const asA = rpcAs('authenticated', A.id);

  // ---- 1. Entzug VOR Ready ----
  const G1 = await mk('g1');
  const j = await asA('group_join', { p_instance: G1.instance, p_character: c3 });
  ok(j.status === 'joined', 'Platz 3 (berechtigt) tritt bei', j.status);
  ok((await prof(G1.instance, c3)).includes('"grundklasse"') , 'Profil wurde beim Eintritt für die Instanz gespeichert', await prof(G1.instance, c3));
  await revoke(A.id);
  ok(await deny(asA('group_ready', { p_instance: G1.instance, p_character: c3 })) === 'forbidden', 'Entzug VOR Ready: Ready wird abgelehnt (Berechtigung wird beim noch nicht abgegebenen Ready geprüft)');
  ok((await q(`select ready::text from rwi.members where instance_id=${G1.instance} and player='${c3}'`)) === 'false', 'Mitglied bleibt unbereit');
  ok((await asA('group_heartbeat', { p_instance: G1.instance, p_character: c3 })).status !== undefined, 'Eigentum genügt für Herzschlag/Ansicht (kein Hinauswurf durch den Entzug)');
  ok((await asA('group_leave', { p_instance: G1.instance, p_character: c3 })).status === 'left', 'der Spieler kann freiwillig austreten');
  // ---- 4. Neue Instanz nach Entzug ----
  const G2 = await mk('g2');
  ok(await deny(asA('group_join', { p_instance: G2.instance, p_character: c3 })) === 'forbidden', 'NEUE Instanz nach Entzug: Eintritt abgelehnt (aktuelle Berechtigung wird wieder geprüft)');
  ok((await q(`select count(*) from rwi.members where instance_id=${G2.instance} and player='${c3}'`)) === '0', 'kein Mitglied angelegt');
  // ---- 5. Erneute Freischaltung ----
  await grant(A.id);
  const j2 = await asA('group_join', { p_instance: G2.instance, p_character: c3 });
  ok(j2.status === 'joined', 'erneute Freischaltung: Eintritt in eine neue Instanz wieder möglich', j2.status);
  ok((await asA('group_ready', { p_instance: G2.instance, p_character: c3 })).status === 'ok', 'Ready mit aktiver Berechtigung');
  const p2 = await prof(G2.instance, c3);

  // ---- 2. Entzug NACH Ready ----
  await revoke(A.id);
  const rd = await asA('group_ready', { p_instance: G2.instance, p_character: c3 });
  ok(rd.status === 'ok', 'Entzug NACH Ready: erneutes Ready (idempotent) bleibt möglich, Teilnahme besteht fort', rd.status);
  ok(!(await deny(asA('group_heartbeat', { p_instance: G2.instance }))) && !(await deny(asA('group_view', { p_instance: G2.instance }))), 'Ansicht und Herzschlag ohne Zeichenangabe funktionieren weiter (Zuordnung über die Mitgliedschaft)');
  ok((await q(`select mstate || ':' || ready from rwi.members where instance_id=${G2.instance} and player='${c3}'`)) === 'active:true', 'Mitglied bleibt aktiv und bereit');
  // Profil/Ausrüstung/Kampfwerte: Live-Daten ändern sich nach dem Ready, die Instanz sieht davon nichts
  await setChar(c3, 'magier', 'frost', 2, 40);                       // Charakter wird nach dem Ready umgebaut (Klasse, Pfad, Stufe, Level)
  await q(`update public.characters set character_data = '{"equipment":"geaendert"}' where character_id = '${c3}'`);
  ok((await prof(G2.instance, c3)) === p2, 'gespeichertes Instanzprofil nach Änderung von Profil und Ausrüstung unverändert');
  for (const m of [G2.b, G2.c]) await q(`select rwi.set_ready(${G2.instance}, '${m.chars[0]}')`);
  const roster = J(await q(`select rwi.roster(${G2.instance})`)); const mine = roster.find((x) => x.name === c3);
  const before = J(p2);
  ok(mine && mine.grundklasse === before.grundklasse && mine.pfad === before.pfad && mine.tier === before.tier, 'Aufstellung (roster) liefert das gespeicherte Profil, nicht den Live-Stand', JSON.stringify(mine));
  const S = engine.newFight(roster, { bossHp: 4000, bossAtk: 8 });
  ok(J(await q(`select rwi.start_fight(${G2.instance}, $j$${JSON.stringify(S)}$j$::jsonb)`)).status === 'ok', 'Kampf startet trotz Entzug');
  const fid = +(await q(`select max(id) from rwi.fights where instance_id=${G2.instance}`));

  // ---- 3. Entzug WÄHREND des Kampfes ----
  const ac = await asA('group_action', { p_fight: fid, p_round: 1, p_action: { ability: 'standard', target: 'boss' } });
  ok(ac.status === 'ok', 'Entzug WÄHREND des Kampfes: Aktion wird weiter angenommen', JSON.stringify(ac));
  ok((await q(`select (actions ? '${c3}')::text from rwi.fights where id=${fid}`)) === 'true', 'Aktion des Mitglieds ist im Kampf gespeichert');
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id=${fid}`);
  const cl = await db.claim(fid, 1); const k = await db.commit(fid, 1, cl.token, cl.round_version, cl.input_hash, engine.ENGINE_VERSION, engine.resolveClaim(cl.input));
  ok(k.status === 'committed', 'Runde wird mit dem gespeicherten Profil aufgelöst', k.status);
  const st = J(await q(`select state from rwi.fights where id=${fid}`)); const me = st.members.find((x) => x.id === c3);
  ok(me && me.grundklasse === before.grundklasse && (me.pfad || null) === (before.pfad || null) && (me.tier || 0) === before.tier && st.members.length === 3, 'Kampfwerte im Kampfzustand entsprechen dem gespeicherten Profil (nicht dem geänderten Live-Profil)', JSON.stringify({ g: me?.grundklasse, p: me?.pfad }));
  ok((await q(`select mstate from rwi.members where instance_id=${G2.instance} and player='${c3}'`)) === 'active', 'Instanzteilnahme nach Rundenauflösung weiter aktiv');
  ok(await deny(asA('group_join', { p_instance: (await mk('g3')).instance, p_character: c3 })) === 'forbidden', 'gleichzeitig: Eintritt in eine weitere neue Instanz bleibt gesperrt');

  // ---- 6. Eigentum bleibt immer Pflicht ----
  const Bx = await E.account('F9x', 1); const asX = rpcAs('authenticated', Bx.id);
  ok(await deny(asX('group_heartbeat', { p_instance: G2.instance, p_character: c3 })) === 'forbidden', 'fremdes Konto: auch ohne Berechtigungsprüfung weiterhin forbidden (Eigentum)');
  ok(await deny(asX('group_ready', { p_instance: G2.instance, p_character: c3 })) === 'forbidden', 'fremdes Konto: group_ready forbidden');

  // ---- 7. Katalog: nur diese Funktionen lesen public.characters ----
  const rd2 = (await q(`select string_agg(proname, ',' order by proname) from pg_proc where pronamespace='rwi'::regnamespace and prosrc ~* 'public\\.(characters|account_entitlements)'`));
  ok(rd2 === 'account_of,derive_profile,on_profile_deleting,own_character,profile_of', 'im Schema rwi lesen nur own_character, account_of, die Profilableitung und on_profile_deleting (Charakter-IDs des gelöschten Kontos für die Beratungssperren, B-2) aus public.characters/account_entitlements', rd2);
  // ---- 8. Profil wird nicht still verändert: nur beim Ready aktualisiert ----
  const G4 = await mk('g4'); await asA('group_join', { p_instance: G4.instance, p_character: c1 }).catch(() => null);
  await setChar(c1, 'bogenschuetze', 'jaeger', 1, 20); const pj = await prof(G4.instance, c1);
  await asA('group_ready', { p_instance: G4.instance, p_character: c1 }); const pr = await prof(G4.instance, c1);
  await setChar(c1, 'bogenschuetze', 'jaeger', 2, 35);
  ok(J(pj).tier === 3 && J(pr).tier === 1 && (await prof(G4.instance, c1)) === pr, 'vor Ready: Aktualisierung bis zum Ready; ab Ready eingefroren (spätere Änderung wirkt nicht)', `${pj} -> ${pr}`);
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
finally { E.stop(); }
process.exit(done());
