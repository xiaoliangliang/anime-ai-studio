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
OUTPUT_DIR = "d:/projects/dramaai"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "DramaAI_核心技术架构图.png")

# 图片尺寸
WIDTH = 2400
HEIGHT = 1600
DPI = 300

# Luminous Architecture 色彩系统
class Colors:
    # 背景深空
    BACKGROUND = (10, 14, 39)  # #0a0e27

    # 五阶段渐变色（高温区）
    SCREENWRITER = (102, 126, 234)    # #667eea
    STORYBOARD = (240, 147, 251)      # #f093fb
    DESIGNER = (245, 87, 108)         # #f5576c
    ARTIST = (79, 172, 254)           # #4facfe
    DIRECTOR = (0, 242, 254)          # #00f2fe

    # 服务层（中温区）
    SERVICE = (0, 200, 220)
    STORAGE = (30, 60, 120)

    # 文字
    TEXT_PRIMARY = (255, 255, 255)
    TEXT_SECONDARY = (160, 174, 192)

def gradient_color(start, end, t):
    """计算渐变色"""
    return (
        int(start[0] + (end[0] - start[0]) * t),
        int(start[1] + (end[1] - start[1]) * t),
        int(start[2] + (end[2] - start[2]) * t),
    )

def draw_glow_circle(draw, center, radius, color, glow_radius=None):
    """绘制发光圆形（多层透明度叠加）"""
    if glow_radius is None:
        glow_radius = int(radius * 1.5)

    # 外层光晕（低透明度）
    for i in range(10):
        alpha = int(15 * (1 - i / 10))
        r = glow_radius + i * 3
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.ellipse([
            center[0] - r, center[1] - r,
            center[0] + r, center[1] + r
        ], fill=(*color, alpha))
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 中层光晕（中透明度）
    for i in range(8):
        alpha = int(40 * (1 - i / 8))
        r = radius + i * 4
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.ellipse([
            center[0] - r, center[1] - r,
            center[0] + r, center[1] + r
        ], fill=(*color, alpha))
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 核心圆（高透明度）
    draw.ellipse([
        center[0] - radius, center[1] - radius,
        center[0] + radius, center[1] + radius
    ], fill=color)

def draw_glow_roundrect(draw, xy, corner_radius, color, glow_radius=None):
    """绘制发光圆角矩形"""
    x1, y1, x2, y2 = xy
    width = x2 - x1
    height = y2 - y1

    if glow_radius is None:
        glow_radius = 15

    # 光晕
    for i in range(6):
        alpha = int(30 * (1 - i / 6))
        offset = i * 4
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.round_rectangle([
            x1 - offset, y1 - offset,
            x2 + offset, y2 + offset
        ], radius=corner_radius, fill=(*color, alpha))
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 主体
    draw.round_rectangle(xy, radius=corner_radius, fill=color)

def draw_connection_line(draw, start, end, color, width=3):
    """绘制发光连接线"""
    # 光晕层
    for i in range(5):
        alpha = int(50 * (1 - i / 5))
        offset = i * 2
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.line([
            (start[0], start[1]),
            (end[0], end[1])
        ], fill=(*color, alpha), width=width + offset * 2)
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 核心线
    draw.line([
        (start[0], start[1]),
        (end[0], end[1])
    ], fill=color, width=width)

def draw_text_centered(draw, text, center, font, color):
    """绘制居中文字"""
    bbox = font.getbbox(text)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = center[0] - text_width // 2
    y = center[1] - text_height // 2

    # 文字阴影（发光效果）
    for i in range(3):
        alpha = int(80 * (1 - i / 3))
        offset = i + 1
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.text((x + offset, y + offset), text, font=font, fill=(*color, alpha))
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 主体文字
    draw.text((x, y), text, font=font, fill=color)

def create_architecture_diagram():
    """创建架构图"""
    # 创建画布
    img = Image.new('RGB', (WIDTH, HEIGHT), Colors.BACKGROUND)
    draw = ImageDraw.Draw(img, 'RGBA')

    # 加载字体
    try:
        font_large = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 48)
        font_medium = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 32)
        font_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 24)
        font_tiny = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()
        font_tiny = ImageFont.load_default()

    # 中心点
    center_x, center_y = WIDTH // 2, HEIGHT // 2

    # 标题
    draw_text_centered(draw, "DramaAI 核心技术架构", (center_x, 80), font_large, Colors.TEXT_PRIMARY)

    # === 五阶段创作流水线（核心层） ===
    stages = [
        ("编剧", Colors.SCREENWRITER),
        ("分镜", Colors.STORYBOARD),
        ("设计", Colors.DESIGNER),
        ("美工", Colors.ARTIST),
        ("导演", Colors.DIRECTOR),
    ]

    stage_radius = 75
    stage_orbit_radius = 380

    stage_positions = []
    for i, (name, color) in enumerate(stages):
        angle = math.radians(-90 + i * 72)  # 从顶部开始
        x = center_x + int(stage_orbit_radius * math.cos(angle))
        y = center_y + int(stage_orbit_radius * math.sin(angle))
        stage_positions.append((x, y, name, color))

        # 连接到中心的线
        draw_connection_line(draw, (x, y), (center_x, center_y), (*color, 100), 4)

        # 发光圆形
        draw_glow_circle(draw, (x, y), stage_radius, color)

        # 文字
        draw_text_centered(draw, name, (x, y), font_medium, Colors.TEXT_PRIMARY)

    # 中心核
    core_color = Colors.ARTIST
    draw_glow_circle(draw, (center_x, center_y), 100, core_color)
    draw_text_centered(draw, "DramaAI", (center_x, center_y - 15), font_medium, Colors.TEXT_PRIMARY)
    draw_text_centered(draw, "引擎", (center_x, center_y + 25), font_small, Colors.TEXT_PRIMARY)

    # === 支撑服务层 ===
    services = [
        ("ProjectContext", "状态管理", (center_x - 550, center_y - 350)),
        ("ChatService", "AI对话", (center_x + 550, center_y - 350)),
        ("CanvasService", "画布操作", (center_x - 550, center_y + 350)),
        ("ValidationService", "数据校验", (center_x + 550, center_y + 350)),
    ]

    for service, desc, pos in services:
        x, y = pos

        # 连接线
        draw_connection_line(draw, (x, y), (center_x, center_y), (*Colors.SERVICE, 80), 2)

        # 服务框
        box_width, box_height = 200, 100
        draw_glow_roundrect(draw, [
            x - box_width // 2, y - box_height // 2,
            x + box_width // 2, y + box_height // 2
        ], 15, Colors.SERVICE)

        # 文字
        draw_text_centered(draw, service, (x, y - 12), font_small, Colors.TEXT_PRIMARY)
        draw_text_centered(draw, desc, (x, y + 20), font_tiny, Colors.TEXT_SECONDARY)

    # === 底部基础设施层 ===
    infra_positions = [
        (center_x - 400, HEIGHT - 200),
        (center_x, HEIGHT - 200),
        (center_x + 400, HEIGHT - 200),
    ]

    infra_names = ["Vercel Serverless", "IndexedDB", "AI Models"]
    infras = [
        ("Replicate", "Claude 4.5"),
        ("RunComfy", "Seedream 4.5"),
    ]

    # 存储层
    for i, pos in enumerate(infra_positions):
        x, y = pos

        # 垂直连接线
        draw_connection_line(draw, (x, y - 150), (x, y), (*Colors.STORAGE, 60), 2)

        # 基础设施框
        box_width, box_height = 280, 120
        draw_glow_roundrect(draw, [
            x - box_width // 2, y - box_height // 2,
            x + box_width // 2, y + box_height // 2
        ], 20, Colors.STORAGE)

        # 文字
        draw_text_centered(draw, infra_names[i], (x, y - 10), font_small, Colors.TEXT_PRIMARY)

    # AI服务详情（最底层）
    ai_y = HEIGHT - 80
    draw_text_centered(draw, "Claude 4.5 Sonnet", (center_x - 400, ai_y), font_tiny, Colors.TEXT_SECONDARY)
    draw_text_centered(draw, "文本生成", (center_x - 400, ai_y + 30), font_tiny, Colors.TEXT_SECONDARY)

    draw_text_centered(draw, "Seedream 4.5", (center_x, ai_y), font_tiny, Colors.TEXT_SECONDARY)
    draw_text_centered(draw, "图像生成", (center_x, ai_y + 30), font_tiny, Colors.TEXT_SECONDARY)

    draw_text_centered(draw, "RunComfy Video", (center_x + 400, ai_y), font_tiny, Colors.TEXT_SECONDARY)
    draw_text_centered(draw, "视频生成", (center_x + 400, ai_y + 30), font_tiny, Colors.TEXT_SECONDARY)

    # === 左侧核心创新 ===
    innovations_y = center_y
    innovations = [
        "StaleTracker",
        "数据管理",
        "无限画布",
        "AI对话",
        "流式响应",
    ]

    for i, text in enumerate(innovations):
        y = innovations_y - 150 + i * 75
        x = 200

        # 小圆点
        draw_glow_circle(draw, (x, y), 8, Colors.DESIGNER)

        # 文字
        draw.text((x + 20, y - 10), text, font=font_tiny, fill=Colors.TEXT_SECONDARY)

    # === 右侧数据流指示 ===
    flow_y = center_y
    flow_texts = [
        "用户输入",
        "↓",
        "AI处理",
        "↓",
        "数据存储",
        "↓",
        "画布渲染",
    ]

    for i, text in enumerate(flow_texts):
        y = flow_y - 150 + i * 50
        x = WIDTH - 200

        if text == "↓":
            draw_text_centered(draw, "↓", (x, y), font_small, Colors.ACCENT)
        else:
            draw.text((x, y - 10), text, font=font_tiny, fill=Colors.TEXT_SECONDARY)

    # === 底部装饰性能量线 ===
    for i in range(5):
        y = HEIGHT - 280 + i * 15
        alpha = int(30 * (1 - i / 5))
        layer = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.rectangle([100, y, WIDTH - 100, y + 2], fill=(*Colors.ACCENT, alpha))
        draw.bitmap((0, 0), layer, mask=layer.split()[-1])

    # 保存
    img.save(OUTPUT_FILE, 'PNG', dpi=(DPI, DPI))

    print("=" * 60)
    print("[SUCCESS] 已生成世界级水准技术架构图!")
    print("=" * 60)
    print(f"文件: {OUTPUT_FILE}")
    print(f"尺寸: {WIDTH} x {HEIGHT} px")
    print(f"DPI: {DPI}")
    print(f"设计理念: Luminous Architecture")
    print("=" * 60)

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    create_architecture_diagram()
