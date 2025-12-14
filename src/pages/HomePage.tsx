/**
 * 首页 - 项目管理与创建入口
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useProject } from '@/contexts/ProjectContext'
import type { ProjectListItem } from '@/types'
import { FeaturesSection, StatsSection, PricingSection, FAQSection, FooterSection } from '@/components/LandingModules'
import './HomePage.css'


export default function HomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { projects, loadProjects, createProject, deleteProject, isLoading } = useProject()
  
  // Language switching logic - default to Chinese if path is /
  const isZh = !location.pathname.startsWith('/en')
  
  useEffect(() => {
    if (isZh && i18n.language !== 'zh') {
      i18n.changeLanguage('zh')
    } else if (!isZh && i18n.language !== 'en') {
      i18n.changeLanguage('en')
    }
  }, [isZh, i18n])

  const handleLanguageSwitch = (lang: string) => {
    const currentPath = location.pathname
    // If switching to en and not already en
    if (lang === 'en' && !currentPath.startsWith('/en')) {
       const newPath = currentPath === '/' ? '/en' : '/en' + currentPath
       navigate(newPath)
    } 
    // If switching to zh and is currently en
    else if (lang === 'zh' && currentPath.startsWith('/en')) {
       navigate(currentPath.replace(/^\/en/, '') || '/')
    }
  }

  // Get localized options from translation
  const genreOptions = t('creator.genres', { returnObjects: true }) as { label: string; value: string }[]
  const episodeOptions = t('creator.episodes', { returnObjects: true }) as { label: string; value: number }[]
  const audienceOptions = t('creator.audiences', { returnObjects: true }) as { label: string; value: string }[]

  const [creativity, setCreativity] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<ProjectListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // 参数选项状态
  const [selectedGenre, setSelectedGenre] = useState('fantasy_cultivation')
  const [selectedEpisodes, setSelectedEpisodes] = useState(5)
  const [selectedAudience, setSelectedAudience] = useState<'male' | 'female' | 'general'>('male')

  // 获取受众显示文本
  const getAudienceLabel = (value: string) => {
    const option = audienceOptions.find(o => o.value === value)
    return option ? option.label : value
  }

  // 获取题材显示文本
  const getGenreLabel = (value: string) => {
    const option = genreOptions.find(o => o.value === value)
    return option ? option.label : value
  }

  // 生成默认文案
  const generateDefaultPrompt = () => {
    const template = t('creator.defaultPrompt')
    return template
      .replace('{genre}', getGenreLabel(selectedGenre))
      .replace('{episodes}', String(selectedEpisodes))
      .replace('{audience}', getAudienceLabel(selectedAudience))
  }

  // 参数变化时更新默认文案
  useEffect(() => {
    setCreativity(generateDefaultPrompt())
  }, [selectedGenre, selectedEpisodes, selectedAudience, i18n.language])

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
      {/* Language Switcher */}
      <div className="lang-switch">
        <button 
          className={`lang-btn ${!isZh ? 'active' : ''}`}
          onClick={() => handleLanguageSwitch('en')}
        >
          EN
        </button>
        <button 
          className={`lang-btn ${isZh ? 'active' : ''}`}
          onClick={() => handleLanguageSwitch('zh')}
        >
          中文
        </button>
      </div>

      {/* 主内容区 */}
      <main className="home-main">
        {/* 欢迎区域 - SEO Optimization */}
        <section className="welcome-section">
          <div className="hero-content">
            <h1 className="welcome-title">
              {t('hero.title')} <span className="highlight-glitch">{t('hero.highlight_text')}</span>
            </h1>
            <p className="welcome-subtitle">
              {t('hero.description')}
            </p>
          </div>
        </section>

        {/* 创意输入区 */}
        <section className="creativity-section">
          <div className="glass-card input-container">
            <textarea
              className="creativity-input"
              placeholder={t('creator.placeholder')}
              value={creativity}
              onChange={e => setCreativity(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="creativity-actions">
              {/* 固定模型标签 */}
              <div className="model-label-static">
                <span className="icon">🤖</span>
                <span>GPT-5 Nano</span>
              </div>
              <button 
                className="submit-btn"
                onClick={handleCreateProject}
                disabled={!creativity.trim() || isCreating}
              >
                {isCreating ? <span className="loading-spinner" /> : t('creator.generate')}
              </button>
            </div>
          </div>

          {/* 参数选择区域 */}
          <div className="params-section">
            {/* 剧本题材 */}
            <div className="param-group">
              <span className="param-label">{t('creator.genre')}</span>
              <select 
                className="param-select"
                value={selectedGenre}
                onChange={e => setSelectedGenre(e.target.value)}
              >
                {genreOptions.map(tag => (
                  <option key={tag.value} value={tag.value}>{tag.label}</option>
                ))}
              </select>
            </div>

            {/* 集数选择 */}
            <div className="param-group">
              <span className="param-label">{t('creator.length')}</span>
              <select 
                className="param-select"
                value={selectedEpisodes}
                onChange={e => setSelectedEpisodes(Number(e.target.value))}
              >
                {episodeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 受众选择 */}
            <div className="param-group">
              <span className="param-label">{t('creator.target')}</span>
              <select 
                className="param-select"
                value={selectedAudience}
                onChange={e => setSelectedAudience(e.target.value as 'male' | 'female' | 'general')}
              >
                {audienceOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Feature Highlights (SEO & Intro) - Removed old one, using new modules below */}
        
        {/* 项目列表区 */}
        <section className="projects-section">
          <div className="section-header">
            <h2 className="section-title">{t('creator.recentProjects')}</h2>
            <button className="view-all-btn">{t('creator.viewAll')}</button>
          </div>

          <div className="projects-grid">
            {/* 新建项目卡片 */}
            <div 
              className="project-card new-project"
              onClick={() => document.querySelector<HTMLTextAreaElement>('.creativity-input')?.focus()}
            >
              <div className="new-project-icon">+</div>
              <span className="new-project-label">{t('creator.newProject')}</span>
            </div>

            {/* 项目卡片列表 */}
            {isLoading ? (
              <div className="loading-placeholder">
                <span className="loading-spinner" />
                <span>{t('creator.loading')}</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-placeholder">
                <p>{t('creator.emptyTip')}</p>
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
                      {t('creator.updatedAt')} {new Date(project.updatedAt).toLocaleDateString()}
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

        {/* Landing Page Modules */}
        <FeaturesSection />
        <StatsSection />
        <PricingSection />
        <FAQSection />
        <FooterSection />
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
