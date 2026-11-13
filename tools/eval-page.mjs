// 在已开的页面里跑一段表达式（中文走文件，避免 PowerShell 编码问题）
// 用法：node tools/eval-page.mjs <port> <exprFile>
import { readFileSync } from 'node:fs';

const port = process.argv[2] || '9491';
const expr = readFileSync(process.argv[3], 'utf8');
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /8787|netlify/.test(t.url));
if (!page) { console.log('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(r.result ? r.result.value : r, null, 1));
ws.close();
