// 连当前 Chrome，截一张「模型常识 · 未核实」的图
import { writeFileSync } from 'node:fs';
const port = process.argv[2] || '9481';
const out = process.argv[3] || 'dist/shots/11-knowledge.png';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /city-compition/.test(t.url));
if (!page) { console.log('no page', list.map((t) => t.url)); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Runtime.evaluate', { expression: `(() => { const a = document.querySelectorAll('.msg.bot'); const last = [...a].find(x => /凡尔赛|黄仁勋/.test(x.textContent) && /模型常识/.test(x.textContent)) || a[a.length-1]; last.scrollIntoView({block:'center'}); return last.textContent.slice(0,60); })()` });
await new Promise((r) => setTimeout(r, 900));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
