// 线上自检：健康、首屏体积、构建号、模型连通性
const base = 'https://city-compition.netlify.app';

const health = await (await fetch(base + '/api/health')).json();
console.log('health', health.ok, JSON.stringify(health.capabilities));

const res = await fetch(base + '/');
const html = await res.text();
const build = (html.match(/"id":"([0-9a-f]{7})"/) || [])[1] || '(未找到)';
console.log('page', res.status, (html.length / 1048576).toFixed(2) + 'MB', 'build', build);

const chat = await fetch(base + '/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ messages: [{ role: 'user', content: '只回两个字：正常' }], max_tokens: 8 }),
});
console.log('chat', chat.status, (await chat.text()).slice(0, 80));

const boundary = await fetch(base + '/api/boundary?adcode=500000');
console.log('boundary', boundary.status, (await boundary.text()).length + 'B');
