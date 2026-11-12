/* tools/test-netlify.mjs — 不部署，直接在 Node 里调用 netlify/functions/*.mjs
 *
 * Netlify Functions v2 就是「Request 进、Response 出」，Node 22 原生有这两个全局对象，
 * 所以可以在本地把每个接口跑一遍，验证 import 路径、环境变量读取、以及检索/官方渠道是否通。
 *
 * 用法：
 *   node tools/test-netlify.mjs                # 测 health / search / official / page
 *   BOCHA_API_KEY=xxx node tools/test-netlify.mjs
 *   node tools/test-netlify.mjs --chat         # 额外测 /api/chat（需要 MODEL_* 环境变量）
 */
const which = process.argv.includes('--chat') ? ['health', 'search', 'official', 'page', 'chat'] : ['health', 'search', 'official', 'page'];

const mods = {
  health: ['/api/health', 'GET', null],
  search: ['/api/search?q=' + encodeURIComponent('翠湖公园 门票') + '&city=' + encodeURIComponent('昆明'), 'GET', null],
  official: ['/api/official?q=' + encodeURIComponent('翠湖公园 门票') + '&city=' + encodeURIComponent('昆明'), 'GET', null],
  page: ['/api/page?url=' + encodeURIComponent('https://www.kmwh.gov.cn/'), 'GET', null],
  chat: ['/api/chat', 'POST', { messages: [{ role: 'user', content: '只回一个词：在' }], max_tokens: 120 }]
};

function brief(name, data) {
  if (name === 'health') return JSON.stringify(data.capabilities);
  if (name === 'search') return 'ok=' + data.ok + ' via=' + data.via + ' n=' + (data.results || []).length + ' | ' + ((data.results || [])[0] || {}).title;
  if (name === 'official') return 'ok=' + data.ok + ' via=' + data.via + ' n=' + (data.sources || []).length + ' | ' + ((data.sources || [])[0] || {}).host + ' 正文' + String(((data.sources || [])[0] || {}).text || '').length + '字';
  if (name === 'page') return 'ok=' + data.ok + ' title=' + data.title + ' 正文' + String(data.text || '').length + '字';
  if (name === 'chat') return 'choices=' + JSON.stringify((data.choices || [{}])[0].message || data.reason || '').slice(0, 120);
  return JSON.stringify(data).slice(0, 160);
}

for (const name of which) {
  const [path, method, payload] = mods[name];
  const t0 = Date.now();
  try {
    const mod = await import('../netlify/functions/' + name + '.mjs');
    const req = new Request('http://localhost' + path, {
      method,
      headers: payload ? { 'content-type': 'application/json' } : {},
      body: payload ? JSON.stringify(payload) : undefined
    });
    const res = await mod.default(req, { ip: '127.0.0.1' });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
    console.log('[' + name + '] ' + res.status + ' ' + (Date.now() - t0) + 'ms  ' + brief(name, data));
  } catch (e) {
    console.log('[' + name + '] 失败 ' + (Date.now() - t0) + 'ms  ' + (e && e.message ? e.message : e));
  }
}
