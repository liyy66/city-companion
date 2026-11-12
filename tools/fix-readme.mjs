/* 一次性修 README：PowerShell 双引号里 `f` 被当成换页符、`n` 被当成换行，
 * 结果写进去的是控制字符，公众号里的路径就断了。这里按码点清理并补回字母。 */
import fs from 'node:fs';

const p = 'README.md';
let s = fs.readFileSync(p, 'utf8');

// 1) 换页符(0x0C) 出现在 "Cloudflare <FF>unctions/" 里，补回 f
s = s.replace(/Cloudflare \f+unctions\//g, 'Cloudflare functions/');
// 2) 换行符把 "node" 吃掉的情况：`跑\node` → `跑 node`
s = s.replace(/(跑)\s*\node\s+/g, '$1 node ');
// 3) 兜底：清掉任何残留的可控字符，除换行/制表
s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

fs.writeFileSync(p, s);
const t = fs.readFileSync(p, 'utf8');
const bad = (t.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
console.log('控制字符:', bad, '| 长度:', t.length);
console.log(t.slice(t.indexOf('接口实现放在'), t.indexOf('接口实现放在') + 200));
