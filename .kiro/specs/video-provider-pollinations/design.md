# 设计文档: 视频供应商 Pollinations

## 概述

本设计为 DramaAI 平台实现可配置的"用户侧视频生成（导演阶段）"供应商开关：在保留现有默认供应商 **RunComfy** 的同时，新增 **Pollinations** 作为可选供应商，让用户也能体验使用 Pollinations 生成视频。

面向小白的解释：
- **现有方式（RunComfy）= 代理（proxy）**：前端请求你自己的后端接口（`/api/runcomfy/*`），由后端再去请求 RunComfy（密钥不暴露、跨域/超时更好控制）。
- **新增方式（Pollinations）= 直连（direct）**：前端浏览器直接请求 Pollinations（`https://gen.pollinations.ai/image/{prompt}`），必须带 `key=pk_...`，更容易触发限流，所以需要更保守的请求间隔（默认 180s，可配置）。

Pollinations 端使用 Seedance Lite 能力（API 参数 `model=seedance`），并默认启用 `private=true&nofeed=true&nologo=true`（可配置）。

## 架构

```mermaid
graph TB
    subgraph "应用层"
        UI[ChatPanel / 用户界面]
        DS[DirectorService (视频生成)]
    end
    
    subgraph "配置层"
        VPC[videoProviders.ts]
        ENV[环境变量]
    end
    
    subgraph "供应商实现"
        RC[RunComfy 供应商<br>/api/runcomfy/*]
        PL[Pollinations 供应商<br>gen.pollinations.ai/image/{prompt}]
    end
    
    subgraph "外部 API"
        RCA[RunComfy API]
        PLA[Pollinations API]
    end
    
    UI --> DS
    DS --> VPC
    VPC --> ENV
    DS --> RC
    DS --> PL
    RC --> RCA
    PL --> PLA
```

### 设计决策

1. **配置驱动切换**: 通过环境变量 `VITE_VIDEO_PROVIDER` 控制供应商选择，无需修改代码
2. **不影响现有流程**: 默认仍使用 RunComfy，保证现有用户侧体验不变
3. **统一入口**: 对上层保持 `generateShotVideo` / `generateAllVideos` 等入口不变
4. **供应商封装**: 每个供应商的 API 调用逻辑封装在独立函数中
5. **参数适配**: 在服务层处理不同供应商的参数格式差异
6. **鉴权与限流策略**:
   - `runcomfy`: 服务端使用 `RUNCOMFY_API_TOKEN` 请求 RunComfy，前端不直接接触密钥。
   - `pollinations`: 前端必须配置 `VITE_POLLINATIONS_API_KEY`（`pk_`），并通过 query param `key=...` 鉴权；未配置 key 时直接失败（不发起网络请求）。默认请求间隔 10min（可配置）。

## 组件与接口

### VideoProviderConfig 接口

```typescript
export type VideoProvider = 'runcomfy' | 'pollinations';

export interface VideoProviderConfig {
  /** 供应商标识 */
  id: VideoProvider;
  /** 供应商名称 */
  name: string;
  /** 描述 */
  description: string;
  /** API 基础 URL */
  apiBaseUrl: string;
  /** 默认模型 */
  defaultModel: string;
  /** 支持的模型列表 */
  supportedModels: string[];
  /** 默认时长（秒） */
  defaultDuration: number;
  /** 最小时长（秒） */
  minDuration: number;
  /** 最大时长（秒） */
  maxDuration: number;
  /** 支持的宽高比 */
  supportedAspectRatios: string[];
  /** 默认宽高比 */
  defaultAspectRatio: string;
  /** 请求间隔（毫秒） */
  requestInterval: number;
  /** 失败重试次数 */
  maxRetries: number;
  /** 是否默认去水印（nologo=true） */
  defaultNologo?: boolean;
  /** 是否默认不进入公共 feed（具体使用 private/nofeed，见下方请求格式） */
  defaultNoFeed?: boolean;
  /** pollinations 的 key（必需，pk_ 开头） */
  clientKey?: string;
}
```

### 供应商配置

```typescript
/** runcomfy（现有默认实现）：走后端代理 /api/runcomfy/* */
export const RUNCOMFY_VIDEO_CONFIG: VideoProviderConfig = {
  id: 'runcomfy',
  name: 'RunComfy',
  description: '现有用户侧视频生成：前端调用 /api/runcomfy/submit + /api/runcomfy/status（异步轮询）',
  apiBaseUrl: '', // 使用 VITE_API_BASE_URL
  defaultModel: 'seedance-1.0-lite',
  supportedModels: ['seedance-1.0-lite'],
  defaultDuration: 5,
  minDuration: 2,
  maxDuration: 12,
  supportedAspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
  defaultAspectRatio: '16:9',
  requestInterval: 0,
  maxRetries: 1,
};

/** pollinations（新增）：前端直连 https://gen.pollinations.ai */
export const POLLINATIONS_VIDEO_CONFIG: VideoProviderConfig = {
  id: 'pollinations',
  name: 'Pollinations (Seedance)',
  description: '新增：前端直连 Pollinations /image/{prompt}，使用 Seedance Lite（model=seedance）',
  apiBaseUrl: 'https://gen.pollinations.ai',
  defaultModel: 'seedance',
  supportedModels: ['seedance'],
  defaultDuration: 5,
  minDuration: 2,
  maxDuration: 10,
  supportedAspectRatios: ['16:9', '9:16'],
  defaultAspectRatio: '16:9',
  // pk_ key 限流严格：默认 10min 间隔（可配置）
  requestInterval: 600000,
  maxRetries: 2,
  defaultNologo: true,
  defaultNoFeed: true,
  clientKey: import.meta.env.VITE_POLLINATIONS_API_KEY || '',
};
```

### DirectorService 接口

```typescript
export interface VideoGenerationParams {
  shotId: string;
  shotNumber: string;
  images: string[]; // 1-4 张参考图（公开可访问 URL）
  text: string; // 提示词
  duration: number; // 2-12（RunComfy）；2-10（Pollinations）
  resolution: '480p' | '720p'; // Pollinations 将忽略该参数
  ratio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'; // Pollinations 仅支持 16:9 / 9:16
  seed?: number;
}

export interface GenerateSingleVideoResult {
  success: boolean;
  video?: GeneratedVideo;
  error?: string;
}

// 统一入口函数
export async function generateShotVideo(
  projectId: string,
  params: VideoGenerationParams
): Promise<GenerateSingleVideoResult>;

// 供应商特定实现（内部函数）
async function generateWithRunComfy(
  projectId: string,
  params: VideoGenerationParams,
  config: VideoProviderConfig
): Promise<GenerateSingleVideoResult>;

async function generateWithPollinations(
  projectId: string,
  params: VideoGenerationParams,
  config: VideoProviderConfig
): Promise<GenerateSingleVideoResult>;
```

## 数据模型

### 请求参数映射

| 通用参数 | runcomfy 参数 | pollinations 参数 |
|---------|------------|------------------|
| text | `text` (submit body) | `{prompt}` (path，用 text) |
| images[] | `images` (submit body) | `image` (query，多图用分隔符拼接) |
| duration | `duration` (query) | `duration` (query) |
| ratio/aspect | `ratio` (submit body) | `aspectRatio` (query，仅 16:9/9:16) |
| seed | `seed` (query) | `seed` (query) |
| model | `model` (query) | `model` (query) |

### 兼容性与自动映射

为保证"用户侧体验一致"，在切换供应商时对不兼容参数进行自动兜底/映射：

1. **duration 映射（秒）**
   - `runcomfy`: 允许 2-12（当前实现口径）
   - `pollinations`: 允许 2-10（Pollinations 文档口径）
   - 规则：统一做 clamp（小于最小值用最小值；大于最大值用最大值），并记录日志。

2. **ratio/aspect 映射**
   - `runcomfy` 支持更多比例（如 `4:3`, `1:1`, `3:4`, `21:9`）
   - `pollinations` 仅支持 `16:9` / `9:16`
   - 规则（确定性）：
     - 若 `ratio` 为 `9:16` 或 `3:4` → 映射为 `9:16`
     - 其他所有情况（含 `16:9`, `4:3`, `1:1`, `21:9`）→ 映射为 `16:9`
   - 映射发生时：记录日志，便于排查"为什么画幅变了"。

3. **resolution 处理**
   - `runcomfy` 需要 `resolution`（`480p`/`720p`）
   - `pollinations` 不需要该参数
   - 规则：当 provider 为 `pollinations` 时忽略 `resolution`，但保留参数以保持上层接口不变。

### Vercel 部署约束（重要）

本项目完全部署在 Vercel 时，需要特别关注以下限制（会直接影响 Pollinations 的接入方式）：

1. **不建议用 Vercel Function 直接“转发 mp4”给前端**
   - Vercel Functions 对 request/response body 有严格大小限制；而视频 `video/mp4` 很容易超过限制，导致函数报错（payload too large 等）。
   - 结论：`pollinations` 生成的视频二进制数据不走 `/api/*` 转发返回给前端。

2. **推荐方案（保持“全在 Vercel”）**
   - **方案 A（本期选定，最简单）**：前端直连 Pollinations 拉取 `video/*`，存 IndexedDB（本地资产，local-only）。`VITE_POLLINATIONS_API_KEY` 使用 `pk_`，通过 query param `key=...` 传递。
   - **方案 B（后续可选：需要“可分享 URL”时）**：前端直连 Pollinations 拉取视频后，使用“客户端直传”上传到 Vercel Blob，得到可访问 URL 存到项目数据中。
   - **方案 C（后续可选：隐藏 key / 服务端拉取）**：Vercel Function 在服务端拉取 Pollinations 视频并写入 Blob，然后只把 Blob URL 返回给前端；需要额外的任务状态管理与更长的函数执行时间配置。

### Pollinations API 请求格式

```
GET https://gen.pollinations.ai/image/{encodedPrompt}?model=seedance&image={imageUrls}&duration={duration}&aspectRatio={aspectRatio}&seed={seed}&nologo=true&key={pk_key}&private=true&nofeed=true
```

说明：`imageUrls` 为 1 个或多个图片 URL；多个 URL 使用英文逗号 `,` 拼接。

### 响应处理

两种供应商在底层返回形式不同，但对上层都返回统一的结果结构：
- RunComfy：异步任务，最终返回一个可访问的 `videoUrl`（云端 URL）。
- Pollinations：同步长请求，直接返回 `video/*` 的二进制数据（常见为 `video/mp4`）。

统一处理建议：
1. RunComfy：保存 `videoUrl` 到资产（IndexedDB 记录 `cloudUrl`），并生成 `GeneratedVideo`。
2. Pollinations：校验 `content-type` 为 `video/*`，获取 blob → base64，保存到 IndexedDB，并生成 `GeneratedVideo`。

## 正确性属性

*属性是指在系统所有有效执行中都应保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范与机器可验证正确性保证之间的桥梁。*

### 属性 1: 供应商配置完整性

*对于* VIDEO_PROVIDERS 中的任何视频供应商配置，配置对象应包含所有必需字段：id、name、description、apiBaseUrl、defaultModel、supportedModels、defaultDuration、minDuration、maxDuration、supportedAspectRatios 和 defaultAspectRatio。

**验证: 需求 1.1, 1.5, 1.6**

### 属性 2: 时长归一化

*对于* 提供给视频生成的任何 duration 值，实际使用的 duration 应为：
- 如果 duration 未定义，使用供应商的 defaultDuration
- 如果 duration < minDuration，限制为 minDuration
- 如果 duration > maxDuration，限制为 maxDuration
- 如果 minDuration <= duration <= maxDuration，使用原始值

**验证: 需求 2.3, 4.2, 4.3**

### 属性 3: Pollinations URL 构造

*对于* 任何 prompt 字符串和 images，当使用 Pollinations 供应商时，构造的 URL 应：
- 在路径中包含 URL 编码的 prompt
- 在 query 参数中包含 `model=seedance`
- 在 query 参数中包含 `image=...`（一个或多个 URL）
- 默认在 query 参数中包含 `nologo=true`
- 在直连模式下在 query 参数中包含 `key=...`（必需）
- 在直连模式下默认包含隐藏 feed 参数 `private=true` 和 `nofeed=true`

**验证: 需求 1.6, 1.7, 2.1, 2.2, 2.5, 2.6, 2.7, 4.4, 4.5**

### 属性 4: 宽高比验证

*对于* 提供给视频生成的任何 ratio/aspect 值，该值应为供应商配置中定义的 supportedAspectRatios 之一，如果无效则默认为 defaultAspectRatio。

**验证: 需求 2.4, 4.7**

### 属性 5: 结果结构一致性

*对于* 任何视频生成调用，无论供应商或结果如何，返回的对象应具有结构 `{ success: boolean, video?: GeneratedVideo, error?: string }`，其中 success=true 意味着 video 已定义，success=false 意味着 error 已定义。

**验证: 需求 3.3**

### 属性 6: HTTP 错误映射

*对于* 来自视频 API 的任何 HTTP 错误响应（4xx 或 5xx），Video_Service 应返回 `{ success: false, error: string }`，其中 error 字符串包含关于失败的有意义信息。

**验证: 需求 5.1, 5.2, 5.3, 5.4**

### 属性 7: Content-Type 验证

*对于* 任何 content-type 不以 "video/" 开头的 API 响应，Video_Service 应返回 `{ success: false, error: string }` 指示意外的响应格式。

**验证: 需求 5.5**

## 错误处理

### 错误分类

| 错误类型 | HTTP 状态码 | 错误消息 | 恢复操作 |
|---------|------------|---------|---------|
| 输入无效 | 400 | "请求参数无效" | 检查 prompt/imageUrl |
| 鉴权失败 | 401 | "鉴权失败" | 检查 API key |
| 速率限制 | 429 | "已达速率限制，请稍后重试" | 等待并重试 |
| 服务器错误 | 500 | "服务器错误，请重试" | 带退避重试 |
| 响应无效 | N/A | "意外的响应格式" | 报告 bug |
| 网络错误 | N/A | "网络错误" | 检查连接 |

### 错误响应结构

```typescript
interface VideoErrorResult {
  success: false;
  error: string;
  details?: {
    httpStatus?: number;
    contentType?: string;
    rawError?: string;
  };
}
```

## 测试策略

### 单元测试

1. **配置测试**
   - 验证所有供应商配置具有必需字段
   - 验证默认供应商选择
   - 验证环境变量覆盖

2. **URL 构造测试**
   - 测试各种 prompt 的 Pollinations URL 格式
   - 测试参数编码（特殊字符、unicode）
   - 测试图片 URL 包含

3. **参数归一化测试**
   - 测试边界处的 duration 限制
   - 测试宽高比验证
   - 测试默认值应用

### 属性测试

使用 `fast-check` 库进行属性测试：

1. **属性 1**: 生成随机 provider id，验证配置完整性
2. **属性 2**: 生成随机 duration 值（-100 到 100），验证归一化逻辑
3. **属性 3**: 生成随机 prompt 和 imageUrl，验证 URL 构造
4. **属性 4**: 生成随机 aspectRatio 字符串，验证验证逻辑
5. **属性 5**: 模拟各种 API 响应，验证结果结构
6. **属性 6**: 生成随机 HTTP 错误码，验证错误映射
7. **属性 7**: 生成随机 content-type，验证验证逻辑

### 集成测试

1. **端到端流程**
   - Mock Pollinations API 响应
   - 验证完整的视频生成流程
   - 验证 IndexedDB 存储

2. **供应商切换**
   - 验证切换供应商后行为一致
   - 验证配置热切换（如果支持）
