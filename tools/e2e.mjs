/* e2e.mjs — 无依赖 CDP 冒烟测试：真开一个 Chrome，加载单文件作品，跑关键路径并截图 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
// 用法：node tools/e2e.mjs                     → 测 dist 单文件（file://）
//      node tools/e2e.mjs http://127.0.0.1:8787/ → 测本地服务模式（官方渠道/联网可用）
const ARG = process.argv[2];
const IS_HTTP = !!ARG && /^https?:\/\//i.test(ARG);
const FILE = (!IS_HTTP && ARG) ? path.resolve(ARG) : path.resolve(import.meta.dirname, '..', 'dist', '城市安心游.html');
const URL = IS_HTTP ? ARG : 'file:///' + FILE.replace(/\\/g, '/');
const OUTDIR = IS_HTTP ? path.resolve(import.meta.dirname, '..', 'dist') : path.dirname(FILE);
const SUFFIX = IS_HTTP ? '-srv' : '';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-e2e-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--allow-file-access-from-files', '--disable-features=Translate',
  '--window-size=1440,960',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  'about:blank'
], { stdio: 'ignore' });

let ws = null;
let id = 0;
const pending = new Map();
const events = [];
const logs = [];

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject, method });
    ws.send(JSON.stringify(msg));
    setTimeout(() => {
      if (pending.has(msg.id)) { pending.delete(msg.id); reject(new Error('timeout ' + method)); }
    }, 30000);
  });
}

async function evaluate(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true, userGesture: true
  });
  if (r.exceptionDetails) {
    return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  }
  return r.result.value;
}

async function waitFor(fn, ms = 15000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(step);
  }
  return false;
}

async function main() {
  const ok = await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return r.ok;
    } catch { return false; }
  }, 20000);
  if (!ok) throw new Error('Chrome 调试端口没起来');

  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  console.log('浏览器：' + ver['Browser']);

  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws 失败')); });

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(p.method + ': ' + msg.error.message)) : p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      logs.push({ type: msg.params.type, text });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
    } else if (msg.method === 'Log.entryAdded') {
      logs.push({ type: 'log:' + msg.params.entry.level, text: msg.params.entry.text });
    } else if (msg.method === 'Network.loadingFailed') {
      events.push({ failed: msg.params.errorText, type: msg.params.type });
    } else if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response || {};
      if (r.status >= 400) events.push({ failed: 'HTTP ' + r.status + ' ' + String(r.url || '').slice(0, 120), type: msg.params.type });
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: URL });
  const ready = await waitFor(async () => await evaluate('!!(window.UI && document.body.classList.contains("is-ready"))', false), 40000);
  console.log('就绪：' + (ready ? '是' : '否') + '（' + (Date.now() - t0) + 'ms）');

  const diag = `(() => {
    const q = (s) => document.querySelector(s);
    const n = (s) => document.querySelectorAll(s).length;
    const c = q('#heroCanvas');
    return {
      title: document.title,
      cities: n('#cityList .city-item'),
      places: n('#placeList .place-item'),
      chat: n('#chatLog .msg'),
      tiles: n('#map img.leaflet-tile'),
      markers: n('#map .pinmark'),
      canvas: c ? c.width + 'x' + c.height : null,
      pillData: q('#pillData') && q('#pillData').innerText.trim(),
      pillMap: q('#pillMap') && q('#pillMap').innerText.trim(),
      pillModel: q('#pillModel') && q('#pillModel').innerText.trim(),
      city: q('#mapCityName') && q('#mapCityName').innerText,
      meta: q('#mapCityMeta') && q('#mapCityMeta').innerText,
      badge: q('#mapCityBadge') && q('#mapCityBadge').innerText,
      hot: n('#hotCities .chip'),
      stats: q('#statCities') && q('#statCities').innerText
    };
  })()`;
  const d1 = await evaluate(diag, false);
  console.log('\n[初始化] ' + JSON.stringify(d1, null, 1));

  // 切到昆明（有指南数据的城市）
  const km = await evaluate(`(async () => {
    const c = DATA.resolveCity('昆明');
    await UI.setCity(c);
    await new Promise(r => setTimeout(r, 1500));
    return { name: c.name, ad: c.ad };
  })()`);
  console.log('\n[切昆明] ' + JSON.stringify(km));
  await sleep(1200);
  const d2 = await evaluate(diag, false);
  console.log('[昆明] ' + JSON.stringify({ tiles: d2.tiles, markers: d2.markers, places: d2.places, meta: d2.meta, city: d2.city }));

  // 连续提问（考上下文承接）
  const q1 = await evaluate(`(async () => { const a = await UI.sendQuestion('翠湖要票不？'); const w = a.web || {}; const o = w.official || {}; return { mode: a.mode, city: a.city && a.city.name, place: a.place && a.place.n, lead: a.lead, blocks: (a.blocks||[]).length, cites: (a.cites||[]).length, titles: (a.blocks||[]).map(b => b.title), web: { via: w.via, ok: w.ok, n: (w.results||[]).length, reason: w.reason }, official: { via: o.via, ok: o.ok, n: (o.sources||[]).length, reason: o.reason, hosts: (o.sources||[]).map(s => s.host) } }; })()`);
  console.log('\n[问1] ' + JSON.stringify(q1, null, 1));
  const q2 = await evaluate(`(async () => { const a = await UI.sendQuestion('那要预约吗？'); return { place: a.place && a.place.n, lead: a.lead, blocks: (a.blocks||[]).length }; })()`);
  console.log('[问2 承接] ' + JSON.stringify(q2));
  const q3 = await evaluate(`(async () => { const a = await UI.sendQuestion('从哪个门进？'); return { place: a.place && a.place.n, lead: a.lead }; })()`);
  console.log('[问3] ' + JSON.stringify(q3));
  const q4 = await evaluate(`(async () => { const a = await UI.sendQuestion('那大观楼呢？'); return { place: a.place && a.place.n, lead: a.lead, city: a.city && a.city.name }; })()`);
  console.log('[问4 换景点] ' + JSON.stringify(q4));

  // 行程类问题：最容易出现「一堆未收录」的情况，看合并后的缺口提示是否克制
  const q5 = await evaluate(`(async () => { const a = await UI.sendQuestion('重庆两天怎么安排？'); return { mode: a.mode, blocks: (a.blocks||[]).length, cites: (a.cites||[]).length, notes: (a.notes||[]).length, lead: a.lead }; })()`);
  console.log('[问5 行程] ' + JSON.stringify(q5));

  // 任意城市（非重庆）地图是否完整
  const cq = await evaluate(`(async () => {
    const c = DATA.resolveCity('阿勒泰');
    if (!c) return { err: 'no city' };
    await UI.setCity(c);
    await new Promise(r => setTimeout(r, 2500));
    const q = s => document.querySelector(s);
    const map = window.MAP && MAP.getMap();
    return {
      city: c.name, ad: c.ad, level: c.level,
      tiles: document.querySelectorAll('#map img.leaflet-tile').length,
      markers: document.querySelectorAll('#map .pinmark').length,
      boundary: !!(map && window.MAP.boundaryLoaded && MAP.boundaryLoaded()),
      meta: q('#mapCityMeta').innerText,
      status: q('#mapStatus').innerText.trim(),
      zoom: map ? map.getZoom() : null
    };
  })()`);
  console.log('\n[阿勒泰] ' + JSON.stringify(cq, null, 1));

  // 没有 adcode 的老区县：应退化成范围示意圈，而不是空白
  const cq2 = await evaluate(`(async () => {
    const c = DATA.resolveCity('江干区') || DATA.resolveCity('楚州区');
    if (!c) return { err: 'no city' };
    await UI.setCity(c);
    await new Promise(r => setTimeout(r, 2200));
    const q = s => document.querySelector(s);
    const map = window.MAP && MAP.getMap();
    return {
      city: c.name, ad: c.ad, level: c.level,
      tiles: document.querySelectorAll('#map img.leaflet-tile').length,
      circles: document.querySelectorAll('#map path.leaflet-interactive, #map svg path').length,
      boundary: !!(map && window.MAP.boundaryLoaded && MAP.boundaryLoaded()),
      curve: (window.MAP.current() || {}).boundary,
      meta: q('#mapCityMeta').innerText,
      status: q('#mapStatus').innerText.trim(),
      zoom: map ? map.getZoom() : null
    };
  })()`);
  console.log('\n[无边界区县] ' + JSON.stringify(cq2, null, 1));

  // 模型链路（指向本地假模型，不经真实厂商）
  const mdl = await evaluate(`(async () => {
    CFG.patch({ baseUrl: 'http://127.0.0.1:8799/v1', model: 'mock-guide', modelKey: 'sk-mock' });
    try {
      const r = await AI.ask('翠湖公园要门票吗？');
      return {
        mode: r.mode, lead: r.lead, blocks: (r.blocks || []).length,
        cites: (r.cites || []).length, modelError: r.modelError || null,
        web: r.web && { via: r.web.via, ok: r.web.ok }
      };
    } catch (e) { return { err: String(e && e.message || e) }; }
  })()`);
  console.log('\n[模型链路] ' + JSON.stringify(mdl, null, 1));

  // 打开景点详情
  const det = await evaluate(`(async () => {
    const c = DATA.resolveCity('重庆');
    await UI.setCity(c);
    await new Promise(r => setTimeout(r, 1200));
    const p = DATA.placesFor('重庆')[0];
    UI.openDetail(p);
    await new Promise(r => setTimeout(r, 600));
    return { name: p.n, open: document.querySelector('#detailDialog').open, photos: document.querySelectorAll('#detailGallery img').length, facts: document.querySelectorAll('#detailFacts dt').length, src: document.querySelectorAll('#detailSources .src-row').length };
  })()`);
  console.log('\n[详情] ' + JSON.stringify(det));
  await evaluate("document.querySelector('#detailDialog').close()", false);

  // 地图容器尺寸
  const layout = await evaluate(`(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    return { map: r('#map'), hero: r('#heroCanvas'), body: [document.body.scrollWidth, document.body.scrollHeight], overflowX: document.documentElement.scrollWidth > window.innerWidth };
  })()`, false);
  console.log('\n[布局] ' + JSON.stringify(layout));

  await evaluate("window.scrollTo(0,0)", false);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = path.join(OUTDIR, '_shot-top' + SUFFIX + '.png');
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('\n截图 ' + out);

  await evaluate("document.querySelector('#assistant').scrollIntoView()", false);
  await sleep(600);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const out2 = path.join(OUTDIR, '_shot-chat' + SUFFIX + '.png');
  fs.writeFileSync(out2, Buffer.from(shot2.data, 'base64'));
  console.log('截图 ' + out2);

  // 设置面板（模型与联网配置）也留一张图，方便核对交互
  await evaluate(`(() => { const b = document.querySelector('#btnSettings'); if (b) b.click(); })()`, false);
  await sleep(700);
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const out3 = path.join(OUTDIR, '_shot-settings' + SUFFIX + '.png');
  fs.writeFileSync(out3, Buffer.from(shot3.data, 'base64'));
  console.log('截图 ' + out3);
  await evaluate(`(() => { const d = document.querySelector('#settingsDialog'); if (d && d.close) d.close(); })()`, false);

  // 深色主题
  await evaluate(`(() => { const b = document.querySelector('#btnTheme'); if (b) b.click(); })()`, false);
  await sleep(900);
  await evaluate("window.scrollTo(0, 0)", false);
  await sleep(400);
  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  const out4 = path.join(OUTDIR, '_shot-dark' + SUFFIX + '.png');
  fs.writeFileSync(out4, Buffer.from(shot4.data, 'base64'));
  console.log('截图 ' + out4);
  const darkInfo = await evaluate(`(() => {
    const el = document.documentElement;
    return { theme: el.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor };
  })()`, false);
  console.log('[深色] ' + JSON.stringify(darkInfo));

  const errs = logs.filter((l) => l.type === 'exception' || l.type === 'error' || l.type === 'log:error');
  console.log('\n[控制台错误] ' + errs.length);
  errs.slice(0, 12).forEach((e) => console.log('  ! ' + e.text.split('\n')[0].slice(0, 220)));
  // 本脚本后半段会故意把模型地址改成 127.0.0.1:8799（一个没人监听的端口）来测失败提示，
  // 那次 /api/chat 必然 504，属于用例本身，不算页面缺陷。
  if (Object.keys(events).length && events.some((e) => /504.*\/api\/chat/.test(e.failed))) {
    console.log('  (注：上面若有 1 条 /api/chat 的 504，是「故意填错模型地址」的失败路径用例，不是页面问题)');
  }
  const warns = logs.filter((l) => l.type === 'warning' || l.type === 'log:warning');
  console.log('[警告] ' + warns.length);
  warns.slice(0, 8).forEach((e) => console.log('  ~ ' + e.text.split('\n')[0].slice(0, 200)));
  const fails = {};
  events.forEach((e) => { fails[e.failed] = (fails[e.failed] || 0) + 1; });
  console.log('[网络失败] ' + JSON.stringify(fails));

  fs.writeFileSync(path.join(OUTDIR, '_e2e' + SUFFIX + '.json'), JSON.stringify({ url: URL, d1, km, d2, q1, q2, q3, q4, cq, det, layout, errs, warns, fails }, null, 2));
}

main().catch((e) => {
  console.error('E2E 失败：' + (e && e.stack || e));
  process.exitCode = 1;
}).finally(async () => {
  try { ws && ws.close(); } catch {}
  try { await fetch(`http://127.0.0.1:${PORT}/json/close/x`, { method: 'PUT' }); } catch {}
  chrome.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
});
