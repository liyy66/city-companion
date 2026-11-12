// 调试 Bing 检索解析：node tools/probe-bing.mjs "昆明 翠湖公园 门票"
const q = process.argv[2] || '昆明 翠湖公园 门票';
const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=zh-CN&ensearch=0';
const r = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
});
const html = await r.text();
console.log('status', r.status, 'len', html.length, 'final', r.url);
const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
console.log('title:', title.trim().slice(0, 120));
console.log('b_algo count:', (html.match(/<li class="b_algo"/g) || []).length);
const first = html.indexOf('<li class="b_algo"');
console.log('sample:', html.slice(first, first + 700).replace(/\s+/g, ' '));
