// 录屏：CDP Page.startScreencast 抓帧 + 记录时间戳，供 ffmpeg 合成 mp4
// 用法：node tools/record.mjs <url> <port> [outDirName]
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL_ = process.argv[2] || 'https://city-companion.netlify.app/';
const PORT = Number(process.argv[3] || 9464);
const NAME = process.argv[4] || 'video';
const ROOT = resolve(__dirname, '..', 'dist', NAME);
const FRAMES = resolve(ROOT, 'frames');
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const W = 1600, H = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { browser.onopen = res; browser.onerror = rej; });

let seq = 0;
const waiters = new Map();
const handlers = new Map();
browser.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) {
    const { res, rej } = waiters.get(m.id); waiters.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method) {
    (handlers.get(m.method) || []).forEach(fn => fn(m.params));
  }
};
function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((res, rej) => {
    waiters.set(id, { res, rej });
    browser.send(JSON.stringify({ id, method, params, sessionId }));
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); rej(new Error('timeout ' + method)); } }, 90000);
  });
}
const on = (m, fn) => { if (!handlers.has(m)) handlers.set(m, []); handlers.get(m).push(fn); };

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: URL_ });

const evalJS = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};

for (let i = 0; i < 160; i++) {
  if (await evalJS("document.body.classList.contains('is-ready')").catch(() => false)) break;
  await sleep(250);
}
await sleep(2500);

// —— 开始录 ——
const t0 = Date.now();
const frames = [];
let n = 0;
on('Page.screencastFrame', async (p) => {
  n += 1;
  const file = `f_${String(n).padStart(5, '0')}.jpg`;
  writeFileSync(resolve(FRAMES, file), Buffer.from(p.data, 'base64'));
  frames.push({ file, t: (Date.now() - t0) / 1000 });
  try { await S('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch {}
});
await S('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
console.log('recording…');

const marks = [];
const at = () => (Date.now() - t0) / 1000;
const mark = (text) => marks.push({ t: at(), text });

const scrollTo = async (sel, offset = -70) => {
  await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'no'; const y = el.getBoundingClientRect().top + window.scrollY + (${offset}); window.scrollTo({ top: y, behavior: 'smooth' }); return 'ok'; })()`);
  await sleep(1500);
};
const scrollLast = async () => {
  await evalJS(`(() => { const log = document.querySelector('#chatLog'); if (!log) return 'no'; const items = log.querySelectorAll('.msg'); const last = items[items.length - 1]; if (!last) return 'empty'; window.scrollTo({ top: last.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' }); return items.length; })()`);
  await sleep(1200);
};

// 1 — 首屏
mark('城市安心游：3,949 座城市、1.9 万个点位，打开就能用');
await sleep(7000);

// 2 — 地图 + 换城市
mark('底图走高德实时瓦片，换城市就连行政边界一起加载');
await scrollTo('#map', -40);
await sleep(1500);
await evalJS("(() => { const c = window.__APP__.DATA.searchCities('昆明',1)[0]; window.__APP__.UI.setCity(c,{fromUser:true}); return c.n; })()");
await sleep(7000);

// 3 — 景点详情
mark('景点卡带官方事实：票价、开放时间、从哪个门进，逐条标出处');
await evalJS("(() => { const l = window.__APP__.DATA.placesFor('昆明'); const p = l.filter(function (x) { return x.id && x.id.indexOf('expanded-') === 0; })[0] || l[0]; window.__APP__.UI.openDetail(p); return p.n; })()");
await sleep(8000);
await evalJS("(() => { const d = document.querySelector('#detailDialog'); if (d && d.open) d.close(); return 'ok'; })()");
await sleep(1200);

// 4 — AI 连续追问
mark('AI 向导先查官方渠道，再联网，最后才由模型组织语言');
await scrollTo('#ai', -50);
await evalJS("window.__APP__.UI.sendQuestion('翠湖公园要门票吗？')");
await sleep(3000);
await scrollLast();
await sleep(5500);

mark('每句话后面都有编号，点开能回到原始出处');
await evalJS("window.__APP__.UI.sendQuestion('那要预约吗？')");
await sleep(2500);
await evalJS("window.__APP__.UI.sendQuestion('从哪个门进？')");
await sleep(3000);
await scrollLast();
await sleep(7000);

// 5 — 换城市问行程
mark('换城市也不丢上下文：「重庆两天怎么安排？」');
await evalJS("(() => { const c = window.__APP__.DATA.searchCities('重庆',1)[0]; window.__APP__.UI.setCity(c,{fromUser:true}); return c.n; })()");
await sleep(3000);
await evalJS("window.__APP__.UI.sendQuestion('重庆两天怎么安排？')");
await sleep(4000);
await scrollLast();
await sleep(8000);

// 6 — 消费核验
mark('查不到就说查不到；报价还能拆开算一遍');
await scrollTo('#verify', -40);
await evalJS(`(() => {
  const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; };
  set('#feePeople', '2'); set('#feeQuote', '1280'); set('#feeExtra', '300');
  const b = document.querySelector('#btnFeeCheck') || document.querySelector('#feeForm button');
  if (b) b.click();
  return 'ok';
})()`);
await sleep(7000);

// 7 — 深色主题 + 回到首屏
mark('深浅色都做了，手机端同样能用');
await evalJS("(() => { const b = document.querySelector('#btnTheme'); if (b) b.click(); return 'ok'; })()");
await sleep(2500);
await evalJS("window.scrollTo({ top: 0, behavior: 'smooth' })");
await sleep(4000);

await S('Page.stopScreencast');
console.log('frames', frames.length, 'duration', at().toFixed(1) + 's', 'marks', marks.length);
writeFileSync(resolve(ROOT, 'frames.json'), JSON.stringify({ w: W, h: H, frames, marks }, null, 1));
try { await send('Browser.close'); } catch {}
process.exit(0);
