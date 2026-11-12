// 调整字幕文案（不重新录屏，只改分段时间轴上的文字）
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'dist/video/frames.json';
const meta = JSON.parse(readFileSync(file, 'utf8'));
// 字幕时间点按录制时的实际动作重排：段与段之间用 mark('') 断开，
// 每条字幕都落在它描述的那段画面上（改完直接跑 encode，不用重录）。
const timeline = [
  [0.0, '城市安心游：3,949 座城市、1.9 万个点位，打开就能用'],
  [17.0, '底图走高德实时瓦片，换城市就连行政边界一起加载'],
  [22.3, '景点卡带官方事实：票价、开放时间、从哪个门进，逐条标出处'],
  [29.2, 'AI 向导：先查官方渠道，再联网，最后才由模型组织语言'],
  [50.3, '每句话后面都有编号，点开能回到原始出处'],
  [76.4, '查不到就说查不到，同时给出核实入口'],
  [100.4, '深浅色都做了，手机端同样能用'],
];
meta.marks = timeline.map(([t, text]) => ({ t, text }));
writeFileSync(file, JSON.stringify(meta, null, 1), 'utf8');
console.log('marks', meta.marks.length, 'updated');
