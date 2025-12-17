# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

DramaAI 是一个 AI 短剧一站式工作平台，帮助用户通过 AI 辅助完成从编剧到视频生成的全流程。项目使用 React + TypeScript + Vite 构建前端，Vercel Serverless Functions 作为后端 API。

- **线上地址**: https://animeaistudio.com
- **部署平台**: Vercel（前端 + Serverless Functions 全栈部署）

## 常用命令

```bash
# 安装依赖
pnpm install

# 本地开发（前端 + 代理服务器）
pnpm start

# 仅启动前端开发服务器
pnpm dev

# 仅启动后端代理服务器
pnpm server

# 构建生产版本
pnpm build

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
```

## 架构概述

### 五阶段工作流

项目核心是五个创作阶段的流水线：

1. **编剧 (screenwriter)** - 生成剧本大纲、角色设定、世界观、剧本场景
2. **分镜 (storyboard)** - 将剧本拆解为镜头（景别、机位、运镜、时长）
3. **图像设计 (imageDesigner)** - 为角色/场景/关键帧生成提示词
4. **美工 (artist)** - 调用 AI 生成参考图和关键帧图片
5. **导演 (director)** - 调用 AI 生成视频片段

每个阶段的数据都有 `isStale` 标记，用于追踪上游数据变化时下游数据是否需要重新生成。

### 目录结构

```
src/
├── components/
│   ├── Layout/          # 主布局：ChatPanel（对话）+ CanvasPanel（tldraw 画布）
│   └── ui/              # 通用 UI 组件
├── contexts/
│   └── ProjectContext   # 全局项目状态管理
├── pages/
│   ├── HomePage         # 首页/项目列表
│   └── WorkspacePage    # 工作区（主界面）
├── services/
│   ├── chatService      # AI 对话服务（流式响应）
│   ├── storageService   # IndexedDB 存储（项目/资产/画布快照）
│   ├── canvasService    # tldraw 画布操作
│   ├── imageService     # 图片生成（txt2img/img2img）
│   ├── videoService     # 视频生成
│   ├── artistService    # 美工阶段业务逻辑
│   ├── directorService  # 导演阶段业务逻辑
│   ├── validationService# JSON Schema 校验
│   ├── staleTracker     # 数据过期标记追踪
│   └── taskPolling      # 异步任务轮询
├── prompts/             # 各阶段 AI 系统提示词和输出 Schema
├── types/               # TypeScript 类型定义
├── locales/             # i18n 翻译文件（中/英）
└── config/              # 配置（功能开关、模型配置）

api/                     # Vercel Serverless Functions
├── chat.ts              # AI 聊天 API（Replicate Claude）
├── txt2img.ts           # 文生图 API
├── img2img.ts           # 图生图 API
└── runcomfy/            # RunComfy 相关 API
```

### 关键技术栈

- **前端**: React 18 + TypeScript + Vite + React Router
- **状态管理**: React Context（ProjectContext）
- **存储**: IndexedDB（idb 库）
- **画布**: tldraw
- **样式**: Tailwind + 自定义 CSS
- **国际化**: i18next
- **后端**: Vercel Serverless Functions
- **AI 服务**: Replicate API（Claude 文本生成）、RunComfy（Seedream 图片生成）

### 数据流

1. 用户在 ChatPanel 与 AI 对话
2. AI 返回结构化 JSON（通过 Schema 校验）
3. 数据存入 ProjectContext → IndexedDB
4. CanvasPanel 根据阶段数据渲染到 tldraw 画布

### 路径别名

使用 `@/*` 指向 `src/*`，在 `tsconfig.json` 和 `vite.config.ts` 中配置。

## 环境变量

参考 `.env.example`，关键变量：

- `REPLICATE_API_TOKEN` - AI 文本生成
- `RUNCOMFY_API_TOKEN` - 图片生成
- `IMGBB_API_KEY` - 图片上传托管
- `VITE_ENABLE_IMAGE_GENERATION` - 功能开关：图片生成
- `VITE_ENABLE_VIDEO_GENERATION` - 功能开关：视频生成

## 开发注意事项

- 前端代理配置在 `vite.config.ts`，将 `/api` 代理到 `localhost:3001`
- Vercel 部署配置在 `vercel.json`
- AI 输出需要通过 `validationService` 进行 JSON Schema 校验
- 各阶段系统提示词在 `src/prompts/` 目录下维护
