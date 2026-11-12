/* 临时诊断接口：在真实运行环境里逐个看引擎对「政府站限定检索」的返回。
 * 一次只跑一个引擎（?only=bing|360|sogou|weixin），避免整体超 10 秒。用完即删。 */
import { json } from './_shared.mjs';
import { bingSearch, so360Web, sogouWeb, sogouWeixin, hostOfSafe, withTimeout } from '../../lib/core.js';

export const config = { path: '/api/dbg-engines' };

const ENGINES = {
  bing: (q) => bingSearch(q, true, {}),
  '360': (q) => so360Web(q, true, {}),
  sogou: (q) => sogouWeb(q, false, {}),
  weixin: (q) => sogouWeixin(q, {})
};

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '翠湖公园 门票').trim();
  const only = (url.searchParams.get('only') || 'bing').trim();
  const fn = ENGINES[only];
  if (!fn) return json({ ok: false, reason: 'only 只能是 ' + Object.keys(ENGINES).join(' / ') }, 400);

  const t0 = Date.now();
  try {
    const list = await withTimeout(fn(q), 6500, only);
    return json({
      ok: true, engine: only, q, ms: Date.now() - t0,
      n: (list || []).length,
      top: (list || []).slice(0, 6).map((x) => hostOfSafe(x.url) + ' | ' + String(x.title).slice(0, 46))
    });
  } catch (e) {
    return json({ ok: false, engine: only, q, ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 160) });
  }
};
