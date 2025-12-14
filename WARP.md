# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

DramaAI (AI短剧一站式工作平台) is an AI-powered short drama production platform that guides users through a 5-stage workflow:
1. **Screenwriter (编剧)** - Script and story creation
2. **Storyboard (分镜师)** - Shot breakdown and visual planning
3. **Image Designer (图像设计师)** - AI prompt generation for reference images and keyframes
4. **Artist (美工)** - Batch image generation from prompts
5. **Director (导演)** - Video generation from keyframes

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development (both frontend and backend)
pnpm start

# Start frontend only (Vite dev server on port 5173)
pnpm dev

# Start backend only (Express proxy server on port 3001)
pnpm server

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Preview production build
pnpm preview
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `POLLINATIONS_API_KEY` - API key from https://enter.pollinations.ai
- `IMGBB_API_KEY` - API key from https://api.imgbb.com/

## Architecture

### Frontend (React + TypeScript + Vite)

```
src/
├── components/Layout/     # Main UI components (ChatPanel, CanvasPanel, MainLayout)
├── contexts/              # React contexts (ProjectContext for state management)
├── pages/                 # Route pages (HomePage, WorkspacePage)
├── services/              # Core business logic
│   ├── chatService.ts     # AI chat via /api/chat
│   ├── imageService.ts    # Text-to-image and image-to-image generation
│   ├── videoService.ts    # Image-to-video generation
│   ├── storageService.ts  # IndexedDB persistence (projects, assets, canvas snapshots)
│   ├── canvasService.ts   # tldraw canvas operations
│   ├── artistService.ts   # Batch image generation orchestration
│   └── validationService.ts # JSON schema validation for AI outputs
├── prompts/               # AI system prompts and JSON schemas per stage
├── config/                # Model configurations (text and image models)
└── types/                 # TypeScript type definitions
```

### Backend (Express Proxy Server)

`server.js` provides proxy endpoints to Pollinations API:
- `POST /api/chat` - Text generation (Chat Completions)
- `GET /api/txt2img` - Text-to-image generation
- `GET /api/img2img` - Image-to-image generation (supports multi-image input)
- `GET /api/img2video` - Image-to-video generation (seedance model)
- `POST /api/imgbb/upload` - Image cloud hosting upload
- `GET /api/health` - Health check

### Data Flow

1. User interacts with ChatPanel → AI generates structured JSON output
2. JSON is validated against stage-specific schemas in `src/prompts/`
3. Valid data is stored in project state via `ProjectContext`
4. Canvas (tldraw) renders visual representation of the data
5. Assets (images/videos) are stored in IndexedDB with optional imgbb cloud backup

### Key Type Definitions (`src/types/project.ts`)

- `ProjectStage` - The 5 workflow stages
- `Project` - Root data structure containing all stage data and chat history
- `EpisodeScript` / `ScriptScene` - Screenwriter output structure
- `StoryboardEpisode` / `Shot` - Storyboard output with Chinese-named shot attributes
- `ReferencePrompt` / `KeyframePrompt` - Image designer prompt structures
- `GeneratedImage` / `GeneratedVideo` - Asset tracking with generation status

### AI System Prompts

Detailed system prompts are defined in:
- `编剧系统提示词.md` - Screenwriter AI prompt (4-step script creation workflow)
- `分镜师系统提示词.md` - Storyboard AI prompt (script-to-shot breakdown)
- `图像设计师.md` - Image designer AI prompt (reference images + keyframe prompts)

These prompts define strict JSON output schemas that are validated by `validationService.ts`.

### Path Aliases

`@/` maps to `src/` (configured in `tsconfig.json` and `vite.config.ts`)

## Key Conventions

### Shot Attributes (Chinese)
- 景别 (ShotSize): 远景, 全景, 中景, 近景, 特写
- 机位 (CameraAngle): 平视, 俯视, 仰视, 侧面, 背面
- 运镜 (CameraMovement): 固定, 推进, 拉远, 跟随, 环绕, 升降

### Coding Patterns
- Prompts in `src/prompts/` export both system prompts and JSON schemas
- Services use `chatService.sendChatMessage()` with stage parameter to get appropriate prompt
- `stageRequiresValidation()` determines if AI output needs JSON validation
- Canvas state is persisted separately from project data via `saveCanvasSnapshot()`

### Stale Tracking
The `staleTracker` service marks data as stale when upstream data changes, enabling dependency cascade updates across stages.
