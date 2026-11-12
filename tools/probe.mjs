const urls = [
 'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=3370&y=1756&z=12',
 'https://webst01.is.autonavi.com/appmaptile?style=6&x=3370&y=1756&z=12',
 'https://tile.openstreetmap.org/12/3370/1756.png',
 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
 'https://geo.datav.aliyun.com/areas_v3/bound/500000_full.json',
 'https://restapi.amap.com/v3/place/text?keywords=test',
 'https://zh.wikipedia.org/api/rest_v1/page/summary/%E9%87%8D%E5%BA%86'
];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(r.status, buf.length, r.headers.get('content-type'), r.headers.get('access-control-allow-origin'), u.slice(0, 90));
  } catch (e) { console.log('ERR', e.name, e.message.slice(0,80), u.slice(0,90)); }
}
