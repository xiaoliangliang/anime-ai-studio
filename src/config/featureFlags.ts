/**
 * Feature flags
 *
 * 默认关闭图片/视频生成功能（接入支付前）。
 * 需要开启时，在 Vite 环境变量中设置：
 * - VITE_ENABLE_IMAGE_GENERATION=true
 * - VITE_ENABLE_VIDEO_GENERATION=true
 */

// Vite env values are strings at runtime
const isTrue = (v: unknown) => String(v).toLowerCase() === 'true'

export const ENABLE_IMAGE_GENERATION = isTrue(import.meta.env.VITE_ENABLE_IMAGE_GENERATION)
export const ENABLE_VIDEO_GENERATION = isTrue(import.meta.env.VITE_ENABLE_VIDEO_GENERATION)

export const IMAGE_GENERATION_DISABLED_MESSAGE =
  '图片生成免费额度已经用完，产品正在升级和接入支付功能，敬请期待！'

export const VIDEO_GENERATION_DISABLED_MESSAGE =
  '视频生成免费额度已经用完，产品正在升级和接入支付功能，敬请期待！'
