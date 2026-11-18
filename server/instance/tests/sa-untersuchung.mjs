// Untersuchung (KEINE Implementierung): Verhalten der vorgeschlagenen Lösung S-A für handle_new_user. node server/instance/tests/sa-untersuchung.mjs
// Läuft in einer eigenen Wegwerf-Datenbank. supabase/schema.sql wird NICHT verändert; die Variante wird nur hier, testweise, über die Funktion gelegt.
// NICHT ECHT: auth.users ist die Attrappe (um raw_app_meta_data ergänzt). Ob GoTrue app_metadata beim INSERT oder erst in einem späteren UPDATE schreibt, ist damit NICHT belegt (siehe docs/SUPABASE_S-A_UNTERSUCHUNG.md).
import { startCluster } from './pg.mjs';
import { STUB, SCHEMA, counter } from './prod-env.mjs';
const { ok, done } = counter();
const cl = await startCluster(54500);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err); return r.out; };
const ins = (id, name, um, am) => cl.psql(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at) values ('${id}','${name}@t.invalid','${um}'::jsonb,'${am}'::jsonb, now())`);
const U = (n) => `eeee${String(n).padStart(4, "0")}-0000-4000-8000-000000000000`;
try {
  await q('\\set legacy 1\n' + STUB); await q('alter table auth.users add column raw_app_meta_data jsonb not null default \'{"provider":"email","providers":["email"]}\''); await q(SCHEMA);
  // Bestand vor der Variante: ein normaler Benutzer
  ok((await ins(U(1), 'alt', '{"username":"Altspieler"}', '{"provider":"email","providers":["email"]}')).code === 0, 'Bestand: normale Registrierung funktioniert (heutiges Verhalten)');
  // Variante S-A (nur testweise): Marker nur in raw_app_meta_data, genau der Wert JSON-true; Profil mit generiertem Namen
  await q(`create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
    declare u text := new.raw_user_meta_data ->> 'username';
    begin
      if (new.raw_app_meta_data -> 'rw_staff') = 'true'::jsonb then u := 'staff_' || substr(replace(new.id::text, '-', ''), 1, 8);
      elsif u is null or u !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'invalid_username' using errcode = '22023'; end if;
      insert into public.profiles(account_id, username) values (new.id, u); return new; end $$;`);
  ok((await q(`select count(*) from public.profiles`)) === '1', 'Variante ändert bestehende Benutzer nicht (Trigger feuert nur bei INSERT; keine Rückwirkung)');
  const r1 = await ins(U(2), 'norm', '{"username":"Neuer_Spieler"}', '{"provider":"email","providers":["email"]}');
  ok(r1.code === 0 && (await q(`select username from public.profiles where account_id='${U(2)}'`)) === 'Neuer_Spieler', 'normale Registrierung unverändert: Name aus user_metadata, Format/Eindeutigkeit wie bisher');
  ok((await ins(U(3), 'oname', '{}', '{"provider":"email","providers":["email"]}')).err.includes('invalid_username'), 'Spieler ohne Namen: weiterhin invalid_username (Regel „kein Konto ohne Namen“ bleibt)');
  // Manipulation: Spieler setzt den Marker in seinen eigenen (veränderbaren) user_metadata
  ok((await ins(U(4), 'spoof', '{"rw_staff":true}', '{"provider":"email","providers":["email"]}')).err.includes('invalid_username'), 'Marker in raw_user_meta_data (vom Nutzer setzbar) wird IGNORIERT -> Konto wird abgelehnt');
  ok((await ins(U(5), 'spoof2', '{"app_metadata":{"rw_staff":true},"username":"Spoof_Zwei"}', '{"provider":"email","providers":["email"]}')).code === 0 && (await q(`select username from public.profiles where account_id='${U(5)}'`)) === 'Spoof_Zwei', 'ein verschachteltes „app_metadata“ in user_metadata macht niemanden zum Staff-Konto');
  // Typvarianten des Markers
  for (const [n, v, staff] of [[6, 'true', true], [7, '"true"', false], [8, '1', false], [9, 'false', false], [10, 'null', false]]) {
    const r = await ins(U(n), 'm' + n, '{}', `{"rw_staff":${v}}`);
    ok((r.code === 0) === staff, `Marker rw_staff=${v}: ${staff ? 'wird als Staff-Konto akzeptiert' : 'wird NICHT akzeptiert (nur der JSON-Wert true zählt)'}`, r.err.split('\n')[0]);
  }
  ok((await q(`select username from public.profiles where account_id='${U(6)}'`)).startsWith('staff_'), 'Staff-Konto erhält ein Profil mit generiertem Namen staff_<8 hex> (kollisionsarm; Eindeutigkeit bleibt über die bestehende Regel geschützt)');
  // Staff-Name kann nicht von Spielern belegt werden? (Format passt zu ^[A-Za-z0-9_]{3,20}$ -> ein Spieler könnte „staff_xxxx“ wählen)
  ok((await ins(U(11), 'brand', '{"username":"staff_abc12345"}', '{"provider":"email","providers":["email"]}')).code === 0, 'FESTSTELLUNG: ein Spieler kann sich selbst „staff_…“ nennen (nur Name, kein Recht); falls unerwünscht: Präfix im Format reservieren (Entscheidung offen)');
  // Race-Szenario (Hinweis aus der Praxis): app_metadata wird erst NACH dem INSERT gesetzt
  const r12 = await ins(U(12), 'late', '{}', '{"provider":"email","providers":["email"]}');
  ok(r12.err.includes('invalid_username') && (await q(`select count(*) from auth.users where id='${U(12)}'`)) === '0', 'WENN GoTrue den Marker erst nach dem INSERT per UPDATE setzt, scheitert die Anlage des Staff-Kontos (ein AFTER-INSERT-Trigger sieht ihn nicht): muss gegen echtes GoTrue geprüft werden (OFFEN)');
  // Löschen
  ok((await q(`select count(*) from public.profiles`)) === '5', 'Profilbestand wie erwartet (Alt, Neuer, Spoof_Zwei, staff via true, brand)', await q('select string_agg(username, \',\') from public.profiles'));
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n')[0]); }
finally { cl.stop(); }
process.exit(done());
