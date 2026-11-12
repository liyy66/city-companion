// 测试搜狗 site: 语法支持
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const qs = process.argv.slice(2);
for (const q of qs) {
  const r = await fetch('https://www.sogou.com/web?query=' + encodeURIComponent(q), {
    headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
  });
  const html = await r.text();
  const blocks = html.split(/class="vrwrap"/).slice(1);
  const rows = [];
  for (const b of blocks) {
    const m = b.match(/data-url="(https?:\/\/([^"\/]+)[^"]*)"/i);
    if (m) rows.push(m[2]);
  }
  console.log(`\n== ${q}  status=${r.status} blocks=${blocks.length}`);
  console.log('   hosts:', rows.slice(0, 8).join(', ') || '(none)');
}
