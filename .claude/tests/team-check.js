/* Ruin Walk – Selbsttest des KI-Team-Systems (Skills, Agenten, Hooks, Einstellungen, Verweise).
   Aufruf (Repo-Wurzel): node .claude/tests/team-check.js     Exit 1 bei Fehlern. Ändert nichts. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), C = path.join(ROOT, '.claude');
let ok = 0, bad = 0;
const pass = m => { ok++; }, fail = m => { bad++; console.log('  ✗ ' + m); };
const check = (cond, m) => cond ? pass(m) : fail(m);
function frontmatter(file) {
  const s = fs.readFileSync(file, 'utf8'), m = s.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const o = {}; let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; o[key] = kv[2] === '' ? [] : kv[2]; }
    else if (/^\s+-\s+/.test(line) && Array.isArray(o[key])) o[key].push(line.replace(/^\s+-\s+/, '').trim());
  }
  o._body = s.slice(m[0].length); return o;
}

console.log('Skills');
const skills = fs.readdirSync(path.join(C, 'skills')).filter(d => fs.existsSync(path.join(C, 'skills', d, 'SKILL.md')));
for (const d of skills) {
  const f = frontmatter(path.join(C, 'skills', d, 'SKILL.md'));
  check(f, `${d}: Frontmatter vorhanden`);
  if (!f) continue;
  check(f.name === d, `${d}: name = Ordnername (${f.name})`);
  check(/^[a-z0-9-]{1,64}$/.test(f.name || ''), `${d}: name nur a-z0-9- (≤64)`);
  check(typeof f.description === 'string' && f.description.length >= 40 && f.description.length <= 1024, `${d}: description 40–1024 Zeichen (${(f.description || '').length})`);
  check(f._body.trim().length > 200, `${d}: Inhalt vorhanden`);
  // Verweise auf Dateien im Skill (references/…, scripts/…, beispiele/…, vorlagen/…)
  for (const ref of new Set((f._body.match(/(?:references|scripts|beispiele|vorlagen|fonts)\/[\w.\-\/]+\.\w+/g) || [])))
    if (!ref.includes('<')) check([path.join(C, 'skills', d, ref), path.join(ROOT, ref), ...skills.map(x => path.join(C, 'skills', x, ref))].some(p => fs.existsSync(p)), `${d}: Verweis ${ref} existiert (im Skill, Repo oder einem anderen Skill)`);
  for (const ref of new Set((f._body.match(/\.claude\/skills\/[\w.\-\/]+\.\w+/g) || []))) check(fs.existsSync(path.join(ROOT, ref)), `${d}: Pfad ${ref} existiert`);
}
check(skills.length >= 12, `mindestens 12 Skills (${skills.length})`);

console.log('Agenten');
const TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'MultiEdit', 'Skill', 'WebFetch', 'WebSearch', 'NotebookEdit', 'TodoWrite']);
const agents = fs.readdirSync(path.join(C, 'agents')).filter(f => f.endsWith('.md'));
const descs = [];
for (const a of agents) {
  const f = frontmatter(path.join(C, 'agents', a));
  check(f, `${a}: Frontmatter`); if (!f) continue;
  check(f.name === a.replace(/\.md$/, ''), `${a}: name = Dateiname`);
  check(typeof f.description === 'string' && f.description.length > 80, `${a}: description aussagekräftig`);
  for (const t of String(f.tools || '').split(',').map(s => s.trim()).filter(Boolean)) check(TOOLS.has(t) || t.startsWith('mcp__'), `${a}: Werkzeug ${t} bekannt`);
  check(Array.isArray(f.skills) && f.skills.includes('ruinwalk-projektwissen'), `${a}: lädt ruinwalk-projektwissen`);
  for (const s of f.skills || []) check(skills.includes(s), `${a}: Skill ${s} existiert`);
  check(/Deutsch/.test(f._body), `${a}: Antwortsprache festgelegt`);
  descs.push(f.name);
}
check(agents.length === 8, `8 Agenten (${agents.length})`);
const marketing = frontmatter(path.join(C, 'agents/rw-marketing.md'));
check(marketing && !/mcp__Supabase/.test(marketing.tools) && /modus\.json/.test(marketing._body), 'rw-marketing: keine DB-Werkzeuge, Veröffentlichungsmodus geregelt');
const arch = frontmatter(path.join(C, 'agents/rw-architekt.md'));
check(arch && !/Edit|Write/.test(arch.tools), 'rw-architekt: nur lesend');

console.log('Einstellungen und Hooks');
let st; try { st = JSON.parse(fs.readFileSync(path.join(C, 'settings.json'), 'utf8')); pass(); } catch (e) { fail('settings.json ist gültiges JSON: ' + e.message); }
for (const ev of Object.values((st || {}).hooks || {})) for (const h of ev) for (const x of h.hooks) {
  const m = x.command.match(/\.claude\/hooks\/[\w.-]+/); check(m && fs.existsSync(path.join(ROOT, m[0])), `Hook-Datei ${m && m[0]} existiert`);
}
const hook = (inp) => cp.execFileSync('node', [path.join(C, 'hooks/schutz.js')], { input: JSON.stringify(inp), env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } }).toString();
const FAELLE = [
  // Modus aus marketing/meta/modus.json (Erwartung wird unten abhängig vom Modus gesetzt)
  [{ tool_name: 'Bash', tool_input: { command: 'node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen a.md --senden' } }, 'MODUS'],
  [{ tool_name: 'Bash', tool_input: { command: 'node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen a.md --senden; curl -X POST https://graph.facebook.com/x' } }, true],
  [{ tool_name: 'Edit', tool_input: { file_path: '/repo/marketing/meta/modus.json' } }, true],
  [{ tool_name: 'Write', tool_input: { file_path: '/repo/marketing/meta/modus.json' } }, true],
  [{ tool_name: 'Bash', tool_input: { command: "sed -i 's/pause/autonom/' marketing/meta/modus.json" } }, true],
  [{ tool_name: 'Bash', tool_input: { command: 'cat marketing/meta/modus.json' } }, false],
  [{ tool_name: 'Edit', tool_input: { file_path: '/repo/marketing/04_instagram.md' } }, false],
  [{ tool_name: 'Bash', tool_input: { command: 'node .claude/skills/ruinwalk-meta-publishing/scripts/meta-api.js veroeffentlichen a.md' } }, false],
  [{ tool_name: 'Bash', tool_input: { command: 'curl -X POST https://graph.facebook.com/v25.0/1/feed -d message=x' } }, true],
  [{ tool_name: 'Bash', tool_input: { command: 'curl https://graph.facebook.com/v25.0/me' } }, false],
  [{ tool_name: 'Bash', tool_input: { command: 'git push -u origin main' } }, true],
  [{ tool_name: 'Bash', tool_input: { command: 'git push origin HEAD:main' } }, true],
  [{ tool_name: 'Bash', tool_input: { command: 'git push -u origin feature-x' } }, false],
  [{ tool_name: 'mcp__Supabase__execute_sql', tool_input: { query: 'select * from pg_policies' } }, false],
  [{ tool_name: 'mcp__Supabase__execute_sql', tool_input: { query: 'with x as (delete from public.characters returning *) select 1' } }, true],
  [{ tool_name: 'mcp__Supabase__execute_sql', tool_input: { query: 'select 1; drop table t' } }, true],
  [{ tool_name: 'mcp__claude_ai_Supabase__apply_migration', tool_input: {} }, true],
  [{ tool_name: 'mcp__Supabase__deploy_edge_function', tool_input: {} }, true],
  [{ tool_name: 'mcp__Supabase__list_tables', tool_input: {} }, false],
  [{ tool_name: 'Read', tool_input: { file_path: 'x' } }, false]
];
let MODUS = 'freigabe'; try { MODUS = JSON.parse(fs.readFileSync(path.join(ROOT, 'marketing/meta/modus.json'), 'utf8')).modus; } catch {}
for (let [inp, soll] of FAELLE) {
  if (soll === 'MODUS') soll = MODUS !== 'autonom';
  const out = hook(inp); const ist = /"permissionDecision":"ask"/.test(out);
  check(ist === soll, `schutz.js: ${inp.tool_name} ${JSON.stringify(inp.tool_input).slice(0, 70)} → ${soll ? 'Rückfrage' : 'frei'}`);
}

console.log('Wissensbasis und Doku');
for (const f of ['CLAUDE.md', 'docs/ki-team/UEBERSICHT.md', 'docs/ki-team/ABSCHLUSSBERICHT.md', 'marketing/README.md', 'marketing/meta/ANBINDUNG.md', 'marketing/freigabe/VORLAGE_BEITRAG.md'])
  check(fs.existsSync(path.join(ROOT, f)), `${f} existiert`);
const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
for (const a of descs) check(claude.includes(a), `CLAUDE.md nennt ${a}`);
const ueb = fs.existsSync(path.join(ROOT, 'docs/ki-team/UEBERSICHT.md')) ? fs.readFileSync(path.join(ROOT, 'docs/ki-team/UEBERSICHT.md'), 'utf8') : '';
for (const s of skills) check(ueb.includes(s), `UEBERSICHT.md nennt Skill ${s}`);
for (const a of descs) check(ueb.includes(a), `UEBERSICHT.md nennt Agent ${a}`);
// Belegte Fakten der Wissensbasis gegen den Code prüfen
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const k of ['const CLASSES', 'const PATHS', 'const MOBS', 'function mobOf', 'function worldBand', 'function effBand', 'UP_LV=[15,30,50]', 'LV_CAP=50', "BAND_N=['Randland','Wildland','Fernmark','Schreckensmark','Ruinenreich']"])
  check(html.includes(k), `index.html enthält ${k}`);
// Keine Secrets im KI-Team-System
const files = cp.execSync('git ls-files -co --exclude-standard .claude marketing docs/ki-team CLAUDE.md', { cwd: ROOT }).toString().split('\n').filter(Boolean);
for (const f of files) { if (/\.(png|jpg|woff2)$/.test(f)) continue; const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(!/(EAA[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_]{10,}|service_role"\s*:\s*"ey|IGQV[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})/.test(s), `${f}: keine Zugangsschlüssel`); }

console.log(`\nErgebnis: ${ok} bestanden, ${bad} fehlgeschlagen`);
process.exit(bad ? 1 : 0);
