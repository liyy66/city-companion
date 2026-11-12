// 连接已启动的 headless Chrome（由 pwsh 启动），抓线上截图
// 用法：node tools/shots2.mjs <url> <port>
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'dist', 'shots');
const URL_ = process.argv[2] || 'https://city-companion.netlify.app/';
const PORT = Number(process.argv[3] || 9462);
const W = 1600, H = 1000;
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { browser.onopen = res; browser.onerror = rej; });

let seq = 0;
const waiters = new Map();
const listeners = new Map();
browser.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) {
    const { res, rej } = waiters.get(m.id); waiters.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  } else if (m.method && listeners.has(m.method)) {
    listeners.get(m.method).forEach(fn => fn(m.params));
  }
};
function send(method, params = {}, sessionId) {
  const id = ++seq;
  return new Promise((res, rej) => {
    waiters.set(id, { res, rej });
    browser.send(JSON.stringify({ id, method, params, sessionId }));
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
  });
}
const on = (method, fn) => {
  if (!listeners.has(method)) listeners.set(method, []);
  listeners.get(method).push(fn);
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await S('Page.navigate', { url: URL_ });

const evalJS = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
};

for (let i = 0; i < 160; i++) {
  const ready = await evalJS("document.body.classList.contains('is-ready')").catch(() => false);
  if (ready) break;
  await sleep(250);
}
await sleep(1500);
console.log('ready:', await evalJS("document.body.classList.contains('is-ready')"));

async function shot(name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(OUT, name), Buffer.from(data, 'base64'));
  console.log('shot', name, Math.round(Buffer.from(data, 'base64').length / 1024) + 'KB');
}

const scrollTo = async (sel, offset = -90) => {
  await evalJS(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'no'; const y = el.getBoundingClientRect().top + window.scrollY + (${offset}); window.scrollTo({ top: y, behavior: 'instant' }); return 'ok'; })()`);
  await sleep(800);
};

// 把最后一条回答滚进视野（截图要拍到答案，不能停在页头）
const scrollLast = async () => {
  await evalJS(`(() => {
    const log = document.querySelector('#chatLog');
    if (!log) return 'no';
    const items = log.querySelectorAll('.msg');
    const last = items[items.length - 1];
    if (!last) return 'empty';
    const y = last.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: y, behavior: 'instant' });
    return items.length;
  })()`);
  await sleep(500);
};

try {
  await shot('01-hero.png');
  await evalJS("document.querySelector('#map').scrollIntoView({block:'center'})");
  await sleep(2000);
  await shot('02-map.png');
  console.log('kunming:', await evalJS("(() => { const c = window.__APP__.DATA.searchCities('昆明',1)[0]; window.__APP__.UI.setCity(c,{fromUser:true}); return c && c.name; })()"));
  await sleep(3600);
  await shot('03-map-kunming.png');
  console.log('detail:', await evalJS("(() => { const list = window.__APP__.DATA.placesFor('昆明'); const p = list.filter(function (x) { return x.id && x.id.indexOf('expanded-') === 0; })[0] || list[0]; if (p) window.__APP__.UI.openDetail(p); return p && (p.n + ' / ' + p.id); })()"));
  await sleep(2600);
  await shot('04-place.png');
  await evalJS("(() => { const d = document.querySelector('#detailDialog'); if (d && d.open) d.close(); return 'ok'; })()");
  await sleep(600);

  await scrollTo('#ai', -70);
  await evalJS("window.__APP__.UI.sendQuestion('翠湖公园要门票吗？')");
  await sleep(7000);
  await scrollLast();
  await shot('05-ai-1.png');
  await evalJS("window.__APP__.UI.sendQuestion('那要预约吗？')");
  await sleep(6000);
  await evalJS("window.__APP__.UI.sendQuestion('从哪个门进？')");
  await sleep(6500);
  await scrollLast();
  await shot('06-ai-3.png');

  console.log('chongqing:', await evalJS("(() => { const c = window.__APP__.DATA.searchCities('重庆',1)[0]; window.__APP__.UI.setCity(c,{fromUser:true}); return c && c.name; })()"));
  await sleep(2800);
  await evalJS("window.__APP__.UI.sendQuestion('重庆两天怎么安排？')");
  await sleep(9000);
  await scrollLast();
  await shot('07-ai-plan.png');

  await scrollTo('#verify', -80);
  await evalJS(`(() => {
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; };
    set('#feePeople', '2'); set('#feeQuote', '1280'); set('#feeExtra', '300');
    const b = document.querySelector('#btnFeeCheck') || document.querySelector('#feeForm button');
    if (b) b.click();
    return 'ok';
  })()`);
  await sleep(1600);
  await shot('08-verify.png');

  await evalJS("document.querySelector('#btnTheme').click()");
  await sleep(900);
  await evalJS("window.scrollTo({top:0,behavior:'instant'})");
  await sleep(1500);
  await shot('09-dark.png');
  await evalJS("document.querySelector('#btnTheme').click()");
  await sleep(700);

  await send('Browser.close');
} catch (e) {
  console.error('FAILED', e.message);
  process.exitCode = 2;
}
process.exit(process.exitCode || 0);
