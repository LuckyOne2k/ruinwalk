// Gemeinsame Testumgebung für die kombinierte Installation (schema.sql + 01–05) auf lokalem PostgreSQL mit Attrappe der Supabase-Rollen.
// NICHT ECHT: auth.* ist die Attrappe aus supabase/tests/00_stub.sql (kein GoTrue, kein PostgREST).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startCluster } from './pg.mjs';
const here = dirname(fileURLToPath(import.meta.url));
export const SQL = (f) => readFileSync(join(here, '../sql', f + '.sql'), 'utf8');
export const STUB = readFileSync(join(here, '../../../supabase/tests/00_stub.sql'), 'utf8');
export const SCHEMA = readFileSync(join(here, '../../../supabase/schema.sql'), 'utf8');
export const J = (s) => JSON.parse(s);
const CLASSES = [['krieger', 'ritter'], ['bogenschuetze', 'jaeger'], ['magier', 'feuer'], ['heiler', 'priester'], ['heiler', 'natur'], ['krieger', 'berserker'], ['magier', 'frost'], ['bogenschuetze', 'fallensteller']];
export function counter() {
  let pass = 0, fail = 0;
  const ok = (c, n, i = '') => { (c ? pass++ : fail++); console.log(`${c ? 'ok' : 'NICHT OK'} - ${n}${i ? '  [' + i + ']' : ''}`); };
  return { ok, done: () => { console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`); return fail ? 1 : 0; } };
}
export async function setup(port) {
  const cl = await startCluster(port);
  const q = async (s) => { const r = await cl.psql(s); if (r.code) throw new Error(r.err + '\n' + s.slice(0, 240)); return r.out; };
  await q('\\set legacy 1\n' + STUB); await q(SCHEMA);
  for (const f of ['01_proto', '02_actions', '03_windows', '04_gruppe', '05_produktion']) await q(SQL(f));
  let nu = 0, nc = 0;
  const uid = (n) => `aaaa${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`;
  const cid = (n) => `cccc${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`;
  // Konto mit n Charakteren (Plätze 1..n; Platz 3 mit Berechtigung). Rückgabe { id, chars: [uuid,...] }
  const account = async (name, n = 1) => {
    const id = uid(++nu); await q(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('${id}','${name}@rwtest.invalid','{"username":"${name}"}', now())`);
    if (n >= 3) await q(`insert into public.account_entitlements(account_id,entitlement_type,status,granted_at) values ('${id}','third_character_slot','active',now())`);
    const chars = [];
    for (let s = 1; s <= n; s++) { const c = cid(++nc); chars.push(c); const [g, p] = CLASSES[nc % CLASSES.length];
      await q(`insert into public.characters(character_id,account_id,slot_number,character_name,character_data) values ('${c}','${id}',${s},'${name}${s}','{}'); insert into rwi.players values ('${c}', 10, '${g}', '${p}', 3)`); }
    return { id, chars, name };
  };
  const as = (role, uidv, sql) => cl.psql(`set role ${role}; set search_path = "$user", public; ${uidv ? `set request.jwt.claims = '${JSON.stringify({ sub: uidv, role })}';` : ''} ${sql}`);
  // alle Aufrufe warten in der Datenbank auf denselben Zeitpunkt (gleichzeitiger Start)
  const parallel = async (sqls, leadMs = 900) => {
    const at = await q(`select to_char(clock_timestamp() + interval '${leadMs} milliseconds', 'YYYY-MM-DD HH24:MI:SS.US')`);
    return Promise.all(sqls.map((s) => cl.psql(`select pg_sleep_until('${at}'::timestamp::timestamptz); ${s}`)));
  };
  const group = async (chars, fights = 2) => J(await q(`select rwi.create_group('dungeon', array[${chars.map((c) => `'${c}'`).join(',')}]::text[], ${fights})`));
  // RPC-Aufruf eines public-Wrappers mit benannten Argumenten unter einer Rolle (wie PostgREST /rpc/<name>). Fehler werden als Ausnahme mit .code/.err geworfen.
  const lit = (v) => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'string' ? `$rwq$${v}$rwq$` : Array.isArray(v) && v.every((x) => typeof x === 'number') ? `array[${v.join(',')}]::bigint[]` : `$rwq$${JSON.stringify(v)}$rwq$::jsonb`;
  const rpcAs = (role, uidv = null) => async (name, args = {}) => {
    const r = await as(role, uidv, `select public.${name}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`);
    if (r.code) { const e = new Error(r.err.split('\n')[0]); e.err = r.err; e.code = r.code; throw e; }
    return J(r.out.split('\n').pop());
  };
  return { cl, q, as, account, parallel, group, rpcAs, stop: () => cl.stop() };
}
