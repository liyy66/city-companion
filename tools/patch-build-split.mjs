/* 让 build.mjs 支持「图片外链」模式：SPLIT=1 时把实拍图写成 dist/photos/*.webp，
 * 只把相对路径注入 __PHOTOS__。线上（Netlify）用它把 9.5MB 的首屏降到 3MB 左右，
 * 图片等点开景点详情时再按需加载；本地双击版仍然默认内联，保持单文件。 */
import fs from 'node:fs';

const p = 'tools/build.mjs';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('const SPLIT')) {
  s = s.replace(
    "const OUT = path.join(DIST, '城市安心游.html');",
    "const OUT = path.join(DIST, '城市安心游.html');\n// SPLIT=1：实拍图外链（线上用），默认内联（本地单文件用）\nconst SPLIT = process.env.SPLIT === '1';"
  );
}

s = s.replace(
  `for (const f of fs.readdirSync(photosDir).sort()) {
  if (!/\\.webp$/i.test(f)) continue;
  const buf = bytes(path.join(photosDir, f));
  photoBytes += buf.length;
  photos['photos/' + f] = 'data:image/webp;base64,' + buf.toString('base64');
}`,
  `const photoList = fs.readdirSync(photosDir).sort().filter((f) => /\\.webp$/i.test(f));
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
}`
);

s = s.replace(
  "'  内嵌实拍    ' + Object.keys(photos).length + ' 张 · 原始 ' + kb(photoBytes) + ' → base64 ' +\n  kb(JSON.stringify(photos).length)",
  "'  实拍图片    ' + Object.keys(photos).length + ' 张 · ' + kb(photoBytes) + (SPLIT ? '（外链 dist/photos）' : '（base64 内联）')"
);

fs.writeFileSync(p, s);
console.log('SPLIT support:', s.includes('const SPLIT'), '| photos branch:', s.includes("if (SPLIT) {"));
