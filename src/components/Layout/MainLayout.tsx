/**
 * 主布局组件 - 1/5 对话区 + 4/5 画布区
 */

import { useCallback } from 'react'
import { useProject } from '@/contexts/ProjectContext'
import type { ShotSize, CameraAngle, CameraMovement, Shot } from '@/types'
import ChatPanel from './ChatPanel'
import CanvasPanel from './CanvasPanel'
import './MainLayout.css'

interface MainLayoutProps {
  projectId: string
  autoStart?: boolean
  initialMessage?: string
}

// 阶段配置
const STAGES = [
  { id: 'screenwriter', label: '编剧', icon: '✍️' },
  { id: 'storyboard', label: '分镜', icon: '🎬' },
  { id: 'imageDesigner', label: '设计', icon: '🎨' },
  { id: 'artist', label: '美工', icon: '🖼️' },
  { id: 'director', label: '导演', icon: '🎥' },
] as const

export default function MainLayout({ projectId, autoStart, initialMessage }: MainLayoutProps) {
  // Debug: 输出接收到的 props
  console.log('[MainLayout] props:', { projectId, autoStart, initialMessage })
  
  const { currentStage, setCurrentStage, currentProject, updateProject } = useProject()

  // 处理 AI 生成的数据
  const handleDataGenerated = useCallback(async (data: unknown) => {
    if (!currentProject || !data) return

    console.log('AI 生成数据:', currentStage, data)

    // 根据当前阶段处理数据
    const updatedProject = { ...currentProject }

    switch (currentStage) {
      case 'screenwriter':
        // 编剧阶段 - 保存剧本数据
        updatedProject.screenwriter = {
          ...updatedProject.screenwriter,
          ...(data as object),
          isStale: false,
        } as typeof updatedProject.screenwriter
        break

      case 'storyboard': {
        // 分镜阶段 - 保存分镜数据
        // AI 返回的是单集分镜数据，需要包装成 episodes 数组
        const storyboardData = data as {
          episodeNumber?: number;
          totalDuration?: number;
          totalShots?: number;
          rhythmType?: string;
          shots?: Array<unknown>;
          keyframeCount?: number;
          riskAssessment?: Array<unknown>;
        }
        
        // 辅助函数：确保景别类型正确
        const toShotSize = (val: unknown): ShotSize => {
          const valid: ShotSize[] = ['远景', '全景', '中景', '近景', '特写']
          return valid.includes(val as ShotSize) ? (val as ShotSize) : '中景'
        }
        const toCameraAngle = (val: unknown): CameraAngle => {
          const valid: CameraAngle[] = ['平视', '俯视', '仰视', '侧面', '背面']
          return valid.includes(val as CameraAngle) ? (val as CameraAngle) : '平视'
        }
        const toCameraMovement = (val: unknown): CameraMovement => {
          const valid: CameraMovement[] = ['固定', '推进', '拉远', '跟随', '环绕', '升降']
          return valid.includes(val as CameraMovement) ? (val as CameraMovement) : '固定'
        }
        
        const rhythmVal = storyboardData.rhythmType
        const rhythmType: 'fast' | 'medium' | 'slow' = 
          rhythmVal === '快节奏' ? 'fast' : 
          rhythmVal === '慢节奏' ? 'slow' : 'medium'
        
        const episodeData = {
          episodeNumber: storyboardData.episodeNumber || 1,
          totalShots: storyboardData.totalShots || storyboardData.shots?.length || 0,
          totalDuration: storyboardData.totalDuration || 0,
          rhythmType,
          shots: (storyboardData.shots || []).map((shot: unknown, idx: number): Shot => {
            const s = shot as Record<string, unknown>
            return {
              id: (s.shotId as string) || `shot-${idx}`,
              shotNumber: (s.shotId as string) || `S01-${String(idx + 1).padStart(2, '0')}`,
              location: (s.location as string) || '',
              content: (s.description as string) || '',
              shotSize: toShotSize(s.shotSize),
              cameraAngle: toCameraAngle(s.cameraAngle),
              cameraMovement: toCameraMovement(s.cameraMovement),
              duration: (s.duration as number) || 5,
              dialogue: (s.dialogue as string) || '无',
              assignee: (s.character as string) || '',
              notes: (s.notes as string) || '',
              isStale: false,
            }
          }),
          isStale: false,
        }
        
        // 更新或添加到 episodes 数组
        const existingEpisodes = updatedProject.storyboard?.episodes || []
        const episodeIndex = existingEpisodes.findIndex(
          ep => ep.episodeNumber === episodeData.episodeNumber
        )
        
        if (episodeIndex >= 0) {
          existingEpisodes[episodeIndex] = episodeData
        } else {
          existingEpisodes.push(episodeData)
        }
        
        updatedProject.storyboard = {
          episodes: existingEpisodes,
          isStale: false,
        }
        break
      }

      case 'imageDesigner': {
        // 图像设计阶段 - 解析AI返回的数据并转换为项目格式
        // 兼容两种输入：
        // 1) 旧格式：{ referenceImages, keyframes }
        // 2) 新格式：{ characterPrompts, scenePrompts, keyframePrompts }
        const designerData = data as any;

        const prev = updatedProject.imageDesigner || {
          characterPrompts: [],
          scenePrompts: [],
          keyframePrompts: [],
          isStale: false,
        };

        // 工具：数组去重（按 code）
        const dedupeByCode = <T extends { code: string }>(arr: T[]): T[] => {
          const map = new Map<string, T>();
          arr.forEach(item => { if (!map.has(item.code)) map.set(item.code, item as T); });
          return Array.from(map.values());
        };

        // 1) 角色/场景参考图
        let characterPrompts: any[] = [];
        let scenePrompts: any[] = [];

        if (Array.isArray(designerData.characterPrompts) || Array.isArray(designerData.scenePrompts)) {
          // 新格式：直接使用
          characterPrompts = (designerData.characterPrompts || []).map((p: any) => ({ ...p, type: 'character', isStale: false }));
          scenePrompts = (designerData.scenePrompts || []).map((p: any) => ({ ...p, type: 'scene', isStale: false }));
        } else if (Array.isArray(designerData.referenceImages)) {
          // 旧格式：从 referenceImages 分离
          characterPrompts = designerData.referenceImages
            .filter((ref: any) => ref.type === 'character')
            .map((ref: any) => ({ id: crypto.randomUUID(), code: ref.refId, name: ref.name, prompt: ref.prompt, type: 'character' as const, isStale: false }));
          scenePrompts = designerData.referenceImages
            .filter((ref: any) => ref.type === 'scene')
            .map((ref: any) => ({ id: crypto.randomUUID(), code: ref.refId, name: ref.name, prompt: ref.prompt, type: 'scene' as const, isStale: false }));
        }

        // 若本次缺失，则保留历史数据，避免被清空或误覆盖
        if (!characterPrompts.length) characterPrompts = prev.characterPrompts || [];
        if (!scenePrompts.length) scenePrompts = prev.scenePrompts || [];

        // 2) 关键帧
        let keyframePrompts: any[] = [];
        if (Array.isArray(designerData.keyframePrompts)) {
          keyframePrompts = designerData.keyframePrompts.map((kf: any) => ({ ...kf, isStale: false }));
        } else if (Array.isArray(designerData.keyframes)) {
          keyframePrompts = designerData.keyframes.map((kf: any) => ({
            id: crypto.randomUUID(),
            code: `${kf.shotId}-${kf.frameNumber}`,
            shotId: kf.shotId,
            frameIndex: kf.frameNumber,
            prompt: kf.prompt,
            referenceIds: kf.referenceIds || [],
            characters: kf.characters || [],
            scene: kf.scene || '',
            description: kf.description || '',
            isStale: false,
          }));
        } else {
          keyframePrompts = prev.keyframePrompts || [];
        }

        // 去重并保存
        updatedProject.imageDesigner = {
          characterPrompts: dedupeByCode(characterPrompts),
          scenePrompts: dedupeByCode(scenePrompts),
          keyframePrompts: dedupeByCode(keyframePrompts),
          isStale: false,
        } as any;

        console.log('[MainLayout] 图像设计数据已保存:', {
          characters: updatedProject.imageDesigner.characterPrompts.length,
          scenes: updatedProject.imageDesigner.scenePrompts.length,
          keyframes: updatedProject.imageDesigner.keyframePrompts.length,
        })
        break
      }

      default:
        console.log('未处理的阶段数据:', currentStage)
        return
    }

    try {
      await updateProject(updatedProject)
      console.log('项目数据已保存')
    } catch (err) {
      console.error('保存项目数据失败:', err)
    }
  }, [currentProject, currentStage, updateProject])

  return (
    <div className="main-layout">
      {/* 顶部导航栏 */}
      <header className="layout-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => window.history.back()}>
            ← 返回
          </button>
          <h1 className="project-title">
            {currentProject?.meta.name || '新项目'}
          </h1>
        </div>
        
        {/* 阶段切换 */}
        <nav className="stage-nav">
          {STAGES.map((stage, index) => (
            <button
              key={stage.id}
              className={`stage-tab ${currentStage === stage.id ? 'active' : ''}`}
              onClick={() => setCurrentStage(stage.id)}
            >
              <span className="stage-icon">{stage.icon}</span>
              <span className="stage-label">{stage.label}</span>
              {index < STAGES.length - 1 && <span className="stage-arrow">→</span>}
            </button>
          ))}
        </nav>

        <div className="header-right">
          <button className="header-btn" title="保存">💾</button>
          <button className="header-btn" title="设置">⚙️</button>
        </div>
      </header>

      {/* 内容区 */}
      <div className="layout-content">
        {/* 左侧对话面板 */}
        <aside className="chat-panel-wrapper">
          <ChatPanel 
            projectId={projectId} 
            stage={currentStage}
            onDataGenerated={handleDataGenerated}
            autoStart={autoStart}
            initialMessage={initialMessage}
          />
        </aside>

        {/* 右侧画布面板 */}
        <main className="canvas-panel-wrapper">
          <CanvasPanel projectId={projectId} stage={currentStage} />
        </main>
      </div>
    </div>
  )
}
