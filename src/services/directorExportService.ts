import JSZip from 'jszip'
import type { GeneratedVideo, Project } from '@/types'
import { getAsset } from './storageService'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export type DirectorZipExportPhase = 'preparing' | 'downloading' | 'zipping' | 'completed' | 'error'

export interface DirectorZipExportProgress {
  phase: DirectorZipExportPhase
  current: number
  total: number
  currentShot?: string
  error?: string
}

function sanitizeFileName(name: string): string {
  // Windows 文件名非法字符：\ / : * ? " < > |
  // 也去掉控制字符
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\x00-\x1F]/g, '_')
    .trim()

  // 避免空字符串
  if (!cleaned) return 'video'

  // 过长的文件名在某些系统下可能失败
  return cleaned.length > 150 ? cleaned.slice(0, 150) : cleaned
}

function getZipFileName(project: Project): string {
  const base = sanitizeFileName(project.meta?.name || project.meta?.id || 'dramaai')
  return `${base}-videos.zip`
}

async function fetchArrayBufferDirect(url: string, abortSignal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal: abortSignal })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.arrayBuffer()
}

async function fetchArrayBufferViaProxy(url: string, abortSignal?: AbortSignal): Promise<ArrayBuffer> {
  const proxyUrl = `${API_BASE}/api/fetch-file?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl, { signal: abortSignal })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `Proxy HTTP ${res.status}`)
  }
  return res.arrayBuffer()
}

async function fetchArrayBufferWithFallback(url: string, abortSignal?: AbortSignal): Promise<ArrayBuffer> {
  try {
    return await fetchArrayBufferDirect(url, abortSignal)
  } catch (err) {
    if (abortSignal?.aborted) {
      throw new Error('用户取消导出')
    }
    // 大概率是 CORS 或上游不允许跨域读取，走同源代理兜底
    return fetchArrayBufferViaProxy(url, abortSignal)
  }
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    throw new Error('Invalid data URL')
  }
  const header = dataUrl.slice(0, commaIndex)
  const data = dataUrl.slice(commaIndex + 1)

  // 目前仅处理 base64（视频/图片都是）
  if (!/;base64/i.test(header)) {
    // 非 base64 的 data URL（极少见）
    const decoded = decodeURIComponent(data)
    return new TextEncoder().encode(decoded).buffer
  }

  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function resolveVideoSource(video: GeneratedVideo): Promise<string | null> {
  if (video.videoUrl) return video.videoUrl

  if (video.assetId) {
    const asset = await getAsset(video.assetId)
    if (asset?.cloudUrl) return asset.cloudUrl
    if (asset?.localData) return asset.localData
  }

  return null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 批量导出导演阶段已完成的视频为 ZIP
 * - 默认只导出 status === 'completed' 的视频
 * - 每个镜头一个 mp4
 * - 会附带一个 manifest.json（便于追溯 prompt / url / 时长）
 */
export async function exportDirectorVideosAsZip(
  project: Project,
  options: {
    onProgress?: (p: DirectorZipExportProgress) => void
    abortSignal?: AbortSignal
    filename?: string
  } = {}
): Promise<void> {
  const { onProgress, abortSignal, filename } = options

  const allVideos = project.director?.videos || []
  const completed = allVideos.filter(v => v.status === 'completed')

  if (completed.length === 0) {
    throw new Error('没有可导出的已完成视频')
  }

  onProgress?.({ phase: 'preparing', current: 0, total: completed.length })

  const zip = new JSZip()
  const folder = zip.folder('videos')

  // 处理重名：同名则追加 -2/-3...
  const nameCount = new Map<string, number>()

  const manifest: any = {
    projectId: project.meta?.id,
    projectName: project.meta?.name,
    exportedAt: new Date().toISOString(),
    videos: [] as any[],
  }

  for (let i = 0; i < completed.length; i++) {
    if (abortSignal?.aborted) {
      throw new Error('用户取消导出')
    }

    const v = completed[i]
    onProgress?.({ phase: 'downloading', current: i, total: completed.length, currentShot: v.shotNumber })

    const src = await resolveVideoSource(v)
    if (!src) {
      throw new Error(`镜头 ${v.shotNumber}: 找不到视频地址`) 
    }

    const baseName = sanitizeFileName(v.shotNumber || v.id)
    const prev = nameCount.get(baseName) || 0
    const nextCount = prev + 1
    nameCount.set(baseName, nextCount)

    const fileName = nextCount === 1 ? `${baseName}.mp4` : `${baseName}-${nextCount}.mp4`

    let buffer: ArrayBuffer
    if (src.startsWith('data:')) {
      buffer = dataUrlToArrayBuffer(src)
    } else {
      buffer = await fetchArrayBufferWithFallback(src, abortSignal)
    }

    folder?.file(fileName, buffer)

    manifest.videos.push({
      id: v.id,
      shotId: v.shotId,
      shotNumber: v.shotNumber,
      duration: v.duration,
      prompt: v.prompt,
      videoUrl: v.videoUrl,
      assetId: v.assetId,
      file: `videos/${fileName}`,
    })

    onProgress?.({ phase: 'downloading', current: i + 1, total: completed.length, currentShot: v.shotNumber })
  }

  onProgress?.({ phase: 'zipping', current: completed.length, total: completed.length })

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (meta) => {
      // meta.percent 0-100；这里不单独暴露百分比，避免 UI 复杂
      void meta
    }
  )

  onProgress?.({ phase: 'completed', current: completed.length, total: completed.length })

  downloadBlob(zipBlob, filename || getZipFileName(project))
}
