/* 一次性修 README（第三遍）：补齐被转义吃掉的 n，然后校验全文不再有孤立断词。 */
import fs from 'node:fs';

const p = 'README.md';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(/根目录的\s*\netlify\.toml/, '根目录的 netlify.toml');
s = s.replace(/命令\s*\node tools\/build\.mjs/, '命令 node tools/build.mjs');
s = s.replace(/接口实现放在\s*\netlify\//, '接口实现放在 netlify/');
s = s.replace(/Cloudflare \f*unctions\//, 'Cloudflare functions/');
s = s.replace(/(跑)\s*\node\s+/, '$1 node ');

fs.writeFileSync(p, s);
const t = fs.readFileSync(p, 'utf8');

// 校验：每行以"etlify/ode/unctions"开头 = 断词
const broken = t.split(/\r?\n/).filter((l) => /^(etlify|ode |unctions)/.test(l));
const ctrl = (t.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
console.log('断词行:', broken.length, '控制字符:', ctrl);
const i = t.indexOf('## 部署到 Netlify');
console.log(t.slice(i, i + 420));
