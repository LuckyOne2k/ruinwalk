#!/usr/bin/env node
/* Ruin Walk – PreToolUse-Schutz. Erzwingt eine Bestätigung durch den Menschen (permissionDecision "ask") für:
   0. jede Änderung am Veröffentlichungsmodus marketing/meta/modus.json,
   1. schreibende Meta-Aufrufe (Instagram/Facebook veröffentlichen, löschen, kommentieren) – Ausnahme: Modus „autonom“
      erlaubt den schlichten Aufruf von meta-api.js … --senden (das Skript prüft Qualität, Kanäle, Limits),
   2. schreibende Zugriffe auf die Live-Supabase über MCP (Migrationen, DDL/DML, Edge Functions, Projekt-/Branch-Aktionen),
   3. git push auf main/master (löst GitHub-Pages-Deploy ohne Tests aus).
   Lesende Aufrufe laufen ohne Rückfrage durch. Bei Parse-Fehlern wird nichts blockiert (exit 0 ohne Ausgabe). */
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let inp; try { inp = JSON.parse(raw); } catch { return; }
  const tool = inp.tool_name || '', ti = inp.tool_input || {};
  const ask = reason => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));

  // Veröffentlichungsmodus (marketing/meta/modus.json): „autonom“ = rw-marketing darf über meta-api.js selbst posten
  // (das Skript erzwingt Qualitätsprüfung, Kanäle und Limits); sonst Rückfrage. Den Modus ändert nur Pascal.
  const fs = require('fs'), path = require('path');
  let modus = 'freigabe';
  try { modus = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), 'marketing/meta/modus.json'), 'utf8')).modus || 'freigabe'; } catch {}
  const MODUS_DATEI = /marketing[\\/]meta[\\/]modus\.json/;
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) && MODUS_DATEI.test(String(ti.file_path || ti.notebook_path || '')))
    return ask('Ruin Walk: Änderung am Veröffentlichungsmodus (autonom/freigabe/pause). Das entscheidet nur Pascal.');

  if (tool === 'Bash') {
    const c = String(ti.command || '');
    // Abgleichpflicht: Commits an Code, Schema, Server, Tests, CI oder KI-Team-Dateien brauchen eine Zeile „Abgleich: …“ (Skill ruinwalk-ablauf).
    // Heuristik über die Befehlszeile (ein PreToolUse-Hook sieht den Zustand VOR dem Befehl): vorgemerkte Dateien + Dateien aus „git add …“ in derselben
    // Zeile + Pfade nach „git commit“ + bei -a geänderte Dateien. merge/cherry-pick werden nicht erfasst (übernommene Commits tragen ihre Zeile schon),
    // ein Commit nach einem Konflikt (MERGE_HEAD/CHERRY_PICK_HEAD) aber schon.
    const commitRe = /(?:^|[;&|(]\s*)git(?:\s+-[Cc]\s+\S+)*\s+commit(?=\s|$)/m;
    if (commitRe.test(c)) {
      const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
      const unq = (x) => x.replace(/^["']|["']$/g, '').replace(/^~(?=\/|$)/, os.homedir());
      const base = inp.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const cdM = c.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*(?:&&|;)/), gcM = c.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)\s+commit/);
      const dir = gcM ? path.resolve(base, unq(gcM[1])) : cdM ? path.resolve(base, unq(cdM[1])) : base;
      const g = (a) => { try { return cp.execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; } };
      const changed = () => g(['diff', '--name-only']).split('\n').concat(g(['ls-files', '--others', '--exclude-standard']).split('\n'));
      const toks = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''));
      let files = g(['diff', '--cached', '--name-only']).split('\n');
      for (const m of c.matchAll(/\bgit\s+add\b([^;&|]*)/g)) {
        const t = toks(m[1]);
        if (t.some((x) => ['-A', '--all', '.', '-u', '--update'].includes(x))) files = files.concat(changed());
        else { const all = changed(); for (const p of t.filter((x) => !x.startsWith('-'))) files = files.concat(all.filter((f) => f === p || f.startsWith(p.replace(/\/?$/, '/')))); }
      }
      const seg = (c.match(/\bcommit\b([^;&|]*)/) || ['', ''])[1], ct = toks(seg), skip = new Set(['-m', '--message', '-F', '--file', '-C', '-c', '--author', '--date', '--fixup', '--squash', '-t', '--template', '--trailer']);
      for (let i = 0; i < ct.length; i++) { if (skip.has(ct[i])) { i++; continue; } if (!ct[i].startsWith('-') && !ct[i].includes('$(')) files.push(ct[i]); }
      if (/(?:^|\s)(-a|--all|-a[a-zA-Z]*)(?=\s|$)/.test(seg)) files = files.concat(g(['diff', '--name-only']).split('\n'));
      const relevant = [...new Set(files.filter((x) => /^(index\.html|landingpage\.html|package\.json|pxdom\.js|sprites[\w-]*\.js|CLAUDE\.md)$|^(supabase|server|tests|tools|\.github|\.claude|figs|items|status|assets)\//.test(x)))];
      let msg = c;
      const fM = c.match(/\s(?:-F|--file)[= ]("[^"]+"|'[^']+'|\S+)/);
      if (fM && unq(fM[1]) !== '-') { try { msg += fs.readFileSync(path.resolve(dir, unq(fM[1])), 'utf8'); } catch {} }
      if (/\s--amend\b/.test(seg) && !/\s(-m|--message|-F|--file)\b/.test(seg)) msg += g(['log', '-1', '--format=%B']);
      const gitDir = g(['rev-parse', '--git-dir']).trim(), konflikt = gitDir && ['MERGE_HEAD', 'CHERRY_PICK_HEAD'].some((h) => fs.existsSync(path.resolve(dir, gitDir, h)));
      if (relevant.length && !/Abgleich:/.test(msg))
        return process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
          permissionDecisionReason: `Ruin Walk – Abgleichpflicht${konflikt ? ' (Konfliktlösung nach merge/cherry-pick)' : ''}: Der Commit enthält ${relevant.slice(0, 5).join(', ')}${relevant.length > 5 ? ' …' : ''}. Vorher die fachlich betroffenen Agenten nach Skill ruinwalk-ablauf (Abschnitt „Abgleich“) prüfen lassen${konflikt ? ' – bei Konflikten die Auflösung' : ''} und das Ergebnis als Zeile „Abgleich: <Agenten> – <Ergebnis>“ in die Commit-Nachricht (-m oder -F) schreiben.` } }));
    }
    if (MODUS_DATEI.test(c) && /(>|\bsed\s+-i|\btee\b|\bcp\b|\bmv\b|\brm\b|\bperl\s+-i|writeFile|open\([^)]*['"]w)/.test(c))
      return ask('Ruin Walk: Änderung am Veröffentlichungsmodus (autonom/freigabe/pause). Das entscheidet nur Pascal.');
    if (/meta-api\.js[\s\S]*--senden/.test(c)) {
      if (modus === 'autonom' && !/[;&|`$]/.test(c.replace(/2>&1/g, ''))) return;   // nur ein schlichter Skriptaufruf, keine verketteten Befehle
      return ask('Ruin Walk: Veröffentlichung auf Instagram/Facebook. Nur bestätigen, wenn Pascal genau diesen Beitrag freigegeben hat (marketing/freigabe).');
    }
    if (/graph\.(facebook|instagram)\.com/.test(c) && /(-X\s*(POST|DELETE|PUT)|--request\s+(POST|DELETE|PUT)|\s-d\s|--data|\s-F\s|--form|method:\s*['"](POST|DELETE))/i.test(c))
      return ask('Ruin Walk: schreibender Aufruf an die Meta Graph API. Veröffentlichen/Löschen/Kommentieren nur mit Freigabe von Pascal.');
    if (/\bgit\s+push\b/.test(c) && /(\s|:|\/)(main|master)(\s|$)/.test(c))
      return ask('Ruin Walk: Push auf main löst sofort den GitHub-Pages-Deploy aus (ohne Tests). Nur mit Auftrag von Pascal.');
    return;
  }

  const teile = tool.split('__');   // mcp__<server>__<werkzeug>, Servername kann Unterstriche enthalten (z. B. claude_ai_Supabase)
  if (teile[0] === 'mcp' && teile.length >= 3 && /supabase/i.test(teile[1])) {
    const op = teile.slice(2).join('__');
    const lesend = /^(list_|get_|search_docs|query_logs|generate_typescript_types)/.test(op);
    if (op === 'execute_sql') {
      const q = String(ti.query || '').replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().toLowerCase();
      const nurLesen = /^(select|with|explain|show)\b/.test(q) && !/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment|call|do|copy|vacuum|refresh|security\s+definer|set\s+role|pg_terminate|nextval|setval)\b/.test(q) && !/;\s*\S/.test(q);
      if (nurLesen) return;
      return ask('Ruin Walk: SQL mit möglicher Änderung an der LIVE-Datenbank. Nur mit ausdrücklicher Freigabe von Pascal (Skill ruinwalk-db-aenderung).');
    }
    if (!lesend) return ask(`Ruin Walk: Supabase-Aktion „${op}“ verändert das Live-Projekt oder kostet Geld. Nur mit ausdrücklicher Freigabe von Pascal.`);
  }
});
