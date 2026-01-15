# 实现计划: 视频供应商 Pollinations

## 概述

本实现计划将"用户侧视频生成（导演阶段）"重构为可配置的多供应商架构：保留现有默认供应商（`runcomfy`），并新增 `pollinations` 作为可选供应商，让用户侧也能体验 Pollinations 生成视频。

## 任务列表

- [x] 1. 创建视频供应商配置系统
  - [x] 1.1 创建 `src/config/videoProviders.ts` 配置文件
    - 定义 `VideoProvider` 类型和 `VideoProviderConfig` 接口
    - 实现 `RUNCOMFY_VIDEO_CONFIG` 配置（现有默认供应商）
    - 实现 `POLLINATIONS_VIDEO_CONFIG` 配置（新增）
    - 导出 `VIDEO_PROVIDERS` 配置映射
    - 实现 `getCurrentVideoProviderConfig()` 和 `getVideoProviderConfig()` 函数
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.2 编写配置完整性属性测试
    - **属性 1: 供应商配置完整性**
    - **验证: 需求 1.1, 1.5, 1.6**

- [x] 2. 重构 directorService.ts 支持多供应商
  - [x] 2.1 添加供应商选择逻辑
    - 导入视频供应商配置
    - 在 `generateShotVideo` / `generateAllVideos` 中根据配置选择供应商
    - 实现参数归一化函数（duration 限制, ratio/aspect 自动映射, pollinations 忽略 resolution）
    - _需求: 3.1, 3.2, 4.2, 4.3, 4.7, 4.8_

  - [ ]* 2.2 编写参数归一化属性测试
    - **属性 2: 时长归一化**
    - **验证: 需求 2.3, 4.2, 4.3**

  - [x] 2.3 实现 pollinations 调用逻辑
    - 创建 `generateWithPollinations` 内部函数
    - 实现 URL 构造逻辑（prompt 编码到 path，多图拼接到 `image` query）
    - 鉴权：必须配置 key；通过 query param `key=...` 传递；未配置直接失败（不发请求）
    - 添加 `nologo=true`、`private=true`、`nofeed=true`（通过配置开关控制，默认开启）
    - 处理 API 响应和错误（前端直连，不通过 Vercel Function 代理转发视频）
    - _需求: 2.1, 2.2, 2.5, 2.6, 2.10, 4.4, 4.5_

  - [ ]* 2.4 编写 URL 构造属性测试
    - **属性 3: Pollinations URL 构造**
    - **验证: 需求 1.6, 1.7, 2.1, 2.2, 2.5, 2.6, 2.7, 4.4, 4.5**

  - [ ]* 2.5 编写宽高比验证属性测试
    - **属性 4: 宽高比验证**
    - **验证: 需求 2.4, 4.7**

- [x] 3. 检查点 - 确保配置和核心逻辑测试通过
  - 运行所有属性测试，确保通过
  - 如有问题，询问用户

- [x] 4. 实现响应处理和错误处理
  - [x] 4.1 统一响应处理逻辑
    - 确保两个供应商返回相同的"导演阶段视频结果"结构（`GenerateSingleVideoResult` / `GenerateAllVideosResult`）
    - Pollinations：实现 `video/*` 的 content-type 验证 + blob 转 base64 + IndexedDB 存储
    - RunComfy：保存 `videoUrl` 到资产（cloudUrl）
    - _需求: 2.8, 3.3, 5.5_

  - [ ]* 4.2 编写结果结构一致性属性测试
    - **属性 5: 结果结构一致性**
    - **验证: 需求 3.3**

  - [x] 4.3 实现错误处理逻辑
    - 处理 HTTP 400/401/429/500 错误
    - 处理非 `video/*` content-type 错误
    - 添加详细日志记录
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 4.4 编写 HTTP 错误映射属性测试
    - **属性 6: HTTP 错误映射**
    - **验证: 需求 5.1, 5.2, 5.3, 5.4**

  - [ ]* 4.5 编写 Content-Type 验证属性测试
    - **属性 7: Content-Type 验证**
    - **验证: 需求 5.5**

- [x] 5. 更新环境变量配置
  - [x] 5.1 更新 `.env.example` 添加 `VITE_VIDEO_PROVIDER` 说明
    - 添加注释说明可选值：`runcomfy` | `pollinations`
    - 说明默认值为 `runcomfy`
    - _需求: 1.3, 1.4_

- [x] 6. 最终检查点 - 确保所有测试通过
  - 运行完整测试套件
  - 验证供应商切换功能
  - 如有问题，询问用户

## 备注

- 标记 `*` 的任务为可选，可跳过以加快 MVP 进度
- 属性测试使用 `fast-check` 库
- 测试文件位置：`src/services/__tests__/videoService.test.ts` 或 `src/config/__tests__/videoProviders.test.ts`
- 导演阶段使用 `generateAllVideos` 串行生成（当前代码在成功后仅等待 500ms）；切到 Pollinations 时建议按 Provider_Config 默认 180s 执行，并将间隔做成可配置
