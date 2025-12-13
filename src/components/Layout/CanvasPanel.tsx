/**
 * 画布面板组件 - 右侧无限画布区
 */

import { useCallback, useState, useEffect, useRef } from 'react'
import { Tldraw, Editor, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import type { ProjectStage } from '@/types'
import { STAGE_AREAS, navigateToStage, addStageBackgrounds, renderStageData } from '@/services'
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
  const { currentProject } = useProject()
  const lastDataHashRef = useRef<string>('')
  
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
      case 'artist':
        stageData = currentProject.artist
        break
      case 'director':
        stageData = currentProject.director
        break
    }
    
    if (!stageData) return
    
    // 计算数据哈希，避免重复渲染
    const dataHash = JSON.stringify(stageData)
    if (dataHash === lastDataHashRef.current) return
    lastDataHashRef.current = dataHash
    
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
