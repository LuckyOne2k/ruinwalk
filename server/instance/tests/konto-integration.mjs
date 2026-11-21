// Kombinierte Installation: Konto -> Charakter -> Instanz. node server/instance/tests/konto-integration.mjs
// Läuft auf einer lokalen PostgreSQL-Instanz (echte Rollen, echte Trigger, RLS) mit schema.sql und 01–05 in der Dev-Reihenfolge.
// NICHT ECHT: auth.users/auth.sessions/auth.mfa_amr_claims/auth.uid()/auth.jwt() sind die Attrappe aus supabase/tests/00_stub.sql.
// Dieser Test sagt deshalb nichts über das Verhalten von GoTrue, PostgREST oder echten JWTs aus (siehe docs/SUPABASE_INTEGRATION_NACHTBERICHT.md).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { charData } from './prod-env.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
const STUB = readFileSync(join(here, '../../../supabase/tests/00_stub.sql'), 'utf8');
const SCHEMA = readFileSync(join(here, '../../../supabase/schema.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const J = (s) => JSON.parse(s);
const U = { A: 'aaaaaaaa-0000-4000-8000-000000000001', B: 'bbbbbbbb-0000-4000-8000-000000000002', C: 'cccccccc-0000-4000-8000-000000000003' };
const C = { A1: 'a1a1a1a1-0000-4000-8000-000000000001', A2: 'a2a2a2a2-0000-4000-8000-000000000002', A3: 'a3a3a3a3-0000-4000-8000-000000000003', B1: 'b1b1b1b1-0000-4000-8000-000000000001', C1: 'c1c1c1c1-0000-4000-8000-000000000001' };

const cl = await startCluster(54420);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 200)); return r.out; };
const as = (role, claims, sql) => cl.psql(`set role ${role}; set search_path = "$user", public; ${claims ? `set request.jwt.claims = '${JSON.stringify(claims)}';` : ''} ${sql}`);
const jwt = (uid, extra = {}) => ({ sub: uid, role: 'authenticated', ...extra });
const err = (r) => (r.err || '').split('\n')[0];
const fails = (r, re) => r.code !== 0 && re.test(r.err);
const session = async (uid, sid, { method = 'password', ageMin = 0 } = {}) => q(`insert into auth.sessions(id,user_id,created_at) values ('${sid}','${uid}', now() - interval '${ageMin} minutes'); ${method ? `insert into auth.mfa_amr_claims(session_id,authentication_method,created_at) values ('${sid}','${method}', now() - interval '${ageMin} minutes');` : ''}`);
try {
  console.log('PostgreSQL', await q('show server_version'));
  await q('\\set legacy 1\n' + STUB); await q(SCHEMA);
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));

  // ---------- 1. Registrierung und Profil (Trigger on_auth_user_created auf auth.users) ----------
  const reg = (id, name, meta) => cl.psql(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('${id}','${name}@t.de','${meta.replace(/'/g, "''")}', now())`);
  ok((await reg(U.A, 'a', '{"username":"Spieler_A"}')).code === 0, 'Registrierung mit gültigem Username legt Profil an');
  ok((await q(`select username from public.profiles where account_id='${U.A}'`)) === 'Spieler_A', 'Profil hat den Benutzernamen aus den Registrierungsdaten');
  for (const [n, meta, re] of [['ohne Username', '{}', /invalid_username/], ['Username nur Leerzeichen/Sonderzeichen', '{"username":"a b"}', /invalid_username/], ['zu kurz', '{"username":"ab"}', /invalid_username/], ['zu lang', `{"username":"${'x'.repeat(21)}"}`, /invalid_username/],
    ['Injektionsversuch', `{"username":"x'; drop table public.profiles; --"}`, /invalid_username/], ['doppelt, Groß/Klein egal', '{"username":"spieler_a"}', /23505|unique|duplicate/]]) {
    const before = await q('select count(*) from auth.users'); const r = await reg(crypto.randomUUID(), 'x' + Math.random().toString(36).slice(2, 8), meta);
    ok(fails(r, re) && (await q('select count(*) from auth.users')) === before, `Registrierung abgelehnt (${n}); kein Konto ohne Profil bleibt zurück`, err(r));
  }
  // Admin-/Dashboard-Anlage ohne Username: der Trigger unterscheidet nicht nach Quelle -> scheitert ebenso (dokumentiertes Verhalten, siehe Bericht)
  ok(fails(await cl.psql(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values (gen_random_uuid(),'support@t.de','{}', now())`), /invalid_username/), 'Admin-/Dashboard-Anlage ohne user_metadata.username scheitert (bekannte Einschränkung für Support-Konten)');
  ok((await q(`select count(*) from public.profiles`)) === '1', 'nach allen Fehlversuchen existiert genau ein Profil');

  // ---------- 2. Testdaten: Charaktere und Berechtigung ----------
  await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('${U.B}','b@t.de','{"username":"Spieler_B"}', now()), ('${U.C}','c@t.de','{"username":"Spieler_C"}', now())`);
  await q(`insert into public.account_entitlements(account_id,entitlement_type,status,granted_at) values ('${U.A}','third_character_slot','active',now())`);
  const mk = (id, uid, slot, nm) => `insert into public.characters(character_id,account_id,slot_number,character_name,character_class,level,character_data) values ('${id}','${uid}',${slot},'${nm}','krieger',50,$cd$${charData('krieger', 'ritter')}$cd$)`;
  await q([mk(C.A1, U.A, 1, 'A1'), mk(C.A2, U.A, 2, 'A2'), mk(C.A3, U.A, 3, 'A3'), mk(C.B1, U.B, 1, 'B1'), mk(C.C1, U.C, 1, 'C1')].join(';'));
  ok((await q(`select count(*) from public.characters where account_id='${U.A}'`)) === '3', 'mehrere Charaktere eines Accounts (3 Plätze mit Berechtigung)');
  ok(fails(await cl.psql(mk(C.A3.replace('a3', 'f3'), U.B, 3, 'B3')), /slot_locked/), 'Platz 3 ohne Berechtigung wird abgelehnt (Trigger, jeder Schreibweg)');

  // ---------- 3. Manipulierte Client-Daten, Speichern, Sicherungen ----------
  const sv = (cid, ver, data) => as('authenticated', jwt(U.A), `select public.save_character('${cid}', ${ver}, '${data}'::jsonb)`);
  let r = await sv(C.A1, 1, '{"cls":"<script>","lv":99999,"x":1}');
  ok(r.code === 0 && (await q(`select character_class||'/'||level from public.characters where character_id='${C.A1}'`)) === 'wanderer/50', 'manipulierte Klasse und Stufe werden serverseitig begrenzt (wanderer, Level 50)');
  ok(fails(await sv(C.A1, 1, '{"x":2}'), /version_conflict/), 'veraltete Version wird abgewiesen');
  ok(fails(await as('authenticated', jwt(U.B), `select public.save_character('${C.A1}', 2, '{"x":3}'::jsonb)`), /version_conflict/), 'fremder Charakter: gleiche Antwort wie falsche Version');
  ok((await q(`select count(*) from public.character_backups where character_id='${C.A1}'`)) === '1', 'Sicherung beim ersten Speichern');
  ok(fails(await as('authenticated', jwt(U.A), `update public.characters set level=50 where character_id='${C.A1}'`), /permission denied/), 'direktes UPDATE auf characters ist nicht erlaubt');
  ok(fails(await as('anon', null, `select count(*) from public.characters`), /permission denied/), 'anon kann characters nicht lesen');
  ok((await q(`select count(*) from public.character_backups where reason='update'`)) !== '0', 'Wiederherstellungsdaten liegen serverseitig vor (kein Client-Zugriff: Tabelle ohne Rechte)');
  ok(fails(await as('authenticated', jwt(U.A), `select count(*) from public.character_backups`), /permission denied/), 'authenticated hat keinen Zugriff auf character_backups');

  // ---------- 4. Account -> Charakter -> Instanz ----------
  // die Speichertests oben haben die Spielstanddaten absichtlich überschrieben (Client schreibt beliebiges JSON); für den Instanzteil gültige Daten wiederherstellen
  await q(`update public.characters set character_class='krieger', level=50, character_data=$cd$${charData('krieger', 'ritter')}$cd$`);
  for (const c of [C.A1, C.A3, C.B1, C.C1]) await q(`insert into rwi.players values ('${c}', 10, 'krieger', 'ritter', 3)`);
  const g = J(await q(`select rwi.create_group('dungeon', array['${C.A1}','${C.B1}']::text[], 2)`)); const I = g.instance;
  const wr = (uid, sql) => as('authenticated', jwt(uid), sql);
  r = await wr(U.B, `select public.group_ready(${I}, '${C.A1}')`);
  ok(fails(r, /forbidden/), 'fremder Charakter als Parameter: forbidden', err(r));
  r = await wr(U.C, `select public.group_ready(${I})`);
  ok(fails(r, /forbidden/), 'Konto ohne Teilnahme kann Instanz weder bereit melden noch von „unbekannt“ unterscheiden', err(r));
  r = await wr(U.B, `select public.group_ready(${I})`);
  ok(r.code === 0 && J(r.out).status === 'ok', 'eigener Charakter wird aus der Mitgliedschaft abgeleitet (auth.uid -> Account -> Charakter -> Instanz)');
  ok((await q(`select ready from rwi.members where instance_id=${I} and player='${C.B1}'`)) === 't' && (await q(`select ready from rwi.members where instance_id=${I} and player='${C.A1}'`)) === 'f', 'nur der eigene Charakter wurde bereit gemeldet');
  for (const t of ['rwi.members', 'rwi.players', 'rwi.instances', 'rwi.fights', 'rwi.rewards']) {
    r = await wr(U.A, `select count(*) from ${t}`); ok(fails(r, /permission denied/), `authenticated hat keinen direkten Zugriff auf ${t}`);
  }
  // Platz-3-Charakter desselben Kontos in einer ANDEREN Instanz (dieselbe Instanz ist nach der Account-Regel verboten): Berechtigung wird später entzogen (Rückerstattung) -> gesperrtes Profil in laufender Instanz
  ok(J(await q(`select rwi.join(${I}, '${C.A3}')`)).status === 'account_in_instance', 'derselbe Account kann mit einem zweiten Charakter nicht in dieselbe Instanz (Account-Regel)');
  const I2 = J(await q(`select rwi.create_group('dungeon', array['${C.A3}','${C.C1}']::text[], 2)`)).instance;
  await q(`update public.account_entitlements set status='refunded' where account_id='${U.A}'`);
  r = await wr(U.A, `select public.group_ready(${I2}, '${C.A3}')`);
  ok(fails(r, /forbidden/), 'gesperrter Platz-3-Charakter kann in der laufenden Instanz nicht handeln (forbidden)', err(r));
  r = await wr(U.A, `select public.group_ready(${I2})`);
  ok(fails(r, /forbidden/), 'ohne Charakterangabe: der gesperrte Charakter wird nicht abgeleitet (forbidden, nicht ambiguous)', err(r) || r.out);
  r = await wr(U.A, `select public.group_ready(${I})`);
  ok(r.code === 0, 'in der eigenen Instanz mit dem freigeschalteten Charakter wird dieser ohne Angabe abgeleitet', err(r) || r.out);
  ok((await q(`select mstate from rwi.members where instance_id=${I2} and player='${C.A3}'`)) === 'active', 'OFFEN (dokumentiert): der gesperrte Charakter bleibt aktives Mitglied, bis ihn der Server per Verbindungsabbruch entfernt');

  // ---------- 5. Löschen eines Charakters / Kontos während einer laufenden Instanz ----------
  r = await wr(U.B, `select public.delete_character('${C.B1}')`);
  ok(r.code === 0, 'delete_character während aktiver Instanz gelingt (Löschen wird nie vom Spielstand blockiert)', err(r));
  ok((await q(`select mstate||'/'||coalesce(leave_reason,'') from rwi.members where instance_id=${I} and player='${C.B1}'`)).startsWith('left'), 'gelöschter Charakter ist per rwi.leave aus der Instanz ausgetreten (kein aktives Geistermitglied)');
  ok((await q(`select count(*) from rwi.players where player='${C.B1}'`)) === '0', 'Spielerprofil in rwi.players wurde mit dem Charakter entfernt');
  ok((await q(`select count(*) from public.character_backups where character_id='${C.B1}' and reason='delete'`)) === '1', 'Löschsicherung (30 Tage) bleibt bestehen');

  // delete_account
  const S = { ok: '10000000-0000-4000-8000-000000000001', old: '10000000-0000-4000-8000-000000000002', nopw: '10000000-0000-4000-8000-000000000003', noamr: '10000000-0000-4000-8000-000000000004', other: '10000000-0000-4000-8000-000000000005' };
  await session(U.A, S.ok); await session(U.A, S.old, { ageMin: 10 }); await session(U.A, S.nopw, { method: 'otp' }); await session(U.A, S.noamr, { method: null }); await session(U.C, S.other);
  const del = (uid, sid, name, role = 'authenticated') => as(role, jwt(uid, { role, session_id: sid }), `select public.delete_account('${name}')`);
  ok(fails(await as('anon', null, `select public.delete_account('Spieler_A')`), /permission denied/), 'delete_account: anon darf die Funktion nicht aufrufen');
  ok(fails(await del(U.A, S.ok, 'Spieler_A', 'service_role'), /not_authenticated/), 'delete_account: service_role (Rolle im Token) wird abgewiesen');
  ok(fails(await del(U.A, S.old, 'Spieler_A'), /reauth_required/), 'delete_account: zu alte Passwortsitzung (10 Min.) -> reauth_required');
  ok(fails(await del(U.A, S.nopw, 'Spieler_A'), /reauth_required/), 'delete_account: Sitzung ohne Passwort-Anmeldung (OTP) -> reauth_required');
  ok(fails(await del(U.A, S.noamr, 'Spieler_A'), /reauth_required/), 'delete_account: Sitzung ohne Anmeldemethode -> reauth_required');
  ok(fails(await del(U.A, S.other, 'Spieler_A'), /reauth_required/), 'delete_account: Sitzung eines fremden Kontos -> reauth_required');
  ok(fails(await del(U.A, S.ok, 'falsch'), /confirm_mismatch/), 'delete_account: falscher Username -> confirm_mismatch');
  ok(fails(await del(U.A, S.ok, 'Spieler_C'), /confirm_mismatch/), 'delete_account: Username eines anderen Kontos -> confirm_mismatch');
  ok((await q(`select count(*) from public.profiles where account_id='${U.A}'`)) === '1', 'nach allen Fehlversuchen ist das Konto unverändert vorhanden');
  await q(`insert into public.audit_log(account_id, character_id, action) values ('${U.A}','${C.A2}','test')`);
  await q(`insert into public.payment_events(provider_event_id, account_id, kind, payload) values ('evt_1','${U.A}','paid','{"amount":5,"currency":"EUR","email":"geheim@t.de"}')`);
  r = await del(U.A, S.ok, 'spieler_a');
  ok(r.code === 0, 'delete_account: gültige Passwortsitzung, Username ohne Beachtung der Schreibweise', err(r));
  for (const [t, w] of [['auth.users', `id='${U.A}'`], ['public.profiles', `account_id='${U.A}'`], ['public.characters', `account_id='${U.A}'`], ['public.character_backups', `account_id='${U.A}'`], ['public.audit_log', `account_id='${U.A}'`], ['public.account_entitlements', `account_id='${U.A}'`], ['auth.sessions', `user_id='${U.A}'`]])
    ok((await q(`select count(*) from ${t} where ${w}`)) === '0', `Kontolöschung entfernt ${t}`);
  ok((await q(`select payload::text from public.payment_events where provider_event_id='evt_1'`)).includes('redacted') && !(await q(`select payload::text from public.payment_events where provider_event_id='evt_1'`)).includes('geheim'), 'Zahlungsereignis bleibt ohne Personenbezug erhalten');
  ok((await q(`select count(*) from rwi.players where player in ('${C.A1}','${C.A3}')`)) === '0', 'Kontolöschung entfernt die Spielerprofile aus rwi.players (Kaskade -> Trigger)');
  ok((await q(`select count(*) from rwi.members where player in ('${C.A1}','${C.A3}') and mstate='active'`)) === '0', 'Kontolöschung hinterlässt kein aktives Mitglied in einer Instanz');
  ok((await q(`select status from rwi.instances where id=${I}`)) !== 'active', 'wenn alle Mitglieder ausgetreten sind, wird die Instanz regulär abgebrochen (bestehende Austrittsregel)');
  ok((await q(`select status from rwi.instances where id=${I2}`)) === 'active' && (await q(`select count(*) from rwi.members where instance_id=${I2} and mstate='active'`)) === '1', 'Instanz mit weiterem Mitglied bleibt aktiv, nur das gelöschte Konto ist ausgetreten');
  ok((await q(`select count(*) from rwi.members where account is not null and account='${U.A}'`)) === '0', 'Kontolöschung entfernt die Kontokennung aus Mitglieds-/Wartelistenzeilen');
  ok((await q(`select count(*) from rwi.ops_alerts where what='char_cleanup_failed'`)) === '0', 'keine Fehlermeldung in rwi.ops_alerts durch die Bereinigung');
  ok(fails(await del(U.A, S.ok, 'Spieler_A'), /not_authenticated|not_found|reauth_required/), 'zweiter Aufruf nach der Löschung ist kein Fehlzustand (Konto existiert nicht mehr)');
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n').slice(0, 2).join(' | ')); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
