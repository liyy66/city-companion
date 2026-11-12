/* tools/mock-openai.mjs — 假的 OpenAI 兼容服务，用来验证「站点内置模型」链路
 * 用法: node tools/mock-openai.mjs [port]   默认 8899
 * 第一次回复废话（验证重试修复），之后回复合法 JSON（带证据编号 1）。
 */
import http from 'node:http';

const port = Number(process.argv[2] || 8899);
let calls = 0;

const good = {
  lead: '昆明翠湖公园免费开放，不用买门票。',
  answers: [{ title: '门票与价格', lines: [{ t: '翠湖公园是免费开放的城市公园。', n: [1] }] }],
  missing: []
};

http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, calls }));
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    calls++;
    const text = calls === 1 ? '好的，我来回答一下这个问题。' : JSON.stringify(good);
    const payload = {
      id: 'mock-' + calls,
      object: 'chat.completion',
      model: 'mock-guide',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
}).listen(port, '127.0.0.1', () => console.log('mock openai on http://127.0.0.1:' + port));
