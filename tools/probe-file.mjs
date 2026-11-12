// 直接问页面：脚本都执行了吗？全局对象在不在？
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';

const url = process.argv[2];
const port = 9501;
const profile = `${process.env.TEMP}\\ax-probe-prof`;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', detached: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(4000);
const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise(r => ws.onopen = r);
const t = await send('Target.createTarget', { url });
const at = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
const sid = at.result.sessionId;
await send('Runtime.enable', {}, sid);
await sleep(6000);
const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ready: document.body.className, scripts: document.scripts.length,
    DATA: typeof window.DATA, CFG: typeof window.CFG, UI: typeof window.UI, APP: typeof window.__APP__,
    atlas: !!document.getElementById('atlas-data'), photos: typeof window.__PHOTOS__,
    tiles: document.querySelectorAll('.leaflet-tile').length,
    cards: document.querySelectorAll('#placeList .place-item').length,
    stamp: (document.getElementById('buildStamp') || {}).textContent,
    pill: (document.getElementById('pillMap') || {}).textContent})`,
  returnByValue: true, awaitPromise: false,
}, sid);
console.log(probe.result?.result?.value || JSON.stringify(probe));
ws.close();
process.exit(0);
