// 测 site:gov.cn 检索质量（360 / bing）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = process.argv[2] || 'site:gov.cn 翠湖公园 门票';

async function fetchT(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' } });
  return { status: r.status, html: await r.text() };
}
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const so = await fetchT('https://www.so.com/s?q=' + encodeURIComponent(q) + '&pn=1');
const blocks = so.html.split(/class="res-list"/).slice(1);
console.log('360', so.status, 'blocks', blocks.length);
blocks.slice(0, 6).forEach((b) => {
  const m = b.match(/<h3 class="res-title">[\s\S]*?<a[^>]*data-mdurl="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    || b.match(/<h3 class="res-title">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
  if (m) console.log('  -', text(m[2]).slice(0, 50), '|', m[1].slice(0, 70));
});

const bg = await fetchT('https://cn.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=zh-CN');
const bb = bg.html.split(/<li class="b_algo"/).slice(1);
console.log('\nbing', bg.status, 'blocks', bb.length);
bb.slice(0, 6).forEach((b) => {
  const m = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (m) console.log('  -', text(m[2]).slice(0, 50), '|', m[1].slice(0, 70));
});
