# Security Policy

## Supported Scope

当前仓库主分支（`main`）为维护范围。

## Reporting a Vulnerability

请不要在公开 issue 中提交漏洞细节。  
请通过私密渠道联系维护者，并附上：

1. 漏洞类型与影响范围
2. 复现步骤
3. 受影响文件/接口
4. 修复建议（如有）

## Secrets Management Rules

1. 严禁提交任何真实密钥、Token、Cookie、凭证。
2. 所有密钥必须通过环境变量注入。
3. 前端只能使用可公开的 publishable key（如 `VITE_POLLINATIONS_API_KEY`）。
4. 服务端密钥（如 `POLLINATIONS_API_KEY`、`RUNCOMFY_API_TOKEN`、`IMGBB_API_KEY`）只能在服务端使用。
5. 提交前执行 `pnpm security:scan`。

## Privacy Notes

本项目会将用户输入/媒体发送给第三方 AI 服务（如 Pollinations、RunComfy、imgbb）完成生成流程。  
请确保你的产品隐私政策明确告知用户数据流向、存储时长与删除策略。

## Incident Response (Key Leak)

如果发现密钥泄露，按以下顺序处理：

1. 立即在第三方平台吊销并重建密钥
2. 更新 Vercel 环境变量
3. 重新部署
4. 审查最近提交与日志
5. 记录事件与修复动作
