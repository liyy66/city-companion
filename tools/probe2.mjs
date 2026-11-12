const urls = [
 'https://geo.datav.aliyun.com/areas_v3/bound/all.json',
 'https://geo.datav.aliyun.com/areas_v3/bound/500100_full.json',
 'https://geo.datav.aliyun.com/areas_v3/bound/500103.json',
 'https://html.duckduckgo.com/html/?q=test',
 'https://www.bing.com/search?q=%E9%87%8D%E5%BA%86',
 'https://api.bochaai.com/v1/web-search',
 'https://api.tavily.com/search',
 'https://webapi.amap.com/maps?v=2.0&key=test',
 'https://m.amap.com/',
 'https://www.mct.gov.cn/',
 'https://weixin.sogou.com/weixin?type=2&query=%E9%87%8D%E5%BA%86',
 'https://api.zhihu.com/search_v3?t=general&q=test'
];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(9000) });
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(r.status, buf.length, (r.headers.get('content-type')||'').slice(0,30), 'cors=' + r.headers.get('access-control-allow-origin'), u.slice(0, 80));
  } catch (e) { console.log('ERR', e.name, (e.cause&&e.cause.code)||'', e.message.slice(0,60), u.slice(0,80)); }
}
