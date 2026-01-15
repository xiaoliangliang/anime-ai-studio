# 需求文档

## 简介

本功能为 DramaAI 平台在"用户侧视频生成（导演阶段）"能力上引入可配置的多供应商机制：
- **保留现有流程（默认）**：使用 **RunComfy** 生成视频（前端调用 `/api/runcomfy/*`，由服务端转发到 RunComfy）。
- **新增可选流程**：使用 **Pollinations** 生成视频（前端直连 `https://gen.pollinations.ai/image/{prompt}`，模型参数使用 Seedance Lite：`model=seedance`）。

通过一个开关（配置）即可在两种供应商之间切换，且对上层业务保持一致的调用入口与返回结构。

## 术语表

- **Video_Provider**: 视频生成服务供应商，负责将图片和提示词转换为视频
- **RunComfy**: RunComfy 提供的视频生成服务（当前实现通过 `/api/runcomfy/submit` + `/api/runcomfy/status` 异步轮询）
- **Pollinations_API**: Pollinations.AI 提供的生成式 API 服务（`https://gen.pollinations.ai`）
- **Seedance_Lite**: 视频生成模型能力，本项目使用 `model=seedance`
- **Proxy（代理）**: 前端请求你自己的后端接口，由后端再去请求第三方（密钥不暴露、跨域/超时更好控）
- **Direct（直连）**: 前端浏览器直接请求第三方接口（少一跳，但需要前端 key 且更易触发限流）
- **Provider_Config**: 供应商配置对象，包含供应商标识、模型参数、限流/重试设置等
- **Video_Service**: 前端视频生成服务层，负责调用供应商 API 并处理响应
- **Publishable Key (pk_)**: 前端可暴露的 Pollinations Key，通常有更严格的速率限制
- **Secret Key**: 仅服务端使用的密钥（如 RunComfy token），不应暴露到前端

## 需求列表

### 需求 1: 视频供应商配置系统

**用户故事:** 作为开发者，我希望通过集中式配置系统来配置视频供应商，以便能够轻松切换不同的视频生成服务。

#### 验收标准

1. **1.1** Provider_Config 应定义视频供应商配置，包括：id、name、description、apiBaseUrl、默认模型、支持的模型列表（如有）、限流/重试参数。
2. **1.2** Provider_Config 应至少支持两个视频供应商：`runcomfy`（现有）和 `pollinations`（新增）。
3. **1.3** 当环境变量 `VITE_VIDEO_PROVIDER` 被设置时，Video_Service 应使用指定的供应商。
4. **1.4** 当环境变量未设置时，Video_Service 应默认使用 `runcomfy`。
5. **1.5** Provider_Config 应包含 Pollinations 特定参数：模型名称（`seedance`）、时长范围（2-10 秒）、宽高比选项（`16:9` 或 `9:16`）。
6. **1.6** Provider_Config 应定义供应商特定的鉴权策略：
   - `runcomfy`: 客户端无需密钥（服务端代理负责鉴权）。
   - `pollinations`: 必须通过 query param `key=...` 传递客户端密钥。
7. **1.7** 当激活的供应商是 `pollinations` 且客户端密钥未配置时，Video_Service 应快速失败并返回结构化错误（不发起网络请求）。

### 需求 2: Pollinations 视频生成集成（用户侧可选）

**用户故事:** 作为用户，我希望能够使用 Pollinations API 生成视频，以便拥有一个具有不同特性的替代视频生成选项。

#### 验收标准

1. **2.1** 当使用 `pollinations` 生成视频时，Video_Service 应调用 `https://gen.pollinations.ai/image/{prompt}` 并带上 `model=seedance`。
2. **2.2** 当提供参考图片时，Video_Service 应将其包含在 `image` query 参数中（单个 URL；多个 URL 用逗号连接）。
3. **2.3** Video_Service 应支持 `duration` 范围为 2 到 10 秒。
4. **2.4** Video_Service 应支持 `aspectRatio` 值为 `16:9` 或 `9:16`。
5. **2.5** Video_Service 应默认包含 `nologo=true`。
6. **2.6** Video_Service 应默认包含 `private=true` 和 `nofeed=true`（可配置）。
7. **2.7** Video_Service 应在 query 参数中包含 `key=...`（必需）。
8. **2.8** 当 API 返回 `video/*` 响应时，Video_Service 应将视频 blob 保存到 IndexedDB。
9. **2.9** 如果 API 返回错误响应，Video_Service 应返回带有有意义消息的结构化错误。
10. **2.10** 当供应商是 `pollinations` 时，Video_Service 应使用“前端直连”方式（不通过 Vercel Function 代理转发视频），并将生成的视频默认作为本地资产保存（local-only，无云端 URL）。

### 需求 3: 统一视频生成接口

**用户故事:** 作为开发者，我希望有一个统一的视频生成接口，以便应用代码无需知道正在使用哪个供应商。

#### 验收标准

1. **3.1** Video_Service 应为导演阶段视频生成暴露统一函数（如 `generateShotVideo` / `generateAllVideos`），可与任何配置的供应商配合使用。
2. **3.2** Video_Service 应接受相同的高层参数，无论使用哪个供应商：images、prompt(text)、duration、ratio/aspect、seed 等。
3. **3.3** Video_Service 应返回相同的结果结构，无论使用哪个供应商：success 标志、video/asset 对象、可选的 error 消息。
4. **3.4** 当通过配置切换供应商时，应用代码无需任何修改。

### 需求 4: 供应商特定参数处理

**用户故事:** 作为开发者，我希望供应商特定参数能够被透明处理，以便每个供应商都能针对其能力进行优化。

#### 验收标准

1. **4.1** Provider_Config 应为 duration 和 aspect ratio 定义供应商特定的默认值。
2. **4.2** 当未指定 duration 时，Video_Service 应使用供应商的默认 duration。
3. **4.3** 当 duration 超过供应商的最大值时，Video_Service 应将其限制到允许的最大值。
4. **4.4** 当供应商是 `pollinations` 时，Video_Service 应包含 `nologo=true` 参数以移除水印。
5. **4.5** 当供应商是 `pollinations` 时，Video_Service 应默认包含 `private=true` 和 `nofeed=true`（可配置）。
6. **4.6** Provider_Config 应为 `pollinations` 暴露可配置的请求间隔，默认为 600 秒（10 分钟）。
7. **4.7** 当供应商是 `pollinations` 且请求的 `ratio` 不被支持时，Video_Service 应使用确定性规则（在设计中定义）自动映射到支持的宽高比（`16:9` 或 `9:16`），并记录发生了回退。
8. **4.8** 当供应商是 `pollinations` 时，Video_Service 应忽略 `resolution`（Pollinations API 不需要它），但应保持调用接口不变。

### 需求 5: 错误处理与重试

**用户故事:** 作为用户，我希望视频生成能够优雅地处理错误，以便我能理解出了什么问题并在需要时重试。

#### 验收标准

1. **5.1** 如果 Pollinations API 返回 HTTP 400，Video_Service 应返回指示输入无效的错误。
2. **5.2** 如果 Pollinations API 返回 HTTP 401，Video_Service 应返回指示鉴权失败的错误。
3. **5.3** 如果 Pollinations API 返回 HTTP 429，Video_Service 应返回指示速率限制的错误并建议稍后重试。
4. **5.4** 如果 Pollinations API 返回 HTTP 500，Video_Service 应返回指示服务器故障的错误。
5. **5.5** 如果响应的 content-type 不以 `video/` 开头，Video_Service 应返回指示意外响应格式的错误。
6. **5.6** Video_Service 应记录详细的错误信息以便调试。
