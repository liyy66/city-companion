/* e2e-model.mjs — 用一个假的 OpenAI 兼容模型（第一次故意回废话，第二次回合法 JSON）
   走一遍「页面 → /api/chat → 模型」的真实链路，验证小模型修复重试是否生效。
   用法：node tools/e2e-model.mjs      （需要先 node server.mjs，页面走 http://127.0.0.1:8787/）*/
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'http://127.0.0.1:8787/';
const MOCK_PORT = 8899;
const CDP_PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 假模型 ---------- */
let calls = 0;
const GOOD = JSON.stringify({
  lead: '昆明翠湖公园免费入园，不用买票。',
  answers: [{ title: '门票', lines: [{ t: '翠湖公园免费开放，直接进就行。', n: [1] }] }],
  missing: []
});
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    calls++;
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch {}
    const repairTurn = (body.messages || []).length > 2;
    const content = repairTurn ? GOOD : '嗯……翠湖应该是不用买票的，具体你可以去门口问问。';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock', object: 'chat.completion', model: body.model || 'mock-4b',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
    }));
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

/* ---------- Chrome + CDP ---------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ax-model-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1440,960', '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });

let ws = null, id = 0;
const pending = new Map();
const logs = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    pending.set(msg.id, { resolve, reject, method });
    ws.send(JSON.stringify(msg));
    setTimeout(() => { if (pending.has(msg.id)) { pending.delete(msg.id); reject(new Error('timeout ' + method)); } }, 30000);
  });
}
async function evaluate(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result.value;
}

try {
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try { up = (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { await sleep(250); }
  }
  if (!up) throw new Error('Chrome 调试端口没起来');
  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 失败')); });
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(p.method + ': ' + m.error.message)) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') logs.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
  };
  await send('Page.enable'); await send('Runtime.enable');

  await send('Page.navigate', { url: PAGE });
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!(window.__APP__ && document.body.classList.contains("is-ready"))', false)) break;
    await sleep(250);
  }

  const out = await evaluate(`(async () => {
    const A = window.__APP__;
    // NO_PATCH=1 时不改设置，用来验证「服务端用环境变量注入模型配置」这条路径
    if (!${JSON.stringify(!!process.env.NO_PATCH)}) {
      A.CFG.patch({ baseUrl: 'http://127.0.0.1:${MOCK_PORT}/v1', model: 'mock-4b', modelKey: 'x', proxy: location.origin });
    }
    A.AI.reset();
    await A.UI.setCity(A.DATA.resolveCity('昆明'), { silent: true });
    const a = await A.AI.ask('翠湖要票不？');
    const p = await A.NET.probeModel();
    return {
      mode: a.mode, lead: a.lead, modelError: a.modelError || null,
      blocks: (a.blocks || []).length, cites: (a.cites || []).length,
      probe: p
    };
  })()`);

  console.log('[模型链路]', JSON.stringify(out));
  console.log('[假模型调用次数]', calls, calls >= 2 ? '（首轮被拒、修复轮成功）' : '（没有触发重试）');
  console.log('[页面异常]', logs.length ? logs : 0);
  const ok = out && out.mode === 'model' && out.blocks > 0 && calls >= 2;
  console.log(ok ? '[结论] 通过：小模型输出不合格时会自动重试修复' : '[结论] 未通过');
  process.exitCode = ok ? 0 : 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  mock.close();
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
