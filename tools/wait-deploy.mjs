// 等 Netlify 用新提交重建，然后跑四项验收
const SITE = 'city-compition.netlify.app';
const BASE = 'https://' + SITE;
const API = `https://api.netlify.com/api/v1/sites/${SITE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deployState() {
  const d = await (await fetch(`${API}/deploys?per_page=2`)).json();
  return d.map((x) => ({ state: x.state, commit: String(x.commit_ref).slice(0, 7), at: x.created_at }));
}

(async () => {
  for (let i = 1; i <= 24; i++) {
    const ds = await deployState();
    const h = await (await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(15000) }).catch(() => null))?.json().catch(() => null);
    console.log(`[${i}]`, JSON.stringify(ds[0]), '| chat:', h?.capabilities?.chat);
    if (h?.capabilities?.chat) { console.log('READY'); break; }
    await sleep(10000);
  }
  const h = await (await fetch(BASE + '/api/health')).json();
  console.log('CAPS', JSON.stringify(h.capabilities));
  const p = await fetch(BASE + '/');
  console.log('PAGE', p.status, ((await p.text()).length / 1048576).toFixed(2) + 'MB');
  const c = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ messages: [{ role: 'user', content: '只回两个字：正常' }], max_tokens: 8 }),
    signal: AbortSignal.timeout(60000),
  });
  console.log('CHAT', c.status, (await c.text()).slice(0, 100).replace(/\s+/g, ' '));
})();
