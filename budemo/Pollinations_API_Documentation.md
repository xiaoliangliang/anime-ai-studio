# Pollinations.AI API 接口文档

> 最后更新：2025年12月10日
>
> 本文档整理自 Pollinations.AI 官方文档，供开发参考使用。

---

## 目录

1. [概述](#概述)
2. [认证与访问层级](#认证与访问层级)
3. [图像生成 API](#图像生成-api)
4. [视频生成 API](#视频生成-api)
5. [文本生成 API](#文本生成-api)
6. [音频生成 API](#音频生成-api)
7. [视觉与多模态 API](#视觉与多模态-api)
8. [Function Calling（函数调用）](#function-calling函数调用)
9. [实时 Feed](#实时-feed)
10. [React 集成](#react-集成)
11. [最佳实践](#最佳实践)

---

## 概述

Pollinations.AI 是一个开放的生成式 AI 平台，提供以下核心能力：

- **图像生成**：文本转图像、图像转图像
- **视频生成**：文本转视频、图像转视频
- **文本生成**：对话、问答、创意写作（OpenAI 兼容格式）
- **音频生成**：文本转语音（TTS）、语音转文本（STT）
- **多模态**：图像理解、视觉问答

### 基础 URL

| 服务类型 | 基础 URL |
|---------|---------|
| 图像生成 | `https://image.pollinations.ai` 或 `https://gen.pollinations.ai/image` |
| 文本生成 | `https://text.pollinations.ai` 或 `https://gen.pollinations.ai/text` |
| 统一网关 | `https://gen.pollinations.ai` |

### API Key 获取

在 [https://enter.pollinations.ai](https://enter.pollinations.ai) 注册获取 API Key。

---

## 认证与访问层级

### 认证方式

#### 1. Bearer Token（推荐用于后端）

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}'
```

#### 2. Query 参数

```
https://gen.pollinations.ai/text/hello?key=YOUR_API_KEY
```

#### 3. Referrer（Web 应用）

浏览器会自动发送 referrer header，适合前端应用。

### Key 类型

| Key 类型 | 前缀 | 用途 | 限制 |
|---------|------|------|------|
| Publishable Keys | `pk_` | 客户端安全，可暴露在前端 | IP 限流（3次/burst，每15秒恢复1次） |
| Secret Keys | `sk_` | 仅服务端使用 | 无限流，可消费 Pollen |

### 访问层级

| 层级 | 速率限制 | 可用模型 | 获取方式 |
|-----|---------|---------|---------|
| Anonymous | 每15秒1次请求 | 基础模型 | 无需注册 |
| Seed | 每5秒1次请求 | 标准模型 | 免费注册 |
| Flower | 每3秒1次请求 | 高级模型 | 付费层级 |
| Nectar | 无限制 | 全部模型 | 企业级 |

---

## 图像生成 API

### 生成图像

**端点**: `GET /image/{prompt}` 或 `GET https://image.pollinations.ai/prompt/{prompt}`

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|------|-------|------|
| prompt | string | 是 | - | 图像描述（URL编码） |
| model | string | 否 | flux | 模型名称 |
| width | integer | 否 | 1024 | 图像宽度（像素） |
| height | integer | 否 | 1024 | 图像高度（像素） |
| seed | integer | 否 | 42 | 随机种子（相同种子生成相同图像） |
| enhance | boolean | 否 | false | AI 优化 prompt |
| negative_prompt | string | 否 | "worst quality, blurry" | 负面提示词 |
| private | boolean | 否 | false | 不公开到 feed |
| nologo | boolean | 否 | false | 移除水印（需账号） |
| nofeed | boolean | 否 | false | 不添加到公开 feed |
| safe | boolean | 否 | false | 启用安全内容过滤 |
| quality | string | 否 | medium | 图像质量：low/medium/high/hd |
| transparent | boolean | 否 | false | 透明背景 |
| guidance_scale | number | 否 | - | Prompt 引导强度（1-20） |
| image | string | 否 | - | 参考图片URL（用于图生图） |

#### 可用图像模型

| 模型名称 | 说明 |
|---------|------|
| flux | 默认模型，高质量 |
| turbo | 快速生成 |
| gptimage | GPT 图像模型 |
| kontext | 图生图模型 |
| seedream | Seedream 模型 |
| seedream-pro | Seedream Pro 模型 |
| nanobanana | NanoBanana 模型 |
| nanobanana-pro | NanoBanana Pro 模型 |

#### 示例

**简单请求**:
```bash
curl -o sunset.jpg "https://image.pollinations.ai/prompt/beautiful%20sunset%20over%20ocean"
```

**带参数请求**:
```bash
curl -o city.jpg "https://image.pollinations.ai/prompt/cyberpunk%20city?width=1920&height=1080&seed=42&model=flux"
```

**Python 示例**:
```python
import requests
from urllib.parse import quote

prompt = "A serene mountain landscape at sunrise"
url = f"https://image.pollinations.ai/prompt/{quote(prompt)}"
params = {"width": 1280, "height": 720, "model": "flux"}

response = requests.get(url, params=params, timeout=60)
with open("mountain.jpg", "wb") as f:
    f.write(response.content)
```

**JavaScript 示例**:
```javascript
const fetch = require('node-fetch');
const fs = require('fs');

const prompt = "A futuristic city with flying cars";
const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&model=flux`;

fetch(url)
    .then(response => response.buffer())
    .then(buffer => fs.writeFileSync('city.jpg', buffer));
```

### 图生图（Image-to-Image）

使用 `kontext` 模型进行图像转换。

**端点**: `GET /image/{prompt}?model=kontext&image={image_url}`

```bash
curl -o transformed.png "https://image.pollinations.ai/prompt/turn_into_watercolor?model=kontext&image=https://example.com/photo.jpg"
```

### 获取可用模型列表

**端点**: `GET /image/models` 或 `GET https://image.pollinations.ai/models`

```bash
curl https://gen.pollinations.ai/image/models
```

**响应示例**:
```json
[
  {
    "name": "flux",
    "aliases": ["flux-default"],
    "description": "High quality image generation",
    "pricing": {
      "image_price": 1,
      "currency": "pollen"
    }
  }
]
```

---

## 视频生成 API

### 生成视频

**端点**: `GET /image/{prompt}` （使用视频模型）

#### 视频模型

| 模型 | 类型 | 时长 | 说明 |
|-----|------|------|------|
| veo | 文本转视频 | 4-8秒 | Google Veo 模型 |
| seedance | 文本/图像转视频 | 2-10秒 | Seedance 模型 |
| seedance-pro | 文本/图像转视频 | 2-10秒 | Seedance Pro 模型 |

#### 视频参数

| 参数 | 类型 | 说明 |
|-----|------|------|
| duration | integer | 视频时长（秒）。veo: 4/6/8，seedance: 2-10 |
| aspectRatio | string | 宽高比：16:9 或 9:16 |
| audio | boolean | 启用音频（仅 veo） |
| image | string | 参考图片 URL（用于图生视频） |

**示例**:
```bash
curl -o video.mp4 "https://image.pollinations.ai/prompt/a%20cat%20playing?model=veo&duration=6&aspectRatio=16:9"
```

---

## 文本生成 API

### 简单文本生成

**端点**: `GET /text/{prompt}` 或 `GET https://text.pollinations.ai/{prompt}`

#### 请求参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| prompt | string | - | 提示词（必填） |
| model | string | openai | 模型名称 |
| seed | integer | random | 随机种子 |
| system | string | - | 系统提示词 |
| json | boolean | false | 返回 JSON 格式 |
| temperature | number | - | 创意度（0.0-2.0） |
| stream | boolean | false | 流式响应 |
| private | boolean | false | 不公开 |

#### 可用文本模型

| 模型 | 别名 | 说明 |
|-----|------|------|
| openai | gpt-5-mini | 默认 OpenAI 模型 |
| openai-fast | gpt-5-nano | 快速版本 |
| openai-large | - | 大模型版本 |
| openai-reasoning | o4-mini | 推理模型 |
| qwen-coder | - | Qwen 编程模型 |
| mistral | - | Mistral 模型 |
| gemini-search | - | Gemini 搜索模型 |
| claude-hybridspace | - | Claude 模型 |

**简单示例**:
```bash
curl "https://text.pollinations.ai/What%20is%20AI?"
```

**带参数示例**:
```bash
curl "https://text.pollinations.ai/Write%20a%20haiku?model=mistral&temperature=1.5"
```

### OpenAI 兼容接口（高级）

**端点**: `POST /v1/chat/completions` 或 `POST https://text.pollinations.ai/openai`

#### 请求体

```json
{
  "model": "openai",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false,
  "reasoning_effort": "medium"
}
```

#### 参数说明

| 参数 | 类型 | 说明 |
|-----|------|------|
| model | string | 模型名称（必填） |
| messages | array | 对话消息数组（必填） |
| temperature | number | 创意度（0.0-2.0） |
| max_tokens | integer | 最大输出 token 数 |
| stream | boolean | 流式响应 |
| top_p | number | nucleus sampling |
| frequency_penalty | number | 频率惩罚（-2到2） |
| presence_penalty | number | 存在惩罚（-2到2） |
| stop | string/array | 停止序列 |
| tools | array | 函数定义（用于 function calling） |
| tool_choice | string | 工具选择策略 |
| reasoning_effort | string | 推理深度：minimal/low/medium/high |
| response_format | object | 响应格式（如 JSON） |

#### Messages 格式

```json
{
  "role": "user|assistant|system|tool",
  "content": "消息内容"
}
```

#### 推理深度控制

| 级别 | 说明 | 适用场景 |
|-----|------|---------|
| minimal | 快速简单回答 | 数据提取、格式化 |
| low | 轻度推理 | 简单问答 |
| medium | 平衡思考（默认） | 通用任务 |
| high | 深度分析 | 复杂规划、多步骤任务 |

**Python 示例**:
```python
import requests

payload = {
    "model": "openai",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Tell me a joke."}
    ],
    "temperature": 1.0,
    "max_tokens": 100
}

response = requests.post(
    "https://gen.pollinations.ai/v1/chat/completions",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

**流式响应示例**:
```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai", "messages": [{"role": "user", "content": "Write a poem"}], "stream": true}' \
  --no-buffer
```

### 获取文本模型列表

**端点**: `GET /v1/models` 或 `GET /text/models`

```bash
curl https://gen.pollinations.ai/v1/models
```

**响应示例**:
```json
[
  {
    "name": "openai",
    "description": "GPT-5-mini model",
    "tier": "anonymous",
    "input_modalities": ["text"],
    "output_modalities": ["text"],
    "tools": true,
    "vision": true,
    "reasoning": true
  }
]
```

---

## 音频生成 API

### 文本转语音（TTS）

**端点**: `GET /text/{prompt}?model=openai-audio&voice={voice}`

#### 可用语音

| 语音 | 风格 |
|-----|------|
| alloy | 中性、专业 |
| echo | 深沉、共鸣 |
| fable | 讲故事风格 |
| onyx | 温暖、丰富 |
| nova | 明亮、友好 |
| shimmer | 柔和、旋律 |

**示例**:
```bash
curl -o speech.mp3 "https://text.pollinations.ai/Hello%20world?model=openai-audio&voice=nova"
```

**Python 示例**:
```python
import requests
from urllib.parse import quote

text = "Welcome to Pollinations AI!"
url = f"https://text.pollinations.ai/{quote(text)}"
params = {"model": "openai-audio", "voice": "alloy"}

response = requests.get(url, params=params)
with open("speech.mp3", "wb") as f:
    f.write(response.content)
```

### 语音转文本（STT）

**端点**: `POST /v1/chat/completions` 或 `POST https://text.pollinations.ai/openai`

```python
import requests
import base64

# 读取音频文件
with open("audio.wav", "rb") as f:
    audio_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai-audio",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Transcribe this audio:"},
            {
                "type": "input_audio",
                "input_audio": {
                    "data": audio_data,
                    "format": "wav"
                }
            }
        ]
    }]
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

---

## 视觉与多模态 API

### 支持的视觉模型

- **openai**: 标准视觉能力
- **openai-large**: 更强大的复杂图像处理
- **claude-hybridspace**: 替代视觉模型

### 图像分析

#### 通过 URL 分析图像

```python
import requests

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {
                "type": "image_url",
                "image_url": {"url": "https://example.com/image.jpg"}
            }
        ]
    }],
    "max_tokens": 500
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

#### 通过 Base64 分析图像

```python
import requests
import base64

with open("image.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

payload = {
    "model": "openai",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{image_data}"
                }
            }
        ]
    }]
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
)
print(response.json()['choices'][0]['message']['content'])
```

---

## Function Calling（函数调用）

支持让 AI 调用外部函数获取信息。

### 定义工具

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and state, e.g. Beijing, China"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"]
                }
            },
            "required": ["location"]
        }
    }
}]
```

### 完整示例

```python
import requests
import json

# 第一步：发送请求
payload = {
    "model": "openai",
    "messages": [{"role": "user", "content": "What's the weather in Tokyo?"}],
    "tools": tools,
    "tool_choice": "auto"
}

response = requests.post(
    "https://text.pollinations.ai/openai",
    json=payload
).json()

# 第二步：处理函数调用
if response['choices'][0]['message'].get('tool_calls'):
    tool_call = response['choices'][0]['message']['tool_calls'][0]

    # 模拟获取天气数据
    weather_data = '{"temperature": 20, "condition": "sunny", "unit": "celsius"}'

    # 第三步：返回函数结果
    messages = [
        {"role": "user", "content": "What's the weather in Tokyo?"},
        response['choices'][0]['message'],
        {
            "role": "tool",
            "tool_call_id": tool_call['id'],
            "content": weather_data
        }
    ]

    final_response = requests.post(
        "https://text.pollinations.ai/openai",
        json={"model": "openai", "messages": messages}
    )
    print(final_response.json()['choices'][0]['message']['content'])
```

---

## 实时 Feed

### 图像 Feed

**端点**: `GET https://image.pollinations.ai/feed`

```python
import sseclient
import requests
import json

response = requests.get(
    "https://image.pollinations.ai/feed",
    stream=True,
    headers={"Accept": "text/event-stream"}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"New image: {data['prompt']}")
    print(f"URL: {data['imageURL']}")
```

### 文本 Feed

**端点**: `GET https://text.pollinations.ai/feed`

```python
import sseclient
import requests
import json

response = requests.get(
    "https://text.pollinations.ai/feed",
    stream=True,
    headers={"Accept": "text/event-stream"}
)

client = sseclient.SSEClient(response)
for event in client.events():
    data = json.loads(event.data)
    print(f"Model: {data['model']}")
    print(f"Response: {data['response'][:100]}...")
```

---

## React 集成

### 安装

```bash
npm install @pollinations/react
```

### 图像生成 Hook

```javascript
import { usePollinationsImage } from '@pollinations/react';

function ImageGenerator() {
    const imageUrl = usePollinationsImage('sunset over mountains', {
        width: 1024,
        height: 1024,
        model: 'flux'
    });

    return imageUrl ? <img src={imageUrl} alt="Generated" /> : <p>Loading...</p>;
}
```

### 文本生成 Hook

```javascript
import { usePollinationsText } from '@pollinations/react';

function TextGenerator() {
    const text = usePollinationsText('Write a haiku about AI', {
        model: 'openai',
        seed: 42
    });

    return text ? <p>{text}</p> : <p>Loading...</p>;
}
```

### 聊天 Hook

```javascript
import { usePollinationsChat } from '@pollinations/react';

function ChatBot() {
    const { messages, sendUserMessage } = usePollinationsChat(
        [{ role: 'system', content: 'You are a helpful assistant' }],
        { model: 'openai' }
    );

    return (
        <div>
            {messages.map((msg, i) => (
                <div key={i}>
                    <strong>{msg.role}:</strong> {msg.content}
                </div>
            ))}
            <button onClick={() => sendUserMessage({
                role: 'user',
                content: 'Tell me a fun fact!'
            })}>
                Send
            </button>
        </div>
    );
}
```

**在线演示**: [react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)

---

## 最佳实践

### 安全性

- **保护 Token**：不要在前端代码中暴露 Secret Key (`sk_`)
- **使用 Publishable Key**：前端应用使用 `pk_` 前缀的 key
- **Referrer 认证**：Web 应用可使用 referrer 方式认证

### 性能优化

- **使用 seed**：设置固定 seed 获得一致的结果
- **流式响应**：长文本使用 `stream=true` 提升用户体验
- **缓存结果**：对相同请求缓存响应，减少 API 调用
- **合理设置 max_tokens**：避免不必要的长响应

### 速率限制

- **遵守限制**：匿名用户每15秒1次请求
- **智能重试**：遇到限流时使用指数退避重试
- **注册账号**：获取更高的速率限制

### 错误处理

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 429 | 速率限制 |
| 500 | 服务器错误 |

---

## 资源链接

- **官方文档**: [https://enter.pollinations.ai/api/docs](https://enter.pollinations.ai/api/docs)
- **GitHub**: [https://github.com/pollinations/pollinations](https://github.com/pollinations/pollinations)
- **认证注册**: [https://enter.pollinations.ai](https://enter.pollinations.ai)
- **React Playground**: [https://react-hooks.pollinations.ai](https://react-hooks.pollinations.ai)

---

## 许可证

MIT License - 可自由使用、修改和分享。
