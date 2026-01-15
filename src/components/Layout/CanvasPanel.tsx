/**
 * 画布面板组件 - 右侧无限画布区
 */

import { useCallback, useState, useEffect, useRef } from 'react'
import { Tldraw, Editor, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import type { ProjectStage } from '@/types'
import {
  STAGE_AREAS,
  navigateToStage,
  addStageBackgrounds,
  renderStageData,
  regenerateVideo,
  getAsset,
  getVideoUrlById,
  getDirectorVideoPreviewUrl,
  setDirectorVideoPreviewUrl,
  clearDirectorVideoPreviewUrlCache,
} from '@/services'
import { getDirectorVideoConfig } from '@/services/directorConfig'
import { ENABLE_VIDEO_GENERATION, VIDEO_GENERATION_DISABLED_MESSAGE } from '@/config'
import { IMAGE_ASPECT_RATIO_OPTIONS } from '@/config/imageAspectRatios'
import { extractPromptsFromImageDesigner } from '@/services/artistService'
import { regenerateSingleImage } from '@/services/generationController'
import { useProject } from '@/contexts/ProjectContext'
import './CanvasPanel.css'

/**
 * 键盘快捷键处理组件
 * 由于 hideUi={true} 会禁用默认快捷键，需要手动处理撤销/重做
 */
function KeyboardShortcutsHandler() {
  const editor = useEditor()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 或 Cmd+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        editor.undo()
      }
      // Ctrl+Shift+Z 或 Cmd+Shift+Z 或 Ctrl+Y 重做
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault()
        editor.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor])

  return null
}

interface CanvasPanelProps {
  projectId: string
  stage: ProjectStage
}

export default function CanvasPanel({ projectId, stage }: CanvasPanelProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const { currentProject, loadProject } = useProject()
  const lastDataHashRef = useRef<string>('')
  const lastStageRef = useRef<ProjectStage | null>(null)
  const artistRenderTimerRef = useRef<number | null>(null)
  const pendingArtistDataRef = useRef<unknown>(null)
  
  // 编辑器挂载回调
  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor)
    
    // 初始化阶段区域背景
    addStageBackgrounds(editor)
    
    // 跳转到当前阶段区域
    navigateToStage(editor, stage)
    
    setIsInitialized(true)
    console.log('Canvas mounted for project:', projectId)
  }, [projectId, stage])

  // 当阶段变化时跳转
  useEffect(() => {
    if (editor && isInitialized) {
      navigateToStage(editor, stage)
    }
  }, [editor, stage, isInitialized])

  // 清理美工阶段渲染节流定时器
  useEffect(() => {
    return () => {
      if (artistRenderTimerRef.current) {
        clearTimeout(artistRenderTimerRef.current)
        artistRenderTimerRef.current = null
      }
    }
  }, [])

  // 离开美工阶段时清理待渲染数据
  useEffect(() => {
    if (stage !== 'artist' && artistRenderTimerRef.current) {
      clearTimeout(artistRenderTimerRef.current)
      artistRenderTimerRef.current = null
      pendingArtistDataRef.current = null
    }
  }, [stage])

  // 切换项目/卸载时清理导演视频预览（blob URL）缓存，避免内存泄漏
  useEffect(() => {
    return () => {
      clearDirectorVideoPreviewUrlCache()
    }
  }, [projectId])

  // 导演阶段：预取本地视频预览（assetId -> blob URL），避免出现“✅ 但预览待生成/待加载”
  useEffect(() => {
    if (!editor || !isInitialized || !currentProject) return
    if (stage !== 'director') return

    const videos = currentProject.director?.videos || []
    const candidates = videos.filter((v: any) => v.status === 'completed' && !v.videoUrl && v.assetId)
    if (candidates.length === 0) return

    let cancelled = false

    void (async () => {
      let hydrated = false

      for (const v of candidates) {
        if (cancelled) return

        const assetId = v.assetId as string | undefined
        if (!assetId) continue

        // 已缓存则跳过
        if (getDirectorVideoPreviewUrl(assetId)) continue

        try {
          const asset = await getAsset(assetId)
          const src = asset?.cloudUrl || asset?.localData
          if (!src) continue

          let previewUrl = src
          if (src.startsWith('data:')) {
            try {
              const blob = await fetch(src).then(r => r.blob())
              previewUrl = URL.createObjectURL(blob)
            } catch {
              // 兜底：使用原始 data URL
              previewUrl = src
            }
          }

          setDirectorVideoPreviewUrl(assetId, previewUrl)
          hydrated = true
        } catch (err) {
          console.warn('[CanvasPanel] 预取视频预览失败:', err)
        }
      }

      if (!cancelled && hydrated) {
        renderStageData(editor, 'director', {
          storyboard: currentProject.storyboard,
          artist: currentProject.artist,
          director: currentProject.director,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [editor, isInitialized, currentProject, stage])

  // 点击按钮形状立即执行；双击视频在新标签播放
  useEffect(() => {
    if (!editor || !isInitialized) return

    const handleClick = () => {
      setTimeout(async () => {
        const selected = editor.getSelectedShapes()
        if (selected.length === 0) return
        const shape: any = selected[0]
        const meta = shape.meta || {}
        
        // 处理单张图片重新生成
        if (meta.action === 'regenImage' && meta.imageKey) {
          if (!currentProject) return
          
          const imageName = meta.imageName || meta.imageKey
          console.log(`[CanvasPanel] 重新生成单张图片: ${imageName} (${meta.imageKey})`)

          // 优先使用卡片 meta 里带的尺寸，否则回退到当前选择的宽高比（localStorage）
          let width: number | undefined = typeof meta.width === 'number' ? meta.width : Number(meta.width)
          let height: number | undefined = typeof meta.height === 'number' ? meta.height : Number(meta.height)
          if (!Number.isFinite(width) || !Number.isFinite(height)) {
            try {
              const key = `artistImageAspectRatio:${currentProject.meta.id}`
              const ar = localStorage.getItem(key) || '16:9'
              const opt = IMAGE_ASPECT_RATIO_OPTIONS.find(o => o.value === ar) || IMAGE_ASPECT_RATIO_OPTIONS[0]
              width = opt.width
              height = opt.height
            } catch {
              width = IMAGE_ASPECT_RATIO_OPTIONS[0].width
              height = IMAGE_ASPECT_RATIO_OPTIONS[0].height
            }
          }
          
          try {
            const result = await regenerateSingleImage(
              currentProject.meta.id,
              meta.imageKey,
              {
                width,
                height,
                onProgress: (progress) => {
                  console.log('[CanvasPanel] 单张图片生成进度:', progress)
                },
                onImageGenerated: (image, phase) => {
                  console.log(`[CanvasPanel] 单张图片生成完成: ${image.name} (${phase})`)
                },
                onError: (error) => {
                  console.error('[CanvasPanel] 单张图片生成错误:', error)
                  alert(`重新生成失败: ${error}`)
                }
              }
            )

            // 不论成功或失败，都刷新一次项目以更新画布/状态
            await loadProject(currentProject.meta.id)

            if (result && result.status === 'completed') {
              console.log(`[CanvasPanel] 图片 ${imageName} 重新生成成功`)
            } else if (result && result.status === 'failed') {
              alert(`重新生成失败: ${result.error || '未知错误'}`)
            }
          } catch (err) {
            console.error('[CanvasPanel] 重新生成图片异常:', err)
            alert(`重新生成失败: ${err instanceof Error ? err.message : '未知错误'}`)
          }
          return
        }
        
        if (meta.action === 'regenVideo' && meta.shotId) {
          if (!ENABLE_VIDEO_GENERATION) {
            alert(VIDEO_GENERATION_DISABLED_MESSAGE)
            return
          }

          if (!currentProject) return

          // 重新生成：直接复用导演阶段当前配置（分辨率/宽高比）
          const cfg = getDirectorVideoConfig(currentProject.meta.id)
          const res = await regenerateVideo(currentProject.meta.id, meta.shotId, {
            resolution: cfg.resolution,
            ratio: cfg.ratio,
          })
          if (!res.success) {
            alert(res.error || '重新生成失败')
            return
          }
          await loadProject(currentProject.meta.id)
          return
        }
        // 加载本地视频预览（assetId -> blob URL 缓存）
        if (meta.action === 'loadVideoPreview' && meta.assetId) {
          if (!currentProject) return

          try {
            // 1) 优先使用 meta.videoUrl（可能是云端或已缓存的 blob URL）
            let src: string | null = meta.videoUrl || null

            // 2) 兜底：通过 videoId/assetId 解析
            if (!src && meta.videoId) {
              src = await getVideoUrlById(currentProject.meta.id, meta.videoId)
            }
            if (!src && meta.assetId) {
              const asset = await getAsset(meta.assetId)
              src = asset?.cloudUrl || asset?.localData || null
            }

            if (!src) {
              alert('找不到视频地址（可能已被清理或未保存）')
              return
            }

            // data URL 转 blob URL，避免把超长 data: 直接塞进画布
            let previewUrl = src
            if (src.startsWith('data:')) {
              const blob = await fetch(src).then(r => r.blob())
              previewUrl = URL.createObjectURL(blob)
            }

            setDirectorVideoPreviewUrl(meta.assetId, previewUrl)

            // 触发一次导演阶段重绘（不依赖 project 数据变更）
            renderStageData(editor, 'director', {
              storyboard: currentProject.storyboard,
              artist: currentProject.artist,
              director: currentProject.director,
            })
          } catch (err) {
            console.error('[CanvasPanel] 加载视频预览失败:', err)
            alert(`加载预览失败: ${err instanceof Error ? err.message : '未知错误'}`)
          }

          return
        }

        // 下载视频：优先用 meta.videoUrl，否则通过 videoId/assetId 解析
        if (meta.action === 'downloadVideo') {
          if (!currentProject) return

          try {
            let src: string | null = meta.videoUrl || null
            if (!src && meta.assetId) {
              // 如果已缓存预览 URL，也可直接用它下载
              src = getDirectorVideoPreviewUrl(meta.assetId) || null
            }
            if (!src && meta.videoId) {
              src = await getVideoUrlById(currentProject.meta.id, meta.videoId)
            }
            if (!src && meta.assetId) {
              const asset = await getAsset(meta.assetId)
              src = asset?.cloudUrl || asset?.localData || null
            }

            if (!src) {
              alert('找不到视频地址（可能未生成或未保存）')
              return
            }

            const filename = `${meta.shotNumber || 'video'}.mp4`

            const triggerDownload = (url: string) => {
              const a = document.createElement('a')
              a.href = url
              a.download = filename
              document.body.appendChild(a)
              a.click()
              a.remove()
            }

            if (src.startsWith('data:')) {
              const blob = await fetch(src).then(r => r.blob())
              const blobUrl = URL.createObjectURL(blob)
              triggerDownload(blobUrl)
              URL.revokeObjectURL(blobUrl)
            } else {
              triggerDownload(src)
            }
          } catch (err) {
            console.error('[CanvasPanel] 下载视频失败:', err)
            alert(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`)
          }

          return
        }
      }, 0)
    }

    const handleDoubleClick = () => {
      const selected = editor.getSelectedShapes()
      if (selected.length === 0) return
      const shape: any = selected[0]
      const meta = shape.meta || {}

      if (shape.type !== 'video') return

      // 1) 优先使用 shape 上已有的 url
      const directUrl = meta.videoUrl || (meta.assetId ? getDirectorVideoPreviewUrl(meta.assetId) : undefined)
      if (directUrl) {
        window.open(directUrl, '_blank')
        return
      }

      // 2) 兜底：从存储解析并打开
      if (!currentProject) return

      void (async () => {
        try {
          let src: string | null = null
          if (meta.videoId) {
            src = await getVideoUrlById(currentProject.meta.id, meta.videoId)
          }
          if (!src && meta.assetId) {
            const asset = await getAsset(meta.assetId)
            src = asset?.cloudUrl || asset?.localData || null
          }
          if (!src) return

          let openUrl = src
          if (src.startsWith('data:') && meta.assetId) {
            const blob = await fetch(src).then(r => r.blob())
            openUrl = URL.createObjectURL(blob)
            setDirectorVideoPreviewUrl(meta.assetId, openUrl)
          }

          window.open(openUrl, '_blank')
        } catch (err) {
          console.error('[CanvasPanel] 打开视频失败:', err)
        }
      })()
    }

    const el = document.querySelector('.canvas-container') as HTMLElement | null
    if (el) {
      el.addEventListener('click', handleClick)
      el.addEventListener('dblclick', handleDoubleClick)
      return () => {
        el.removeEventListener('click', handleClick)
        el.removeEventListener('dblclick', handleDoubleClick)
      }
    }
  }, [editor, isInitialized, currentProject, loadProject])

  // 监听项目数据变化，渲染到画布
  useEffect(() => {
    if (!editor || !isInitialized || !currentProject) return
    
    // 根据当前阶段获取对应数据
    let stageData: unknown = null
    
    switch (stage) {
      case 'screenwriter':
        stageData = currentProject.screenwriter
        break
      case 'storyboard':
        stageData = currentProject.storyboard
        break
      case 'imageDesigner':
        stageData = currentProject.imageDesigner
        break
      case 'artist': {
        // 美工阶段需要同时传递图片数据和提示词数据
        const artistData = currentProject.artist || { characterImages: [], sceneImages: [], keyframeImages: [], isStale: false };
        
        // 使用 extractPromptsFromImageDesigner 提取提示词（支持新旧格式）
        const extractedPrompts = currentProject.imageDesigner 
          ? extractPromptsFromImageDesigner(currentProject.imageDesigner as Parameters<typeof extractPromptsFromImageDesigner>[0])
          : null;
        
        const promptsData = extractedPrompts ? {
          characterPrompts: extractedPrompts.characterPrompts || [],
          scenePrompts: extractedPrompts.scenePrompts || [],
          keyframePrompts: extractedPrompts.keyframePrompts || [],
        } : undefined;
        
        stageData = {
          ...artistData,
          prompts: promptsData,
        };
        break;
      }
      case 'director': {
        // 导演阶段需要同时传递分镜数据、美工数据和导演数据
        const directorStageData = {
          storyboard: currentProject.storyboard,
          artist: currentProject.artist,
          director: currentProject.director,
        };
        console.log('[CanvasPanel] 导演阶段原始 storyboard 数据:', JSON.stringify(currentProject.storyboard, null, 2));
        console.log('[CanvasPanel] 导演阶段数据:', {
          hasStoryboard: !!directorStageData.storyboard,
          storyboardKeys: directorStageData.storyboard ? Object.keys(directorStageData.storyboard) : [],
          storyboardEpisodes: directorStageData.storyboard?.episodes?.length,
          hasArtist: !!directorStageData.artist,
        });
        stageData = directorStageData;
        break;
      }
    }
    
    if (!stageData) return
    
    // 计算数据哈希，避免重复渲染
    // 注意：阶段变化时强制重新渲染
    const stageChanged = lastStageRef.current !== stage
    const buildArtistSignature = (data: any): string => {
      const stats = data?.stats
      const statsSig = stats
        ? `${stats.completedCharacters ?? 0}/${stats.totalCharacters ?? 0}|${stats.completedScenes ?? 0}/${stats.totalScenes ?? 0}|${stats.completedKeyframes ?? 0}/${stats.totalKeyframes ?? 0}`
        : '0/0|0/0|0/0'
      const promptSig = data?.prompts
        ? `${data.prompts.characterPrompts?.length || 0}|${data.prompts.scenePrompts?.length || 0}|${data.prompts.keyframePrompts?.length || 0}`
        : '0|0|0'
      const imageSig = (imgs: any[] | undefined) =>
        (imgs || []).map(img => `${img.id}:${img.status}:${img.assetId || ''}`).join(',')
      return `artist:${statsSig}:${promptSig}:${imageSig(data.characterImages)}:${imageSig(data.sceneImages)}:${imageSig(data.keyframeImages)}`
    }

    const dataHash = stage === 'artist'
      ? buildArtistSignature(stageData as any)
      : `${stage}:${JSON.stringify(stageData)}`
    if (!stageChanged && dataHash === lastDataHashRef.current) return
    
    lastDataHashRef.current = dataHash
    lastStageRef.current = stage
    
    console.log(`渲染 ${stage} 阶段数据到画布...`, stageData)

    if (stage === 'artist') {
      pendingArtistDataRef.current = stageData

      const artistData = stageData as any
      const stats = artistData?.stats
      let totalImages = 0
      let completedImages = 0
      if (stats) {
        totalImages = (stats.totalCharacters || 0) + (stats.totalScenes || 0) + (stats.totalKeyframes || 0)
        completedImages = (stats.completedCharacters || 0) + (stats.completedScenes || 0) + (stats.completedKeyframes || 0)
      } else {
        const countStatus = (imgs: any[] | undefined) => {
          totalImages += imgs?.length || 0
          completedImages += (imgs || []).filter((img: any) => img.status === 'completed').length
        }
        countStatus(artistData?.characterImages)
        countStatus(artistData?.sceneImages)
        countStatus(artistData?.keyframeImages)
      }
      const isComplete = totalImages > 0 && completedImages >= totalImages

      if (!stageChanged && !isComplete) {
        if (!artistRenderTimerRef.current) {
          artistRenderTimerRef.current = window.setTimeout(() => {
            artistRenderTimerRef.current = null
            const latest = pendingArtistDataRef.current
            if (!latest || !editor || !isInitialized) return
            renderStageData(editor, 'artist', latest)
          }, 400)
        }
        return
      }

      if (artistRenderTimerRef.current) {
        clearTimeout(artistRenderTimerRef.current)
        artistRenderTimerRef.current = null
      }
    }
    
    // 渲染数据到画布
    renderStageData(editor, stage, stageData)
    
  }, [editor, isInitialized, currentProject, stage])

  // 跳转到指定阶段
  const scrollToStage = useCallback((targetStage: ProjectStage) => {
    if (!editor) return
    navigateToStage(editor, targetStage)
  }, [editor])

  return (
    <div className="canvas-panel notranslate" translate="no">
      {/* 画布工具栏 */}
      <div className="canvas-toolbar">
        <div className="stage-indicators">
          {Object.entries(STAGE_AREAS).map(([key, area]) => (
            <button
              key={key}
              className={`stage-indicator ${stage === key ? 'active' : ''}`}
              style={{ borderColor: area.color }}
              onClick={() => scrollToStage(key as ProjectStage)}
            >
              <span 
                className="indicator-dot" 
                style={{ background: area.color }}
              />
              <span className="indicator-label">{area.label}</span>
            </button>
          ))}
        </div>
        
        <div className="toolbar-actions">
          <button className="toolbar-btn" title="放大">🔍+</button>
          <button className="toolbar-btn" title="缩小">🔍-</button>
          <button className="toolbar-btn" title="适应窗口">⛶</button>
        </div>
      </div>

      {/* tldraw 画布 */}
      <div className="canvas-container">
        <Tldraw
          onMount={handleMount}
          hideUi={true}
        >
          <KeyboardShortcutsHandler />
        </Tldraw>
      </div>

      {/* 画布提示 */}
      <div className="canvas-hint">
        <span>💡 提示：在左侧与 AI 对话生成内容，内容将自动展示在画布上</span>
      </div>
    </div>
  )
}
