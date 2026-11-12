# -*- coding: utf-8 -*-
"""生成校赛提交用的 PPT（16:9，中文字体，深绿+米色配色，与作品视觉一致）"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

ROOT = r"C:\Users\td\Desktop\anxin-trip"
SHOTS = os.path.join(ROOT, "dist", "shots")
OUT = os.path.join(ROOT, "dist", "交付", "城市安心游-项目介绍.pptx")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

FONT = "微软雅黑"
INK = RGBColor(0x14, 0x2B, 0x26)
GREEN = RGBColor(0x1C, 0x5A, 0x4E)
GREEN_D = RGBColor(0x0E, 0x33, 0x2C)
AMBER = RGBColor(0xB0, 0x6E, 0x1E)
CREAM = RGBColor(0xF7, 0xF4, 0xEC)
CREAM_2 = RGBColor(0xEF, 0xEA, 0xDE)
GREY = RGBColor(0x6B, 0x76, 0x70)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

W, H = Inches(13.333), Inches(7.5)
prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


def slide(bg=CREAM):
    s = prs.slides.add_slide(BLANK)
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    r.fill.solid(); r.fill.fore_color.rgb = bg; r.line.fill.background()
    r.shadow.inherit = False
    return s


def text(s, x, y, w, h, txt, size=18, color=INK, bold=False, align=PP_ALIGN.LEFT,
         spacing=1.35, font=FONT, anchor=MSO_ANCHOR.TOP):
    tb = s.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = 0; tf.margin_right = 0; tf.margin_top = 0; tf.margin_bottom = 0
    lines = txt.split("\n")
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        run = p.add_run(); run.text = ln
        f = run.font; f.name = font; f.size = Pt(size); f.bold = bold; f.color.rgb = color
    return tb


def rule(s, x, y, w, color=GREEN, thick=Pt(2.2)):
    ln = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, thick)
    ln.fill.solid(); ln.fill.fore_color.rgb = color; ln.line.fill.background()
    ln.shadow.inherit = False
    return ln


def chip(s, x, y, txt, color=GREEN, size=11):
    w = Inches(0.16) * len(txt) + Inches(0.34)
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, Inches(0.34))
    box.fill.solid(); box.fill.fore_color.rgb = color
    box.line.fill.background(); box.shadow.inherit = False
    box.adjustments[0] = 0.5
    tf = box.text_frame; tf.word_wrap = False
    tf.margin_left = 0; tf.margin_right = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = txt
    r.font.size = Pt(size); r.font.name = FONT; r.font.color.rgb = WHITE
    return box


def picture(s, name, x, y, w, h, border=True):
    """按比例放进 (x,y,w,h) 的框里，居中裁切"""
    path = os.path.join(SHOTS, name)
    iw, ih = Image.open(path).size
    box_ar = w / h
    img_ar = iw / ih
    if img_ar > box_ar:          # 图更宽 → 以高度为准，裁左右
        ph = h; pw = int(h * img_ar)
    else:
        pw = w; ph = int(w / img_ar)
    px = int(x - (pw - w) / 2)
    py = int(y - (ph - h) / 2)
    pic = s.shapes.add_picture(path, px, py, width=pw, height=ph)
    # 裁切：用 crop 属性把超出部分切掉
    left = max(0, (pw - w) / 2 / pw); right = left
    top = max(0, (ph - h) / 2 / ph); bottom = top
    pic.crop_left, pic.crop_right, pic.crop_top, pic.crop_bottom = left, right, top, bottom
    pic.left, pic.top, pic.width, pic.height = x, y, w, h
    if border:
        pic.line.color.rgb = RGBColor(0xD8, 0xD2, 0xC4)
        pic.line.width = Pt(0.75)
    return pic


def num_badge(s, x, y, n, color=AMBER):
    box = s.shapes.add_shape(MSO_SHAPE.OVAL, x, y, Inches(0.34), Inches(0.34))
    box.fill.solid(); box.fill.fore_color.rgb = color
    box.line.fill.background(); box.shadow.inherit = False
    tf = box.text_frame; tf.margin_left = 0; tf.margin_right = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = str(n)
    r.font.size = Pt(11); r.font.name = FONT; r.font.color.rgb = WHITE; r.font.bold = True


def foot(s, page, title=""):
    text(s, Inches(0.8), Inches(6.86), Inches(8), Inches(0.3),
         title or "城市安心游 · City Companion", size=10, color=GREY)
    text(s, Inches(11.6), Inches(6.86), Inches(1.0), Inches(0.3), f"{page:02d}", size=10,
         color=GREY, align=PP_ALIGN.RIGHT)


# ── 01 封面 ─────────────────────────────────────────────
s = slide(CREAM)
band = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(5.05), H)
band.fill.solid(); band.fill.fore_color.rgb = GREEN_D; band.line.fill.background(); band.shadow.inherit = False

text(s, Inches(0.85), Inches(1.2), Inches(3.6), Inches(0.5), "AI + 文旅 · 校赛作品", size=13,
     color=RGBColor(0xA8, 0xC6, 0xB6))
text(s, Inches(0.85), Inches(1.95), Inches(3.7), Inches(1.9), "城市\n安心游", size=52, color=WHITE,
     bold=True, spacing=1.05)
rule(s, Inches(0.85), Inches(3.62), Inches(1.2), AMBER, Pt(3))
text(s, Inches(0.85), Inches(3.95), Inches(3.6), Inches(1.2),
     "陌生城市，\n看得见也问得清。", size=17, color=RGBColor(0xD5, 0xE3, 0xD9), spacing=1.5)
text(s, Inches(0.85), Inches(5.75), Inches(3.6), Inches(0.9),
     "队伍：利玛\n2026 年 11 月", size=12, color=RGBColor(0x9F, 0xB8, 0xA9), spacing=1.5)

picture(s, "01-hero.png", Inches(5.55), Inches(1.55), Inches(7.2), Inches(4.05), border=False)
text(s, Inches(5.55), Inches(5.75), Inches(7.2), Inches(0.9),
     "线上体验：https://city-companion.netlify.app", size=15, color=GREEN, bold=True)
text(s, Inches(5.55), Inches(6.12), Inches(7.2), Inches(0.5),
     "点开即用，不需要注册、不需要配置任何 Key。", size=11, color=GREY)

# ── 02 问题 ─────────────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "01 · 游客在陌生城市遇到的三个真问题", size=12,
     color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.9),
     "地图只有一座城、信息查不到出处、AI 答非所问", size=30, color=INK, bold=True)
rule(s, Inches(0.8), Inches(1.92), Inches(1.1))

cards = [
    ("地图不完整", "只有重庆能画出街区，换一座城市就只剩几个点，\n连行政边界都没有。",
     "底图换成高德实时瓦片，任何城市都能拉出边界"),
    ("信息不可验证", "票价、开放时间散落在攻略里，说法互相矛盾，\n游客无法判断该信谁。",
     "只收可溯源的官方事实，逐条标出处与日期"),
    ("AI 答非所问", "问「从哪个门进」，回答讲起城市历史；\n没有证据时还会编。",
     "官方渠道 → 联网 → 模型，逐句校验引用"),
]
x = Inches(0.8)
for i, (t, d1, d2) in enumerate(cards):
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(2.35), Inches(3.78), Inches(3.9))
    box.fill.solid(); box.fill.fore_color.rgb = WHITE
    box.line.color.rgb = RGBColor(0xE0, 0xDA, 0xCB); box.shadow.inherit = False
    box.adjustments[0] = 0.04
    num_badge(s, x + Inches(0.35), Inches(2.68), i + 1)
    text(s, x + Inches(0.35), Inches(3.18), Inches(3.1), Inches(0.5), t, size=19, bold=True)
    text(s, x + Inches(0.35), Inches(3.72), Inches(3.1), Inches(1.3), d1, size=12, color=GREY, spacing=1.45)
    rule(s, x + Inches(0.35), Inches(5.0), Inches(0.7), AMBER, Pt(2))
    text(s, x + Inches(0.35), Inches(5.2), Inches(3.1), Inches(0.9), d2, size=12.5, color=GREEN, bold=True,
         spacing=1.4)
    x += Inches(4.02)
foot(s, 2)

# ── 03 三句话 ───────────────────────────────────────────
s = slide(CREAM_2)
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "02 · 一句话说明白", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.05), Inches(11.6), Inches(1.0),
     "把「能不能去、要不要票、从哪进、值不值」一次答清", size=28, color=INK, bold=True)
rows = [
    ("看得见", "3,949 座城市与区县，1.9 万个点位，高德实时底图 + 行政边界 + 卫星/路况"),
    ("问得清", "AI 向导先查官方渠道与联网信息，再让模型组织语言，每句话都标出处"),
    ("付得明白", "把报价拆成人均、必付项、发票、经营许可四项，逐项提示风险与举报入口"),
]
y = Inches(2.55)
for i, (k, v) in enumerate(rows):
    chip(s, Inches(0.8), y + Inches(0.12), k, GREEN if i != 1 else AMBER, 12)
    text(s, Inches(2.35), y, Inches(9.6), Inches(0.9), v, size=15, color=INK, spacing=1.4)
    y += Inches(1.12)
rule(s, Inches(0.8), Inches(6.0), Inches(11.6), RGBColor(0xD8, 0xD2, 0xC4), Pt(0.75))
text(s, Inches(0.8), Inches(6.2), Inches(11.6), Inches(0.5),
     "在线版直接打开：city-companion.netlify.app　·　离线版是一个 9 MB 的 HTML，双击就能用",
     size=11.5, color=GREY)
foot(s, 3)

# ── 04 地图 ─────────────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "03 · 实时地图：不只是重庆", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "换任何一座城市，底图、边界、景点一起到", size=27, bold=True)
picture(s, "03-map-kunming.png", Inches(0.8), Inches(1.95), Inches(8.4), Inches(4.55))
side = [
    ("高德实时瓦片", "矢量路网 / 卫星 / 实时路况，三套底图随时切"),
    ("行政边界", "按 adcode 拉官方区划，3,322 座城市有几何数据"),
    ("坐标校准", "内部统一 WGS-84，上屏前转 GCJ-02，点位不偏"),
    ("边界代理", "DataV 会按 Referer 拦，线上走 /api/boundary 转发"),
]
y = Inches(2.0)
for k, v in side:
    text(s, Inches(9.55), y, Inches(3.1), Inches(0.35), k, size=14, bold=True, color=GREEN)
    text(s, Inches(9.55), y + Inches(0.36), Inches(3.05), Inches(0.75), v, size=10.5, color=GREY, spacing=1.35)
    y += Inches(1.12)
text(s, Inches(9.55), Inches(6.5), Inches(3.1), Inches(0.4), "另有 623 个已撤销/新设区县无几何，用范围示意圈兜底",
     size=9.5, color=AMBER)
foot(s, 4)

# ── 05 景点卡 ───────────────────────────────────────────
s = slide(CREAM_2)
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "04 · 景点卡：每条事实都带出处", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7),
     "票价、开放时间、从哪个门进，来源和日期都写在旁边", size=26, bold=True)
picture(s, "04-place.png", Inches(0.8), Inches(1.95), Inches(7.3), Inches(4.55))
pts = [
    ("67 张精选卡 + 76 张实拍", "实拍只放 Wikimedia Commons 可溯源图片，附许可"),
    ("官方事实优先", "昆明翠湖：票价「免费入园」、6:00 开园、南门进，各带 gov.cn 出处"),
    ("一键跳转", "高德地图 / 百度地图 / 路线与入口，直接给出导航"),
]
y = Inches(2.1)
for k, v in pts:
    text(s, Inches(8.5), y, Inches(4.2), Inches(0.4), k, size=14, bold=True, color=GREEN)
    text(s, Inches(8.5), y + Inches(0.42), Inches(4.1), Inches(0.9), v, size=10.5, color=GREY, spacing=1.4)
    y += Inches(1.4)
foot(s, 5)

# ── 06 AI 管线 ──────────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "05 · AI 向导：四步，每步都可查", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "先查资料，再说话", size=27, bold=True)
picture(s, "06-ai-3.png", Inches(0.8), Inches(1.95), Inches(7.6), Inches(4.55))
steps = [
    ("理解问题", "识别城市、景点与意图，指代词沿用上一轮景点"),
    ("检索内置资料", "精选卡、官方事实、县域索引、点位"),
    ("官方渠道 + 联网", "gov.cn 原文优先；抓不到就退公众号摘要并如实标注"),
    ("生成与校验", "模型只能引用编号证据，无编号的句子直接丢弃；不达标重试一次"),
]
y = Inches(1.95)
for i, (k, v) in enumerate(steps):
    num_badge(s, Inches(8.8), y + Inches(0.02), i + 1, GREEN)
    text(s, Inches(9.28), y, Inches(3.4), Inches(0.35), k, size=13.5, bold=True)
    text(s, Inches(9.28), y + Inches(0.34), Inches(3.35), Inches(0.8), v, size=10, color=GREY, spacing=1.35)
    y += Inches(1.14)
foot(s, 6)

# ── 07 答非所问怎么修的 ─────────────────────────────────
s = slide(CREAM_2)
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "06 · 我们怎么把「答非所问」修掉", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "六道闸门 + 一条兜底，从提问到出稿", size=27, bold=True)

items = [
    ("问题理解", "先抽城市 / 景点 / 意图；「从哪个门进」不再被当成城市级问题", "指代词沿用 + 跨城自动清空上下文"),
    ("相关性闸门", "检索结果要命中问题关键词，否则判为无关", "「抓到 N 条但都与问题无关」直接说没查到"),
    ("官方优先", "gov.cn 原文置顶，冲突时以官方为准并在缺口里注明", "官方页面抓正文，剥掉导航只剩正文"),
    ("公众号兜底", "海外出口拿不到 gov.cn 时退公众号摘要", "明确标注「不是政府站原文，请开原页核对」"),
    ("逐句校验", "模型必须输出 JSON + 证据编号，无编号的整句丢弃", "不合格重试一次，仍不行退回证据引擎"),
    ("缺口坦白 + 常识兜底", "没收录的合并成「还差 N 项」，同时给核实入口", "库外的问题直接答，整条标「模型常识 · 未核实」"),
]
x, y = Inches(0.8), Inches(2.0)
for i, (k, v, note) in enumerate(items):
    if i == 3:
        x, y = Inches(0.8), Inches(4.28)
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(3.85), Inches(1.95))
    box.fill.solid(); box.fill.fore_color.rgb = WHITE
    box.line.color.rgb = RGBColor(0xE0, 0xDA, 0xCB); box.shadow.inherit = False
    box.adjustments[0] = 0.05
    num_badge(s, x + Inches(0.28), y + Inches(0.26), i + 1)
    text(s, x + Inches(0.78), y + Inches(0.24), Inches(2.9), Inches(0.35), k, size=14, bold=True)
    text(s, x + Inches(0.3), y + Inches(0.72), Inches(3.3), Inches(0.62), v, size=10.5, color=GREY, spacing=1.35)
    text(s, x + Inches(0.3), y + Inches(1.42), Inches(3.3), Inches(0.4), note, size=9.5, color=AMBER, spacing=1.2)
    x += Inches(4.02)
foot(s, 7)

# ── 08 消费核验 ─────────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "07 · 顺带解决「到了当地被加价」", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "把报价拆开算一遍，再决定付不付", size=27, bold=True)
picture(s, "08-verify.png", Inches(0.8), Inches(1.95), Inches(8.4), Inches(4.55))
flags = [
    ("人均口径", "先看含不含必付项，再谈总价"),
    ("发票与合同", "没有正规发票，事后基本无法维权"),
    ("经营许可", "查不到许可证号就不是合法旅行社"),
    ("举报入口", "12345 / 12318 / 全国旅游监管服务平台一键可达"),
]
y = Inches(2.05)
for k, v in flags:
    text(s, Inches(9.5), y, Inches(3.2), Inches(0.35), k, size=13, bold=True, color=GREEN)
    text(s, Inches(9.5), y + Inches(0.34), Inches(3.15), Inches(0.7), v, size=10, color=GREY, spacing=1.35)
    y += Inches(1.08)
foot(s, 8)

# ── 09 架构 ─────────────────────────────────────────────
s = slide(CREAM_2)
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "08 · 技术架构", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "一个静态页面 + 一层轻函数，Key 不进浏览器", size=26, bold=True)


def block(x, y, w, h, title, sub, fill=WHITE, color=INK):
    b = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    b.fill.solid(); b.fill.fore_color.rgb = fill
    b.line.color.rgb = RGBColor(0xDD, 0xD6, 0xC7); b.shadow.inherit = False
    b.adjustments[0] = 0.12
    text(s, x + Inches(0.16), y + Inches(0.14), w - Inches(0.32), Inches(0.3), title, size=12.5, bold=True, color=color)
    text(s, x + Inches(0.16), y + Inches(0.46), w - Inches(0.32), h - Inches(0.5), sub, size=9.5, color=GREY, spacing=1.3)


block(Inches(0.8), Inches(2.2), Inches(3.3), Inches(1.5), "浏览器", "three.js 城市盘 + Leaflet 地图\n单文件 9 MB / 线上 2.6 MB")
block(Inches(4.4), Inches(2.2), Inches(3.3), Inches(1.5), "Netlify Functions", "health / search / official\npage / boundary / amap / chat")
block(Inches(8.0), Inches(2.2), Inches(4.5), Inches(1.5), "模型", "DeepSeek deepseek-chat\n只走服务端，Key 存环境变量")

block(Inches(0.8), Inches(4.1), Inches(2.5), Inches(1.35), "高德", "瓦片 · POI · 路径")
block(Inches(3.5), Inches(4.1), Inches(2.5), Inches(1.35), "DataV", "行政区划边界")
block(Inches(6.2), Inches(4.1), Inches(2.5), Inches(1.35), "检索", "博查 / 搜狗 / 360 / 微信")
block(Inches(8.9), Inches(4.1), Inches(3.6), Inches(1.35), "lib/core.js", "两端共用：解析、相关性、正文抽取")

text(s, Inches(0.8), Inches(5.75), Inches(11.5), Inches(0.9),
     "同一份 lib/core.js 同时跑在 Node（本地）与 Netlify，本地 node server.mjs、线上函数、离线 HTML 三种形态行为一致。",
     size=11, color=GREY, spacing=1.4)
foot(s, 9)

# ── 10 工程与数据 ───────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "09 · 工程与数据", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "九个数字说明完成度", size=27, bold=True)
stats = [
    ("3,949", "城市与区县"), ("19,202", "周边点位"), ("67", "精选景点卡"),
    ("76", "可溯源实拍"), ("339", "县域索引"), ("24", "目的地城市"),
    ("2.6 MB", "线上首屏"), ("3 s", "首屏可用"), ("0", "控制台报错"),
]
x, y = Inches(0.8), Inches(2.0)
for i, (n, label) in enumerate(stats):
    if i == 3 or i == 6:
        x, y = Inches(0.8), y + Inches(1.35)
    text(s, x, y, Inches(3.8), Inches(0.7), n, size=34, bold=True, color=GREEN)
    text(s, x, y + Inches(0.72), Inches(3.8), Inches(0.4), label, size=11.5, color=GREY)
    x += Inches(4.0)
rule(s, Inches(0.8), Inches(6.15), Inches(11.6), RGBColor(0xD8, 0xD2, 0xC4), Pt(0.75))
text(s, Inches(0.8), Inches(6.3), Inches(11.6), Inches(0.5),
     "自动化检查：tools/check.mjs（编码与标签）、audit-css.mjs（样式覆盖）、e2e.mjs（真实浏览器 5 问回归）",
     size=10.5, color=GREY)
foot(s, 10)

# ── 11 演示路径 ─────────────────────────────────────────
s = slide(CREAM_2)
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "10 · 三分钟演示路径", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "评审可以照着点一遍", size=27, bold=True)
steps = [
    ("打开首页", "3D 城市盘 + 3,949 座城市的搜索框"),
    ("选「昆明」", "底图、行政边界、4 张景点卡一起到"),
    ("点「翠湖公园」", "票价、开园时间、从南门进，各带 gov.cn 出处"),
    ("问「翠湖要票不」", "→「那要预约吗」→「从哪个门进」：连续追问不丢景点"),
    ("换「重庆」问行程", "模型生成，逐句编号；没收录的合并成一条"),
    ("填一个报价", "人均、必付、发票、许可四项风险，附举报入口"),
]
y = Inches(2.05)
for i, (k, v) in enumerate(steps):
    num_badge(s, Inches(0.8), y + Inches(0.04), i + 1)
    text(s, Inches(1.3), y, Inches(3.4), Inches(0.4), k, size=14.5, bold=True)
    text(s, Inches(4.9), y + Inches(0.03), Inches(7.4), Inches(0.6), v, size=11.5, color=GREY, spacing=1.35)
    if i < len(steps) - 1:
        rule(s, Inches(0.95), y + Inches(0.62), Inches(11.4), RGBColor(0xE2, 0xDC, 0xCE), Pt(0.6))
    y += Inches(0.78)
foot(s, 11)

# ── 12 边界与下一步 ─────────────────────────────────────
s = slide()
text(s, Inches(0.8), Inches(0.6), Inches(9), Inches(0.4), "11 · 诚实的边界", size=12, color=AMBER, bold=True)
text(s, Inches(0.8), Inches(1.0), Inches(11.4), Inches(0.7), "哪些能做到，哪些还做不到", size=27, bold=True)
left = [
    ("623 个区县没有官方几何", "已撤销或新设的区名，用虚线范围圈代替，并在状态栏注明"),
    ("公众号只是摘要", "海外出口拿不到 gov.cn 时，只给公众号标题与摘要，标注「非原文」"),
    ("模型响应有上限", "线上单次 9 秒超时，超时自动退回证据引擎，回答仍然逐句有出处"),
    ("实时人流暂无数据源", "只有官方公告与提示，不做「现在人多不多」的猜测"),
]
right = [
    ("接博查 API", "官方检索会从「能用」变成「稳定」，$/月可控"),
    ("景点卡扩到 200+", "现有 67 张，按省补，实拍仍是瓶颈"),
    ("人流与排队", "等有可靠数据源再接，不编"),
    ("小程序形态", "同一套 core.js，换壳即可"),
]
text(s, Inches(0.8), Inches(2.0), Inches(5.6), Inches(0.4), "已经做到的边界", size=13, bold=True, color=GREEN)
y = Inches(2.45)
for k, v in left:
    text(s, Inches(0.8), y, Inches(5.6), Inches(0.35), "· " + k, size=12, bold=True)
    text(s, Inches(1.05), y + Inches(0.32), Inches(5.4), Inches(0.55), v, size=10, color=GREY, spacing=1.3)
    y += Inches(0.95)
text(s, Inches(6.9), Inches(2.0), Inches(5.6), Inches(0.4), "下一步", size=13, bold=True, color=AMBER)
y = Inches(2.45)
for k, v in right:
    text(s, Inches(6.9), y, Inches(5.6), Inches(0.35), "· " + k, size=12, bold=True)
    text(s, Inches(7.15), y + Inches(0.32), Inches(5.4), Inches(0.55), v, size=10, color=GREY, spacing=1.3)
    y += Inches(0.95)
foot(s, 12)

# ── 13 结尾 ─────────────────────────────────────────────
s = slide(GREEN_D)
text(s, Inches(1.1), Inches(1.5), Inches(11), Inches(0.5), "城市安心游 · City Companion", size=14,
     color=RGBColor(0xA8, 0xC6, 0xB6))
text(s, Inches(1.1), Inches(2.1), Inches(11), Inches(1.6), "陌生的城市，\n也该看得见、问得清。", size=38,
     color=WHITE, bold=True, spacing=1.25)
rule(s, Inches(1.1), Inches(4.05), Inches(1.3), AMBER, Pt(3))
text(s, Inches(1.1), Inches(4.35), Inches(11), Inches(1.2),
     "https://city-companion.netlify.app\n点开即用 · 无需账号 · 每句回答都能回到出处", size=15,
     color=RGBColor(0xD5, 0xE3, 0xD9), spacing=1.6)
text(s, Inches(1.1), Inches(6.3), Inches(11), Inches(0.4), "队伍：利玛　·　2026 年 11 月", size=12,
     color=RGBColor(0x8F, 0xAB, 0x9C))

prs.save(OUT)
print("saved", OUT, os.path.getsize(OUT) // 1024, "KB")
