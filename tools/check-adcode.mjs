// 统计 adcode 覆盖率（与 src/js/data.js 的补齐逻辑保持一致）
import fs from 'node:fs';
const a = JSON.parse(fs.readFileSync(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[·・]/g, '');
const strip = (s) => String(s || '').replace(/(特别行政区|自治州|自治县|自治区|地区|盟|市辖区|市|县|区|旗)$/, '');
const SPECIAL = { 香港: 810000, 澳门: 820000, 台北: 710000, 新北: 710000, 桃园: 710000, 台中: 710000, 台南: 710000, 高雄: 710000, 基隆: 710000, 新竹: 710000, 嘉义: 710000 };
const byName = new Map();
for (const x of a.admin || []) {
  if (!x || !x[0] || !x[1]) continue;
  const k = norm(x[1]);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push({ adcode: x[0], name: x[1], lat: +x[5], lng: +x[4] }); // [adcode,name,level,parent,lng,lat]
}
let have = 0, special = 0, byname = 0, still = 0;
const demos = [];
for (const c of a.cities) {
  if (c.ad) { have++; continue; }
  if (SPECIAL[c.n]) { special++; continue; }
  const cands = (byName.get(norm(c.n)) || []).concat(byName.get(norm(strip(c.n))) || []);
  let best = null, bestD = Infinity;
  for (const k of cands) {
    const d = Math.abs(k.lat - c.lat) + Math.abs(k.lng - c.lng);
    if (d < bestD) { bestD = d; best = k; }
  }
  if (best && bestD <= 1.5) { byname++; if (demos.length < 5) demos.push(`${c.n} → ${best.name}(${best.adcode})`); }
  else still++;
}
console.log({
  total: a.cities.length, have, special, byname, still,
  coverage: (((have + special + byname) / a.cities.length) * 100).toFixed(1) + '%'
});
if (demos.length) console.log('同名补齐样例:', demos.join(' | '));
