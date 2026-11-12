// 录制专用：把本地页面的 /api/* 转发到线上，并把 Origin 改写成线上站点
// 线上函数有「只允许本站页面调用」的同源校验，本地录制需要它放行。
// 用法：node tools/live-proxy.mjs [port]
import http from 'node:http';

const PORT = Number(process.argv[2] || 8788);
const UP = process.env.UP || 'https://city-companion.netlify.app';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const target = UP + url.pathname + url.search;
  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
    origin: UP,
    referer: UP + '/',
    accept: 'application/json',
  };
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }
  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'cache-control': 'no-store',
    });
    res.end(buf);
    console.log(req.method, url.pathname, upstream.status, buf.length + 'B');
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: false, reason: '转发失败：' + e.message }));
    console.log(req.method, url.pathname, 'ERR', e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log('live-proxy on', PORT, '->', UP));
