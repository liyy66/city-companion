#!/usr/bin/env node
/* server.mjs — 城市安心游 · 本地伴生服务（零依赖，Node 18+）
 *
 * 为什么需要它：
 *   浏览器里的页面不能直接跨域抓官网、不能带密钥调检索 API，也不该把模型 Key 写进
 *   HTML。这个服务放在本机跑，页面通过「设置 → 本地服务地址」连过来即可。
 *
 * 与线上版的关系：
 *   检索、正文抽取、相关性过滤都在 lib/core.js 里，Cloudflare Pages Functions 用的是同一份代码，
 *   所以本地怎么答，线上就是怎么答。这里只负责 HTTP、静态文件与模型代理。
 *
 * 提供的接口：
 *   GET  /api/health                   健康检查 + 当前可用能力
 *   GET  /api/search?q=&city=          联网检索（博查 → Tavily → 搜狗 → 360 → 搜狗微信 → Bing）
 *   GET  /api/official?q=&city=        官方渠道优先：只取 .gov.cn 结果并抓正文
 *   GET  /api/page?url=                抓单个网页正文（带 SSRF 白名单与体积上限）
 *   GET  /api/amap/poi?keywords=&city= 高德 POI 检索代理（Key 不必暴露给页面）
 *   POST /api/chat                     OpenAI 兼容的模型代理
 *
 * 环境变量（都可选）：
 *   PORT=8787  HOST=127.0.0.1
 *   MODEL_BASE_URL=https://api.deepseek.com/v1
 *   MODEL_NAME=deepseek-chat
 *   MODEL_API_KEY=sk-...
 *   MODEL_TIMEOUT_MS=180000   等模型回答的最长毫秒数（本机 4B 建议 180000~300000）
 *   BOCHA_API_KEY=sk-...   TAVILY_API_KEY=tvly-...   AMAP_KEY=...
 *
 * 用法：node server.mjs   然后浏览器打开 http://127.0.0.1:8787/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BODY, clip, htmlToText, fetchPage, withTimeout, doSearch, officialDigest } from './lib/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// 开发时页面在 dist/；发出去的部署包里 HTML 和 server.mjs 放在同一层，两种都要能跑。
const DIST = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

/* ---------------- 响应工具 ---------------- */

function json(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function fail(res, code, message) { json(res, code, { ok: false, reason: message }); }

/* ---------------- 静态文件 ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

/* 页面的模型配置可以由环境变量注入：这样 .bat 里写一次，双击打开就已经连上模型，不用进设置点。
   注意注入值优先于页面里保存的值（config.js 里 injected 覆盖 saved），要临时改就在 .bat 里改。 */
const SRV_CFG = (function () {
  const c = {};
  if (process.env.MODEL_BASE_URL) c.baseUrl = String(process.env.MODEL_BASE_URL).replace(/\/+$/, '');
  if (process.env.MODEL_NAME) c.model = String(process.env.MODEL_NAME);
  return c;
})();

let htmlCache = { mtime: 0, html: '' };

function mainHtml(file, cb) {
  fs.stat(file, (err, st) => {
    if (err) return cb(err);
    if (htmlCache.html && htmlCache.mtime === st.mtimeMs) return cb(null, htmlCache.html);
    fs.readFile(file, 'utf8', (e2, raw) => {
      if (e2) return cb(e2);
      let html = raw;
      if (Object.keys(SRV_CFG).length) {
        const tag = '\n<script>window.__CFG__=' + JSON.stringify(SRV_CFG) + ';</script>\n';
        html = html.includes('</head>') ? html.replace('</head>', tag + '</head>') : tag + html;
      }
      htmlCache = { mtime: st.mtimeMs, html };
      cb(null, html);
    });
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/城市安心游.html';
  const target = path.join(DIST, rel.replace(/^\/+/, ''));
  if (!target.startsWith(DIST)) return fail(res, 403, '越界路径');
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      // 目录或找不到：回退到主文件，方便直接访问 /
      if (rel !== '/城市安心游.html') return serveStatic(req, res, '/城市安心游.html');
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('还没有构建产物：先运行 node tools/build.mjs');
    }
    // 主页面走内存注入：把环境变量里的模型配置写进 window.__CFG__，
    // 双击 .bat 打开就已经连上本机/局域网模型，不必再进设置里填。其它静态文件仍直接流式返回。
    if (path.basename(target) === '城市安心游.html') {
      return mainHtml(target, (e2, html) => {
        if (e2) return fail(res, 500, '读取页面失败：' + e2.message);
        const buf = Buffer.from(html, 'utf8');
        res.writeHead(200, {
          'content-type': MIME['.html'], 'content-length': buf.length, 'cache-control': 'no-cache'
        });
        res.end(buf);
      });
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache'
    });
    fs.createReadStream(target).pipe(res);
  });
}

/* ---------------- 模型代理 ---------------- */

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('请求体过大');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('请求体不是合法 JSON'); }
}

// 本机/局域网跑的 4B 模型（CPU 或小显卡）生成 700~800 token 可能要几分钟，
// 60s 会把好端端的回答掐断，所以超时改成可配置，默认 3 分钟。
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 180000);

// 有人会把完整地址（.../v1/chat/completions）粘进来，这里统一收敛成 base。
function chatUrl(baseUrl) {
  const u = String(baseUrl || '').replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(u) ? u : u + '/chat/completions';
}

function modelConfig(body) {
  return {
    baseUrl: String(body.baseUrl || process.env.MODEL_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: body.apiKey || process.env.MODEL_API_KEY || '',
    model: body.model || process.env.MODEL_NAME || ''
  };
}

async function proxyChat(req, res) {
  const body = await readBody(req);
  const cfg = modelConfig(body);
  if (!cfg.baseUrl) return fail(res, 400, '没有配置模型接口地址');
  if (!cfg.model) return fail(res, 400, '没有配置模型名');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  try {
    const r = await fetch(chatUrl(cfg.baseUrl), {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {})
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: body.messages || [],
        temperature: body.temperature ?? 0.2,
        max_tokens: body.max_tokens || 700,
        stream: false
      })
    });
    const text = await r.text();
    if (!r.ok) return fail(res, 502, '模型返回 ' + r.status + '：' + clip(text, 300));
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store'
    });
    res.end(text);
  } catch (e) {
    fail(res, 504, '模型请求失败：' + (e.name === 'AbortError' ? '超时' : e.message));
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST + ':' + PORT));
  const p = url.pathname;
  const q = (url.searchParams.get('q') || '').trim();
  const city = (url.searchParams.get('city') || '').trim();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization'
    });
    return res.end();
  }

  try {
    if (p === '/api/health') {
      return json(res, 200, {
        ok: true,
        service: 'anxin-trip',
        version: 2,
        now: new Date().toISOString(),
        capabilities: {
          search: process.env.BOCHA_API_KEY ? 'bocha' : (process.env.TAVILY_API_KEY ? 'tavily' : 'html'),
          official: true,
          chat: !!modelConfig({}).baseUrl,
          amap: !!process.env.AMAP_KEY,
          model: modelConfig({}).model || '',
          rateLimit: false
        }
      });
    }

    if (p === '/api/search') {
      if (!q) return fail(res, 400, '缺少 q');
      const r = await withTimeout(doSearch(q, { wechat: true }, process.env), 20000, '检索');
      return json(res, 200, { ok: r.ok, via: r.via, query: q, results: r.results, reason: r.reason || '' });
    }

    if (p === '/api/official') {
      if (!q) return fail(res, 400, '缺少 q');
      const r = await withTimeout(officialDigest(q, city, process.env), 25000, '官方渠道查询');
      return json(res, 200, r);
    }

    if (p === '/api/boundary') {
      // DataV 按 Referer 拦（第三方域名直连会 403），这里转一手：服务端没有 Referer
      const adcode = url.searchParams.get('adcode') || '';
      if (!/^\d{6}$/.test(adcode)) return fail(res, 400, 'adcode 必须是 6 位数字');
      const cands = [
        'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '_full.json',
        'https://geo.datav.aliyun.com/areas_v3/bound/' + adcode + '.json'
      ];
      for (const u of cands) {
        try {
          const r = await withTimeout(fetchPage(u, { timeout: 8000, accept: 'application/json' }), 9000, '边界');
          if (!r.ok) continue;
          const geo = JSON.parse(r.text);
          if (geo && geo.type) return json(res, 200, geo);
        } catch (e) { /* 试下一个 */ }
      }
      return fail(res, 502, '没能取到 ' + adcode + ' 的边界数据');
    }

    if (p === '/api/page') {
      const target = url.searchParams.get('url') || '';
      if (!target) return fail(res, 400, '缺少 url');
      const r = await withTimeout(fetchPage(target, { timeout: 15000 }), 18000, '页面抓取');
      if (!r.ok) return fail(res, 502, '目标返回 ' + r.status);
      const text = clip(htmlToText(r.text), 6000);
      const title = (r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
      return json(res, 200, { ok: true, url: r.url, title: clip(htmlToText(title), 160), text });
    }

    if (p === '/api/amap/poi') {
      const key = process.env.AMAP_KEY || '';
      if (!key) return fail(res, 400, '服务端没有设置 AMAP_KEY');
      const kw = url.searchParams.get('keywords') || q;
      if (!kw) return fail(res, 400, '缺少 keywords');
      const u = 'https://restapi.amap.com/v3/place/text?key=' + encodeURIComponent(key) +
        '&keywords=' + encodeURIComponent(kw) + '&city=' + encodeURIComponent(city) +
        '&citylimit=false&offset=20&page=1&extensions=base';
      const r = await fetchPage(u, { timeout: 12000, accept: 'application/json' });
      return json(res, 200, { ok: true, raw: JSON.parse(r.text) });
    }

    if (p === '/api/chat' && req.method === 'POST') return proxyChat(req, res);

    if (p.startsWith('/api/')) return fail(res, 404, '没有这个接口：' + p);

    return serveStatic(req, res, p);
  } catch (e) {
    console.error('[500]', p, e && e.message);
    return fail(res, 500, e && e.message ? e.message : String(e));
  }
});

server.listen(PORT, HOST, () => {
  const caps = [];
  caps.push(process.env.BOCHA_API_KEY ? '博查检索' : '');
  caps.push(process.env.TAVILY_API_KEY ? 'Tavily 检索' : '');
  caps.push(process.env.MODEL_API_KEY ? '模型代理' : '');
  caps.push(process.env.AMAP_KEY ? '高德 POI' : '');
  console.log('城市安心游 · 本地服务已启动');
  console.log('  页面   http://' + HOST + ':' + PORT + '/');
  console.log('  健康   http://' + HOST + ':' + PORT + '/api/health');
  console.log('  能力   ' + (caps.filter(Boolean).join(' · ') || 'HTML 检索（搜狗/360/Bing，无需 Key）'));
  if (!process.env.MODEL_API_KEY) console.log('  提示   没有 MODEL_API_KEY，AI 向导会使用内置证据引擎；页面设置里也可以直接填 Key。');
});
