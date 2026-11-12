/* GET /api/boundary?adcode=500000 — 行政边界代理（DataV.GeoAtlas，GCJ-02）
 *
 * 为什么必须转一手：DataV 按 Referer 拦，浏览器从第三方域名直连会 403。
 * 服务端 fetch 不带 Referer，所以这里能正常取到；顺带缓存 1 天省回源。 */
import { json, fail, preflight } from '../_lib.js';
import { fetchPage, withTimeout } from '../../lib/core.js';

export const onRequestOptions = () => preflight();

export const onRequestGet = async ({ request }) => {
  const adcode = (new URL(request.url).searchParams.get('adcode') || '').trim();
  if (!/^\d{6}$/.test(adcode)) return fail(400, 'adcode 必须是 6 位数字');

  const cands = [
    'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '_full.json',
    'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '.json'
  ];
  for (const u of cands) {
    try {
      const r = await withTimeout(fetchPage(u, { timeout: 8000, accept: 'application/json' }), 9000, '边界');
      if (!r.ok) continue;
      const geo = JSON.parse(r.text);
      if (geo && geo.type) {
        return new Response(JSON.stringify(geo), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=86400'
          }
        });
      }
    } catch (e) { /* 试下一个 */ }
  }
  return json({ ok: false, reason: '没能取到 ' + adcode + ' 的边界数据' }, 502);
};
