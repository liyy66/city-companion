// 本地假模型：验证前端「接入 AI 模型」链路（不消耗任何真实额度）
// 用法：node tools/mock-model.mjs [port]   默认 8799
import http from 'node:http';

const PORT = Number(process.argv[2] || 8799);

// 契约（src/js/ai.js validateModelJSON）：{ lead, answers:[{title, lines:[{t, n:[证据编号]}]}], missing:[…] }
// 证据编号来自提示词里 [n] 前缀，所以这里从请求体里捞出实际编号再回填。
function buildAnswer(prompt) {
  const nums = [...new Set((prompt.match(/\[(\d+)\]/g) || []).map((s) => Number(s.slice(1, -1))))].sort((a, b) => a - b);
  const n1 = nums[0] || 1;
  const n2 = nums[1] || n1;
  return {
    lead: '翠湖公园免费开放，不需要买门票，但节假日可能限流。',
    answers: [
      {
        title: '门票',
        lines: [
          { t: '翠湖公园常年免费开放，不售门票。', n: [n1] },
          { t: '官方页面写的是「免费面向市民开放」，节假日会有临时管控。', n: [n2] }
        ]
      },
      {
        title: '开放时间',
        lines: [{ t: '夏季大约 6:00–22:00，冬季会提前到 7:00 开园，以门口公告为准。', n: [n1] }]
      }
    ],
    missing: ['当天的临时闭园或限流公告']
  };
}

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith('/v1/models')) {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'mock-guide' }] }));
  }
  if (req.url.startsWith('/v1/chat/completions') && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let asked = '';
      try { asked = (JSON.parse(body).messages || []).map((m) => m.content).join('\n'); } catch {}
      // 只回 JSON；真实模型由提示词约束成同样结构
      const payload = {
        id: 'chatcmpl-mock', object: 'chat.completion', model: 'mock-guide',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(buildAnswer(asked)) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 800, completion_tokens: 160, total_tokens: 960 }
      };
      console.log('[mock] 收到请求 %d 字，证据块=%s', asked.length, (asked.match(/\[\d+\]/g) || []).length);
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
    return;
  }
  res.writeHead(404, cors);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[mock] 假模型已启动 http://127.0.0.1:' + PORT + '/v1');
});
