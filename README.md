# Anime AI Studio -AI漫剧创作坊

AI 短剧一站式创作平台（编剧 -> 分镜 -> 图像设计 -> 美工 -> 导演）。

本项目可直接部署到 Vercel（前端 + Serverless Functions）。

## 项目简介

Anime AI Studio 是一个面向 AI 漫剧创作的全流程生产平台。  
它把“写剧本、拆分镜、设计提示词、生成素材、合成视频”串成一条可落地的工作流，让个人创作者也能完成原本需要多人协作的制作流程。

### 产品目标

1. 降低动漫短剧创作门槛，让非专业团队也能完成作品生产。
2. 缩短从创意到成片的周期，提升内容迭代效率。
3. 用结构化数据与可视化画布提升多阶段协作质量。

### 目标受众

1. 个人创作者：短视频博主、独立动画创作者、AIGC 创作者。
2. 小型内容团队：MCN、独立工作室、IP 孵化团队。
3. 企业内容部门：教育内容、营销内容、品牌叙事团队。

### 核心功能

1. 五阶段创作流水线  
   编剧 -> 分镜 -> 图像设计 -> 美工 -> 导演，逐阶段产出结构化结果。
2. AI 对话驱动创作  
   在同一工作区中与 AI 交互，自动生成并更新剧本、镜头、提示词与素材。
3. 无限画布可视化  
   基于 `tldraw` 的画布承载脚本、分镜、参考图、关键帧和视频资产。
4. 本地数据持久化  
   通过 IndexedDB 管理项目、资产与画布快照，支持本地优先创作。
5. 服务端安全网关  
   通过 Vercel Serverless Functions 代理第三方 AI 请求，避免暴露服务端密钥。

## 技术架构图

![Anime AI Studio 技术架构图](docs/architecture/overview.png)

## 技术架构说明

1. 前端层（React + Vite）  
   `ChatPanel` + `CanvasPanel` 提供对话交互与可视化创作体验。
2. 状态与服务层  
   `ProjectContext` 负责全局状态管理，`chatService` / `canvasService` / `storageService` 负责业务编排与数据处理。
3. 存储层  
   IndexedDB 保存项目数据、媒体资产与画布快照。
4. 后端 API 层（Vercel Functions）  
   统一鉴权、参数校验、请求转发与安全控制。
5. 外部 AI 能力层  
   对接文本、图像、视频生成服务，完成核心生成能力。

## 开源前必做安全操作

1. 立即轮换你已使用过的密钥（尤其是曾出现在本地 `.env` 或历史代码中的）：
   - `POLLINATIONS_API_KEY`
   - `RUNCOMFY_API_TOKEN`
   - `IMGBB_API_KEY`
   - 以及你已使用过的其他第三方 Token（如 `REPLICATE_API_TOKEN`）
2. 确认 `.env` 不会被提交（本仓库已忽略）。
3. 提交前执行：
   ```bash
   pnpm security:scan
   ```

## 第一步：申请 API Key

1. Pollinations（文本/图像/视频）
   - 申请地址: https://enter.pollinations.ai
   - 你会用到：
     - `POLLINATIONS_API_KEY`（服务端密钥，保密）
     - `VITE_POLLINATIONS_API_KEY`（publishable key，可暴露在前端）
2. RunComfy（图像/视频）
   - 申请地址: https://www.runcomfy.com/profile?section=api-tokens
   - 你会用到：`RUNCOMFY_API_TOKEN`（服务端密钥，保密）
3. imgbb（图片托管）
   - 申请地址: https://api.imgbb.com/
   - 你会用到：`IMGBB_API_KEY`（服务端密钥，保密）

## 第二步：本地配置环境变量

1. 复制示例配置：
   ```bash
   cp .env.example .env
   ```
   PowerShell 可用：
   ```powershell
   Copy-Item .env.example .env
   ```
2. 在 `.env` 中填入你的真实密钥。
3. 关键建议：
   - `VITE_API_BASE_URL` 本地可留空（走 Vite 代理），Vercel 建议留空（同源请求）。
   - `ALLOWED_ORIGINS` 生产环境务必配置你的域名白名单，例如：
     - `https://animeaistudio.com`
     - `https://www.animeaistudio.com`

## 第三步：本地启动

```bash
pnpm install
pnpm dev
```

如果你要完整模拟 Vercel Functions，建议使用：

```bash
pnpm dlx vercel dev
```

## 第四步：部署到 Vercel（全流程）

1. 登录 Vercel，点击 `Add New Project`。
2. 导入 GitHub 仓库 `xiaoliangliang/anime-ai-studio`。
3. Framework 选择 `Vite`（通常会自动识别）。
4. Build 配置（默认即可）：
   - Install Command: `pnpm install`
   - Build Command: `pnpm build`
5. 在 `Environment Variables` 配置：
   - `POLLINATIONS_API_KEY`（Production / Preview / Development）
   - `RUNCOMFY_API_TOKEN`
   - `IMGBB_API_KEY`
   - `VITE_POLLINATIONS_API_KEY`（可选，前端直连 Pollinations 时需要）
   - `VITE_API_BASE_URL`（建议留空）
   - `VITE_ENABLE_IMAGE_GENERATION=true|false`
   - `VITE_ENABLE_VIDEO_GENERATION=true|false`
   - `VITE_IMAGE_PROVIDER=pollinations|runcomfy`
   - `VITE_VIDEO_PROVIDER=runcomfy|pollinations`
   - `ALLOWED_ORIGINS`（强烈建议配置为你的线上域名，逗号分隔）
   - `FETCH_FILE_ALLOWED_HOST_SUFFIXES`（可选）
   - `DEBUG_API_LOGS=false`
6. 点击 Deploy，等待构建完成。
7. 部署成功后，在项目域名下验证：
   - `GET /api/health`
   - 前端工作流是否可正常调用生成接口

## 第五步：上线后安全加固

1. 将 `ALLOWED_ORIGINS` 只保留你的正式域名。
2. 关闭 `DEBUG_API_LOGS`（保持 `false`）。
3. 定期轮换服务端密钥。
4. 每次发布前执行 `pnpm security:scan`。
5. 仓库已提供 `.github/workflows/security-scan.yml`，PR/Push 会自动执行密钥扫描。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm security:scan
```

## 安全与隐私

详见 `SECURITY.md`。
