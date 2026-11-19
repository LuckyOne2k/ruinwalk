/* Ruin Walk – Projektinventar für die Projektpflege (nur lesend).
   Listet Dokumente mit Größe, letztem Commit und Anzahl Verweise, findet tote Pfadverweise in Doku/Wissensbasis,
   unverwiesene Dokumente, Hinweise auf überholte Fassungen und ungetrackte Dateien.
   Markiert außerdem Dateien IN BEARBEITUNG (uncommittet in einem Worktree, auf nicht übernommenem Zweig geändert, Commit < 72 h, laufende Entwürfe).
   Aufruf (Repo-Wurzel): node .claude/skills/ruinwalk-projektpflege/scripts/inventar.js [--md] [--alle]   (--md = Markdown-Bericht, --alle = auch Code-Dateien in Bearbeitung) */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = cp.execSync('git rev-parse --show-toplevel').toString().trim();
const git = (a) => { try { return cp.execSync('git ' + a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const files = git('ls-files').split('\n').filter(Boolean);
const textFiles = files.filter((f) => /\.(md|js|mjs|ts|sql|sh|json|html|toml|yml)$/.test(f) && !/^(items|figs|status|assets)\//.test(f));
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
const corpus = Object.fromEntries(textFiles.map((f) => [f, read(f)]));
const docs = files.filter((f) => /\.md$/.test(f));
const rows = docs.map((f) => {
  const base = path.basename(f), txt = corpus[f] || '';
  const refs = Object.entries(corpus).filter(([g, t]) => g !== f && (t.includes(base) || t.includes(f))).length;
  const last = git(`log -1 --format=%ad --date=short -- "${f}"`);
  const ueberholt = /(\bist überholt|\bveraltet\b|ersetzt durch|gilt nicht mehr|Überholt durch)/i.test(txt.slice(0, 1500));
  return { f, zeilen: txt.split('\n').length, last, refs, ueberholt };
});
// tote Pfadverweise in Markdown und Agenten/Skills: `pfad/datei.ext`
const tot = [], andererZweig = [];
const remotes = git("branch -r --format='%(refname:short)'").split('\n').filter((b) => b && !/HEAD/.test(b));
const aufZweig = (p) => remotes.find((b) => { try { cp.execSync(`git cat-file -e "${b}:${p}"`, { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } });
for (const f of [...new Set(docs.concat(files.filter((x) => x.startsWith('.claude/'))))]) {
  const t = corpus[f] || read(f);
  for (const m of t.matchAll(/`((?:[\w.-]+\/)+[\w.-]+\.(?:md|js|mjs|ts|sql|sh|json|html|toml|png|jpg))`/g)) {
    const p = m[1]; if (p.includes('<') || p.startsWith('/tmp')) continue;
    const kand = [p, path.join(path.dirname(f), p), 'docs/' + p, '.claude/skills/' + p];
    if (kand.some((k) => fs.existsSync(path.join(ROOT, k))) || files.some((x) => x.endsWith('/' + p))) continue;
    const z = aufZweig(p); const e = `${f}: ${p}` + (z ? ` (nur auf ${z})` : '');
    (z ? andererZweig : tot).includes(e) || (z ? andererZweig : tot).push(e);
  }
}
const untracked = git('ls-files --others --exclude-standard').split('\n').filter(Boolean);
// ===== Laufende Arbeit erkennen: solche Dateien darf die Projektpflege nicht anfassen =====
const inArbeit = new Map();   // Datei -> Gründe
const mark = (f, grund) => { if (!f) return; if (!inArbeit.has(f)) inArbeit.set(f, new Set()); inArbeit.get(f).add(grund); };
// (a) uncommittete Änderungen in allen Worktrees
for (const block of git('worktree list --porcelain').split('\n\n')) {
  const wt = (block.match(/^worktree (.+)$/m) || [])[1], br = ((block.match(/^branch (.+)$/m) || [])[1] || '').replace('refs/heads/', '');
  if (!wt) continue;
  let st = ''; try { st = cp.execSync('git status --porcelain', { cwd: wt, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch {}
  for (const l of st.split('\n').filter(Boolean)) mark(l.slice(3).replace(/^.* -> /, ''), `uncommittet im Worktree ${path.basename(wt)} (${br || 'losgelöst'})`);
}
// (b) auf anderen, nicht in main übernommenen Zweigen geändert
const basis = git('rev-parse --verify -q origin/main') ? 'origin/main' : 'main';
const eigener = 'origin/' + git('rev-parse --abbrev-ref HEAD');   // eigener Arbeitszweig: dessen Stand ist hier ausgecheckt, offene Arbeit erkennt (a)/(c)
for (const b of remotes.filter((x) => !/\/(main|HEAD)$/.test(x) && x !== eigener)) {
  if (cp.spawnSync('git', ['merge-base', '--is-ancestor', b, basis], { cwd: ROOT }).status === 0) continue;   // Zweig ist schon in main übernommen
  for (const f2 of git(`diff --name-only ${basis}...${b}`).split('\n').filter(Boolean)) mark(f2, `geändert auf Zweig ${b.replace('origin/', '')} (nicht in main)`);
}
// (c) in den letzten 72 Stunden auf irgendeinem Zweig committet
for (const f2 of git('log --all --since=72.hours --name-only --format=').split('\n').filter(Boolean)) mark(f2, 'Commit in den letzten 72 h');
// (d) bekannte laufende Arbeitsablagen
for (const f2 of files.filter((x) => x.startsWith('marketing/freigabe/entwuerfe/'))) mark(f2, 'laufender Entwurf (marketing/freigabe/entwuerfe)');
for (const f2 of files.filter((x) => x.startsWith('kunst/entwuerfe/'))) mark(f2, 'laufender Grafik-Entwurf (kunst/entwuerfe, rw-pixelart)');
const big = rows.filter((r) => r.zeilen > 400).map((r) => `${r.f} (${r.zeilen} Zeilen)`);
const unref = rows.filter((r) => r.refs === 0 && !/^(README|CLAUDE)\.md$/.test(path.basename(r.f)) && !r.f.startsWith('.claude/') && !r.f.startsWith('marketing/freigabe/')).map((r) => r.f);   // Entwürfe = laufende Arbeit
const md = process.argv.includes('--md');
const out = [];
out.push(md ? '# Projektinventar' : 'PROJEKTINVENTAR', `Zweig: ${git('rev-parse --abbrev-ref HEAD')} @ ${git('rev-parse --short HEAD')} · ${files.length} Dateien im Repo, ${docs.length} Markdown`);
out.push('', md ? '## Dokumente' : '== Dokumente (Zeilen | letzter Commit | Verweise | Hinweis überholt)');
if (md) out.push('| Datei | Zeilen | letzter Commit | Verweise | überholt? |', '|---|---|---|---|---|');
for (const r of rows.sort((a, b) => a.f.localeCompare(b.f))) out.push(md ? `| ${r.f} | ${r.zeilen} | ${r.last} | ${r.refs} | ${r.ueberholt ? 'Hinweis' : ''}${inArbeit.has(r.f) ? ' IN BEARBEITUNG' : ''} |` : `${r.f}  ${r.zeilen} | ${r.last} | ${r.refs}${r.ueberholt ? ' | ÜBERHOLT?' : ''}${inArbeit.has(r.f) ? ' | IN BEARBEITUNG' : ''}`);
out.push('', md ? '## Befunde' : '== Befunde');
out.push(`- Tote Pfadverweise: ${tot.length}`, ...tot.slice(0, 40).map((x) => '  - ' + x));
out.push(`- Verweise auf Dateien, die nur auf einem anderen Zweig liegen: ${andererZweig.length}`, ...andererZweig.slice(0, 40).map((x) => '  - ' + x));
out.push(`- Nirgends verwiesene Dokumente: ${unref.length}`, ...unref.map((x) => '  - ' + x));
out.push(`- Sehr lange Dokumente (> 400 Zeilen): ${big.length}`, ...big.map((x) => '  - ' + x));
out.push(`- Ungetrackte Dateien: ${untracked.length}`, ...untracked.slice(0, 20).map((x) => '  - ' + x));
const ia = [...inArbeit.entries()].sort((a, b) => a[0].localeCompare(b[0]));
out.push('', md ? '## IN BEARBEITUNG – nicht anfassen, erst mit dem zuständigen Agenten abstimmen' : '== IN BEARBEITUNG – nicht anfassen, erst mit dem zuständigen Agenten abstimmen', `${ia.length} Dateien`);
const zeigen = process.argv.includes('--alle') ? ia : ia.filter(([f2]) => /\.(md)$/.test(f2) || f2.startsWith('.claude/'));
for (const [f2, g2] of zeigen) out.push(`  - ${f2}: ${[...g2].join('; ')}`);
if (zeigen.length < ia.length) out.push(`  (+ ${ia.length - zeigen.length} weitere Code-/Datendateien; vollständig mit --alle)`);
console.log(out.join('\n'));
