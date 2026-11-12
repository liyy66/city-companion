import fs from 'node:fs';
import path from 'node:path';

const [,, src, outDir] = process.argv;
const txt = fs.readFileSync(src, 'utf8');
fs.mkdirSync(outDir, { recursive: true });

const re = /<script([^>]*)>/gi;
let m, i = 0, last = 0;
const parts = [];
while ((m = re.exec(txt))) {
  const start = m.index;
  const bodyStart = re.lastIndex;
  const close = txt.indexOf('</script>', bodyStart);
  if (close < 0) break;
  const attrs = m[1] || '';
  const body = txt.slice(bodyStart, close);
  const info = { i, attrs, start, bodyStart, len: body.length, kind: '' };
  const idm = /id="([^"]+)"/.exec(attrs);
  if (idm) info.id = idm[1];
  if (/leaflet/i.test(body.slice(0, 3000))) info.kind = 'leaflet';
  else if (/Three\.js Authors/.test(body.slice(0, 400))) info.kind = 'three';
  else if (body.length > 5e6) info.kind = 'huge';
  else info.kind = 'code';
  parts.push(info);
  re.lastIndex = close + 9;
  i++;
}

const manifest = [];
for (const p of parts) {
  const name = `s${String(p.i).padStart(2, '0')}${p.id ? '_' + p.id : ''}${p.kind === 'huge' ? '_HUGE' : ''}.${p.kind === 'huge' ? 'json' : 'js'}`;
  const body = txt.slice(p.bodyStart, p.bodyStart + p.len);
  if (p.kind !== 'huge') fs.writeFileSync(path.join(outDir, name), body, 'utf8');
  manifest.push({ ...p, file: p.kind === 'huge' ? null : name, head: body.slice(0, 110).replace(/\n/g, ' ') });
}
// also the non-script html shell
const shell = txt.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (mm) => `<!--SCRIPT ${mm.length} bytes-->`);
fs.writeFileSync(path.join(outDir, '_shell.html'), shell, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
