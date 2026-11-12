import fs from 'node:fs';
const src = process.argv[2];
const txt = fs.readFileSync(src, 'utf8');
const m = /<script id="atlasEmbeddedData"[^>]*>/.exec(txt);
const start = m.index + m[0].length;
const data = JSON.parse(txt.slice(start, txt.indexOf('</script>', start)));

console.log('travel-guide cities:', Object.keys(data['travel-guide'].cities));
const tg = data['travel-guide'].cities;
const k = Object.keys(tg)[0];
console.log('tg sample:', JSON.stringify(tg[k]).slice(0, 1200));

console.log('\nextra-curated cities:', Object.keys(data['extra-curated'].cities).slice(0, 40));
console.log('extra sample:', JSON.stringify(Object.values(data['extra-curated'].cities)[0]).slice(0, 600));

const ch = data.countyHighlights;
console.log('\ncountyHighlights keys:', Object.keys(ch).slice(0, 5), 'n counties:', Object.keys(ch.counties||{}).length);
console.log('county sample:', JSON.stringify(Object.entries(ch.counties||{})[0]).slice(0, 600));

const osm = data['osm-national-pois'];
console.log('\nosm items:', osm.items.length, 'head:', JSON.stringify(osm.items[0]));
const cats = {};
for (const it of osm.items) cats[it.category || it.c] = (cats[it.category || it.c] || 0) + 1;
console.log('osm cats:', Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,20));

console.log('\nphoto count:', Object.keys(data.photos).length, 'albums:', Object.keys(data['photo-albums'].albums).length);
console.log('photoAlbums sample:', JSON.stringify(Object.entries(data['photo-albums'].albums)[0]).slice(0,500));
const pa = Object.keys(data.photoAssets);
console.log('asset keys sample:', pa.slice(0,5));
const sizes = pa.map(k => data.photoAssets[k].length);
console.log('asset total bytes:', sizes.reduce((a,b)=>a+b,0), 'avg', Math.round(sizes.reduce((a,b)=>a+b,0)/sizes.length));
console.log('chongqing-vector coverage:', data['chongqing-vector'].coverage);
const sm = data['city-street-maps'];
console.log('street map cities:', Object.keys(sm.cities), 'coverage', sm.coverage);
