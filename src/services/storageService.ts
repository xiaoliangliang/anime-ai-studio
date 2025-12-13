/**
 * IndexedDB 存储服务
 * 
 * 数据库结构：
 * - projects: 项目数据
 * - assets: 媒体资产（图片、视频）
 * - canvasSnapshots: 画布快照
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { 
  Project, 
  CreateProjectInput, 
  ProjectListItem,
  ProjectStage,
} from '@/types';
import type { Asset, CanvasSnapshot } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/** 数据库名称和版本 */
const DB_NAME = 'dramaai';
const DB_VERSION = 1;

/** 数据库 Schema */
interface DramaAIDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: {
      'by-updated': string;
      'by-name': string;
    };
  };
  assets: {
    key: string;
    value: Asset;
    indexes: {
      'by-project': string;
      'by-type': string;
    };
  };
  canvasSnapshots: {
    key: string;
    value: CanvasSnapshot;
    indexes: {
      'by-project': string;
    };
  };
}

/** 数据库实例 */
let dbInstance: IDBPDatabase<DramaAIDB> | null = null;

/**
 * 获取数据库实例
 */
export async function getDB(): Promise<IDBPDatabase<DramaAIDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DramaAIDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 创建 projects store
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'meta.id' });
        projectStore.createIndex('by-updated', 'meta.updatedAt');
        projectStore.createIndex('by-name', 'meta.name');
      }

      // 创建 assets store
      if (!db.objectStoreNames.contains('assets')) {
        const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
        assetStore.createIndex('by-project', 'projectId');
        assetStore.createIndex('by-type', 'type');
      }

      // 创建 canvasSnapshots store
      if (!db.objectStoreNames.contains('canvasSnapshots')) {
        const snapshotStore = db.createObjectStore('canvasSnapshots', { keyPath: 'id' });
        snapshotStore.createIndex('by-project', 'projectId');
      }
    },
  });

  return dbInstance;
}

// =============================================
// 项目 CRUD 操作
// =============================================

/**
 * 创建新项目
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const db = await getDB();
  const now = new Date().toISOString();
  const projectId = uuidv4();

  const project: Project = {
    meta: {
      id: projectId,
      name: input.name,
      type: input.type,
      totalEpisodes: input.totalEpisodes,
      targetAudience: input.targetAudience,
      createdAt: now,
      updatedAt: now,
    },
    stageProgress: [
      { stage: 'screenwriter', status: 'pending' },
      { stage: 'storyboard', status: 'pending' },
      { stage: 'imageDesigner', status: 'pending' },
      { stage: 'artist', status: 'pending' },
      { stage: 'director', status: 'pending' },
    ],
    chatHistory: {
      screenwriter: [],
      storyboard: [],
      imageDesigner: [],
      artist: [],
      director: [],
    },
  };

  // 注意：initialCreativity 不再添加到 chatHistory，而是通过路由 state 传递
  // 这样可以避免复杂的检测和重复触发问题
  
  await db.put('projects', project);
  return project;
}

/**
 * 获取单个项目
 */
export async function getProject(projectId: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', projectId);
}

/**
 * 更新项目
 */
export async function updateProject(project: Project): Promise<void> {
  const db = await getDB();
  project.meta.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

/**
 * 删除项目
 */
export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDB();
  
  // 删除关联的资产
  const assets = await db.getAllFromIndex('assets', 'by-project', projectId);
  for (const asset of assets) {
    await db.delete('assets', asset.id);
  }
  
  // 删除关联的画布快照
  const snapshots = await db.getAllFromIndex('canvasSnapshots', 'by-project', projectId);
  for (const snapshot of snapshots) {
    await db.delete('canvasSnapshots', snapshot.id);
  }
  
  // 删除项目
  await db.delete('projects', projectId);
}

/**
 * 获取项目列表
 */
export async function getProjectList(): Promise<ProjectListItem[]> {
  const db = await getDB();
  const projects = await db.getAllFromIndex('projects', 'by-updated');
  
  // 按更新时间倒序排列
  projects.sort((a, b) => 
    new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime()
  );

  return projects.map(p => ({
    id: p.meta.id,
    name: p.meta.name,
    type: p.meta.type,
    updatedAt: p.meta.updatedAt,
    stageProgress: p.stageProgress,
  }));
}

/**
 * 更新项目阶段状态
 */
export async function updateProjectStage(
  projectId: string,
  stage: ProjectStage,
  status: 'pending' | 'in_progress' | 'completed'
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error('项目不存在');

  const stageIndex = project.stageProgress.findIndex(s => s.stage === stage);
  if (stageIndex !== -1) {
    project.stageProgress[stageIndex].status = status;
    
    if (status === 'in_progress' && !project.stageProgress[stageIndex].startedAt) {
      project.stageProgress[stageIndex].startedAt = new Date().toISOString();
    }
    
    if (status === 'completed') {
      project.stageProgress[stageIndex].completedAt = new Date().toISOString();
    }
  }

  await updateProject(project);
}

// =============================================
// 资产管理
// =============================================

/**
 * 保存资产
 */
export async function saveAsset(asset: Omit<Asset, 'id' | 'createdAt'>): Promise<Asset> {
  const db = await getDB();
  
  const fullAsset: Asset = {
    ...asset,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };

  await db.put('assets', fullAsset);
  return fullAsset;
}

/**
 * 获取资产
 */
export async function getAsset(assetId: string): Promise<Asset | undefined> {
  const db = await getDB();
  return db.get('assets', assetId);
}

/**
 * 获取项目的所有资产
 */
export async function getProjectAssets(projectId: string): Promise<Asset[]> {
  const db = await getDB();
  return db.getAllFromIndex('assets', 'by-project', projectId);
}

/**
 * 删除资产
 */
export async function deleteAsset(assetId: string): Promise<void> {
  const db = await getDB();
  await db.delete('assets', assetId);
}

/**
 * 更新资产的云端 URL
 */
export async function updateAssetCloudUrl(assetId: string, cloudUrl: string): Promise<void> {
  const db = await getDB();
  const asset = await db.get('assets', assetId);
  if (asset) {
    asset.cloudUrl = cloudUrl;
    asset.uploadStatus = 'uploaded';
    await db.put('assets', asset);
  }
}

/**
 * 获取存储统计
 */
export async function getStorageStats(): Promise<{
  totalProjects: number;
  totalAssets: number;
  totalSnapshots: number;
  estimatedSize: number;
}> {
  const db = await getDB();
  
  const projects = await db.count('projects');
  const assets = await db.count('assets');
  const snapshots = await db.count('canvasSnapshots');
  
  // 估算存储大小（粗略计算）
  let estimatedSize = 0;
  const allAssets = await db.getAll('assets');
  for (const asset of allAssets) {
    if (asset.localData) {
      estimatedSize += asset.localData.length;
    }
  }

  return {
    totalProjects: projects,
    totalAssets: assets,
    totalSnapshots: snapshots,
    estimatedSize,
  };
}

// =============================================
// 画布快照管理
// =============================================

/**
 * 保存画布快照
 */
export async function saveCanvasSnapshot(
  projectId: string,
  stage: ProjectStage,
  snapshot: object
): Promise<CanvasSnapshot> {
  const db = await getDB();
  
  // 查找是否已有该项目和阶段的快照
  const existing = await db.getAllFromIndex('canvasSnapshots', 'by-project', projectId);
  const existingSnapshot = existing.find(s => s.stage === stage);
  
  const canvasSnapshot: CanvasSnapshot = {
    id: existingSnapshot?.id || uuidv4(),
    projectId,
    stage,
    snapshot,
    updatedAt: new Date().toISOString(),
  };

  await db.put('canvasSnapshots', canvasSnapshot);
  return canvasSnapshot;
}

/**
 * 获取画布快照
 */
export async function getCanvasSnapshot(
  projectId: string,
  stage: ProjectStage
): Promise<CanvasSnapshot | undefined> {
  const db = await getDB();
  const snapshots = await db.getAllFromIndex('canvasSnapshots', 'by-project', projectId);
  return snapshots.find(s => s.stage === stage);
}

/**
 * 删除画布快照
 */
export async function deleteCanvasSnapshot(snapshotId: string): Promise<void> {
  const db = await getDB();
  await db.delete('canvasSnapshots', snapshotId);
}

// =============================================
// 数据导入导出
// =============================================

/**
 * 导出项目数据
 */
export async function exportProject(projectId: string): Promise<{
  project: Project;
  assets: Asset[];
  snapshots: CanvasSnapshot[];
}> {
  const project = await getProject(projectId);
  if (!project) throw new Error('项目不存在');

  const assets = await getProjectAssets(projectId);
  
  const db = await getDB();
  const snapshots = await db.getAllFromIndex('canvasSnapshots', 'by-project', projectId);

  return { project, assets, snapshots };
}

/**
 * 导入项目数据
 */
export async function importProject(data: {
  project: Project;
  assets: Asset[];
  snapshots: CanvasSnapshot[];
}): Promise<string> {
  const db = await getDB();
  
  // 生成新的项目ID
  const newProjectId = uuidv4();
  const idMapping = new Map<string, string>();
  idMapping.set(data.project.meta.id, newProjectId);

  // 更新项目ID
  const newProject = { ...data.project };
  newProject.meta.id = newProjectId;
  newProject.meta.name = `${newProject.meta.name} (导入)`;
  newProject.meta.createdAt = new Date().toISOString();
  newProject.meta.updatedAt = new Date().toISOString();

  await db.put('projects', newProject);

  // 导入资产
  for (const asset of data.assets) {
    const newAssetId = uuidv4();
    idMapping.set(asset.id, newAssetId);
    
    await db.put('assets', {
      ...asset,
      id: newAssetId,
      projectId: newProjectId,
    });
  }

  // 导入画布快照
  for (const snapshot of data.snapshots) {
    await db.put('canvasSnapshots', {
      ...snapshot,
      id: uuidv4(),
      projectId: newProjectId,
    });
  }

  return newProjectId;
}

/**
 * 清除所有数据（危险操作）
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear('projects');
  await db.clear('assets');
  await db.clear('canvasSnapshots');
}
