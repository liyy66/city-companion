import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
console.log('admin sample:', JSON.stringify(a.admin.slice(0, 3)));
const noAd = a.cities.filter((c) => !c.ad).slice(0, 5);
console.log('no-ad cities:', JSON.stringify(noAd));
const names = new Set(a.admin.map((x) => x[1]));
for (const c of noAd) console.log(c.n, '在 admin 里?', names.has(c.n));
console.log('admin 名称前缀示例:', a.admin.slice(0, 12).map((x) => x[1]));
