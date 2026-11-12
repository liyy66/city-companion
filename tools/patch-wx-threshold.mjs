import fs from 'node:fs';
const p = 'lib/core.js';
let s = fs.readFileSync(p, 'utf8');
const a = s.replace('if (text.length >= 60) {', 'if (text.length >= 24) {');
const b = a.replace("usable = sources.filter((s) => (s.text || '').length >= 60);", "usable = sources.filter((s) => (s.text || '').length >= 24);");
fs.writeFileSync(p, b);
console.log('60->24:', (b.match(/>= 24/g) || []).length, 'left60:', (b.match(/>= 60/g) || []).length);
