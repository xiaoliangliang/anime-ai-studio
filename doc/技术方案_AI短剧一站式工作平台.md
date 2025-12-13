# AI短剧一站式工作平台 - 技术方案

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.1 |
| 创建日期 | 2025-01 |
| 更新日期 | 2025-12-12 |
| 状态 | 口径对齐更新（MVP） |
| 基于Demo | budemo项目 |
| API提供商 | Pollinations.AI |

---

## 0. MVP 技术约束

### 0.1 约束范围
1. **单机本地优先**：数据存储在浏览器 IndexedDB，不依赖后端数据库
2. **仅 Web 桌面端**：暂不考虑移动端适配
3. **暂不做项目导出/成片导出与批量下载**：项目导出、合成导出、图片/视频批量下载等功能延后（**MVP 允许单资源下载：单图/单视频**）
4. **导演阶段精简**：仅"逐镜头生成 + 列表预览"

### 0.2 技术选型确认
| 技术点 | 选型 | 说明 |
|--------|------|------|
| 无限画布 | tldraw 2.0 | 统一选型，不使用 Fabric/Konva |
| 本地存储 | IndexedDB | 元数据 + 媒体资产本地缓存 |
| 图片托管 | imgbb | **MVP必做**，云端永久链接供AI API引用 |
| AI 输出格式 | JSON | 结构化输出，便于校验和关联 |
| 系统提示词 | `src/prompts/*.json` | 项目内版本化管理 |

### 0.2.1 图片存储策略（云托管+本地缓存）

```
┌──────────────────────────────────────────────────────────────────┐
│                      图片存储双写策略                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户上传/AI生成图片                                              │
│         ↓                                                        │
│  ┌──────────────────┐                                            │
│  │  1. 上传到 imgbb │ → 返回永久URL (用于AI API引用)              │
│  └──────────────────┘                                            │
│         ↓                                                        │
│  ┌──────────────────┐                                            │
│  │ 2. Blob存IndexedDB│ → 本地缓存加速加载 + 离线可浏览（不保证离线生成）│
│  └──────────────────┘                                            │
│         ↓                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 3. 元数据记录: { imgbbUrl, localBlobKey, uploadedAt }     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  加载优先级: IndexedDB缓存 > imgbb云端                            │
│  AI引用时: 使用 imgbbUrl（外部可访问）                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**策略说明**：
- **imgbb云托管（必做）**：AI API（如图生视频）需要外部可访问的图片URL，imgbb提供永久免费托管
- **IndexedDB本地缓存（必做）**：加速画布渲染、支持离线浏览已缓存内容（不保证离线生成）、减少重复网络请求
- **双写机制**：上传成功后同时写入云端和本地，确保数据冗余

### 0.2.2 视频存储策略（仅本地）

> **重要**：视频资产与图片不同，**仅存储在本地 IndexedDB**，无云端托管。

| 对比项 | 图片 | 视频 |
|--------|------|------|
| 云端托管 | imgbb（必做） | ❌ 无（imgbb不支持视频） |
| 本地存储 | IndexedDB（可清理） | IndexedDB（不可清理） |
| AI引用方式 | imgbbUrl 外链 | 不涉及（视频是最终产物） |
| 配额清理 | 可清理本地blob，保留imgbbUrl | ⚠️ 清理后不可恢复 |

**视频存储要点**：
1. **仅本地存储**：视频 Blob 直接存入 IndexedDB，`uploadStatus` 固定为 `'local_only'`
2. **配额敏感**：视频文件较大（约 2-5MB/秒），需优先监控配额
3. **清理策略**：
   - 自动清理时**跳过视频资产**（清理后无法恢复）
   - 用户手动删除时需二次确认
4. **后续扩展**：MVP后可考虑 Cloudinary / AWS S3 托管视频

### 0.3 关键设计决策
1. **孤儿数据策略**：下游数据独立存在，上游删除不级联删除下游
2. **变更追踪粒度**：按集/场景/镜头级别追踪，只标记受影响的下游
3. **交互方式**：混合式（AI对话引导 + 关键节点按钮）
4. **关键帧拆分规则**：≤3s→1帧，3-6s→2帧，>6s→3帧

---

## 1. 技术栈选型

### 1.1 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | 前端框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| tldraw | 2.0.0 | 无限画布引擎 |
| CSS Modules | - | 样式隔离 |

### 1.2 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| Express | 5.2.1 | Web服务框架 |
| CORS | 2.8.5 | 跨域处理 |

### 1.3 AI API服务

| 服务 | 端点 | 用途 |
|------|------|------|
| Pollinations Chat | /v1/chat/completions | 文生文（编剧、分镜、图像设计） |
| Pollinations Image | /image | 文生图 |
| Pollinations Img2Img | /image (kontext/seedream) | 图生图 |
| Pollinations Video | /video (seedance) | 图生视频 |
| imgbb | api.imgbb.com | 图片托管 |

---

## 2. 系统架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI短剧一站式工作平台                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         前端应用层 (React + TypeScript)              │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────────────────────────────────────┐   │   │
│  │  │   AI对话区   │  │              无限画布区 (tldraw)              │   │   │
│  │  │   (1/5屏)   │  │                 (4/5屏)                       │   │   │
│  │  │             │  │                                               │   │   │
│  │  │ ┌─────────┐ │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │   │   │
│  │  │ │聊天消息  │ │  │  │编剧区│→│分镜区│→│设计区│→│美工区│→...   │   │   │
│  │  │ │列表     │ │  │  └──────┘ └──────┘ └──────┘ └──────┘       │   │   │
│  │  │ └─────────┘ │  │                                               │   │   │
│  │  │ ┌─────────┐ │  │  支持: 图片、视频、文本卡片、连接线           │   │   │
│  │  │ │输入区域  │ │  │                                               │   │   │
│  │  │ └─────────┘ │  │                                               │   │   │
│  │  └─────────────┘  └─────────────────────────────────────────────┘   │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                     状态管理层 (React Context)                   │ │   │
│  │  │  ProjectContext | StageContext | ChatContext | CanvasContext    │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       API服务层 (Services)                           │   │
│  │                                                                       │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐              │   │
│  │  │ ChatService   │ │ ImageService  │ │ VideoService  │              │   │
│  │  │ (文生文)      │ │ (文/图生图)    │ │ (图生视频)    │              │   │
│  │  └───────────────┘ └───────────────┘ └───────────────┘              │   │
│  │  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐              │   │
│  │  │ StorageService│ │ ExportService(MVP后) │ │ CanvasService │          │   │
│  │  │ (本地存储)    │ │ (项目/成片导出, MVP后) │ │ (画布操作) │            │   │
│  │  └───────────────┘ └───────────────┘ └───────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Express代理服务器 (Port 3001)                   │   │
│  │                                                                       │   │
│  │  /api/chat      → Pollinations /v1/chat/completions                  │   │
│  │  /api/txt2img   → Pollinations /image (flux model)                   │   │
│  │  /api/img2img   → Pollinations /image (kontext/seedream model)       │   │
│  │  /api/img2video → Pollinations /image (seedance model，返回 video/*) │   │
│  │  /api/imgbb/upload → imgbb.com (图片托管)                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     外部API服务 (Pollinations.AI)                    │   │
│  │                                                                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │ Text API    │ │ Image API   │ │ Video API   │ │ imgbb API   │    │   │
│  │  │ OpenAI兼容  │ │ flux/kontext│ │ seedance    │ │ 图片托管    │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构设计

```
budemo/
├── public/                          # 静态资源
│   └── favicon.ico
├── src/
│   ├── pages/                       # 页面组件 (新增)
│   │   ├── HomePage.tsx             # 首页 - 项目列表
│   │   └── WorkspacePage.tsx        # 项目工作区页面
│   │
│   ├── components/                  # React组件
│   │   ├── Home/                    # 首页相关组件 (新增)
│   │   │   ├── HomeLayout.tsx       # 首页布局
│   │   │   ├── CreativeInput.tsx    # AI创意输入框
│   │   │   ├── QuickTags.tsx        # 类型快选标签
│   │   │   ├── ProjectList.tsx      # 项目列表
│   │   │   ├── ProjectCard.tsx      # 项目卡片
│   │   │   └── Sidebar.tsx          # 左侧导航栏
│   │   │
│   │   ├── Layout/                  # 布局组件
│   │   │   ├── MainLayout.tsx       # 主布局(1/5对话 + 4/5画布)
│   │   │   ├── ChatPanel.tsx        # 左侧对话面板
│   │   │   └── CanvasPanel.tsx      # 右侧画布面板
│   │   │
│   │   ├── Chat/                    # 对话相关组件
│   │   │   ├── ChatContainer.tsx    # 对话容器
│   │   │   ├── MessageList.tsx      # 消息列表
│   │   │   ├── MessageItem.tsx      # 单条消息
│   │   │   ├── InputArea.tsx        # 输入区域
│   │   │   └── StageSelector.tsx    # 阶段选择器
│   │   │
│   │   ├── Canvas/                  # 画布相关组件
│   │   │   ├── InfiniteCanvas.tsx   # 无限画布封装
│   │   │   ├── StageArea.tsx        # 阶段区域组件
│   │   │   └── ToolPanel.tsx        # 工具面板
│   │   │
│   │   ├── Stages/                  # 各阶段特定组件
│   │   │   ├── Screenwriter/        # 编剧阶段
│   │   │   │   ├── ScriptCard.tsx   # 剧本卡片
│   │   │   │   └── ScriptEditor.tsx # 剧本编辑器
│   │   │   │
│   │   │   ├── Storyboard/          # 分镜阶段
│   │   │   │   ├── ShotTable.tsx    # 分镜表格
│   │   │   │   └── ShotCard.tsx     # 单镜头卡片
│   │   │   │
│   │   │   ├── ImageDesigner/       # 图像设计阶段
│   │   │   │   ├── PromptCard.tsx   # 提示词卡片
│   │   │   │   └── PreviewPanel.tsx # 预览面板
│   │   │   │
│   │   │   ├── Artist/              # 美工阶段
│   │   │   │   ├── ImageGrid.tsx    # 图片网格
│   │   │   │   └── ImageCard.tsx    # 单图卡片
│   │   │   │
│   │   │   └── Director/            # 导演阶段
│   │   │       ├── VideoTimeline.tsx# 视频时间线 (MVP后)
│   │   │       └── VideoCard.tsx    # 视频卡片
│   │   │
│   │   └── Shared/                  # 共享组件
│   │       ├── LoadingSpinner.tsx   # 加载动画
│   │       ├── ProgressBar.tsx      # 进度条
│   │       ├── Modal.tsx            # 模态框
│   │       └── Tooltip.tsx          # 提示框
│   │
│   ├── shapes/                      # tldraw自定义形状
│   │   ├── VideoShape.tsx           # 视频形状 (已实现)
│   │   ├── ScriptShape.tsx          # 剧本卡片形状
│   │   ├── ShotShape.tsx            # 分镜卡片形状
│   │   ├── PromptShape.tsx          # 提示词卡片形状
│   │   ├── ImageShape.tsx           # 增强图片形状
│   │   └── StageHeaderShape.tsx     # 阶段标题形状
│   │
│   ├── services/                    # API服务层
│   │   ├── pollinations.ts          # Pollinations API (已实现)
│   │   ├── chat.ts                  # 聊天服务 (新增)
│   │   ├── project.ts               # 项目管理服务 (新增)
│   │   ├── storage.ts               # 本地存储服务
│   │   └── export.ts                # 导出服务 (MVP后)
│   │
│   ├── contexts/                    # React Context
│   │   ├── ProjectContext.tsx       # 项目上下文
│   │   ├── StageContext.tsx         # 阶段上下文
│   │   ├── ChatContext.tsx          # 对话上下文
│   │   └── CanvasContext.tsx        # 画布上下文
│   │
│   ├── hooks/                       # 自定义Hooks
│   │   ├── useChat.ts               # 对话逻辑
│   │   ├── useCanvas.ts             # 画布操作
│   │   ├── useStage.ts              # 阶段管理
│   │   └── useAutoSave.ts           # 自动保存
│   │
│   ├── prompts/                     # AI系统提示词
│   │   ├── screenwriter.json        # 编剧提示词
│   │   ├── storyboard.json          # 分镜师提示词
│   │   └── imageDesigner.json       # 图像设计师提示词
│   │
│   ├── types/                       # TypeScript类型定义
│   │   ├── project.ts               # 项目相关类型
│   │   ├── stage.ts                 # 阶段相关类型
│   │   ├── chat.ts                  # 对话相关类型
│   │   └── canvas.ts                # 画布相关类型
│   │
│   ├── utils/                       # 工具函数
│   │   ├── format.ts                # 格式化工具
│   │   ├── validation.ts            # 验证工具
│   │   └── canvas.ts                # 画布辅助函数
│   │
│   ├── App.tsx                      # 应用入口
│   ├── App.css                      # 全局样式
│   └── main.tsx                     # 渲染入口
│
├── server.js                        # Express代理服务器
├── package.json                     # 依赖配置
├── tsconfig.json                    # TypeScript配置
├── vite.config.ts                   # Vite配置
└── doc/                             # 文档目录
    ├── PRD_*.md                     # 产品需求文档
    ├── 原型图_*.md                  # 原型图文档
    └── 技术方案_*.md                # 技术方案文档
```

---

## 3. API服务层设计

### 3.1 Pollinations API 集成

#### 3.1.1 Chat Completions API (文生文)

**用途**: 编剧、分镜师、图像设计师阶段的AI对话

**API端点**: `POST https://text.pollinations.ai/v1/chat/completions`

**请求格式**:
```typescript
interface ChatCompletionRequest {
  model: string;           // 模型名称, 如 'openai', 'claude', 'mistral'
  messages: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[];
  stream?: boolean;        // 是否流式输出
  temperature?: number;    // 温度 0-2
  max_tokens?: number;     // 最大token数
  seed?: number;           // 随机种子
}
```

**响应格式**:
```typescript
interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

**服务封装**:
```typescript
// src/services/chat.ts

// ⚠️ 前端不保存 Pollinations API Key：统一走本地代理（server.js）
// const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY (仅后端)
const CHAT_API_BASE = 'http://localhost:3001/api/chat';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function sendChatMessage(
  messages: Message[],
  options: ChatOptions = {}
): Promise<string> {
  const {
    model = 'openai',
    temperature = 0.7,
    maxTokens = 4096,
    stream = false,
  } = options;

  const response = await fetch(CHAT_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
// Authorization 由代理服务器注入（前端不持有密钥）
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 流式输出版本
export async function* streamChatMessage(
  messages: Message[],
  options: ChatOptions = {}
): AsyncGenerator<string> {
  const response = await fetch(CHAT_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Authorization 由代理服务器注入（前端不持有密钥）
    },
    body: JSON.stringify({
      ...options,
      messages,
      stream: true,
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) yield content;
      } catch {}
    }
  }
}
```

#### 3.1.2 Image Generation API (文生图/图生图)

**已在Demo中实现，关键函数**:

```typescript
// 文生图 - 使用 flux 模型
export async function generateImage(options: ImageGenerationOptions): Promise<string>;

// 图生图 - 支持多图输入
export async function generateImageToImage(options: ImageToImageOptions): Promise<string>;

// 支持的图生图模型
type Img2ImgModel = 'kontext' | 'seedream' | 'seedream-pro' | 'gptimage' | 'nanobanana' | 'nanobanana-pro';
```

#### 3.1.3 Video Generation API (图生视频)

**已在Demo中实现，关键函数**:

```typescript
// 图生视频 - 使用 seedance 模型
export async function generateImageToVideo(options: ImageToVideoOptions): Promise<Blob>;

interface ImageToVideoOptions {
  prompt: string;
  imageUrl: string;
  duration?: number;      // 2-10秒
  aspectRatio?: '16:9' | '9:16';
  seed?: number;
  model?: 'seedance' | 'seedance-pro';
}
```

### 3.2 Express代理服务器

**已实现的端点** (server.js):

| 端点 | 方法 | 功能 | 目标API |
|------|------|------|---------|
| /api/txt2img | GET | 文生图 | gen.pollinations.ai（/image/:prompt?model=flux） |
| /api/img2img | GET | 图生图 | gen.pollinations.ai（/image/:prompt?model=kontext/seedream…&image=...） |
| /api/img2video | GET | 图生视频 | gen.pollinations.ai（/image/:prompt?model=seedance…&image=...，返回 video/*） |
| /api/imgbb/upload | POST | 图片上传 | api.imgbb.com |

**需要新增的端点**:

```javascript
// server.js 新增
// const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;  // 从环境变量读取

// 聊天代理 - 用于文生文阶段
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://text.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    if (req.body.stream) {
      // 流式转发
      res.setHeader('Content-Type', 'text/event-stream');
      response.body.pipe(res);
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 4. 前端组件设计

### 4.0 路由与页面结构

```typescript
// src/App.tsx - 应用路由配置

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:projectId" element={<WorkspacePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### 4.0.1 HomePage - 首页组件

```typescript
// src/pages/HomePage.tsx

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Home/Sidebar';
import { CreativeInput } from '../components/Home/CreativeInput';
import { QuickTags } from '../components/Home/QuickTags';
import { ProjectList } from '../components/Home/ProjectList';
import { createProject, getProjectList } from '../services/project';

export function HomePage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getProjectList());

  // 处理创意输入提交
  const handleCreativeSubmit = useCallback(async (creative: string) => {
    // 创建新项目
    const project = await createProject({
      name: generateProjectName(creative),
      initialPrompt: creative,
    });

    // 跳转到项目工作区
    navigate(`/project/${project.id}`);
  }, [navigate]);

  // 打开已有项目
  const handleOpenProject = useCallback((projectId: string) => {
    navigate(`/project/${projectId}`);
  }, [navigate]);

  return (
    <div className="home-page">
      {/* 左侧导航栏 */}
      <Sidebar />

      {/* 主内容区 */}
      <main className="home-content">
        {/* 标题区 */}
        <div className="home-header">
          <h1>✨ AI短剧工坊 让创作更简单</h1>
          <p>懂你的AI导演，帮你搞定一切</p>
        </div>

        {/* AI创意输入框 */}
        <CreativeInput onSubmit={handleCreativeSubmit} />

        {/* 类型快选标签 */}
        <QuickTags onSelect={(tag) => setInputValue(tag)} />

        {/* 项目列表 */}
        <ProjectList
          projects={projects}
          onOpen={handleOpenProject}
          onDelete={handleDeleteProject}
          onRename={handleRenameProject}
        />
      </main>
    </div>
  );
}

// 根据创意生成项目名称
function generateProjectName(creative: string): string {
  // 提取关键词作为项目名
  const keywords = creative.slice(0, 20);
  return keywords.length < creative.length ? `${keywords}...` : keywords;
}
```

### 4.0.2 CreativeInput - AI创意输入组件

```typescript
// src/components/Home/CreativeInput.tsx

import { useState, useCallback } from 'react';

interface CreativeInputProps {
  onSubmit: (creative: string) => void;
}

export function CreativeInput({ onSubmit }: CreativeInputProps) {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!value.trim() || isLoading) return;

    setIsLoading(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setIsLoading(false);
    }
  }, [value, isLoading, onSubmit]);

  return (
    <div className="creative-input">
      <div className="input-container">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="一句话描述你想创作的短剧..."
          rows={3}
          disabled={isLoading}
        />
        <div className="input-actions">
          <button className="action-btn" title="添加附件">
            📎
          </button>
          <button className="action-btn" title="网络搜索">
            🌐
          </button>
          <button className="action-btn" title="表情">
            😊
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
          >
            {isLoading ? '⏳' : '➤'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 4.0.3 ProjectCard - 项目卡片组件

```typescript
// src/components/Home/ProjectCard.tsx

import { useState, useCallback } from 'react';
import { Project, StageType } from '../../types/project';

interface ProjectCardProps {
  project: Project;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ProjectCard({ project, onOpen, onDelete, onRename }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // 阶段状态图标
  const stageIcons: Record<string, string> = {
    completed: '✓',
    in_progress: '◐',
    not_started: '○',
  };

  // 获取各阶段状态
  const stages: { name: string; status: string }[] = [
    { name: '编剧', status: project.stages.screenwriter.status },
    { name: '分镜', status: project.stages.storyboard.status },
    { name: '设计', status: project.stages.imageDesigner.status },
    { name: '美工', status: project.stages.artist.status },
    { name: '导演', status: project.stages.director.status },
  ];

  return (
    <div
      className="project-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onOpen(project.id)}
    >
      {/* 预览图 */}
      <div className="card-preview">
        {project.previewImage ? (
          <img src={project.previewImage} alt={project.name} />
        ) : (
          <div className="placeholder">🎬</div>
        )}

        {/* 悬停遮罩 */}
        {isHovered && (
          <div className="hover-overlay">
            <button className="open-btn">打开项目</button>
          </div>
        )}
      </div>

      {/* 项目信息 */}
      <div className="card-info">
        <div className="card-header">
          <span className="project-name">{project.name}</span>
          <button
            className="menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            ⋮
          </button>
        </div>

        <span className="update-time">
          更新于 {formatDate(project.updatedAt)}
        </span>

        {/* 阶段进度 */}
        <div className="stage-progress">
          {stages.map((stage) => (
            <div
              key={stage.name}
              className={`stage-item ${stage.status}`}
              title={stage.name}
            >
              <span className="stage-name">{stage.name}</span>
              <span className="stage-icon">{stageIcons[stage.status]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 更多操作菜单 */}
      {showMenu && (
        <div className="context-menu">
          <button onClick={() => onRename(project.id, prompt('新名称') || project.name)}>
            📝 重命名
          </button>
          <button onClick={() => duplicateProject(project.id)}>
            📋 复制项目
          </button>
          <button disabled title="MVP后功能">
            📤 导出项目（MVP后）
          </button>
          <hr />
          <button className="danger" onClick={() => onDelete(project.id)}>
            🗑️ 删除项目
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${date.getDate()}`;
}
```

### 4.0.4 项目管理服务

> **⚠️ 已废弃示例**：以下代码使用 localStorage，仅供参考早期概念设计。
> MVP 实际实现应使用 IndexedDB，详见第 7 章「IndexedDB 存储设计」。

```typescript
// src/services/project.ts (已废弃，改用 IndexedDB)

import { Project, StageType } from '../types/project';

const PROJECT_LIST_KEY = 'ai_drama_projects';
const PROJECT_PREFIX = 'ai_drama_project_';

// 获取项目列表
export function getProjectList(): Project[] {
  const listStr = localStorage.getItem(PROJECT_LIST_KEY);
  if (!listStr) return [];

  const list: { id: string }[] = JSON.parse(listStr);
  return list.map(item => getProject(item.id)).filter(Boolean) as Project[];
}

// 获取单个项目
export function getProject(id: string): Project | null {
  const projectStr = localStorage.getItem(`${PROJECT_PREFIX}${id}`);
  if (!projectStr) return null;
  return JSON.parse(projectStr);
}

// 创建新项目
export function createProject(options: {
  name: string;
  initialPrompt: string;
}): Project {
  const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const project: Project = {
    id,
    name: options.name,
    description: options.initialPrompt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentStage: 'screenwriter',
    previewImage: null,
    stages: {
      screenwriter: {
        chatHistory: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: options.initialPrompt,
            timestamp: Date.now(),
            status: 'complete',
          },
        ],
        scripts: [],
        status: 'in_progress',
      },
      storyboard: { chatHistory: [], shots: [], status: 'not_started' },
      imageDesigner: { chatHistory: [], characters: [], scenes: [], keyframes: [], status: 'not_started' },
      artist: { chatHistory: [], images: [], status: 'not_started' },
      director: { chatHistory: [], videos: [], timeline: { clips: [], totalDuration: 0 }, status: 'not_started' },
    },
  };

  // 保存项目
  saveProject(project);

  // 更新项目列表
  const list = getProjectList();
  list.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list));

  return project;
}

// 保存项目
export function saveProject(project: Project): void {
  project.updatedAt = Date.now();
  localStorage.setItem(`${PROJECT_PREFIX}${project.id}`, JSON.stringify(project));

  // 更新列表中的时间
  updateProjectListItem(project.id, { updatedAt: project.updatedAt });
}

// 删除项目
export function deleteProject(id: string): void {
  localStorage.removeItem(`${PROJECT_PREFIX}${id}`);

  const list = getProjectList().filter(p => p.id !== id);
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list));
}

// 重命名项目
export function renameProject(id: string, newName: string): void {
  const project = getProject(id);
  if (project) {
    project.name = newName;
    saveProject(project);
  }
}

// 复制项目
export function duplicateProject(id: string): Project | null {
  const original = getProject(id);
  if (!original) return null;

  const newProject = {
    ...original,
    id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${original.name} (副本)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveProject(newProject);
  return newProject;
}

// 更新列表项
function updateProjectListItem(id: string, updates: Partial<{ name: string; updatedAt: number }>): void {
  const listStr = localStorage.getItem(PROJECT_LIST_KEY);
  if (!listStr) return;

  const list = JSON.parse(listStr);
  const idx = list.findIndex((item: any) => item.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list));
  }
}
```

### 4.1 布局组件

#### 4.1.1 MainLayout - 主布局组件

```typescript
// src/components/Layout/MainLayout.tsx

import { useState, useCallback } from 'react';
import { ChatPanel } from './ChatPanel';
import { CanvasPanel } from './CanvasPanel';
import { StageType } from '../../types/stage';

interface MainLayoutProps {
  projectId: string;
}

export function MainLayout({ projectId }: MainLayoutProps) {
  const [currentStage, setCurrentStage] = useState<StageType>('screenwriter');
  const [panelWidth, setPanelWidth] = useState(20); // 默认20%宽度

  const handleStageChange = useCallback((stage: StageType) => {
    setCurrentStage(stage);
    // 同时滚动画布到对应阶段区域
  }, []);

  return (
    <div className="main-layout">
      {/* 左侧对话面板 */}
      <ChatPanel
        width={`${panelWidth}%`}
        currentStage={currentStage}
        onStageChange={handleStageChange}
      />

      {/* 可拖拽分隔线 */}
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* 右侧画布面板 */}
      <CanvasPanel
        width={`${100 - panelWidth}%`}
        currentStage={currentStage}
        projectId={projectId}
      />
    </div>
  );
}
```

#### 4.1.2 ChatPanel - 对话面板组件

```typescript
// src/components/Layout/ChatPanel.tsx

import { useState, useRef, useEffect } from 'react';
import { StageSelector } from '../Chat/StageSelector';
import { MessageList } from '../Chat/MessageList';
import { InputArea } from '../Chat/InputArea';
import { useChat } from '../../hooks/useChat';
import { StageType } from '../../types/stage';

interface ChatPanelProps {
  width: string;
  currentStage: StageType;
  onStageChange: (stage: StageType) => void;
}

export function ChatPanel({ width, currentStage, onStageChange }: ChatPanelProps) {
  const { messages, isLoading, sendMessage } = useChat(currentStage);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel" style={{ width }}>
      {/* 阶段选择器 */}
      <StageSelector
        currentStage={currentStage}
        onSelect={onStageChange}
      />

      {/* 消息列表 */}
      <div className="messages-container">
        <MessageList messages={messages} />
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <InputArea
        stage={currentStage}
        isLoading={isLoading}
        onSend={sendMessage}
      />
    </div>
  );
}
```

### 4.2 tldraw自定义形状

#### 4.2.1 ScriptShape - 剧本卡片形状

```typescript
// src/shapes/ScriptShape.tsx

import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  RecordProps,
  T,
} from 'tldraw';

type ScriptShapeProps = {
  w: number;
  h: number;
  title: string;           // 剧本标题
  scene: string;           // 场景描述
  dialogue: string;        // 对白内容
  action: string;          // 动作描述
  isExpanded: boolean;     // 是否展开
};

export type ScriptShape = TLBaseShape<'script', ScriptShapeProps>;

export class ScriptShapeUtil extends BaseBoxShapeUtil<ScriptShape> {
  static override type = 'script' as const;

  static override props: RecordProps<ScriptShape> = {
    w: T.number,
    h: T.number,
    title: T.string,
    scene: T.string,
    dialogue: T.string,
    action: T.string,
    isExpanded: T.boolean,
  };

  getDefaultProps(): ScriptShapeProps {
    return {
      w: 300,
      h: 200,
      title: '场景 1',
      scene: '',
      dialogue: '',
      action: '',
      isExpanded: true,
    };
  }

  component(shape: ScriptShape) {
    const { title, scene, dialogue, action, isExpanded } = shape.props;

    return (
      <HTMLContainer style={{ width: '100%', height: '100%' }}>
        <div className="script-card">
          <div className="script-header">
            <span className="script-icon">📝</span>
            <span className="script-title">{title}</span>
          </div>
          {isExpanded && (
            <div className="script-content">
              {scene && (
                <div className="script-section">
                  <label>场景</label>
                  <p>{scene}</p>
                </div>
              )}
              {dialogue && (
                <div className="script-section">
                  <label>对白</label>
                  <p>{dialogue}</p>
                </div>
              )}
              {action && (
                <div className="script-section">
                  <label>动作</label>
                  <p>{action}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: ScriptShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
```

#### 4.2.2 ShotShape - 分镜卡片形状

```typescript
// src/shapes/ShotShape.tsx

import { BaseBoxShapeUtil, TLBaseShape, HTMLContainer, RecordProps, T } from 'tldraw';
import type { ShotType, CameraAngle, CameraMovement } from '../../types/project';

type ShotShapeProps = {
  w: number;
  h: number;
  shotNumber: number;            // 镜头编号（1..n，UI 可显示为 001）
  shotType: ShotType;            // 景别（中文枚举）
  cameraAngle: CameraAngle;      // 机位/角度（中文枚举）
  cameraMovement: CameraMovement;// 运镜（中文枚举）
  duration: number;              // 秒
  description: string;           // 画面描述
  dialogue: string;              // 对白（可为空字符串）
  sfx: string;                   // 音效（可为空字符串）
  bgm: string;                   // 背景音乐（可为空字符串）
  imageUrl?: string;             // 参考图(如有)
};

export type ShotShape = TLBaseShape<'shot', ShotShapeProps>;

export class ShotShapeUtil extends BaseBoxShapeUtil<ShotShape> {
  static override type = 'shot' as const;

  static override props: RecordProps<ShotShape> = {
    w: T.number,
    h: T.number,
    shotNumber: T.number,
    shotType: T.string,
    cameraAngle: T.string,
    cameraMovement: T.string,
    duration: T.number,
    description: T.string,
    dialogue: T.string,
    sfx: T.string,
    bgm: T.string,
    imageUrl: T.string.optional(),
  };

  getDefaultProps(): ShotShapeProps {
    return {
      w: 280,
      h: 320,
      shotNumber: 1,
      shotType: '中景',
      cameraAngle: '平视',
      cameraMovement: '固定',
      duration: 3,
      description: '',
      dialogue: '',
      sfx: '',
      bgm: '',
    };
  }

  component(shape: ShotShape) {
    const props = shape.props;

    return (
      <HTMLContainer style={{ width: '100%', height: '100%' }}>
        <div className="shot-card">
          <div className="shot-header">
            <span className="shot-number">#{props.shotNumber}</span>
            <div className="shot-meta">
              <span className="shot-type">{props.shotType}</span>
              <span className="shot-duration">{props.duration}s</span>
            </div>
          </div>

          {props.imageUrl && (
            <div className="shot-preview">
              <img src={props.imageUrl} alt={`镜头${props.shotNumber}`} />
            </div>
          )}

          <div className="shot-content">
            <div className="shot-field">
              <label>镜头运动</label>
              <span>{props.cameraMovement}</span>
            </div>
            <div className="shot-field">
              <label>画面描述</label>
              <p>{props.description}</p>
            </div>
            {props.dialogue && (
              <div className="shot-field">
                <label>对白</label>
                <p>"{props.dialogue}"</p>
              </div>
            )}
          </div>

          <div className="shot-footer">
            {props.sfx && <span className="shot-tag">🔊 {props.sfx}</span>}
            {props.bgm && <span className="shot-tag">🎵 {props.bgm}</span>}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: ShotShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />;
  }
}
```

#### 4.2.3 PromptShape - 提示词卡片形状

```typescript
// src/shapes/PromptShape.tsx

import { BaseBoxShapeUtil, TLBaseShape, HTMLContainer, RecordProps, T } from 'tldraw';

type PromptShapeProps = {
  w: number;
  h: number;
  promptType: 'character' | 'scene' | 'keyframe';  // 提示词类型
  name: string;                    // 名称
  promptText: string;              // 完整提示词
  previewImageUrl?: string;        // 预览图
  isLinked: boolean;               // 是否已关联到图片
};

export type PromptShape = TLBaseShape<'prompt', PromptShapeProps>;

export class PromptShapeUtil extends BaseBoxShapeUtil<PromptShape> {
  static override type = 'prompt' as const;

  static override props: RecordProps<PromptShape> = {
    w: T.number,
    h: T.number,
    promptType: T.string,
    name: T.string,
    promptText: T.string,
    previewImageUrl: T.string.optional(),
    isLinked: T.boolean,
  };

  getDefaultProps(): PromptShapeProps {
    return {
      w: 260,
      h: 180,
      promptType: 'character',
      name: '未命名',
      promptText: '',
      isLinked: false,
    };
  }

  component(shape: PromptShape) {
    const { promptType, name, promptText, previewImageUrl, isLinked } = shape.props;

    const typeIcons = {
      character: '👤',
      scene: '🏞️',
      keyframe: '🎬',
    };

    const typeLabels = {
      character: '角色',
      scene: '场景',
      keyframe: '关键帧',
    };

    return (
      <HTMLContainer style={{ width: '100%', height: '100%' }}>
        <div className={`prompt-card ${isLinked ? 'linked' : ''}`}>
          <div className="prompt-header">
            <span className="prompt-icon">{typeIcons[promptType]}</span>
            <span className="prompt-type">{typeLabels[promptType]}</span>
            <span className="prompt-name">{name}</span>
            {isLinked && <span className="linked-badge">✓ 已生成</span>}
          </div>

          {previewImageUrl && (
            <div className="prompt-preview">
              <img src={previewImageUrl} alt={name} />
            </div>
          )}

          <div className="prompt-content">
            <p className="prompt-text">{promptText}</p>
          </div>

          {!isLinked && (
            <button className="prompt-generate-btn">
              🎨 生成图片
            </button>
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: PromptShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
```

### 4.3 Hooks设计

#### 4.3.1 useChat - 对话逻辑Hook

```typescript
// src/hooks/useChat.ts

import { useState, useCallback, useRef } from 'react';
import { sendChatMessage, streamChatMessage, Message } from '../services/chat';
import { StageType } from '../types/stage';
import { getSystemPrompt } from '../prompts';

interface ChatMessage extends Message {
  id: string;
  timestamp: number;
  status: 'pending' | 'streaming' | 'complete' | 'error';
}

export function useChat(stage: StageType) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取当前阶段的系统提示词
  const systemPrompt = getSystemPrompt(stage);

  // 发送消息
  const sendMessage = useCallback(async (content: string, useStream = true) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'complete',
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // 构建消息历史
    const chatMessages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      if (useStream) {
        // 流式输出
        for await (const chunk of streamChatMessage(chatMessages)) {
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + chunk,
            };
            return updated;
          });
        }
      } else {
        // 非流式
        const response = await sendChatMessage(chatMessages);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: response,
          };
          return updated;
        });
      }

      // 更新状态为完成
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          ...updated[lastIdx],
          status: 'complete',
        };
        return updated;
      });
    } catch (error) {
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: '抱歉，生成失败，请重试。',
          status: 'error',
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, systemPrompt]);

  // 清空对话
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // 停止生成
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
```

#### 4.3.2 useCanvas - 画布操作Hook

```typescript
// src/hooks/useCanvas.ts

import { useCallback, useRef } from 'react';
import { Editor, TLShapeId, createShapeId, AssetRecordType } from 'tldraw';
import { StageType } from '../types/stage';

// 各阶段在画布上的X坐标起始位置
const STAGE_POSITIONS: Record<StageType, number> = {
  screenwriter: 0,
  storyboard: 3000,
  imageDesigner: 6000,
  artist: 9000,
  director: 12000,
};

const STAGE_WIDTH = 2800;  // 每个阶段区域宽度

export function useCanvas(editorRef: React.RefObject<Editor | null>) {

  // 滚动到指定阶段
  const scrollToStage = useCallback((stage: StageType) => {
    const editor = editorRef.current;
    if (!editor) return;

    const x = STAGE_POSITIONS[stage] + STAGE_WIDTH / 2;
    editor.centerOnPoint({ x, y: 500 });
  }, []);

  // 在指定阶段添加形状
  const addShapeToStage = useCallback((
    stage: StageType,
    type: string,
    props: Record<string, any>,
    offsetX = 0,
    offsetY = 0
  ): TLShapeId | null => {
    const editor = editorRef.current;
    if (!editor) return null;

    const shapeId = createShapeId();
    const baseX = STAGE_POSITIONS[stage] + 100;

    editor.createShape({
      id: shapeId,
      type,
      x: baseX + offsetX,
      y: 100 + offsetY,
      props,
    });

    return shapeId;
  }, []);

  // 添加图片到画布
  const addImageToCanvas = useCallback(async (
    dataUrl: string,
    stage: StageType,
    name: string,
    offsetX = 0,
    offsetY = 0
  ): Promise<TLShapeId | null> => {
    const editor = editorRef.current;
    if (!editor) return null;

    // 获取图片尺寸
    const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });

    // 创建资源
    const assetId = AssetRecordType.createId();
    const asset = AssetRecordType.create({
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: {
        name,
        src: dataUrl,
        w: imageSize.width,
        h: imageSize.height,
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: {},
    });

    editor.createAssets([asset]);

    // 创建图片形状
    const shapeId = createShapeId();
    const baseX = STAGE_POSITIONS[stage] + 100;

    editor.createShape({
      id: shapeId,
      type: 'image',
      x: baseX + offsetX,
      y: 100 + offsetY,
      props: {
        assetId,
        w: imageSize.width,
        h: imageSize.height,
      },
    });

    return shapeId;
  }, []);

  // 添加视频到画布
  const addVideoToCanvas = useCallback((
    videoDataUrl: string,
    stage: StageType,
    prompt: string,
    duration: number,
    aspectRatio: string,
    offsetX = 0,
    offsetY = 0
  ): TLShapeId | null => {
    const editor = editorRef.current;
    if (!editor) return null;

    const videoWidth = aspectRatio === '16:9' ? 640 : 360;
    const videoHeight = aspectRatio === '16:9' ? 360 : 640;

    const shapeId = createShapeId();
    const baseX = STAGE_POSITIONS[stage] + 100;

    editor.createShape({
      id: shapeId,
      type: 'ai-video',
      x: baseX + offsetX,
      y: 100 + offsetY,
      props: {
        w: videoWidth,
        h: videoHeight + 40,
        videoUrl: videoDataUrl,
        prompt,
        duration,
        aspectRatio,
      },
    });

    return shapeId;
  }, []);

  // 连接两个形状
  const connectShapes = useCallback((
    fromId: TLShapeId,
    toId: TLShapeId
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    const arrowId = createShapeId();
    editor.createShape({
      id: arrowId,
      type: 'arrow',
      props: {
        start: { type: 'binding', boundShapeId: fromId, normalizedAnchor: { x: 1, y: 0.5 } },
        end: { type: 'binding', boundShapeId: toId, normalizedAnchor: { x: 0, y: 0.5 } },
      },
    });
  }, []);

  return {
    scrollToStage,
    addShapeToStage,
    addImageToCanvas,
    addVideoToCanvas,
    connectShapes,
  };
}
```

---

## 5. 数据流设计

### 5.1 项目数据结构

```typescript
// src/types/project.ts

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  currentStage: StageType;

  // 各阶段数据
  stages: {
    screenwriter: ScreenwriterData;
    storyboard: StoryboardData;
    imageDesigner: ImageDesignerData;
    artist: ArtistData;
    director: DirectorData;
  };

  // 画布快照
  canvasSnapshot?: string;  // tldraw JSON
}

// 编剧阶段数据
export interface ScreenwriterData {
  chatHistory: ChatMessage[];
  scripts: Script[];
  status: StageStatus;
}

export interface Script {
  id: string;
  title: string;
  scenes: SceneData[];
  totalDurationSec?: number; // 可选：秒（如果需要统计/展示）
}

export interface SceneData {
  id: string;
  sceneNumber: number;
  location: string;
  timeOfDay: string;
  description: string;
  dialogue: DialogueLine[];
  actions: string[];
}

// 分镜阶段数据
export interface StoryboardData {
  chatHistory: ChatMessage[];
  shots: Shot[];
  status: StageStatus;
}

export type ShotType = '远景' | '全景' | '中景' | '近景' | '特写';
export type CameraAngle = '平视' | '俯视' | '仰视' | '正面' | '侧面' | '背面';
export type CameraMovement = '固定' | '推进' | '拉远' | '跟随' | '环绕' | '升降';

export interface Shot {
  id: string;
  shotNumber: number;              // 1..n（UI 可显示为 001）
  sceneId: string;                 // 关联的场景ID
  location?: string;               // 可选：便于展示/筛选
  shotType: ShotType;              // 景别（中文枚举）
  cameraAngle: CameraAngle;        // 机位/角度（中文枚举）
  cameraMovement: CameraMovement;  // 运镜（中文枚举）
  duration: number;                // 秒
  description: string;
  dialogue?: string;
  sfx?: string;
  bgm?: string;
  notes?: string;
}

// 图像设计阶段数据
export interface ImageDesignerData {
  chatHistory: ChatMessage[];
  characters: CharacterPrompt[];
  scenes: ScenePrompt[];
  keyframes: KeyframePrompt[];
  status: StageStatus;
}

export interface CharacterPrompt {
  id: string;
  name: string;
  prompt: string;
  referenceImageIds: string[];  // 关联的参考图片
}

export interface ScenePrompt {
  id: string;
  name: string;
  prompt: string;
  linkedSceneIds: string[];  // 关联的场景
}

export interface KeyframePrompt {
  id: string;
  shotId: string;  // 关联的分镜
  prompt: string;
  generatedImageId?: string;
}

// 美工阶段数据
export interface ArtistData {
  chatHistory: ChatMessage[];
  images: GeneratedImageRef[];  // 改为引用方式
  status: StageStatus;
}

// ===== MVP 推荐：使用 assetId 引用 =====
// 图片/视频数据存储在 IndexedDB assets 表，这里只保存引用
export interface GeneratedImageRef {
  id: string;
  type: 'character' | 'scene' | 'keyframe';
  name: string;
  promptId: string;            // 关联的提示词ID
  assetId: string;             // 引用 IndexedDB Asset.id
  // 元数据直接从 Asset 获取，避免重复存储
}

// ===== 已废弃：Data URL 方式 =====
// > 以下定义仅供参考早期设计，MVP 不应使用 Data URL 存储图片
// > Data URL 会导致 JSON 过大，应使用 assetId 引用方式
/*
export interface GeneratedImage_DEPRECATED {
  id: string;
  type: 'character' | 'scene' | 'keyframe';
  name: string;
  promptId: string;
  imageUrl: string;  // ❌ Data URL, 已废弃
  width: number;
  height: number;
  metadata: {
    model: string;
    seed: number;
    generatedAt: number;
  };
}
*/

// 导演阶段数据
export interface DirectorData {
  chatHistory: ChatMessage[];
  videos: GeneratedVideoRef[];  // 改为引用方式
  timeline: TimelineData;
  status: StageStatus;
}

// ===== MVP 推荐：使用 assetId 引用 =====
export interface GeneratedVideoRef {
  id: string;
  shotId: string;              // 关联的分镜ID
  sourceImageId: string;       // 源图片的 assetId
  assetId: string;             // 引用 IndexedDB Asset.id
  // 视频时长、宽高等元数据从 Asset 获取
}

// ===== 已废弃：Data URL 方式 =====
/*
export interface GeneratedVideo_DEPRECATED {
  id: string;
  shotId: string;
  sourceImageId: string;
  videoUrl: string;  // ❌ Data URL, 已废弃
  duration: number;
  aspectRatio: string;
  prompt: string;
  metadata: {
    model: string;
    seed: number;
    generatedAt: number;
  };
}
*/

export interface TimelineData {
  clips: TimelineClip[];
  totalDuration: number;
}

export interface TimelineClip {
  id: string;
  videoId: string;
  startTime: number;
  endTime: number;
  transition?: string;
}

export type StageStatus = 'not_started' | 'in_progress' | 'completed';
export type StageType = 'screenwriter' | 'storyboard' | 'imageDesigner' | 'artist' | 'director';
```

### 5.2 状态管理

> **⚠️ 已废弃示例**：以下代码使用 localStorage，仅供参考早期概念设计。
> MVP 实际实现应使用 IndexedDB，详见第 7 章「IndexedDB 存储设计」。

```typescript
// src/contexts/ProjectContext.tsx (已废弃，改用 IndexedDB)

import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { Project, StageType } from '../types/project';

interface ProjectState {
  project: Project | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

type ProjectAction =
  | { type: 'LOAD_PROJECT'; payload: Project }
  | { type: 'UPDATE_STAGE'; payload: { stage: StageType; data: any } }
  | { type: 'SET_CURRENT_STAGE'; payload: StageType }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; payload: string };

const ProjectContext = createContext<{
  state: ProjectState;
  dispatch: React.Dispatch<ProjectAction>;
  actions: {
    loadProject: (id: string) => Promise<void>;
    saveProject: () => Promise<void>;
    updateStageData: (stage: StageType, data: any) => void;
    setCurrentStage: (stage: StageType) => void;
  };
} | null>(null);

function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case 'LOAD_PROJECT':
      return { ...state, project: action.payload, isLoading: false };
    case 'UPDATE_STAGE':
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          stages: {
            ...state.project.stages,
            [action.payload.stage]: {
              ...state.project.stages[action.payload.stage],
              ...action.payload.data,
            },
          },
          updatedAt: Date.now(),
        },
      };
    case 'SET_CURRENT_STAGE':
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          currentStage: action.payload,
        },
      };
    case 'SAVE_START':
      return { ...state, isSaving: true };
    case 'SAVE_SUCCESS':
      return { ...state, isSaving: false };
    case 'SAVE_ERROR':
      return { ...state, isSaving: false, error: action.payload };
    default:
      return state;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, {
    project: null,
    isLoading: true,
    isSaving: false,
    error: null,
  });

  const loadProject = useCallback(async (id: string) => {
    // 从localStorage加载
    const saved = localStorage.getItem(`project_${id}`);
    if (saved) {
      dispatch({ type: 'LOAD_PROJECT', payload: JSON.parse(saved) });
    } else {
      // 创建新项目
      const newProject = createEmptyProject(id);
      dispatch({ type: 'LOAD_PROJECT', payload: newProject });
    }
  }, []);

  const saveProject = useCallback(async () => {
    if (!state.project) return;
    dispatch({ type: 'SAVE_START' });
    try {
      localStorage.setItem(`project_${state.project.id}`, JSON.stringify(state.project));
      dispatch({ type: 'SAVE_SUCCESS' });
    } catch (error) {
      dispatch({ type: 'SAVE_ERROR', payload: '保存失败' });
    }
  }, [state.project]);

  const updateStageData = useCallback((stage: StageType, data: any) => {
    dispatch({ type: 'UPDATE_STAGE', payload: { stage, data } });
  }, []);

  const setCurrentStage = useCallback((stage: StageType) => {
    dispatch({ type: 'SET_CURRENT_STAGE', payload: stage });
  }, []);

  return (
    <ProjectContext.Provider value={{
      state,
      dispatch,
      actions: { loadProject, saveProject, updateStageData, setCurrentStage },
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return context;
}

function createEmptyProject(id: string): Project {
  return {
    id,
    name: '新短剧项目',
    description: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentStage: 'screenwriter',
    stages: {
      screenwriter: { chatHistory: [], scripts: [], status: 'not_started' },
      storyboard: { chatHistory: [], shots: [], status: 'not_started' },
      imageDesigner: { chatHistory: [], characters: [], scenes: [], keyframes: [], status: 'not_started' },
      artist: { chatHistory: [], images: [], status: 'not_started' },
      director: { chatHistory: [], videos: [], timeline: { clips: [], totalDuration: 0 }, status: 'not_started' },
    },
  };
}
```

### 5.3 数据流转图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              数据流转示意图                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  阶段1: 编剧                阶段2: 分镜师              阶段3: 图像设计师          │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐         │
│  │   用户输入    │         │   剧本数据    │         │   分镜数据    │         │
│  │   创意需求    │────────▶│   场景列表    │────────▶│   角色列表    │         │
│  └───────┬───────┘         │   对白内容    │         │   场景列表    │         │
│          │                 └───────┬───────┘         │   关键帧列表  │         │
│          ▼                         │                 └───────┬───────┘         │
│  ┌───────────────┐                 │                         │                 │
│  │   AI编剧      │                 ▼                         ▼                 │
│  │   (Chat API)  │         ┌───────────────┐         ┌───────────────┐         │
│  │               │         │   AI分镜师    │         │  AI图像设计师 │         │
│  │  系统提示词   │         │   (Chat API)  │         │   (Chat API)  │         │
│  │  编剧.json    │         │               │         │               │         │
│  └───────┬───────┘         │  系统提示词   │         │  系统提示词   │         │
│          │                 │  分镜师.json  │         │  图像设计师   │         │
│          ▼                 └───────┬───────┘         │    .json      │         │
│  ┌───────────────┐                 │                 └───────┬───────┘         │
│  │   剧本输出    │                 ▼                         │                 │
│  │   Script[]    │         ┌───────────────┐                 ▼                 │
│  │               │         │   分镜输出    │         ┌───────────────┐         │
│  │ - 场景描述    │         │   Shot[]      │         │  提示词输出   │         │
│  │ - 对白内容    │         │               │         │  Prompt[]     │         │
│  │ - 动作指示    │         │ - 景别/运镜   │         │               │         │
│  └───────────────┘         │ - 画面描述    │         │ - 角色提示词  │         │
│                            │ - 时长/音效   │         │ - 场景提示词  │         │
│                            └───────────────┘         │ - 关键帧提示词│         │
│                                                      └───────────────┘         │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  阶段4: 美工                                 阶段5: 导演                         │
│  ┌───────────────┐                          ┌───────────────┐                  │
│  │   提示词数据  │                          │   图片数据    │                  │
│  │   Prompt[]    │                          │  ImageRef[]   │                  │
│  └───────┬───────┘                          └───────┬───────┘                  │
│          │                                          │                          │
│          ▼                                          ▼                          │
│  ┌───────────────┐                          ┌───────────────┐                  │
│  │   图像生成    │                          │   视频生成    │                  │
│  │  (Image API)  │                          │  (Video API)  │                  │
│  │               │                          │               │                  │
│  │ 文生图: flux  │                          │ 图生视频:     │                  │
│  │ 图生图:       │                          │ seedance      │                  │
│  │ - kontext     │                          │               │                  │
│  │ - seedream    │                          │ 参数:         │                  │
│  │ - seedream-pro│                          │ - 时长 2-10s  │                  │
│  └───────┬───────┘                          │ - 宽高比      │                  │
│          │                                  └───────┬───────┘                  │
│          ▼                                          │                          │
│  ┌───────────────┐                                  ▼                          │
│  │   图片输出    │                          ┌───────────────┐                  │
│  │ ImageRef[]    │                          │   视频输出    │                  │
│  │               │                          │ VideoRef[]    │                  │
│  │ - assetId     │                          │               │                  │
│  │ - imgbbUrl    │                          │ - assetId     │                  │
│  │ - 关联ID      │                          │ - durationSec │                  │
│  └───────────────┘                          │ - 关联ID      │                  │
│                                             └───────────────┘                  │
│                                                      │                          │
│                                                      ▼                          │
│                                             ┌───────────────┐                  │
│                                             │ 镜头列表预览   │                  │
│                                             │ (MVP)         │                  │
│                                             │               │                  │
│                                             │ - 播放/暂停    │                  │
│                                             │ - 单视频下载   │                  │
│                                             │ - (MVP后)时间线│                  │
│                                             └───────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.5 AI 输出 JSON Schema 规范

> **重要**：AI 输出必须为结构化 JSON，不依赖正则解析 Markdown。每阶段定义严格 Schema，校验失败提供"重试/人工修复"入口。

#### 5.5.1 编剧阶段输出 Schema

```typescript
// AI 编剧输出格式
interface ScreenwriterOutput {
  type: 'outline' | 'characters' | 'episode';

  // 大纲输出
  outline?: {
    totalEpisodes: number;
    episodes: {
      episodeNumber: number;
      title: string;
      coreEvent: string;
      hookType: string;
      hookDescription: string;
      estimatedDuration: number; // 秒
    }[];
  };

  // 角色设定输出
  characters?: {
    id: string;
    name: string;
    role: 'protagonist' | 'antagonist' | 'supporting';
    gender: string;
    age: string;
    appearance: string;
    personality: string;
    background?: string;
  }[];

  // 分集剧本输出
  episode?: {
    episodeNumber: number;
    title: string;
    scenes: {
      id: string;
      sceneNumber: number;
      location: string;
      timeOfDay: string;
      description: string;
      dialogue: {
        character: string;
        text: string;
        emotion?: string;
      }[];
      actions: string[];
    }[];
  };
}
```

#### 5.5.2 分镜阶段输出 Schema

```typescript
// AI 分镜师输出格式
interface StoryboardOutput {
  episodeId: string;
  episodeNumber: number;
  totalShots: number;
  totalDuration: number;

  shots: {
    id: string;
    shotNumber: number;        // 1..n（UI 可显示为 001）
    sceneId: string;           // 关联场景ID
    location: string;
    description: string;       // 画面内容
    shotType: '远景' | '全景' | '中景' | '近景' | '特写';
    cameraAngle: '平视' | '俯视' | '仰视' | '正面' | '侧面' | '背面';
    cameraMovement: '固定' | '推进' | '拉远' | '跟随' | '环绕' | '升降';
    duration: number;          // 秒，≤10
    dialogue?: string;
    sfx?: string;
    bgm?: string;
    notes?: string;
  }[];
}
```

#### 5.5.3 图像设计阶段输出 Schema

```typescript
// AI 图像设计师输出格式
interface ImageDesignerOutput {
  type: 'character_prompts' | 'scene_prompts' | 'keyframe_prompts';

  // 角色参考图提示词
  characterPrompts?: {
    id: string;
    characterId: string;       // 关联角色ID
    characterName: string;
    prompt: string;
    style: string;
  }[];

  // 场景参考图提示词
  scenePrompts?: {
    id: string;
    sceneId: string;           // 关联场景ID
    sceneName: string;
    prompt: string;
    style: string;
  }[];

  // 关键帧提示词
  keyframePrompts?: {
    id: string;
    shotId: string;            // 关联分镜ID
    frameIndex: number;        // 帧序号 (1, 2, 3)
    prompt: string;
    referenceCharacterIds: string[];
    referenceSceneId?: string;
  }[];
}
```

#### 5.5.4 JSON 校验服务

```typescript
// src/services/validation.ts

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// 注册各阶段 Schema
const schemas = {
  screenwriterOutline: { /* ... */ },
  screenwriterCharacters: { /* ... */ },
  screenwriterEpisode: { /* ... */ },
  storyboardOutput: { /* ... */ },
  imageDesignerCharacter: { /* ... */ },
  imageDesignerScene: { /* ... */ },
  imageDesignerKeyframe: { /* ... */ },
};

export function validateAIOutput<T>(
  stage: string,
  outputType: string,
  data: unknown
): { valid: boolean; data?: T; errors?: string[] } {
  const schemaKey = `${stage}${outputType.charAt(0).toUpperCase() + outputType.slice(1)}`;
  const schema = schemas[schemaKey];

  if (!schema) {
    return { valid: false, errors: [`Unknown schema: ${schemaKey}`] };
  }

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    return { valid: true, data: data as T };
  }

  return {
    valid: false,
    errors: validate.errors?.map(e => `${e.instancePath} ${e.message}`) || ['Validation failed'],
  };
}
```

#### 5.5.5 AI 输出校验失败的异常处理与回退流程

```typescript
// src/services/aiOutputHandler.ts

import { validateAIOutput } from './validation';
import { sendChatMessage } from './chat';

interface AIOutputResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: 'parse_error' | 'validation_error' | 'retry_exhausted';
    message: string;
    rawOutput?: string;
  };
}

const MAX_RETRY_COUNT = 3;

/**
 * 带重试和校验的AI调用
 * 失败时自动重试，并向AI反馈错误信息
 */
export async function callAIWithValidation<T>(
  messages: Message[],
  stage: string,
  outputType: string,
  options?: ChatOptions
): Promise<AIOutputResult<T>> {
  let lastError: string | null = null;
  let lastRawOutput: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt++) {
    // 如果有上次错误，添加纠错提示
    const currentMessages = lastError
      ? [
          ...messages,
          {
            role: 'user' as const,
            content: `上次输出格式有误，请修正：\n错误信息：${lastError}\n请重新输出符合JSON格式的结果。`,
          },
        ]
      : messages;

    try {
      const rawOutput = await sendChatMessage(currentMessages, options);
      lastRawOutput = rawOutput;

      // 1. 尝试解析JSON
      const parsed = parseJSONFromOutput(rawOutput);
      if (!parsed.success) {
        lastError = `JSON解析失败: ${parsed.error}`;
        console.warn(`[Attempt ${attempt}] Parse error:`, parsed.error);
        continue;
      }

      // 2. 校验Schema
      const validation = validateAIOutput<T>(stage, outputType, parsed.data);
      if (!validation.valid) {
        lastError = `Schema校验失败: ${validation.errors?.join(', ')}`;
        console.warn(`[Attempt ${attempt}] Validation error:`, validation.errors);
        continue;
      }

      // 成功
      return { success: true, data: validation.data };

    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Attempt ${attempt}] API error:`, err);
    }
  }

  // 重试耗尽
  return {
    success: false,
    error: {
      type: 'retry_exhausted',
      message: `经过${MAX_RETRY_COUNT}次重试仍失败：${lastError}`,
      rawOutput: lastRawOutput || undefined,
    },
  };
}

/**
 * 从AI输出中提取JSON（兼容 AI 外层包裹 ```json ... ``` 的情况）
 */
function parseJSONFromOutput(output: string): { success: boolean; data?: unknown; error?: string } {
  // 兼容：AI 将 JSON 放在 ```json ... ``` 代码块里
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : output.trim();

  try {
    const data = JSON.parse(jsonStr);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'JSON parse error',
    };
  }
}
```

#### 5.5.6 用户层异常处理

```
┌──────────────────────────────────────────────────────────────────┐
│                    AI输出校验失败处理流程                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AI返回内容                                                       │
│       ↓                                                          │
│  ┌──────────────┐     失败                                       │
│  │ JSON解析检查 │ ────────────┐                                  │
│  └──────────────┘             │                                  │
│       ↓ 成功                   │                                  │
│  ┌──────────────┐     失败     │                                  │
│  │ Schema校验  │ ─────────────┤                                  │
│  └──────────────┘             │                                  │
│       ↓ 成功                   ↓                                  │
│  ┌──────────────┐    ┌─────────────────────┐                     │
│  │ 数据写入存储 │    │ 自动重试(最多3次)   │                     │
│  └──────────────┘    │ 附带错误信息给AI     │                     │
│       ↓               └─────────────────────┘                     │
│  ┌──────────────┐             │                                  │
│  │ 更新画布渲染 │      重试成功 │                                  │
│  └──────────────┘       ↓      │ 重试失败                         │
│                    ────────────┘     ↓                            │
│                                 ┌────────────────────┐            │
│                                 │ 用户提示:          │            │
│                                 │ "AI响应格式异常，  │            │
│                                 │  请重新尝试或      │            │
│                                 │  调整提示内容"     │            │
│                                 │                    │            │
│                                 │ [重新生成] [编辑]  │            │
│                                 └────────────────────┘            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**用户可见的错误处理**：

| 错误类型 | 用户提示 | 可选操作 |
|----------|----------|----------|
| JSON解析失败（重试后） | "AI响应格式异常，请重新尝试" | [重新生成] [查看原始输出] |
| Schema校验失败（重试后） | "AI输出内容不完整，请补充信息后重试" | [重新生成] [编辑并重试] |
| 网络错误 | "网络连接失败，请检查网络后重试" | [重试] |
| API限流 | "请求过于频繁，请稍后再试" | [稍后重试] |

---

### 5.6 变更追踪机制（Stale Mechanism）

#### 5.6.1 数据版本追踪

```typescript
// 每个数据实体都包含版本信息
interface Versioned {
  id: string;
  version: number;           // 版本号，每次修改+1
  updatedAt: number;         // 更新时间戳
  sourceVersion?: {          // 上游数据版本（用于追踪依赖）
    id: string;
    version: number;
  };
  isStale: boolean;          // 是否过期
}

// 示例：分镜数据
interface Shot extends Versioned {
  // ... 分镜字段
  sourceVersion?: {
    id: string;              // 关联的场景ID
    version: number;         // 场景的版本号
  };
}

// 示例：关键帧提示词
interface KeyframePrompt extends Versioned {
  shotId: string;
  sourceVersion?: {
    id: string;              // 关联的分镜ID
    version: number;         // 分镜的版本号
  };
}
```

#### 5.6.2 变更传播服务

```typescript
// src/services/staleTracker.ts

type EntityType = 'episode' | 'scene' | 'shot' | 'prompt' | 'image' | 'video';

interface DependencyMap {
  episode: ['scene'];
  scene: ['shot'];
  shot: ['prompt'];
  prompt: ['image'];
  image: ['video'];
}

export class StaleTracker {
  /**
   * 标记下游数据为过期
   * @param entityType 修改的实体类型
   * @param entityId 修改的实体ID
   */
  async markDownstreamStale(
    project: Project,
    entityType: EntityType,
    entityId: string
  ): Promise<string[]> {
    const affectedIds: string[] = [];

    // 获取依赖关系
    const dependencies = this.getDependencies(entityType);

    for (const depType of dependencies) {
      const entities = this.getEntitiesBySourceId(project, depType, entityId);
      for (const entity of entities) {
        entity.isStale = true;
        affectedIds.push(entity.id);

        // 递归标记更下游的数据
        const nested = await this.markDownstreamStale(project, depType, entity.id);
        affectedIds.push(...nested);
      }
    }

    return affectedIds;
  }

  /**
   * 检查实体是否需要重新生成
   */
  checkStale(entity: Versioned, sourceEntity?: Versioned): boolean {
    if (entity.isStale) return true;

    if (sourceEntity && entity.sourceVersion) {
      return entity.sourceVersion.version < sourceEntity.version;
    }

    return false;
  }

  /**
   * 清除过期标记（重新生成后调用）
   */
  clearStale(entity: Versioned, newSourceVersion?: { id: string; version: number }) {
    entity.isStale = false;
    entity.version += 1;
    entity.updatedAt = Date.now();
    if (newSourceVersion) {
      entity.sourceVersion = newSourceVersion;
    }
  }
}
```

#### 5.6.3 UI 集成

```typescript
// 组件中显示过期状态
function ShotCard({ shot }: { shot: Shot }) {
  return (
    <div className={`shot-card ${shot.isStale ? 'stale' : ''}`}>
      {shot.isStale && (
        <div className="stale-badge">
          <span>⚠️ 已过期</span>
          <button onClick={() => regenerateShot(shot.id)}>
            重新生成
          </button>
        </div>
      )}
      {/* ... 镜头内容 */}
    </div>
  );
}

// 批量重新生成
function StalePanel({ project }: { project: Project }) {
  const staleItems = getStaleItems(project);

  return (
    <div className="stale-panel">
      <h3>⚠️ {staleItems.length} 项内容需要重新生成</h3>
      <button onClick={() => regenerateAll(staleItems)}>
        批量重新生成
      </button>
    </div>
  );
}
```

---

### 5.7 任务队列设计

#### 5.7.1 前端任务队列

```typescript
// src/services/taskQueue.ts

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Task<T = any> {
  id: string;
  type: 'generate_image' | 'generate_video' | 'ai_chat';
  status: TaskStatus;
  progress: number;           // 0-100
  data: T;
  result?: any;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
}

class TaskQueue {
  private queue: Task[] = [];
  private running: Task[] = [];
  private maxConcurrent = 2;   // 最大并发数
  private maxRetries = 3;
  private listeners: Set<(tasks: Task[]) => void> = new Set();

  /**
   * 添加任务到队列
   */
  async add<T>(
    type: Task['type'],
    data: T,
    executor: (data: T, onProgress: (p: number) => void) => Promise<any>
  ): Promise<Task> {
    const task: Task<T> = {
      id: crypto.randomUUID(),
      type,
      status: 'pending',
      progress: 0,
      data,
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.queue.push(task);
    this.notifyListeners();
    this.processQueue(executor);

    return task;
  }

  /**
   * 批量添加任务
   */
  async addBatch<T>(
    type: Task['type'],
    items: T[],
    executor: (data: T, onProgress: (p: number) => void) => Promise<any>
  ): Promise<Task[]> {
    return Promise.all(items.map(item => this.add(type, item, executor)));
  }

  /**
   * 取消任务
   */
  cancel(taskId: string): boolean {
    const task = this.queue.find(t => t.id === taskId);
    if (task && task.status === 'pending') {
      task.status = 'cancelled';
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * 重试失败任务
   */
  async retry<T>(
    taskId: string,
    executor: (data: T, onProgress: (p: number) => void) => Promise<any>
  ): Promise<boolean> {
    const task = this.queue.find(t => t.id === taskId);
    if (task && task.status === 'failed') {
      task.status = 'pending';
      task.error = undefined;
      task.retryCount += 1;
      this.notifyListeners();
      this.processQueue(executor);
      return true;
    }
    return false;
  }

  /**
   * 获取所有任务状态
   */
  getTasks(): Task[] {
    return [...this.queue];
  }

  /**
   * 获取待处理任务（刷新后恢复用）
   */
  getPendingTasks(): Task[] {
    return this.queue.filter(t => t.status === 'pending' || t.status === 'running');
  }

  /**
   * 订阅任务状态变化
   */
  subscribe(listener: (tasks: Task[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async processQueue<T>(
    executor: (data: T, onProgress: (p: number) => void) => Promise<any>
  ) {
    while (this.running.length < this.maxConcurrent) {
      const next = this.queue.find(t => t.status === 'pending');
      if (!next) break;

      next.status = 'running';
      next.startedAt = Date.now();
      this.running.push(next);
      this.notifyListeners();

      try {
        next.result = await executor(next.data, (p) => {
          next.progress = p;
          this.notifyListeners();
        });
        next.status = 'completed';
        next.completedAt = Date.now();
        next.progress = 100;
      } catch (error) {
        next.status = 'failed';
        next.error = error instanceof Error ? error.message : 'Unknown error';
      }

      this.running = this.running.filter(t => t.id !== next.id);
      this.notifyListeners();
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getTasks()));
  }
}

export const taskQueue = new TaskQueue();
```

#### 5.7.2 任务持久化（断点续跑）

```typescript
// src/services/taskPersistence.ts

const TASK_STORAGE_KEY = 'pending_tasks';

export async function savePendingTasks(tasks: Task[]): Promise<void> {
  const pendingTasks = tasks.filter(t =>
    t.status === 'pending' || t.status === 'running'
  );

  // 存储到 IndexedDB
  const db = await initDB();
  await db.put('metadata', {
    key: TASK_STORAGE_KEY,
    value: pendingTasks,
  });
}

export async function loadPendingTasks(): Promise<Task[]> {
  const db = await initDB();
  const data = await db.get('metadata', TASK_STORAGE_KEY);
  return data?.value || [];
}

// 页面加载时恢复任务
export async function resumePendingTasks() {
  const pendingTasks = await loadPendingTasks();

  if (pendingTasks.length > 0) {
    console.log(`恢复 ${pendingTasks.length} 个待处理任务`);
    // 将任务重新加入队列
    for (const task of pendingTasks) {
      task.status = 'pending';
      taskQueue.add(task.type, task.data, getExecutor(task.type));
    }
  }
}
```

---

### 5.8 关键帧拆分规则

#### 5.8.1 拆分逻辑

```typescript
// src/utils/keyframe.ts

/**
 * 根据镜头时长计算关键帧数量
 * 规则: ≤3s→1帧, 3-6s→2帧, >6s→3帧
 */
export function calculateKeyframeCount(durationSeconds: number): number {
  if (durationSeconds <= 3) return 1;
  if (durationSeconds <= 6) return 2;
  return 3;
}

/**
 * 计算关键帧时间点
 */
export function calculateKeyframeTimestamps(
  durationSeconds: number
): number[] {
  const count = calculateKeyframeCount(durationSeconds);

  switch (count) {
    case 1:
      return [0]; // 起始帧
    case 2:
      return [0, durationSeconds]; // 起始帧 + 结束帧
    case 3:
      return [0, durationSeconds / 2, durationSeconds]; // 起始 + 中间 + 结束
    default:
      return [0];
  }
}

/**
 * 为分镜生成关键帧提示词请求
 */
export function generateKeyframeRequests(shot: Shot): KeyframeRequest[] {
  const count = calculateKeyframeCount(shot.duration);
  const timestamps = calculateKeyframeTimestamps(shot.duration);

  return timestamps.map((timestamp, index) => ({
    shotId: shot.id,
    frameIndex: index + 1,
    timestamp,
    description: getFrameDescription(shot, index, count),
  }));
}

function getFrameDescription(shot: Shot, index: number, total: number): string {
  if (total === 1) {
    return shot.description; // 单帧，使用完整描述
  }

  if (index === 0) {
    return `${shot.description} (起始画面)`;
  }

  if (index === total - 1) {
    return `${shot.description} (结束画面)`;
  }

  return `${shot.description} (中间过渡画面)`;
}
```

#### 5.8.2 批量生成关键帧提示词

```typescript
// 在图像设计阶段使用
async function generateAllKeyframePrompts(
  shots: Shot[]
): Promise<KeyframePrompt[]> {
  const allPrompts: KeyframePrompt[] = [];

  for (const shot of shots) {
    const requests = generateKeyframeRequests(shot);

    for (const request of requests) {
      // 调用 AI 生成提示词
      const prompt = await generatePromptForKeyframe(request);

      allPrompts.push({
        id: crypto.randomUUID(),
        shotId: shot.id,
        frameIndex: request.frameIndex,
        prompt: prompt,
        referenceCharacterIds: extractCharacterIds(shot),
        referenceSceneId: shot.sceneId,
        version: 1,
        updatedAt: Date.now(),
        isStale: false,
      });
    }
  }

  return allPrompts;
}
```

---

## 6. 各阶段实现方案

### 6.1 阶段1: 编剧 (文生文)

#### 6.1.1 功能实现

**AI系统提示词** (参考历史版本设计，详见 `src/prompts/screenwriter.json`):
```json
{
  "role": "AI编剧助手",
  "workflow": [
    "第一步：明确产品核心理念及受众群体",
    "第二步：拟定风格化的创意主题",
    "第三步：构建引人入胜的故事结构",
    "第四步：撰写生动细腻的完整剧本"
  ],
  "output_format": "json（必须符合 ScreenwriterOutput Schema，详见 5.5.1）"
}
```

**对话流程（示例）**:
1) 用户：我想创作一个甜宠短剧，女主是个普通上班族，男主是霸道总裁
2) AI：返回 JSON（示例，必须符合 ScreenwriterOutput Schema）

```json
{
  "type": "episode",
  "episode": {
    "episodeNumber": 1,
    "title": "职场灰姑娘的逆袭爱情",
    "scenes": [
      {
        "id": "scene-1",
        "sceneNumber": 1,
        "location": "公司大厅",
        "timeOfDay": "早晨",
        "description": "现代化的办公楼大厅，清晨阳光透过玻璃幕墙洒落，人群匆忙。",
        "dialogue": [
          { "character": "林小雨", "text": "完了完了，第一天就要迟到了！", "emotion": "慌张" }
        ],
        "actions": ["林小雨踩着高跟鞋冲进大厅", "电梯提示音响起"]
      }
    ]
  }
}
```

**画布输出**:
- 自动创建剧本卡片 (ScriptShape)
- 按场景分组排列
- 支持展开/折叠查看详情

#### 6.1.2 组件实现

> MVP 推荐：直接使用 5.5.5 的 **callAIWithValidation** 获取 JSON（并做 Schema 校验），再写入 Project 数据结构并渲染到画布。

```typescript
// src/components/Stages/Screenwriter/ScriptEditor.tsx（示意）

import { useCallback } from 'react';
import { useChat } from '../../../hooks/useChat';
import { useCanvas } from '../../../hooks/useCanvas';
import { callAIWithValidation } from '../../../services/aiOutputHandler';
import type { ScreenwriterOutput } from '../../../types/aiSchemas';
import type { Script } from '../../../types/project';

export function ScriptEditor() {
  const { messages, isLoading, sendMessage } = useChat('screenwriter');
  const { addShapeToStage } = useCanvas();

  // MVP：不做 Markdown/正则解析，直接拿到 JSON（已过 Schema 校验）
  const handleAIResponse = useCallback(async () => {
    const result = await callAIWithValidation<ScreenwriterOutput>(
      messages,
      'screenwriter',
      'episode'
    );

    if (!result.success || !result.data?.episode) return;

    const script: Script = {
      id: crypto.randomUUID(),
      title: result.data.episode.title,
      scenes: result.data.episode.scenes,
    };

    // 将剧本渲染到画布（示意）
    let offsetY = 0;
    for (const scene of script.scenes) {
      addShapeToStage('screenwriter', 'script', {
        title: `场景 ${scene.sceneNumber}`,
        scene: scene.description,
        dialogue: scene.dialogue.map(d => `${d.character}: ${d.text}`).join('\\n'),
        action: scene.actions.join('\\n'),
        isExpanded: true,
      }, 0, offsetY);

      offsetY += 250;
    }
  }, [messages, addShapeToStage]);

  return (
    <div className=\"script-editor\">
      {/* 省略：对话UI；发送消息后触发 handleAIResponse */}
    </div>
  );
}
```

### 6.2 阶段2: 分镜师 (文生文)

#### 6.2.1 功能实现

**AI系统提示词** (参考历史版本设计，详见 `src/prompts/storyboard.json`):
```json
{
  "role": "AI分镜师助手",
  "input": "剧本文本",
  "output": "json（必须符合 StoryboardOutput Schema，详见 5.5.2）",
  "fields": [
    "镜头编号", "景别", "镜头运动", "时长",
    "拍摄角度", "画面描述", "对白内容",
    "音效描述", "背景音乐", "备注"
  ]
}
```

**对话流程（示例）**:
1) 用户：请根据以下剧本生成分镜
2) AI：返回 JSON（示例，必须符合 StoryboardOutput Schema）

```json
{
  "episodeId": "ep-1",
  "episodeNumber": 1,
  "totalShots": 2,
  "totalDuration": 5,
  "shots": [
    {
      "id": "shot-1",
      "shotNumber": 1,
      "sceneId": "scene-1",
      "location": "公司大厅",
      "description": "现代办公楼大厅，清晨阳光透过玻璃幕墙洒落。",
      "shotType": "全景",
      "cameraAngle": "平视",
      "cameraMovement": "推进",
      "duration": 3,
      "sfx": "脚步声、电梯叮咚",
      "bgm": "轻快钢琴",
      "notes": "建立场景"
    },
    {
      "id": "shot-2",
      "shotNumber": 2,
      "sceneId": "scene-1",
      "location": "公司大厅",
      "description": "林小雨匆忙奔跑，镜头跟随。",
      "shotType": "中景",
      "cameraAngle": "侧面",
      "cameraMovement": "跟随",
      "duration": 2,
      "sfx": "高跟鞋声",
      "bgm": "轻快钢琴",
      "notes": "引入女主"
    }
  ]
}
```

**画布输出**:
- 自动创建分镜卡片 (ShotShape)
- 横向排列，按镜头顺序
- 显示景别、时长等关键信息
- 支持拖拽调整顺序

#### 6.2.2 组件实现

> MVP 推荐：直接使用 5.5.5 的 **callAIWithValidation** 获取 StoryboardOutput JSON（并做 Schema 校验），然后渲染为 ShotShape 列表/表格。

```typescript
// src/components/Stages/Storyboard/ShotTable.tsx（示意）

import { useCallback } from 'react';
import { useChat } from '../../../hooks/useChat';
import { useCanvas } from '../../../hooks/useCanvas';
import { callAIWithValidation } from '../../../services/aiOutputHandler';
import type { StoryboardOutput } from '../../../types/aiSchemas';

export function ShotTable() {
  const { messages, sendMessage, isLoading } = useChat('storyboard');
  const { addShapeToStage } = useCanvas();

  // MVP：不做 Markdown/正则解析，直接拿到 JSON（已过 Schema 校验）
  const handleAIResponse = useCallback(async () => {
    const result = await callAIWithValidation<StoryboardOutput>(
      messages,
      'storyboard',
      'output'
    );

    if (!result.success || !result.data) return;

    let offsetX = 0;
    for (const shot of result.data.shots) {
      addShapeToStage('storyboard', 'shot', {
        shotNumber: shot.shotNumber,
        shotType: shot.shotType,
        cameraAngle: shot.cameraAngle,
        cameraMovement: shot.cameraMovement,
        duration: shot.duration,
        description: shot.description,
        dialogue: shot.dialogue ?? '',
        sfx: shot.sfx ?? '',
        bgm: shot.bgm ?? '',
      }, offsetX, 0);

      offsetX += 300;
    }
  }, [messages, addShapeToStage]);

  return (
    <div className=\"shot-table\">
      {/* 省略：输入/对话UI；发送消息后触发 handleAIResponse */}
    </div>
  );
}
```

### 6.3 阶段3: 图像设计师 (文生文)

#### 6.3.1 功能实现

**AI系统提示词** (基于 `图像设计师.md`):
```json
{
  "role": "AI图像设计师助手",
  "output_format": "json（必须符合 ImageDesignerOutput Schema，详见 5.5.3）",
  "prompt_formulas": {
    "character": "[角色名]公式 = [基础描述] + [服装风格] + [表情动作] + [光影氛围] + [画面风格]",
    "scene": "[场景名]公式 = [空间描述] + [物品陈设] + [光影氛围] + [画面风格] + [镜头视角]",
    "keyframe": "[关键帧]公式 = [角色提示词] + 在 + [场景提示词] + [当前动作] + [情绪状态]"
  }
}
```

**对话流程（示例）**:
1) 用户：请为以下分镜生成图像提示词（角色/场景/关键帧）
2) AI：返回 JSON（示例，必须符合 ImageDesignerOutput Schema）

```json
{
  "type": "keyframe_prompts",
  "keyframePrompts": [
    {
      "id": "kf-1",
      "shotId": "shot-1",
      "frameIndex": 1,
      "prompt": "（中英可混合）28岁中国女性上班族，白衬衫灰色包臀裙，慌张奔跑，清晨阳光透过玻璃幕墙，电影感写实，85mm，cinematic lighting, photorealistic",
      "referenceCharacterIds": ["char-1"],
      "referenceSceneId": "scene-1"
    }
  ]
}
```

**画布输出**:
- 自动创建提示词卡片 (PromptShape)
- 分类显示：角色、场景、关键帧
- 支持一键复制提示词
- 支持直接触发图片生成

### 6.4 阶段4: 美工 (文生图/图生图)

#### 6.4.1 功能实现

**核心API调用** (基于现有Demo):

```typescript
// 文生图 - 生成角色/场景图
const imageUrl = await generateImage({
  prompt: characterPrompt,  // 来自图像设计师阶段
  width: 1024,
  height: 1024,
  model: 'flux',
});

// 图生图 - 角色一致性保持
const imageUrl = await generateImageToImage({
  prompt: "Same character in different pose...",
  imageUrls: [referenceImageUrl],  // 参考角色图
  model: 'seedream-pro',
  width: 1024,
  height: 1024,
});

// 多图合成 - 角色+场景融合
const imageUrl = await generateImageToImage({
  prompt: "Place the character from Image 1 into the scene from Image 2",
  imageUrls: [characterImageUrl, sceneImageUrl],
  model: 'seedream-pro',
});
```

**工作流程**:
1. 用户选择提示词卡片
2. 点击"生成图片"按钮
3. AI对话辅助优化提示词
4. 调用图像生成API
5. 生成的图片自动添加到画布
6. 建立图片与提示词的关联

**画布交互**:
- 图片网格展示
- 支持选择多张图片进行合成
- 拖拽图片到分镜卡片建立关联

### 6.5 阶段5: 导演 (图生视频)

#### 6.5.1 功能实现

**核心API调用** (基于现有Demo):

```typescript
// 图生视频
const videoBlob = await generateImageToVideo({
  prompt: "The woman starts running towards the elevator...",
  imageUrl: keyframeImageUrl,  // 来自美工阶段的关键帧图
  duration: 5,  // 2-10秒
  aspectRatio: '16:9',  // 或 '9:16' 竖屏
  model: 'seedance',
});
```

**工作流程**:
1. 用户选择关键帧图片
2. AI对话辅助生成动作描述
3. 设置视频参数（时长、宽高比）
4. 调用视频生成 API
5. 视频自动添加到画布
6. （MVP）镜头列表预览 + 单镜头视频下载
7. （MVP后）时间线编排/转场/成片导出

**画布交互**:
- 视频卡片展示（已实现 VideoShape / AIVideoShapeUtil）
- 支持播放/暂停
- ✅ 单视频下载（MVP：单镜头视频）
- ⏸️ 时间线拖拽排序（MVP后）
- ⏸️ 成片导出（MVP后）

---

## 7. 本地存储方案（IndexedDB）

> **重要**：MVP 采用 IndexedDB 统一存储项目元数据和媒体资产，不使用 localStorage（容量限制约5MB，不适合存储图片/视频）。

### 7.1 IndexedDB 数据库设计

```typescript
// src/services/storage.ts

const DB_NAME = 'ai-drama-platform';
const DB_VERSION = 1;

// 数据库结构
interface DBSchema {
  projects: Project;           // 项目元数据
  assets: Asset;               // 媒体资产（图片/视频）
  canvasSnapshots: CanvasSnapshot; // 画布快照
}

// ===== 权威 Asset Schema（所有资产统一使用此定义）=====
interface Asset {
  id: string;                  // 资产ID (uuid)
  projectId: string;           // 所属项目ID
  type: 'image' | 'video';     // 资产类型
  mimeType: string;            // MIME类型 (image/png, video/mp4)
  size: number;                // 文件大小 (bytes)
  width?: number;              // 图片/视频宽度
  height?: number;             // 图片/视频高度
  duration?: number;           // 视频时长 (秒)
  createdAt: number;           // 创建时间

  // 来源信息
  source: {
    stage: StageType;          // 来源阶段 (artist/director)
    shotId?: string;           // 关联镜头ID
    promptId?: string;         // 关联提示词ID
    characterId?: string;      // 关联角色ID
    sceneId?: string;          // 关联场景ID
  };

  // 云端托管信息（图片必填，视频仅本地）
  imgbbUrl?: string;           // imgbb 永久外链（图片专用，供AI API引用）
  imgbbDeleteUrl?: string;     // imgbb 删除链接（可选）

  // 本地缓存（可空，空间不足时可清理）
  blob?: Blob | null;          // 本地二进制数据（图片有imgbb后可清空）

  // 上传状态
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed' | 'local_only';
  uploadError?: string;        // 上传失败原因

  // AI生成元数据
  metadata: {
    model: string;             // 使用的模型 (flux/seedream/seedance)
    seed?: number;             // 随机种子
    prompt?: string;           // 生成提示词
    generatedAt: number;       // 生成时间
  };
}

// 项目模型
interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  currentStage: StageType;
  stages: ProjectStages;
  canvasSnapshotId?: string;   // 引用画布快照
}

// 画布快照
interface CanvasSnapshot {
  id: string;
  projectId: string;
  data: string;                // tldraw JSON 字符串
  updatedAt: number;
}
```

### 7.2 IndexedDB 服务封装

```typescript
// src/services/indexedDB.ts

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface AIDramaDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updatedAt': number };
  };
  assets: {
    key: string;
    value: Asset;
    indexes: {
      'by-projectId': string;      // 按项目查询
      'by-type': string;           // 按类型查询
      'by-uploadStatus': string;   // 按上传状态查询
    };
  };
  canvasSnapshots: {
    key: string;
    value: CanvasSnapshot;
    indexes: { 'by-projectId': string };
  };
}

let db: IDBPDatabase<AIDramaDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<AIDramaDB>> {
  if (db) return db;

  db = await openDB<AIDramaDB>('ai-drama-platform', 1, {
    upgrade(db) {
      // 项目存储
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('by-updatedAt', 'updatedAt');

      // 资产存储（索引与 Asset.projectId 对应）
      const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
      assetStore.createIndex('by-projectId', 'projectId');
      assetStore.createIndex('by-type', 'type');
      assetStore.createIndex('by-uploadStatus', 'uploadStatus');

      // 画布快照存储
      const snapshotStore = db.createObjectStore('canvasSnapshots', { keyPath: 'id' });
      snapshotStore.createIndex('by-projectId', 'projectId');
    },
  });

  return db;
}

// 项目操作
export const projectDB = {
  async getAll(): Promise<Project[]> {
    const db = await initDB();
    return db.getAllFromIndex('projects', 'by-updatedAt');
  },

  async get(id: string): Promise<Project | undefined> {
    const db = await initDB();
    return db.get('projects', id);
  },

  async save(project: Project): Promise<void> {
    const db = await initDB();
    await db.put('projects', project);
  },

  async delete(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('projects', id);
  },
};

// 资产操作
export const assetDB = {
  async save(asset: Asset): Promise<string> {
    const db = await initDB();
    await db.put('assets', asset);
    return asset.id;
  },

  async get(id: string): Promise<Asset | undefined> {
    const db = await initDB();
    return db.get('assets', id);
  },

  async getByProject(projectId: string): Promise<Asset[]> {
    const db = await initDB();
    return db.getAllFromIndex('assets', 'by-projectId', projectId);
  },

  async delete(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('assets', id);
  },

  // 将 Blob 转为可显示的 URL
  async getAssetUrl(id: string): Promise<string | null> {
    const asset = await this.get(id);
    if (!asset) return null;
    return URL.createObjectURL(asset.blob);
  },
};

// 画布快照操作
export const snapshotDB = {
  async save(snapshot: CanvasSnapshot): Promise<void> {
    const db = await initDB();
    await db.put('canvasSnapshots', snapshot);
  },

  async getByProject(projectId: string): Promise<CanvasSnapshot | undefined> {
    const db = await initDB();
    const snapshots = await db.getAllFromIndex('canvasSnapshots', 'by-projectId', projectId);
    return snapshots[0];
  },
};
```

### 7.3 资产引用模式

```typescript
// 图片/视频不再使用 Data URL，而是使用 assetId 引用 Asset 表

// 使用示例：加载并显示图片
async function displayImage(imageRef: GeneratedImageRef) {
  const asset = await assetDB.get(imageRef.assetId);
  if (!asset) return;

  // 优先使用本地缓存
  if (asset.blob) {
    const url = URL.createObjectURL(asset.blob);
    imgElement.src = url;
    // 组件卸载时记得释放: URL.revokeObjectURL(url);
    return;
  }

  // 本地缓存已清理，回退到 imgbb 云端链接
  if (asset.imgbbUrl) {
    imgElement.src = asset.imgbbUrl;
    return;
  }

  // 无可用资源
  imgElement.src = '/placeholder-image.png';
}

// 使用示例：加载并显示视频（仅本地存储）
async function displayVideo(videoRef: GeneratedVideoRef) {
  const asset = await assetDB.get(videoRef.assetId);
  if (!asset || !asset.blob) {
    // 视频无云端托管，blob 被清理后无法恢复
    videoElement.poster = '/video-unavailable.png';
    return;
  }

  const url = URL.createObjectURL(asset.blob);
  videoElement.src = url;
}
```

### 7.4 自动保存

```typescript
// src/hooks/useAutoSave.ts

import { useEffect, useRef } from 'react';
import { useProject } from '../contexts/ProjectContext';

export function useAutoSave(intervalMs = 30000) {
  const { state, actions } = useProject();
  const lastSavedRef = useRef<number>(0);

  useEffect(() => {
    // 检测变化并自动保存
    if (state.project && state.project.updatedAt > lastSavedRef.current) {
      const timer = setTimeout(() => {
        actions.saveProject();
        lastSavedRef.current = state.project.updatedAt;
      }, 1000); // 防抖1秒

      return () => clearTimeout(timer);
    }
  }, [state.project?.updatedAt]);

  // 定时保存
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.project) {
        actions.saveProject();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, state.project]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.project) {
        actions.saveProject();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.project]);
}
```

### 7.5 存储配额与空间不足策略

#### 7.5.1 配额监控

```typescript
// src/services/storageQuota.ts

interface StorageQuotaInfo {
  usage: number;        // 已使用空间 (bytes)
  quota: number;        // 总配额 (bytes)
  usagePercent: number; // 使用百分比
}

// 获取存储配额信息
export async function getStorageQuota(): Promise<StorageQuotaInfo> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
    };
  }

  // 降级方案：估算IndexedDB使用量
  return estimateIndexedDBUsage();
}

// 存储空间告警阈值
const QUOTA_WARNING_THRESHOLD = 80;  // 80%时提醒
const QUOTA_CRITICAL_THRESHOLD = 95; // 95%时限制操作

// 检查是否可以存储新资产
export async function canStoreAsset(assetSize: number): Promise<{
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}> {
  const quota = await getStorageQuota();
  const projectedUsage = ((quota.usage + assetSize) / quota.quota) * 100;

  if (projectedUsage >= QUOTA_CRITICAL_THRESHOLD) {
    return {
      allowed: false,
      reason: '存储空间即将耗尽',
      suggestion: '请删除不需要的项目或清理旧资产',
    };
  }

  if (projectedUsage >= QUOTA_WARNING_THRESHOLD) {
    return {
      allowed: true,
      reason: '存储空间不足',
      suggestion: `当前已使用 ${quota.usagePercent.toFixed(1)}%，建议清理空间`,
    };
  }

  return { allowed: true };
}
```

#### 7.5.2 空间清理策略

```typescript
// src/services/storageCleanup.ts

interface CleanupResult {
  freedBytes: number;
  deletedCount: number;
  skippedVideos: number;  // 跳过的视频数量
}

// 清理策略
export async function cleanupStorage(strategy: 'auto' | 'manual'): Promise<CleanupResult> {
  if (strategy === 'auto') {
    // 自动清理：仅清理图片本地缓存（视频不可自动清理）
    return cleanupImageCacheOnly();
  }

  // 手动清理由用户在UI中选择要删除的项目/资产
  throw new Error('Manual cleanup requires user selection');
}

// 自动清理：仅清理图片本地缓存（云端已有imgbb备份）
// ⚠️ 视频资产跳过：视频无云端备份，清理后不可恢复
async function cleanupImageCacheOnly(): Promise<CleanupResult> {
  const db = await initDB();
  let freedBytes = 0;
  let deletedCount = 0;
  let skippedVideos = 0;

  // 获取所有资产
  const assets = await db.getAll('assets');

  // 仅筛选：类型为图片 + 已上传imgbb + 有本地blob
  const cleanableAssets = assets.filter(a => {
    if (a.type === 'video') {
      skippedVideos++;
      return false;  // 跳过视频
    }
    return a.type === 'image' && a.imgbbUrl && a.blob;
  });

  // 按创建时间排序，优先清理最旧的
  cleanableAssets.sort((a, b) => a.createdAt - b.createdAt);

  const quota = await getStorageQuota();
  const targetUsage = quota.quota * 0.7; // 目标：降到70%

  for (const asset of cleanableAssets) {
    if (quota.usage <= targetUsage) break;

    // 清除本地Blob，保留元数据和imgbbUrl
    const assetSize = asset.blob!.size;
    await db.put('assets', { ...asset, blob: null });
    freedBytes += assetSize;
    deletedCount++;
  }

  return { freedBytes, deletedCount, skippedVideos };
}
```

#### 7.5.3 用户提示

| 使用率 | 状态 | 用户提示 | 允许操作 |
|--------|------|----------|----------|
| < 80% | 正常 | 无 | 全部 |
| 80-95% | 警告 | "存储空间不足，建议清理" | 全部，但提示清理 |
| > 95% | 危险 | "存储空间即将耗尽" | 禁止新增资产，提示清理 |

---

## 8. 性能优化

### 8.1 图片处理优化

```typescript
// 图片压缩 (上传前)
async function compressImage(dataUrl: string, maxWidth = 2048): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}
```

### 8.2 画布性能优化

```typescript
// tldraw 配置优化
<Tldraw
  shapeUtils={customShapeUtils}
  onMount={(editor) => {
    // 禁用不必要的功能
    editor.updateInstanceState({
      isGridMode: false,
      isDebugMode: false,
    });
  }}
  persistenceKey="tldraw-ai-canvas"
  // 懒加载远程资源
  assetUrls={{
    fonts: {
      draw: false,  // 不加载手写字体
    },
  }}
/>
```

### 8.3 API请求优化

```typescript
// 请求队列管理
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent = 2;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    this.running++;
    const fn = this.queue.shift()!;
    await fn();
    this.running--;
    this.process();
  }
}

export const imageGenerationQueue = new RequestQueue();
```

---

## 9. 错误处理

### 9.1 API错误处理

```typescript
// src/utils/errorHandler.ts

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export function handleAPIError(error: unknown, context: string): string {
  if (error instanceof APIError) {
    switch (error.statusCode) {
      case 429:
        return '请求过于频繁，请稍后重试';
      case 500:
        return 'AI服务暂时不可用，请稍后重试';
      case 401:
        return 'API认证失败，请检查配置';
      default:
        return `${context}失败: ${error.message}`;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      return `${context}超时，请重试`;
    }
    if (error.message.includes('network')) {
      return '网络连接失败，请检查网络';
    }
    return `${context}失败: ${error.message}`;
  }

  return `${context}失败，请重试`;
}
```

### 9.2 用户提示

```typescript
// src/components/Shared/Toast.tsx

import { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{icons[type]}</span>
      <span className="toast-message">{message}</span>
    </div>
  );
}
```

---

## 10. 部署方案

### 10.1 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev       # 前端 (Vite, port 5173)
node server.js    # 后端代理 (Express, port 3001)
```

### 10.2 生产构建

```bash
# 构建前端
npm run build

# 输出到 dist/ 目录
# 可部署到任意静态托管服务
```

### 10.3 环境变量

```bash
# 前端（可选，仅配置代理地址）
VITE_API_BASE_URL=http://localhost:3001

# 后端（建议：不要把密钥放到前端；Demo 可先硬编码在 server.js）
POLLINATIONS_API_KEY=plln_pk_xxx
IMGBB_API_KEY=xxx
PORT=3001
```

---

## 11. 后续扩展

### 11.1 功能扩展

- **多用户协作**: WebSocket + 实时同步
- **云端存储**: 替换localStorage为云数据库
- **AI模型选择**: 支持切换不同的LLM模型
- **模板系统**: 预设短剧模板快速开始
- **导出功能（MVP后）**: 导出完整的项目文件包

### 11.2 技术扩展

- **后端服务**: 迁移到完整的后端框架 (NestJS/Fastify)
- **数据库**: MongoDB/PostgreSQL存储项目数据
- **文件存储**: AWS S3/阿里云OSS存储媒体文件
- **CDN加速**: 静态资源CDN分发

---

## 12. 总结

本技术方案基于已验证的Demo项目，通过以下核心技术实现AI短剧一站式工作平台：

| 功能 | 技术实现 | 状态 |
|------|----------|------|
| 无限画布 | tldraw 2.0 | ✅ 已验证 |
| 文生文 | Pollinations Chat API | 需新增 |
| 文生图 | Pollinations Image API (flux) | ✅ 已验证 |
| 图生图 | Pollinations Image API (seedream-pro) | ✅ 已验证 |
| 图生视频 | Pollinations Video API (seedance) | ✅ 已验证 |
| 图片托管 | imgbb API | ✅ MVP必做 |
| 本地存储 | IndexedDB（元数据+媒体缓存）| ✅ MVP必做 |

通过复用Demo项目的核心代码，主要新增工作包括：
1. Chat API服务层封装
2. 自定义画布形状（剧本卡片、分镜卡片、提示词卡片）
3. 各阶段对话组件
4. 项目状态管理
5. 数据流转逻辑

整体技术方案成熟可行，开发风险可控。
