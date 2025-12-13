/**
 * tldraw 画布服务
 * 管理画布操作和状态
 */

import type { Editor, TLShapeId } from 'tldraw';
import type { ProjectStage, StageAreaConfig } from '@/types';

/** 阶段区域配置 - 横向排列，每个阶段占 2000px 宽度 */
export const STAGE_AREAS: Record<ProjectStage, StageAreaConfig> = {
  screenwriter: {
    stage: 'screenwriter',
    label: '📝 编剧',
    x: 0,
    y: 0,
    width: 2000,
    color: '#6366f1', // indigo
  },
  storyboard: {
    stage: 'storyboard',
    label: '🎬 分镜',
    x: 2200,
    y: 0,
    width: 2000,
    color: '#8b5cf6', // violet
  },
  imageDesigner: {
    stage: 'imageDesigner',
    label: '🎨 设计',
    x: 4400,
    y: 0,
    width: 2000,
    color: '#ec4899', // pink
  },
  artist: {
    stage: 'artist',
    label: '🖼️ 美工',
    x: 6600,
    y: 0,
    width: 2000,
    color: '#f97316', // orange
  },
  director: {
    stage: 'director',
    label: '🎥 导演',
    x: 8800,
    y: 0,
    width: 2000,
    color: '#22c55e', // green
  },
};

/**
 * 跳转到指定阶段区域
 */
export function navigateToStage(editor: Editor, stage: ProjectStage): void {
  const area = STAGE_AREAS[stage];
  if (!area) return;

  // 计算区域中心点
  const centerX = area.x + area.width / 2;
  const centerY = area.y + 500; // 假设高度 1000

  // 平滑跳转到区域
  editor.zoomToFit({
    animation: { duration: 300 },
  });

  // 设置相机位置
  editor.setCamera({
    x: -centerX + editor.getViewportScreenBounds().width / 2,
    y: -centerY + editor.getViewportScreenBounds().height / 2,
  }, {
    animation: { duration: 300 },
  });
}

/** 存储每个阶段背景框的 ID */
const stageBackgroundIds: Record<ProjectStage, TLShapeId | null> = {
  screenwriter: null,
  storyboard: null,
  imageDesigner: null,
  artist: null,
  director: null,
};

/** 默认背景框高度 */
const DEFAULT_BACKGROUND_HEIGHT = 1200;
/** 最小背景框高度 */
const MIN_BACKGROUND_HEIGHT = 800;
/** 背景框底部留白 */
const BACKGROUND_PADDING_BOTTOM = 100;

/**
 * 添加阶段背景区域
 */
export function addStageBackgrounds(editor: Editor): void {
  const stages = Object.values(STAGE_AREAS);

  for (const stageConfig of stages) {
    // 创建区域背景框
    const shapesBefore = editor.getCurrentPageShapeIds();
    
    editor.createShape({
      type: 'geo',
      x: stageConfig.x,
      y: stageConfig.y - 50,
      isLocked: true,
      props: {
        geo: 'rectangle',
        w: stageConfig.width,
        h: DEFAULT_BACKGROUND_HEIGHT,
        color: 'light-blue',
        fill: 'semi',
        dash: 'dashed',
        size: 's',
      },
    });
    
    // 记录背景框 ID
    const shapesAfter = editor.getCurrentPageShapeIds();
    for (const id of shapesAfter) {
      if (!shapesBefore.has(id)) {
        stageBackgroundIds[stageConfig.stage] = id;
        break;
      }
    }

    // 创建区域标签
    editor.createShape({
      type: 'text',
      x: stageConfig.x + 20,
      y: stageConfig.y - 30,
      isLocked: true,
      props: {
        text: stageConfig.label,
        size: 'l',
        font: 'sans',
        color: 'black',
      },
    });
  }
}

/**
 * 根据内容高度动态调整背景框高度
 */
export function updateStageBackgroundHeight(
  editor: Editor,
  stage: ProjectStage,
  contentHeight: number
): void {
  const backgroundId = stageBackgroundIds[stage];
  if (!backgroundId) return;
  
  const shape = editor.getShape(backgroundId);
  if (!shape) return;
  
  // 计算新高度，确保不小于最小高度
  const newHeight = Math.max(
    MIN_BACKGROUND_HEIGHT,
    contentHeight + BACKGROUND_PADDING_BOTTOM
  );
  
  // 先解锁背景框，更新高度后再锁定
  editor.updateShape({
    id: backgroundId,
    type: 'geo',
    isLocked: false,
  });
  
  editor.updateShape({
    id: backgroundId,
    type: 'geo',
    props: {
      h: newHeight,
    },
  });
  
  // 重新锁定背景框
  editor.updateShape({
    id: backgroundId,
    type: 'geo',
    isLocked: true,
  });
}

/**
 * 获取当前视图所在的阶段
 */
export function getCurrentStageFromView(editor: Editor): ProjectStage {
  const camera = editor.getCamera();
  const viewCenterX = -camera.x + editor.getViewportScreenBounds().width / 2;

  // 根据 X 坐标判断当前阶段
  for (const [stage, area] of Object.entries(STAGE_AREAS)) {
    if (viewCenterX >= area.x && viewCenterX < area.x + area.width + 200) {
      return stage as ProjectStage;
    }
  }

  return 'screenwriter';
}

/**
 * 在指定阶段区域添加形状
 */
export function addShapeToStage(
  editor: Editor,
  stage: ProjectStage,
  shapeType: string,
  props: Record<string, unknown>,
  position?: { x: number; y: number }
): TLShapeId | null {
  const area = STAGE_AREAS[stage];
  
  // 如果没有指定位置，使用区域内的默认位置
  const x = position?.x ?? area.x + 50;
  const y = position?.y ?? area.y + 100;

  // createShape 返回 editor，需要通过其他方式获取 ID
  const shapesBefore = editor.getCurrentPageShapeIds();
  
  editor.createShape({
    type: shapeType,
    x,
    y,
    props,
  });

  const shapesAfter = editor.getCurrentPageShapeIds();
  
  // 找到新创建的形状 ID
  for (const id of shapesAfter) {
    if (!shapesBefore.has(id)) {
      return id;
    }
  }

  return null;
}

/**
 * 获取阶段内的所有形状
 */
export function getShapesInStage(editor: Editor, stage: ProjectStage): TLShapeId[] {
  const area = STAGE_AREAS[stage];
  const allShapes = editor.getCurrentPageShapes();

  return allShapes
    .filter(shape => {
      const bounds = editor.getShapePageBounds(shape.id);
      if (!bounds) return false;
      return bounds.x >= area.x && bounds.x < area.x + area.width;
    })
    .map(shape => shape.id);
}

/**
 * 自动布局阶段内的形状
 */
export function autoLayoutStage(
  editor: Editor,
  stage: ProjectStage,
  options: {
    columns?: number;
    gap?: number;
    startY?: number;
  } = {}
): void {
  const area = STAGE_AREAS[stage];
  const { columns = 3, gap = 20, startY = 100 } = options;

  const shapeIds = getShapesInStage(editor, stage);
  const shapes = shapeIds.map(id => editor.getShape(id)).filter(Boolean);

  shapes.forEach((shape, index) => {
    if (!shape) return;

    const col = index % columns;
    const row = Math.floor(index / columns);

    const cardWidth = (area.width - gap * (columns + 1)) / columns;
    const cardHeight = 200; // 假设卡片高度

    const newX = area.x + gap + col * (cardWidth + gap);
    const newY = area.y + startY + row * (cardHeight + gap);

    editor.updateShape({
      id: shape.id,
      type: shape.type,
      x: newX,
      y: newY,
    });
  });
}

/**
 * 导出画布快照
 */
export function exportCanvasSnapshot(editor: Editor): object {
  return editor.store.getSnapshot();
}

/**
 * 导入画布快照
 */
export function importCanvasSnapshot(editor: Editor, snapshot: object): void {
  editor.store.loadSnapshot(snapshot as Parameters<typeof editor.store.loadSnapshot>[0]);
}

/**
 * 清空画布
 */
export function clearCanvas(editor: Editor): void {
  const shapes = editor.getCurrentPageShapes();
  editor.deleteShapes(shapes.map(s => s.id));
}

/**
 * 获取画布统计信息
 */
export function getCanvasStats(editor: Editor): {
  totalShapes: number;
  shapesByStage: Record<ProjectStage, number>;
} {
  const allShapes = editor.getCurrentPageShapes();
  const shapesByStage: Record<ProjectStage, number> = {
    screenwriter: 0,
    storyboard: 0,
    imageDesigner: 0,
    artist: 0,
    director: 0,
  };

  for (const shape of allShapes) {
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) continue;

    for (const [stage, area] of Object.entries(STAGE_AREAS)) {
      if (bounds.x >= area.x && bounds.x < area.x + area.width) {
        shapesByStage[stage as ProjectStage]++;
        break;
      }
    }
  }

  return {
    totalShapes: allShapes.length,
    shapesByStage,
  };
}

// ===== 数据渲染函数 =====

/**
 * 清除阶段区域内的所有数据形状（保留背景和标签）
 */
export function clearStageData(editor: Editor, stage: ProjectStage): void {
  const area = STAGE_AREAS[stage];
  const allShapes = editor.getCurrentPageShapes();
  
  // 找到阶段区域内的形状，但排除背景 geo 和标签 text
  const dataShapes = allShapes.filter(shape => {
    const bounds = editor.getShapePageBounds(shape.id);
    if (!bounds) return false;
    
    // 检查是否在阶段区域内
    if (bounds.x < area.x || bounds.x >= area.x + area.width) return false;
    
    // 排除背景框（geo 类型，接近区域大小）和标签（text 类型，位置接近顶部）
    if (shape.type === 'geo' && bounds.w > 1500) return false;
    if (shape.type === 'text' && bounds.y < area.y + 20) return false;
    
    return true;
  });
  
  if (dataShapes.length > 0) {
    editor.deleteShapes(dataShapes.map(s => s.id));
  }
}

/**
 * 渲染编剧阶段数据到画布
 * 支持完整剧本格式: { title, genre, characters, episodes }
 */
export function renderScreenwriterData(
  editor: Editor,
  data: {
    title?: string;
    genre?: string;
    totalEpisodes?: number;
    targetAudience?: string;
    characters?: Array<{
      name: string;
      role?: string;
      age?: string | number;
      personality?: string;
      appearance?: string;
    }>;
    episodes?: Array<{
      episodeNumber: number;
      title: string;
      synopsis?: string;
      duration?: number;
      cliffhanger?: string;
      scenes?: Array<{
        sceneNumber: number;
        location: string;
        locationType?: string;
        timeOfDay?: string;
        duration?: number;
        description?: string;
        dialogues?: Array<{
          character: string;
          emotion?: string;
          line: string;
        }>;
        actions?: string[];
      }>;
    }>;
  }
): void {
  if (!data) return;
  
  const area = STAGE_AREAS.screenwriter;
  const cardWidth = 1200;
  const gap = 20;
  let currentY = area.y + 80;
  
  // 清除旧数据
  clearStageData(editor, 'screenwriter');
  
  // 渲染剧本标题
  if (data.title) {
    editor.createShape({
      type: 'text',
      x: area.x + 20,
      y: currentY,
      props: {
        text: `🎬 ${data.title}`,
        size: 'l',
        font: 'sans',
        color: 'black',
      },
    });
    currentY += 50;
    
    // 剧本信息
    const infoText = [
      data.genre ? `题材: ${data.genre}` : '',
      data.totalEpisodes ? `集数: ${data.totalEpisodes}集` : '',
      data.targetAudience ? `受众: ${data.targetAudience}` : '',
    ].filter(Boolean).join(' | ');
    
    if (infoText) {
      editor.createShape({
        type: 'text',
        x: area.x + 20,
        y: currentY,
        props: {
          text: infoText,
          size: 's',
          font: 'sans',
          color: 'grey',
        },
      });
      currentY += 30;
    }
  }
  
  // 渲染角色卡片
  if (data.characters && data.characters.length > 0) {
    editor.createShape({
      type: 'text',
      x: area.x + 20,
      y: currentY,
      props: {
        text: '👥 角色设定',
        size: 'm',
        font: 'sans',
        color: 'black',
      },
    });
    currentY += 35;
    
    let charX = area.x + 50;
    const charCardWidth = 560;
    const charCardHeight = 140;
    
    for (let i = 0; i < data.characters.length; i++) {
      const char = data.characters[i];
      
      if (i > 0 && i % 2 === 0) {
        charX = area.x + 50;
        currentY += charCardHeight + 10;
      }
      
      const roleColor = char.role === 'protagonist' ? 'orange' : 
                        char.role === 'antagonist' ? 'red' : 'yellow';
      
      editor.createShape({
        type: 'geo',
        x: charX,
        y: currentY,
        props: {
          geo: 'rectangle',
          w: charCardWidth,
          h: charCardHeight,
          color: roleColor,
          fill: 'semi',
          dash: 'draw',
          size: 's',
        },
      });
      
      const roleLabel = char.role === 'protagonist' ? '主角' : 
                        char.role === 'antagonist' ? '反派' : '配角';
      const charText = [
        `${char.name} (${roleLabel})`,
        char.age ? `年龄: ${char.age}` : '',
        char.personality ? `性格: ${char.personality}` : '',
      ].filter(Boolean).join('\n');
      
      editor.createShape({
        type: 'text',
        x: charX + 10,
        y: currentY + 10,
        props: {
          text: charText,
          size: 's',
          font: 'sans',
          color: 'black',
        },
      });
      
      charX += charCardWidth + 15;
    }
    
    currentY += charCardHeight + gap;
  }

  // 渲染剧集卡片
  if (data.episodes && data.episodes.length > 0) {
    editor.createShape({
      type: 'text',
      x: area.x + 20,
      y: currentY,
      props: {
        text: '📺 剧集内容',
        size: 'm',
        font: 'sans',
        color: 'black',
      },
    });
    currentY += 40;
    
    for (const episode of data.episodes) {
      // 剧集卡片
      const episodeCardHeight = 160;
      editor.createShape({
        type: 'geo',
        x: area.x + 50,
        y: currentY,
        props: {
          geo: 'rectangle',
          w: cardWidth,
          h: episodeCardHeight,
          color: 'violet',
          fill: 'semi',
          dash: 'draw',
          size: 's',
        },
      });
      
      const episodeText = [
        `第${episode.episodeNumber}集：${episode.title}`,
        episode.synopsis ? `\n📝 状态摘要v1.0: ${episode.synopsis}` : '',
        episode.duration ? `\n⏱ 时长: ${episode.duration}秒` : '',
        episode.cliffhanger ? `\n🎯 卡点: ${episode.cliffhanger}` : '',
      ].filter(Boolean).join('');
      
      editor.createShape({
        type: 'text',
        x: area.x + 60,
        y: currentY + 10,
        props: {
          text: episodeText,
          size: 's',
          font: 'sans',
          color: 'black',
        },
      });
      
      currentY += episodeCardHeight + gap;
      
      // 渲染场景
      if (episode.scenes && episode.scenes.length > 0) {
        for (const scene of episode.scenes) {
          const sceneCardHeight = 160;
          editor.createShape({
            type: 'geo',
            x: area.x + 80,
            y: currentY,
            props: {
              geo: 'rectangle',
              w: cardWidth - 40,
              h: sceneCardHeight,
              color: 'light-blue',
              fill: 'semi',
              dash: 'dotted',
              size: 's',
            },
          });
          
          // 场景标题
          const sceneHeader = `场景${scene.sceneNumber}: ${scene.locationType || ''} ${scene.location} - ${scene.timeOfDay || ''}`;
          const sceneDesc = scene.description || '';
          
          // 对白摘要
          let dialogueSummary = '';
          if (scene.dialogues && scene.dialogues.length > 0) {
            const firstDialogue = scene.dialogues[0];
            dialogueSummary = `💬 ${firstDialogue.character}: "${firstDialogue.line}"`;
          }
          
          const sceneText = [
            sceneHeader,
            scene.duration ? `⏱ ${scene.duration}秒` : '',
            sceneDesc,
            dialogueSummary,
          ].filter(Boolean).join('\n');
          
          editor.createShape({
            type: 'text',
            x: area.x + 90,
            y: currentY + 8,
            props: {
              text: sceneText,
              size: 's',
              font: 'sans',
              color: 'grey',
            },
          });
          
          currentY += sceneCardHeight + 10;
        }
      }
      
      currentY += gap;
    }
  }
  
  // 根据内容高度动态调整背景框高度
  const contentHeight = currentY - area.y + 50;
  updateStageBackgroundHeight(editor, 'screenwriter', contentHeight);
  
  console.log('编剧数据已渲染到画布，内容高度:', contentHeight);
}

/**
 * 渲染分镜阶段数据到画布
 * 支持 AI 返回的分镜数据格式
 */
export function renderStoryboardData(
  editor: Editor,
  data: {
    episodeNumber?: number;
    totalDuration?: number;
    totalShots?: number;
    rhythmType?: string;
    shots?: Array<{
      shotId: string;
      location: string;
      description: string;
      shotSize: string;
      cameraAngle: string;
      cameraMovement: string;
      duration: number;
      dialogue?: string;
      character?: string;
      notes?: string;
    }>;
    keyframeCount?: number;
    riskAssessment?: Array<{
      shotId: string;
      risk: string;
      planB: string;
    }>;
  }
): void {
  if (!data || !data.shots || data.shots.length === 0) return;

  const area = STAGE_AREAS.storyboard;
  const gap = 15;
  let currentY = area.y + 80;

  // 清除旧数据
  clearStageData(editor, 'storyboard');

  // === 渲染分镜表标题 ===
  const episodeNum = data.episodeNumber || 1;
  const totalShots = data.totalShots || data.shots.length;
  const totalDuration = data.totalDuration || data.shots.reduce((sum, s) => sum + (s.duration || 0), 0);
  const rhythmType = data.rhythmType || '中节奏';

  // 标题背景框
  editor.createShape({
    type: 'geo',
    x: area.x + 30,
    y: currentY,
    props: {
      geo: 'rectangle',
      w: 1800,
      h: 60,
      color: 'violet',
      fill: 'semi',
      dash: 'draw',
      size: 's',
    },
  });

  // 标题文本
  editor.createShape({
    type: 'text',
    x: area.x + 50,
    y: currentY + 15,
    props: {
      text: `🎬 第${episodeNum}集分镜表  |  总镜头: ${totalShots}  |  总时长: ${totalDuration}s  |  节奏: ${rhythmType}`,
      size: 'm',
      font: 'sans',
      color: 'black',
    },
  });

  currentY += 80;

  // === 表格配置 ===
  // 列宽：镜号(0), 地点(1), 画面内容(2), 景别(3), 机位(4), 运镜(5), 时长(6), 对话(7), 负责人(8), 备注(9)
  const colWidths = [100, 180, 500, 80, 80, 80, 60, 450, 120, 280];
  const headers = ['镜号', '地点', '画面内容', '景别', '机位', '运镜', '时长', '对话', '负责人', '备注'];
  // 指定哪些列允许换行
  const wrapCols = [1, 2, 7, 8, 9]; // 地点、画面内容、对话、负责人、备注
  const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const baseRowHeight = 80; // 基础行高提升到3倍
  const lineHeight = 22; // 换行时每行高度
  const headerHeight = 50;
  const cellPadding = 15; // 增加单元格内边距
  const tableX = area.x + 30;
  const charWidth = 14; // 稍微增大字符宽度估算

  // 文本换行工具函数
  // colIndex: 列索引，用于特殊列的固定字数限制
  const wrapText = (text: string, maxWidth: number, allowWrap: boolean, colIndex?: number): string[] => {
    if (!text) return [''];
    
    // 不允许换行的列，直接返回原文本
    if (!allowWrap) {
      return [text];
    }
    
    // 特定列固定每行字数
    let maxChars: number;
    if (colIndex === 1) {
      // 地点列: 每行7个字
      maxChars = 7;
    } else if (colIndex === 2) {
      // 画面内容列: 每行25个字
      maxChars = 25;
    } else if (colIndex === 7) {
      // 对话列: 每行20个字
      maxChars = 20;
    } else if (colIndex === 8) {
      // 负责人列: 每行4个字
      maxChars = 4;
    } else if (colIndex === 9) {
      // 备注列: 每行10个字
      maxChars = 10;
    } else {
      maxChars = Math.floor((maxWidth - cellPadding * 2) / charWidth);
    }
    
    if (maxChars <= 0) return [text];
    
    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        break;
      }
      lines.push(remaining.substring(0, maxChars));
      remaining = remaining.substring(maxChars);
    }
    return lines;
  };

  // 预先计算每行的高度
  const rowHeights: number[] = [];
  const rowCellLines: string[][][] = [];
  
  for (const shot of data.shots) {
    const cellTexts = [
      shot.shotId || '',
      shot.location || '',
      shot.description || '',
      shot.shotSize || '',
      shot.cameraAngle || '',
      shot.cameraMovement || '',
      `${shot.duration || 0}s`,
      shot.dialogue || '无',
      shot.character || '',
      shot.notes || '',
    ];
    
    const cellLines = cellTexts.map((text, i) => 
      wrapText(text, colWidths[i], wrapCols.includes(i), i)
    );
    // 只计算允许换行列的最大行数
    const maxLines = Math.max(
      ...cellLines.filter((_, i) => wrapCols.includes(i)).map(lines => lines.length),
      1
    );
    const rowHeight = baseRowHeight + (maxLines - 1) * lineHeight;
    
    rowHeights.push(rowHeight);
    rowCellLines.push(cellLines);
  }
  
  const totalTableHeight = headerHeight + rowHeights.reduce((sum, h) => sum + h, 0);

  // === 绘制表格外框 ===
  editor.createShape({
    type: 'geo',
    x: tableX,
    y: currentY,
    props: {
      geo: 'rectangle',
      w: tableWidth,
      h: totalTableHeight,
      color: 'violet',
      fill: 'none',
      dash: 'draw',
      size: 's',
    },
  });

  // === 渲染表头背景 ===
  editor.createShape({
    type: 'geo',
    x: tableX,
    y: currentY,
    props: {
      geo: 'rectangle',
      w: tableWidth,
      h: headerHeight,
      color: 'violet',
      fill: 'solid',
      dash: 'draw',
      size: 's',
    },
  });

  // === 绘制垂直分隔线 ===
  let lineX = tableX;
  for (let i = 0; i <= colWidths.length; i++) {
    editor.createShape({
      type: 'geo',
      x: lineX,
      y: currentY,
      props: {
        geo: 'rectangle',
        w: 1,
        h: totalTableHeight,
        color: 'violet',
        fill: 'solid',
        dash: 'draw',
        size: 's',
      },
    });
    if (i < colWidths.length) {
      lineX += colWidths[i];
    }
  }

  // === 渲染表头文字 ===
  let headerX = tableX + cellPadding;
  for (let i = 0; i < headers.length; i++) {
    editor.createShape({
      type: 'text',
      x: headerX,
      y: currentY + 15,
      props: {
        text: headers[i],
        size: 's',
        font: 'sans',
        color: 'white',
      },
    });
    headerX += colWidths[i];
  }

  currentY += headerHeight;

  // === 渲染每个镜头行（动态行高 + 自动换行） ===
  for (let rowIdx = 0; rowIdx < data.shots.length; rowIdx++) {
    const isEvenRow = rowIdx % 2 === 0;
    const rowHeight = rowHeights[rowIdx];
    const cellLines = rowCellLines[rowIdx];

    // 行背景
    editor.createShape({
      type: 'geo',
      x: tableX,
      y: currentY,
      props: {
        geo: 'rectangle',
        w: tableWidth,
        h: rowHeight,
        color: isEvenRow ? 'light-blue' : 'white',
        fill: 'semi',
        dash: 'draw',
        size: 's',
      },
    });

    // 绘制行分隔线
    editor.createShape({
      type: 'geo',
      x: tableX,
      y: currentY + rowHeight - 1,
      props: {
        geo: 'rectangle',
        w: tableWidth,
        h: 1,
        color: 'light-violet',
        fill: 'solid',
        dash: 'draw',
        size: 's',
      },
    });

    // 渲染每列内容（支持多行）
    let cellX = tableX + cellPadding;
    for (let colIdx = 0; colIdx < cellLines.length; colIdx++) {
      const lines = cellLines[colIdx];
      const text = lines.join('\n');
      
      // 计算文字垂直居中位置
      const textHeight = lines.length * lineHeight;
      const textY = currentY + (rowHeight - textHeight) / 2;
      
      editor.createShape({
        type: 'text',
        x: cellX,
        y: textY,
        props: {
          text: text,
          size: 's',
          font: 'sans',
          color: colIdx === 0 ? 'violet' : 'black',
        },
      });
      cellX += colWidths[colIdx];
    }

    currentY += rowHeight;
  }

  currentY += gap * 2;

  // === 渲染关键帧统计 ===
  if (data.keyframeCount) {
    editor.createShape({
      type: 'geo',
      x: tableX,
      y: currentY,
      props: {
        geo: 'rectangle',
        w: 350,
        h: 50,
        color: 'orange',
        fill: 'semi',
        dash: 'draw',
        size: 's',
      },
    });

    editor.createShape({
      type: 'text',
      x: tableX + 20,
      y: currentY + 12,
      props: {
        text: `🖼️ 关键帧数量: ${data.keyframeCount} 张`,
        size: 's',
        font: 'sans',
        color: 'black',
      },
    });

    currentY += 70;
  }

  // === 渲染风险评估 ===
  if (data.riskAssessment && data.riskAssessment.length > 0) {
    editor.createShape({
      type: 'text',
      x: tableX,
      y: currentY,
      props: {
        text: '⚠️ 风险评估',
        size: 'm',
        font: 'sans',
        color: 'orange',
      },
    });

    currentY += 35;

    for (const risk of data.riskAssessment) {
      editor.createShape({
        type: 'geo',
        x: tableX,
        y: currentY,
        props: {
          geo: 'rectangle',
          w: 600,
          h: 70,
          color: 'yellow',
          fill: 'semi',
          dash: 'dotted',
          size: 's',
        },
      });

      editor.createShape({
        type: 'text',
        x: tableX + 15,
        y: currentY + 10,
        props: {
          text: `镜头 ${risk.shotId}: ${risk.risk}\nB方案: ${risk.planB}`,
          size: 's',
          font: 'sans',
          color: 'black',
        },
      });

      currentY += 80;
    }
  }

  // 根据内容高度动态调整背景框高度
  const contentHeight = currentY - area.y + 50;
  updateStageBackgroundHeight(editor, 'storyboard', contentHeight);
  
  console.log('分镜数据已渲染到画布，内容高度:', contentHeight);
}

/**
 * 渲染图像设计阶段数据到画布
 * 期望数据结构：
 * {
 *   referenceImages: Array<{ refId: string; type: 'character'|'scene'; name: string; prompt: string; description?: string }>,
 *   keyframes: Array<{ shotId: string; frameNumber: number; prompt: string; referenceIds?: string[]; characters?: string[]; scene?: string; description?: string }>,
 *   summary?: { totalCharacters?: number; totalScenes?: number; totalKeyframes?: number }
 * }
 */
export function renderImageDesignerData(
  editor: Editor,
  data: {
    referenceImages?: Array<{ refId: string; type: 'character'|'scene'; name: string; prompt: string; description?: string }>
    keyframes?: Array<{ shotId: string; frameNumber: number; prompt: string; referenceIds?: string[]; characters?: string[]; scene?: string; description?: string }>
    summary?: { totalCharacters?: number; totalScenes?: number; totalKeyframes?: number }
  }
): void {
  const area = STAGE_AREAS.imageDesigner;
  const gap = 14;
  let currentY = area.y + 80;

  // 清除旧数据
  clearStageData(editor, 'imageDesigner');

  // 标题
  editor.createShape({
    type: 'text',
    x: area.x + 20,
    y: currentY,
    props: { text: '🎨 图像设计 - 参考图与关键帧', size: 'm', font: 'sans', color: 'black' }
  });
  currentY += 50;

  // 分离人物和场景参考图
  const characterRefs = data?.referenceImages?.filter(r => r.type === 'character') || [];
  const sceneRefs = data?.referenceImages?.filter(r => r.type === 'scene') || [];

  const cardH = 135;   // 卡片高度（90 * 1.5 = 135）

  // 文本换行工具函数（50字换行）
  const wrapPrompt = (text: string): string => {
    if (!text) return '';
    const maxChars = 50;
    if (text.length <= maxChars) return text;
    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      lines.push(remaining.substring(0, maxChars));
      remaining = remaining.substring(maxChars);
    }
    return lines.join('\n');
  };

  // ========== 人物参考图区块 ==========
  if (characterRefs.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'light-red', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '👤 人物参考图', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 45;

    // 人物卡片列表（2列布局）
    const col = 2;
    const colCardW = (area.width - 60 - gap) / col;
    let colX = area.x + 30;
    let rowY = currentY;

    characterRefs.forEach((ref, idx) => {
      // 卡片背景
      editor.createShape({
        type: 'geo', x: colX, y: rowY,
        props: { geo: 'rectangle', w: colCardW, h: cardH, color: 'light-red', fill: 'semi', dash: 'draw', size: 's' }
      });
      // 标题行
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + 8,
        props: { text: `${ref.refId} · ${ref.name}`, size: 's', font: 'sans', color: 'red' }
      });
      // 提示词（50字换行）
      const promptText = wrapPrompt(ref.prompt);
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + 32,
        props: { text: promptText, size: 's', font: 'mono', color: 'grey' }
      });

      // 布局推进
      if ((idx + 1) % col === 0) {
        colX = area.x + 30;
        rowY += cardH + gap;
      } else {
        colX += colCardW + gap;
      }
    });

    // 更新 currentY
    currentY = rowY + (characterRefs.length % col === 0 ? 0 : cardH) + gap + 20;
  }

  // ========== 场景参考图区块 ==========
  if (sceneRefs.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'light-blue', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '🏙️ 场景参考图', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 45;

    // 场景卡片列表（2列布局）
    const col = 2;
    const colCardW = (area.width - 60 - gap) / col;
    let colX = area.x + 30;
    let rowY = currentY;

    sceneRefs.forEach((ref, idx) => {
      // 卡片背景
      editor.createShape({
        type: 'geo', x: colX, y: rowY,
        props: { geo: 'rectangle', w: colCardW, h: cardH, color: 'light-blue', fill: 'semi', dash: 'draw', size: 's' }
      });
      // 标题行
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + 8,
        props: { text: `${ref.refId} · ${ref.name}`, size: 's', font: 'sans', color: 'blue' }
      });
      // 提示词（50字换行）
      const promptText = wrapPrompt(ref.prompt);
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + 32,
        props: { text: promptText, size: 's', font: 'mono', color: 'grey' }
      });

      // 布局推进
      if ((idx + 1) % col === 0) {
        colX = area.x + 30;
        rowY += cardH + gap;
      } else {
        colX += colCardW + gap;
      }
    });

    // 更新 currentY
    currentY = rowY + (sceneRefs.length % col === 0 ? 0 : cardH) + gap + 20;
  }

  // ========== 关键帧提示词表格 ==========
  if (data?.keyframes && data.keyframes.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'violet', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '🖼️ 关键帧提示词', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 45;

    // 列：镜号、帧序、提示词、参考图、人物、场景、描述
    // 描述列宽放大2倍（240 -> 480）
    const colWidths = [100, 50, 700, 160, 180, 180, 480];
    const headers = ['镜号', '帧', '提示词', '参考图', '人物', '场景', '描述'];
    const headerH = 36;
    const tableX = area.x + 30;
    const tableW = colWidths.reduce((a, b) => a + b, 0);

    // 文本换行工具函数
    const wrapText = (text: string, maxCharsPerLine: number): string => {
      if (!text || text.length <= maxCharsPerLine) return text;
      const lines: string[] = [];
      let remaining = text;
      while (remaining.length > 0) {
        lines.push(remaining.substring(0, maxCharsPerLine));
        remaining = remaining.substring(maxCharsPerLine);
      }
      return lines.join('\n');
    };

    // 表头背景
    editor.createShape({ type: 'geo', x: tableX, y: currentY, props: { geo: 'rectangle', w: tableW, h: headerH, color: 'violet', fill: 'solid', dash: 'draw', size: 's' } });
    // 表头文字
    let hx = tableX + 8;
    headers.forEach((h, i) => {
      editor.createShape({ type: 'text', x: hx, y: currentY + 8, props: { text: h, size: 's', font: 'sans', color: 'white' } });
      hx += colWidths[i];
    });
    currentY += headerH;

    const lineHeight = 20;
    const pad = 12;
    const baseRowH = 160;  // 基础行高放大4倍（40 -> 160）

    data.keyframes.forEach((kf, idx) => {
      // 提示词按 35 字换行
      const promptText = wrapText(kf.prompt || '', 35);
      const promptLines = promptText.split('\n').length;
      
      // 场景按 7 字换行
      const sceneText = wrapText(kf.scene || '', 7);
      const sceneLines = sceneText.split('\n').length;
      
      // 描述按 20 字换行
      const descText = wrapText(kf.description || '', 20);
      const descLines = descText.split('\n').length;
      
      // 行高取所有字段中较多行数的一个，但不小于基础行高
      const maxLines = Math.max(promptLines, sceneLines, descLines);
      const rowH = Math.max(baseRowH, maxLines * lineHeight + pad * 2);

      // 行背景
      editor.createShape({ type: 'geo', x: tableX, y: currentY, props: { geo: 'rectangle', w: tableW, h: rowH, color: idx % 2 === 0 ? 'white' : 'light-violet', fill: 'semi', dash: 'draw', size: 's' } });

      // 单元格文本
      let cx = tableX + 8;
      const cells: string[] = [
        kf.shotId || '',
        String(kf.frameNumber ?? ''),
        promptText,  // 已换行的提示词
        (kf.referenceIds || []).join('\n'),  // 每个参考图单独一行
        (kf.characters || []).join('、'),
        sceneText,  // 已换行的场景
        descText  // 已换行的描述
      ];
      cells.forEach((text, i) => {
        editor.createShape({ type: 'text', x: cx, y: currentY + pad, props: { text, size: 's', font: 'mono', color: i === 0 ? 'violet' : 'black' } });
        cx += colWidths[i];
      });

      currentY += rowH;
    });
  }

  // ========== 统计摘要 ==========
  if (data?.summary) {
    currentY += 20;
    editor.createShape({ type: 'geo', x: area.x + 30, y: currentY, props: { geo: 'rectangle', w: 500, h: 44, color: 'orange', fill: 'semi', dash: 'draw', size: 's' } });
    editor.createShape({ type: 'text', x: area.x + 45, y: currentY + 12, props: { text: `📊 统计：人物 ${data.summary.totalCharacters ?? 0} 个  |  场景 ${data.summary.totalScenes ?? 0} 个  |  关键帧 ${data.summary.totalKeyframes ?? 0} 张`, size: 's', font: 'sans', color: 'black' } });
    currentY += 60;
  }

  // 根据内容高度调整背景
  const contentHeight = currentY - area.y + 50;
  updateStageBackgroundHeight(editor, 'imageDesigner', contentHeight);
}

/**
 * 根据阶段和数据渲染内容到画布
 */
export function renderStageData(
  editor: Editor,
  stage: ProjectStage,
  data: unknown
): void {
  switch (stage) {
    case 'screenwriter':
      renderScreenwriterData(editor, data as Parameters<typeof renderScreenwriterData>[1]);
      break;
    case 'storyboard': {
      // 分镜数据可能是 { episodes: [...] } 格式或单集格式
      const sbData = data as { episodes?: Array<unknown> } & Parameters<typeof renderStoryboardData>[1];
      if (sbData.episodes && sbData.episodes.length > 0) {
        // 新格式：渲染第一集的分镜数据
        const firstEpisode = sbData.episodes[0] as Parameters<typeof renderStoryboardData>[1];
        renderStoryboardData(editor, firstEpisode);
      } else if (sbData.shots) {
        // 旧格式：直接渲染
        renderStoryboardData(editor, sbData);
      }
      break;
    }
    case 'imageDesigner':
      renderImageDesignerData(editor, data as Parameters<typeof renderImageDesignerData>[1]);
      break;
    // 其他阶段的渲染可以后续添加
    case 'artist':
      renderArtistData(editor, data as Parameters<typeof renderArtistData>[1]);
      break;
    case 'director':
      console.log(`阶段 ${stage} 的数据渲染暂未实现`);
      break;
  }
}

/**
 * 渲染美工阶段数据到画布
 * 显示角色参考图、场景参考图、关键帧图片网格
 */
export function renderArtistData(
  editor: Editor,
  data: {
    characterImages?: Array<{
      id: string;
      promptId: string;
      assetId: string;
      status: 'pending' | 'generating' | 'completed' | 'failed';
      error?: string;
      imageUrl?: string;
      name?: string;
    }>;
    sceneImages?: Array<{
      id: string;
      promptId: string;
      assetId: string;
      status: 'pending' | 'generating' | 'completed' | 'failed';
      error?: string;
      imageUrl?: string;
      name?: string;
    }>;
    keyframeImages?: Array<{
      id: string;
      promptId: string;
      assetId: string;
      status: 'pending' | 'generating' | 'completed' | 'failed';
      error?: string;
      imageUrl?: string;
      code?: string;
    }>;
    // 统计信息
    stats?: {
      totalCharacters?: number;
      completedCharacters?: number;
      totalScenes?: number;
      completedScenes?: number;
      totalKeyframes?: number;
      completedKeyframes?: number;
    };
  }
): void {
  const area = STAGE_AREAS.artist;
  const gap = 15;
  let currentY = area.y + 80;

  // 清除旧数据
  clearStageData(editor, 'artist');

  // ===== 标题 =====
  editor.createShape({
    type: 'text',
    x: area.x + 20,
    y: currentY,
    props: { text: '🖼️ 美工阶段 - 图片生成', size: 'm', font: 'sans', color: 'black' }
  });
  currentY += 50;

  // ===== 统计信息 =====
  if (data?.stats) {
    const { totalCharacters = 0, completedCharacters = 0, totalScenes = 0, completedScenes = 0, totalKeyframes = 0, completedKeyframes = 0 } = data.stats;
    const totalImages = totalCharacters + totalScenes + totalKeyframes;
    const completedImages = completedCharacters + completedScenes + completedKeyframes;
    
    // 进度条背景
    editor.createShape({
      type: 'geo',
      x: area.x + 30,
      y: currentY,
      props: { geo: 'rectangle', w: 600, h: 40, color: 'grey', fill: 'semi', dash: 'draw', size: 's' }
    });
    
    // 进度条填充
    const progressWidth = totalImages > 0 ? (completedImages / totalImages) * 580 : 0;
    if (progressWidth > 0) {
      editor.createShape({
        type: 'geo',
        x: area.x + 40,
        y: currentY + 10,
        props: { geo: 'rectangle', w: progressWidth, h: 20, color: 'green', fill: 'solid', dash: 'draw', size: 's' }
      });
    }
    
    // 进度文本
    editor.createShape({
      type: 'text',
      x: area.x + 650,
      y: currentY + 8,
      props: { text: `${completedImages}/${totalImages} 已完成`, size: 's', font: 'sans', color: 'black' }
    });
    
    currentY += 60;
  }

  // 图片卡片配置
  const cardW = 200;
  const cardH = 240;
  const cols = 4;

  // 状态图标
  const statusIcons: Record<string, string> = {
    pending: '⏳',
    generating: '🔄',
    completed: '✅',
    failed: '❌',
  };

  // 状态颜色
  const statusColors: Record<string, string> = {
    pending: 'grey',
    generating: 'yellow',
    completed: 'green',
    failed: 'red',
  };

  // ===== 角色参考图区块 =====
  if (data?.characterImages && data.characterImages.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'light-red', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '👤 角色参考图', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 50;

    // 角色图片网格
    let colX = area.x + 30;
    let rowY = currentY;

    data.characterImages.forEach((img, idx) => {
      // 卡片背景
      editor.createShape({
        type: 'geo', x: colX, y: rowY,
        props: { geo: 'rectangle', w: cardW, h: cardH, color: statusColors[img.status] || 'grey', fill: 'semi', dash: 'draw', size: 's' }
      });

      // 图片预览区域 (占位或实际图片)
      if (img.status === 'completed' && img.imageUrl) {
        // 创建图片资源和形状 (tldraw asset ID 必须以 "asset:" 开头)
        const assetId = `asset:${img.id}` as Parameters<typeof editor.createAssets>[0][0]['id'];
        editor.createAssets([{
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: img.name || 'character',
            src: img.imageUrl,
            w: cardW - 20,
            h: cardH - 60,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        }]);
        editor.createShape({
          type: 'image',
          x: colX + 10,
          y: rowY + 10,
          props: { assetId, w: cardW - 20, h: cardH - 60 },
        });
      } else {
        // 占位符
        editor.createShape({
          type: 'geo', x: colX + 10, y: rowY + 10,
          props: { geo: 'rectangle', w: cardW - 20, h: cardH - 60, color: 'light-blue', fill: 'pattern', dash: 'dotted', size: 's' }
        });
        editor.createShape({
          type: 'text', x: colX + 60, y: rowY + 80,
          props: { text: statusIcons[img.status] || '⏳', size: 'l', font: 'sans', color: 'grey' }
        });
      }

      // 名称和状态
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + cardH - 40,
        props: { text: `${statusIcons[img.status]} ${img.name || `角色${idx + 1}`}`, size: 's', font: 'sans', color: 'black' }
      });

      // 错误信息
      if (img.status === 'failed' && img.error) {
        editor.createShape({
          type: 'text', x: colX + 10, y: rowY + cardH - 20,
          props: { text: img.error.substring(0, 15), size: 's', font: 'sans', color: 'red' }
        });
      }

      // 布局推进
      if ((idx + 1) % cols === 0) {
        colX = area.x + 30;
        rowY += cardH + gap;
      } else {
        colX += cardW + gap;
      }
    });

    currentY = rowY + (data.characterImages.length % cols === 0 ? 0 : cardH) + gap + 30;
  }

  // ===== 场景参考图区块 =====
  if (data?.sceneImages && data.sceneImages.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'light-blue', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '🏙️ 场景参考图', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 50;

    // 场景图片网格
    let colX = area.x + 30;
    let rowY = currentY;

    data.sceneImages.forEach((img, idx) => {
      // 卡片背景
      editor.createShape({
        type: 'geo', x: colX, y: rowY,
        props: { geo: 'rectangle', w: cardW, h: cardH, color: statusColors[img.status] || 'grey', fill: 'semi', dash: 'draw', size: 's' }
      });

      // 图片预览区域
      if (img.status === 'completed' && img.imageUrl) {
        const assetId = `asset:${img.id}` as Parameters<typeof editor.createAssets>[0][0]['id'];
        editor.createAssets([{
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: img.name || 'scene',
            src: img.imageUrl,
            w: cardW - 20,
            h: cardH - 60,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        }]);
        editor.createShape({
          type: 'image',
          x: colX + 10,
          y: rowY + 10,
          props: { assetId, w: cardW - 20, h: cardH - 60 },
        });
      } else {
        editor.createShape({
          type: 'geo', x: colX + 10, y: rowY + 10,
          props: { geo: 'rectangle', w: cardW - 20, h: cardH - 60, color: 'light-green', fill: 'pattern', dash: 'dotted', size: 's' }
        });
        editor.createShape({
          type: 'text', x: colX + 60, y: rowY + 80,
          props: { text: statusIcons[img.status] || '⏳', size: 'l', font: 'sans', color: 'grey' }
        });
      }

      // 名称和状态
      editor.createShape({
        type: 'text', x: colX + 10, y: rowY + cardH - 40,
        props: { text: `${statusIcons[img.status]} ${img.name || `场景${idx + 1}`}`, size: 's', font: 'sans', color: 'black' }
      });

      // 布局推进
      if ((idx + 1) % cols === 0) {
        colX = area.x + 30;
        rowY += cardH + gap;
      } else {
        colX += cardW + gap;
      }
    });

    currentY = rowY + (data.sceneImages.length % cols === 0 ? 0 : cardH) + gap + 30;
  }

  // ===== 关键帧图片区块 =====
  if (data?.keyframeImages && data.keyframeImages.length > 0) {
    // 区块标题
    editor.createShape({
      type: 'geo', x: area.x + 20, y: currentY,
      props: { geo: 'rectangle', w: 200, h: 32, color: 'violet', fill: 'solid', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 30, y: currentY + 6,
      props: { text: '🎬 关键帧图片', size: 's', font: 'sans', color: 'white' }
    });
    currentY += 50;

    // 关键帧图片网格 (6列更紧凑)
    const kfCols = 6;
    const kfCardW = 160;
    const kfCardH = 200;
    let colX = area.x + 30;
    let rowY = currentY;

    data.keyframeImages.forEach((img, idx) => {
      // 卡片背景
      editor.createShape({
        type: 'geo', x: colX, y: rowY,
        props: { geo: 'rectangle', w: kfCardW, h: kfCardH, color: statusColors[img.status] || 'grey', fill: 'semi', dash: 'draw', size: 's' }
      });

      // 图片预览区域
      if (img.status === 'completed' && img.imageUrl) {
        const assetId = `asset:${img.id}` as Parameters<typeof editor.createAssets>[0][0]['id'];
        editor.createAssets([{
          id: assetId,
          type: 'image',
          typeName: 'asset',
          props: {
            name: img.code || 'keyframe',
            src: img.imageUrl,
            w: kfCardW - 16,
            h: kfCardH - 50,
            mimeType: 'image/png',
            isAnimated: false,
          },
          meta: {},
        }]);
        editor.createShape({
          type: 'image',
          x: colX + 8,
          y: rowY + 8,
          props: { assetId, w: kfCardW - 16, h: kfCardH - 50 },
        });
      } else {
        editor.createShape({
          type: 'geo', x: colX + 8, y: rowY + 8,
          props: { geo: 'rectangle', w: kfCardW - 16, h: kfCardH - 50, color: 'light-violet', fill: 'pattern', dash: 'dotted', size: 's' }
        });
        editor.createShape({
          type: 'text', x: colX + 50, y: rowY + 60,
          props: { text: statusIcons[img.status] || '⏳', size: 'l', font: 'sans', color: 'grey' }
        });
      }

      // 编号和状态
      editor.createShape({
        type: 'text', x: colX + 8, y: rowY + kfCardH - 35,
        props: { text: `${statusIcons[img.status]} ${img.code || `KF${idx + 1}`}`, size: 's', font: 'mono', color: 'violet' }
      });

      // 布局推进
      if ((idx + 1) % kfCols === 0) {
        colX = area.x + 30;
        rowY += kfCardH + gap;
      } else {
        colX += kfCardW + gap;
      }
    });

    currentY = rowY + (data.keyframeImages.length % kfCols === 0 ? 0 : kfCardH) + gap + 30;
  }

  // 如果没有任何图片数据，显示提示
  if (!data?.characterImages?.length && !data?.sceneImages?.length && !data?.keyframeImages?.length) {
    editor.createShape({
      type: 'geo', x: area.x + 50, y: currentY,
      props: { geo: 'rectangle', w: 400, h: 100, color: 'yellow', fill: 'semi', dash: 'draw', size: 's' }
    });
    editor.createShape({
      type: 'text', x: area.x + 70, y: currentY + 30,
      props: { text: '📝 请先完成图像设计阶段\n然后点击「开始批量生成」', size: 's', font: 'sans', color: 'black' }
    });
    currentY += 120;
  }

  // 根据内容高度调整背景
  const contentHeight = currentY - area.y + 50;
  updateStageBackgroundHeight(editor, 'artist', contentHeight);
}
