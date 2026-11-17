// Kombinierte Installation unter Dev-ähnlichen Bedingungen: node server/instance/tests/dev-umgebung.mjs
// Nachbau (lokal, NICHT das echte Supabase): pgcrypto liegt im Schema "extensions" (wie auf Dev), die Rollen anon/authenticated/service_role haben
// KEINEN search_path-Eintrag (Dev: nur statement_timeout), postgres hat "$user", public, extensions; Default-ACLs in public wie auf Dev.
// Prüft die Installationsreihenfolge schema.sql -> 01..05 und den Weg claim_resolution/commit_round unter diesen Bedingungen.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
import { newFight, resolveClaim, ENGINE_VERSION } from '../engine/v1.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
const STUB = readFileSync(join(here, '../../../supabase/tests/00_stub.sql'), 'utf8');
const SCHEMA = readFileSync(join(here, '../../../supabase/schema.sql'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
const J = (s) => JSON.parse(s);
const UID = { A: 'aaaaaaaa-0000-4000-8000-000000000001', B: 'bbbbbbbb-0000-4000-8000-000000000002' };
const CH = { A1: 'a1a1a1a1-0000-4000-8000-000000000001', B1: 'b1b1b1b1-0000-4000-8000-000000000002' };

const cl = await startCluster(54410);
const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 200)); return r.out; };
const as = (role, sql) => cl.psql(`set role ${role}; set search_path = "$user", public; ${sql}`);   // Dev: anon/authenticated/service_role ohne eigenen search_path
try {
  const ver = await q('show server_version'); console.log('PostgreSQL', ver);
  // --- Dev-Nachbau ---
  await q('\\set legacy 1\n' + STUB);                                                        // Rollen, auth-Attrappe, Default-ACLs in public
  await q(`create schema extensions; create extension pgcrypto schema extensions;
           alter role postgres set search_path = "$user", public, extensions;`);          // wie auf Dev; anon/authenticated/service_role bleiben ohne Eintrag
  ok((await q(`select count(*) from pg_proc where proname = 'digest' and pronamespace = 'public'::regnamespace`)) === '0', 'Nachbau: digest() liegt NICHT in public (wie auf Dev)');
  // Neue Verbindung als postgres, damit der rollenbezogene search_path greift
  await q(SCHEMA);
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));
  ok(true, 'Installation schema.sql + 01..05 in dieser Reihenfolge ohne Fehler');
  ok((await q(`select count(*) from pg_extension where extname = 'pgcrypto' and extnamespace = 'extensions'::regnamespace`)) === '1', 'pgcrypto bleibt im Schema extensions (01_proto legt keine zweite Kopie an)');

  for (const [k, id] of Object.entries(UID)) await q(`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${k.toLowerCase()}@test.de','{"username":"Spieler_${k}"}')`);
  for (const [c, uid, nm] of [['A1', UID.A, 'A1'], ['B1', UID.B, 'B1']]) await q(`insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values ('${CH[c]}','${uid}',1,'${nm}','{}')`);
  await q(`insert into rwi.players values ('${CH.A1}', 10, 'krieger', 'ritter', 3), ('${CH.B1}', 10, 'heiler', 'priester', 3)`);

  // --- Weg der Rundenauflösung als service_role (Edge Function ruft ohne eigenen search_path auf) ---
  const svc = async (sql) => { const r = await as('service_role', sql); if (r.code) throw new Error(r.err); return r.out; };
  const g = J(await svc(`select rwi.create_group('dungeon', array['${CH.A1}','${CH.B1}']::text[], 2)`));
  ok(g.status === 'ok', 'service_role: create_group (Instanzanlage mit seed-Standardwert)', g.status);
  const I = g.instance;
  for (const c of [CH.A1, CH.B1]) await q(`select rwi.set_ready(${I}, '${c}')`);                 // Eigentümerrolle (Testfunktion), wie im Prototyp
  const S = newFight(J(await svc(`select rwi.roster(${I})`)), { bossHp: 150, bossAtk: 8 });
  ok(J(await svc(`select rwi.start_fight(${I}, $j$${JSON.stringify(S)}$j$::jsonb)`)).status === 'ok', 'service_role: start_fight');
  const fid = +(await q(`select max(id) from rwi.fights where instance_id = ${I}`));
  await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id = ${fid} and phase = 'planning'`);
  const sp = (await as('service_role', 'show search_path')).out;
  console.log('   search_path service_role:', sp);
  const rn = +(await q(`select round_no from rwi.fights where id = ${fid}`));
  const c = await as('service_role', `select rwi.claim_resolution(${fid}, ${rn})`);
  ok(c.code === 0, 'service_role: claim_resolution (benötigt SHA-256 ohne extensions im search_path)', c.err.split('\n')[0]);
  if (c.code === 0) {
    const cl1 = J(c.out); const res = resolveClaim(cl1.input);
    const cm = await as('service_role', `select rwi.commit_round(${fid}, ${cl1.input.round_no}, '${cl1.token}', ${cl1.round_version}, '${cl1.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`);
    ok(cm.code === 0 && ['committed', 'event_ended'].includes(J(cm.out).status), 'service_role: commit_round', cm.err.split('\n')[0] || J(cm.out).status);
  }
  // Gleicher Weg mit ausdrücklich minimalem search_path (öffentlicher Standard ohne extensions)
  const c2 = await as('service_role', `set search_path = public, pg_temp; select rwi.claim_resolution(${fid}, ${rn})`);
  ok(c2.code === 0, 'claim_resolution auch mit search_path = public, pg_temp (kein stilles Verlassen auf extensions)', c2.err.split('\n')[0]);
} catch (e) { ok(false, 'Lauf ohne Ausnahme', String(e.message).split('\n')[0]); }
finally { cl.stop(); }
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
