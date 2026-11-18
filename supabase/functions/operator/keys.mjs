// Hilfsfunktionen ohne Laufzeitabhängigkeit (Deno, Node, Bun): Schlüsselwahl/-format und Body-Einlesen mit hartem Byte-Limit.

// Wählt einen Schlüssel aus der Umgebung. Neues Format zuerst (JSON-Objekt mit benannten Schlüsseln, Name "default": SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS),
// danach das alte Einzelschlüssel-Format (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY). Liefert einen String oder null (fehlt/unlesbar: geschlossen im Zweifel).
/** @param {(name: string) => string | undefined} get @param {string} listName @param {string} legacyName @returns {string | null} */
export function pickKey(get, listName, legacyName) {
  const raw = get(listName);
  if (typeof raw === 'string' && raw.trim()) {
    try { const o = JSON.parse(raw); if (o && typeof o === 'object' && typeof o.default === 'string' && o.default.length >= 8) return o.default; } catch { /* unlesbar: weiter mit dem alten Format */ }
  }
  const legacy = get(legacyName);
  return typeof legacy === 'string' && legacy.length >= 8 ? legacy : null;
}

// Header für einen Schlüssel: neue Schlüssel (sb_…) sind KEINE JWTs und gehören nur in "apikey" (nie als Bearer); alte JWT-Schlüssel in apikey UND Authorization.
/** @param {string} key @returns {Record<string, string>} */
export function keyHeaders(key) {
  /** @type {Record<string, string>} */ const h = { apikey: key };
  if (!String(key).startsWith('sb_')) h.authorization = `Bearer ${key}`;
  return h;
}

// Liest den Body eines Web-Request/Response-ähnlichen Objekts mit hartem Byte-Limit, BEVOR er vollständig im Speicher liegt.
// Liefert den Text oder null bei Überschreitung (der Stream wird dann sofort abgebrochen). Content-Length wird nur als schnelle Vorprüfung genutzt (nicht vertrauenswürdig).
/** @param {{ headers?: { get(n: string): string | null }, body?: ReadableStream<Uint8Array> | null }} req @param {number} max @returns {Promise<string | null>} */
export async function readBodyLimited(req, max) {
  const cl = req.headers && req.headers.get ? req.headers.get('content-length') : null;
  if (cl !== null && /^[0-9]+$/.test(cl) && Number(cl) > max) { try { await req.body?.cancel(); } catch { /* egal */ } return null; }
  if (!req.body) return '';
  const reader = req.body.getReader(), chunks = []; let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      n += value.byteLength; if (n > max) { try { await reader.cancel(); } catch { /* egal */ } return null; }
      chunks.push(value);
    }
  } catch { return null; }
  const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(all); } catch { return null; }
}
