/**
 * AI短剧一站式工作平台 - 项目数据类型定义
 */

/** 项目阶段枚举 */
export type ProjectStage = 
  | 'screenwriter'    // 编剧
  | 'storyboard'      // 分镜师
  | 'imageDesigner'   // 图像设计师
  | 'artist'          // 美工
  | 'director';       // 导演

/** 阶段状态枚举 */
export type StageStatus = 'pending' | 'in_progress' | 'completed';

/** 项目元数据 */
export interface ProjectMeta {
  id: string;
  name: string;
  type: string;                    // 剧本类型：都市爱情、霸总复仇等
  totalEpisodes: number;           // 总集数
  targetAudience: 'male' | 'female' | 'general';  // 目标受众
  createdAt: string;
  updatedAt: string;
  previewImageAssetId?: string;    // 预览图资产ID
}

/** 阶段进度 */
export interface StageProgress {
  stage: ProjectStage;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
}

/** 项目数据结构 */
export interface Project {
  meta: ProjectMeta;
  stageProgress: StageProgress[];
  screenwriter?: ScreenwriterData;
  storyboard?: StoryboardData;
  imageDesigner?: ImageDesignerData;
  artist?: ArtistData;
  director?: DirectorData;
  chatHistory: ChatHistoryByStage;
}

/** 各阶段聊天历史 */
export interface ChatHistoryByStage {
  screenwriter: ChatMessage[];
  storyboard: ChatMessage[];
  imageDesigner: ChatMessage[];
  artist: ChatMessage[];
  director: ChatMessage[];
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ===== 编剧阶段数据 =====

/** 编剧阶段数据 */
export interface ScreenwriterData {
  outline: EpisodeOutline[];
  characters: Character[];
  worldSetting: WorldSetting;
  conflicts: ConflictDesign;
  scripts: EpisodeScript[];
  isStale: boolean;
}

/** 集大纲 */
export interface EpisodeOutline {
  episodeNumber: number;
  title: string;
  coreEvent: string;           // 核心事件
  cliffhangerType: string;     // 卡点类型
  cliffhangerDesign: string;   // 卡点设计
  estimatedDuration: number;   // 预计时长(秒)
  isStale: boolean;
}

/** 角色设定 */
export interface Character {
  id: string;
  name: string;
  type: 'protagonist' | 'supporting' | 'antagonist' | 'minor';
  age: number;
  gender: string;
  appearance: string;          // 外貌描述
  personality: string[];       // 性格特点
  goal?: string;               // 核心目标
  weakness?: string;           // 致命弱点
  growthArc?: string;          // 成长弧线
  isStale: boolean;
}

/** 世界观设定 */
export interface WorldSetting {
  era: string;                 // 时代背景
  geography: string;           // 地理环境
  socialStructure: string;     // 社会结构
  specialRules?: string;       // 特殊设定
}

/** 冲突设计 */
export interface ConflictDesign {
  mainConflict: {
    opposition: string;        // 对立方
    conflictType: string;      // 冲突类型
    root: string;              // 根源
    escalationPath: string[];  // 升级路径
  };
  subConflicts: string[];
}

/** 单集剧本 */
export interface EpisodeScript {
  episodeNumber: number;
  title: string;
  duration: number;            // 预计时长(秒)
  coreEvent: string;
  cliffhanger: string;
  scenes: ScriptScene[];
  isStale: boolean;
}

/** 剧本场景 */
export interface ScriptScene {
  id: string;
  sceneNumber: number;
  location: string;            // 场景：内景/外景
  place: string;               // 地点
  time: string;                // 时间：白天/夜晚
  duration: number;            // 场景时长(秒)
  content: string;             // 场景内容（包含镜头、动作、对白）
  isStale: boolean;
}

// ===== 分镜阶段数据 =====

/** 分镜阶段数据 */
export interface StoryboardData {
  episodes: StoryboardEpisode[];
  isStale: boolean;
}

/** 单集分镜 */
export interface StoryboardEpisode {
  episodeNumber: number;
  totalShots: number;
  totalDuration: number;
  rhythmType: 'fast' | 'medium' | 'slow';
  shots: Shot[];
  isStale: boolean;
  sourceEpisodeId?: number;    // 关联的剧本集号
}

/** 景别枚举 - 使用中文 */
export type ShotSize = '远景' | '全景' | '中景' | '近景' | '特写';

/** 机位枚举 - 使用中文 */
export type CameraAngle = '平视' | '俯视' | '仰视' | '侧面' | '背面';

/** 运镜枚举 - 使用中文 */
export type CameraMovement = '固定' | '推进' | '拉远' | '跟随' | '环绕' | '升降';

/** 单个镜头 */
export interface Shot {
  id: string;
  shotNumber: string;          // 镜号：S01-01
  location: string;            // 地点
  content: string;             // 画面内容
  shotSize: ShotSize;          // 景别
  cameraAngle: CameraAngle;    // 机位
  cameraMovement: CameraMovement; // 运镜
  duration: number;            // 时长(秒)，≤10
  dialogue: string;            // 对话，无则'无'
  assignee?: string;           // 负责人（预留）
  notes?: string;              // 备注
  isStale: boolean;
  sourceSceneId?: string;      // 关联的剧本场景ID
}

// ===== 图像设计阶段数据 =====

/** 图像设计阶段数据 */
export interface ImageDesignerData {
  characterPrompts: ReferencePrompt[];
  scenePrompts: ReferencePrompt[];
  keyframePrompts: KeyframePrompt[];
  isStale: boolean;
}

/** 参考图提示词 */
export interface ReferencePrompt {
  id: string;
  code: string;                // R-P01, R-S01
  name: string;                // 角色名/场景名
  prompt: string;              // 提示词
  type: 'character' | 'scene';
  isStale: boolean;
  generatedAssetId?: string;   // 生成的图片资产ID
}

/** 关键帧提示词 */
export interface KeyframePrompt {
  id: string;
  code: string;                // S01-01-1
  shotId: string;              // 关联的镜头ID
  frameIndex: number;          // 帧序号：1, 2, 3
  prompt: string;              // 提示词
  referenceIds: string[];      // 参考图ID列表
  isStale: boolean;
  generatedAssetId?: string;   // 生成的图片资产ID
}

// ===== 美工阶段数据 =====

/** 美工阶段数据 */
export interface ArtistData {
  characterImages: GeneratedImage[];
  sceneImages: GeneratedImage[];
  keyframeImages: GeneratedImage[];
  isStale: boolean;
}

/** 生成的图片 */
export interface GeneratedImage {
  id: string;
  promptId: string;            // 关联的提示词ID
  assetId: string;             // 资产ID
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
  imageUrl?: string;           // 图片URL (data URL 或 云端URL)
  name?: string;               // 图片名称 (角色名/场景名/关键帧编号)
  isStale: boolean;
}

// ===== 导演阶段数据 =====

/** 导演阶段数据 */
export interface DirectorData {
  videos: GeneratedVideo[];
  isStale: boolean;
}

/** 生成的视频 */
export interface GeneratedVideo {
  id: string;
  shotId: string;              // 关联的镜头ID
  shotNumber: string;          // 镜号：S01-01
  keyframeAssetId: string;     // 参考关键帧资产ID
  assetId: string;             // 视频资产ID
  status: 'pending' | 'generating' | 'completed' | 'failed';
  duration: number;            // 视频时长
  videoUrl?: string;           // 生成的视频URL
  prompt?: string;             // 生成使用的提示词
  referenceImages?: string[];  // 参考图片URL列表
  error?: string;
  isStale: boolean;
}

/** 创建新项目的输入参数 */
export interface CreateProjectInput {
  name: string;
  type: string;
  totalEpisodes: number;
  targetAudience: 'male' | 'female' | 'general';
  initialCreativity?: string;  // 一句话创意
}

/** 项目列表项 */
export interface ProjectListItem {
  id: string;
  name: string;
  type: string;
  updatedAt: string;
  previewImageUrl?: string;
  stageProgress: StageProgress[];
}
