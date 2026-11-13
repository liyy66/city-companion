"""用 edge-tts 的神经网络男声生成 7 段旁白（磁性、非机器音）。
用法：python tools/vo_edge.py [voice] [rate]
"""
import asyncio
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "vo4"
OUT.mkdir(parents=True, exist_ok=True)

VOICE = sys.argv[1] if len(sys.argv) > 1 else "zh-CN-YunjianNeural"
RATE = sys.argv[2] if len(sys.argv) > 2 else "-3%"

TEXTS = [
    "城市安心游，把三件事放在一个页面里：全国三千九百四十九座城市的地图，可以核对的景点信息，还有一个会先查资料、再回答的 AI 向导。",
    "底图用的是高德实时瓦片。换一座城市，行政边界和景点会一起加载。",
    "点开任意一张景点卡，票价、开放时间、从哪个门进，都标着出处和日期。",
    "问它问题的时候，它先查政府官网的原文，抓不到，再退到公众号和公开检索，最后才交给模型组织语言。模型只能引用带编号的证据，没有出处的句子，会被整句丢掉。",
    "所以每一句后面都有编号，点开就能回到原始页面。连续追问，也不会丢上下文：问完翠湖门票，再问从哪个门进，它还在翠湖；换成重庆，也不会串。",
    "查不到，就说查不到，把还差哪几项列清楚。还有一个消费核验：报价、必须另付的项目、发票、经营许可，拆开算。",
    "深浅色两套主题，手机上也能用。整站也能打成一个 HTML 文件，离线双击就能打开。",
]


async def main() -> None:
    for i, text in enumerate(TEXTS, start=1):
        path = OUT / f"vo{i}.mp3"
        comm = edge_tts.Communicate(text, VOICE, rate=RATE, volume="+0%")
        await comm.save(str(path))
        print(f"{path.name} {path.stat().st_size // 1024}KB")


asyncio.run(main())
