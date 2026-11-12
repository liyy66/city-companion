// 改 PPT 里「闸门」那一页的文案：加上第 7 条兜底
import { readFileSync, writeFileSync } from 'node:fs';

const p = 'tools/build_ppt.py';
let s = readFileSync(p, 'utf8');
s = s.replace('"六个闸门，从提问到出稿"', '"六道闸门 + 一条兜底，从提问到出稿"');
s = s.replace(
  '("缺口坦白", "没收录的合并成一条「还差 N 项没收录」", "同时给核实入口，不编造")',
  '("缺口坦白 + 常识兜底", "没收录的合并成「还差 N 项」，同时给核实入口", "库外的问题直接答，整条标「模型常识 · 未核实」")'
);
writeFileSync(p, s, 'utf8');
console.log(s.includes('常识兜底') ? 'patched' : 'target not found');
