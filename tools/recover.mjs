// 修复被 PowerShell 以 CP1252 解码后重写导致的乱码
import fs from 'node:fs';

const src = process.argv[2] || 'src/shell.html';
const dst = process.argv[3] || 'src/shell.fixed.html';

let s = fs.readFileSync(src, 'utf8');
if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

const cp = {
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160',
  0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019',
  0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153',
  0x9e: '\u017e', 0x9f: '\u0178'
};
const rev = new Map();
for (const k of Object.keys(cp)) rev.set(cp[k], Number(k));

const bytes = [];
let unknown = 0;
for (const ch of s) {
  const c = ch.codePointAt(0);
  if (c < 0x100) bytes.push(c);
  else if (rev.has(ch)) bytes.push(rev.get(ch));
  else { unknown++; bytes.push(0x3f); }
}

const out = Buffer.from(bytes).toString('utf8');
const bad = (out.match(/\ufffd/g) || []).length;
console.log(JSON.stringify({
  unknown, bad, hasChinese: out.includes('全部城市'), hasSat: out.includes('卫星'),
  bytes: Buffer.byteLength(out), chars: out.length
}));
fs.writeFileSync(dst, out, 'utf8');
