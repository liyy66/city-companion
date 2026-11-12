const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = process.argv[2] || '翠湖公园 门票 开放时间';
const r = await fetch('https://www.so.com/s?q=' + encodeURIComponent(q) + '&pn=1', {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
});
const html = await r.text();
const blocks = html.split(/class="res-list"/).slice(1);
const b = blocks[2];
console.log('has h3:', b.indexOf('<h3'), 'res-title at:', b.indexOf('res-title'));
const i = b.indexOf('<h3');
console.log(JSON.stringify(b.slice(i, i + 160)));
const re = /<h3 class="res-title">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
console.log('regex test:', re.test(b));
const re2 = /<h3[^>]*class="res-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
console.log('regex2 test:', re2.test(b));
