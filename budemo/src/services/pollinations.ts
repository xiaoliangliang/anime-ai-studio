// Pollinations API 服务

const API_KEY = 'plln_pk_7Tqtux7EhEq450ERY8M8QEDVfaqjO6Lo';
const IMAGE_API_BASE = 'https://image.pollinations.ai/prompt';

export interface ImageGenerationOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  enhance?: boolean;
  nologo?: boolean;
}

// 支持图生图的模型列表
export type Img2ImgModel = 'kontext' | 'seedream' | 'seedream-pro' | 'gptimage' | 'nanobanana' | 'nanobanana-pro';

// 质量等级
export type ImageQuality = 'low' | 'medium' | 'high' | 'hd';

// 质量选项
export const IMAGE_QUALITY_OPTIONS: { id: ImageQuality; name: string; description: string }[] = [
  { id: 'low', name: '低', description: '快速生成，较低质量' },
  { id: 'medium', name: '中', description: '平衡速度和质量（默认）' },
  { id: 'high', name: '高', description: '高质量，较慢' },
  { id: 'hd', name: 'HD', description: '最高质量，最慢' },
];

// 模型信息
export const IMG2IMG_MODELS: { id: Img2ImgModel; name: string; description: string; supportsMultiImage: boolean; price: string }[] = [
  { id: 'kontext', name: 'Kontext', description: '上下文感知图像生成，适合风格迁移', supportsMultiImage: true, price: '0.04/张' },
  { id: 'seedream', name: 'Seedream 4.0', description: 'ByteDance ARK，高质量图像', supportsMultiImage: true, price: '0.03/张' },
  { id: 'seedream-pro', name: 'Seedream 4.5 Pro', description: '4K输出，支持14张参考图，最强多图合成', supportsMultiImage: true, price: '0.04/张' },
  { id: 'gptimage', name: 'GPT Image', description: 'OpenAI图像生成', supportsMultiImage: true, price: '较便宜' },
  { id: 'nanobanana', name: 'NanoBanana', description: 'Gemini 2.5 Flash', supportsMultiImage: true, price: '0.00003/张' },
  { id: 'nanobanana-pro', name: 'NanoBanana Pro', description: 'Gemini 3 Pro，4K+思考', supportsMultiImage: true, price: '0.00012/张' },
];

export interface ImageToImageOptions {
  prompt: string;
  imageUrls: string[];  // 参考图片URL数组，支持多图
  model?: Img2ImgModel;  // 图生图模型
  width?: number;
  height?: number;
  seed?: number;
  enhance?: boolean;
  nologo?: boolean;
  // 新增参数
  negativePrompt?: string;  // 负面提示词，避免生成什么
  quality?: ImageQuality;   // 质量等级
  guidanceScale?: number;   // 提示词遵循度 (1-20)
  safe?: boolean;           // 安全内容过滤
  transparent?: boolean;    // 透明背景
}

export interface ImageToVideoOptions {
  prompt: string;
  imageUrl: string;  // 参考图片的URL
  duration?: number; // 视频时长，2-10秒
  aspectRatio?: '16:9' | '9:16'; // 宽高比
  seed?: number;
  model?: 'seedance' | 'seedance-pro'; // 视频模型
  nologo?: boolean;
}

/**
 * 生成图片并返回 Blob URL
 */
export async function generateImage(options: ImageGenerationOptions): Promise<string> {
  const {
    prompt,
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 1000000),
    model = 'zimage',
    enhance = true,
    nologo = true,
  } = options;

  // 构建 URL 参数（包含 API key）
  const params = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    seed: seed.toString(),
    model,
    enhance: enhance.toString(),
    nologo: nologo.toString(),
    key: API_KEY, // 使用 query 参数方式传递 API key（避免 CORS 问题）
  });

  const url = `${IMAGE_API_BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    // 将 blob 转换为 data URL（tldraw 不支持 blob: 协议）
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('图片生成失败:', error);
    throw error;
  }
}

/**
 * 将文件转换为 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 将任意图片 URL 转换为 Data URL
 * 支持: data URL, blob URL, http/https URL
 */
export async function convertToDataUrl(imageUrl: string): Promise<string> {
  console.log('convertToDataUrl - 输入 URL 类型:', imageUrl.substring(0, 100));

  // 如果已经是 data URL，验证是否为图片格式
  if (imageUrl.startsWith('data:')) {
    // 检查是否为图片 data URL
    if (imageUrl.startsWith('data:image/')) {
      console.log('已经是图片 data URL，直接返回');
      return imageUrl;
    } else {
      // 如果是其他类型的 data URL（如 text/html），说明有问题
      const typeMatch = imageUrl.match(/^data:([^;]+)/);
      const detectedType = typeMatch ? typeMatch[1] : '未知';
      throw new Error(`URL 类型错误: 期望 data:image/*, 实际是 ${detectedType}`);
    }
  }

  try {
    // 对于 blob URL 或 http/https URL，都通过 fetch 获取
    console.log('正在通过 fetch 获取图片...');
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status} ${response.statusText}`);
    }

    // 检查响应的 Content-Type
    const contentType = response.headers.get('content-type') || '';
    console.log('响应 Content-Type:', contentType);

    if (!contentType.startsWith('image/')) {
      throw new Error(`响应不是图片格式: ${contentType}`);
    }

    const blob = await response.blob();
    console.log('Blob 大小:', blob.size, 'bytes, 类型:', blob.type);

    // 将 blob 转换为 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        console.log('转换完成，data URL 前缀:', result.substring(0, 50));
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('转换图片 URL 失败:', error);
    throw new Error(`无法转换图片 URL: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 上传图片到免费图床 (imgbb)
 * 返回公开的图片 URL
 */
export async function uploadImageToHost(dataUrl: string): Promise<string> {
  // ⚠️ 需要配置 imgbb API Key 才能使用图生图功能
  // 获取免费 API Key: https://api.imgbb.com/
  // 1. 访问 https://api.imgbb.com/
  // 2. 登录或注册账号
  // 3. 复制 API Key 并替换下面的值
  const IMGBB_API_KEY = '416bd0e1247069324458a42ccd408ae4'; // 👈 请在此处填入您的 imgbb API Key

  if (!IMGBB_API_KEY) {
    throw new Error(
      '未配置 imgbb API Key!\n' +
      '请访问 https://api.imgbb.com/ 获取免费 API Key,\n' +
      '然后在 src/services/pollinations.ts 中配置 IMGBB_API_KEY'
    );
  }

  try {
    // 打印接收到的URL用于调试
    console.log('接收到的图片URL前100个字符:', dataUrl.substring(0, 100));
    console.log('URL类型:', dataUrl.startsWith('data:') ? 'data URL' : dataUrl.startsWith('blob:') ? 'blob URL' : dataUrl.startsWith('http') ? 'http URL' : '未知类型');

    // 验证 data URL 格式
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error(`无效的图片格式。需要 data URL,但收到的是: ${dataUrl.substring(0, 50)}...`);
    }

    // 提取 MIME 类型和 base64 数据
    const matches = dataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('无法解析 data URL 格式');
    }

    const [, imageType, base64Data] = matches;
    console.log(`图片格式: ${imageType}`);

    // 验证图片格式(imgbb 支持 png, jpg, jpeg, gif, bmp, webp)
    const supportedFormats = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    if (!supportedFormats.includes(imageType.toLowerCase())) {
      throw new Error(`不支持的图片格式: ${imageType}。支持的格式: ${supportedFormats.join(', ')}`);
    }

    // 检查 base64 数据是否有效
    if (!base64Data || base64Data.length < 100) {
      throw new Error('图片数据无效或太小');
    }

    // 检查图片大小(imgbb 限制 32MB)
    const sizeInBytes = (base64Data.length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    console.log(`图片大小: ${sizeInMB.toFixed(2)} MB`);

    if (sizeInMB > 32) {
      throw new Error('图片太大,超过 32MB 限制');
    }

    // 创建 FormData (只包含图片数据,key 作为 URL 参数)
    const formData = new FormData();
    formData.append('image', base64Data);

    // 使用服务端代理上传到 imgbb
    const response = await fetch('http://localhost:3001/api/imgbb/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `image=${encodeURIComponent(base64Data)}`,
    });

    // 解析响应
    const result = await response.json();
    console.log('imgbb 响应:', result);

    if (!response.ok) {
      const errorMsg = result.error?.message || `HTTP ${response.status} ${response.statusText}`;
      throw new Error(`图床上传失败: ${errorMsg}\n提示: 请检查 API Key 是否有效或图片格式是否正确`);
    }

    if (result.success && result.data && result.data.url) {
      const imageUrl = result.data.url;
      console.log('图片上传成功,URL:', imageUrl);
      return imageUrl;
    }

    throw new Error(`图床上传失败: ${result.error?.message || '未知错误'}`);
  } catch (error) {
    console.error('上传图片到图床失败:', error);
    throw error;
  }
}

/**
 * 图生图功能 - 基于参考图片生成新图片
 *
 * 使用服务端代理调用 Pollinations API，避免前端速率限制
 * 支持多图输入: 将多个图片URL用逗号拼接传递给API
 *
 * 多图使用示例 (seedream-pro):
 * - 人物替换: prompt="Replace the subject in Image 1 with the subject from Image 2"
 * - 换装: prompt="Dress the character in Image 1 with the outfit from Image 2"
 * - 风格迁移: prompt="Apply the style of Image 2 to Image 1"
 */
export async function generateImageToImage(options: ImageToImageOptions): Promise<string> {
  const {
    prompt,
    imageUrls,  // 现在是数组
    model = 'seedream-pro',  // 默认使用最强的多图模型
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 1000000),
    enhance = false,
    nologo = true,
    // 新增参数
    negativePrompt,
    quality = 'medium',
    guidanceScale,
    safe = false,
    transparent = false,
  } = options;

  // 将多个图片URL用逗号拼接
  const imageUrlString = imageUrls.join(',');

  // 使用服务端代理
  const params = new URLSearchParams({
    prompt: prompt,
    imageUrl: imageUrlString,  // 多图用逗号分隔
    model: model,
    width: width.toString(),
    height: height.toString(),
    seed: seed.toString(),
    enhance: enhance.toString(),
    nologo: nologo.toString(),
    quality: quality,
    safe: safe.toString(),
    transparent: transparent.toString(),
  });

  // 可选参数 - 只有设置了才传递
  if (negativePrompt) {
    params.set('negativePrompt', negativePrompt);
  }
  if (guidanceScale !== undefined) {
    params.set('guidanceScale', guidanceScale.toString());
  }

  const url = `http://localhost:3001/api/img2img?${params.toString()}`;

  console.log('图生图请求 URL:', url);

  try {
    // 图生图可能需要更长时间，设置 5 分钟超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('响应状态:', response.status, response.statusText);
    console.log('响应 Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      // 获取更详细的错误信息
      const errorText = await response.text().catch(() => '无法获取错误详情');
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n详情: ${errorText}`);
    }

    // 检查响应是否为图片
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      // 如果不是图片，读取内容查看错误信息
      const errorText = await response.text();
      console.error('API 返回了非图片内容:', errorText.substring(0, 500));
      throw new Error(`API 返回了非图片内容 (${contentType})。可能是 API 调用失败。`);
    }

    // 将 blob 转换为 data URL（tldraw 不支持 blob: 协议）
    const blob = await response.blob();
    console.log('接收到的图片 Blob:', blob.size, 'bytes, 类型:', blob.type);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('图生图失败:', error);
    throw error;
  }
}

/**
 * 图生视频功能 - 基于参考图片生成视频
 *
 * 使用服务端代理调用 Pollinations API (seedance 模型)
 * 参数:
 *  - duration: 2-10 秒
 *  - aspectRatio: 16:9 或 9:16
 */
export async function generateImageToVideo(options: ImageToVideoOptions): Promise<Blob> {
  const {
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    seed = Math.floor(Math.random() * 1000000),
    model = 'seedance',
    nologo = true,
  } = options;

  // 使用服务端代理
  const params = new URLSearchParams({
    prompt: prompt,
    imageUrl: imageUrl,
    duration: duration.toString(),
    aspectRatio: aspectRatio,
    seed: seed.toString(),
    model: model,
    nologo: nologo.toString(),
  });

  const url = `http://localhost:3001/api/img2video?${params.toString()}`;

  console.log('图生视频请求 URL:', url);

  try {
    // 视频生成需要更长时间，设置 10 分钟超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10分钟

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('响应状态:', response.status, response.statusText);
    console.log('响应 Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法获取错误详情');
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n详情: ${errorText}`);
    }

    // 检查响应是否为视频
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('video/')) {
      const errorText = await response.text();
      console.error('API 返回了非视频内容:', errorText.substring(0, 500));
      throw new Error(`API 返回了非视频内容 (${contentType})。可能是 API 调用失败。`);
    }

    // 返回视频 Blob
    const blob = await response.blob();
    console.log('接收到的视频 Blob:', blob.size, 'bytes, 类型:', blob.type);

    return blob;
  } catch (error) {
    console.error('图生视频失败:', error);
    throw error;
  }
}
