// Läuft unverändert unter Node, Bun und Deno. Gibt eine JSON-Zeile aus: Laufzeit + Digest. Der Vergleich erfolgt in run-determinism.sh.
import { sha256, hmac, utf8, hex, draw32 } from '../engine/rng.mjs';
import { playAll } from './scenarios.mjs';
const rt = typeof Deno !== 'undefined' ? 'deno ' + Deno.version.deno : typeof Bun !== 'undefined' ? 'bun ' + Bun.version : 'node ' + process.version;
const checks = [];
const eq = (n, a, b) => checks.push({ n, ok: a === b });
eq('sha256("abc")', hex(sha256(utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
eq('sha256("")', hex(sha256(new Uint8Array(0))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
// RFC 4231, Testfall 2 und 6 (Schlüssel > 64 Byte)
eq('hmac rfc4231 #2', hex(hmac(utf8('Jefe'), utf8('what do ya want for nothing?'))), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
eq('hmac rfc4231 #6', hex(hmac(new Uint8Array(131).fill(0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First'))), '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
eq('utf8 mehrbyte', hex(utf8('äß€😀')), 'c3a4c39fe282acf09f9880');
const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
eq('draw32 fest', String(draw32(seed, 'crit', 7, 3, 0)), String(draw32(seed, 'crit', 7, 3, 0)));
const run = playAll(300);
const bad = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ rt, vectors_ok: bad.length === 0, bad: bad.map((b) => b.n), ...run }));
if (bad.length) { console.error('Testvektor fehlgeschlagen', bad); (typeof process !== 'undefined' ? process.exit(1) : Deno.exit(1)); }
