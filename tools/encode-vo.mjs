// 把录屏帧合成带旁白的 mp4：按旁白长度拉伸分段，字幕与画面同步
// 用法：FFMPEG=... node tools/encode-vo.mjs [videoDirName]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NAME = process.argv[2] || 'video';
const DIR = resolve(ROOT, 'dist', NAME);
const VO = resolve(ROOT, 'dist', 'vo4');
const OUT = resolve(ROOT, 'dist', '交付', '城市安心游-演示视频.mp4');
mkdirSync(resolve(ROOT, 'dist', '交付'), { recursive: true });

const meta = JSON.parse(readFileSync(join(DIR, 'frames.json'), 'utf8'));
const { frames, marks } = meta;
const total = frames[frames.length - 1].t;

// WAV 时长：从头部算，别猜
function wavSeconds(file) {
  const b = readFileSync(file);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  let dataLen = b.length - 44;
  for (let i = 12; i < b.length - 8; i++) {
    if (b.toString('ascii', i, i + 4) === 'data') { dataLen = b.readUInt32LE(i + 4); break; }
  }
  return dataLen / (rate * channels * (bits / 8));
}

const voFile = (i) => join(VO, `vo${i + 1}.wav`);
const segStart = marks.map((m) => m.t);
const segOrig = marks.map((m, i) => (i + 1 < marks.length ? marks[i + 1].t : total) - m.t);

// 每一段：有旁白就至少留出旁白长度 + 0.7s 余量
const segDur = segOrig.map((d, i) => {
  if (!existsSync(voFile(i))) return d;
  return Math.max(d, wavSeconds(voFile(i)) + 0.7);
});
const starts = [];
let acc = 0;
for (let i = 0; i < segDur.length; i++) { starts.push(acc); acc += segDur[i]; }
const newTotal = acc;

// 帧重定时：段内按比例拉伸
const lines = ['ffconcat version 1.0'];
const bySeg = segDur.map(() => []);
for (const f of frames) {
  const i = segStart.reduce((best, s, idx) => (f.t >= s ? idx : best), 0);
  bySeg[i].push(f);
}
for (let i = 0; i < bySeg.length; i++) {
  const seg = bySeg[i];
  const scale = segDur[i] / segOrig[i];
  for (let k = 0; k < seg.length; k++) {
    const local = seg[k].t - segStart[i];
    const nextLocal = k + 1 < seg.length ? seg[k + 1].t - segStart[i] : segOrig[i] + 0.5;
    let dur = (nextLocal - local) * scale;
    dur = Math.min(Math.max(dur, 0.2), 3.5);
    lines.push(`file 'frames/${seg[k].file}'`);
    lines.push(`duration ${dur.toFixed(3)}`);
  }
}
lines.push(`file 'frames/${bySeg[bySeg.length - 1].slice(-1)[0].file}'`);
writeFileSync(join(DIR, 'concat-vo.txt'), lines.join('\n'), 'utf8');

// 字幕
const capDir = join(DIR, 'captions');
mkdirSync(capDir, { recursive: true });
const caps = marks.map((m, i) => ({
  i,
  start: starts[i],
  end: i + 1 < marks.length ? starts[i + 1] : newTotal + 1,
  file: join(capDir, `c${i + 1}.txt`),
  text: m.text,
})).filter((c) => c.text && c.text.trim());
caps.forEach((c) => writeFileSync(c.file, c.text, 'utf8'));

const FONT = 'C\\:/Windows/Fonts/msyh.ttc';
const draw = caps.map((c) =>
  `drawtext=fontfile='${FONT}':textfile='${c.file.replace(/\\/g, '/').replace(':', '\\:')}':` +
  `fontcolor=white:fontsize=34:box=1:boxcolor=0x0b1e1b@0.72:boxborderw=22:` +
  `x=(w-text_w)/2:y=h-132:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`
).join(',');

const ff = process.env.FFMPEG;
if (!ff) { console.error('请用 FFMPEG=<path> 指定 ffmpeg'); process.exit(1); }

// 音频：每条旁白按新起点延迟，混成一条，再和视频合成
const voIdx = [0, 1, 2, 3, 4, 6, 7, 8, 9].filter((i) => existsSync(voFile(i)));
const args = ['-y', '-hide_banner', '-loglevel', 'warning',
  '-f', 'concat', '-safe', '0', '-i', join(DIR, 'concat-vo.txt')];
for (const i of voIdx) args.push('-i', voFile(i));
const filters = voIdx.map((i, k) => `[${k + 1}:a]adelay=${Math.round(starts[i] * 1000)}|${Math.round(starts[i] * 1000)},volume=1.0[a${k}]`);
filters.push(`${voIdx.map((_, k) => `[a${k}]`).join('')}amix=inputs=${voIdx.length}:normalize=0:dropout_transition=0,apad[aout]`);
// 30fps + 极缓慢推镜（zoompan）：录屏里「画面停住等旁白」的段落靠推镜保持流动，不再像掉帧
const ZOOM = `zoompan=z='min(1.0+0.000016*in,1.055)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30`;
args.push('-filter_complex', filters.join(';') + `;[0:v]scale=1920:1080:flags=lanczos,fps=30,${ZOOM},${draw},format=yuv420p[vout]`);
args.push('-map', '[vout]', '-map', '[aout]', '-t', String(newTotal.toFixed(2)));
args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p');
args.push('-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', OUT);

console.log('durations', segDur.map((d) => d.toFixed(1)).join('/'), 'total', newTotal.toFixed(1));
const p = spawn(ff, args, { stdio: 'inherit' });
p.on('exit', (code) => {
  if (code === 0) console.log('OK', OUT, (readFileSync(OUT).length / 1048576).toFixed(2) + 'MB');
  else console.error('ffmpeg exit', code);
});
