// 用 server.mjs 同款解析逻辑测 360（通用查询）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = process.argv[2] || '翠湖公园 门票 开放时间';
const r = await fetch('https://www.so.com/s?q=' + encodeURIComponent(q) + '&pn=1', {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
});
const html = await r.text();
console.log('status', r.status, 'len', html.length, '验证', /安全验证|人机验证/.test(html));
const blocks = html.split(/class="res-list"/).slice(1);
console.log('blocks', blocks.length);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
let ok = 0;
blocks.slice(0, 5).forEach((b, i) => {
  const m = b.match(/<h3 class="res-title">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const real = (b.match(/data-mdurl="([^"]+)"/i) || [, ''])[1];
  console.log(`  #${i} match=${!!m} real=${real.slice(0, 60)}`);
  if (m) { ok++; console.log('     title:', text(m[2]).slice(0, 60)); }
  else console.log('     head:', b.slice(0, 300).replace(/\s+/g, ' '));
});
console.log('parsed', ok);
