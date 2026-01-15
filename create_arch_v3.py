# -*- coding: utf-8 -*-
"""
DramaAI 核心技术架构图生成器
设计理念: Luminous Architecture
输出: 高清PNG图片
"""

from PIL import Image, ImageDraw, ImageFont
import os
import math

# 输出配置
OUTPUT_FILE = "d:/projects/dramaai/DramaAI_核心技术架构图.png"

# 图片尺寸
WIDTH, HEIGHT = 2400, 1600

# 色彩系统
class Colors:
    BACKGROUND = (10, 14, 39)
    SCREENWRITER = (102, 126, 234)
    STORYBOARD = (240, 147, 251)
    DESIGNER = (245, 87, 108)
    ARTIST = (79, 172, 254)
    DIRECTOR = (0, 242, 254)
    SERVICE = (0, 180, 200)
    STORAGE = (40, 70, 130)
    TEXT_PRIMARY = (255, 255, 255)
    TEXT_SECONDARY = (170, 180, 200)

def draw_circle(draw, center, radius, color, outline=None):
    """绘制圆形"""
    x, y = center
    if outline:
        for i in range(5):
            r = radius + i * 4
            draw.ellipse([x-r, y-r, x+r, y+r], outline=outline)
    draw.ellipse([x-radius, y-radius, x+radius, y+radius], fill=color)

def draw_roundrect(draw, xy, radius, color, outline=None):
    """绘制圆角矩形"""
    if outline:
        x1, y1, x2, y2 = xy
        for i in range(4):
            o = i * 3
            draw.round_rectangle([x1-o, y1-o, x2+o, y2+o], radius=radius, outline=outline)
    draw.round_rectangle(xy, radius=radius, fill=color)

def draw_line(draw, start, end, color, width=3):
    """绘制线条"""
    draw.line([start, end], fill=color, width=width)

def draw_text_centered(draw, text, center, font, color):
    """绘制居中文字"""
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = center[0] - w // 2
    y = center[1] - h // 2
    draw.text((x, y), text, font=font, fill=color)

def create_diagram():
    """创建架构图"""
    img = Image.new('RGB', (WIDTH, HEIGHT), Colors.BACKGROUND)
    draw = ImageDraw.Draw(img)

    # 字体
    try:
        font_title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 56)
        font_large = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 38)
        font_medium = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 26)
        font_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    except:
        font_title = font_large = font_medium = font_small = ImageFont.load_default()

    cx, cy = WIDTH // 2, HEIGHT // 2

    # 标题
    draw_text_centered(draw, "DramaAI 核心技术架构", (cx, 90), font_title, Colors.TEXT_PRIMARY)

    # === 五阶段核心层 ===
    stages = [
        ("编剧", Colors.SCREENWRITER, 0),
        ("分镜", Colors.STORYBOARD, 72),
        ("设计", Colors.DESIGNER, 144),
        ("美工", Colors.ARTIST, 216),
        ("导演", Colors.DIRECTOR, 288),
    ]

    radius = 80
    orbit = 400

    for name, color, angle in stages:
        rad = math.radians(angle - 90)
        x = cx + int(orbit * math.cos(rad))
        y = cy + int(orbit * math.sin(rad))

        # 连接线
        draw_line(draw, (x, y), (cx, cy), color, 4)

        # 节点（带光晕）
        draw_circle(draw, (x, y), radius, color, outline=color)
        draw_text_centered(draw, name, (x, y), font_large, Colors.TEXT_PRIMARY)

    # 中心引擎
    draw_circle(draw, (cx, cy), 110, Colors.ARTIST, outline=Colors.ARTIST)
    draw_text_centered(draw, "DramaAI", (cx, cy - 25), font_large, Colors.TEXT_PRIMARY)
    draw_text_centered(draw, "引擎", (cx, cy + 30), font_medium, Colors.TEXT_PRIMARY)

    # === 服务层（四角） ===
    services = [
        ("ProjectContext", "状态管理", -600, -350),
        ("ChatService", "AI对话", 600, -350),
        ("CanvasService", "画布操作", -600, 380),
        ("ValidationService", "数据校验", 600, 380),
    ]

    for title, desc, ox, oy in services:
        x, y = cx + ox, cy + oy
        draw_line(draw, (x, y), (cx, cy), Colors.SERVICE, 2)

        w, h = 220, 100
        draw_roundrect(draw, [x-w//2, y-h//2, x+w//2, y+h//2], 15, Colors.SERVICE, outline=Colors.SERVICE)
        draw_text_centered(draw, title, (x, y - 15), font_medium, Colors.TEXT_PRIMARY)
        draw_text_centered(draw, desc, (x, y + 20), font_small, Colors.TEXT_SECONDARY)

    # === 基础设施层 ===
    infra_y = HEIGHT - 180
    infras = [
        ("Vercel Serverless", "API层", -400),
        ("IndexedDB", "本地存储", 0),
        ("AI Models", "Claude + RunComfy", 400),
    ]

    for title, desc, ox in infras:
        x = cx + ox
        draw_line(draw, (x, infra_y - 100), (x, infra_y), Colors.STORAGE, 2)

        w, h = 280, 110
        draw_roundrect(draw, [x-w//2, infra_y-h//2, x+w//2, infra_y+h//2], 18, Colors.STORAGE, outline=Colors.STORAGE)
        draw_text_centered(draw, title, (x, infra_y - 12), font_medium, Colors.TEXT_PRIMARY)
        draw_text_centered(draw, desc, (x, infra_y + 22), font_small, Colors.TEXT_SECONDARY)

    # === 左侧创新点 ===
    innovations = [
        "StaleTracker 数据管理",
        "无限画布 + AI对话",
        "流式AI响应系统",
    ]

    iy = cy - 120
    for text in innovations:
        # 小圆点
        draw_circle(draw, (180, iy), 10, Colors.DESIGNER)
        # 文字
        draw.text((210, iy - 12), text, font=font_small, fill=Colors.TEXT_SECONDARY)
        iy += 90

    # === 右侧数据流 ===
    flow_labels = ["用户输入", "AI处理", "数据存储", "画布渲染"]
    fy = cy - 100
    for text in flow_labels:
        draw_text_centered(draw, text, (WIDTH - 220, fy), font_small, Colors.TEXT_SECONDARY)
        fy += 60
        if fy < cy + 150:
            draw_text_centered(draw, "↓", (WIDTH - 220, fy), font_large, Colors.DIRECTOR)
            fy += 50

    # 底部装饰能量线
    for i in range(5):
        y = HEIGHT - 300 + i * 18
        c = max(30, 50 + i * 20)
        draw.rectangle([150, y, WIDTH-150, y+3], fill=(c, c, c))

    # 保存
    img.save(OUTPUT_FILE, 'PNG', dpi=(300, 300))

    print("=" * 60)
    print("[SUCCESS] 已生成技术架构图!")
    print("=" * 60)
    print(f"文件: {OUTPUT_FILE}")
    print(f"尺寸: {WIDTH} x {HEIGHT} px @ 300 DPI")
    print(f"设计理念: Luminous Architecture")
    print("=" * 60)

if __name__ == "__main__":
    create_diagram()
