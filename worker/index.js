/* worker/index.js — 新版 Cloudflare 部署入口（Workers + 静态资源）
 *
 * 背景：Cloudflare 现在把「静态站点 + 函数」合并成 Worker 形态，Pages 变成旧版流程。
 * 这个文件让同一套代码两种部署方式都能跑：
 *   - 旧版 Pages：直接把 functions/ 当 Pages Functions，不用这个文件；
 *   - 新版 Workers：`npx wrangler deploy` 时以本文件为入口，/api/* 走下面的路由，
 *     其余请求交给静态资源绑定 env.ASSETS（目录在 wrangler.toml 的 [assets] 里）。
 *
 * 路由本身不写业务逻辑：直接复用 functions/api/*.js 里的 onRequestGet / onRequestPost，
 * 保证线上（Worker）与本地（node server.mjs）、旧版 Pages 三处行为完全一致。
 */
import * as health from '../functions/api/health.js';
import * as search from '../functions/api/search.js';
import * as official from '../functions/api/official.js';
import * as page from '../functions/api/page.js';
import * as boundary from '../functions/api/boundary.js';
import * as poi from '../functions/api/amap/poi.js';
import * as chat from '../functions/api/chat.js';

const ROUTES = [
  { path: '/api/health', mod: health },
  { path: '/api/search', mod: search },
  { path: '/api/official', mod: official },
  { path: '/api/page', mod: page },
  { path: '/api/boundary', mod: boundary },
  { path: '/api/amap/poi', mod: poi },
  { path: '/api/chat', mod: chat }
];

function jsonBody(code, data) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-allow-methods': 'GET, POST, OPTIONS'
        }
      });
    }

    const route = ROUTES.find((r) => r.path === path);
    if (route) {
      const handler = request.method === 'POST' ? route.mod.onRequestPost : route.mod.onRequestGet;
      if (!handler) return jsonBody(405, { ok: false, reason: '这个接口不支持 ' + request.method });
      // Pages Functions 的 context 就是 { request, env, ctx }，Worker 里直接对齐
      return handler({ request, env, ctx, params: {}, data: {}, next: () => jsonBody(404, { ok: false, reason: '未匹配' }) });
    }

    if (path.startsWith('/api/')) {
      return jsonBody(404, { ok: false, reason: '没有这个接口：' + path });
    }

    // 静态资源：dist/ 已由 node tools/build.mjs 生成（含 index.html 与 城市安心游.html）
    if (!env.ASSETS) {
      return new Response('静态资源未绑定：请在 wrangler.toml 里配置 [assets] directory = "./dist"', { status: 500 });
    }
    return env.ASSETS.fetch(request);
  }
};
