// 检查线上是否已经是新构建
const id = process.argv[2] || '';
const res = await fetch('https://city-companion.netlify.app/');
const t = await res.text();
const m = /"id":"([0-9a-f]{6})"/.exec(t);
console.log('status', res.status, 'len', t.length, 'build', m ? m[1] : 'n/a', 'match', id ? t.includes(id) : 'n/a');
