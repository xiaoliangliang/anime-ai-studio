# AI Canvas - tldraw + Pollinations

一个基于 tldraw 的 AI 图片生成画布应用,集成了 Pollinations API。

## 功能特性

- 📤 **图片上传**: 上传本地图片到画布
- ✨ **AI 生成**: 输入提示词,使用 Pollinations API 生成图片
- 🎨 **画布编辑**: 基于 tldraw 的完整画布功能
  - 绘制形状
  - 添加文本
  - 自由绘画
  - 图片操作(缩放、旋转、移动)

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **tldraw** - 画布引擎
- **Vite** - 构建工具
- **Pollinations API** - AI 图片生成

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 构建生产版本

```bash
npm run build
```

## 使用指南

### 上传图片

1. 点击左上角的 "📤 上传图片" 按钮
2. 选择本地图片文件
3. 图片会自动添加到画布中心

### AI 生成图片

1. 在输入框中输入提示词(例如: "一只可爱的猫咪")
2. 点击 "✨ 生成图片" 按钮或按回车键
3. 等待生成完成,图片会自动添加到画布上

### 画布操作

- **选择工具**: 点击左侧工具栏选择不同工具
- **移动图片**: 选中图片后拖拽移动
- **缩放图片**: 拖拽图片角落调整大小
- **旋转图片**: 拖拽旋转手柄
- **删除**: 选中元素后按 Delete 键

## API 配置

项目使用 Pollinations API,API Key 已配置在 `src/services/pollinations.ts` 中。

如需更改配置,请修改该文件中的 `API_KEY` 常量。

## 项目结构

```
budemo/
├── src/
│   ├── services/
│   │   └── pollinations.ts    # Pollinations API 服务
│   ├── App.tsx                # 主应用组件
│   ├── App.css                # 样式文件
│   └── main.tsx               # 入口文件
├── index.html                 # HTML 模板
├── vite.config.ts             # Vite 配置
├── tsconfig.json              # TypeScript 配置
└── package.json               # 项目依赖
```

## License

MIT
