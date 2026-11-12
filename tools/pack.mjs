/* pack.mjs — 打一个「拷到另一台电脑就能跑」的部署包
 * 产物：dist/城市安心游-部署包.zip（含 HTML、server.mjs、说明、两个启动 bat）
 * 用法：node tools/pack.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const HTML = path.join(DIST, '城市安心游.html');
const PKG = path.join(DIST, '部署包');
const ZIP = path.join(DIST, '城市安心游-部署包.zip');

if (!fs.existsSync(HTML)) {
  console.error('还没有 dist/城市安心游.html，先跑 node tools/build.mjs');
  process.exit(1);
}

fs.rmSync(PKG, { recursive: true, force: true });
fs.mkdirSync(PKG, { recursive: true });
fs.rmSync(ZIP, { force: true });

const copy = (from, to) => fs.copyFileSync(from, to);
copy(HTML, path.join(PKG, '城市安心游.html'));
copy(path.join(ROOT, 'server.mjs'), path.join(PKG, 'server.mjs'));
copy(path.join(ROOT, '接入千问4B.md'), path.join(PKG, '接入千问4B.md'));

/* bat 用纯 ASCII 正文 + CRLF：cmd 在某些机器上按 GBK 读文件，中文会变乱码，
   所以提示语用英文，文件名才用中文。 */
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');

const batLocal = crlf(`@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install from https://nodejs.org
  pause
  exit /b 1
)
REM ==== Edit the two lines below if your model name differs (check: ollama list) ====
set MODEL_BASE_URL=http://127.0.0.1:11434/v1
set MODEL_NAME=qwen3:4b
REM =================================================================================
echo Starting local service on http://127.0.0.1:8787/
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8787/"
node server.mjs
echo.
echo Server stopped. If it failed, run "node server.mjs" in this folder to see the error.
pause
`);
fs.writeFileSync(path.join(PKG, '启动-本机模型.bat'), batLocal, 'utf8');

const batLan = crlf(`@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install from https://nodejs.org
  pause
  exit /b 1
)
REM ==== Set this to THIS computer's LAN IP and your model name ====
set MODEL_BASE_URL=http://192.168.1.50:11434/v1
set MODEL_NAME=qwen3:4b
REM ================================================================
set HOST=0.0.0.0
set PORT=8787
echo Serving on http://%HOST%:%PORT%/  (open it from the other computer)
echo Local check: http://127.0.0.1:%PORT%/
node server.mjs
echo.
echo Server stopped. If it failed, run "node server.mjs" in this folder to see the error.
pause
`);
fs.writeFileSync(path.join(PKG, '启动-连另一台电脑.bat'), batLan, 'utf8');

const readme = crlf(`城市安心游 · 部署包
=====================

1) 先装 Node.js 18 或更新版本：https://nodejs.org
2) 双击「启动-本机模型.bat」（模型就在这台电脑上）
   或双击「启动-连另一台电脑.bat」（先用记事本把里面的 IP 改成模型那台电脑的 IP）
3) 浏览器会自动打开 http://127.0.0.1:8787/
4) 详细说明见「接入千问4B.md」

只想要一个离线能看的作品：直接双击「城市安心游.html」即可（联网检索与模型需要 server.mjs）。
`);
fs.writeFileSync(path.join(PKG, 'README.txt'), readme, 'utf8');

execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path '${PKG}\\*' -DestinationPath '${ZIP}' -Force`
], { stdio: 'inherit' });

const size = fs.statSync(ZIP).size;
console.log('部署包 ' + ZIP);
console.log('  大小 ' + (size / 1024 / 1024).toFixed(2) + ' MB');
console.log('  内容 ' + fs.readdirSync(PKG).join(' · '));
