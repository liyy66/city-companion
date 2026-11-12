import fs from 'node:fs';

const src = process.argv[2];
const txt = fs.readFileSync(src, 'utf8');
const m = /<script id="atlasEmbeddedData"[^>]*>/.exec(txt);
const start = m.index + m[0].length;
const end = txt.indexOf('</script>', start);
const data = JSON.parse(txt.slice(start, end));

const c = data.cities.cities;
console.log('type', Array.isArray(c) ? 'array' : typeof c, 'len', Array.isArray(c) ? c.length : Object.keys(c).length);
const first = Array.isArray(c) ? c[0] : c[Object.keys(c)[0]];
console.log('first:', JSON.stringify(first).slice(0, 800));
if (Array.isArray(c)) {
  console.log('names sample:', c.slice(0, 8).map(x => x.name || x.city || x.n));
  const cq = c.find(x => /重庆/.test(JSON.stringify(x).slice(0, 200)));
  console.log('cq:', JSON.stringify(cq).slice(0, 800));
}
const a = data.attractions.cities;
console.log('\nattractions type', Array.isArray(a) ? 'array' : typeof a);
if (!Array.isArray(a)) {
  const ks = Object.keys(a);
  console.log('n cities', ks.length, ks.slice(0, 12));
  console.log('sample', JSON.stringify(a[ks[0]]).slice(0, 900));
} else {
  console.log('len', a.length, JSON.stringify(a[0]).slice(0, 900));
}
const sm = data['city-street-maps'];
console.log('\nstreet-maps keys', Object.keys(sm));
const smc = sm.cities;
console.log('sm cities type', Array.isArray(smc) ? 'array' : typeof smc, Array.isArray(smc) ? smc.length : Object.keys(smc).length);
const sms = Array.isArray(smc) ? smc[0] : smc[Object.keys(smc)[0]];
console.log('sm sample:', JSON.stringify(sms).slice(0, 600).replace(/data:image[^"]{0,40}/g, 'DATAURI'));
