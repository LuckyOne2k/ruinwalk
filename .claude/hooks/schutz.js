#!/usr/bin/env node
/* Ruin Walk – PreToolUse-Schutz. Erzwingt eine Bestätigung durch den Menschen (permissionDecision "ask") für:
   1. schreibende Meta-Aufrufe (Instagram/Facebook veröffentlichen, löschen, kommentieren),
   2. schreibende Zugriffe auf die Live-Supabase über MCP (Migrationen, DDL/DML, Edge Functions, Projekt-/Branch-Aktionen),
   3. git push auf main/master (löst GitHub-Pages-Deploy ohne Tests aus).
   Lesende Aufrufe laufen ohne Rückfrage durch. Bei Parse-Fehlern wird nichts blockiert (exit 0 ohne Ausgabe). */
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let inp; try { inp = JSON.parse(raw); } catch { return; }
  const tool = inp.tool_name || '', ti = inp.tool_input || {};
  const ask = reason => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));

  if (tool === 'Bash') {
    const c = String(ti.command || '');
    if (/meta-api\.js[\s\S]*--senden/.test(c))
      return ask('Ruin Walk: Veröffentlichung auf Instagram/Facebook. Nur bestätigen, wenn Pascal genau diesen Beitrag freigegeben hat (marketing/freigabe).');
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
