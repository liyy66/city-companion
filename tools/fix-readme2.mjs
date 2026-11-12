/* 一次性修 README（第二遍）：PowerShell 双引号里的反引号转义把 n/f 吃掉，
 * 这里按已知的三处断词补回，并打印整段供核对。 */
import fs from 'node:fs';

const p = 'README.md';
let s = fs.readFileSync(p, 'utf8');

const fixes = [
  [/接口实现放在\s*\netlify\/functions\//, '接口实现放在 netlify/functions/'],
  [/Cloudflare \f*unctions\//, 'Cloudflare functions/'],
  [/(跑)\s*\node\s+/, '$1 node '],
  [/Netlify → Add new site/, 'Netlify → Add new site']
];
for (const [re, to] of fixes) s = s.replace(re, to);

fs.writeFileSync(p, s);
const t = fs.readFileSync(p, 'utf8');
const i = t.indexOf('## 部署到 Netlify');
console.log(t.slice(i));
