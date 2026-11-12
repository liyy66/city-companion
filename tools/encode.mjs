// 把录屏帧合成 mp4，并烧进中文字幕
// 用法：node tools/encode.mjs [videoDirName]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NAME = process.argv[2] || 'video';
const DIR = resolve(ROOT, 'dist', NAME);
const OUT = resolve(ROOT, 'dist', '交付', '城市安心游-演示视频.mp4');
mkdirSync(resolve(ROOT, 'dist', '交付'), { recursive: true });

const meta = JSON.parse(readFileSync(join(DIR, 'frames.json'), 'utf8'));
const { frames, marks } = meta;
const total = frames[frames.length - 1].t;

// concat 清单：每帧持续到下帧出现为止
const lines = ['ffconcat version 1.0'];
for (let i = 0; i < frames.length; i++) {
  const cur = frames[i];
  const next = frames[i + 1];
  let dur = (next ? next.t : cur.t + 2.2) - cur.t;
  dur = Math.min(Math.max(dur, 0.2), 3.5);
  lines.push(`file 'frames/${cur.file}'`);
  lines.push(`duration ${dur.toFixed(3)}`);
}
lines.push(`file 'frames/${frames[frames.length - 1].file}'`);
writeFileSync(join(DIR, 'concat.txt'), lines.join('\n'), 'utf8');

// 字幕文本文件（每个 mark 一条，避免在 filter 里转义中文）
const capDir = join(DIR, 'captions');
mkdirSync(capDir, { recursive: true });
const caps = marks.map((m, i) => ({
  i,
  start: m.t,
  end: i + 1 < marks.length ? marks[i + 1].t : total + 1,
  file: join(capDir, `c${i + 1}.txt`),
  text: m.text,
})).filter(c => c.text && c.text.trim());
caps.forEach(c => writeFileSync(c.file, c.text, 'utf8'));

const FONT = 'C\\:/Windows/Fonts/msyh.ttc';
const draw = caps.map(c =>
  `drawtext=fontfile='${FONT}':textfile='${c.file.replace(/\\/g, '/').replace(':', '\\:')}':` +
  `fontcolor=white:fontsize=34:box=1:boxcolor=0x0b1e1b@0.72:boxborderw=22:` +
  `x=(w-text_w)/2:y=h-132:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`
).join(',');

const vf = `scale=1920:1080:flags=lanczos,fps=25,${draw}`;

const ff = process.env.FFMPEG;
if (!ff) { console.error('请用 FFMPEG=<path> 指定 ffmpeg'); process.exit(1); }

const args = [
  '-y', '-hide_banner', '-loglevel', 'warning',
  '-f', 'concat', '-safe', '0', '-i', join(DIR, 'concat.txt'),
  '-vf', vf,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  OUT,
];
console.log('ffmpeg', args.slice(-4).join(' '));
const p = spawn(ff, args, { stdio: 'inherit' });
p.on('exit', code => {
  if (code === 0) {
    const st = existsSync(OUT);
    console.log('OK', OUT, st ? (readFileSync(OUT).length / 1048576).toFixed(1) + 'MB' : 'missing');
  } else console.error('ffmpeg exit', code);
  process.exit(code);
});
