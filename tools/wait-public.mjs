// 轮询新站是否已公开；一旦 200 就跑四项验收（health / page / boundary / 三条问题）
const BASE = 'https://city-compition.netlify.app';
const ORIGIN = BASE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function head() {
  try {
    const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch (e) {
    return 'ERR ' + e.message.slice(0, 40);
  }
}

async function chat(question) {
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是旅游向导，回答不超过 40 字。' },
        { role: 'user', content: question },
      ],
      max_tokens: 120,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 120).replace(/\s+/g, ' ') };
}

(async () => {
  for (let i = 1; i <= 18; i++) {
    const s = await head();
    console.log(`[${i}] health ${s}`);
    if (s === 200) {
      const h = await (await fetch(BASE + '/api/health')).json();
      console.log('CAPS', JSON.stringify(h.capabilities));
      const p = await fetch(BASE + '/');
      const body = await p.text();
      console.log('PAGE', p.status, (body.length / 1048576).toFixed(2) + 'MB');
      const b = await fetch(BASE + '/api/boundary?adcode=500000');
      console.log('BOUNDARY', b.status, (await b.text()).length + 'B');
      for (const q of ['巴黎凡尔赛宫门票多少', '说说黄仁勋最近的事情', '重庆洪崖洞要门票吗']) {
        console.log('CHAT', q, JSON.stringify(await chat(q)));
      }
      return;
    }
    await sleep(10000);
  }
  console.log('STILL_PRIVATE');
})();
