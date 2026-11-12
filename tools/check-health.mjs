/* tools/check-health.mjs — 验证「访客打开页面就自动连上站点能力」
 * 用法: node tools/check-health.mjs [url]   默认 http://127.0.0.1:8787/
 * 会打印 page 实际拿到的 /api/health、footer 文案、pillModel 文案。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const target = process.argv[2] || 'http://127.0.0.1:8787/';
const PORT = 9411;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-health-'));
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
].find((p) => p && fs.existsSync(p));
if (!chrome) { console.error('找不到 Chrome'); process.exit(1); }

const child = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--disable-gpu', '--window-size=1440,960'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) return;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口没起来');
}

await waitDevtools();
const created = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res) => pending.set(mid, res));
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result && r.result.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: target });
for (let i = 0; i < 80; i++) {
  const ready = await evaluate("document.body.classList.contains('is-ready')").catch(() => false);
  if (ready) break;
  await sleep(250);
}
await sleep(1500);

const out = await evaluate(`(async () => {
  const h = await NET.health();
  return {
    url: location.href,
    proxyBase: CFG.proxyBase(),
    health: h,
    siteModel: CFG.siteModel(),
    modelReady: CFG.modelReady(),
    footer: (document.getElementById('footerStatus') || {}).textContent,
    pillModel: (document.getElementById('pillModel') || {}).textContent
  };
})()`);
console.log(JSON.stringify(out, null, 2));

ws.close();
child.kill();
await sleep(300);
fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
