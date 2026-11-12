const url = 'https://city-companion.netlify.app/?cb=' + Date.now();
const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
const t = await res.text();
const m = /"id":"([0-9a-f]{6})"/.exec(t);
console.log('status', res.status, 'len', t.length, 'build', m ? m[1] : 'n/a');
console.log('age', res.headers.get('age'), 'etag', res.headers.get('etag'), 'cache', res.headers.get('cache-control'));
