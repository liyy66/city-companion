# 城市安心游 · CITY COMPANION

> 陌生城市，看得见也问得清。

一个面向游客的城市旅行助手：**打开就有实时地图，开口就有带出处的回答**。全国 3,949 个城市与区县可切换底图与行政边界，AI 向导先查官方渠道、再联网检索、最后才用内置资料，每条结论都能点回原文核对。

## 三个核心能力

| 能力 | 做法 |
| --- | --- |
| 全国城市实时地图 | 高德瓦片（标准/卫星/路况三套）+ DataV 行政区划边界；内置 WGS-84 → GCJ-02 纠偏，点位不再偏移；缺官方边界的城市画「范围示意圈」而不是空图 |
| 景点与实拍 | 67 张精选景点卡（门票/开放时间/入口/人流/看点）+ 76 张可追溯实拍（含作者与授权）；任意城市还能看周边 19,202 个点位 |
| 可溯源的 AI 向导 | 理解城市/景点/意图 → 官方渠道（gov.cn 原文）→ 联网检索 → 生成 → **逐句校验引用**，没出处的句子直接丢弃；查不到就说查不到，并给出核实入口 |

问答不编造的兜底顺序：**官方原文 > 公开网页 > 内置资料 > 明确说「未收录」并给核实入口**。

## 快速开始

```bash
# 1) 只用静态页面（地图、景点、内置问答）
#    直接双击 dist/城市安心游.html

# 2) 带上联网检索、官方渠道与模型（推荐）
node server.mjs            # 默认 http://127.0.0.1:8787
#    打开 http://127.0.0.1:8787/ 即可，同源自动接通 /api/*
```

可选环境变量：

```bash
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
MODEL_API_KEY=sk-...
BOCHA_API_KEY=...      # 检索主力（不填则降级到搜狗/360/Bing）
AMAP_KEY=...           # 高德 POI 与路径规划
```

只想接本机/局域网模型（Ollama、LM Studio、vLLM）时，`MODEL_BASE_URL=http://127.0.0.1:11434/v1`，Key 可留空。详见 [接入千问4B.md](接入千问4B.md)。

## 部署到 Cloudflare Pages

仓库只放源码，成品由构建生成；`/api/*` 由 Pages Functions 提供（`functions/` 目录），与页面同域，无需 CORS。

1. Cloudflare → Workers & Pages → Create → Pages → 连接本仓库
2. Build command `node tools/build.mjs`，Build output `dist`，环境变量 `NODE_VERSION=22`
3. Settings → Variables and Secrets 添加（名字必须完全一致，Functions 读的就是这几个）：
   - `MODEL_BASE_URL` = `https://api.deepseek.com/v1`
   - `MODEL_NAME` = `deepseek-chat`
   - `MODEL_API_KEY` = `sk-...`（DeepSeek 的 Key）
   - `BOCHA_API_KEY` = `sk-...`（博查检索，官方渠道主力；不填会降级到 HTML 检索）
   - `AMAP_KEY` / `TAVILY_API_KEY`（可选）
4. 部署完成后打开 `/api/health`，应看到 `chat:true`、`official:true`，`search` 为 `bocha`

接口一览（Node 与 Functions 完全一致）：

| 接口 | 作用 |
| --- | --- |
| `GET /api/health` | 能力自检（前端据此显示「站点模型 / 官方原文 / 联网」） |
| `GET /api/search?q=&city=` | 联网检索：博查 → Tavily → 搜狗 → 360 → 搜狗微信 → Bing |
| `GET /api/official?q=&city=` | 官方渠道优先：只取 `.gov.cn` 并抽正文 |
| `GET /api/page?url=` | 抓单页正文（SSRF 白名单、体积上限） |
| `GET /api/amap/poi?keywords=&city=` | 高德 POI 代理（Key 不下发到浏览器） |
| `POST /api/chat` | OpenAI 兼容模型代理 |

架构与取舍见 [部署方案.md](部署方案.md)。

## 目录结构

```
src/
  shell.html            页面骨架（构建时内联为单文件）
  css/app.css           设计系统（浅色/深色）
  js/
    util.js geo.js config.js data.js net.js
    knowledge.js ai.js map.js three-hero.js ui.js boot.js
  vendor/               Leaflet 1.9.4、three.js（构建时内联）
data/
  atlas.json            城市/行政/景点/点位/实拍索引（约 2MB）
  photos/*.webp         76 张实拍（构建时转 base64 内联）
tools/
  build.mjs             打包成单文件 HTML
  e2e.mjs               headless Chrome 端到端自检
server.mjs              零依赖本地服务（静态 + /api/*）
```

## 数据与授权

- 城市与区县、行政边界：高德开放平台瓦片、DataV.GeoAtlas 行政区划
- 实拍图：Wikimedia Commons 等公开来源，逐张保留作者、许可与原始链接（页面内可查）
- 门票/开放时间等事实：来自文旅主管部门与景区官方页面，标注来源与日期
- 本仓库代码仅供学习与比赛展示；第三方数据与图片版权归原作者

## 已知边界

- 623 个已撤销/新设的区县名在官方区划表里没有几何，地图上以范围示意圈代替
- 免费版 Cloudflare Functions 单次 10ms CPU，官方正文抓取依赖缓存；超限时自动降级为「官方入口链接」
- 搜狗/360 对海外 IP 可能返回验证码，此时检索以博查 API 为主
- 内置资料只覆盖 19 个城市的精选卡，其余城市靠实时地图 + 周边点位 + 联网问答

## 部署到 Netlify（国内可直接访问）

Cloudflare 的 *.workers.dev / *.pages.dev 在国内会被解析到 127.0.0.1，打不开；
*.netlify.app 实测 443 可通，且免费额度自带 Node 函数，所以「官方渠道 → 联网 → 模型」
整条链路可以保留，也不需要买域名。

1. Netlify → Add new site → Import an existing project → 选 GitHub 仓库 city-companion
2. 构建参数由根目录的 netlify.toml 决定：命令 `SPLIT=1 node tools/build.mjs`，发布目录 `dist`
   （`SPLIT=1` 把 76 张实拍图外链成 `dist/photos/*.webp`，首屏从 9.5MB 降到 2.6MB；不带这个变量则内联成单文件）
3. Site configuration → Environment variables 里加：
   - MODEL_BASE_URL = https://api.deepseek.com/v1
   - MODEL_NAME = deepseek-chat
   - MODEL_API_KEY = 你的 Key（只存在服务端，不会进页面）
   - 可选：BOCHA_API_KEY（官方渠道走 API，比 HTML 检索稳）、AMAP_KEY（高德 POI / 路径规划）
4. Deploys → Trigger deploy，然后访问 https://<站点名>.netlify.app/api/health
   应看到 "chat":true；首页顶栏会显示「站点模型 · deepseek-chat」。

接口实现放在 netlify/functions/（health / search / official / page / chat / amap-poi / boundary），
和本地 server.mjs、Cloudflare functions/ 共用同一套 lib/core.js，三处行为一致。
本地可以先跑 node tools/test-netlify.mjs 验证这些函数（不需要部署）。

两个线上特有的坑已经修掉，改代码时别改回去：

- 行政边界必须走后端代理 `/api/boundary`：DataV.GeoAtlas 按 Referer 拦，浏览器从
  `*.netlify.app` 直连会 403，表现为「除了重庆，别的城市没有边界」。
- 海外出口 IP 上 360 打不开、Bing 认不出 `site:gov.cn`，政府站这一路会空。此时
  `/api/official` 会退到微信公众号：要求标题里同时出现景点名和意图词（门票/预约/开放，
  票价、开放时间等同义词会先归一），只取标题与摘要并标注「公众号」，宁可说没查到也不凑数。
