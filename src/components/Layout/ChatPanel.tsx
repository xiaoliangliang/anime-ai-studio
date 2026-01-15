/**
 * 聊天面板组件 - 左侧 AI 对话区
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { Project, ProjectStage, ChatMessage, Message } from '@/types'
import { sendChatMessage, type ChatResponse } from '@/services'
import { useProject } from '@/contexts/ProjectContext'
import {
  TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  TXT2IMG_MODELS,
  IMG2IMG_MODELS,
  DEFAULT_TXT2IMG_MODEL,
  DEFAULT_IMG2IMG_MODEL,
  ENABLE_IMAGE_GENERATION,
  ENABLE_VIDEO_GENERATION,
  IMAGE_GENERATION_DISABLED_MESSAGE,
  VIDEO_GENERATION_DISABLED_MESSAGE,
} from '@/config'
import { IMAGE_ASPECT_RATIO_OPTIONS } from '@/config/imageAspectRatios'
import { 
  generateNextImage, 
  getArtistStats, 
  extractPromptsFromImageDesigner, 
  generateAllReferences,
  generateAllKeyframes,
  type GenerationProgress as ArtistGenerationProgress, 
  type GenerationPhase as ArtistGenerationPhase, 
  type GenerateNextResult,
  type BatchGenerationProgress,
  type BatchGenerationResult,
} from '@/services/artistService'
import {
  createGenerationController,
  restoreGenerationController,
  canGenerateKeyframes,
  type GenerationState,
  type GenerationProgress,
  type GenerationPhase,
  type IGenerationController,
} from '@/services/generationController'
import {
  generateAllVideos,
  getDirectorStats,
  type VideoGenerationProgress,
} from '@/services/directorService'
import { getDirectorVideoConfig, setDirectorVideoConfig } from '@/services/directorConfig'
import { exportDirectorVideosAsZip, type DirectorZipExportProgress } from '@/services/directorExportService'
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
  onArtistProgress?: (progress: ArtistGenerationProgress) => void // 美工阶段进度回调
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
  
  // 新版 GenerationController 状态
  const [generationController, setGenerationController] = useState<IGenerationController | null>(null)
  const [generationState, setGenerationState] = useState<GenerationState>('idle')
  
  // 导演阶段状态 - 视频生成参数
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoResolution, setVideoResolution] = useState<'480p' | '720p'>(() => {
    return getDirectorVideoConfig(projectId).resolution
  })
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'>(() => {
    return getDirectorVideoConfig(projectId).ratio
  })
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false)
  const [videoProgress, setVideoProgress] = useState<VideoGenerationProgress | null>(null)
  const videoAbortRef = useRef<AbortController | null>(null)

  // 导演阶段：批量导出 ZIP
  const [isExportingVideosZip, setIsExportingVideosZip] = useState(false)
  const [exportZipProgress, setExportZipProgress] = useState<DirectorZipExportProgress | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)

  const getAspectRatioStorageKey = useCallback(
    () => `artistImageAspectRatio:${projectId}`,
    [projectId]
  )

  // 美工阶段：图片宽高比（持久化到 localStorage，供画布上的单张重新生成复用）
  const [selectedImageAspectRatio, setSelectedImageAspectRatio] = useState(() => {
    try {
      return localStorage.getItem(`artistImageAspectRatio:${projectId}`) || '16:9'
    } catch {
      return '16:9'
    }
  })
  const selectedAspectOption = useMemo(
    () => IMAGE_ASPECT_RATIO_OPTIONS.find(opt => opt.value === selectedImageAspectRatio) || IMAGE_ASPECT_RATIO_OPTIONS[0],
    [selectedImageAspectRatio]
  )

  // 记录是否已初始化（按阶段和项目ID）
  const initializedKeyRef = useRef<string | null>(null)
  // 记录是否已发送过 autoStart 请求（防止重复发送）
  const autoStartSentRef = useRef<string | null>(null)
  // 发送请求锁（防止同一时刻重复请求）
  const sendLockRef = useRef(false)

  // 导演阶段：从 localStorage 同步（项目切换/重新进入导演阶段时）
  useEffect(() => {
    if (stage !== 'director') return
    const cfg = getDirectorVideoConfig(projectId)
    setVideoResolution(cfg.resolution)
    setVideoAspectRatio(cfg.ratio)
  }, [projectId, stage])
  
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

  // 美工阶段：初始化 GenerationController 并恢复状态
  // 注意：不要依赖 currentProject.imageDesigner 的对象引用（loadProject 会导致对象变更），否则会重复初始化控制器
  useEffect(() => {
    const hasImageDesigner = !!currentProject?.imageDesigner
    if (stage !== 'artist' || !hasImageDesigner) return
    
    const initController = async () => {
      try {
        const restored = await restoreGenerationController(projectId, {
          width: selectedAspectOption.width,
          height: selectedAspectOption.height,
          onProgress: (progress) => {
            setGenerationProgress(progress)
            onArtistProgress?.({
              phase: progress.phase as ArtistGenerationPhase,
              current: progress.current,
              total: progress.total,
              currentItem: progress.currentItem,
            })
          },
          onStateChange: (newState) => {
            setGenerationState(newState)
            setIsGeneratingImages(newState === 'running' || newState === 'pausing')
          },
          onImageGenerated: async (image, phase) => {
            // 重新加载项目以更新画布
            await loadProject(projectId)
          },
          onComplete: async (result) => {
            setIsGeneratingImages(false)
            await loadProject(projectId)
            
            const successMsg = result.success 
              ? `🎉 所有图片生成完成！\n成功: ${result.characterImages.length + result.sceneImages.length + result.keyframeImages.length} 张`
              : `⚠️ 图片生成完成\n失败: ${result.errors.length} 张`
            
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: successMsg,
              timestamp: new Date().toISOString(),
            }])
          },
          onError: (error) => {
            setError(error)
          },
        })
        
        setGenerationController(restored.controller)
        setGenerationState(restored.suggestedState)
        setGenerationProgress(restored.progress)
      } catch (err) {
        console.error('Failed to initialize GenerationController:', err)
      }
    }
    
    initController()
  }, [stage, projectId, !!currentProject?.imageDesigner, loadProject, onArtistProgress, selectedAspectOption.width, selectedAspectOption.height])

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
  
  const pushAssistantMessage = useCallback((content: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
      },
    ])
  }, [])

  // 批量生成角色和场景图
  const handleGenerateReferences = useCallback(async () => {
    if (!ENABLE_IMAGE_GENERATION) {
      pushAssistantMessage(IMAGE_GENERATION_DISABLED_MESSAGE)
      return
    }

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
      
      // 更新 generationState 以便显示重新生成按钮
      if (!result.success && result.failCount > 0) {
        setGenerationState('blocked')
      } else {
        setGenerationState('completed')
      }
      
      // 重新初始化 GenerationController 以同步状态
      try {
        const restored = await restoreGenerationController(projectId, {
          width: selectedAspectOption.width,
          height: selectedAspectOption.height,
          onProgress: (progress) => {
            setGenerationProgress(progress)
            onArtistProgress?.({
              phase: progress.phase as ArtistGenerationPhase,
              current: progress.current,
              total: progress.total,
              currentItem: progress.currentItem,
            })
          },
          onStateChange: (newState) => {
            setGenerationState(newState)
            setIsGeneratingImages(newState === 'running' || newState === 'pausing')
          },
          onImageGenerated: async (image, phase) => {
            await loadProject(projectId)
          },
          onComplete: async (completeResult) => {
            setIsGeneratingImages(false)
            await loadProject(projectId)
          },
          onError: (error) => {
            setError(error)
          },
        })
        setGenerationController(restored.controller)
        // 保持之前设置的状态，不覆盖
      } catch (err) {
        console.error('Failed to restore GenerationController after batch generation:', err)
      }
      
    } catch (err) {
      console.error('批量生成失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingImages(false)
      setBatchProgress(null)
    }
  }, [projectId, currentProject, isGeneratingImages, loadProject, selectedImageAspectRatio, pushAssistantMessage, onArtistProgress])
  
  // 批量生成关键帧图片
  const handleGenerateKeyframes = useCallback(async () => {
    if (!ENABLE_IMAGE_GENERATION) {
      pushAssistantMessage(IMAGE_GENERATION_DISABLED_MESSAGE)
      return
    }

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
        },
      })
      
      setBatchResult(result)
      // 只有在所有图片都成功时才设置 isAllDone: true
      setLastGenerateResult({ 
        success: result.success, 
        phase: 'completed', 
        currentIndex: 0, 
        totalInPhase: 0, 
        isAllDone: result.success && result.failCount === 0 
      })
      
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
      
      // 更新 generationState 以便显示重新生成按钮
      if (!result.success && result.failCount > 0) {
        setGenerationState('blocked')
      } else {
        setGenerationState('completed')
      }
      
      // 重新初始化 GenerationController 以同步状态
      try {
        const restored = await restoreGenerationController(projectId, {
          width: selectedAspectOption.width,
          height: selectedAspectOption.height,
          onProgress: (progress) => {
            setGenerationProgress(progress)
            onArtistProgress?.({
              phase: progress.phase as ArtistGenerationPhase,
              current: progress.current,
              total: progress.total,
              currentItem: progress.currentItem,
            })
          },
          onStateChange: (newState) => {
            setGenerationState(newState)
            setIsGeneratingImages(newState === 'running' || newState === 'pausing')
          },
          onImageGenerated: async (image, phase) => {
            await loadProject(projectId)
          },
          onComplete: async (completeResult) => {
            setIsGeneratingImages(false)
            await loadProject(projectId)
          },
          onError: (error) => {
            setError(error)
          },
        })
        setGenerationController(restored.controller)
        // 保持之前设置的状态，不覆盖
      } catch (err) {
        console.error('Failed to restore GenerationController after keyframe generation:', err)
      }
      
    } catch (err) {
      console.error('批量生成关键帧失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGeneratingImages(false)
      setBatchProgress(null)
    }
  }, [projectId, currentProject, isGeneratingImages, loadProject, selectedImageAspectRatio, pushAssistantMessage, onArtistProgress])

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

  // ===== 美工阶段：暂停/继续/重试控制 =====
  
  // 暂停生成
  const handlePauseGeneration = useCallback(() => {
    if (generationController && generationState === 'running') {
      generationController.pause()
      pushAssistantMessage('⏸️ 正在暂停生成，等待当前任务完成...')
    }
  }, [generationController, generationState, pushAssistantMessage])
  
  // 继续生成
  // 注意：restoreGenerationController() 恢复后 controller 内部 state 仍是 idle
  // UI 为了展示“继续生成”按钮会把 generationState 设为 suggestedState=paused
  // 因此这里需要根据 controller.state 选择 start() / resume()
  const handleResumeGeneration = useCallback(async () => {
    if (!generationController || generationState !== 'paused') return

    try {
      pushAssistantMessage('▶️ 继续生成图片...')

      // 恢复后大多数情况 controller.state === 'idle'，应调用 start() 才会真正发起请求
      if (generationController.state === 'idle' || generationController.state === 'completed') {
        await generationController.start()
      } else {
        await generationController.resume()
      }
    } catch (err) {
      console.error('继续生成异常:', err)
      setError(err instanceof Error ? err.message : '继续生成失败')
    }
  }, [generationController, generationState, pushAssistantMessage])
  
  // 重试失败的图片（包含 pending）
  const handleRetryFailed = useCallback(async () => {
    // 如果有 generationController，使用它来重试
    if (generationController) {
      try {
        pushAssistantMessage('🔄 重新生成失败和未完成的图片...')
        await generationController.retryFailed({ includePending: true })
      } catch (err) {
        console.error('重新生成失败图片异常:', err)
        setError(err instanceof Error ? err.message : '重新生成失败')
      }
      return
    }
    
    // 如果没有 generationController，使用旧版批量生成方法
    // 这种情况发生在使用旧版批量生成方法后，generationController 还未初始化
    if (!currentProject?.artist) return
    
    const hasFailedReferences = (artistStats?.failedCharacters || 0) > 0 || (artistStats?.failedScenes || 0) > 0
    const hasFailedKeyframes = (artistStats?.failedKeyframes || 0) > 0
    
    pushAssistantMessage('🔄 重新生成失败的图片...')
    
    // 如果有失败的参考图，先重新生成参考图
    if (hasFailedReferences) {
      await handleGenerateReferences()
    }
    
    // 如果有失败的关键帧，重新生成关键帧
    if (hasFailedKeyframes) {
      await handleGenerateKeyframes()
    }
  }, [generationController, pushAssistantMessage, currentProject?.artist, artistStats, handleGenerateReferences, handleGenerateKeyframes])
  
  // 获取状态显示文本
  const getStateDisplayText = useCallback((state: GenerationState): { text: string; icon: string; color: string } => {
    switch (state) {
      case 'idle':
        return { text: '就绪', icon: '⚪', color: '#6b7280' }
      case 'running':
        return { text: '生成中', icon: '🔄', color: '#3b82f6' }
      case 'pausing':
        return { text: '暂停中...', icon: '⏳', color: '#f59e0b' }
      case 'paused':
        return { text: '已暂停', icon: '⏸️', color: '#f59e0b' }
      case 'blocked':
        return { text: '已阻塞（有失败）', icon: '🚫', color: '#ef4444' }
      case 'completed':
        return { text: '已完成', icon: '✅', color: '#22c55e' }
      case 'error':
        return { text: '错误', icon: '❌', color: '#ef4444' }
      default:
        return { text: '未知', icon: '❓', color: '#6b7280' }
    }
  }, [])

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

    if (!ENABLE_VIDEO_GENERATION) {
      pushAssistantMessage(VIDEO_GENERATION_DISABLED_MESSAGE)
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
  }, [projectId, currentProject, isGeneratingVideos, videoResolution, videoAspectRatio, loadProject, pushAssistantMessage])

  // 批量导出已生成视频（ZIP）
  const handleExportVideosZip = useCallback(async () => {
    // 若正在导出，则再次点击视为取消
    if (isExportingVideosZip) {
      exportAbortRef.current?.abort()
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⏹️ 已取消导出 ZIP',
        timestamp: new Date().toISOString(),
      }])
      return
    }

    if (!currentProject) return

    const completedCount = (currentProject.director?.videos || []).filter(v => v.status === 'completed').length
    if (completedCount === 0) {
      setError('没有已生成的视频可导出')
      return
    }

    setIsExportingVideosZip(true)
    setError(null)

    const controller = new AbortController()
    exportAbortRef.current = controller

    try {
      await exportDirectorVideosAsZip(currentProject, {
        abortSignal: controller.signal,
        onProgress: (p) => setExportZipProgress(p),
      })

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `📦 导出完成：已打包 ${completedCount} 个视频` ,
        timestamp: new Date().toISOString(),
      }])

    } catch (err) {
      console.error('导出 ZIP 失败:', err)
      setError(err instanceof Error ? err.message : '导出失败')
    } finally {
      setIsExportingVideosZip(false)
      setExportZipProgress(null)
      exportAbortRef.current = null
    }
  }, [currentProject, isExportingVideosZip])

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-panel notranslate" translate="no">
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

          {/* ZIP 导出进度 */}
          {isExportingVideosZip && exportZipProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">
                  {exportZipProgress.phase === 'zipping' ? '📦 正在生成 ZIP...' : '⬇️ 正在下载并打包...'}
                </span>
              </div>
              <div className="progress-detail">
                进度: {exportZipProgress.current}/{exportZipProgress.total}
                {exportZipProgress.currentShot && ` - ${exportZipProgress.currentShot}`}
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${exportZipProgress.total ? (exportZipProgress.current / exportZipProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div className="director-params">
            <div className="param-row">
              <label>📺 分辨率</label>
              <select 
                value={videoResolution}
                onChange={(e) => {
                  const value = e.target.value as '480p' | '720p'
                  setVideoResolution(value)
                  setDirectorVideoConfig(projectId, { resolution: value })
                }}
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
                onChange={(e) => {
                  const value = e.target.value as '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'
                  setVideoAspectRatio(value)
                  setDirectorVideoConfig(projectId, { ratio: value })
                }}
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
                disabled={!isGeneratingVideos && ENABLE_VIDEO_GENERATION && !currentProject?.artist?.keyframeImages?.length}
              >
                {isGeneratingVideos
                  ? `⏹️ 中止生成 ${videoProgress?.current || 0}/${videoProgress?.total || 0}` 
                  : directorStats && directorStats.completedVideos > 0
                    ? `🔄 继续生成视频 (${directorStats.completedVideos}/${directorStats.totalShots})`
                    : `🎬 批量生成视频 (${directorStats?.totalShots || 0}个镜头)`
                }
              </button>
            )}

            <button
              className={`start-generation-btn export-zip-btn ${isExportingVideosZip ? 'generating' : ''}`}
              onClick={handleExportVideosZip}
              disabled={isGeneratingVideos || (!isExportingVideosZip && (directorStats?.completedVideos || 0) === 0)}
            >
              {isExportingVideosZip
                ? `⏹️ 中止导出 ${exportZipProgress?.current || 0}/${exportZipProgress?.total || 0}`
                : `📦 导出视频 ZIP (${directorStats?.completedVideos || 0}个)`
              }
            </button>
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
          {/* 生成状态指示器 */}
          {generationController && (
            <div className="generation-state-indicator" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '8px 12px',
              background: 'white',
              borderRadius: '8px',
              border: `1px solid ${getStateDisplayText(generationState).color}20`,
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '16px' }}>{getStateDisplayText(generationState).icon}</span>
              <span style={{ 
                fontSize: '13px', 
                fontWeight: 500, 
                color: getStateDisplayText(generationState).color 
              }}>
                状态: {getStateDisplayText(generationState).text}
              </span>
              {generationState === 'pausing' && (
                <span style={{ fontSize: '11px', color: '#f59e0b', marginLeft: 'auto' }}>
                  等待当前任务完成...
                </span>
              )}
              {generationState === 'blocked' && totalFailedImages > 0 && (
                <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto' }}>
                  {totalFailedImages} 张失败
                </span>
              )}
            </div>
          )}
          
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
              {totalFailedImages > 0 && generationState !== 'running' && generationState !== 'pausing' && (
                <div className="stat-row" style={{marginTop: '8px', color: '#ff9800'}}>
                  ⚠️ 有 {totalFailedImages} 张图片生成失败，点击「重新生成」可自动重试
                </div>
              )}
            </div>
          )}
          
          {/* 失败图片错误信息展示 */}
          {generationController && generationState === 'blocked' && generationProgress?.error && (
            <div className="error-message-box" style={{
              padding: '10px 12px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              marginBottom: '8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>❌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', marginBottom: '4px' }}>
                    生成失败
                  </div>
                  <div style={{ fontSize: '12px', color: '#dc2626', wordBreak: 'break-word' }}>
                    {generationProgress.error}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* 当前生成状态 - 使用新版 GenerationController 进度 */}
          {(generationState === 'running' || generationState === 'pausing') && generationProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">
                  {generationState === 'pausing' ? '⏳' : '⟳'} 
                  {generationState === 'pausing' ? ' 暂停中...' : ` 正在生成${generationProgress.phase === 'characters' ? '角色图' : generationProgress.phase === 'scenes' ? '场景图' : generationProgress.phase === 'keyframes' ? '关键帧' : '图片'}...`}
                </span>
              </div>
              <div className="progress-detail">
                进度: {generationProgress.overallCompleted}/{generationProgress.overallTotal}
                {generationProgress.currentItem && ` - ${generationProgress.currentItem}`}
                {generationProgress.failedCount > 0 && (
                  <span style={{ color: '#ef4444', marginLeft: '8px' }}>
                    (失败: {generationProgress.failedCount})
                  </span>
                )}
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(generationProgress.overallCompleted / generationProgress.overallTotal) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          {/* 旧版批量生成进度（兼容） */}
          {isGeneratingImages && !generationController && batchProgress && (
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
          
          {isGeneratingImages && !generationController && !batchProgress && (
            <div className="generation-progress">
              <div className="progress-header">
                <span className="progress-phase">⟳ 正在生成图片...</span>
              </div>
            </div>
          )}
          
          {/* 暂停/继续控制按钮 */}
          {generationController && (generationState === 'running' || generationState === 'pausing' || generationState === 'paused') && (
            <div className="generation-control-buttons" style={{ 
              display: 'flex', 
              gap: '8px', 
              marginBottom: '8px' 
            }}>
              {generationState === 'running' && (
                <button 
                  className="pause-btn"
                  onClick={handlePauseGeneration}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  ⏸️ 暂停生成
                </button>
              )}
              {generationState === 'pausing' && (
                <button 
                  disabled
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#d1d5db',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'not-allowed',
                  }}
                >
                  ⏳ 暂停中...
                </button>
              )}
              {generationState === 'paused' && (
                <button 
                  className="resume-btn"
                  onClick={handleResumeGeneration}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  ▶️ 继续生成
                </button>
              )}
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
                  onChange={(e) => {
                    const value = e.target.value
                    setSelectedImageAspectRatio(value)
                    try {
                      localStorage.setItem(getAspectRatioStorageKey(), value)
                    } catch {
                      // ignore
                    }
                  }}
                  className="param-select"
                  disabled={isGeneratingImages || generationState === 'running' || generationState === 'pausing'}
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
            {/* 只有在所有图片都成功完成且没有失败图片时才显示完成消息 */}
            {lastGenerateResult?.isAllDone && totalFailedImages === 0 ? (
              <div className="all-done-message">
                🎉 所有图片已生成完成！
              </div>
            ) : (
              <>
                {/* 第一步：生成角色和场景图 */}
                <button 
                  className="start-generation-btn"
                  onClick={handleGenerateReferences}
                  disabled={isGeneratingImages || generationState === 'running' || generationState === 'pausing' || (ENABLE_IMAGE_GENERATION && !currentProject?.imageDesigner)}
                >
                  {(isGeneratingImages || generationState === 'running' || generationState === 'pausing') && (batchProgress?.phase === 'characters' || batchProgress?.phase === 'scenes' || generationProgress?.phase === 'characters' || generationProgress?.phase === 'scenes')
                    ? `⟳ 生成中... ${generationProgress?.current || batchProgress?.completed || 0}/${generationProgress?.total || batchProgress?.total || 0}` 
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
                      isGeneratingImages ||
                      generationState === 'running' ||
                      generationState === 'pausing' ||
                      (ENABLE_IMAGE_GENERATION && (
                        !currentProject?.imageDesigner ||
                        !currentProject?.artist?.characterImages?.length ||
                        !currentProject?.artist?.sceneImages?.length
                      ))
                    }
                  >
                    {(isGeneratingImages || generationState === 'running' || generationState === 'pausing') && (batchProgress?.phase === 'keyframes' || generationProgress?.phase === 'keyframes')
                      ? `⟳ 生成中... ${generationProgress?.current || batchProgress?.completed || 0}/${generationProgress?.total || batchProgress?.total || 0}` 
                      : artistStats && artistStats.completedKeyframes > 0
                        ? `🔄 重新生成关键帧 (${artistStats.completedKeyframes}/${artistStats.totalKeyframes})`
                        : `🎬 批量生成关键帧 (${artistStats?.totalKeyframes || 0})`
                    }
                  </button>
                  
                  {/* 关键帧生成引导气泡 */}
                  {showKeyframeGuide && !isGeneratingImages && generationState !== 'running' && generationState !== 'pausing' && (
                    <div className="keyframe-guide">
                      <div className="keyframe-guide-content">
                        <button
                          type="button"
                          className="guide-close"
                          aria-label="关闭提示"
                          onClick={(e) => {
                            e.stopPropagation()
                            onKeyframeGuideClick?.()
                          }}
                        >
                          ×
                        </button>

                        <span className="keyframe-guide-icon">👇</span>
                        <span className="keyframe-guide-text">角色和场景图已完成，点击这里继续生成关键帧！</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 重新生成失败图片按钮 - 仅在有失败图片且不在生成中时显示 */}
                {totalFailedImages > 0 && !isGeneratingImages && generationState !== 'running' && generationState !== 'pausing' && (
                  <button 
                    className="retry-failed-btn"
                    onClick={handleRetryFailed}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginTop: '8px',
                    }}
                  >
                    🔄 重新生成失败图片 ({totalFailedImages} 张)
                  </button>
                )}
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
                  <button
                    type="button"
                    className="guide-close"
                    aria-label="关闭提示"
                    onClick={(e) => {
                      e.stopPropagation()

                      if (currentProject && (stage === 'storyboard' || stage === 'imageDesigner')) {
                        const key = getStartSendGuideStorageKey(currentProject.meta.id, stage)
                        try {
                          localStorage.setItem(key, '1')
                        } catch {
                          // ignore
                        }
                      }

                      setShowStartSendGuide(false)
                    }}
                  >
                    ×
                  </button>

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
