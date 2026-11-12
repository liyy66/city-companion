// 从原始单文件作品中抽取结构化数据，压缩成应用可用的 atlas.json
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'index-原始.html';
const OUT = 'data';
fs.mkdirSync(OUT, { recursive: true });

const txt = fs.readFileSync(SRC, 'utf8');
const m = /<script id="atlasEmbeddedData"[^>]*>/.exec(txt);
const data = JSON.parse(txt.slice(m.index + m[0].length, txt.indexOf('</script>', m.index)));

// ---------- 城市（GeoNames 3,949 条） ----------
const SHORT = { 特别行政区: '', 自治州: '', 地区: '', 盟: '' };
const cities = data.cities.cities.map(c => {
  let name = String(c.name || '').trim();
  let level = c.level || 'city';
  // 地名后缀规范化：张家界市/张家界 统一
  const aliases = (c.aliases || []).map(a => String(a).trim()).filter(a => a && a !== name);
  return {
    n: name,
    p: String(c.province || '').replace(/省$/, '').replace(/市$/, ''),
    lat: Math.round(c.lat * 1e5) / 1e5,
    lng: Math.round(c.lng * 1e5) / 1e5,
    l: level,
    a: aliases.length ? aliases.slice(0, 4) : undefined,
  };
});

// ---------- 精选景点卡 ----------
const norm = s => String(s || '').replace(/\s+/g, '');
const placeMap = new Map();
function addPlace(item, city, kind) {
  if (!item || !item.name) return;
  const key = norm(item.name);
  const prev = placeMap.get(key);
  const price = item.price ? { t: item.price.text || '', s: item.price.source || '', d: item.price.asOf || '' } : null;
  const hours = item.hours ? { t: item.hours.text || '', s: item.hours.source || '', d: item.hours.asOf || '' } : null;
  const crowd = item.crowd ? { t: item.crowd.text || '', s: item.crowd.source || '', d: item.crowd.asOf || '' } : null;
  const rec = {
    id: item.id || key,
    n: item.name,
    city,
    d: item.district ? String(item.district).replace(/(区|县|市)$/, '') : undefined,
    lat: Math.round(item.lat * 1e5) / 1e5,
    lng: Math.round(item.lng * 1e5) / 1e5,
    cat: item.category || '景点',
    desc: item.description || '',
    hl: (item.highlights || []).slice(0, 6),
    price, hours, crowd,
    src: (item.sources || []).slice(0, 4).map(s => ({ t: s.title, u: s.url })),
    kind,
  };
  if (prev) {
    // 同一景点在不同城市数据里出现：合并更完整的一份
    const merged = { ...prev, ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
    merged.hl = [...new Set([...(prev.hl || []), ...(rec.hl || [])])].slice(0, 6);
    merged.src = dedupeSrc([...(prev.src || []), ...(rec.src || [])]);
    placeMap.set(key, merged);
  } else {
    placeMap.set(key, rec);
  }
}
function dedupeSrc(list) {
  const seen = new Set();
  return list.filter(s => s && s.u && !seen.has(s.u) && seen.add(s.u)).slice(0, 4);
}
for (const [city, list] of Object.entries(data.attractions.cities)) {
  for (const item of list) addPlace(item, city, 'curated');
}
for (const [city, list] of Object.entries(data['extra-curated'].cities)) {
  for (const item of list) addPlace(item, city, 'expanded');
}
const places = [...placeMap.values()];

// ---------- 官方游记事实（昆明） ----------
const guide = {};
for (const [city, list] of Object.entries(data['travel-guide'].cities || {})) {
  guide[city] = list.map(it => ({
    n: it.name,
    a: (it.aliases || []).filter(Boolean).slice(0, 4),
    off: it.official || null,
    f: Object.fromEntries(Object.entries(it.facts || {}).map(([k, v]) => [k, {
      a: v.answer || '',
      t: v.title || '',
      u: v.url || '',
      d: v.publishedAt || '',
    }])),
  }));
}

// ---------- 县域景区名称索引 ----------
const counties = {};
for (const [county, info] of Object.entries(data.countyHighlights.counties || {})) {
  counties[county] = {
    p: String(info.province || '').replace(/省$/, '').replace(/市$/, ''),
    s: (info.spots || []).slice(0, 12).map(s => ({ n: s.name, c: s.category || '', t: s.note || '' })),
  };
}

// ---------- 全国 POI（OSM，压缩为 [name,lat,lng,cat]） ----------
const CAT = {
  attraction: '景点', museum: '博物馆', viewpoint: '观景点', theme_park: '主题公园', zoo: '动物园',
  castle: '古堡', monument: '历史人文', memorial: '纪念地', archaeological: '遗址', ruins: '遗址',
  park: '公园', garden: '园林', artwork: '公共艺术', fort: '历史人文', battlefield: '历史遗迹',
  protected_area: '自然风光', cave_entrance: '洞穴',
};
const keep = new Set(['attraction', 'museum', 'viewpoint', 'theme_park', 'zoo', 'castle', 'monument', 'memorial', 'archaeological', 'ruins', 'fort', 'battlefield', 'protected_area', 'cave_entrance', 'garden', 'artwork']);
const pois = [];
const seenPoi = new Set();
let parkKept = 0;
for (const it of data['osm-national-pois'].items || []) {
  const cat = it.category;
  const isPark = cat === 'park';
  if (!isPark && !keep.has(cat)) continue;
  const name = String(it.name || '').trim();
  if (!name || name.length > 26 || seenPoi.has(name + it.lat)) continue;
  if (!/[\u4e00-\u9fa5]/.test(name)) continue;
  if (isPark && parkKept > 3200) continue;
  if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) continue;
  seenPoi.add(name + it.lat);
  if (isPark) parkKept++;
  pois.push([name, Math.round(it.lat * 1e4) / 1e4, Math.round(it.lng * 1e4) / 1e4, CAT[cat] || '景点']);
}

// ---------- 官方提示（refs） ----------
const refs = [];
{
  const s09 = fs.readFileSync('parts-index/s09.js', 'utf8');
  const mm = /const refs = (\[[\s\S]*?\]);/.exec(s09);
  if (mm) {
    const arr = JSON.parse(mm[1]);
    for (const r of arr) refs.push({ id: r.id, city: r.city, t: r.title, u: r.url, d: r.publishedAt || '', s: r.summary || '', topics: r.topics || [], kind: r.kind || '官方资料' });
  }
}

// ---------- 照片 ----------
const photoAssets = data.photoAssets || {};
const albums = data['photo-albums']?.albums || {};
const photos = {};
const assetFiles = [];
for (const [placeId, list] of Object.entries(albums)) {
  const items = [];
  for (const p of list) {
    const src = p.src;
    const b64 = photoAssets[src];
    if (!b64) continue;
    const file = 'photos/' + path.basename(src).replace(/\.(jpe?g|png)$/i, '') + '.webp';
    items.push({ f: file, t: p.caption || p.title || '', a: p.author || '', lic: p.license || '', u: p.source || '' });
    if (!assetFiles.some(x => x.file === file)) assetFiles.push({ file, b64 });
  }
  if (items.length) photos[placeId] = items.slice(0, 4);
}
// 旧版 photos 映射（按景点名）
const legacyPhotos = {};
for (const [name, p] of Object.entries(data.photos || {})) {
  const b64 = photoAssets[p.src];
  if (!b64) continue;
  const file = 'photos/' + path.basename(p.src).replace(/\.(jpe?g|png)$/i, '') + '.webp';
  legacyPhotos[name] = { f: file, t: p.title || '', a: p.author || '', lic: p.license || '', u: p.source || '' };
  if (!assetFiles.some(x => x.file === file)) assetFiles.push({ file, b64 });
}

// ---------- 行政区划（DataV all.json，用于任意城市边界/区县） ----------
const adminPath = path.join(OUT, 'admin.json');
let admin = [];
if (fs.existsSync(adminPath)) {
  admin = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
} else {
  const r = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/all.json', { signal: AbortSignal.timeout(30000) });
  const arr = await r.json();
  admin = arr.map(x => [x.adcode, x.name, x.level, x.parent, Math.round(x.lng * 1e4) / 1e4, Math.round(x.lat * 1e4) / 1e4]);
  fs.writeFileSync(adminPath, JSON.stringify(admin));
}
// 城市 → adcode 解析：按名称+省份精确匹配（province 级 parent 匹配）
const byNameLevel = new Map();
for (const [adcode, name, level, parent] of admin) {
  for (const lv of ['city', 'district', 'province']) {
    const k = lv + '|' + name.replace(/(市|区|县|自治州|地区|盟)$/, '');
    if (!byNameLevel.has(k)) byNameLevel.set(k, []);
    byNameLevel.get(k).push({ adcode, level, parent });
  }
}
const provinceByAdcode = new Map(admin.filter(a => a[2] === 'province').map(a => [a[0], a[1].replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)/g, '')]));
let resolved = 0;
for (const c of cities) {
  const base = c.n.replace(/(市|区|县|自治州|地区|盟)$/, '');
  const cands = byNameLevel.get('city|' + base) || byNameLevel.get('district|' + base) || [];
  if (!cands.length) continue;
  let pick = cands[0];
  if (cands.length > 1) {
    const prov = c.p.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)/g, '');
    const hit = cands.find(x => {
      const p = admin.find(a => a[0] === x.parent);
      return p && (p[1].includes(prov) || prov.includes(p[1].replace(/(省|市|自治区)/g, '')));
    });
    if (hit) pick = hit;
  }
  c.ad = pick.adcode;
  resolved++;
}

// ---------- 矢量底图（重庆 / 昆明街区） ----------
const vector = {};
if (data['chongqing-vector']) vector['重庆'] = data['chongqing-vector'];
for (const [city, gj] of Object.entries(data['city-street-maps'].cities || {})) {
  if (!vector[city]) vector[city] = gj;
}

const atlas = {
  schema: 2,
  builtAt: '2026-11-11',
  attribution: {
    base: { name: '高德地图', url: 'https://www.amap.com/' },
    boundary: { name: 'DataV.GeoAtlas', url: 'https://datav.aliyun.com/portal/school/atlas/area_selector' },
    poi: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' },
    city: { name: 'GeoNames', url: 'https://www.geonames.org/', license: 'CC BY 4.0' },
    photo: { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/' },
  },
  cities,
  admin,
  places,
  guide,
  counties,
  pois,
  refs,
  photos,
  legacyPhotos,
  vector,
};

fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(atlas));
fs.mkdirSync(path.join(OUT, 'photos'), { recursive: true });
fs.writeFileSync(path.join(OUT, '_photos.json'), JSON.stringify(assetFiles));
console.log('cities', cities.length, 'adcode resolved', resolved);
console.log('places', places.length, 'pois', pois.length, 'photos', assetFiles.length);
console.log('admin', admin.length, 'refs', refs.length);
console.log('atlas.json bytes', fs.statSync(path.join(OUT, 'atlas.json')).size);
