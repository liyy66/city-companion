// 360 搜索：结构 + 是否反爬
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = process.argv[2] || '翠湖公园 门票 开放时间';
const r = await fetch('https://www.so.com/s?q=' + encodeURIComponent(q) + '&pn=1', {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
});
const html = await r.text();
console.log('status', r.status, 'len', html.length, 'res-list', (html.match(/class="res-list"/g) || []).length);
const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
console.log('title:', t.trim().slice(0, 80));
const blocks = html.split(/class="res-list"/).slice(1, 4);
blocks.forEach((b, i) => {
  console.log(`\n--- block ${i}`);
  console.log(b.slice(0, 900).replace(/\s+/g, ' '));
});
