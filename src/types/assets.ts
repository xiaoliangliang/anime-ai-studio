/**
 * 资产存储相关类型定义
 */

/** 资产类型 */
export type AssetType = 'image' | 'video';

/** 资产上传状态 */
export type UploadStatus = 
  | 'pending'        // 待上传
  | 'uploading'      // 上传中
  | 'uploaded'       // 已上传云端（图片）
  | 'local_only'     // 仅本地（视频）
  | 'failed';        // 上传失败

/** 资产元数据 */
export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  
  // 云端托管信息（仅图片）
  imgbbUrl?: string;           // imgbb 永久链接
  imgbbDeleteUrl?: string;     // imgbb 删除链接
  cloudUrl?: string;           // 云端URL（通用）
  
  // 本地存储信息
  localBlobKey?: string;       // IndexedDB blob 键名
  localData?: string;          // 本地 base64 数据
  mimeType: string;            // MIME 类型
  size: number;                // 文件大小(bytes)
  
  // 状态
  uploadStatus: UploadStatus;
  uploadError?: string;
  
  // 时间戳
  createdAt: string;
  uploadedAt?: string;
  
  // 元信息
  width?: number;
  height?: number;
  duration?: number;           // 视频时长(秒)
  
  // 业务关联
  sourcePromptId?: string;     // 来源提示词ID
  sourceShotId?: string;       // 来源镜头ID
}

/** 资产 Blob 存储 */
export interface AssetBlob {
  id: string;                  // 同 Asset.id
  blob: Blob;
}

/** 上传图片到 imgbb 的响应 */
export interface ImgbbUploadResponse {
  success: boolean;
  data?: {
    id: string;
    url: string;               // 图片访问URL
    delete_url: string;        // 删除URL
    display_url: string;       // 展示URL
    width: number;
    height: number;
    size: number;
  };
  error?: {
    message: string;
    code: number;
  };
}

/** 创建资产的输入 */
export interface CreateAssetInput {
  projectId: string;
  type: AssetType;
  blob: Blob;
  mimeType: string;
  sourcePromptId?: string;
  sourceShotId?: string;
}

/** 获取资产URL的选项 */
export interface GetAssetUrlOptions {
  preferLocal?: boolean;       // 优先使用本地缓存
  fallbackToCloud?: boolean;   // 本地不存在时回退到云端
}

/** 存储空间统计 */
export interface StorageStats {
  totalSize: number;           // 总占用大小
  imageCount: number;          // 图片数量
  videoCount: number;          // 视频数量
  imageBlobSize: number;       // 图片 blob 大小
  videoBlobSize: number;       // 视频 blob 大小
  quota?: number;              // 配额（如果可获取）
  usage?: number;              // 使用量（如果可获取）
}
