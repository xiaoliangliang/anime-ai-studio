import type { VercelRequest, VercelResponse } from '@vercel/node'

// 允许代理的上游域名（避免变成开放代理）
// 可通过环境变量额外扩展（逗号分隔），例如：FETCH_FILE_ALLOWED_HOST_SUFFIXES=cloudfront.net,amazonaws.com
const EXTRA_SUFFIXES = (process.env.FETCH_FILE_ALLOWED_HOST_SUFFIXES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const ALLOWED_HOST_SUFFIXES = ['runcomfy.net', 'runcomfy.com', ...EXTRA_SUFFIXES]

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const urlParam = req.query.url
  const rawUrl = Array.isArray(urlParam) ? urlParam[0] : urlParam

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: '缺少必要参数: url' })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return res.status(400).json({ error: 'url 不合法' })
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return res.status(400).json({ error: '仅支持 http/https' })
  }

  if (!isAllowedHost(target.hostname)) {
    return res.status(403).json({ error: '该域名不允许代理' })
  }

  try {
    const upstream = await fetch(target.toString(), { method: 'GET' })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({
        error: '上游请求失败',
        details: errText ? errText.slice(0, 500) : undefined,
      })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'

    // 基本兜底：仅允许视频类型
    if (!contentType.startsWith('video/')) {
      const errText = await upstream.text().catch(() => '')
      return res.status(500).json({
        error: '上游返回非视频内容',
        contentType,
        details: errText ? errText.slice(0, 500) : undefined,
      })
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')

    const buffer = await upstream.arrayBuffer()
    res.send(Buffer.from(buffer))

  } catch (error) {
    res.status(500).json({
      error: '代理请求失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
