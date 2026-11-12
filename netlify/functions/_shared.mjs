/* netlify/functions/_shared.mjs — Netlify Functions 的公共层
 *
 * 和 functions/_lib.js（Cloudflare 版）做同一件事：把运行时差异接上 lib/core.js，
 * 业务逻辑一行都不在这里重复。两者差别只有三点：
 *   1) Node 有 process.env，不需要 envOf(env) 那层转手；
 *   2) Node 的 TextDecoder 支持 gbk，所以不需要 HTMLRewriter 兜底（PLUGINS 传空对象）；
 *   3) 没有 Cache API / KV，缓存用进程内 Map（实例热着就有效），限流同理。
 */

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store'
};

export function json(data, code = 200) {
  return new Response(JSON.stringify(data), { status: code, headers: JSON_HEADERS });
}

export const fail = (code, reason) => json({ ok: false, reason }, code);

export function preflight() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

/** Node 环境变量 → core 期望的字段名（保持一致，前端不用区分平台） */
export function envOf(env = process.env) {
  return {
    BOCHA_API_KEY: env.BOCHA_API_KEY,
    TAVILY_API_KEY: env.TAVILY_API_KEY,
    AMAP_KEY: env.AMAP_KEY,
    MODEL_BASE_URL: env.MODEL_BASE_URL,
    MODEL_NAME: env.MODEL_NAME,
    MODEL_API_KEY: env.MODEL_API_KEY
  };
}

/** Node 下 fetchPage 自带的 charset 嗅探就够用，这里不替换解码器 */
export const PLUGINS = {};

/* ---------------- 进程内缓存：官方页面/检索结果没必要每次重算 ---------------- */

const store = new Map();
const MAX_ENTRIES = 120;

export function cached(key, ttlSec, produce) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return Promise.resolve({ ...hit.val, cached: true });

  return Promise.resolve()
    .then(produce)
    .then((val) => {
      if (store.size > MAX_ENTRIES) {
        // 简单淘汰：清掉最早插入的一批，不做 LRU 排序（够用且便宜）
        const drop = [...store.keys()].slice(0, 40);
        drop.forEach((k) => store.delete(k));
      }
      store.set(key, { val, exp: now + ttlSec * 1000 });
      return val;
    });
}

/* ---------------- 简单限流（进程内，实例重建即清零） ---------------- */

const hits = new Map();

export function rateLimit(req, bucket, limit, windowSec, context) {
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  const key = bucket + '|' + ip + '|' + slot;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 2000) hits.clear();
  return n <= limit ? { ok: true, used: n, limit } : { ok: false, used: n, limit };
}

/** 只允许同站点调用（POST 时浏览器会带 Origin）；curl / 服务端调用放行 */
export function sameSite(req) {
  const origin = req.headers.get('origin') || '';
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function chatUrlOf(baseUrl) {
  const u = String(baseUrl || '').replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(u) ? u : u + '/chat/completions';
}

export async function readJson(req) {
  const raw = await req.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

/** Netlify 的同步函数上限 10 秒，所有上游请求必须自己带超时 */
export function timeoutSignal(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}
