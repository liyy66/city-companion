/* GET /api/amap/poi?keywords=&city= — 高德 POI 检索代理
 *
 * 为什么在服务端转一手：高德 Key 有「安全密钥 + 域名白名单」，放页面里等于公开。
 * 返回给前端的坐标是 GCJ-02（高德口径），前端用 GEO.gcj2wgs 转回 WGS-84 再入库。 */
import { json, fail, envOf, PLUGINS, cached } from './_shared.mjs';
import { fetchPage, withTimeout } from '../../lib/core.js';

export const config = { path: '/api/amap/poi' };

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const key = envOf().AMAP_KEY;
  if (!key) return fail(400, '服务端没有设置 AMAP_KEY');

  const url = new URL(req.url);
  const kw = (url.searchParams.get('keywords') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!kw) return fail(400, '缺少 keywords');

  const target = 'https://restapi.amap.com/v3/place/text?key=' + encodeURIComponent(key) +
    '&keywords=' + encodeURIComponent(kw) +
    '&city=' + encodeURIComponent(city) +
    '&citylimit=false&offset=20&page=1&extensions=base';

  try {
    const out = await cached('amap|' + city + '|' + kw, 600, async () => {
      const r = await withTimeout(fetchPage(target, { timeout: 6000, accept: 'application/json' }, PLUGINS), 8000, '高德检索');
      const data = JSON.parse(r.text);
      return {
        ok: data.status === '1',
        count: Number(data.count || 0),
        pois: (data.pois || []).map((p) => ({
          name: p.name,
          address: typeof p.address === 'string' ? p.address : '',
          lat: Number((p.location || ',').split(',')[1]),
          lng: Number((p.location || ',').split(',')[0]),
          tel: typeof p.tel === 'string' ? p.tel : '',
          type: typeof p.type === 'string' ? p.type : ''
        })).filter((p) => isFinite(p.lat) && isFinite(p.lng)),
        reason: data.status === '1' ? '' : (data.info || '高德返回失败')
      };
    });
    return json(out);
  } catch (e) {
    return fail(502, e && e.message ? e.message : String(e));
  }
};
