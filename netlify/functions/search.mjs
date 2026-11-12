/* GET /api/search?q=&city= — 联网检索（博查 → Tavily → 搜狗 → 360 → 搜狗微信 → Bing）
 * 结果先按相关性过滤；抓不到相关结果就明确说抓不到，不返回噪音。 */
import { json, fail, envOf, PLUGINS, cached } from './_shared.mjs';
import { doSearch, withTimeout } from '../../lib/core.js';

export const config = { path: '/api/search' };

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!q) return fail(400, '缺少 q');

  const query = city && !q.includes(city) ? city + ' ' + q : q;
  try {
    const out = await cached('search|' + query, 300, async () => {
      const r = await withTimeout(doSearch(query, { wechat: true }, envOf(), PLUGINS), 8500, '检索');
      return { ok: r.ok, via: r.via, query, results: r.results || [], reason: r.reason || '' };
    });
    return json(out);
  } catch (e) {
    return fail(504, '检索失败：' + (e && e.message ? e.message : String(e)));
  }
};
