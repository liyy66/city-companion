/* tools/check-site-model.mjs — 端到端验证「站点内置模型」：
 *   1) 起假模型（8899）
 *   2) 起 server.mjs（8790，MODEL_* 走环境变量，模拟 Cloudflare 的 Variables）
 *   3) 用 headless Chrome 打开页面，确认 /api/health 报 chat:true、顶栏变成「站点模型」
 *   4) 直接调 AI.ask 问一句，确认走的是模型（mode=model）且答的是模型内容
 * 用法: node tools/check-site-model.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mock = spawn(process.execPath, ['tools/mock-openai.mjs', '8899'], { stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.mjs'], {
  stdio: 'ignore',
  env: {
    ...process.env,
    PORT: '8790',
    MODEL_BASE_URL: 'http://127.0.0.1:8899/v1',
    MODEL_NAME: 'mock-guide',
    MODEL_API_KEY: 'sk-mock'
  }
});

const PORT = 9412;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-site-'));
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p));
const child = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--disable-gpu', '--window-size=1440,960'
], { stdio: 'ignore' });

function cleanup(code) {
  try { ws && ws.close(); } catch { /* ignore */ }
  child.kill(); srv.kill(); mock.kill();
  setTimeout(() => process.exit(code), 300);
}

let ws = null;
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res) => pending.set(mid, res));
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result && r.result.result && r.result.result.value;
}

try {
  // 等两个服务起来
  for (let i = 0; i < 40; i++) {
    try {
      const h = await fetch('http://127.0.0.1:8790/api/health').then((r) => r.json());
      if (h.ok) break;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  const health = await fetch('http://127.0.0.1:8790/api/health').then((r) => r.json());
  console.log('[health]', JSON.stringify(health.capabilities));

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) break;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  const created = await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
  ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener('open', res, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8790/' });
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate("document.body.classList.contains('is-ready')").catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(1200);

  const pills = await evaluate(`({ model: (document.getElementById('pillModel')||{}).textContent, site: CFG.siteModel(), ready: CFG.modelReady(), footer: (document.getElementById('footerStatus')||{}).textContent })`);
  console.log('[pills]', JSON.stringify(pills));

  const ans = await evaluate(`(async () => {
    UI.setCity(DATA.resolveCity('昆明'), {silent:true});
    const a = await window.__APP__.AI.ask('翠湖要票不？');
    return { mode: a.mode, lead: a.lead, blocks: (a.blocks||[]).length, cites: (a.cites||[]).length, err: a.modelError || '' };
  })()`);
  console.log('[ask]', JSON.stringify(ans));

  const ok = health.capabilities.chat === true && ans.mode === 'model' && (ans.blocks || 0) > 0;
  console.log(ok ? 'OK 站点内置模型链路可用' : 'FAIL 站点内置模型链路异常');
  cleanup(ok ? 0 : 1);
} catch (e) {
  console.error('ERR', e.message);
  cleanup(1);
}
