/**
 * 聊天面板组件 - 左侧 AI 对话区
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Project, ProjectStage, ChatMessage, Message } from '@/types'
import { sendChatMessage, type ChatResponse } from '@/services'
import { useProject } from '@/contexts/ProjectContext'
import { TEXT_MODELS, DEFAULT_TEXT_MODEL, TXT2IMG_MODELS, IMG2IMG_MODELS, DEFAULT_TXT2IMG_MODEL, DEFAULT_IMG2IMG_MODEL } from '@/config'
import { 
  generateNextImage, 
  getArtistStats, 
  extractPromptsFromImageDesigner, 
  generateAllReferences,
  generateAllKeyframes,
  type GenerationProgress, 
  type GenerationPhase, 
  type GenerateNextResult,
  type BatchGenerationProgress,
  type BatchGenerationResult,
} from '@/services/artistService'
import {
  generateAllVideos,
  getDirectorStats,
  type VideoGenerationProgress,
} from '@/services/directorService'
import { TextShimmer } from '@/components/ui/text-shimmer'
import './ChatPanel.css'

function hasStageOutput(project: Project | null, stageId: ProjectStage): boolean {
  if (!project) return false

  switch (stageId) {
    case 'screenwriter': {
      // 兼容旧版/新版数据结构
      const sw: any = project.screenwriter
      return !!(sw?.outline?.length || sw?.scripts?.length || sw?.episodes?.length)
    }
    case 'storyboard': {
      // 兼容两种格式：
      // 1) 新格式: { episodes: [{ shots }] }
      // 2) 旧格式: { shots: [...] }
      const sb: any = project.storyboard
      const hasEpisodesShots = !!(sb?.episodes?.some((ep: any) => (ep?.shots?.length || 0) > 0))
      const hasDirectShots = !!((sb?.shots?.length || 0) > 0)
      return hasEpisodesShots || hasDirectShots
    }
    case 'imageDesigner':
      return !!(
        project.imageDesigner?.characterPrompts?.length ||
        project.imageDesigner?.scenePrompts?.length ||
        project.imageDesigner?.keyframePrompts?.length
      )
    default:
      return false
  }
}

function getStartSendGuideStorageKey(projectId: string, stage: ProjectStage): string {
  return `startSendGuideTried:${projectId}:${stage}`
}

// 各阶段 loading 文案配置
const STAGE_LOADING_TEXT: Record<ProjectStage, string> = {
  screenwriter: '编剧创作中...',
  storyboard: '分镜师创作中...',
  imageDesigner: '图像提示词创作中...',
  artist: '图像生成中...',
  director: '视频生成中...',
}

interface ChatPanelProps {
  projectId: string
  stage: ProjectStage
  onDataGenerated?: (data: unknown) => void // AI 生成数据的回调
  autoStart?: boolean // 从首页进入时自动开始创作
  initialMessage?: string // 首页传来的初始消息
  onArtistProgress?: (progress: GenerationProgress) => void // 美工阶段进度回调
  showKeyframeGuide?: boolean // 是否显示关键帧生成引导
  onKeyframeGuideClick?: () => void // 点击关键帧引导后的回调
}

// 编剧快捷选项配置
const EPISODE_OPTIONS = [5, 10, 15, 20, 30];
const GENRE_OPTIONS = [
  { value: 'fantasy_cultivation', label: '🔮 玄幻修仙' },
  { value: 'urban_romance', label: '💕 都市爱情' },
  { value: 'ceo_revenge', label: '👔 霸总复仇' },
  { value: 'palace_intrigue', label: '🏯 古装宫斗' },
  { value: 'mystery_thriller', label: '🔍 悬疑推理' },
  { value: 'comedy', label: '🤣 搞笑沙雕' },
  { value: 'workplace', label: '💼 现代职场' },
  { value: 'post_apocalyptic', label: '🌋 末世求生' },
];
const AUDIENCE_OPTIONS = [
  { value: '男频', label: '👦 男频' },
  { value: '女频', label: '👧 女频' },
  { value: '通用', label: '👥 通用' },
];

// 导演阶段视频参数配置
const VIDEO_DURATION_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const VIDEO_RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p 标清' },
  { value: '720p', label: '720p 高清' },
  // Lite版本不支持1080p
];
const VIDEO_ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '▭ 16:9 横屏', shape: '▭' },
  { value: '4:3', label: '▭ 4:3 标准', shape: '▭' },
  { value: '1:1', label: '□ 1:1 方形', shape: '□' },
  { value: '3:4', label: '▯ 3:4 竖屏', shape: '▯' },
  { value: '9:16', label: '▯ 9:16 手机', shape: '▯' },
  { value: '21:9', label: '━ 21:9 宽屏', shape: '━' },
];

// 美工阶段图片宽高比配置
const IMAGE_ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9 横屏', shape: '▭', width: 2560, height: 1440 },
  { value: '4:3', label: '4:3 标准', shape: '▭', width: 2304, height: 1728 },
  { value: '3:2', label: '3:2 摄影', shape: '▭', width: 2496, height: 1664 },
  { value: '1:1', label: '1:1 方形', shape: '□', width: 2048, height: 2048 },
  { value: '2:3', label: '2:3 竖版', shape: '▯', width: 1664, height: 2496 },
  { value: '3:4', label: '3:4 竖屏', shape: '▯', width: 1728, height: 2304 },
  { value: '9:16', label: '9:16 手机', shape: '▯', width: 1440, height: 2560 },
  { value: '21:9', label: '21:9 宽屏', shape: '━', width: 3024, height: 1296 },
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
    greeting: '你好！我是AI美工助手，帮你批量生成角色、场景和关键帧图片。\n\n第一步：点击「批量生成角色和场景图」并行生成所有参考图\n第二步：角色和场景图完成后，点击「批量生成关键帧」并行生成所有关键帧',
  },
  director: {
    name: 'AI导演助手',
    icon: '🎥',
    greeting: '你好！我是AI导演助手，帮你把关键帧图片转化为视频片段。让我们开拍吧！',
  },
}

export default function ChatPanel({ projectId, stage, onDataGenerated, autoStart, initialMessage, onArtistProgress, showKeyframeGuide, onKeyframeGuideClick }: ChatPanelProps) {
  // Debug: 输出接收到的 props
  console.log('[ChatPanel] props:', { projectId, stage, autoStart, initialMessage })
  
  const config = STAGE_CONFIG[stage]
  const { currentProject, updateProject, loadProject } = useProject()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [showStartSendGuide, setShowStartSendGuide] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel] = useState(DEFAULT_TEXT_MODEL)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // 编剧快捷选项状态
  const [selectedEpisodes, setSelectedEpisodes] = useState(5)
  const [selectedGenre, setSelectedGenre] = useState('fantasy_cultivation')
  const [selectedAudience, setSelectedAudience] = useState('男频')
  // 如果是 autoStart 模式，初始就标记为已开始创作，避免显示快捷选项
  const [hasStartedCreation, setHasStartedCreation] = useState(autoStart === true)
  
  // 美工阶段状态
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
  const [selectedTxt2ImgModel, setSelectedTxt2ImgModel] = useState(DEFAULT_TXT2IMG_MODEL)
  const [selectedImg2ImgModel, setSelectedImg2ImgModel] = useState(DEFAULT_IMG2IMG_MODEL)
  const [showImageModelPicker, setShowImageModelPicker] = useState(false)
  
  // 导演阶段状态 - 视频生成参数
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoResolution, setVideoResolution] = useState<'480p' | '720p'>('480p')
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'>('16:9')
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false)
  const [videoProgress, setVideoProgress] = useState<VideoGenerationProgress | null>(null)
  const videoAbortRef = useRef<AbortController | null>(null)

  // 记录是否已初始化（按阶段和项目ID）
  const [selectedImageAspectRatio, setSelectedImageAspectRatio] = useState('16:9')

  // 记录是否已初始化（按阶段和项目ID）
  const initializedKeyRef = useRef<string | null>(null)
  // 记录是否已发送过 autoStart 请求（防止重复发送）
  const autoStartSentRef = useRef<string | null>(null)
  // 发送请求锁（防止同一时刻重复请求）
  const sendLockRef = useRef(false)
  
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

    // 切换阶段时，默认清空输入 & 隐藏引导（必要时下方会再预填“开始”）
    setInput('')
    setShowStartSendGuide(false)

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
          'general': '通用',
        }
        setSelectedAudience(audienceMap[currentProject.meta.targetAudience] || '男频')
      }
    }

    const history = currentProject?.chatHistory[stage] || []

    if (history.length) {
      // 从项目加载历史消息
      setMessages(history)

      // 检查是否有完整的对话历史
      const userMessages = history.filter(m => m.role === 'user')
      const assistantMessages = history.filter(m => m.role === 'assistant')
      setHasStartedCreation(userMessages.length > 0 && assistantMessages.length > 0)
    } else {
      // 普通模式：显示欢迎消息
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: config.greeting,
          timestamp: new Date().toISOString(),
        },
      ])
      setHasStartedCreation(false)

      // 分镜/设计阶段：从上一阶段已完成进入，首次引导用户点击发送
      if (stage === 'storyboard' || stage === 'imageDesigner') {
        const prevStage: ProjectStage = stage === 'storyboard' ? 'screenwriter' : 'storyboard'
        const prevCompleted = hasStageOutput(currentProject, prevStage)
        const currentCompleted = hasStageOutput(currentProject, stage)

        // 若用户已尝试过“开始”，则不再重复引导（避免失败重进时反复弹）
        const key = getStartSendGuideStorageKey(currentProject.meta.id, stage)
        let tried = false
        try {
          tried = localStorage.getItem(key) === '1'
        } catch {
          // ignore
        }

        if (prevCompleted && !currentCompleted && !tried) {
          setInput('开始')
          setShowStartSendGuide(true)
        }
      }
    }
  }, [stage, currentProject, config.greeting])

  // autoStart 模式：从首页进入时自动发送一次请求
  useEffect(() => {
    if (!autoStart || !initialMessage || !currentProject || stage !== 'screenwriter') return
    
    // 已有历史记录，不需要自动发送
    if (currentProject.chatHistory[stage]?.length) return
    
    // 防止重复发送（useRef + sessionStorage，兼容 StrictMode 重复挂载）
    const key = `autoStart:screenwriter:${currentProject.meta.id}`
    if (autoStartSentRef.current === key) return
    try {
      if (sessionStorage.getItem(key) === '1') return
    } catch {
      // sessionStorage 可能在某些环境不可用（如隐私模式），忽略即可
    }
    autoStartSentRef.current = key
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // ignore
    }
    
    // 构建 prompt
    const genre = currentProject.meta.type || '玄幻修仙'
    const episodes = currentProject.meta.totalEpisodes || 5
    const audienceMap: Record<string, string> = { 'male': '男频', 'female': '女频', 'general': '通用' }
    const audience = audienceMap[currentProject.meta.targetAudience || 'male'] || '男频'
    const prompt = `${initialMessage}\n\n【参数确认】题材：${genre}，集数：${episodes}集，受众：${audience}。请帮我确定创意并输出状态摘要v1.0。`
    
    // 直接调用 sendMessage
    sendMessage(prompt)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, currentProject?.meta.id])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 保存聊天记录到项目
  const saveChatHistory = useCallback(async (newMessages: ChatMessage[]) => {
    if (!currentProject) return

    try {
      await updateProject(prev => ({
        ...prev,
        chatHistory: {
          ...prev.chatHistory,
          [stage]: newMessages,
        },
      }))
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
        // 注意：分镜保存到项目后的字段为 content/assignee（不是 description/character）
        const simplifyShot = (shot: Record<string, unknown>) => {
          const id = (shot.shotId as string) || (shot.shotNumber as string) || (shot.id as string) || ''
          const loc = (shot.location as string) || ''
          const desc = (shot.description as string) || (shot.content as string) || ''
          const char = (shot.assignee as string) || (shot.character as string) || ''
          const dur = shot.duration as number
          return { id, loc, desc, char, dur }
        }

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

        const simplifiedShots = shots.map(s => simplifyShot(s as Record<string, unknown>))

        // 给 AI 提供“应当生成哪些内容”的明确清单，减少漏项
        const shotIds = simplifiedShots
          .map(s => String(s.id || '').trim())
          .filter(Boolean)

        const scenes = Array.from(new Set(
          simplifiedShots
            .map(s => String(s.loc || '').trim())
            .filter(Boolean)
        ))

        const splitNames = (text: string): string[] => {
          const t = String(text || '').trim()
          if (!t) return []
          // 常见无人物标记
          if (['无', '空', '空镜', '空镜无人物'].includes(t)) return []
          return t
            .split(/\s*[、,，\/|&]+\s*/g)
            .map(x => x.trim())
            .filter(Boolean)
            .filter(x => !['无', '空', '空镜'].includes(x))
        }

        const characters = Array.from(new Set(
          simplifiedShots.flatMap(s => splitNames(s.char))
        ))

        // 返回精简后的分镜表 + 期望清单
        return {
          ep: episodeNum,
          total: simplifiedShots.length,
          shotIds,
          characters,
          scenes,
          shots: simplifiedShots,
        }
      }
      default:
        // 编剧、美工和导演阶段不需要上下文数据
        return undefined
    }
  }, [currentProject, stage])

  // 发送消息的核心逻辑（可以直接传入消息内容）
  const sendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim()) return
    if (sendLockRef.current) return
    sendLockRef.current = true
    
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
      const maxRetries = stage === 'screenwriter' ? 1 : stage === 'imageDesigner' ? 3 : 2
      const response: ChatResponse = await sendChatMessage(
        messageContent,
        stage,
        historyMessages,
        { maxRetries, model: selectedModel, contextData }
      )

      if (response.success && response.message) {
        const aiMessage: ChatMessage = {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          timestamp: new Date().toISOString(),
        }
        const successTip: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '✅ 已生成，请从页面顶部点击进入下一个阶段',
          timestamp: new Date().toISOString(),
        }
        
        const updatedMessages = [...newMessages, aiMessage, successTip]
        setMessages(updatedMessages)
        
        // 保存聊天记录
        await saveChatHistory(updatedMessages)
        
        // 如果有结构化数据，触发回调
        console.log('[ChatPanel] response.data:', response.data)
        if (response.data && onDataGenerated) {
          console.log('[ChatPanel] 触发 onDataGenerated 回调')
          onDataGenerated(response.data)
        }
      } else {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ 生成失败：${response.error || 'AI 响应失败'}`,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, errorMessage])
        setError(response.error || 'AI 响应失败')
      }
    } catch (err) {
      console.error('发送消息失败:', err)
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      sendLockRef.current = false
      setIsLoading(false)
    }
  }, [messages, stage, getContextData, selectedModel, saveChatHistory, onDataGenerated])

  // 发送消息（使用 input 状态）
  const handleSend = useCallback(() => {
    if (!input.trim()) return

    // 记录一次“已尝试开始”，避免再次进入时重复弹引导
    if (showStartSendGuide && currentProject && (stage === 'storyboard' || stage === 'imageDesigner')) {
      const key = getStartSendGuideStorageKey(currentProject.meta.id, stage)
      try {
        localStorage.setItem(key, '1')
      } catch {
        // ignore
      }
      setShowStartSendGuide(false)
    }

    sendMessage(input)
  }, [input, sendMessage, showStartSendGuide, currentProject, stage])

  // 开始创作（编剧快捷操作）
  const handleStartCreation = useCallback(() => {
    // 将英文value转换为中文label用于prompt
    const genreLabel = GENRE_OPTIONS.find(opt => opt.value === selectedGenre)?.label.replace(/^[^\s]+\s/, '') || selectedGenre
    const prompt = `我要创作一个${genreLabel}类型的短剧，共${selectedEpisodes}集，目标受众是${selectedAudience}。请帮我确定创意并输出状态摘要v1.0。`
    setHasStartedCreation(true)
    sendMessage(prompt)
  }, [selectedGenre, selectedEpisodes, selectedAudience, sendMessage])

  // ===== 美工阶段：批量生成图片 =====
  const [lastGenerateResult, setLastGenerateResult] = useState<GenerateNextResult | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchGenerationProgress | null>(null)
  const [batchResult, setBatchResult] = useState<BatchGenerationResult | null>(null)
  
  // 批量生成角色和场景图
  const handleGenerateReferences = useCallback(async () => {
    if (isGeneratingImages) return
    
    if (!currentProject?.imageDesigner) {
      setError('请先完成图像设计阶段')
      return
    }
    
    setIsGeneratingImages(true)
    setError(null)
    setBatchResult(null)
    
    // 添加开始消息
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '🚀 开始批量生成角色和场景参考图，请稍候...',
      timestamp: new Date().toISOString(),
    }])
    
    // 获取选中的宽高比对应的宽高
    const aspectRatioOption = IMAGE_ASPECT_RATIO_OPTIONS.find(opt => opt.value === selectedImageAspectRatio) || IMAGE_ASPECT_RATIO_OPTIONS[0]
    
    try {
      const result = await generateAllReferences(projectId, {
        concurrency: 5,
        width: aspectRatioOption.width,
        height: aspectRatioOption.height,
        onProgress: (progress) => {
          setBatchProgress(progress)
          setGenerationProgress({
            phase: progress.phase,
            current: progress.completed,
            total: progress.total,
            currentItem: progress.currentName,
          })
        },
      })
      
      setBatchResult(result)
      
      // 添加结果消息
      const successMsg = result.success 
        ? `✅ 角色和场景图生成完成！\n成功: ${result.successCount} 张`
        : `⚠️ 角色和场景图生成完成\n成功: ${result.successCount} 张，失败: ${result.failCount} 张`
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: successMsg,
        timestamp: new Date().toISOString(),
      }])
      
      await loadProject(projectId)
      
    } catch (err) {
      console.error('批量生成失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingImages(false)
      setBatchProgress(null)
    }
  }, [projectId, currentProject, isGeneratingImages, loadProject, selectedImageAspectRatio])
  
  // 批量生成关键帧图片
  const handleGenerateKeyframes = useCallback(async () => {
    if (isGeneratingImages) return
    
    if (!currentProject?.imageDesigner) {
      setError('请先完成图像设计阶段')
      return
    }
    
    if (!currentProject?.artist?.characterImages?.length || !currentProject?.artist?.sceneImages?.length) {
      setError('请先生成角色和场景参考图')
      return
    }
    
    setIsGeneratingImages(true)
    setError(null)
    setBatchResult(null)
    
    // 添加开始消息
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '🚀 开始批量生成关键帧图片，请稍候...',
      timestamp: new Date().toISOString(),
    }])
    
    // 获取选中的宽高比对应的宽高
    const aspectRatioOption = IMAGE_ASPECT_RATIO_OPTIONS.find(opt => opt.value === selectedImageAspectRatio) || IMAGE_ASPECT_RATIO_OPTIONS[0]
    
    try {
      const result = await generateAllKeyframes(projectId, {
        concurrency: 5,
        width: aspectRatioOption.width,
        height: aspectRatioOption.height,
        onProgress: (progress) => {
          setBatchProgress(progress)
          setGenerationProgress({
            phase: progress.phase,
            current: progress.completed,
            total: progress.total,
            currentItem: progress.currentName,
          })
        },
      })
      
      setBatchResult(result)
      setLastGenerateResult({ success: true, phase: 'completed', currentIndex: 0, totalInPhase: 0, isAllDone: true })
      
      // 添加结果消息
      const successMsg = result.success 
        ? `🎉 关键帧图片生成完成！\n成功: ${result.successCount} 张\n\n所有图片已生成完毕！`
        : `⚠️ 关键帧图片生成完成\n成功: ${result.successCount} 张，失败: ${result.failCount} 张`
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: successMsg,
        timestamp: new Date().toISOString(),
      }])
      
      await loadProject(projectId)
      
    } catch (err) {
      console.error('批量生成关键帧失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingImages(false)
      setBatchProgress(null)
    }
  }, [projectId, currentProject, isGeneratingImages, loadProject, selectedImageAspectRatio])

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
    failedCharacters: artistCompletedStats?.failedCharacters || 0,
    failedScenes: artistCompletedStats?.failedScenes || 0,
    failedKeyframes: artistCompletedStats?.failedKeyframes || 0,
    hasErrors: artistCompletedStats?.hasErrors || false,
  } : null
  
  // 计算失败图片总数
  const totalFailedImages = artistStats 
    ? (artistStats.failedCharacters + artistStats.failedScenes + artistStats.failedKeyframes)
    : 0

  // 获取导演阶段统计信息
  const directorStats = stage === 'director' && currentProject 
    ? getDirectorStats(currentProject)
    : null

  // 批量生成视频
  const handleGenerateAllVideos = useCallback(async () => {
    // 若正在生成，则再次点击视为取消
    if (isGeneratingVideos) {
      videoAbortRef.current?.abort()
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⏹️ 已取消批量生成',
        timestamp: new Date().toISOString(),
      }])
      return
    }

    if (!currentProject) return
    
    // 兼容两种分镜数据格式：
    // 1. 多集格式: { episodes: [{ shots }] }
    // 2. 单集格式: { shots: [...] }
    const storyboard = currentProject.storyboard as {
      episodes?: Array<{ shots?: unknown[] }>;
      shots?: unknown[];
    } | undefined;
    
    const hasEpisodes = storyboard?.episodes && storyboard.episodes.length > 0;
    const hasDirectShots = storyboard?.shots && storyboard.shots.length > 0;
    
    if (!storyboard || (!hasEpisodes && !hasDirectShots)) {
      setError('请先完成分镜阶段')
      return
    }
    
    if (!currentProject.artist?.keyframeImages?.length) {
      setError('请先在美工阶段生成关键帧图片')
      return
    }
    
    setIsGeneratingVideos(true)
    setError(null)

    // 创建 AbortController，用于取消
    const controller = new AbortController()
    videoAbortRef.current = controller
    
    // 添加开始消息
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `🎬 开始批量生成视频...\n分辨率: ${videoResolution}\n宽高比: ${videoAspectRatio}`,
      timestamp: new Date().toISOString(),
    }])
    
    try {
      const result = await generateAllVideos(projectId, {
        resolution: videoResolution,
        ratio: videoAspectRatio,
        onProgress: (progress) => {
          setVideoProgress(progress)
        },
        onVideoGenerated: (video) => {
          console.log('视频生成完成:', video.shotNumber, video.status)
        },
        abortSignal: controller.signal,
      })
      
      // 添加结果消息
      const completedCount = result.videos.filter(v => v.status === 'completed').length
      const failedCount = result.videos.filter(v => v.status === 'failed').length
      
      const successMsg = result.success 
        ? `🎉 视频生成完成！\n成功: ${completedCount} 个视频片段`
        : `⚠️ 视频生成完成\n成功: ${completedCount} 个，失败: ${failedCount} 个\n${result.errors.slice(0, 3).join('\n')}`
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: successMsg,
        timestamp: new Date().toISOString(),
      }])
      
      await loadProject(projectId)
      
    } catch (err) {
      console.error('批量生成视频失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingVideos(false)
      setVideoProgress(null)
      videoAbortRef.current = null
    }
  }, [projectId, currentProject, isGeneratingVideos, videoResolution, videoAspectRatio, loadProject])

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-panel">
      {/* 头部 */}
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-icon">{config.icon}</span>
          <span className="chat-name">{config.name}</span>
        </div>
        
        {/* 模型标签 - 固定显示 GPT-5 Nano */}
        <div className="model-selector">
          <div className="model-label">
            <span className="model-icon">🤖</span>
            <span className="model-name">GPT-5 Nano</span>
          </div>
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
            <div className="message-content loading-shimmer">
              <TextShimmer duration={1.5}>
                {STAGE_LOADING_TEXT[stage]}
              </TextShimmer>
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

      {/* 导演阶段控制面板 - 视频生成参数 */}
      {stage === 'director' && (
        <div className="director-controls">
          {/* 统计信息 */}
          {directorStats && directorStats.totalShots > 0 && (
            <div className="director-stats">
              <div className="stat-row">
                <span>🎬 总镜头数:</span>
                <span>{directorStats.totalShots}</span>
              </div>
              <div className="stat-row">
                <span>✅ 已完成:</span>
                <span>
                  {directorStats.completedVideos}
                  {directorStats.failedVideos > 0 && <span style={{color: 'red', marginLeft: '4px'}}>(失败{directorStats.failedVideos})</span>}
                </span>
              </div>
              <div className="stat-row">
                <span>⏳ 待生成:</span>
                <span>{directorStats.pendingVideos}</span>
              </div>
              {directorStats.progress > 0 && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${directorStats.progress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* 视频生成进度 */}
          {isGeneratingVideos && videoProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">
                  ⟳ 正在生成视频...
                </span>
              </div>
              <div className="progress-detail">
                进度: {videoProgress.current}/{videoProgress.total}
                {videoProgress.currentShot && ` - ${videoProgress.currentShot}`}
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="director-params">
            <div className="param-row">
              <label>📺 分辨率</label>
              <select 
                value={videoResolution}
                onChange={(e) => setVideoResolution(e.target.value as '480p' | '720p')}
                className="param-select"
                disabled={isGeneratingVideos}
              >
                {VIDEO_RESOLUTION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            <div className="param-row">
              <label>📏 宽高比</label>
              <select 
                value={videoAspectRatio}
                onChange={(e) => setVideoAspectRatio(e.target.value as '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9')}
                className="param-select"
                disabled={isGeneratingVideos}
              >
                {VIDEO_ASPECT_RATIO_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.shape} {opt.value}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* 批量生成按钮 */}
          <div className="director-actions">
            {directorStats && directorStats.completedVideos === directorStats.totalShots && directorStats.totalShots > 0 ? (
              <div className="all-done-message">
                🎉 所有视频已生成完成！
              </div>
            ) : (
              <button 
                className={`start-generation-btn ${isGeneratingVideos ? 'generating' : ''}`}
                onClick={handleGenerateAllVideos}
                disabled={!isGeneratingVideos && !currentProject?.artist?.keyframeImages?.length}
              >
                {isGeneratingVideos
                  ? `⏹️ 中止生成 ${videoProgress?.current || 0}/${videoProgress?.total || 0}` 
                  : directorStats && directorStats.completedVideos > 0
                    ? `🔄 继续生成视频 (${directorStats.completedVideos}/${directorStats.totalShots})`
                    : `🎬 批量生成视频 (${directorStats?.totalShots || 0}个镜头)`
                }
              </button>
            )}
          </div>
          
          {/* 提示信息 */}
          {!currentProject?.artist?.keyframeImages?.length && (
            <div className="director-hint warning">
              ⚠️ 请先在美工阶段生成关键帧图片
            </div>
          )}
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
                <span>
                  {artistStats.completedCharacters}/{artistStats.totalCharacters}
                  {artistStats.failedCharacters > 0 && <span style={{color: 'red', marginLeft: '4px'}}>(失败{artistStats.failedCharacters})</span>}
                </span>
              </div>
              <div className="stat-row">
                <span>🏙️ 场景图:</span>
                <span>
                  {artistStats.completedScenes}/{artistStats.totalScenes}
                  {artistStats.failedScenes > 0 && <span style={{color: 'red', marginLeft: '4px'}}>(失败{artistStats.failedScenes})</span>}
                </span>
              </div>
              <div className="stat-row">
                <span>🎬 关键帧:</span>
                <span>
                  {artistStats.completedKeyframes}/{artistStats.totalKeyframes}
                  {artistStats.failedKeyframes > 0 && <span style={{color: 'red', marginLeft: '4px'}}>(失败{artistStats.failedKeyframes})</span>}
                </span>
              </div>
              {totalFailedImages > 0 && (
                <div className="stat-row" style={{marginTop: '8px', color: '#ff9800'}}>
                  ⚠️ 有 {totalFailedImages} 张图片生成失败，点击「继续生成」可自动重试
                </div>
              )}
            </div>
          )}
          
          {/* 当前生成状态 */}
          {isGeneratingImages && batchProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">
                  ⟳ 正在生成{batchProgress.phase === 'characters' ? '角色图' : batchProgress.phase === 'scenes' ? '场景图' : '关键帧'}...
                </span>
              </div>
              <div className="progress-detail">
                进度: {batchProgress.completed}/{batchProgress.total}
                {batchProgress.currentName && ` - ${batchProgress.currentName}`}
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          {isGeneratingImages && !batchProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">⟳ 正在生成图片...</span>
              </div>
            </div>
          )}
          
          {/* 图片宽高比选择器 */}
          <div className="artist-params">
            <div className="param-row">
              <label>🖼️ 宽高比</label>
              <div className="aspect-ratio-selector">
                <span className="aspect-shape-preview" title={`形状预览: ${IMAGE_ASPECT_RATIO_OPTIONS.find(opt => opt.value === selectedImageAspectRatio)?.shape || '□'}`}>
                  {IMAGE_ASPECT_RATIO_OPTIONS.find(opt => opt.value === selectedImageAspectRatio)?.shape || '□'}
                </span>
                <select 
                  value={selectedImageAspectRatio}
                  onChange={(e) => setSelectedImageAspectRatio(e.target.value)}
                  className="param-select"
                  disabled={isGeneratingImages}
                >
                  {IMAGE_ASPECT_RATIO_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.shape} {opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="artist-actions">
            {lastGenerateResult?.isAllDone ? (
              <div className="all-done-message">
                🎉 所有图片已生成完成！
              </div>
            ) : (
              <>
                {/* 第一步：生成角色和场景图 */}
                <button 
                  className="start-generation-btn"
                  onClick={handleGenerateReferences}
                  disabled={!currentProject?.imageDesigner || isGeneratingImages}
                >
                  {isGeneratingImages && (batchProgress?.phase === 'characters' || batchProgress?.phase === 'scenes')
                    ? `⟳ 生成中... ${batchProgress?.completed || 0}/${batchProgress?.total || 0}` 
                    : artistStats && (artistStats.completedCharacters > 0 || artistStats.completedScenes > 0)
                      ? `🔄 重新生成角色和场景图 (${artistStats.completedCharacters + artistStats.completedScenes}/${artistStats.totalCharacters + artistStats.totalScenes})`
                      : `🎨 批量生成角色和场景图 (${artistStats?.totalCharacters || 0}+${artistStats?.totalScenes || 0})`
                  }
                </button>
                
                {/* 第二步：生成关键帧（需要角色和场景图完成后才能点击） */}
                <div className="keyframe-btn-wrapper">
                  <button 
                    className="start-generation-btn keyframe-btn"
                    onClick={() => {
                      onKeyframeGuideClick?.()
                      handleGenerateKeyframes()
                    }}
                    disabled={
                      !currentProject?.imageDesigner || 
                      isGeneratingImages ||
                      !currentProject?.artist?.characterImages?.length ||
                      !currentProject?.artist?.sceneImages?.length
                    }
                  >
                    {isGeneratingImages && batchProgress?.phase === 'keyframes'
                      ? `⟳ 生成中... ${batchProgress?.completed || 0}/${batchProgress?.total || 0}` 
                      : artistStats && artistStats.completedKeyframes > 0
                        ? `🔄 重新生成关键帧 (${artistStats.completedKeyframes}/${artistStats.totalKeyframes})`
                        : `🎬 批量生成关键帧 (${artistStats?.totalKeyframes || 0})`
                    }
                  </button>
                  
                  {/* 关键帧生成引导气泡 */}
                  {showKeyframeGuide && !isGeneratingImages && (
                    <div className="keyframe-guide">
                      <div className="keyframe-guide-content">
                        <span className="keyframe-guide-icon">👇</span>
                        <span className="keyframe-guide-text">角色和场景图已完成，点击这里继续生成关键帧！</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          
          {/* 提示信息 */}
          {!currentProject?.imageDesigner && (
            <div className="artist-hint">
              ⚠️ 请先完成图像设计阶段，生成提示词后再开始生成图片
            </div>
          )}
          
          {currentProject?.imageDesigner && !artistStats?.completedCharacters && !artistStats?.completedScenes && !isGeneratingImages && (
            <div className="artist-hint" style={{ color: '#4caf50' }}>
              💡 点击「批量生成角色和场景图」开始第一步，系统将并行生成所有参考图
            </div>
          )}
          
          {(currentProject?.artist?.characterImages?.length ?? 0) > 0 && (currentProject?.artist?.sceneImages?.length ?? 0) > 0 && !artistStats?.completedKeyframes && !isGeneratingImages && (
            <div className="artist-hint" style={{ color: '#2196f3' }}>
              💡 角色和场景图已完成，点击「批量生成关键帧」继续生成关键帧图片
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
          <div className="send-btn-wrapper">
            {showStartSendGuide && !isLoading && input.trim() === '开始' && (
              <div className="send-guide">
                <div className="send-guide-content">
                  <span className="send-guide-icon">👇</span>
                  <span className="send-guide-text">点击「发送」开始</span>
                </div>
              </div>
            )}
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
    </div>
  )
}
