import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[·・]/g, '');
const strip = (s) => String(s || '').replace(/(特别行政区|自治州|自治县|自治区|地区|盟|市辖区|市|县|区|旗)$/, '');
const byLv = {};
for (const c of a.cities) if (!c.ad) byLv[c.l] = (byLv[c.l] || 0) + 1;
console.log('无 adcode 按层级:', byLv);
const names = new Map();
for (const x of a.admin) { const k = norm(x[1]); if (!names.has(k)) names.set(k, x); }
const noAd = a.cities.filter((c) => !c.ad);
console.log('样例 12 条:');
for (const c of noAd.slice(0, 12)) {
  const hit = names.get(norm(c.n)) || names.get(norm(strip(c.n)));
  console.log(` ${c.l.padEnd(11)} ${c.n} (${c.p}) → ${hit ? hit[0] + ' ' + hit[1] + ' d=' + (Math.abs(hit[5] - c.lat) + Math.abs(hit[4] - c.lng)).toFixed(2) : '无同名'}`);
}
// 统计按名字/去后缀能命中的比例
let m1 = 0, m2 = 0;
for (const c of noAd) { if (names.has(norm(c.n))) m1++; else if (names.has(norm(strip(c.n)))) m2++; }
console.log({ 同名命中: m1, 去后缀命中: m2, 总数: noAd.length });
