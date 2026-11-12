/* functions/_lib.js — Pages Functions 的公共层
 *
 * 这里只做「运行时适配」：把 workerd 的能力（HTMLRewriter、Cache API、KV）接到
 * lib/core.js 那套与运行时无关的检索/抽取逻辑上。业务规则一律不在这里重复实现。
 *
 * 文件名以下划线开头，Pages 路由会忽略它，所以可以直接被 import。
 */

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store'
};

export function json(data, code = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: { ...JSON_HEADERS, ...extra }
  });
}

export const fail = (code, reason) => json({ ok: false, reason }, code);

export function preflight() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

/** 把环境变量收成一个普通对象交给 core（Workers 里没有 process.env） */
export function envOf(env) {
  return {
    BOCHA_API_KEY: env && env.BOCHA_API_KEY,
    TAVILY_API_KEY: env && env.TAVILY_API_KEY,
    AMAP_KEY: env && env.AMAP_KEY,
    MODEL_BASE_URL: env && env.MODEL_BASE_URL,
    MODEL_NAME: env && env.MODEL_NAME,
    MODEL_API_KEY: env && env.MODEL_API_KEY
  };
}

/**
 * 用 HTMLRewriter 读正文 —— 关键原因是 **workerd 的 TextDecoder 只支持 UTF-8**，
 * 而不少地方政府站还是 GBK/GB2312。HTMLRewriter 是原生解析器，会按 content-type /
 * <meta charset> 正确解码，同时顺便把导航、脚本、页脚剥掉，JS 侧只做文本拼接，CPU 更省。
 */
const DROP = 'script, style, noscript, nav, header, footer, aside, form, iframe, svg';
const BREAK = 'p, div, li, h1, h2, h3, h4, h5, h6, tr, td, section, article, br';

export async function readTextRewriter(res, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (!ct.includes('html')) {
    // JSON / 纯文本：直接读，API 都是 UTF-8
    const t = await res.text();
    return t.length > 3 * 1024 * 1024 ? t.slice(0, 3 * 1024 * 1024) : t;
  }
  const parts = [];
  let size = 0;
  const limit = 400 * 1024; // 只看前 400KB，超过就没必要继续解析了
  await new HTMLRewriter()
    .on(DROP, { element(el) { el.remove(); } })
    .on(BREAK, { element() { if (size < limit) parts.push('\n'); } })
    .on('body', {
      text(chunk) {
        if (size >= limit) return;
        size += chunk.text.length;
        parts.push(chunk.text);
      }
    })
    .transform(res)
    .arrayBuffer();
  return parts.join('');
}

export const PLUGINS = { readText: readTextRewriter };

/** Cache API 包一层：官方页面与检索结果都没必要每次重算，也帮免费版省 CPU */
export async function cached(ctx, key, ttl, produce) {
  try {
    const cache = caches.default;
    const req = new Request('https://ax-cache.internal/' + encodeURIComponent(key));
    const hit = await cache.match(req);
    if (hit) {
      const body = await hit.json();
      return { ...body, cached: true };
    }
    const fresh = await produce();
    const put = new Response(JSON.stringify(fresh), {
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + ttl }
    });
    // 不阻塞响应；Pages Functions 提供 ctx.waitUntil
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(req, put));
    else await cache.put(req, put);
    return fresh;
  } catch {
    return produce();
  }
}

/* ---------------- 简单限流（绑了 KV 才生效） ---------------- */

export async function rateLimit(env, request, bucket, limit, windowSec) {
  const kv = env && env.AX_KV;
  if (!kv) return { ok: true, skipped: true };
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  const key = 'rl:' + bucket + ':' + ip + ':' + slot;
  try {
    const raw = await kv.get(key);
    const n = raw ? Number(raw) : 0;
    if (n >= limit) return { ok: false, used: n, limit };
    await kv.put(key, String(n + 1), { expirationTtl: windowSec + 60 });
    return { ok: true, used: n + 1, limit };
  } catch {
    return { ok: true, skipped: true };
  }
}

/** 只允许同站点调用（POST 时浏览器会带 Origin）；preview 域名也算同站 */
export function sameSite(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return true; // curl / 服务端调用
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function chatUrlOf(baseUrl) {
  const u = String(baseUrl || '').replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(u) ? u : u + '/chat/completions';
}

export function timeoutSignal(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

export async function readJson(request) {
  const raw = await request.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('请求体不是合法 JSON'); }
}
