const r = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/all.json', { signal: AbortSignal.timeout(20000) });
const t = await r.text();
console.log('len', t.length, 'head', t.slice(0, 400));
try { const j = JSON.parse(t); console.log('typeof', Array.isArray(j)?'array':typeof j, Array.isArray(j)?j.length:Object.keys(j).slice(0,10)); if(Array.isArray(j)) console.log(JSON.stringify(j[0]).slice(0,300)); } catch(e){ console.log('parse fail', e.message); }
