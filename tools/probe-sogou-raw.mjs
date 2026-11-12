// 看搜狗现在返回什么（反爬？）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = process.argv[2] || '翠湖公园 门票';
const r = await fetch('https://www.sogou.com/web?query=' + encodeURIComponent(q), {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', accept: 'text/html' }
});
const html = await r.text();
console.log('status', r.status, 'len', html.length);
const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1];
console.log('title:', t.trim().slice(0, 100));
console.log('has 验证码:', /验证码|antispider|captcha/i.test(html));
console.log('text head:', html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
