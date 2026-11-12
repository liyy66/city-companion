# -*- coding: utf-8 -*-
"""生成校赛提交用的 Word 项目说明（含智能体链接与无需账号说明）"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image

ROOT = r"C:\Users\td\Desktop\anxin-trip"
SHOTS = os.path.join(ROOT, "dist", "shots")
OUT = os.path.join(ROOT, "dist", "交付", "城市安心游-项目说明.docx")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

FONT = "微软雅黑"
INK = RGBColor(0x1A, 0x22, 0x1F)
GREEN = RGBColor(0x1C, 0x5A, 0x4E)
GREY = RGBColor(0x5F, 0x6B, 0x65)
AMBER = RGBColor(0x9A, 0x5F, 0x14)
LINK = "https://city-companion.netlify.app"

doc = Document()

# 页面与默认字体
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.4)
sec.top_margin = Cm(2.2); sec.bottom_margin = Cm(2.2)

style = doc.styles["Normal"]
style.font.name = FONT
style.font.size = Pt(10.5)
style.font.color.rgb = INK
style.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
style.paragraph_format.line_spacing = 1.5
style.paragraph_format.space_after = Pt(6)


def para(text="", size=10.5, color=INK, bold=False, align=None, space_after=6, space_before=0,
         line=1.5, indent=0, italic=False):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(space_before)
    pf.line_spacing = line
    if indent:
        pf.first_line_indent = Cm(indent)
    if align:
        p.alignment = align
    r = p.add_run(text)
    r.font.name = FONT
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return p


def h1(text, num=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(8)
    if num:
        r0 = p.add_run(num + "　")
        r0.font.name = FONT; r0._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
        r0.font.size = Pt(13); r0.font.bold = True; r0.font.color.rgb = GREY
    r = p.add_run(text)
    r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(15); r.font.bold = True; r.font.color.rgb = GREEN
    # 下边框
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single"); bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "4"); bottom.set(qn("w:color"), "D8D2C4")
    bdr.append(bottom); pPr.append(bdr)
    return p


def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(11.5); r.font.bold = True; r.font.color.rgb = INK
    return p


def bullet(text, level=0):
    p = doc.add_paragraph(style="List Bullet")
    pf = p.paragraph_format
    pf.left_indent = Cm(0.75 + level * 0.6)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.45
    r = p.add_run(text)
    r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(10.5); r.font.color.rgb = INK
    return p


def caption(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run(text)
    r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(9); r.font.color.rgb = GREY


def picture(name, width_cm=16.0, cap=None):
    path = os.path.join(SHOTS, name)
    if not os.path.exists(path):
        return
    iw, ih = Image.open(path).size
    w = Cm(width_cm)
    h = int(w * ih / iw)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(path, width=w, height=h)
    if cap:
        caption(cap)


def table(rows, widths=None, header=True):
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            c = t.cell(i, j)
            c.text = ""
            p = c.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.3
            r = p.add_run(str(cell))
            r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
            r.font.size = Pt(9.5)
            r.font.bold = header and i == 0
            r.font.color.rgb = INK if not (header and i == 0) else GREEN
            if header and i == 0:
                shd = OxmlElement("w:shd")
                shd.set(qn("w:val"), "clear"); shd.set(qn("w:fill"), "F1EDE2")
                c._tc.get_or_add_tcPr().append(shd)
            if widths:
                c.width = Cm(widths[j])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def link_para(url, label=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(label or url)
    r.font.name = FONT; r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    r.font.size = Pt(11); r.font.bold = True; r.font.color.rgb = GREEN
    r.font.underline = True
    # 真超链接
    part = p.part
    rId = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                         is_external=True)
    hl = OxmlElement("w:hyperlink")
    hl.set(qn("r:id"), rId)
    new_run = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    color = OxmlElement("w:color"); color.set(qn("w:val"), "1C5A4E"); rPr.append(color)
    u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rPr.append(u)
    rf = OxmlElement("w:rFonts"); rf.set(qn("w:ascii"), FONT); rf.set(qn("w:eastAsia"), FONT); rPr.append(rf)
    sz = OxmlElement("w:sz"); sz.set(qn("w:val"), "22"); rPr.append(sz)
    new_run.append(rPr)
    t = OxmlElement("w:t"); t.text = url; new_run.append(t)
    hl.append(new_run)
    p._p.append(hl)
    # 删掉临时加的纯文本 run
    p._p.remove(p.runs[0]._r)
    return p


# ══════════ 封面 ══════════
para("AI + 文旅　　校赛参赛作品", size=10, color=AMBER, bold=True, space_before=30, space_after=14)
para("城市安心游", size=30, color=GREEN, bold=True, space_after=2)
para("City Companion", size=12, color=GREY, space_after=18)
para("陌生城市，看得见也问得清。", size=13, color=INK, space_after=24)

table([
    ["项目名称", "城市安心游（City Companion）"],
    ["队伍名称", "利玛"],
    ["作品类型", "Web 智能体（AI + 文旅）"],
    ["智能体链接", LINK],
    ["访问方式", "浏览器打开链接即可使用，**无需注册、无需账号、无需配置 Key**"],
    ["提交日期", "2026 年 11 月 13 日"],
], widths=[3.6, 12.2])
doc.paragraphs[-1].paragraph_format.space_after = Pt(16)

para("一句话介绍：把「能不能去、要不要票、从哪进、值不值」一次答清——地图换成实时底图，"
     "景点信息只收可溯源的官方事实，AI 回答逐句标注出处，查不到就说查不到。",
     size=10.5, color=INK, indent=0.74)

doc.add_page_break()

# ══════════ 一、作品概述 ══════════
h1("作品概述", "一")
para("城市安心游是一个面向自由行游客的城市问答与行程助手。它由三块能力组成：", indent=0.74)
bullet("实时地图：全国 3,949 座城市与区县，底图使用高德实时瓦片，切换城市会自动加载该城市的行政边界、精选景点与周边点位；")
bullet("可溯源景点卡：67 张精选景点卡覆盖 24 个目的地城市，门票、开放时间、入口、客流提示都标注来源与日期，并附 76 张可授权实拍；")
bullet("AI 向导「小安」：先理解问题，再查内置资料与官方渠道（gov.cn），不够再联网检索，最后由大模型组织语言，并逐句校验引用编号。")
para("此外还有一个独立的「消费核验」模块：把商家报价拆成人均、必付项、发票与经营许可四项，逐项提示风险并给出官方举报入口。", indent=0.74)
picture("01-hero.png", 16.0, "图 1　首页：左侧说明三件事，右侧是 three.js 实时渲染的城市盘（可拖动旋转）")

# ══════════ 二、解决什么问题 ══════════
h1("解决什么问题", "二")
para("我们把原作品拿给同学试用，归纳出三个真问题，并据此重做了实现：", indent=0.74)
table([
    ["问题", "表现", "我们的改法"],
    ["地图不完整", "除了重庆，其他城市只有零散点位，没有行政边界，看不出城市轮廓",
     "底图统一换高德实时瓦片；按 adcode 拉取官方行政边界；坐标统一在 WGS-84 与 GCJ-02 之间校准"],
    ["信息不可验证", "票价、开放时间散落在攻略里，互相矛盾，游客无法判断该信谁",
     "只收录官方事实（gov.cn / 文旅局），每条带来源与日期；没有出处的内容不进入景点卡"],
    ["AI 答非所问", "问「从哪个门进」，回答讲了半天城市历史；没有证据时还会编",
     "官方渠道优先 → 联网兜底 → 模型组织语言；模型只能引用编号证据，无编号的句子整句丢弃"],
], widths=[3.0, 6.4, 6.4])

para("其中「答非所问」是最难的一项，我们在第六章单独说明修法。", indent=0.74)

# ══════════ 三、功能与操作 ══════════
h1("功能说明与操作路径", "三")
h2("3.1　实时地图")
para("进入页面后默认停在重庆。左侧是城市搜索与目录（3,949 条，覆盖到区县），中间是地图，右侧是该城市的景点卡。"
     "点任意城市，地图会飞到该城市并做三件事：加载行政边界、绘制精选景点、标出周边点位。", indent=0.74)
bullet("底图三套：标准矢量（高德 webrd）、卫星影像（高德 webst）、实时路况（高德 traffic）；")
bullet("工具条：显示/隐藏行政边界、显示/隐藏周边点位、一键全览、放大地图（独立大图模式）；")
bullet("无精选卡的城市（如阿勒泰）不会空白：仍然加载边界与周边点位，并给出「在高德看该城景点」「问小安怎么玩」两个出口；")
bullet("对于 623 个已撤销或新设、官方区划表里没有几何数据的区县，用虚线范围圈表示，并在状态栏注明「暂无官方边界，显示范围示意」。")
picture("03-map-kunming.png", 16.0, "图 2　昆明：行政边界、4 张景点卡与周边点位同时到位（底图：高德实时瓦片）")

h2("3.2　景点卡")
para("点开任意景点，左侧是实拍与图注，右侧是结构化事实：所在、类型、看点、票价、开放时间、入口、客流提示，"
     "每条事实右侧都有出处链接与日期。底部给出「高德地图」「百度地图」「路线与入口」三个跳转。", indent=0.74)
picture("04-place.png", 16.0, "图 3　翠湖公园：票价「免费入园」、6:00 开园、南门进，分别来自昆明市园林绿化局与五华区文旅局")

h2("3.3　AI 向导「小安」")
para("输入框支持自然语言提问，也支持连续追问。回答上方是会标明「理解成了什么」——城市、景点、意图；"
     "正文里每个结论后面有编号角标，点开可以回到原始页面；右侧面板实时显示这是一条什么来源的证据。", indent=0.74)
picture("06-ai-3.png", 16.0, "图 4　连续追问：翠湖要票不 → 那要预约吗 → 从哪个门进，三轮都落在同一个景点上")

para("典型问题与预期结果：", indent=0.74, space_before=6)
table([
    ["提问", "回答要点", "来源"],
    ["翠湖公园要门票吗？", "免费入园，无需购买门票；园内游乐项目另行收费", "昆明市园林绿化局 / 五华区文旅局"],
    ["那要预约吗？", "内置资料没有明确预约要求，说明未收录并给出核实入口，不猜", "官方渠道 + 核实入口"],
    ["从哪个门进？", "南门进；地铁 5 号线华山西路站 B/D 口，步行约 700 米", "昆明文旅赏荷指南"],
    ["那大观楼呢？", "自动切换到「大观公园」，不沿用翠湖的答案", "景点卡切换"],
    ["重庆两天怎么安排？", "模型给出分片区的行程思路，逐句标注；把「未收录」合并成一条", "模型 + 内置景点 + 官方提示"],
], widths=[4.4, 8.2, 3.2])

h2("3.4　消费核验")
para("填入人数、对方报价、必须另付的项目，勾选是否含可选项目、能否开发票、能否出示经营许可证编号，"
     "右侧实时给出人均总价与风险清单，并附 12345、12318、全国旅游监管服务平台等官方入口。", indent=0.74)
picture("08-verify.png", 16.0, "图 5　消费核验：人均、必付项、发票、经营许可四项风险逐条提示")

# ══════════ 四、技术架构 ══════════
h1("技术架构与实现", "四")
para("整体是「一个静态页面 + 一层轻函数」：页面本身可以单文件离线运行，联网能力由同一份 lib/core.js 在服务端提供。", indent=0.74)
table([
    ["层", "实现", "说明"],
    ["前端", "原生 JS 模块 + three.js + Leaflet", "无打包器，构建脚本把 13 个脚本与数据内联成单个 HTML"],
    ["3D 城市盘", "three.js InstancedMesh", "240 栋楼 + 河道 + 环线，自绘交互，尊重 prefers-reduced-motion"],
    ["地图", "Leaflet + 高德瓦片 + DataV 边界", "内部数据统一 WGS-84，上屏转 GCJ-02"],
    ["服务端", "Netlify Functions（Node 22）", "health/search/official/page/boundary/amap/chat 七个接口"],
    ["检索", "博查 / Tavily / 搜狗 / 360 / 搜狗微信", "按顺序降级，带验证码与人机校验检测"],
    ["模型", "DeepSeek deepseek-chat（OpenAI 兼容）", "只走服务端，Key 存在 Netlify 环境变量，永不进入浏览器"],
], widths=[2.8, 6.0, 7.0])

para("关键设计：", indent=0.74, space_before=6)
bullet("同一份 lib/core.js 同时跑在 Node 与 Netlify：解析、相关性过滤、正文抽取只有一套实现，本地与线上行为一致；")
bullet("线上抓政府站正文必须用 HTMLRewriter（Workers 的 TextDecoder 只支持 UTF-8，而不少政府站仍是 GBK）；Netlify 走 Node 则直接用 TextDecoder('gbk')；")
bullet("DataV 会对 Referer 做拦截（带站点 Referer 直接 403），因此边界统一走 /api/boundary 代理，服务端请求不带 Referer；")
bullet("首屏做体积分层：线上用 SPLIT=1 构建，实拍图外链（首屏 2.6 MB / 3 秒）；离线交付版把图片内联成单文件（9 MB，双击即用）。")

# ══════════ 五、可溯源怎么做 ══════════
h1("可溯源是怎么做到的", "五")
para("这是本作品与「套壳聊天」最大的区别：回答里的每个结论都必须能落回一条具体证据。", indent=0.74)
bullet("证据编号：检索到的每一条资料（内置景点、官方页面、联网结果）都会编号，交给模型的是带编号的资料而不是「你自己发挥」；")
bullet("逐句校验：模型必须输出结构化 JSON，每句话带 n:[编号]；没有编号的句子、编号不存在的句子一律丢弃；")
bullet("重试一次：如果整篇都不可用，带着「哪里不合格」的说明让模型重写一次；仍不合格则退回内置证据引擎，回答依旧逐句有出处；")
bullet("如实标注来源层级：gov.cn 原文显示「官方原文 · N 页」，公众号只能拿到标题与摘要时显示「公众号 · N 篇」，并注明「不是政府站原文，请开原页核对」；")
bullet("缺口坦白：没有被资料覆盖的问题，回答里明确写「未收录」，并把没收录的项合并成一条，附上核实入口。")
bullet("超范围转常识：问的是资料库以外的景点（如凡尔赛宫）、人物或新闻时，改用模型自己的知识直接回答，整条标注「模型常识 · 未核实」并列出需要核实的点，而不是用「未收录」把用户挡回去。")
picture("05-ai-1.png", 16.0, "图 6　回答结构：结论先行 → 分块论述 → 逐句编号 → 未收录提示 → 核实入口 → 出处折叠")

# ══════════ 六、答非所问的修法 ══════════
h1("「答非所问」的七道闸门", "六")
para("原作品的做法是「把问题交给模型自由发挥」，我们改成「先查资料，再让模型组织语言」。中间加了六道闸门：", indent=0.74)
table([
    ["#", "闸门", "具体做法"],
    ["1", "问题理解", "先抽城市、景点、意图；「从哪个门进」这类省略主语的追问，会沿用上一轮景点，但换城市时自动清空上下文"],
    ["2", "相关性过滤", "检索结果必须命中问题的关键词（去掉「门票」「攻略」这类泛词），否则判为无关，直接说「没查到」"],
    ["3", "官方优先", "先取证 gov.cn 原文；官方与其他网页冲突时以官方为准，并在缺口里注明「口径不一致」"],
    ["4", "公众号兜底", "海外出口拿不到 gov.cn 时退到公众号文章，只给标题与摘要，并标注「非官方原文」"],
    ["5", "逐句校验", "模型只能引用编号证据，无编号整句丢弃；不合格重试一次，仍不行退回证据引擎"],
    ["6", "缺口合并", "没收录的项合并成一条「还差 N 项没收录」，并给出核实入口，不编造"],
    ["7", "超范围转常识", "问的是资料库外的景点、人物或新闻时，直接用模型自己的知识回答，整条标注「模型常识 · 未核实」，并列出需要核实的点——不因为「库里没有」就拒答"],
], widths=[1.2, 3.4, 11.2])

# ══════════ 七、实测数据 ══════════
h1("实测与验收", "七")
para("以下数据来自 2026 年 11 月 12 日对线上版本的实测（自动化脚本 tools/e2e.mjs，真实 Chrome 跑通全流程）。", indent=0.74)
table([
    ["指标", "结果"],
    ["首屏可用时间", "2.0–3.0 秒（线上）"],
    ["首屏体积", "2.6 MB（实拍图按需加载）"],
    ["城市 / 区县", "3,949 条，其中 3,322 条可加载官方行政边界"],
    ["周边点位", "19,202 个"],
    ["精选景点卡", "67 张，覆盖 24 个目的地城市，59 张带实拍"],
    ["可溯源实拍", "76 张（Wikimedia Commons，逐张附许可）"],
    ["连续追问", "三轮追问全部落在同一景点；换城市后自动切换，不串答案"],
    ["控制台错误", "0（模型冷启动偶发 1 次超时，自动退回证据引擎）"],
    ["离线单文件", "9 MB，双击即可运行（不联网也能用地名与内置资料）"],
], widths=[4.6, 11.2])

# ══════════ 八、边界 ══════════
h1("已知边界与下一步", "八")
para("我们尽量把「做不到」写清楚，而不是用模糊表述遮住：", indent=0.74)
bullet("623 个已撤销或新设的区县（如江干区、雄州区）在官方区划表里没有几何数据，只能用范围示意圈，状态栏会注明；")
bullet("海外出口 IP 访问 gov.cn 受限，此时官方渠道会退到公众号摘要，UI 上明确标注「非原文」；")
bullet("线上单次模型调用限制 9 秒（Netlify 同步函数上限 10 秒），超时自动退回证据引擎；")
bullet("实时人流、排队时长目前没有可靠数据源，作品里只给官方公告与提示，不做猜测。")
para("下一步计划：接入博查 API 让官方检索更稳定；把精选景点卡从 67 张扩到 200 张以上；在拿到可靠数据源后再做实时人流。", indent=0.74)

# ══════════ 九、运行与部署 ══════════
h1("运行与部署说明", "九")
para("线上版（推荐评审使用）", bold=True, space_before=6)
para("浏览器打开下面的链接即可，无需注册、无需账号、无需任何配置。作品会在首次加载时自动探测服务端能力，"
     "顶栏会显示「站点模型 · deepseek-chat」，说明模型与检索都已就绪。", indent=0.74)
link_para(LINK)
para("能力自检地址（可选）：" + LINK + "/api/health", size=9.5, color=GREY)

para("备用方式一：离线单文件", bold=True, space_before=8)
para("压缩包内附 城市安心游.html（约 9 MB），双击用 Chrome / Edge 打开即可。离线版没有联网检索与官方渠道，"
     "但仍可使用全国地名、精选景点卡、实拍与内置证据引擎，回答依旧逐句标注内置出处。", indent=0.74)

para("备用方式二：本地起服务（含联网与模型）", bold=True, space_before=8)
para("在解压目录执行 node server.mjs，浏览器打开 http://127.0.0.1:8787/ 。若要接自己的模型，"
     "可在设置面板填接口地址与模型名（兼容 OpenAI 协议，Key 只存在本机 localStorage）。", indent=0.74)

para("关于账号：本作品没有账号体系，评审不需要任何登录信息；若评审希望验证「换模型也能用」，"
     "可在设置面板里填入任意 OpenAI 兼容接口（如本机 Ollama 的 qwen3:4b），不需要我们的 Key。", indent=0.74, space_before=6)

# ══════════ 附：文件清单 ══════════
h1("附件清单", "十")
table([
    ["文件", "说明"],
    ["城市安心游-项目介绍.pptx", "答辩用幻灯片（12 页）"],
    ["城市安心游-项目说明.docx", "本文档"],
    ["城市安心游-演示视频.mp4", "约 90 秒，真实页面录屏 + 中文字幕"],
    ["城市安心游.html", "离线单文件版（双击即用）"],
], widths=[6.4, 9.4])

doc.save(OUT)
print("saved", OUT, os.path.getsize(OUT) // 1024, "KB")
