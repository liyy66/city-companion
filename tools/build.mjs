/* build.mjs — 把 src/ 打进一个可以直接双击打开的 HTML */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, '城市安心游.html');
// SPLIT=1：实拍图外链（线上用），默认内联（本地单文件用）
const SPLIT = process.env.SPLIT === '1';

const read = (p) => fs.readFileSync(p, 'utf8');
const bytes = (p) => fs.readFileSync(p);
const kb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';

function escScript(s) {
  return s.replace(/<\/script/gi, '<\\/script');
}

function jsonForHtml(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028|\u2029/g, (c) =>
    c === '\u2028' ? '\\u2028' : '\\u2029');
}

let html = read(path.join(SRC, 'shell.html'));

/* 1. 样式内联 */
let cssCount = 0;
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const p = path.join(SRC, href);
  if (!fs.existsSync(p)) throw new Error('找不到样式：' + href);
  cssCount++;
  return '<style>\n/* ' + href + ' */\n' + read(p).replace(/<\/style/gi, '<\\/style') + '\n</style>';
});

/* 2. 脚本内联 */
let jsCount = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const p = path.join(SRC, src);
  if (!fs.existsSync(p)) throw new Error('找不到脚本：' + src);
  jsCount++;
  return '<script>\n/* ' + src + ' */\n' + escScript(read(p)) + '\n</script>';
});

/* 3. 实拍图 → base64 数据 URI，注入 window.__PHOTOS__ */
const photosDir = path.join(DATA, 'photos');
const photos = {};
let photoBytes = 0;
const photoList = fs.readdirSync(photosDir).sort().filter((f) => /\.webp$/i.test(f));
if (SPLIT) {
  fs.mkdirSync(path.join(DIST, 'photos'), { recursive: true });
  for (const f of photoList) {
    const dst = path.join(DIST, 'photos', f);
    fs.copyFileSync(path.join(photosDir, f), dst);
    photoBytes += fs.statSync(dst).size;
    photos['photos/' + f] = 'photos/' + f;
  }
} else {
  for (const f of photoList) {
    const buf = bytes(path.join(photosDir, f));
    photoBytes += buf.length;
    photos['photos/' + f] = 'data:image/webp;base64,' + buf.toString('base64');
  }
}

/* 4. 数据内联 */
const atlas = JSON.parse(read(path.join(DATA, 'atlas.json')));
const atlasJSON = jsonForHtml(atlas);

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const digest = crypto.createHash('sha1')
  .update(JSON.stringify(atlas.cities.length + ':' + atlas.pois.length + ':' + stamp))
  .digest('hex').slice(0, 6);

const inject =
  '<script>window.__PHOTOS__=' + JSON.stringify(photos) + ';</script>\n' +
  '<script>window.__BUILD__=' + JSON.stringify({
    at: stamp,
    id: digest,
    cities: atlas.cities.length,
    pois: atlas.pois.length,
    places: atlas.places.length,
    photos: Object.keys(photos).length
  }) + ';</script>\n';

html = html.replace('<script id="atlas-data" type="application/json">__ATLAS_DATA__</script>',
  inject + '<script id="atlas-data" type="application/json">' + atlasJSON + '</script>');

/* 5. 自检 */
const left = html.match(/application\/json">__ATLAS_DATA__/);
if (left) throw new Error('仍有占位符未替换：' + left.join(','));
if (!cssCount || !jsCount) throw new Error('内联数量异常：css=' + cssCount + ' js=' + jsCount);
if (html.includes('src="js/') || html.includes('href="css/')) throw new Error('仍有外部本地引用未内联');

fs.mkdirSync(DIST, { recursive: true });
// 清掉上一轮调试产物（e2e 截图、服务日志），否则会被一起当成公开静态资源
for (const name of fs.readdirSync(DIST)) {
  const p = path.join(DIST, name);
  if (name.startsWith('_') || /\.(log|err)$/i.test(name)) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* 忽略占用 */ }
  }
}
fs.writeFileSync(OUT, html, 'utf8');
// Cloudflare 静态资源默认把 / 映射到 index.html，所以再写一份同内容的 index.html
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
// 调试产物（截图、e2e 日志、服务日志）不要被当成公开资源上传
fs.writeFileSync(path.join(DIST, '.assetsignore'), [
  '# 构建时自动生成：只发布两个 HTML，调试产物一律不上传',
  '_*',
  '*.log',
  '*.err',
  '*.json',
  '部署包',
  ''
].join('\n'), 'utf8');

console.log('✓ 产出 ' + OUT);
console.log('  HTML 总计   ' + kb(Buffer.byteLength(html)));
console.log('  内联样式    ' + cssCount + ' 个');
console.log('  内联脚本    ' + jsCount + ' 个（外加数据与启动块）');
console.log('  内嵌数据    ' + kb(Buffer.byteLength(atlasJSON)) + ' · ' + atlas.cities.length + ' 城市 / ' +
  atlas.pois.length + ' 点位 / ' + atlas.places.length + ' 景点卡');
console.log('  实拍图片    ' + Object.keys(photos).length + ' 张 · ' + kb(photoBytes) + (SPLIT ? '（外链 dist/photos）' : '（base64 内联）'));
console.log('  构建号      ' + digest + ' @ ' + stamp);
