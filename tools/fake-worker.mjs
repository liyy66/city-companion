/* tools/fake-worker.mjs — 在 Node 里直接跑 worker/index.js 的路由
 * 目的：不依赖 workerd，先验证「/api/* 有没有被正确分发、静态资源有没有交给 ASSETS」。
 * 用法: node tools/fake-worker.mjs
 */
const mod = await import('../worker/index.js');
const worker = mod.default;

const assetsHits = [];
const env = {
  MODEL_BASE_URL: 'https://api.deepseek.com/v1',
  MODEL_NAME: 'deepseek-chat',
  MODEL_API_KEY: 'sk-test',
  ASSETS: {
    fetch(req) {
      assetsHits.push(new URL(req.url).pathname);
      return new Response('<html>asset</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
  }
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function hit(path, init) {
  const res = await worker.fetch(new Request('https://demo.pages.dev' + path, init), env, ctx);
  const text = await res.text();
  return { status: res.status, text };
}

const health = await hit('/api/health');
console.log('[health]', health.status, health.text.slice(0, 160));

const unknown = await hit('/api/nope');
console.log('[404 api]', unknown.status, unknown.text);

const pre = await hit('/api/chat', { method: 'OPTIONS' });
console.log('[options]', pre.status);

const page = await hit('/');
console.log('[static]', page.status, 'ASSETS hits =', JSON.stringify(assetsHits), page.text.slice(0, 30));

const chat = await hit('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://demo.pages.dev' },
  body: JSON.stringify({ messages: [] })
});
console.log('[chat 400]', chat.status, chat.text.slice(0, 120));

const ok = health.status === 200 && JSON.parse(health.text).capabilities.chat === true &&
  unknown.status === 404 && pre.status === 204 && page.status === 200 && chat.status === 400;
console.log(ok ? 'OK Worker 路由正确' : 'FAIL 路由异常');
process.exit(ok ? 0 : 1);
