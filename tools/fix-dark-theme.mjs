// 把「深色变量」从「仅跟随系统」扩展为「也响应手动切换的 data-theme=dark」
// 原问题：深色变量只写在 @media (prefers-color-scheme: dark) 里，用户手动点深色开关时
// html[data-theme=dark] 没有任何变量定义，页面仍是浅色。
import fs from 'node:fs';

const p = new URL('../src/css/app.css', import.meta.url);
let css = fs.readFileSync(p, 'utf8');
if (css.includes(':root[data-theme="dark"]')) {
  console.log('已经补过，跳过');
  process.exit(0);
}
const start = css.indexOf(':root:not([data-theme="light"]) {');
if (start < 0) throw new Error('找不到深色变量块');
const bodyStart = css.indexOf('{', start) + 1;
let depth = 1, i = bodyStart;
while (i < css.length && depth > 0) {
  const ch = css[i];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  i++;
}
const body = css.slice(bodyStart, i - 1);
const mediaClose = css.indexOf('}', i - 1); // @media 的收尾
const insertAt = mediaClose + 1;
const block = `\n\n/* 手动切换（设置里的深色开关）：与上面的系统深色共用一套变量 */\n:root[data-theme="dark"] {${body}}\n`;
css = css.slice(0, insertAt) + block + css.slice(insertAt);
fs.writeFileSync(p, css);
console.log('已插入 :root[data-theme="dark"] 变量块，长度', block.length);
