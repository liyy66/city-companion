/* 临时诊断接口：在真实运行环境（Netlify / 美国 IP）里看各引擎对「政府站限定检索」的返回。
 * 用完即删——它只读公开页面，不碰任何密钥。 */
import { json } from './_shared.mjs';
import { bingSearch, so360Web, sogouWeb, sogouWeixin, hostOfSafe } from '../../lib/core.js';

export const config = { path: '/api/dbg-engines' };

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const q = (new URL(req.url).searchParams.get('q') || '翠湖公园 门票').trim();
  const out = {};

  const wrap = async (name, fn) => {
    const t0 = Date.now();
    try {
      const list = await fn();
      out[name] = {
        ms: Date.now() - t0,
        n: (list || []).length,
        top: (list || []).slice(0, 4).map((x) => hostOfSafe(x.url) + ' | ' + String(x.title).slice(0, 40))
      };
    } catch (e) {
      out[name] = { ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 120) };
    }
  };

  await Promise.all([
    wrap('bingSiteGov', () => bingSearch(q, true, {})),
    wrap('360SiteGov', () => so360Web(q, true, {})),
    wrap('sogouPlain', () => sogouWeb(q, false, {})),
    wrap('weixin', () => sogouWeixin(q, {}))
  ]);

  return json({ ok: true, q, out });
};
