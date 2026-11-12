/* lib/core.js — 城市安心游 · 检索与正文抽取（运行时无关，Node 与 Cloudflare Workers 共用）
 *
 * 为什么单独一层：
 *   本地 server.mjs 和线上 Pages Functions 需要完全一样的三件事——
 *   抓页面、抽正文、按相关性过滤。放在这里一份，两边 import，避免线上和本地行为分叉。
 *
 * 这里不使用任何 Node 专有 API（fs/path/Buffer），只依赖 fetch / TextDecoder / AbortController，
 * 所以既能在 Node 18+ 跑，也能在 workerd 里跑。
 *
 * 环境变量通过参数传入（env 对象），不直接读 process.env —— Workers 里没有 process。
 */

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
export const MAX_BODY = 3 * 1024 * 1024;

export function clip(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function decodeEntities(s) {
  const map = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”',
    middot: '·', hellip: '…', mdash: '—', ndash: '–', times: '×', deg: '°'
  };
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return map[g] != null ? map[g] : m;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

/* 正文抽取：先去导航/页脚，再在候选容器里挑中文最多的那块。
   政府站首页整页文字几乎全是导航，直接 htmlToText 会得到一堆菜单，必须先把正文块挑出来。 */
export function mainText(html) {
  const src = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const cands = [];
  let m;
  const re = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = re.exec(src))) cands.push(m[2]);
  const divRe = /<(div|section)\b[^>]*(?:id|class)="[^"]*(?:content|article|detail|main|txt|con|zw|body|news)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = divRe.exec(src))) cands.push(m[2]);
  const cjk = (s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  let best = '';
  let bestScore = 0;
  for (const c of cands) {
    const t = htmlToText(c).replace(/[ \t]+/g, ' ');
    const score = cjk(t);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (bestScore < 220) return htmlToText(src);
  return best;
}

/* 正文清洗：去掉导航式短行（"首页 市政府 政务公开"）、重复行、空行 */
export function tidyParagraphs(text, limit = 1400) {
  const seen = new Set();
  const lines = String(text || '').split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      const cjk = (l.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (cjk < 8) return false;
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
  return clip(lines.join('\n'), limit);
}

/* 防 SSRF：只允许公网 http(s)，挡住本机与内网段 */
export function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('不是合法的网址'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('只支持 http/https');
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error('拒绝访问本机地址');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) {
      throw new Error('拒绝访问内网地址');
    }
  }
  return u;
}

/** 从字节里嗅探 charset（只读前 2KB，用 ASCII 拼字符串，避免依赖 latin1 解码器） */
export function sniffCharset(bytes) {
  const n = Math.min(bytes.length, 2048);
  let head = '';
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]);
  const meta = head.match(/charset\s*=\s*["']?\s*([\w-]+)/i);
  return meta ? meta[1].toLowerCase() : 'utf-8';
}

/** 默认解码：UTF-8 优先，声明了 gbk/gb2312 时尝试用对应解码器（Node 支持；workerd 只支持 UTF-8，会回退） */
export function decodeBytes(bytes, contentType) {
  let charset = sniffCharset(bytes);
  if (!charset && contentType) {
    const m = String(contentType).match(/charset=([\w-]+)/i);
    if (m) charset = m[1].toLowerCase();
  }
  if (charset === 'gb2312' || charset === 'gbk') charset = 'gbk';
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * 抓页面。plugins.readText 可替换解码方式（Workers 里用 HTMLRewriter 处理 GBK 页面）。
 * 返回 { ok, status, url, text, contentType }
 */
export async function fetchPage(url, opts = {}, plugins = {}) {
  assertPublicUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: opts.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9',
        ...(opts.headers || {})
      }
    });
    const contentType = r.headers.get('content-type') || '';
    const text = plugins.readText
      ? await plugins.readText(r, contentType)
      : decodeBytes(new Uint8Array(await r.arrayBuffer()), contentType);
    return { ok: r.ok, status: r.status, url: r.url || url, text, contentType };
  } finally {
    clearTimeout(timer);
  }
}

export async function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error((label || '请求') + '超时 ' + ms + 'ms')), ms);
  });
  try { return await Promise.race([promise, guard]); } finally { clearTimeout(timer); }
}

/* ---------------- 检索源 ---------------- */

export async function bochaSearch(q, key) {
  const r = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, freshness: 'oneYear', summary: true, count: 8 })
  });
  if (!r.ok) throw new Error('博查返回 ' + r.status);
  const d = await r.json();
  const list = (d && d.data && d.data.webPages && d.data.webPages.value) || [];
  return list.map((x) => ({
    title: x.name, url: x.url, snippet: x.snippet || x.summary || '', kind: 'search'
  }));
}

export async function tavilySearch(q, key) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: key, query: q, search_depth: 'basic', max_results: 8 })
  });
  if (!r.ok) throw new Error('Tavily 返回 ' + r.status);
  const d = await r.json();
  return (d.results || []).map((x) => ({
    title: x.title, url: x.url, snippet: x.content || '', kind: 'search'
  }));
}

/** 搜狗网页检索：国内直连可用，结果自带来源站点与日期（连续请求会触发验证码，需要降级） */
export async function sogouWeb(q, siteOnly, plugins) {
  const query = siteOnly ? 'site:gov.cn ' + q : q;
  const url = 'https://www.sogou.com/web?query=' + encodeURIComponent(query);
  const r = await fetchPage(url, { timeout: 12000 }, plugins);
  if (!r.ok) throw new Error('搜狗返回 ' + r.status);
  if (r.text.length < 20000 && /验证码|antispider/i.test(r.text)) throw new Error('搜狗要求验证码（被限流）');
  const out = [];
  const blocks = r.text.split(/class="vrwrap"/).slice(1);
  for (const b of blocks) {
    const link = b.match(/<h3 class="vr-title">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const snippet = (b.match(/<div class="(?:fz-mid[^"]*|space-txt[^"]*)"[^>]*>([\s\S]*?)<\/div>/i) || [, ''])[1];
    const realUrl = (b.match(/data-url="(https?:\/\/[^"]+)"/i) || [, ''])[1];
    const site = (b.match(/<a class="citeLinkClass"[\s\S]*?<span>([^<]+)<\/span>\s*<span>([^<]*)<\/span>\s*<span>([^<]*)<\/span>/i) || [, '', '', '']);
    const href = realUrl || ('https://www.sogou.com' + decodeEntities(link[1]));
    const title = clip(htmlToText(link[2]), 140);
    if (!title) continue;
    out.push({
      title,
      url: href,
      snippet: clip(htmlToText(snippet), 300),
      source: (site[1] || '').trim(),
      date: (site[3] || '').trim(),
      kind: siteOnly ? 'gov' : 'search'
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** 360 搜索：结构清晰（data-mdurl 给真实地址），限流比搜狗宽松。
    注意标题标签真实 HTML 是 `<h3   class="res-title">`，h3 与 class 之间可能多个空格，正则必须容错。 */
export async function so360Web(q, siteOnly, plugins) {
  const query = siteOnly ? 'site:gov.cn ' + q : q;
  const url = 'https://www.so.com/s?q=' + encodeURIComponent(query) + '&pn=1';
  const r = await fetchPage(url, { timeout: 12000 }, plugins);
  if (!r.ok) throw new Error('360 返回 ' + r.status);
  if (/安全验证|人机验证/.test(r.text) && r.text.length < 60000) throw new Error('360 要求人机验证');
  const out = [];
  const blocks = r.text.split(/class="res-list"/).slice(1);
  for (const b of blocks) {
    const link = b.match(/<h3[^>]*class="res-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const real = (b.match(/data-mdurl="([^"]+)"/i) || [, ''])[1];
    const href = /^https?:\/\//.test(real) ? real : (/^https?:\/\//.test(link[1]) ? link[1] : '');
    if (!href || /so\.com\/link/.test(href)) continue;
    const title = clip(htmlToText(link[2]), 140);
    if (!title) continue;
    const snip = (b.match(/<span class="res-list-summary"[^>]*>([\s\S]*?)<\/span>/i)
      || b.match(/<p class="res-desc"[^>]*>([\s\S]*?)<\/p>/i) || [, ''])[1];
    out.push({
      title,
      url: href,
      snippet: clip(htmlToText(snip), 300),
      date: clip(htmlToText((b.match(/<span class="g-c-gray"[^>]*>([\s\S]*?)<\/span>/i) || [, ''])[1]), 32),
      kind: siteOnly ? 'gov' : 'search'
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** 相关性过滤：检索结果里必须真的出现查询里的实体词，否则宁可不返回 */
export const GENERIC_WORDS = new Set(['门票', '价格', '开放时间', '怎么去', '交通', '预约', '公告', '官方', '电话',
  '人多', '排队', '限流', '安全', '提示', '介绍', '历史', '美食', '拍照', '景区', '旅游', '攻略', '实名']);

export function relevant(list, q) {
  const toks = String(q || '').split(/\s+/).map((s) => s.trim())
    .filter((s) => s.length >= 2 && !GENERIC_WORDS.has(s));
  if (!toks.length) return list;
  const need = Math.max(1, Math.ceil(toks.length * 0.5));
  return list.filter((x) => {
    const s = (x.title || '') + ' ' + (x.snippet || '') + ' ' + (x.source || '');
    const hit = toks.filter((t) => s.includes(t)).length;
    return hit >= need;
  });
}

/** Bing 网页版结果（备用；中文长尾质量一般） */
export async function bingSearch(q, siteOnly, plugins) {
  const query = siteOnly ? 'site:gov.cn ' + q : q;
  const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=zh-CN&ensearch=0';
  const r = await fetchPage(url, { timeout: 12000 }, plugins);
  if (!r.ok) throw new Error('Bing 返回 ' + r.status);
  const out = [];
  const blocks = r.text.split(/<li class="b_algo"/).slice(1);
  for (const b of blocks) {
    const link = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const href = decodeEntities(link[1]);
    if (!/^https?:\/\//.test(href) || href.includes('bing.com')) continue;
    const snippet = b.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({
      title: clip(htmlToText(link[2]), 120),
      url: href,
      snippet: clip(htmlToText(snippet ? snippet[1] : ''), 260),
      kind: siteOnly ? 'gov' : 'search'
    });
  }
  return out;
}

/** 搜狗微信文章检索：能拿到公众号文章标题与链接 */
export async function sogouWeixin(q, plugins) {
  const url = 'https://weixin.sogou.com/weixin?type=2&query=' + encodeURIComponent(q);
  const r = await fetchPage(url, { timeout: 12000, headers: { referer: 'https://weixin.sogou.com/' } }, plugins);
  if (!r.ok) throw new Error('搜狗微信返回 ' + r.status);
  const out = [];
  const re = /<a[^>]+href="(\/link\?url=[^"]+)"[\s\S]{0,600}?<h3>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(r.text)) && out.length < 8) {
    out.push({
      title: clip(htmlToText(m[2]), 120),
      url: 'https://weixin.sogou.com' + decodeEntities(m[1]).replace(/&amp;/g, '&'),
      snippet: '微信公众号文章（经搜狗微信索引）',
      kind: 'wechat'
    });
  }
  return out;
}

/**
 * 多源检索：博查 → Tavily → 搜狗 → 360 → 搜狗微信 → Bing，逐级降级。
 * env 需要 { BOCHA_API_KEY, TAVILY_API_KEY }
 */
export async function doSearch(q, opts = {}, env = {}, plugins = {}) {
  const errors = [];
  const accept = (list, via) => {
    const good = relevant(list, q);
    if (good.length) return { ok: true, via, results: good };
    errors.push(via + '：抓到 ' + list.length + ' 条但都与问题无关');
    return null;
  };
  if (env.BOCHA_API_KEY) {
    try {
      const hit = accept(await bochaSearch(q, env.BOCHA_API_KEY), 'bocha');
      if (hit) return hit;
    } catch (e) { errors.push('博查：' + e.message); }
  }
  if (env.TAVILY_API_KEY) {
    try {
      const hit = accept(await tavilySearch(q, env.TAVILY_API_KEY), 'tavily');
      if (hit) return hit;
    } catch (e) { errors.push('Tavily：' + e.message); }
  }
  try {
    const hit = accept(await sogouWeb(q, opts.siteOnly, plugins), opts.siteOnly ? 'sogou-gov' : 'sogou');
    if (hit) return hit;
  } catch (e) { errors.push('搜狗：' + e.message); }
  try {
    const hit = accept(await so360Web(q, opts.siteOnly, plugins), opts.siteOnly ? '360-gov' : '360');
    if (hit) return hit;
  } catch (e) { errors.push('360：' + e.message); }
  // 公众号文章常常是景区第一时间发的通知，排在通用网页引擎之前
  if (opts.wechat) {
    try {
      const list = await sogouWeixin(q, plugins);
      const good = relevant(list, q);
      if (good.length) return { ok: true, via: 'sogou-weixin', results: good };
      if (list.length) errors.push('搜狗微信：抓到 ' + list.length + ' 篇但都与问题无关');
    } catch (e) { errors.push('搜狗微信：' + e.message); }
  }
  // Bing 会忽略 site: 限定（实测返回百科/视频站），政府站检索时直接跳过，省时间也避免误标为官方
  if (!opts.siteOnly) {
    try {
      const hit = accept(await bingSearch(q, false, plugins), 'bing');
      if (hit) return hit;
    } catch (e) { errors.push('Bing：' + e.message); }
  }
  return { ok: false, via: 'none', results: [], reason: errors.join('；') || '没有可用的检索源' };
}

/* ---------------- 官方渠道：只取政府站，抓正文 ---------------- */

export const GOV_HOST = /(^|\.)gov\.cn$/i;

export function hostOfSafe(u) {
  try { return new URL(u).hostname; } catch { return ''; }
}

/**
 * 官方渠道优先：在检索结果里只认 gov.cn，抓到就抽正文。
 * 返回 { ok, via, query, sources:[{title,url,host,snippet,text,date,kind}], rejected, reason }
 */
export async function officialDigest(q, city, env = {}, plugins = {}) {
  const query = [city, q].filter(Boolean).join(' ');
  // 先看普通检索里有没有政府站页面（site: 语法在 360/Bing 上都不可靠，反而会退化成无关结果）
  const found = await doSearch(query, {}, env, plugins);
  const govHits = (found.results || []).filter((x) => GOV_HOST.test(hostOfSafe(x.url)));
  // 政府站大多没有对应页面，再单独走一轮「只搜政府站」。
  // 三个引擎并发发出去、谁先回 gov.cn 结果就用谁——串行在 10 秒的函数里一定超时。
  // 出口 IP 在哪决定哪个引擎好用：国内 IP 上 360 召回好，海外 IP 上 Bing 更好。
  let govOnlyHits = [];
  if (!govHits.length) {
    const tries = [];
    if (env && (env.BOCHA_API_KEY || env.TAVILY_API_KEY)) {
      tries.push(async () => (await doSearch(query, { siteOnly: true }, env, plugins)).results || []);
    }
    tries.push(() => bingSearch(query, true, plugins));
    tries.push(() => so360Web(query, true, plugins));
    const settled = await Promise.all(tries.map((t) => Promise.resolve().then(t).catch(() => [])));
    for (const list of settled) {
      const gov = (list || []).filter((x) => GOV_HOST.test(hostOfSafe(x.url)));
      if (gov.length) { govOnlyHits = gov; break; }
    }
  }
  const picks = (govHits.length ? govHits : govOnlyHits)
    .map((x) => {
      const s = (x.title || '') + ' ' + (x.snippet || '');
      let score = 0;
      if (city && s.includes(city)) score += 2;
      if (x.snippet && q && String(q).split(/\s+/).some((t) => t.length >= 2 && s.includes(t))) score += 1;
      return { x, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.x);
  const sources = [];
  // 三页并行抓：Netlify 同步函数只有 10 秒预算，串行会超时
  const pages = await Promise.all(picks.map(async (item) => {
    let text = '';
    try {
      const page = await fetchPage(item.url, { timeout: 9000 }, plugins);
      if (page.ok) text = tidyParagraphs(mainText(page.text), 1400);
    } catch (e) { /* 单页失败不影响整体 */ }
    return {
      title: item.title, url: item.url, host: hostOfSafe(item.url),
      snippet: item.snippet, text, date: item.date || '', kind: 'gov'
    };
  }));
  sources.push(...pages);
  let usable = sources.filter((s) => (s.text || '').length >= 80);
  let viaWeixin = '';

  // 兜底：海外出口 IP 上 360 打不开、Bing 认不出 site:gov.cn，政府站这一路会空。
  // 这时退到微信公众号——景区官方号通常第一时间发门票/开放时间/预约公告，
  // 正好是用户要的「景区自己的公众号」。只取标题与摘要，不给正文（原文在微信里，需点开核对）。
  if (!usable.length) {
    try {
      const wxq = [city, q].filter(Boolean).join(' ') + ' 公告';
      const wx = await sogouWeixin(wxq, plugins);
      const toks = String(q || '').split(/\s+/).filter((t) => t.length >= 2);
      const NOISE = /竞争性磋商|采购项目|招标|中标|成交公告|询价|招聘|拍卖|转让|疫情|核酸|影院|演出/;
      // 景点名是最长的那个词（「翠湖公园」而不是「门票」）：标题里必须真出现景点名，
      // 否则很容易把「昆明影院恢复开放」这类同城无关文章当成本景点的公告。
      const place = toks.slice().sort((a, b) => b.length - a.length)[0] || '';
      const scoredW = (wx || [])
        .filter((x) => !NOISE.test(String(x.title || '')))
        .filter((x) => !place || ((String(x.title || '') + String(x.snippet || '')).includes(place)))
        .map((x) => {
          const s = (x.title || '') + ' ' + (x.snippet || '');
          let score = 0;
          if (city && s.includes(city)) score += 1;
          for (const t of toks) if (s.includes(t)) score += 2;
          if (/公告|通知|开放|门票|预约|闭园|限流/.test(s)) score += 1;
          return { x, score };
        })
        .filter((r) => r.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      for (const r of scoredW) {
        const text = tidyParagraphs((r.x.snippet || '') + '\n' + (r.x.title || ''), 700);
        if (text.length >= 24) {
          sources.push({
            title: r.x.title, url: r.x.url, host: '微信公众号',
            snippet: r.x.snippet, text, date: r.x.date || '', kind: 'wechat'
          });
        }
      }
      usable = sources.filter((s) => (s.text || '').length >= 24);
      if (usable.length) viaWeixin = 'weixin';
    } catch (e) { /* 微信也失败就按空处理 */ }
  }

  return {
    ok: usable.length > 0,
    via: viaWeixin || found.via,
    query,
    sources: usable,
    rejected: sources.length - usable.length,
    note: viaWeixin ? '以下来自微信公众号文章的标题与摘要（公开转载），不是政府站原文，请点开原文核对。' : '',
    reason: usable.length ? '' : (picks.length
      ? '政府站点有相关页面，但没抓到可用正文'
      : '公开检索里没有该主题的政府站页面')
  };
}
