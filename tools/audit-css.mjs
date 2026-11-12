// 找出 ui.js 用到、但 app.css 里没定义的 class
import fs from 'node:fs';
const ui = fs.readFileSync('src/js/ui.js', 'utf8');
const css = fs.readFileSync('src/css/app.css', 'utf8');
const set = new Set();
for (const m of ui.matchAll(/class:\s*'([^']+)'/g)) m[1].split(/\s+/).forEach(c => c && !c.includes('+') && set.add(c));
for (const m of ui.matchAll(/class="([a-z0-9\- ]+)"/g)) m[1].split(/\s+/).forEach(c => c && set.add(c));
for (const m of ui.matchAll(/className\s*=\s*'([^']+)'/g)) m[1].split(/\s+/).forEach(c => c && set.add(c));
const miss = [...set].filter(c => !new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css));
console.log('used:', set.size, 'missing:', miss.length);
console.log(miss.sort().join('\n'));
