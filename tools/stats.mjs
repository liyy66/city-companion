import fs from 'node:fs';

const src = process.argv[2];
const txt = fs.readFileSync(src, 'utf8');
const m = /<script id="atlasEmbeddedData"[^>]*>/.exec(txt);
const start = m.index + m[0].length;
const end = txt.indexOf('</script>', start);
const data = JSON.parse(txt.slice(start, end));

const sizes = {};
for (const k of Object.keys(data)) sizes[k] = JSON.stringify(data[k]).length;
console.log('sizes', sizes);

const cities = data.cities.cities;
console.log('cities:', Object.keys(cities).length);
console.log('city sample:', JSON.stringify(cities['重庆']).slice(0, 400));
console.log('has 西安?', !!cities['西安'], 'has 北京?', !!cities['北京']);

const attr = data.attractions.cities;
console.log('attraction cities:', Object.keys(attr).length);
const counts = Object.entries(attr).map(([c, v]) => [c, (v.items || v.list || v.attractions || v).length]).sort((a, b) => b[1] - a[1]);
console.log('top attr cities:', counts.slice(0, 15));
console.log('attr sample:', JSON.stringify(attr[Object.keys(attr)[0]]).slice(0, 700));

console.log('points.places:', data.points.places.length);
console.log('osm-national-pois count:', data['osm-national-pois'].count, 'items:', data['osm-national-pois'].items.length);
console.log('extra-curated cities:', Object.keys(data['extra-curated'].cities).length);
console.log('city-street-maps cities:', Object.keys(data['city-street-maps'].cities).length, Object.keys(data['city-street-maps'].cities).slice(0, 30));
const sm = data['city-street-maps'].cities[Object.keys(data['city-street-maps'].cities)[0]];
console.log('street map sample keys:', JSON.stringify(sm).slice(0, 300).replace(/data:image[^"]{0,60}/g, 'data:image...'));
console.log('travel-guide cities:', Object.keys(data['travel-guide'].cities).length);
console.log('photoAssets:', Object.keys(data.photoAssets).length);
console.log('photos keys:', Object.keys(data.photos).length);
console.log('chongqing-vector features:', data['chongqing-vector'].features.length);
