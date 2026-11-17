// Startet ein temporäres, isoliertes PostgreSQL (kein Supabase, keine Spielerdaten) und stellt psql-Helfer bereit.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const binDir = () => { const b = readdirSync('/usr/lib/postgresql').sort().pop(); return `/usr/lib/postgresql/${b}/bin`; };
export async function startCluster(port = 54331) {
  const BIN = binDir(), tmp = mkdtempSync(join(tmpdir(), 'rwi-')); chmodSync(tmp, 0o755);
  const root = process.getuid && process.getuid() === 0, pre = root ? ['runuser', '-u', 'postgres', '--'] : [];
  if (root) spawnSync('chown', ['postgres', tmp]);
  const run = (cmd, args) => spawnSync(pre[0] || cmd, pre.length ? [...pre.slice(1), cmd, ...args] : args, { encoding: 'utf8' });
  let r = run(`${BIN}/initdb`, ['-D', `${tmp}/data`, '-A', 'trust', '-U', 'postgres']); if (r.status) throw new Error(r.stderr);
  r = run(`${BIN}/pg_ctl`, ['-D', `${tmp}/data`, '-o', `-p ${port} -k ${tmp} -c listen_addresses='' -c max_connections=100 -c deadlock_timeout=200ms -c log_lock_waits=on`, '-l', `${tmp}/log`, '-w', 'start']); if (r.status) throw new Error(r.stderr + r.stdout);
  const base = ['-h', tmp, '-p', String(port), '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];
  const psql = (sql, db = 'rwi', extra = []) => new Promise((res) => {
    const p = spawn(`${BIN}/psql`, [...base, '-d', db, '-At', ...extra], { stdio: ['pipe', 'pipe', 'pipe'] }); let o = '', e = '';
    p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d)); p.on('close', (code) => res({ code, out: o.trim(), err: e.trim() })); p.stdin.end(sql);
  });
  await psql('create database rwi', 'postgres');
  const stop = () => { run(`${BIN}/pg_ctl`, ['-D', `${tmp}/data`, '-m', 'immediate', 'stop']); rmSync(tmp, { recursive: true, force: true }); };
  return { psql, stop, BIN, tmp, port, base };
}
