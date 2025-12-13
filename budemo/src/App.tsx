import { useCallback, useState, useMemo } from 'react'
import { Tldraw, Editor, TLShapeId, createShapeId, AssetRecordType } from 'tldraw'
import { generateImage, generateImageToImage, generateImageToVideo, uploadImageToHost, fileToDataUrl, convertToDataUrl, IMG2IMG_MODELS, Img2ImgModel, IMAGE_QUALITY_OPTIONS, ImageQuality } from './services/pollinations'
import { AIVideoShapeUtil } from './shapes/VideoShape'
import './App.css'

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [message, setMessage] = useState('')
  // 多图选择支持
  const [selectedImages, setSelectedImages] = useState<{ id: string; url: string; name: string }[]>([])
  const [img2imgPrompt, setImg2imgPrompt] = useState('')
  const [img2imgModel, setImg2imgModel] = useState<Img2ImgModel>('seedream-pro')  // 默认使用最强多图模型
  // 图生图新增参数
  const [img2imgNegativePrompt, setImg2imgNegativePrompt] = useState('')
  const [img2imgQuality, setImg2imgQuality] = useState<ImageQuality>('medium')
  const [img2imgGuidanceScale, setImg2imgGuidanceScale] = useState<number | undefined>(undefined)
  const [img2imgSafe, setImg2imgSafe] = useState(false)
  const [img2imgTransparent, setImg2imgTransparent] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  // 视频参数
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9')

  // 自定义形状工具列表
  const customShapeUtils = useMemo(() => [AIVideoShapeUtil], [])

  // 上传图片到画布
  const handleUploadImage = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) {
      setMessage('画布未初始化')
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    try {
      setMessage('正在上传图片...')

      // 转换为 data URL
      const dataUrl = await fileToDataUrl(file)

      // 获取图片的实际尺寸
      const imageSize = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight })
        }
        img.onerror = () => reject(new Error('无法读取图片尺寸'))
        img.src = dataUrl
      })

      console.log('图片实际尺寸:', imageSize)

      // 创建图片资源（使用实际尺寸）
      const assetId = AssetRecordType.createId()
      const asset = AssetRecordType.create({
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: file.name,
          src: dataUrl,
          w: imageSize.width,
          h: imageSize.height,
          mimeType: file.type,
          isAnimated: false,
        },
        meta: {},
      })

      // 添加资源到编辑器
      editor.createAssets([asset])

      // 在画布中心创建图片形状（使用实际尺寸）
      const shapeId: TLShapeId = createShapeId()
      const viewport = editor.getViewportScreenBounds()
      const zoom = editor.getZoomLevel()

      editor.createShape({
        id: shapeId,
        type: 'image',
        x: (viewport.x + viewport.w / 2) / zoom - imageSize.width / 2,
        y: (viewport.y + viewport.h / 2) / zoom - imageSize.height / 2,
        props: {
          assetId,
          w: imageSize.width,
          h: imageSize.height,
        },
      })

      // 选中并缩放到新上传的图片
      editor.select(shapeId)
      editor.zoomToSelection()

      setMessage('图片上传成功!')
      setTimeout(() => setMessage(''), 2000)
    } catch (error) {
      console.error('上传图片失败:', error)
      setMessage('上传失败,请重试')
    }
  }, [editor])

  // 生成 AI 图片
  const handleGenerateImage = useCallback(async () => {
    if (!editor) {
      setMessage('画布未初始化')
      return
    }

    if (!prompt.trim()) {
      setMessage('请输入提示词')
      return
    }

    try {
      setIsGenerating(true)
      setMessage('正在生成图片...')

      // 调用 Pollinations API 生成图片
      const blobUrl = await generateImage({
        prompt: prompt.trim(),
        width: 1024,
        height: 1024,
      })

      // 创建图片资源
      const assetId = AssetRecordType.createId()
      const asset = AssetRecordType.create({
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `AI生成-${prompt.substring(0, 20)}`,
          src: blobUrl,
          w: 1024,
          h: 1024,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      })

      // 添加资源到编辑器
      editor.createAssets([asset])

      // 在画布中心偏右创建图片
      const shapeId: TLShapeId = createShapeId()
      const viewport = editor.getViewportScreenBounds()
      const zoom = editor.getZoomLevel()

      editor.createShape({
        id: shapeId,
        type: 'image',
        x: (viewport.x + viewport.w / 2) / zoom + 100,
        y: (viewport.y + viewport.h / 2) / zoom - 512,
        props: {
          assetId,
          w: 1024,
          h: 1024,
        },
      })

      setMessage('图片生成成功!')
      setTimeout(() => setMessage(''), 2000)
      setPrompt('')
    } catch (error) {
      console.error('生成图片失败:', error)
      setMessage('生成失败,请重试')
    } finally {
      setIsGenerating(false)
    }
  }, [editor, prompt])

  // 选中画布上的图片 (支持多选)
  const handleSelectImage = useCallback(async () => {
    if (!editor) {
      setMessage('画布未初始化')
      return
    }

    // 获取当前选中的形状
    const selectedShapes = editor.getSelectedShapes()

    if (selectedShapes.length === 0) {
      setMessage('请先在画布上选中图片')
      return
    }

    // 找到所有图片形状
    const imageShapes = selectedShapes.filter(shape => shape.type === 'image')

    if (imageShapes.length === 0) {
      setMessage('请选中图片')
      return
    }

    setMessage(`正在处理 ${imageShapes.length} 张图片...`)

    const newSelectedImages: { id: string; url: string; name: string }[] = []

    for (let i = 0; i < imageShapes.length; i++) {
      const imageShape = imageShapes[i]

      // 获取图片资源 (需要类型断言)
      const assetId = (imageShape.props as { assetId?: string }).assetId
      if (!assetId) {
        console.warn(`图片 ${i + 1} 无法获取资源ID`)
        continue
      }
      const asset = editor.getAsset(assetId as any)

      if (!asset || asset.type !== 'image') {
        console.warn(`图片 ${i + 1} 无法获取资源`)
        continue
      }

      // 调试日志：查看资源详情
      console.log(`选中的图片 ${i + 1} 资源:`, {
        id: asset.id,
        type: asset.type,
        name: asset.props.name,
        mimeType: asset.props.mimeType,
        srcPrefix: asset.props.src?.substring(0, 100),
      })

      // 处理 asset: 协议的图片 - 需要将图片导出为 blob
      let imageDataUrl: string | null = null;

      if (asset.props.src?.startsWith('asset:') || !asset.props.src?.startsWith('data:')) {
        try {
          // 使用 tldraw 的导出功能将选中的图片转换为 blob
          const svg = await editor.getSvgString([imageShape.id], {
            background: false,
            padding: 0,
          })

          if (svg) {
            // 将 SVG 转换为 PNG data URL
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            const img = new Image()

            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                canvas.width = img.width || 800
                canvas.height = img.height || 600
                ctx?.drawImage(img, 0, 0)
                imageDataUrl = canvas.toDataURL('image/png')
                resolve()
              }
              img.onerror = reject
              img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.svg)
            })
          }
        } catch (err) {
          console.error(`导出图片 ${i + 1} 失败:`, err)
          continue
        }
      } else {
        // 如果已经是 data URL，直接使用
        imageDataUrl = asset.props.src
      }

      if (imageDataUrl) {
        newSelectedImages.push({
          id: imageShape.id,
          url: imageDataUrl,
          name: asset.props.name || `图片 ${i + 1}`
        })
      }
    }

    if (newSelectedImages.length === 0) {
      setMessage('无法获取图片数据，请尝试使用上传按钮添加图片')
      return
    }

    // 保存选中的图片
    setSelectedImages(newSelectedImages)
    const countMsg = newSelectedImages.length === 1
      ? '1张图片已选中'
      : `${newSelectedImages.length}张图片已选中 (图1=人物, 图2=环境...)`
    setMessage(`${countMsg}！可以输入提示词进行多图合成`)
    setTimeout(() => setMessage(''), 4000)
  }, [editor])

  // 清除选中的图片
  const handleClearSelectedImages = useCallback(() => {
    setSelectedImages([])
    setMessage('已清除选中的图片')
    setTimeout(() => setMessage(''), 2000)
  }, [])

  // 图生图功能 (支持多图)
  const handleImageToImage = useCallback(async () => {
    if (!editor) {
      setMessage('画布未初始化')
      return
    }

    if (selectedImages.length === 0) {
      setMessage('请先选中图片')
      return
    }

    if (!img2imgPrompt.trim()) {
      setMessage('请输入图生图提示词')
      return
    }

    try {
      setIsGenerating(true)
      const imageCount = selectedImages.length
      setMessage(`正在处理 ${imageCount} 张图片...`)

      // 步骤1: 上传所有图片到图床
      const uploadedUrls: string[] = []
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i]
        setMessage(`正在上传图片 ${i + 1}/${imageCount} (${img.name})...`)

        // 确保图片 URL 是 data URL 格式
        let dataUrl: string;
        try {
          dataUrl = await convertToDataUrl(img.url);
          console.log(`图片 ${i + 1} 已转换为 data URL`);
        } catch (convertError) {
          console.error(`图片 ${i + 1} URL 转换失败:`, convertError);
          throw new Error(`无法读取图片 ${i + 1}，请重新选择`);
        }

        // 上传到图床
        try {
          const uploadedUrl = await uploadImageToHost(dataUrl);
          console.log(`图片 ${i + 1} 上传成功:`, uploadedUrl);
          uploadedUrls.push(uploadedUrl);
        } catch (uploadError) {
          console.error(`图片 ${i + 1} 上传失败:`, uploadError);
          throw new Error(`图片 ${i + 1} 上传失败，请检查网络连接`);
        }
      }

      // 步骤2: 调用图生图 API (多图)
      const modelName = IMG2IMG_MODELS.find(m => m.id === img2imgModel)?.name || img2imgModel
      setMessage(`正在使用 ${modelName} 进行${imageCount > 1 ? '多图合成' : '图生图'}...`)

      const blobUrl = await generateImageToImage({
        prompt: img2imgPrompt.trim(),
        imageUrls: uploadedUrls,  // 多图URL数组
        model: img2imgModel,
        width: 1024,
        height: 1024,
        // 新增参数
        negativePrompt: img2imgNegativePrompt || undefined,
        quality: img2imgQuality,
        guidanceScale: img2imgGuidanceScale,
        safe: img2imgSafe,
        transparent: img2imgTransparent,
      })

      console.log('图生图 API 返回的 blobUrl 前缀:', blobUrl.substring(0, 100))

      // 创建图片资源
      const assetId = AssetRecordType.createId()
      console.log('创建图片资源 ID:', assetId)

      const asset = AssetRecordType.create({
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `图生图-${img2imgPrompt.substring(0, 20)}`,
          src: blobUrl,
          w: 1024,
          h: 1024,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      })

      // 添加资源到编辑器
      console.log('添加资源到编辑器...')
      editor.createAssets([asset])
      console.log('资源已添加')

      // 在画布中心创建图片
      const shapeId: TLShapeId = createShapeId()
      console.log('创建图片形状 ID:', shapeId)

      const viewport = editor.getViewportScreenBounds()
      const zoom = editor.getZoomLevel()
      console.log('视口信息:', { viewport, zoom })

      // 使用更简单的定位：直接放在视口中心
      const centerX = viewport.x + viewport.w / 2
      const centerY = viewport.y + viewport.h / 2
      const shapeX = centerX / zoom - 512 // 图片宽度的一半
      const shapeY = centerY / zoom - 512 // 图片高度的一半

      console.log('图片位置:', { shapeX, shapeY })

      editor.createShape({
        id: shapeId,
        type: 'image',
        x: shapeX,
        y: shapeY,
        props: {
          assetId,
          w: 1024,
          h: 1024,
        },
      })

      console.log('图片形状已创建')

      // 选中新创建的图片并调整视图
      editor.select(shapeId)
      editor.zoomToSelection()

      console.log('已选中并缩放到新图片')

      setMessage('图生图成功!')
      setTimeout(() => setMessage(''), 2000)
      setImg2imgPrompt('')
    } catch (error) {
      console.error('图生图失败:', error)

      // 根据错误类型给出更具体的提示
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      setMessage(`图生图失败: ${errorMessage}`)
    } finally {
      setIsGenerating(false)
    }
  }, [editor, selectedImages, img2imgPrompt, img2imgModel, img2imgNegativePrompt, img2imgQuality, img2imgGuidanceScale, img2imgSafe, img2imgTransparent])

  // 图生视频功能
  const handleImageToVideo = useCallback(async () => {
    if (!editor) {
      setMessage('画布未初始化')
      return
    }

    if (selectedImages.length === 0) {
      setMessage('请先选中一张图片')
      return
    }

    if (!videoPrompt.trim()) {
      setMessage('请输入视频提示词')
      return
    }

    // 视频生成只使用第一张图片
    const firstImage = selectedImages[0]

    try {
      setIsGenerating(true)
      setMessage('正在准备图片...')

      // 步骤1: 确保图片 URL 是 data URL 格式
      let dataUrl: string;
      try {
        dataUrl = await convertToDataUrl(firstImage.url);
        console.log('图片已转换为 data URL');
      } catch (convertError) {
        console.error('图片 URL 转换失败:', convertError);
        throw new Error('无法读取选中的图片，请重新选择');
      }

      // 步骤2: 上传到图床获取公开 URL
      let imageUrlToUse: string;
      try {
        setMessage('正在上传图片到图床...')
        imageUrlToUse = await uploadImageToHost(dataUrl);
        console.log('图片上传成功,URL:', imageUrlToUse);
      } catch (uploadError) {
        console.error('图床上传失败:', uploadError);
        throw new Error('图片上传失败，请检查网络连接或稍后重试');
      }

      // 步骤3: 调用图生视频 API
      setMessage(`正在生成 ${videoDuration} 秒视频，请耐心等待（可能需要几分钟）...`)
      const videoBlob = await generateImageToVideo({
        prompt: videoPrompt.trim(),
        imageUrl: imageUrlToUse,
        duration: videoDuration,
        aspectRatio: videoAspectRatio,
      })

      console.log('视频生成成功，Blob 大小:', videoBlob.size)

      // 将视频 Blob 转换为 data URL 以便持久化存储
      setMessage('正在处理视频...')
      const videoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(videoBlob)
      })

      console.log('视频已转换为 data URL，长度:', videoDataUrl.length)

      // 计算视频形状的尺寸
      const videoWidth = videoAspectRatio === '16:9' ? 640 : 360
      const videoHeight = videoAspectRatio === '16:9' ? 360 : 640

      // 在画布上创建视频形状
      const shapeId: TLShapeId = createShapeId()
      const viewport = editor.getViewportScreenBounds()
      const zoom = editor.getZoomLevel()
      const centerX = viewport.x + viewport.w / 2
      const centerY = viewport.y + viewport.h / 2

      editor.createShape({
        id: shapeId,
        type: 'ai-video',
        x: centerX / zoom - videoWidth / 2,
        y: centerY / zoom - videoHeight / 2,
        props: {
          w: videoWidth,
          h: videoHeight + 40, // 加上底部信息栏高度
          videoUrl: videoDataUrl,
          prompt: videoPrompt.trim(),
          duration: videoDuration,
          aspectRatio: videoAspectRatio,
        },
      })

      // 选中新创建的视频并调整视图
      editor.select(shapeId)
      editor.zoomToSelection()

      setMessage('视频生成成功！已添加到画布')
      setTimeout(() => setMessage(''), 3000)
      setVideoPrompt('')
    } catch (error) {
      console.error('图生视频失败:', error)
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      setMessage(`图生视频失败: ${errorMessage}`)
    } finally {
      setIsGenerating(false)
    }
  }, [editor, selectedImages, videoPrompt, videoDuration, videoAspectRatio])

  return (
    <div className="app">
      {/* 控制面板 */}
      <div className="control-panel">
        <div className="control-group">
          <label className="upload-btn">
            📤 上传图片
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadImage}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <div className="control-group">
          <input
            type="text"
            className="prompt-input"
            placeholder="输入提示词生成AI图片..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isGenerating && handleGenerateImage()}
            disabled={isGenerating}
          />
          <button
            className="generate-btn"
            onClick={handleGenerateImage}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? '⏳ 生成中...' : '✨ 生成图片'}
          </button>
        </div>

        <div className="control-group" style={{ borderTop: '1px solid #e0e0e0', paddingTop: '10px', marginTop: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <button
              className="select-btn"
              onClick={handleSelectImage}
              disabled={isGenerating}
            >
              🖼️ 选中图片
            </button>
            {selectedImages.length > 0 && (
              <button
                onClick={handleClearSelectedImages}
                disabled={isGenerating}
                style={{
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid #f44336',
                  background: 'white',
                  color: '#f44336',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ✕ 清除
              </button>
            )}
          </div>
          {selectedImages.length > 0 && (
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
              <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                ✓ 已选中 {selectedImages.length} 张图片
              </span>
              <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {selectedImages.map((img, i) => (
                  <span key={img.id} style={{
                    background: '#e3f2fd',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px'
                  }}>
                    图{i + 1}: {img.name.substring(0, 10)}
                  </span>
                ))}
              </div>
              {selectedImages.length >= 2 && (
                <div style={{ marginTop: '4px', color: '#ff9800', fontSize: '11px' }}>
                  💡 提示词示例: "Replace the subject in Image 1 with the subject from Image 2"
                </div>
              )}
            </div>
          )}
        </div>

        <div className="control-group">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <select
              value={img2imgModel}
              onChange={(e) => setImg2imgModel(e.target.value as Img2ImgModel)}
              disabled={isGenerating}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, fontSize: '12px' }}
              title="选择图生图模型"
            >
              {IMG2IMG_MODELS.map(model => (
                <option key={model.id} value={model.id} title={model.description}>
                  {model.name} ({model.price})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                background: showAdvancedOptions ? '#e3f2fd' : 'white',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              title="高级选项"
            >
              ⚙️ {showAdvancedOptions ? '收起' : '高级'}
            </button>
          </div>

          {/* 高级选项面板 */}
          {showAdvancedOptions && (
            <div style={{
              background: '#f5f5f5',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '8px',
              fontSize: '12px',
            }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>质量等级</label>
                <select
                  value={img2imgQuality}
                  onChange={(e) => setImg2imgQuality(e.target.value as ImageQuality)}
                  disabled={isGenerating}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  {IMAGE_QUALITY_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id} title={opt.description}>
                      {opt.name} - {opt.description}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>
                  提示词遵循度 (1-20, 越高越严格遵循提示词)
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="0.5"
                  value={img2imgGuidanceScale ?? ''}
                  onChange={(e) => setImg2imgGuidanceScale(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="默认由模型决定"
                  disabled={isGenerating}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>负面提示词 (避免生成什么)</label>
                <input
                  type="text"
                  value={img2imgNegativePrompt}
                  onChange={(e) => setImg2imgNegativePrompt(e.target.value)}
                  placeholder="如: blurry, low quality, distorted"
                  disabled={isGenerating}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={img2imgSafe}
                    onChange={(e) => setImg2imgSafe(e.target.checked)}
                    disabled={isGenerating}
                  />
                  <span>安全过滤</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={img2imgTransparent}
                    onChange={(e) => setImg2imgTransparent(e.target.checked)}
                    disabled={isGenerating}
                  />
                  <span>透明背景</span>
                </label>
              </div>
            </div>
          )}

          <input
            type="text"
            className="prompt-input"
            placeholder={selectedImages.length >= 2
              ? "多图合成提示词，如: Replace the subject in Image 1 with Image 2's background"
              : "输入提示词进行图生图..."
            }
            value={img2imgPrompt}
            onChange={(e) => setImg2imgPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isGenerating && handleImageToImage()}
            disabled={isGenerating || selectedImages.length === 0}
          />
          <button
            className="generate-btn"
            onClick={handleImageToImage}
            disabled={isGenerating || selectedImages.length === 0 || !img2imgPrompt.trim()}
          >
            {isGenerating ? '⏳ 生成中...' : selectedImages.length >= 2 ? '🎨 多图合成' : '🎨 图生图'}
          </button>
        </div>

        <div className="control-group" style={{ borderTop: '1px solid #e0e0e0', paddingTop: '10px', marginTop: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <select
              value={videoDuration}
              onChange={(e) => setVideoDuration(Number(e.target.value))}
              disabled={isGenerating || selectedImages.length === 0}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
                <option key={d} value={d}>{d}秒</option>
              ))}
            </select>
            <select
              value={videoAspectRatio}
              onChange={(e) => setVideoAspectRatio(e.target.value as '16:9' | '9:16')}
              disabled={isGenerating || selectedImages.length === 0}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="16:9">横屏 16:9</option>
              <option value="9:16">竖屏 9:16</option>
            </select>
          </div>
          {selectedImages.length > 1 && (
            <div style={{ fontSize: '11px', color: '#ff9800', marginBottom: '4px' }}>
              ⚠️ 图生视频仅使用第一张图片
            </div>
          )}
          <input
            type="text"
            className="prompt-input"
            placeholder="输入提示词进行图生视频..."
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isGenerating && handleImageToVideo()}
            disabled={isGenerating || selectedImages.length === 0}
          />
          <button
            className="generate-btn"
            onClick={handleImageToVideo}
            disabled={isGenerating || selectedImages.length === 0 || !videoPrompt.trim()}
            style={{ backgroundColor: '#9c27b0' }}
          >
            {isGenerating ? '⏳ 生成中...' : '🎬 图生视频'}
          </button>
        </div>

        {message && <div className="message">{message}</div>}
      </div>

      {/* tldraw 画布 */}
      <div className="canvas">
        <Tldraw
          shapeUtils={customShapeUtils}
          onMount={(editor) => setEditor(editor)}
          persistenceKey="tldraw-ai-canvas"
        />
      </div>
    </div>
  )
}

export default App
