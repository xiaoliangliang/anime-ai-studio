import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  RecordProps,
  T,
} from 'tldraw'
import { useState, useCallback } from 'react'

// 定义视频形状的属性类型
type AIVideoShapeProps = {
  w: number
  h: number
  videoUrl: string // base64 data URL 或 blob URL
  prompt: string
  duration: number
  aspectRatio: string
}

// 定义视频形状类型
export type AIVideoShape = TLBaseShape<'ai-video', AIVideoShapeProps>

// 视频播放器组件
function VideoPlayer({ videoUrl, prompt, duration, aspectRatio }: AIVideoShapeProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null)

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (videoRef) {
      if (isPlaying) {
        videoRef.pause()
      } else {
        videoRef.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [videoRef, isPlaying])

  const handleVideoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoRef(el)
    if (el) {
      el.pause() // 默认暂停
    }
  }, [])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      {videoUrl ? (
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#000',
            cursor: 'pointer',
          }}
        >
          <video
            ref={handleVideoRef}
            src={videoUrl}
            loop
            playsInline
            muted={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none', // 禁用视频原生事件
            }}
          />
          {/* 自定义播放/暂停按钮覆盖层 */}
          <div
            onClick={togglePlay}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isPlaying ? 'transparent' : 'rgba(0,0,0,0.3)',
              transition: 'background-color 0.2s',
            }}
          >
            {!isPlaying && (
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(233, 69, 96, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderLeft: '20px solid white',
                    marginLeft: '4px',
                  }}
                />
              </div>
            )}
          </div>
          {/* 播放状态指示器 */}
          {isPlaying && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                padding: '4px 8px',
                backgroundColor: 'rgba(233, 69, 96, 0.8)',
                borderRadius: '4px',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              播放中
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '14px',
          }}
        >
          视频加载中...
        </div>
      )}
      {/* 底部信息栏 - 可以拖动 */}
      <div
        style={{
          height: '40px',
          padding: '8px 12px',
          backgroundColor: '#16213e',
          color: '#fff',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #0f3460',
          cursor: 'move',
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '70%',
        }}>
          🎬 {prompt || '视频'}
        </span>
        <span style={{
          color: '#e94560',
          fontWeight: 'bold',
          fontSize: '11px',
        }}>
          {duration}s | {aspectRatio}
        </span>
      </div>
    </div>
  )
}

// 视频形状工具类
export class AIVideoShapeUtil extends BaseBoxShapeUtil<AIVideoShape> {
  static override type = 'ai-video' as const

  // 定义属性的验证器
  static override props: RecordProps<AIVideoShape> = {
    w: T.number,
    h: T.number,
    videoUrl: T.string,
    prompt: T.string,
    duration: T.number,
    aspectRatio: T.string,
  }

  // 获取默认属性
  getDefaultProps(): AIVideoShapeProps {
    return {
      w: 640,
      h: 400,
      videoUrl: '',
      prompt: '',
      duration: 5,
      aspectRatio: '16:9',
    }
  }

  // 渲染组件
  component(shape: AIVideoShape) {
    return (
      <HTMLContainer
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <VideoPlayer {...shape.props} />
      </HTMLContainer>
    )
  }

  // 指示器（选中时显示的边框）
  indicator(shape: AIVideoShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={8}
        ry={8}
      />
    )
  }
}
