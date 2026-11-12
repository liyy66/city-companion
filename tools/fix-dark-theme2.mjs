// 修正上一次插入位置：深色变量块被插到了 @media 内部，导致手动切换无效。
// 这次先删掉旧块，再按「@media 的花括号配对」找到真正的结尾，插到它外面。
import fs from 'node:fs';

const p = new URL('../src/css/app.css', import.meta.url);
let css = fs.readFileSync(p, 'utf8');

const MARK = '/* 手动切换（设置里的深色开关）：与上面的系统深色共用一套变量 */';
const oldAt = css.indexOf(MARK);
if (oldAt >= 0) {
  const end = css.indexOf('\n\n', css.indexOf('}', oldAt));
  const from = css.lastIndexOf('\n', oldAt - 1);
  css = css.slice(0, from) + css.slice(end);
  console.log('已移除旧块');
}

const mediaAt = css.indexOf('@media (prefers-color-scheme: dark)');
if (mediaAt < 0) throw new Error('找不到媒体查询');
const open = css.indexOf('{', mediaAt);
let depth = 1, i = open + 1;
while (i < css.length && depth > 0) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}') depth--;
  i++;
}
const mediaEnd = i; // 媒体查询收尾之后

const innerStart = css.indexOf(':root:not([data-theme="light"]) {');
const innerBodyStart = css.indexOf('{', innerStart) + 1;
let d2 = 1, j = innerBodyStart;
while (j < css.length && d2 > 0) {
  if (css[j] === '{') d2++;
  else if (css[j] === '}') d2--;
  j++;
}
const body = css.slice(innerBodyStart, j - 1);
const block = `\n\n${MARK}\n:root[data-theme="dark"] {${body}}\n`;
css = css.slice(0, mediaEnd) + block + css.slice(mediaEnd);
fs.writeFileSync(p, css);

// 自检：块必须在 @media 收尾之后
const check = fs.readFileSync(p, 'utf8');
const mEnd = check.indexOf('}', check.indexOf('@media (prefers-color-scheme: dark)'));
console.log('插入位置', mediaEnd, '媒体查询收尾', mEnd, '外部插入:', mediaEnd >= mEnd);
console.log('花括号平衡', (check.match(/\{/g) || []).length, (check.match(/\}/g) || []).length);
