# Project Structure

```
src/
├── components/
│   ├── Layout/           # Main layout: ChatPanel + CanvasPanel
│   └── ui/               # Reusable UI components
├── contexts/
│   └── ProjectContext    # Global project state management
├── pages/
│   ├── HomePage          # Landing page / project list
│   └── WorkspacePage     # Main workspace (5-stage workflow)
├── services/
│   ├── chatService       # AI chat with streaming support
│   ├── storageService    # IndexedDB operations (projects, assets, snapshots)
│   ├── canvasService     # tldraw canvas operations
│   ├── imageService      # txt2img / img2img generation
│   ├── videoService      # Video generation
│   ├── artistService     # Artist stage business logic
│   ├── directorService   # Director stage business logic
│   ├── validationService # JSON Schema validation for AI outputs
│   ├── staleTracker      # Tracks stale data when upstream changes
│   └── taskPolling       # Async task polling for generation jobs
├── prompts/              # AI system prompts and output schemas
│   ├── screenwriter.ts   # Screenwriter stage prompts
│   ├── storyboard.ts     # Storyboard stage prompts
│   └── imageDesigner.ts  # Image designer stage prompts
├── types/
│   ├── project.ts        # Core project and stage data types
│   ├── canvas.ts         # Canvas-related types
│   ├── chat.ts           # Chat message types
│   └── assets.ts         # Asset (image/video) types
├── config/
│   ├── featureFlags.ts   # Feature toggles
│   ├── textModels.ts     # Text model configurations
│   └── imageModels.ts    # Image model configurations
├── locales/              # i18n translation files
│   ├── en.json
│   └── zh.json
└── lib/
    └── utils.ts          # Utility functions (cn, etc.)

api/                      # Vercel Serverless Functions
├── chat.ts               # AI chat endpoint (Replicate)
├── txt2img.ts            # Text-to-image endpoint
├── img2img.ts            # Image-to-image endpoint
├── health.ts             # Health check endpoint
├── imgbb/
│   └── upload.ts         # Image upload to imgbb
└── runcomfy/
    ├── submit.ts         # Submit generation task
    └── status.ts         # Query task status

doc/                      # Documentation
├── PRD_*.md              # Product requirements
├── 原型图_*.md           # UI prototypes per stage
└── 技术方案_*.md         # Technical specifications
```

## Key Patterns

### Stage Data Flow
1. User interacts with AI in ChatPanel
2. AI returns structured JSON (validated against schema)
3. Data stored in ProjectContext → IndexedDB
4. CanvasPanel renders stage data to tldraw canvas

### Stale Tracking
Each data entity has an `isStale` boolean. When upstream data changes, downstream entities are marked stale and need regeneration.

### Service Layer
All business logic lives in `src/services/`. Components should use services rather than implementing logic directly.

### Type Definitions
Core types in `src/types/project.ts` define the 5-stage data structures. Always use these types for type safety.
