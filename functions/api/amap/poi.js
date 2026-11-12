/* GET /api/amap/poi?keywords=&city= — 高德 POI 检索代理
 *
 * 为什么要在服务端转一手：高德 Key 有「安全密钥 + 域名白名单」，放在页面里等于公开。
 * 放在环境变量里，前端只调自己的域名，Key 不落地到浏览器。
 * 返回给前端的坐标是 GCJ-02（高德的口径），前端用 GEO.gcj2wgs 转回 WGS-84 再入库。
 */
import { json, fail, preflight, PLUGINS, cached } from '../../_lib.js';
import { fetchPage, withTimeout } from '../../../lib/core.js';

export const onRequestOptions = () => preflight();

export const onRequestGet = async ({ request, env, ctx }) => {
  const key = env && env.AMAP_KEY;
  if (!key) return fail(400, '服务端没有设置 AMAP_KEY');

  const url = new URL(request.url);
  const kw = (url.searchParams.get('keywords') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!kw) return fail(400, '缺少 keywords');

  const target = 'https://restapi.amap.com/v3/place/text?key=' + encodeURIComponent(key) +
    '&keywords=' + encodeURIComponent(kw) +
    '&city=' + encodeURIComponent(city) +
    '&citylimit=false&offset=20&page=1&extensions=base';

  try {
    const out = await cached(ctx, 'amap|' + city + '|' + kw, 600, async () => {
      const r = await withTimeout(fetchPage(target, { timeout: 12000, accept: 'application/json' }, PLUGINS), 15000, '高德检索');
      const data = JSON.parse(r.text);
      return {
        ok: data.status === '1',
        count: Number(data.count || 0),
        pois: (data.pois || []).map((p) => ({
          name: p.name,
          address: typeof p.address === 'string' ? p.address : '',
          lat: Number((p.location || ',')[1]),
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
