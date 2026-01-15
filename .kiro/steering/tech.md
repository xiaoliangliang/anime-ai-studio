# Tech Stack & Build System

## Frontend

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Routing**: React Router DOM 6
- **State Management**: React Context (ProjectContext)
- **Canvas**: tldraw 2.0
- **Styling**: Tailwind CSS + custom CSS
- **i18n**: i18next + react-i18next
- **Storage**: IndexedDB via `idb` library
- **Animation**: Framer Motion
- **Icons**: Lucide React

## Backend

- **Platform**: Vercel Serverless Functions
- **Runtime**: Node.js (Vercel Node)
- **AI Text**: Pollinations API (OpenAI-compatible)
- **AI Image**: RunComfy (Seedream models)
- **Image Hosting**: imgbb (cloud URLs for AI API references)

## Common Commands

```bash
# Install dependencies
pnpm install

# Development (frontend + proxy server)
pnpm start

# Frontend only
pnpm dev

# Backend proxy only
pnpm server

# Production build
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Environment Variables

Required in `.env`:
- `POLLINATIONS_API_KEY` - AI text generation (Pollinations)
- `RUNCOMFY_API_TOKEN` - Image generation
- `IMGBB_API_KEY` - Image hosting

Feature flags (Vite env):
- `VITE_ENABLE_IMAGE_GENERATION` - Enable/disable image generation
- `VITE_ENABLE_VIDEO_GENERATION` - Enable/disable video generation

## Path Aliases

`@/*` maps to `src/*` (configured in tsconfig.json and vite.config.ts)

## API Proxy

Development proxy configured in `vite.config.ts`:
- `/api` routes proxy to `localhost:3001`

## Deployment

- Platform: Vercel
- Config: `vercel.json`
- Functions timeout: 60s max
