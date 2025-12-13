/**
 * 项目工作区 - 主工作界面
 */

import { useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import MainLayout from '@/components/Layout/MainLayout'
import './WorkspacePage.css'

interface LocationState {
  autoStart?: boolean
  initialMessage?: string
}

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as LocationState | null
  const { currentProject: _currentProject, loadProject, isLoading, error } = useProject()

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
    }
  }, [projectId, loadProject])

  // 加载中状态
  if (isLoading) {
    return (
      <div className="workspace-loading">
        <div className="loading-spinner" />
        <p>加载项目中...</p>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="workspace-error">
        <h2>😢 加载失败</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    )
  }

  // Debug: 输出 location state
  console.log('[WorkspacePage] locationState:', locationState)

  return (
    <div className="workspace-page">
      <MainLayout 
        projectId={projectId!} 
        autoStart={locationState?.autoStart}
        initialMessage={locationState?.initialMessage}
      />
    </div>
  )
}
