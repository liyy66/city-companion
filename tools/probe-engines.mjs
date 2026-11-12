// 探测本机可用的国内检索源（服务端 fetch）
// node tools/probe-engines.mjs
const q = process.argv[2] || '云冈石窟 门票 开放时间';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const engines = {
  sogou: 'https://www.sogou.com/web?query=' + encodeURIComponent(q),
  so360: 'https://www.so.com/s?q=' + encodeURIComponent(q),
  baidu: 'https://www.baidu.com/s?wd=' + encodeURIComponent(q) + '&rn=10',
  bing: 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=zh-CN',
  bingcn: 'https://cn.bing.com/search?q=' + encodeURIComponent(q)
};

for (const [name, url] of Object.entries(engines)) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
    });
    const buf = Buffer.from(await r.arrayBuffer());
    clearTimeout(t);
    const html = buf.toString('utf8');
    const markers = {
      sogou: /class="vrwrap"/g, so360: /class="res-list"/g,
      baidu: /class="result c-container/g, bing: /<li class="b_algo"/g, bingcn: /<li class="b_algo"/g
    };
    const n = (html.match(markers[name]) || []).length;
    console.log(`\n== ${name} ${r.status} len=${html.length} blocks=${n}`);
    // 抓前 3 个标题
    const titles = [...html.matchAll(/<h3[^>]*>([\s\S]{0,300}?)<\/h3>/g)].slice(0, 3).map(m => text(m[1]).slice(0, 60));
    titles.forEach(x => console.log('   -', x));
  } catch (e) {
    console.log(`\n== ${name} FAILED: ${e.message}`);
  }
}
