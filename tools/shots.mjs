// 生成 PPT / 项目说明要用的线上截图（无第三方依赖，走 CDP）
// 用法：node tools/shots.mjs https://city-companion.netlify.app/
import { spawn } from 'node:child_process';
import fs, { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'dist', 'shots');
const URL_ = process.argv[2] || 'https://city-companion.netlify.app/';
const W = 1600, H = 1000, DSF = 2;          // 2x 出图，PPT 里更清楚
const PORT = 9461;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
].find(p => existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const profile = resolve(os.tmpdir(), 'ax-shots-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=' + DSF,
  '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', fs.openSync(resolve(os.tmpdir(), 'ax-shots-chrome.log'), 'w')] });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdpURL() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome 没起来');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.events = []; }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waiting.has(m.id)) {
        const { res, rej } = c.waiting.get(m.id); c.waiting.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) c.events.push(m);
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => { if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error('timeout ' + method)); } }, 45000);
    });
  }
  on(method, fn) {
    const orig = this.ws.onmessage;
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.method === method) fn(m.params);
      orig && orig(ev);
    };
  }
}

const { webSocketDebuggerUrl } = await (async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  return r.json();
})();
const browser = await CDP.open(webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => browser.send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: DSF, mobile: false,
});
await S('Page.navigate', { url: URL_ });

const evalJS = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

// 等首屏就绪
for (let i = 0; i < 120; i++) {
  const ready = await evalJS("document.body.classList.contains('is-ready')").catch(() => false);
  if (ready) break;
  await sleep(250);
}
await sleep(1200);

async function shot(name, opts = {}) {
  if (opts.full) {
    const m = await S('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(m.cssContentSize.height), 6000);
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(resolve(OUT, name), Buffer.from(data, 'base64'));
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
    await sleep(300);
  } else {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(OUT, name), Buffer.from(data, 'base64'));
  }
  console.log('shot', name);
}

const scrollTo = async (sel, offset = -90) => {
  await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'no'; const y = el.getBoundingClientRect().top + window.scrollY + (${offset}); window.scrollTo({ top: y, behavior: 'instant' }); return 'ok'; })()`);
  await sleep(700);
};

// 1. 首屏
await shot('01-hero.png');

// 2. 地图区（滚到地图）
await evalJS("document.querySelector('#map') && document.querySelector('#map').scrollIntoView({block:'center'})");
await sleep(1800);
await shot('02-map.png');

// 3. 换成昆明（有精选卡 + 官方事实）
await evalJS("window.__APP__ && window.__APP__.UI.setCity(window.__APP__.DATA.searchCities('昆明',1)[0], {fromUser:true})");
await sleep(3200);
await shot('03-map-kunming.png');

// 4. 景点详情（翠湖公园）
await evalJS(`(() => { const p = window.__APP__.DATA.placesFor('昆明')[0]; if (p) window.__APP__.UI.openDetail(p); return p && p.name; })()`);
await sleep(2600);
await shot('04-place.png');
await evalJS("document.querySelector('#detailDialog') && document.querySelector('#detailDialog').close()");
await sleep(500);

// 5. AI 对话：连续追问
await scrollTo('#ai', -60);
await evalJS("window.__APP__.UI.sendQuestion('翠湖公园要门票吗？')");
await sleep(6500);
await shot('05-ai-1.png');
await evalJS("window.__APP__.UI.sendQuestion('那要预约吗？')");
await sleep(6000);
await evalJS("window.__APP__.UI.sendQuestion('从哪个门进？')");
await sleep(6000);
await shot('06-ai-3.png');

// 6. 换城市并问行程（模型生成 + 逐句引用 + 缺口合并）
await evalJS("window.__APP__.UI.setCity(window.__APP__.DATA.searchCities('重庆',1)[0], {fromUser:true})");
await sleep(2600);
await evalJS("window.__APP__.UI.sendQuestion('重庆两天怎么安排？')");
await sleep(9000);
await shot('07-ai-plan.png');

// 7. 消费核验（填一组可疑报价）
await scrollTo('#verify', -80);
await evalJS(`(() => {
  const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); };
  set('#feePeople', '2'); set('#feeQuote', '1280'); set('#feeExtra', '300');
  const b = document.querySelector('#btnFeeCheck') || document.querySelector('#feeForm button');
  if (b) b.click();
  return 'ok';
})()`);
await sleep(1500);
await shot('08-verify.png');

// 8. 深色主题
await evalJS("document.querySelector('#btnTheme') && document.querySelector('#btnTheme').click()");
await sleep(900);
await evalJS("window.scrollTo({top:0,behavior:'instant'})");
await sleep(1400);
await shot('09-dark.png');
await evalJS("document.querySelector('#btnTheme') && document.querySelector('#btnTheme').click()");
await sleep(600);

// 9. 整页长图（给 Word 用）
await shot('10-full.png', { full: true });

console.log('done ->', OUT);
try { await browser.send('Browser.close'); } catch {}
chrome.kill();
await sleep(400);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
