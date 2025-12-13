/**
 * 聊天面板组件 - 左侧 AI 对话区
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ProjectStage, ChatMessage, Message } from '@/types'
import { sendChatMessage, type ChatResponse } from '@/services'
import { useProject } from '@/contexts/ProjectContext'
import { TEXT_MODELS, DEFAULT_TEXT_MODEL, TXT2IMG_MODELS, IMG2IMG_MODELS, DEFAULT_TXT2IMG_MODEL, DEFAULT_IMG2IMG_MODEL } from '@/config'
import { generateNextImage, getArtistStats, extractPromptsFromImageDesigner, type GenerationProgress, type GenerationPhase, type GenerateNextResult } from '@/services/artistService'
import './ChatPanel.css'

interface ChatPanelProps {
  projectId: string
  stage: ProjectStage
  onDataGenerated?: (data: unknown) => void // AI 生成数据的回调
  autoStart?: boolean // 从首页进入时自动开始创作
  initialMessage?: string // 首页传来的初始消息
  onArtistProgress?: (progress: GenerationProgress) => void // 美工阶段进度回调
}

// 编剧快捷选项配置
const EPISODE_OPTIONS = [5, 10, 15, 20, 30];
const GENRE_OPTIONS = [
  { value: '玄幻修仙', label: '🔮 玄幻修仙' },
  { value: '都市爱情', label: '💕 都市爱情' },
  { value: '霸总复仇', label: '👔 霸总复仇' },
  { value: '古装宫斗', label: '🏯 古装宫斗' },
  { value: '悬疑推理', label: '🔍 悬疑推理' },
  { value: '搞笑沙雕', label: '🤣 搞笑沙雕' },
  { value: '现代职场', label: '💼 现代职场' },
  { value: '末世求生', label: '🌋 末世求生' },
];
const AUDIENCE_OPTIONS = [
  { value: '男频', label: '👦 男频' },
  { value: '女频', label: '👧 女频' },
  { value: '通用', label: '👥 通用' },
];

// 阶段配置
const STAGE_CONFIG: Record<ProjectStage, { name: string; icon: string; greeting: string }> = {
  screenwriter: {
    name: 'AI编剧助手',
    icon: '✍️',
    greeting: '你好！我是AI编剧助手，帮你快速创作短剧剧本。请在下方选择题材、集数和受众，然后点击“开始创作”！',
  },
  storyboard: {
    name: 'AI分镜师助手',
    icon: '🎬',
    greeting: '你好！我是AI分镜师助手，帮你把剧本转化为专业的分镜表。准备好开始了吗？',
  },
  imageDesigner: {
    name: 'AI图像设计师',
    icon: '🎨',
    greeting: '你好！我是AI图像设计师，帮你生成角色和场景的提示词。让我们开始设计吧！',
  },
  artist: {
    name: 'AI美工助手',
    icon: '🖼️',
    greeting: '你好！我是AI美工助手，帮你生成角色、场景和关键帧图片。点击下方按钮开始一张一张生成，每张都可以查看效果后再继续。',
  },
  director: {
    name: 'AI导演助手',
    icon: '🎥',
    greeting: '你好！我是AI导演助手，帮你把关键帧图片转化为视频片段。让我们开拍吧！',
  },
}

export default function ChatPanel({ projectId, stage, onDataGenerated, autoStart, initialMessage, onArtistProgress }: ChatPanelProps) {
  // Debug: 输出接收到的 props
  console.log('[ChatPanel] props:', { projectId, stage, autoStart, initialMessage })
  
  const config = STAGE_CONFIG[stage]
  const { currentProject, updateProject, loadProject } = useProject()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TEXT_MODEL)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // 编剧快捷选项状态
  const [selectedEpisodes, setSelectedEpisodes] = useState(5)
  const [selectedGenre, setSelectedGenre] = useState('玄幻修仙')
  const [selectedAudience, setSelectedAudience] = useState('男频')
  const [hasStartedCreation, setHasStartedCreation] = useState(false)
  
  // 美工阶段状态
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
  const [selectedTxt2ImgModel, setSelectedTxt2ImgModel] = useState(DEFAULT_TXT2IMG_MODEL)
  const [selectedImg2ImgModel, setSelectedImg2ImgModel] = useState(DEFAULT_IMG2IMG_MODEL)
  const [showImageModelPicker, setShowImageModelPicker] = useState(false)

  // 记录是否已初始化（按阶段和项目ID）
  const initializedKeyRef = useRef<string | null>(null)
  
  // 初始化消息 - 仅在阶段切换或首次加载时执行
  useEffect(() => {
    // 等待项目数据加载完成
    if (!currentProject) return
    
    // 使用 stage + projectId 作为唯一标识，避免重复初始化
    const initKey = `${stage}-${currentProject.meta.id}`
    if (initializedKeyRef.current === initKey) {
      return
    }
    
    initializedKeyRef.current = initKey
    
    // 从项目元数据初始化编剧参数（首页传过来的选择）
    if (stage === 'screenwriter' && currentProject?.meta) {
      if (currentProject.meta.type) {
        setSelectedGenre(currentProject.meta.type)
      }
      if (currentProject.meta.totalEpisodes) {
        setSelectedEpisodes(currentProject.meta.totalEpisodes)
      }
      if (currentProject.meta.targetAudience) {
        // 转换受众值为显示文本
        const audienceMap: Record<string, string> = {
          'male': '男频',
          'female': '女频',
          'general': '通用'
        }
        setSelectedAudience(audienceMap[currentProject.meta.targetAudience] || '男频')
      }
    }
    
    if (currentProject?.chatHistory[stage]?.length) {
      const history = currentProject.chatHistory[stage]
      // 从项目加载历史消息
      setMessages(history)
      
      // 检查是否有完整的对话历史
      const userMessages = history.filter(m => m.role === 'user')
      const assistantMessages = history.filter(m => m.role === 'assistant')
      setHasStartedCreation(userMessages.length > 0 && assistantMessages.length > 0)
    } else {
      // 显示欢迎消息
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: config.greeting,
        timestamp: new Date().toISOString(),
      }])
      setHasStartedCreation(false)
    }
  }, [stage, currentProject, config.greeting])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 保存聊天记录到项目
  const saveChatHistory = useCallback(async (newMessages: ChatMessage[]) => {
    if (!currentProject) return
    
    const updatedProject = {
      ...currentProject,
      chatHistory: {
        ...currentProject.chatHistory,
        [stage]: newMessages,
      },
    }
    
    try {
      await updateProject(updatedProject)
    } catch (err) {
      console.error('保存聊天记录失败:', err)
    }
  }, [currentProject, stage, updateProject])

  // 根据当前阶段获取上下文数据（精简版，只传递核心信息）
  const getContextData = useCallback(() => {
    if (!currentProject) return undefined
    
    switch (stage) {
      case 'storyboard': {
        // 分镜阶段只需要剧本核心数据，不需要聊天历史等
        const screenwriter = currentProject.screenwriter
        if (!screenwriter) return undefined
        
        // 只提取分镜需要的核心信息：剧本、角色、世界观
        return {
          scripts: screenwriter.scripts,
          characters: screenwriter.characters,
          worldSetting: screenwriter.worldSetting,
        }
      }
      case 'imageDesigner': {
        // 图像设计阶段只需要分镜核心数据
        // 精简数据以避免超出 API token 限制
        const storyboard = currentProject.storyboard
        if (!storyboard) return undefined
        
        // 精简单个镜头数据，只保留关键字段
        const simplifyShot = (shot: Record<string, unknown>) => ({
          id: shot.shotId || shot.shotNumber || shot.id,
          loc: shot.location,  // 地点
          desc: shot.description || shot.content,  // 画面描述
          char: shot.character,  // 人物
          dur: shot.duration,  // 时长
        })
        
        // 兼容新旧数据格式
        let shots: Array<unknown> = []
        let episodeNum = 1
        
        if (storyboard.episodes && storyboard.episodes.length > 0) {
          // 新格式: { episodes: [...] }
          const ep = storyboard.episodes[0] as { shots?: Array<unknown>; episodeNumber?: number }
          shots = ep.shots || []
          episodeNum = ep.episodeNumber || 1
        } else {
          // 旧格式: { shots: [...] }
          const oldData = storyboard as unknown as { shots?: Array<unknown>; episodeNumber?: number }
          shots = oldData.shots || []
          episodeNum = oldData.episodeNumber || 1
        }
        
        if (shots.length === 0) return undefined
        
        // 返回精简后的分镜表
        return {
          ep: episodeNum,
          total: shots.length,
          shots: shots.map(s => simplifyShot(s as Record<string, unknown>)),
        }
      }
      default:
        // 编剧、美工和导演阶段不需要上下文数据
        return undefined
    }
  }, [currentProject, stage])

  // 发送消息的核心逻辑（可以直接传入消息内容）
  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return
    
    // 立即隐藏快捷选项
    setHasStartedCreation(true)

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      // 转换为 API 所需的 Message 格式
      const historyMessages: Message[] = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: Date.parse(m.timestamp),
          stage,
        }))

      // 获取上下文数据
      const contextData = getContextData()

      // 调用 AI 服务
      console.log('[ChatPanel] 发送消息, 历史记录数:', historyMessages.length, '上下文:', contextData)
      const response: ChatResponse = await sendChatMessage(
        messageContent,
        stage,
        historyMessages,
        { maxRetries: 2, model: selectedModel, contextData }
      )

      if (response.success && response.message) {
        const aiMessage: ChatMessage = {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          timestamp: new Date().toISOString(),
        }
        
        const updatedMessages = [...newMessages, aiMessage]
        setMessages(updatedMessages)
        
        // 保存聊天记录
        await saveChatHistory(updatedMessages)
        
        // 如果有结构化数据，触发回调
        console.log('[ChatPanel] response.data:', response.data)
        if (response.data && onDataGenerated) {
          console.log('[ChatPanel] 触发 onDataGenerated 回调')
          onDataGenerated(response.data)
        } else {
          console.log('[ChatPanel] 无数据或无回调: data=', !!response.data, 'callback=', !!onDataGenerated)
        }
      } else {
        setError(response.error || 'AI 响应失败')
      }
    } catch (err) {
      console.error('发送消息失败:', err)
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, stage, getContextData, selectedModel, saveChatHistory, onDataGenerated])

  // 发送消息（使用 input 状态）
  const handleSend = useCallback(() => {
    if (input.trim()) {
      sendMessage(input)
    }
  }, [input, sendMessage])

  // 开始创作（编剧快捷操作）
  const handleStartCreation = useCallback(() => {
    const prompt = `我要创作一个${selectedGenre}类型的短剧，共${selectedEpisodes}集，目标受众是${selectedAudience}。请帮我确定创意并输出状态摘要v1.0。`
    setHasStartedCreation(true)
    sendMessage(prompt)
  }, [selectedGenre, selectedEpisodes, selectedAudience, sendMessage])

  // ===== 美工阶段：手动模式生成单张图片 =====
  const [lastGenerateResult, setLastGenerateResult] = useState<GenerateNextResult | null>(null)
  
  const handleGenerateSingleImage = useCallback(async () => {
    if (isGeneratingImages) return
    
    // 检查是否有图像设计数据
    if (!currentProject?.imageDesigner) {
      setError('请先完成图像设计阶段')
      return
    }
    
    setIsGeneratingImages(true)
    setError(null)
    
    try {
      // 生成单张图片
      const result = await generateNextImage(projectId, {
        txt2imgModel: selectedTxt2ImgModel,
        img2imgModel: selectedImg2ImgModel,
      })
      setLastGenerateResult(result)
      
      // 更新进度信息
      setGenerationProgress({
        phase: result.phase,
        current: result.currentIndex,
        total: result.totalInPhase,
        currentItem: result.image?.name,
      })
      onArtistProgress?.({
        phase: result.phase,
        current: result.currentIndex,
        total: result.totalInPhase,
        currentItem: result.image?.name,
      })
      
      // 添加结果消息
      const phaseNames: Record<GenerationPhase, string> = {
        idle: '',
        characters: '👤 角色图',
        scenes: '🏙️ 场景图',
        keyframes: '🎬 关键帧',
        completed: '✅ 完成',
        error: '❌ 错误',
      }
      
      if (result.success && result.image) {
        const imageName = result.image.name || result.image.id
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${phaseNames[result.phase]} 生成成功：${imageName}\n进度: ${result.currentIndex}/${result.totalInPhase}`,
          timestamp: new Date().toISOString(),
        }])
      } else if (result.isAllDone) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '🎉 所有图片已生成完成！',
          timestamp: new Date().toISOString(),
        }])
      } else if (result.error) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ 生成失败: ${result.error}`,
          timestamp: new Date().toISOString(),
        }])
      }
      
      // 重新加载项目以更新画布
      await loadProject(projectId)
      
    } catch (err) {
      console.error('图片生成失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingImages(false)
    }
  }, [projectId, currentProject, isGeneratingImages, onArtistProgress, loadProject, selectedTxt2ImgModel, selectedImg2ImgModel])

  // 获取美工阶段统计信息
  // 1. 待生成总数从 imageDesigner 获取
  // 2. 已完成数量从 artist 获取
  const imageDesignerStats = stage === 'artist' && currentProject?.imageDesigner 
    ? extractPromptsFromImageDesigner(currentProject.imageDesigner as Parameters<typeof extractPromptsFromImageDesigner>[0])
    : null
  const artistCompletedStats = stage === 'artist' ? getArtistStats(currentProject?.artist) : null
  
  // 合并统计：总数来自 imageDesigner，完成数来自 artist
  const artistStats = imageDesignerStats ? {
    totalCharacters: imageDesignerStats.characterPrompts.length,
    totalScenes: imageDesignerStats.scenePrompts.length,
    totalKeyframes: imageDesignerStats.keyframePrompts.length,
    completedCharacters: artistCompletedStats?.completedCharacters || 0,
    completedScenes: artistCompletedStats?.completedScenes || 0,
    completedKeyframes: artistCompletedStats?.completedKeyframes || 0,
    hasErrors: artistCompletedStats?.hasErrors || false,
  } : null

  // 自动触发初始消息发送（从首页进入时）- 使用 sessionStorage 防止重复触发
  useEffect(() => {
    // 条件：从首页进入且有初始消息，且在编剧阶段
    if (!autoStart || !initialMessage || !currentProject || isLoading || stage !== 'screenwriter') return
    
    // 使用 sessionStorage 检查是否已经触发过（防止 React StrictMode 双重渲染）
    const autoStartKey = `autoStart-${currentProject.meta.id}`
    if (sessionStorage.getItem(autoStartKey)) {
      console.log('[ChatPanel] sessionStorage 已有标记，跳过自动发送')
      return
    }
    
    // 标记已触发
    sessionStorage.setItem(autoStartKey, 'true')
    setHasStartedCreation(true)
    
    // 直接使用项目元数据中的值
    const genre = currentProject.meta.type || '玄幻修仙'
    const episodes = currentProject.meta.totalEpisodes || 5
    const audienceMap: Record<string, string> = { 'male': '男频', 'female': '女频', 'general': '通用' }
    const audience = audienceMap[currentProject.meta.targetAudience || 'male'] || '男频'
    
    // 构建 prompt
    const prompt = `${initialMessage}\n\n【参数确认】题材：${genre}，集数：${episodes}集，受众：${audience}。请帮我确定创意并输出状态摘要v1.0。`
    
    console.log('[ChatPanel] 自动发送消息:', prompt.substring(0, 50) + '...')
    
    // 直接调用 sendMessage
    sendMessage(prompt)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, initialMessage, currentProject?.meta.id, isLoading, stage, sendMessage])

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 获取当前选中模型信息
  const currentModel = TEXT_MODELS.find(m => m.id === selectedModel) || TEXT_MODELS[0]

  return (
    <div className="chat-panel">
      {/* 头部 */}
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-icon">{config.icon}</span>
          <span className="chat-name">{config.name}</span>
        </div>
        
        {/* 模型选择器 */}
        <div className="model-selector">
          <button 
            className="model-selector-btn"
            onClick={() => setShowModelPicker(!showModelPicker)}
            title={currentModel.description}
          >
            <span className="model-icon">🤖</span>
            <span className="model-name">{currentModel.name}</span>
            <span className="model-arrow">{showModelPicker ? '▲' : '▼'}</span>
          </button>
          
          {showModelPicker && (
            <div className="model-picker-dropdown">
              <div className="model-picker-header">选择 AI 模型</div>
              
              {/* 推荐模型 */}
              <div className="model-group">
                <div className="model-group-label">⭐ 推荐</div>
                {TEXT_MODELS.filter(m => m.recommended).map(model => (
                  <button
                    key={model.id}
                    className={`model-option ${selectedModel === model.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id)
                      setShowModelPicker(false)
                    }}
                  >
                    <span className="model-option-name">{model.name}</span>
                    <span className="model-option-desc">{model.description}</span>
                    <span className={`model-tier tier-${model.tier}`}>{model.tier}</span>
                  </button>
                ))}
              </div>
              
              {/* 其他模型 */}
              <div className="model-group">
                <div className="model-group-label">📦 全部模型</div>
                {TEXT_MODELS.filter(m => !m.recommended).map(model => (
                  <button
                    key={model.id}
                    className={`model-option ${selectedModel === model.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedModel(model.id)
                      setShowModelPicker(false)
                    }}
                  >
                    <span className="model-option-name">{model.name}</span>
                    <span className="model-option-desc">{model.description}</span>
                    <span className={`model-tier tier-${model.tier}`}>{model.tier}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map(msg => (
          <div 
            key={msg.id} 
            className={`message ${msg.role}`}
          >
            {msg.role === 'assistant' && (
              <div className="message-avatar">{config.icon}</div>
            )}
            <div className="message-content">
              <p>{msg.content}</p>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">{config.icon}</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="message error">
            <div className="message-content error-content">
              <p>⚠️ {error}</p>
              <button className="retry-btn" onClick={() => setError(null)}>重试</button>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 编剧快捷选项 - 只在未开始创作时显示 */}
      {stage === 'screenwriter' && !hasStartedCreation && (
        <div className="quick-options">
          <div className="quick-option-row">
            <label>🎬 题材</label>
            <div className="option-buttons">
              {GENRE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`option-btn ${selectedGenre === opt.value ? 'active' : ''}`}
                  onClick={() => setSelectedGenre(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="quick-option-row">
            <label>📺 集数</label>
            <div className="option-buttons">
              {EPISODE_OPTIONS.map(num => (
                <button
                  key={num}
                  className={`option-btn ${selectedEpisodes === num ? 'active' : ''}`}
                  onClick={() => setSelectedEpisodes(num)}
                >
                  {num}集
                </button>
              ))}
            </div>
          </div>
          
          <div className="quick-option-row">
            <label>🎯 受众</label>
            <div className="option-buttons">
              {AUDIENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`option-btn ${selectedAudience === opt.value ? 'active' : ''}`}
                  onClick={() => setSelectedAudience(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          
          <button className="start-creation-btn" onClick={handleStartCreation}>
            🚀 开始创作
          </button>
        </div>
      )}

      {/* 美工阶段控制面板 - 手动生成模式 */}
      {stage === 'artist' && (
        <div className="artist-controls">
          {/* 统计信息 */}
          {artistStats && (artistStats.totalCharacters > 0 || artistStats.totalScenes > 0 || artistStats.totalKeyframes > 0) && (
            <div className="artist-stats">
              <div className="stat-row">
                <span>👤 角色图:</span>
                <span>{artistStats.completedCharacters}/{artistStats.totalCharacters}</span>
              </div>
              <div className="stat-row">
                <span>🏙️ 场景图:</span>
                <span>{artistStats.completedScenes}/{artistStats.totalScenes}</span>
              </div>
              <div className="stat-row">
                <span>🎬 关键帧:</span>
                <span>{artistStats.completedKeyframes}/{artistStats.totalKeyframes}</span>
              </div>
            </div>
          )}
          
          {/* 当前生成状态 */}
          {isGeneratingImages && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">⟳ 正在生成图片...</span>
              </div>
            </div>
          )}
          
          {/* 最后一次生成结果 */}
          {lastGenerateResult && !isGeneratingImages && lastGenerateResult.image && (
            <div className="last-generate-result">
              <div className="result-header">
                {lastGenerateResult.success ? '✅' : '❌'} 最后生成: {lastGenerateResult.image.name}
              </div>
              {lastGenerateResult.image.imageUrl && (
                <div className="result-preview">
                  <img 
                    src={lastGenerateResult.image.imageUrl} 
                    alt={lastGenerateResult.image.name || '生成的图片'}
                    style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px' }}
                  />
                </div>
              )}
              {lastGenerateResult.error && (
                <div className="result-error">错误: {lastGenerateResult.error}</div>
              )}
            </div>
          )}
          
          {/* 模型选择 */}
          <div className="image-model-selector">
            <div className="model-row">
              <label>🎨 文生图模型:</label>
              <select 
                value={selectedTxt2ImgModel} 
                onChange={e => setSelectedTxt2ImgModel(e.target.value)}
                disabled={isGeneratingImages}
              >
                {TXT2IMG_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="model-row">
              <label>🖼️ 图生图模型:</label>
              <select 
                value={selectedImg2ImgModel} 
                onChange={e => setSelectedImg2ImgModel(e.target.value)}
                disabled={isGeneratingImages}
              >
                {IMG2IMG_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="artist-actions">
            {lastGenerateResult?.isAllDone ? (
              <div className="all-done-message">
                🎉 所有图片已生成完成！
              </div>
            ) : (
              <button 
                className="start-generation-btn"
                onClick={handleGenerateSingleImage}
                disabled={!currentProject?.imageDesigner || isGeneratingImages}
              >
                {isGeneratingImages 
                  ? '⟳ 生成中...' 
                  : lastGenerateResult 
                    ? '➡️ 继续生成下一张' 
                    : '🎨 生成第一张图片'
                }
              </button>
            )}
          </div>
          
          {/* 提示信息 */}
          {!currentProject?.imageDesigner && (
            <div className="artist-hint">
              ⚠️ 请先完成图像设计阶段，生成提示词后再开始生成图片
            </div>
          )}
          
          {currentProject?.imageDesigner && !lastGenerateResult && !isGeneratingImages && (
            <div className="artist-hint" style={{ color: '#4caf50' }}>
              💡 点击上方按钮开始生成第一张图片，生成完成后可查看效果再继续
            </div>
          )}
        </div>
      )}

      {/* 输入区 */}
      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder={`对 ${config.name} 说点什么...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isLoading}
        />
        <div className="chat-actions">
          <button 
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
