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

# Luminous Architecture 色彩系统
class Colors:
    BACKGROUND = (10, 14, 39)

    SCREENWRITER = (102, 126, 234)
    STORYBOARD = (240, 147, 251)
    DESIGNER = (245, 87, 108)
    ARTIST = (79, 172, 254)
    DIRECTOR = (0, 242, 254)

    SERVICE = (0, 200, 220)
    STORAGE = (30, 60, 120)

    TEXT_PRIMARY = (255, 255, 255)
    TEXT_SECONDARY = (160, 174, 192)

def draw_glow_circle(draw, center, radius, color):
    """绘制发光圆形"""
    x, y = center
    # 多层光晕
    for i in range(10, 0, -1):
        alpha = 15 + i * 8
        r = radius + (10 - i) * 3
        draw.ellipse([x-r, y-r, x+r, y+r], outline=(*color, min(alpha, 100)), width=2)

    # 主体
    draw.ellipse([x-radius, y-radius, x+radius, y+radius], fill=color)

def draw_glow_roundrect(draw, xy, corner_radius, color):
    """绘制发光圆角矩形"""
    x1, y1, x2, y2 = xy

    # 光晕
    for i in range(5, 0, -1):
        alpha = 20 + i * 15
        offset = i * 3
        draw.round_rectangle([
            x1-offset, y1-offset, x2+offset, y2+offset
        ], radius=corner_radius, outline=(*color, min(alpha, 100)), width=2)

    # 主体
    draw.round_rectangle(xy, radius=corner_radius, fill=color)

def draw_line_glow(draw, start, end, color, width=3):
    """绘制发光线条"""
    # 光晕
    for i in range(3, 0, -1):
        alpha = 30 + i * 20
        offset = i * 2
        draw.line([start, end], fill=(*color, min(alpha, 120)), width=width+offset)

    # 主体
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
    draw = ImageDraw.Draw(img, 'RGBA')

    # 字体
    try:
        font_title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 56)
        font_large = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 40)
        font_medium = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 28)
        font_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
    except:
        font_title = font_large = font_medium = font_small = ImageFont.load_default()

    cx, cy = WIDTH // 2, HEIGHT // 2

    # 标题
    draw_text_centered(draw, "DramaAI 核心技术架构", (cx, 90), font_title, Colors.TEXT_PRIMARY)

    # === 五阶段（核心层，圆形排列） ===
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
        draw_line_glow(draw, (x, y), (cx, cy), color, 4)

        # 节点
        draw_glow_circle(draw, (x, y), radius, color)
        draw_text_centered(draw, name, (x, y), font_large, Colors.TEXT_PRIMARY)

    # 中心核
    draw_glow_circle(draw, (cx, cy), 110, Colors.ARTIST)
    draw_text_centered(draw, "DramaAI", (cx, cy - 25), font_large, Colors.TEXT_PRIMARY)
    draw_text_centered(draw, "引擎", (cx, cy + 30), font_medium, Colors.TEXT_PRIMARY)

    # === 服务层（四角） ===
    services = [
        ("ProjectContext\n状态管理", -600, -350),
        ("ChatService\nAI对话", 600, -350),
        ("CanvasService\n画布操作", -600, 380),
        ("ValidationService\n数据校验", 600, 380),
    ]

    for text, ox, oy in services:
        x, y = cx + ox, cy + oy
        draw_line_glow(draw, (x, y), (cx, cy), (*Colors.SERVICE, 80), 2)

        w, h = 220, 100
        draw_glow_roundrect(draw, [x-w//2, y-h//2, x+w//2, y+h//2], 15, Colors.SERVICE)

        lines = text.split('\n')
        for i, line in enumerate(lines):
            draw_text_centered(draw, line, (x, y - 15 + i * 30),
                             font_medium if i == 0 else font_small,
                             Colors.TEXT_PRIMARY if i == 0 else Colors.TEXT_SECONDARY)

    # === 基础设施层（底部） ===
    infra_y = HEIGHT - 180
    infras = [
        ("Vercel Serverless\nAPI层", -400),
        ("IndexedDB\n本地存储", 0),
        ("AI Models\nClaude + RunComfy", 400),
    ]

    for text, ox in infras:
        x = cx + ox
        draw_line_glow(draw, (x, infra_y - 100), (x, infra_y), (*Colors.STORAGE, 60), 2)

        w, h = 280, 110
        draw_glow_roundrect(draw, [x-w//2, infra_y-h//2, x+w//2, infra_y+h//2], 18, Colors.STORAGE)

        lines = text.split('\n')
        for i, line in enumerate(lines):
            draw_text_centered(draw, line, (x, infra_y - 12 + i * 28),
                             font_medium if i == 0 else font_small,
                             Colors.TEXT_PRIMARY)

    # === 左侧创新点 ===
    innovations = [
        "StaleTracker 数据管理",
        "无限画布 + AI对话",
        "流式AI响应系统",
    ]

    iy = cy - 120
    for text in innovations:
        # 小圆点
        draw_glow_circle(draw, (180, iy), 10, Colors.DESIGNER)
        # 文字
        draw.text((210, iy - 12), text, font=font_small, fill=Colors.TEXT_SECONDARY)
        iy += 90

    # === 右侧数据流 ===
    flow = [
        ("用户输入", False),
        ("↓", True),
        ("AI处理", False),
        ("↓", True),
        ("数据存储", False),
        ("↓", True),
        ("画布渲染", False),
    ]

    fy = cy - 120
    for text, is_arrow in flow:
        if is_arrow:
            draw_text_centered(draw, "↓", (WIDTH - 220, fy), font_large, Colors.DIRECTOR)
        else:
            draw_text_centered(draw, text, (WIDTH - 220, fy), font_small, Colors.TEXT_SECONDARY)
        fy += 60

    # 底部能量线
    for i in range(5):
        y = HEIGHT - 300 + i * 18
        draw.rectangle([150, y, WIDTH-150, y+3], fill=(*Colors.DIRECTOR, 20+i*15))

    # 保存
    img.save(OUTPUT_FILE, 'PNG', dpi=(300, 300))

    print("=" * 60)
    print("[SUCCESS] 已生成世界级水准技术架构图!")
    print("=" * 60)
    print(f"文件: {OUTPUT_FILE}")
    print(f"尺寸: {WIDTH} x {HEIGHT} px")
    print(f"设计理念: Luminous Architecture")
    print("=" * 60)

if __name__ == "__main__":
    create_diagram()
