// 打印搜狗结果的 DOM 片段，用来写解析器
const q = process.argv[2] || '云冈石窟 门票 开放时间';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const r = await fetch('https://www.sogou.com/web?query=' + encodeURIComponent(q), {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
});
const html = await r.text();
const blocks = html.split('class="vrwrap"').slice(1);
console.log('blocks', blocks.length);
const b = blocks[0];
console.log(b.slice(0, 1800).replace(/\s+/g, ' '));
