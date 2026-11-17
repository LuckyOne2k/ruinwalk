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

async function suite(label, port, devLike) {
  const cl = await startCluster(port);
  const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 200)); return r.out; };
  // SET ROLE übernimmt keine Rollen-Einstellungen: der Dev-Standard "$user", public (ohne extensions) wird ausdrücklich gesetzt
  const as = (role, sql) => cl.psql(`set role ${role}; set search_path = "$user", public; ${sql}`);
  const t = `[${label}]`;
  try {
    console.log(t, 'PostgreSQL', await q('show server_version'));
    await q('\\set legacy 1\n' + STUB);                                                      // Rollen, auth-Attrappe, Default-ACLs in public
    if (devLike) {
      await q(`create schema extensions; create extension pgcrypto schema extensions; alter role postgres set search_path = "$user", public, extensions;`);
      ok((await q(`select count(*) from pg_proc where proname = 'digest' and pronamespace = 'public'::regnamespace`)) === '0', `${t} digest() liegt NICHT in public (wie auf Dev)`);
    } else {
      ok((await q(`select count(*) from pg_extension where extname = 'pgcrypto'`)) === '0', `${t} pgcrypto ist gar nicht installiert`);
    }
    await q(SCHEMA);
    for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));
    ok(true, `${t} Installation schema.sql + 01..05 in dieser Reihenfolge ohne Fehler`);
    ok((await q(`select count(*) from pg_extension where extname = 'pgcrypto'`)) === (devLike ? '1' : '0'), `${t} die Instanz-Skripte legen keine Erweiterung an oder verändern sie`);

    for (const [k, id] of Object.entries(UID)) await q(`insert into auth.users(id,email,raw_user_meta_data) values ('${id}','${k.toLowerCase()}@test.de','{"username":"Spieler_${k}"}')`);
    for (const [c, uid, nm] of [['A1', UID.A, 'A1'], ['B1', UID.B, 'B1']]) await q(`insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values ('${CH[c]}','${uid}',1,'${nm}','{}')`);
    await q(`insert into rwi.players values ('${CH.A1}', 10, 'krieger', 'ritter', 3), ('${CH.B1}', 10, 'heiler', 'priester', 3)`);

    const svc = async (sql) => { const r = await as('service_role', sql); if (r.code) throw new Error(r.err); return r.out; };
    const g = J(await svc(`select rwi.create_group('dungeon', array['${CH.A1}','${CH.B1}']::text[], 2)`));
    ok(g.status === 'ok', `${t} service_role: create_group (Instanzanlage mit seed-Standardwert)`, g.status);
    const I = g.instance;
    ok((await q(`select octet_length(seed) from rwi.instances where id = ${I}`)) === '32', `${t} seed hat 32 Byte`);
    ok((await q(`select count(distinct seed) from rwi.instances`)) === (await q(`select count(*) from rwi.instances`)), `${t} Seeds verschiedener Instanzen unterscheiden sich`);
    for (const c of [CH.A1, CH.B1]) await q(`select rwi.set_ready(${I}, '${c}')`);              // Eigentümerrolle (Testfunktion), wie im Prototyp
    const S = newFight(J(await svc(`select rwi.roster(${I})`)), { bossHp: 150, bossAtk: 8 });
    ok(J(await svc(`select rwi.start_fight(${I}, $j$${JSON.stringify(S)}$j$::jsonb)`)).status === 'ok', `${t} service_role: start_fight`);
    const fid = +(await q(`select max(id) from rwi.fights where instance_id = ${I}`)), rn = +(await q(`select round_no from rwi.fights where id = ${fid}`));
    await q(`update rwi.fights set due_at = clock_timestamp() - interval '1 second' where id = ${fid} and phase = 'planning'`);
    const c = await as('service_role', `select rwi.claim_resolution(${fid}, ${rn})`);
    ok(c.code === 0, `${t} service_role (search_path "$user", public): claim_resolution`, c.err.split('\n')[0]);
    if (c.code === 0) {
      const cl1 = J(c.out); const res = resolveClaim(cl1.input);
      ok(/^[0-9a-f]{64}$/.test(cl1.input_hash), `${t} input_hash ist ein 64-stelliger Hex-Wert`, cl1.input_hash.length + ' Zeichen');
      const cm = await as('service_role', `select rwi.commit_round(${fid}, ${cl1.input.round_no}, '${cl1.token}', ${cl1.round_version}, '${cl1.input_hash}', '${ENGINE_VERSION}', $j$${JSON.stringify(res)}$j$::jsonb)`);
      ok(cm.code === 0 && ['committed', 'event_ended'].includes(J(cm.out).status), `${t} service_role: commit_round`, cm.err.split('\n')[0] || J(cm.out).status);
    }
    // Zweiter Kampf-Weg mit minimalem search_path: kein stilles Verlassen auf public oder extensions für rwi-interne Aufrufe
    const c2 = await as('service_role', `set search_path = pg_catalog, pg_temp; select rwi.claim_resolution(${fid}, ${rn + 1})`);
    ok(c2.code === 0, `${t} claim_resolution mit search_path = pg_catalog, pg_temp (alle internen Verweise qualifiziert)`, c2.err.split('\n')[0]);
  } catch (e) { ok(false, `${t} Lauf ohne Ausnahme`, String(e.message).split('\n')[0]); }
  finally { cl.stop(); }
}
await suite('dev-ähnlich: pgcrypto in extensions', 54410, true);
await suite('ohne pgcrypto, Standard-search_path', 54412, false);
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
