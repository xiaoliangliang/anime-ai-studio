/**
 * 画布相关类型定义
 */

import type { TLShapeId } from 'tldraw'
import type { ProjectStage } from './project'

/** 阶段区域配置 */
export interface StageAreaConfig {
  stage: ProjectStage;
  label: string;
  x: number;                   // 区域起始 X 坐标
  y: number;                   // 区域起始 Y 坐标
  width: number;               // 区域宽度
  color: string;               // 区域主题色
}

/** 画布快照 */
export interface CanvasSnapshot {
  id: string;                  // 快照ID
  projectId: string;           // 项目ID
  stage: ProjectStage;         // 阶段
  snapshot: object;            // tldraw JSON 快照对象
  updatedAt: string;
}

/** 自定义形状类型 */
export type CustomShapeType = 
  | 'script'                   // 剧本卡片
  | 'shot'                     // 分镜卡片
  | 'prompt'                   // 提示词卡片
  | 'video';                   // 视频卡片

/** 剧本形状属性 */
export interface ScriptShapeProps {
  episodeNumber: number;
  title: string;
  coreEvent: string;
  cliffhanger: string;
  duration: number;
  isStale: boolean;
  isExpanded: boolean;
}

/** 分镜形状属性 */
export interface ShotShapeProps {
  shotNumber: string;
  location: string;
  content: string;
  shotSize: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  dialogue: string;
  isStale: boolean;
}

/** 提示词形状属性 */
export interface PromptShapeProps {
  code: string;
  name: string;
  prompt: string;
  type: 'character' | 'scene' | 'keyframe';
  isStale: boolean;
  imageAssetId?: string;
}

/** 视频形状属性 */
export interface VideoShapeProps {
  shotId: string;
  assetId: string;
  duration: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  isStale: boolean;
}

/** 画布操作 */
export interface CanvasOperation {
  type: 'add' | 'update' | 'delete' | 'connect';
  shapeId?: TLShapeId;
  shapeType?: CustomShapeType;
  props?: Record<string, unknown>;
  position?: { x: number; y: number };
  targetShapeId?: TLShapeId;   // 用于连接操作
}

/** 阶段锚点 */
export interface StageAnchor {
  stage: ProjectStage;
  x: number;
  y: number;
}

/** 画布状态 */
export interface CanvasState {
  currentStage: ProjectStage;
  zoom: number;
  scrollPosition: { x: number; y: number };
  selectedShapeIds: TLShapeId[];
}
