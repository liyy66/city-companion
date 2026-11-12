/* GET /api/official?q=&city= — 官方渠道优先
 *
 * 只认 .gov.cn 的结果，抓到页面后抽正文，交给模型当「最高优先级证据」。
 * 这一层也是免费版 10ms CPU 的风险点，所以：
 *   1) 有博查 Key 时走 API（JSON，不解析 HTML，CPU 几乎为 0）；
 *   2) 结果整体缓存 30 分钟，同一问题第二次几乎零成本；
 *   3) 正文用 HTMLRewriter 抽取（原生解析，同时解决 GBK 页面解码问题）。
 */
import { json, fail, preflight, envOf, PLUGINS, cached } from '../_lib.js';
import { officialDigest, withTimeout } from '../../lib/core.js';

export const onRequestOptions = () => preflight();

export const onRequestGet = async ({ request, env, ctx }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();
  if (!q) return fail(400, '缺少 q');

  try {
    const out = await cached(ctx, 'official|' + city + '|' + q, 1800, async () => {
      const r = await withTimeout(officialDigest(q, city, envOf(env), PLUGINS), 25000, '官方渠道查询');
      return r;
    });
    return json(out);
  } catch (e) {
    return fail(504, '官方渠道查询失败：' + (e && e.message ? e.message : String(e)));
  }
};
