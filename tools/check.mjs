// 结构自检：编码、占位符、标签配平、脚本引用
import fs from 'node:fs';

const files = process.argv.slice(2);
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const count = (re) => (s.match(re) || []).length;
  const rep = {
    file: f,
    kb: Math.round(Buffer.byteLength(s) / 1024),
    bad: count(/\ufffd/g),
    mojibake: /[ÃÂå¤éƒ]{2,}/.test(s),
    placeholder: s.includes('__ATLAS_DATA__'),
    divOpen: count(/<div\b/g),
    divClose: count(/<\/div>/g),
    dialogOpen: count(/<dialog\b/g),
    dialogClose: count(/<\/dialog>/g),
    iLayers: count(/i-layers/g),
    iLayerBad: count(/#i-layer"/g),
    scripts: count(/<script\b/g)
  };
  console.log(JSON.stringify(rep));
}
