/**
 * 首页 - 项目管理与创建入口
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/contexts/ProjectContext'
import { TEXT_MODELS, DEFAULT_TEXT_MODEL } from '@/config/textModels'
import type { ProjectListItem } from '@/types'
import './HomePage.css'

// 快捷标签类型（剧本题材）
const QUICK_TAGS = [
  { icon: '🎬', label: '都市爱情', value: '都市爱情' },
  { icon: '💼', label: '霸总复仇', value: '霸总复仇' },
  { icon: '👑', label: '古装宫斗', value: '古装宫斗' },
  { icon: '⚔️', label: '玄幻修仙', value: '玄幻修仙' },
  { icon: '🎭', label: '悬疑推理', value: '悬疑推理' },
  { icon: '😂', label: '搞笑沙雕', value: '搞笑沙雕' },
  { icon: '💻', label: '现代职场', value: '现代职场' },
  { icon: '🌍', label: '末世求生', value: '末世求生' },
]

// 集数选项
const EPISODE_OPTIONS = [
  { label: '5集', value: 5 },
  { label: '10集', value: 10 },
  { label: '15集', value: 15 },
  { label: '20集', value: 20 },
  { label: '30集', value: 30 },
]

// 受众选项
const AUDIENCE_OPTIONS = [
  { label: '男频', value: 'male' as const },
  { label: '女频', value: 'female' as const },
  { label: '通用', value: 'general' as const },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { projects, loadProjects, createProject, deleteProject, isLoading } = useProject()
  const [creativity, setCreativity] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<ProjectListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // 参数选项状态
  const [selectedGenre, setSelectedGenre] = useState('玄幻修仙')
  const [selectedEpisodes, setSelectedEpisodes] = useState(5)
  const [selectedAudience, setSelectedAudience] = useState<'male' | 'female' | 'general'>('male')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TEXT_MODEL)
  const [showModelPopup, setShowModelPopup] = useState(false)

  // 获取受众显示文本
  const getAudienceLabel = (value: 'male' | 'female' | 'general') => {
    const labels = { male: '男频', female: '女频', general: '通用' }
    return labels[value]
  }

  // 生成默认文案
  const generateDefaultPrompt = (genre: string, episodes: number, audience: 'male' | 'female' | 'general') => {
    return `写一个${genre}类型的短剧，${episodes}集，${getAudienceLabel(audience)}向`
  }

  // 参数变化时更新默认文案
  useEffect(() => {
    setCreativity(generateDefaultPrompt(selectedGenre, selectedEpisodes, selectedAudience))
  }, [selectedGenre, selectedEpisodes, selectedAudience])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 处理创建项目
  const handleCreateProject = async () => {
    if (!creativity.trim()) return
    
    setIsCreating(true)
    try {
      const projectId = await createProject({
        name: creativity.slice(0, 20) || '新项目',
        type: selectedGenre,
        totalEpisodes: selectedEpisodes,
        targetAudience: selectedAudience,
        initialCreativity: creativity,
      })
      
      // 传递 autoStart 标志，表示需要自动开始创作
      navigate(`/project/${projectId}`, { state: { autoStart: true, initialMessage: creativity } })
    } catch (error) {
      console.error('创建项目失败:', error)
    } finally {
      setIsCreating(false)
    }
  }

  // 点击快捷标签（选择题材）
  const handleTagClick = (value: string) => {
    setSelectedGenre(value)
    // 同时更新输入框提示
    if (!creativity.trim()) {
      setCreativity(`写一个${value}短剧`)
    }
  }

  // 获取当前选中的模型信息
  const currentModel = TEXT_MODELS.find(m => m.id === selectedModel) || TEXT_MODELS[0]

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreateProject()
    }
  }

  // 处理删除项目
  const handleDeleteClick = (e: React.MouseEvent, project: ProjectListItem) => {
    e.stopPropagation() // 阻止事件冒泡，避免触发卡片点击
    setDeleteConfirm(project)
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    
    setIsDeleting(true)
    try {
      await deleteProject(deleteConfirm.id)
      setDeleteConfirm(null)
    } catch (error) {
      console.error('删除项目失败:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirm(null)
  }

  return (
    <div className="home-page">
      {/* 左侧导航栏 */}
      <aside className="home-sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">AI短剧工坊</span>
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item active">
            <span className="nav-icon">🏠</span>
            <span className="nav-label">首页</span>
          </button>
          <button className="nav-item">
            <span className="nav-icon">📁</span>
            <span className="nav-label">项目</span>
          </button>
          <button className="nav-item">
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">设置</span>
          </button>
        </nav>
      </aside>

      {/* 主内容区 */}
      <main className="home-main">
        {/* 欢迎区域 */}
        <section className="welcome-section">
          <h1 className="welcome-title">✨ AI短剧工坊</h1>
          <p className="welcome-subtitle">懂你的AI导演，帮你搞定一切</p>
        </section>

        {/* 创意输入区 */}
        <section className="creativity-section">
          <div className="creativity-input-wrapper">
            <textarea
              className="creativity-input"
              placeholder="一句话描述你想创作的短剧..."
              value={creativity}
              onChange={e => setCreativity(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="creativity-actions">
              <button 
                className="model-params-btn"
                onClick={() => setShowModelPopup(!showModelPopup)}
                title="模型参数"
              >
                模型参数
              </button>
              <button 
                className="submit-btn"
                onClick={handleCreateProject}
                disabled={!creativity.trim() || isCreating}
              >
                {isCreating ? <span className="loading-spinner" /> : '➤'}
              </button>
            </div>

            {/* 模型选择弹窗 */}
            {showModelPopup && (
              <div className="model-popup">
                <div className="model-popup-header">
                  <span>选择文本模型</span>
                  <button onClick={() => setShowModelPopup(false)}>✕</button>
                </div>
                <div className="model-list">
                  {TEXT_MODELS.map(model => (
                    <div
                      key={model.id}
                      className={`model-item ${selectedModel === model.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedModel(model.id)
                        setShowModelPopup(false)
                      }}
                    >
                      <div className="model-item-header">
                        <span className="model-name">{model.name}</span>
                        {model.recommended && <span className="model-badge">推荐</span>}
                        <span className={`model-tier tier-${model.tier}`}>{model.tier}</span>
                      </div>
                      <div className="model-desc">{model.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 参数选择区域 */}
          <div className="params-section">
            {/* 剧本题材 */}
            <div className="param-group">
              <span className="param-label">剧本题材</span>
              <select 
                className="param-select"
                value={selectedGenre}
                onChange={e => setSelectedGenre(e.target.value)}
              >
                {QUICK_TAGS.map(tag => (
                  <option key={tag.value} value={tag.value}>{tag.label}</option>
                ))}
              </select>
            </div>

            {/* 集数选择 */}
            <div className="param-group">
              <span className="param-label">集数</span>
              <select 
                className="param-select"
                value={selectedEpisodes}
                onChange={e => setSelectedEpisodes(Number(e.target.value))}
              >
                {EPISODE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 受众选择 */}
            <div className="param-group">
              <span className="param-label">受众</span>
              <select 
                className="param-select"
                value={selectedAudience}
                onChange={e => setSelectedAudience(e.target.value as 'male' | 'female' | 'general')}
              >
                {AUDIENCE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 项目列表区 */}
        <section className="projects-section">
          <div className="section-header">
            <h2 className="section-title">最近项目</h2>
            <button className="view-all-btn">查看全部 →</button>
          </div>

          <div className="projects-grid">
            {/* 新建项目卡片 */}
            <div 
              className="project-card new-project"
              onClick={() => document.querySelector<HTMLTextAreaElement>('.creativity-input')?.focus()}
            >
              <div className="new-project-icon">+</div>
              <span className="new-project-label">新建项目</span>
            </div>

            {/* 项目卡片列表 */}
            {isLoading ? (
              <div className="loading-placeholder">
                <span className="loading-spinner" />
                <span>加载中...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-placeholder">
                <p>还没有项目，快来创建你的第一个短剧吧！</p>
              </div>
            ) : (
              projects.map(project => (
                <div 
                  key={project.id}
                  className="project-card"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <div className="project-preview">
                    {project.previewImageUrl ? (
                      <img src={project.previewImageUrl} alt={project.name} />
                    ) : (
                      <div className="preview-placeholder">🎬</div>
                    )}
                    <button 
                      className="delete-btn"
                      onClick={(e) => handleDeleteClick(e, project)}
                      title="删除项目"
                    >
                      🗑️
                    </button>
                  </div>
                  <div className="project-info">
                    <h3 className="project-name">{project.name}</h3>
                    <p className="project-time">
                      更新于 {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                    <div className="stage-progress">
                      {project.stageProgress.map(sp => (
                        <span 
                          key={sp.stage}
                          className={`stage-dot ${sp.status}`}
                          title={getStageLabel(sp.stage)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">确认删除</h3>
            <p className="modal-message">
              确定要删除项目 <strong>「{deleteConfirm.name}」</strong> 吗？
              <br />
              <span className="warning-text">此操作无法撤销，项目数据将永久删除。</span>
            </p>
            <div className="modal-actions">
              <button 
                className="modal-btn cancel-btn"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                取消
              </button>
              <button 
                className="modal-btn confirm-btn"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 获取阶段中文名称
function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    screenwriter: '编剧',
    storyboard: '分镜',
    imageDesigner: '设计',
    artist: '美工',
    director: '导演',
  }
  return labels[stage] || stage
}
