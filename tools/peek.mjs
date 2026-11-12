import fs from 'node:fs';

const src = process.argv[2];
const txt = fs.readFileSync(src, 'utf8');
const m = /<script id="atlasEmbeddedData"[^>]*>/.exec(txt);
const start = m.index + m[0].length;
const end = txt.indexOf('</script>', start);
const raw = txt.slice(start, end);
const data = JSON.parse(raw);

const keys = Object.keys(data);
console.log('top keys:', keys);
for (const k of keys) {
  const v = data[k];
  if (Array.isArray(v)) console.log(` ${k}: array[${v.length}] sample=`, JSON.stringify(v[0]).slice(0, 300));
  else if (v && typeof v === 'object') console.log(` ${k}: object keys=`, Object.keys(v).slice(0, 20), 'sample=', JSON.stringify(v[Object.keys(v)[0]]).slice(0, 400));
  else console.log(` ${k}:`, v);
}

const cities = data.cities;
console.log('\ncities keys:', Object.keys(cities).slice(0, 20));
const ck = Object.keys(cities).filter(k => k !== 'schema' && k !== 'source');
console.log('city count:', ck.length, 'first:', ck.slice(0, 10));
const c0 = cities[ck[0]];
console.log('city sample shape:', JSON.stringify(c0, null, 1).slice(0, 3000));
