/* GET /api/page?url= — 抓单个网页正文
 * 带 SSRF 白名单（只允许公网 http/https）与体积上限；用于「核实入口」里把原页打开成文字。
 */
import { json, fail, preflight, PLUGINS, cached } from '../_lib.js';
import { fetchPage, htmlToText, clip, withTimeout } from '../../lib/core.js';

export const onRequestOptions = () => preflight();

export const onRequestGet = async ({ request, ctx }) => {
  const url = new URL(request.url);
  const target = (url.searchParams.get('url') || '').trim();
  if (!target) return fail(400, '缺少 url');
  if (!/^https?:\/\//i.test(target)) return fail(400, '只接受 http/https 链接');

  try {
    const out = await cached(ctx, 'page|' + target, 3600, async () => {
      const r = await withTimeout(fetchPage(target, { timeout: 15000 }, PLUGINS), 18000, '页面抓取');
      if (!r.ok) throw new Error('目标返回 ' + r.status);
      const title = (String(r.text).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
      return {
        ok: true,
        url: r.url,
        title: clip(htmlToText(title), 160),
        text: clip(htmlToText(r.text), 6000)
      };
    });
    return json(out);
  } catch (e) {
    return fail(502, e && e.message ? e.message : String(e));
  }
};
