// 把已构建好的产物整理成可提交的静态目录 site/（给 Netlify 直接发布，跳过构建）
import { existsSync, mkdirSync, rmSync, copyFileSync, cpSync, statSync } from 'node:fs';

const root = process.cwd();
const html = `${root}/dist/城市安心游.html`;
if (!existsSync(html)) {
  console.error('先跑 SPLIT=1 node tools/build.mjs');
  process.exit(1);
}
rmSync(`${root}/site`, { recursive: true, force: true });
mkdirSync(`${root}/site`, { recursive: true });
copyFileSync(html, `${root}/site/index.html`);
if (existsSync(`${root}/dist/photos`)) cpSync(`${root}/dist/photos`, `${root}/site/photos`, { recursive: true });

const size = (p) => (statSync(p).size / 1048576).toFixed(2) + 'MB';
console.log('site/index.html', size(`${root}/site/index.html`));
console.log('site/photos', existsSync(`${root}/site/photos`) ? 'ok' : 'missing');
