// 对本地页面逐个提问，打印 mode / lead / chips，用来回归「答不上来」的几类问题。
// 用法：node tools/ask-probe.mjs http://127.0.0.1:8787/ 9472
import { readFileSync, writeFileSync } from 'node:fs';

const [, , base = 'http://127.0.0.1:8787/', portArg = '9472'] = process.argv;
const port = Number(portArg);
const questions = JSON.parse(process.env.QUESTIONS || JSON.stringify([
  '巴黎凡尔赛宫门票多少',
  '说说黄仁勋最近的事情',
  '最近重庆发生的事',
  '重庆洪崖洞要门票吗',
]));

const wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;const ws = new WebSocket(wsUrl);
let id = 0; const waiters = new Map();
const banner = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') banner.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') banner.push('ERR ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
await new Promise(r => ws.onopen = r);

const t = await send('Target.createTarget', { url: 'about:blank' });
const at = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
const sid = at.result.sessionId;
await send('Runtime.enable', {}, sid);
await send('Page.enable', {}, sid);
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sid);

const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sid);
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result && r.result.result ? r.result.result.value : null;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 线上模型被限流时，用本地假模型验证「模型常识」这条链路是否接通
if (process.env.MOCK) {
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let q = '';
      try { q = JSON.parse(body).messages.map(m => m.content).join('\n'); } catch { /* ignore */ }
      const subject = /凡尔赛/.test(q) ? '凡尔赛宫' : (/黄仁勋/.test(q) ? '黄仁勋' : '重庆近况');
      const payload = {
        lead: `${subject}：这是模型根据自己知识给的回答（示例）。`,
        answers: [
          { title: '要点', lines: [{ t: `${subject}的基本情况我可以直接讲，但具体数字需要核实。` }, { t: '第二点补充说明。' }] },
        ],
        missing: [`需要核实：${subject}的最新票价/时间/公告`],
      };
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    });
  });
  srv.listen(8899);
  process.env.MOCK_ON = '1';
}

await send('Page.navigate', { url: base }, sid);
await sleep(3500);
const proxy = process.env.PROXY;
if (process.env.MOCK) {
  await ev(`(() => { const c = JSON.parse(localStorage.getItem('ax.v1.cfg') || '{}'); c.proxy = ''; c.baseUrl = 'http://127.0.0.1:8899/v1'; c.model = 'mock-guide'; c.modelKey = 'sk-mock'; localStorage.setItem('ax.v1.cfg', JSON.stringify(c)); return c.baseUrl; })()`);
  await send('Page.reload', {}, sid);
  await sleep(4000);
} else if (proxy) {
  await ev(`(() => { const c = JSON.parse(localStorage.getItem('ax.v1.cfg') || '{}'); c.proxy = ${JSON.stringify(proxy)}; localStorage.setItem('ax.v1.cfg', JSON.stringify(c)); return c.proxy; })()`);
  await send('Page.reload', {}, sid);
  await sleep(4000);
}
await ev(`new Promise(r => { if (window.__APP__) return r(1); const t = setInterval(() => { if (window.__APP__) { clearInterval(t); r(1); } }, 100); })`, true);
await ev(`(() => { UI.setCity(DATA.resolveCity('重庆'), { silent: true }); return 'ok'; })()`, true).catch(() => {});
await sleep(1500);
console.log('DIAG', await ev(`JSON.stringify({ ui: typeof UI, app: typeof window.__APP__, busy: !!(window.UI && UI.state && UI.state.chatBusy), cfg: localStorage.getItem('ax.v1.cfg') })`));

const out = [];
for (const q of questions) {
  const t0 = Date.now();
  let ans = null;
  for (let k = 0; k < 12 && !ans; k++) {
    ans = await ev(`UI.sendQuestion(${JSON.stringify(q)}).then(a => a ? ({ mode: a.mode, unverified: !!a.unverified, lead: a.lead, blocks: (a.blocks||[]).length, cites: (a.cites||[]).length, notes: (a.notes||[]).length, err: a.modelError || '' }) : null)`, true);
    if (!ans) await sleep(1500);
  }
  out.push({ q, ms: Date.now() - t0, ...(ans || { mode: 'NULL' }) });
  console.log(q, '=>', JSON.stringify(ans || { mode: 'NULL' }).slice(0, 260));
  if (!ans) console.log('LOG', (await ev(`(document.querySelector('#chatLog')||{}).innerText || ''`).catch(() => '')).slice(-400));
  await sleep(600);
}
writeFileSync('dist/_ask-probe.json', JSON.stringify(out, null, 1), 'utf8');
console.log('BANNER', banner.slice(0, 6).join('\n'));
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, sid);
writeFileSync('dist/_ask-probe.jpg', Buffer.from(shot.result.data, 'base64'));
ws.close();
process.exit(0);
