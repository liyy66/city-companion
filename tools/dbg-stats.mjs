// 用 vm 在 Node 里跑 data.js，统计 placeById 的 kind 分布（排查 551 的口径）
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const atlas = JSON.parse(fs.readFileSync(new URL('data/atlas.json', root), 'utf8'));
const ctx = { console, window: null, document: { documentElement: { getAttribute: () => 'light' } } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['src/js/util.js', 'src/js/geo.js', 'src/js/data.js']) {
  vm.runInContext(fs.readFileSync(new URL(f, root), 'utf8'), ctx, { filename: f });
}
ctx.window.__ATLAS__ = atlas;
const I = ctx.DATA.build();
const kinds = {};
for (const p of I.placeById.values()) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log('placeById 总数:', I.placeById.size, kinds);
console.log('stats():', ctx.DATA.stats());
console.log('photoCount:', I.photoCount, '相册键:', Object.keys(I.photos || {}).length);
