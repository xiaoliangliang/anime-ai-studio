"""
DramaAI 世界级黑客松PPT生成器
基于 Data Flow Chromatics 设计哲学
"""

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color, HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.units import cm
import os

# 输出文件
OUTPUT_DIR = "d:/projects/dramaai"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "DramaAI_Hackathon_Pitch_Deck.pdf")

# 色彩系统 - Data Flow Chromatics
COLORS = {
    'background': '#0a0e27',  # 深空蓝紫
    'screenwriter_start': '#667eea',  # 编剧：深紫
    'screenwriter_end': '#f093fb',    # 编剧：洋红
    'storyboard_start': '#f093fb',    # 分镜：洋红
    'storyboard_end': '#f5576c',      # 分镜：橙红
    'designer_start': '#f5576c',      # 设计：橙红
    'designer_end': '#ffd200',        # 设计：金黄
    'artist_start': '#4facfe',        # 美工：青蓝
    'artist_end': '#00f2fe',          # 美工：青色
    'director_start': '#00f2fe',      # 导演：青色
    'director_end': '#0a0e27',        # 导演：深蓝
    'text_primary': '#ffffff',
    'text_secondary': '#a0aec0',
    'accent': '#00f2fe',
}

def create_gradient_rect(c, x, y, width, height, color_start, color_end, vertical=True):
    """创建渐变矩形"""
    # 简化版：使用两层半透明矩形模拟渐变
    c.setFillColor(HexColor(color_start))
    c.rect(x, y, width, height, fill=1, stroke=0)

    # 添加渐变效果的中间层
    mid_color = Color(
        (HexColor(color_start).red + HexColor(color_end).red) / 2,
        (HexColor(color_start).green + HexColor(color_end).green) / 2,
        (HexColor(color_start).blue + HexColor(color_end).blue) / 2,
        0.5
    )
    c.setFillColor(mid_color)
    c.rect(x, y, width, height/2, fill=1, stroke=0)

def draw_stage_node(c, x, y, radius, color, label, number):
    """绘制五阶段节点"""
    # 外圈光晕
    c.setFillColor(HexColor(color))
    c.circle(x, y, radius + 3, fill=1, stroke=0)

    # 主圆
    c.setFillColor(HexColor(COLORS['background']))
    c.circle(x, y, radius, fill=1, stroke=0)

    # 内圈
    c.setFillColor(HexColor(color))
    c.circle(x, y, radius - 5, fill=1, stroke=0)

    # 数字
    c.setFillColor(COLORS['background'])
    c.setFont('Helvetica-Bold', int(radius * 0.8))
    c.drawCentredString(x, y - radius * 0.3, str(number))

    # 标签
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica', 10)
    c.drawCentredString(x, y - radius - 15, label)

def draw_cover_page(c):
    """第1页：封面"""
    # 背景
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 装饰性渐变圆环（背景）
    create_gradient_rect(c, A4[0]*0.6, A4[1]*0.7, 200, 200,
                         COLORS['screenwriter_start'], COLORS['director_end'])

    # 主标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 48)
    title_width = c.stringWidth('DramaAI', 'Helvetica-Bold', 48)
    c.drawCentredString((A4[0] - title_width) / 2, A4[1] * 0.65, 'DramaAI')

    # 副标题
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica', 24)
    subtitle = 'AI短剧一站式创作平台'
    subtitle_width = c.stringWidth(subtitle, 'Helvetica', 24)
    c.drawCentredString((A4[0] - subtitle_width) / 2, A4[1] * 0.55, subtitle)

    # 五阶段流程图
    stage_x = A4[0] * 0.15
    stage_y = A4[1] * 0.35
    stage_spacing = A4[0] * 0.15

    stages = [
        ('编剧', COLORS['screenwriter_start']),
        ('分镜', COLORS['storyboard_start']),
        ('设计', COLORS['designer_start']),
        ('美工', COLORS['artist_start']),
        ('导演', COLORS['director_start']),
    ]

    for i, (label, color) in enumerate(stages):
        x = stage_x + i * stage_spacing
        draw_stage_node(c, x, stage_y, 30, color, label, i + 1)

        # 连接线
        if i < len(stages) - 1:
            c.setStrokeColor(HexColor(COLORS['text_secondary']))
            c.setLineWidth(2)
            c.line(x + 35, stage_y, x + stage_spacing - 35, stage_y)

    # 底部Slogan
    c.setFillColor(COLORS['text_secondary'])
    c.setFont('Helvetica-Oblique', 16)
    slogan = '让每个人都能成为动漫导演'
    slogan_width = c.stringWidth(slogan, 'Helvetica-Oblique', 16)
    c.drawCentredString((A4[0] - slogan_width) / 2, A4[1] * 0.15, slogan)

def draw_problem_page(c):
    """第2页：问题陈述"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.85, '创作之痛')

    # 三大痛点（三个渐变卡片）
    pain_points = [
        ('3-6个月', '创作周期'),
        ('10人团队', '人力需求'),
        ('50万元', '制作成本'),
    ]

    card_width = A4[0] * 0.25
    card_height = A4[1] * 0.35
    card_y = A4[1] * 0.4
    card_spacing = A4[0] * 0.08
    start_x = (A4[0] - 3 * card_width - 2 * card_spacing) / 2

    for i, (value, label) in enumerate(pain_points):
        x = start_x + i * (card_width + card_spacing)

        # 卡片背景（渐变效果模拟）
        c.setFillColor(HexColor(COLORS['screenwriter_start']))
        c.roundRect(x, card_y, card_width, card_height, 15, fill=1, stroke=0)

        c.setFillColor(COLORS['text_primary'])
        c.setFont('Helvetica-Bold', 32)
        c.drawCentredString(x + card_width / 2, card_y + card_height * 0.6, value)

        c.setFont('Helvetica', 16)
        c.drawCentredString(x + card_width / 2, card_y + card_height * 0.35, label)

    # 解决方案标题
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Bold', 28)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.15, 'DramaAI: 3小时 · 1个人 · 几百元')

def draw_solution_page(c):
    """第3页：解决方案"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.88, '五阶段AI创作流水线')

    # 中央流程图（更大更详细）
    center_x = A4[0] / 2
    center_y = A4[1] / 2
    radius = 45
    angle_step = 72  # 360 / 5

    stages = [
        ('编剧', COLORS['screenwriter_start'], '剧本\n大纲'),
        ('分镜', COLORS['storyboard_start'], '镜头\n拆解'),
        ('设计', COLORS['designer_start'], '提示词\n生成'),
        ('美工', COLORS['artist_start'], '参考图\n生成'),
        ('导演', COLORS['director_start'], '视频\n生成'),
    ]

    import math

    for i, (label, color, desc) in enumerate(stages):
        angle = 90 - i * angle_step  # 从顶部开始
        rad = math.radians(angle)
        x = center_x + 120 * math.cos(rad)
        y = center_y + 120 * math.sin(rad)

        # 节点
        c.setFillColor(HexColor(color))
        c.circle(x, y, radius, fill=1, stroke=0)

        c.setFillColor(COLORS['background'])
        c.setFont('Helvetica-Bold', 18)
        c.drawCentredString(x, y + 8, label)

        c.setFont('Helvetica', 12)
        c.drawCentredString(x, y - 12, desc)

        # 连向中心的线
        c.setStrokeColor(HexColor(COLORS['text_secondary']))
        c.setLineWidth(2)
        c.line(x, y, center_x, center_y)

    # 中心圆
    c.setFillColor(HexColor(COLORS['background']))
    c.circle(center_x, center_y, 40, fill=1, stroke=0)
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(center_x, center_y + 5, 'DramaAI')

    # 底部创新点
    innovations = [
        'StaleTracker 数据管理',
        '无限画布 + AI对话',
        '流式AI响应系统',
    ]

    c.setFont('Helvetica', 14)
    y = A4[1] * 0.12
    for i, innovation in enumerate(innovations):
        c.setFillColor(HexColor(COLORS['text_secondary']))
        c.drawCentredString(A4[0] / 2, y, innovation)
        y -= 25

def draw_tech_page(c):
    """第4页：技术架构"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.9, '技术架构')

    # 三层架构
    layers = [
        ('前端层', 'React 18 + TypeScript + Vite + tldraw', COLORS['screenwriter_start']),
        ('状态层', 'ProjectContext + IndexedDB 本地存储', COLORS['designer_start']),
        ('API层', 'Vercel Serverless Functions', COLORS['artist_start']),
        ('AI层', 'Claude 4.5 + RunComfy Seedream', COLORS['director_start']),
    ]

    box_height = A4[1] * 0.15
    box_width = A4[0] * 0.6
    start_y = A4[1] * 0.75
    spacing = A4[1] * 0.03

    for title, content, color in layers:
        # 背景
        c.setFillColor(HexColor(color))
        c.roundRect((A4[0] - box_width) / 2, start_y - box_height,
                    box_width, box_height, 10, fill=1, stroke=0)

        # 标题
        c.setFillColor(COLORS['background'])
        c.setFont('Helvetica-Bold', 16)
        c.drawCentredString(A4[0] / 2, start_y - box_height * 0.35, title)

        # 内容
        c.setFont('Helvetica', 12)
        c.drawCentredString(A4[0] / 2, start_y - box_height * 0.65, content)

        # 箭头（使用路径）
        if start_y > A4[1] * 0.4:
            c.setFillColor(HexColor(COLORS['text_primary']))
            path = c.beginPath()
            path.moveTo(A4[0] / 2, start_y - box_height - 5)
            path.lineTo(A4[0] / 2 - 8, start_y - box_height - 15)
            path.lineTo(A4[0] / 2 + 8, start_y - box_height - 15)
            path.close()
            c.drawPath(path, fill=1, stroke=0)

        start_y -= box_height + spacing

    # 底部技术亮点
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.08,
                        '全球首个基于无限画布的AI漫剧创作平台')

def draw_roi_page(c):
    """第5页：ROI分析"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.88, '价值提升')

    # 三大数据
    metrics = [
        ('720倍', '时间效率', '3个月 → 3小时'),
        ('10倍', '人力效率', '10人 → 1人'),
        ('1000倍+', '成本效率', '50万 → 几百元'),
    ]

    card_width = A4[0] * 0.28
    card_height = A4[1] * 0.25
    card_y = A4[1] * 0.55
    card_spacing = A4[0] * 0.05
    start_x = (A4[0] - 3 * card_width - 2 * card_spacing) / 2

    for i, (value, label, detail) in enumerate(metrics):
        x = start_x + i * (card_width + card_spacing)

        # 卡片背景
        c.setFillColor(HexColor(COLORS['screenwriter_start']))
        c.roundRect(x, card_y, card_width, card_height, 12, fill=1, stroke=0)

        # 大数字
        c.setFillColor(COLORS['text_primary'])
        c.setFont('Helvetica-Bold', 36)
        c.drawCentredString(x + card_width / 2, card_y + card_height * 0.65, value)

        # 标签
        c.setFont('Helvetica', 14)
        c.drawCentredString(x + card_width / 2, card_y + card_height * 0.45, label)

        # 详情
        c.setFont('Helvetica-Oblique', 11)
        c.drawCentredString(x + card_width / 2, card_y + card_height * 0.25, detail)

    # 商业预测
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Bold', 20)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.22, '商业价值预测')

    predictions = [
        ('第一年', '60万'),
        ('第二年', '600万'),
        ('第三年', '6000万'),
    ]

    pred_y = A4[1] * 0.15
    pred_spacing = A4[0] * 0.25
    pred_start_x = (A4[0] - 3 * pred_spacing) / 2 + pred_spacing / 2

    for i, (year, amount) in enumerate(predictions):
        x = pred_start_x + i * pred_spacing
        c.setFillColor(COLORS['text_primary'])
        c.setFont('Helvetica', 12)
        c.drawCentredString(x, pred_y, year)

        c.setFont('Helvetica-Bold', 16)
        c.drawCentredString(x, pred_y - 18, amount)

def draw_roadmap_page(c):
    """第6页：发展路线图"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.9, '发展路线图')

    # 时间线
    phases = [
        ('短期', '3-6个月', [
            '图片生成功能',
            '视频生成功能',
            '用户系统',
            '云端同步',
        ], COLORS['screenwriter_start']),
        ('中期', '6-12个月', [
            'AI模型市场',
            '协作功能',
            '移动端适配',
            'API开放',
        ], COLORS['designer_start']),
        ('长期', '1-3年', [
            '成为AI时代的Adobe',
            '多领域扩展',
            '国际化布局',
            '企业服务',
        ], COLORS['artist_start']),
    ]

    box_width = A4[0] * 0.28
    box_height = A4[1] * 0.55
    card_y = A4[1] * 0.32
    card_spacing = A4[0] * 0.05
    start_x = (A4[0] - 3 * box_width - 2 * card_spacing) / 2

    for i, (phase, time, items, color) in enumerate(phases):
        x = start_x + i * (box_width + card_spacing)

        # 卡片背景
        c.setFillColor(HexColor(color))
        c.roundRect(x, card_y, box_width, box_height, 12, fill=1, stroke=0)

        # 阶段标题
        c.setFillColor(COLORS['text_primary'])
        c.setFont('Helvetica-Bold', 18)
        c.drawCentredString(x + box_width / 2, card_y + box_height * 0.85, phase)

        # 时间
        c.setFont('Helvetica', 12)
        c.drawCentredString(x + box_width / 2, card_y + box_height * 0.72, time)

        # 列表项
        c.setFont('Helvetica', 11)
        item_y = card_y + box_height * 0.55
        for item in items:
            c.drawCentredString(x + box_width / 2, item_y, item)
            item_y -= 25

    # 愿景
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Bold', 16)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.12, '愿景：让每个人都能成为动漫导演')

def draw_contact_page(c):
    """第7页：联系页"""
    c.setFillColor(HexColor(COLORS['background']))
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)

    # 大标题
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 48)
    title = 'DramaAI'
    title_width = c.stringWidth(title, 'Helvetica-Bold', 48)
    c.drawCentredString((A4[0] - title_width) / 2, A4[1] * 0.7, title)

    # Slogan
    c.setFillColor(HexColor(COLORS['accent']))
    c.setFont('Helvetica-Oblique', 24)
    slogan = '让每个人都能成为动漫导演'
    slogan_width = c.stringWidth(slogan, 'Helvetica-Oblique', 24)
    c.drawCentredString((A4[0] - slogan_width) / 2, A4[1] * 0.58, slogan)

    # 装饰圆
    c.setStrokeColor(HexColor(COLORS['screenwriter_start']))
    c.setLineWidth(3)
    c.circle(A4[0] / 2, A4[1] * 0.64, 80, fill=0, stroke=1)

    # 联系方式
    contact_info = [
        ('网站', 'https://animeaistudio.com'),
        ('邮箱', 'contact@animeaistudio.com'),
        ('GitHub', 'github.com/dramaai/dramaai'),
    ]

    c.setFont('Helvetica', 14)
    contact_y = A4[1] * 0.38
    contact_spacing = 35

    for label, value in contact_info:
        c.setFillColor(HexColor(COLORS['text_secondary']))
        c.drawCentredString(A4[0] / 2, contact_y, f'{label}: {value}')
        contact_y -= contact_spacing

    # 感谢
    c.setFillColor(COLORS['text_primary'])
    c.setFont('Helvetica-Bold', 20)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.12, '感谢聆听')

    c.setFont('Helvetica', 14)
    c.drawCentredString(A4[0] / 2, A4[1] * 0.08, 'Q & A')

def create_pitch_deck():
    """创建完整的PPT"""
    c = canvas.Canvas(OUTPUT_FILE, pagesize=A4)

    # 生成各页
    draw_cover_page(c)
    c.showPage()

    draw_problem_page(c)
    c.showPage()

    draw_solution_page(c)
    c.showPage()

    draw_tech_page(c)
    c.showPage()

    draw_roi_page(c)
    c.showPage()

    draw_roadmap_page(c)
    c.showPage()

    draw_contact_page(c)
    c.showPage()

    c.save()
    print(f"[SUCCESS] 已生成世界级水准PPT: {OUTPUT_FILE}")
    print("="*60)
    print("设计理念: Data Flow Chromatics")
    print("页数: 7页")
    print("尺寸: A4")
    print("="*60)

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    create_pitch_deck()
