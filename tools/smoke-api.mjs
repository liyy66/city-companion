/* tools/smoke-api.mjs — 本地/线上接口冒烟：health → search → official
 * 用法: node tools/smoke-api.mjs [base]   默认 http://127.0.0.1:8787
 */
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const q = '翠湖公园 门票';

async function j(url, opts) {
  const t = Date.now();
  const r = await fetch(url, opts);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: r.status, ms: Date.now() - t, body };
}

const health = await j(base + '/api/health');
console.log('[health]', health.status, health.ms + 'ms', JSON.stringify(health.body.capabilities || health.body));

const s = await j(base + '/api/search?q=' + encodeURIComponent(q) + '&city=' + encodeURIComponent('昆明'));
console.log('[search]', s.status, s.ms + 'ms', 'via=' + (s.body.via || '-'), 'n=' + ((s.body.results || []).length),
  (s.body.results || []).slice(0, 3).map((x) => x.title).join(' | '));

const o = await j(base + '/api/official?q=' + encodeURIComponent(q) + '&city=' + encodeURIComponent('昆明'));
console.log('[official]', o.status, o.ms + 'ms', 'ok=' + o.body.ok, 'via=' + (o.body.via || '-'),
  'n=' + ((o.body.sources || []).length));
for (const src of (o.body.sources || [])) {
  console.log('   -', src.host, '|', src.title, '| 正文', (src.text || '').length, '字');
}
if (!o.body.ok) console.log('   reason:', o.body.reason);
