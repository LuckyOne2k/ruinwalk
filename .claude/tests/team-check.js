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
check(agents.length >= 8, `mindestens 8 Agenten (${agents.length})`);
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

// Abgleichpflicht beim Commit (in einem temporären Repo)
{
  const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-abgleich-'));
  const sh = (a) => cp.execSync(a, { cwd: tmp, stdio: 'ignore' });
  sh('git init -q && git config user.email t@t && git config user.name t'); fs.mkdirSync(path.join(tmp, 'server')); fs.mkdirSync(path.join(tmp, 'marketing'));
  fs.writeFileSync(path.join(tmp, 'server/x.sql'), 'select 1;'); fs.writeFileSync(path.join(tmp, 'marketing/a.md'), 'x');
  const h = (cmd) => /"permissionDecision":"deny"/.test(hook({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: tmp }));
  sh('git add server/x.sql');
  check(h('git commit -m "Neu"'), 'Abgleich: Commit an server/ ohne Abgleich-Zeile wird verweigert');
  check(!h('git commit -m "Neu\n\nAbgleich: rw-qa – ok"'), 'Abgleich: Commit an server/ mit Abgleich-Zeile ist erlaubt');
  check(h(`cd ${tmp} && git commit -q -m "x"`), 'Abgleich: auch mit vorangestelltem cd erkannt');
  sh('git reset -q && git add marketing/a.md');
  check(!h('git commit -m "Marketing"'), 'Abgleich: reine Marketing-Commits brauchen keine Abgleich-Zeile');
  sh('git add -A && git commit -q -m init && echo y >> server/x.sql');
  check(h('git commit -am "geändert"'), 'Abgleich: git commit -am mit geänderter server-Datei ohne Abgleich verweigert');
  // Nachbesserung nach Abgleich mit rw-architekt
  sh('git checkout -q -- . && git reset -q'); fs.writeFileSync(path.join(tmp, 'server/neu.sql'), 'select 2;'); fs.writeFileSync(path.join(tmp, 'marketing/b.md'), 'y');
  check(h('git add server/neu.sql && git commit -m "neu"'), 'Abgleich: git add <datei> && git commit ohne Abgleich verweigert (Hauptlücke)');
  check(h('git add -A && git commit -m "alles"'), 'Abgleich: git add -A && git commit ohne Abgleich verweigert');
  check(h('git commit -m "pfad" server/x.sql'), 'Abgleich: Pfadangabe nach git commit wird erkannt');
  check(!h('git add marketing/b.md && git commit -m "Instagram"'), 'Abgleich: Instagram-Lauf (nur marketing/) bleibt frei, obwohl Code-Dateien ungetrackt herumliegen');
  check(!h('git log --grep=commit') && !h('git config commit.gpgsign false'), 'Abgleich: lesende Befehle mit dem Wort commit lösen keinen Fehlalarm aus');
  sh('git add server/neu.sql');
  check(!h('git log --oneline && git status'), 'Abgleich: kein Fehlalarm ohne Commit, auch wenn Code vorgemerkt ist');
  sh('git commit -q -m "neu\n\nAbgleich: rw-qa – ok"');
  check(!h('git commit --amend --no-edit'), 'Abgleich: --amend ohne neue Nachricht übernimmt die alte Abgleich-Zeile');
  const sub = path.join(tmp, 'sub'); fs.mkdirSync(sub);
  fs.writeFileSync(path.join(tmp, 'server/rel.sql'), 'select 3;');
  const hSub = (cmd) => /"permissionDecision":"deny"/.test(hook({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: sub }));
  check(hSub('cd .. && git add server/rel.sql && git commit -m "rel"'), 'Abgleich: relatives cd (aus Unterordner) wird gegen das Arbeitsverzeichnis aufgelöst');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Projektpflege-Inventar: läuft, erkennt laufende Arbeit
{ const inv = cp.execFileSync('node', [path.join(C, 'skills/ruinwalk-projektpflege/scripts/inventar.js')], { cwd: ROOT }).toString();
  check(/IN BEARBEITUNG – nicht anfassen/.test(inv) && /Tote Pfadverweise: \d+/.test(inv), 'inventar.js läuft und weist laufende Arbeit aus');
  check(/marketing\/freigabe\/entwuerfe\/[^\n]*laufender Entwurf/.test(inv) || !fs.readdirSync(path.join(ROOT, 'marketing/freigabe/entwuerfe')).some((x) => x.endsWith('.md')), 'inventar.js schützt laufende Marketing-Entwürfe'); }

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

console.log('Kontextsicherung (Komprimieren)');
const stg = JSON.parse(fs.readFileSync(path.join(C, 'settings.json'), 'utf8'));
check(stg.env && stg.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === '80', 'settings.json: Auto-Komprimieren ab 80 %');
check(JSON.stringify(stg.hooks.PreCompact || '').includes('kontext-sicherung.js\\" vorher'), 'settings.json: PreCompact → kontext-sicherung.js vorher');
check((stg.hooks.SessionStart || []).some(h => h.matcher === 'compact' && JSON.stringify(h).includes('kontext-sicherung.js\\" nachher')), 'settings.json: SessionStart/compact → kontext-sicherung.js nachher');
check(fs.existsSync(path.join(ROOT, 'docs/ki-team/ARBEITSSTAND.md')), 'docs/ki-team/ARBEITSSTAND.md existiert');
check(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').includes('.claude/arbeitsstand/'), '.gitignore schließt .claude/arbeitsstand/ aus');
{ // in einer Wegwerf-Kopie ausführen, damit der echte Schnappschuss unberührt bleibt
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rw-ks-'));
  cp.execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m start', { cwd: tmp });
  fs.mkdirSync(path.join(tmp, 'docs/ki-team'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs/ki-team/ARBEITSSTAND.md'), '# Übergabe\nMARKE-123\n' + 'x'.repeat(30000));
  const lauf = (m) => cp.execFileSync('node', [path.join(C, 'hooks/kontext-sicherung.js'), m], { input: JSON.stringify({ trigger: 'auto' }), env: { ...process.env, CLAUDE_PROJECT_DIR: tmp } }).toString();
  const vor = lauf('vorher');
  check(vor.length > 0 && vor.length <= 10000, `kontext-sicherung vorher: Anweisung ≤ 10.000 Zeichen (${vor.length})`);
  check(vor.includes('MARKE-123'), 'kontext-sicherung vorher: enthält Übergabe-Auszug');
  check(fs.existsSync(path.join(tmp, '.claude/arbeitsstand/schnappschuss.md')), 'kontext-sicherung vorher: Schnappschuss geschrieben');
  let j = {}; try { j = JSON.parse(lauf('nachher')); } catch {}
  const ac = (j.hookSpecificOutput || {}).additionalContext || '';
  check(j.hookSpecificOutput && j.hookSpecificOutput.hookEventName === 'SessionStart' && ac.includes('MARKE-123') && ac.includes('Schnappschuss'), 'kontext-sicherung nachher: gültiges JSON mit Übergabe + Schnappschuss');
  let leer = ''; try { leer = cp.execFileSync('node', [path.join(C, 'hooks/kontext-sicherung.js'), 'nachher'], { input: 'kein json', env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(tmp, 'gibtsnicht') } }).toString(); check(true, 'kontext-sicherung: blockiert nie (Exit 0 bei Fehleingaben)'); } catch { check(false, 'kontext-sicherung: blockiert nie (Exit 0 bei Fehleingaben)'); }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nErgebnis: ${ok} bestanden, ${bad} fehlgeschlagen`);
process.exit(bad ? 1 : 0);
