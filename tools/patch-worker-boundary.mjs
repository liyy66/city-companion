/* 给 worker/index.js 注册 /api/boundary 路由（用脚本改，避免 PowerShell 引号地狱） */
import fs from 'node:fs';

const p = 'worker/index.js';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes("import * as boundary")) {
  s = s.replace(
    "import * as page from '../functions/api/page.js';",
    "import * as page from '../functions/api/page.js';\nimport * as boundary from '../functions/api/boundary.js';"
  );
}
if (!s.includes("{ path: '/api/boundary'")) {
  s = s.replace(
    "  { path: '/api/page', mod: page },",
    "  { path: '/api/page', mod: page },\n  { path: '/api/boundary', mod: boundary },"
  );
}

fs.writeFileSync(p, s);
console.log('boundary import:', s.includes("import * as boundary"), '| route:', s.includes("{ path: '/api/boundary'"));
