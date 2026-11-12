/* GET /api/official?q=&city= — 官方渠道优先
 *
 * 只认 .gov.cn 的结果，抓到页面后抽正文，作为「最高优先级证据」交给模型。
 * Netlify 同步函数上限 10 秒，所以这里把预算压到 8.5 秒并把结果缓存 30 分钟：
 * 同一问题第二次几乎零成本，也能避开节点被验证码拦的偶发情况。 */
import { json, fail, envOf, PLUGINS, cached } from './_shared.mjs';
import { officialDigest, withTimeout } from '../../lib/core.js';

export const config = { path: '/api/official' };

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!q) return fail(400, '缺少 q');

  try {
    const out = await cached('official|' + city + '|' + q, 1800, async () => {
      const r = await withTimeout(officialDigest(q, city, envOf(), PLUGINS), 8500, '官方渠道查询');
      return r;
    });
    return json(out);
  } catch (e) {
    return fail(504, '官方渠道查询失败：' + (e && e.message ? e.message : String(e)));
  }
};
