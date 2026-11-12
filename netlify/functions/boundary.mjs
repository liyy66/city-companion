/* GET /api/boundary?adcode=500000 — 行政边界代理（DataV.GeoAtlas，GCJ-02）
 *
 * 为什么必须转一手：DataV 按 Referer 拦，从第三方域名直连会返回 403。
 * 浏览器在页面里 request 时会带 Referer=你的站点，服务端 fetch 不带，于是正常。
 *
 * 返回的是原始 GeoJSON（不是包一层 JSON），前端 NET.boundary 会直接用。
 * 边界数据基本不变，缓存 1 天。 */
import { json, fail, cached } from './_shared.mjs';
import { fetchPage, withTimeout } from '../../lib/core.js';

export const config = { path: '/api/boundary' };

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const adcode = (new URL(req.url).searchParams.get('adcode') || '').trim();
  if (!/^\d{6}$/.test(adcode)) return fail(400, 'adcode 必须是 6 位数字');

  try {
    const out = await cached('boundary|' + adcode, 86400, async () => {
      const urls = [
        'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '_full.json',
        'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '.json'
      ];
      for (const u of urls) {
        try {
          const r = await withTimeout(fetchPage(u, { timeout: 6000, accept: 'application/json' }, {}), 7500, '边界');
          if (!r.ok) continue;
          const geo = JSON.parse(r.text);
          if (geo && geo.type) return geo;
        } catch (e) { /* 试下一个 */ }
      }
      throw new Error('没能取到 ' + adcode + ' 的边界数据');
    });
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=86400'
      }
    });
  } catch (e) {
    return fail(502, e && e.message ? e.message : String(e));
  }
};
