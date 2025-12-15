/**
 * 画布面板组件 - 右侧无限画布区
 */

import { useCallback, useState, useEffect, useRef } from 'react'
import { Tldraw, Editor, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import type { ProjectStage } from '@/types'
import { STAGE_AREAS, navigateToStage, addStageBackgrounds, renderStageData, regenerateVideo } from '@/services'
import { ENABLE_VIDEO_GENERATION, VIDEO_GENERATION_DISABLED_MESSAGE } from '@/config'
import { extractPromptsFromImageDesigner } from '@/services/artistService'
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

  // 点击按钮形状立即执行；双击视频在新标签播放
  useEffect(() => {
    if (!editor || !isInitialized) return

    const handleClick = () => {
      setTimeout(async () => {
        const selected = editor.getSelectedShapes()
        if (selected.length === 0) return
        const shape: any = selected[0]
        const meta = shape.meta || {}
        if (meta.action === 'regenVideo' && meta.shotId) {
          if (!ENABLE_VIDEO_GENERATION) {
            alert(VIDEO_GENERATION_DISABLED_MESSAGE)
            return
          }

          if (!currentProject) return
          const res = await regenerateVideo(currentProject.meta.id, meta.shotId)
          if (!res.success) {
            alert(res.error || '重新生成失败')
            return
          }
          await loadProject(currentProject.meta.id)
          return
        }
        if (meta.action === 'downloadVideo' && meta.videoUrl) {
          const a = document.createElement('a')
          a.href = meta.videoUrl
          a.download = `${meta.shotNumber || 'video'}.mp4`
          document.body.appendChild(a)
          a.click()
          a.remove()
          return
        }
      }, 0)
    }

    const handleDoubleClick = () => {
      const selected = editor.getSelectedShapes()
      if (selected.length === 0) return
      const shape: any = selected[0]
      const videoUrl = shape.meta?.videoUrl
      if (shape.type === 'video' && videoUrl) window.open(videoUrl, '_blank')
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
    const dataHash = `${stage}:${JSON.stringify(stageData)}`
    const stageChanged = lastStageRef.current !== stage
    if (!stageChanged && dataHash === lastDataHashRef.current) return
    
    lastDataHashRef.current = dataHash
    lastStageRef.current = stage
    
    console.log(`渲染 ${stage} 阶段数据到画布...`, stageData)
    
    // 渲染数据到画布
    renderStageData(editor, stage, stageData)
    
  }, [editor, isInitialized, currentProject, stage])

  // 跳转到指定阶段
  const scrollToStage = useCallback((targetStage: ProjectStage) => {
    if (!editor) return
    navigateToStage(editor, targetStage)
  }, [editor])

  return (
    <div className="canvas-panel">
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
