/**
 * 项目上下文 - 管理当前项目状态
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { Project, ProjectStage, CreateProjectInput, ProjectListItem } from '@/types'
import * as storage from '@/services/storageService'

interface ProjectContextValue {
  // 项目列表
  projects: ProjectListItem[];
  loadProjects: () => Promise<void>;
  
  // 当前项目
  currentProject: Project | null;
  loadProject: (projectId: string) => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<string>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  
  // 阶段管理
  currentStage: ProjectStage;
  setCurrentStage: (stage: ProjectStage) => void;
  
  // 加载状态
  isLoading: boolean;
  error: string | null;
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [currentStage, setCurrentStage] = useState<ProjectStage>('screenwriter')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const projectList = await storage.getProjectList()
      setProjects(projectList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目列表失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 加载单个项目
  const loadProject = useCallback(async (projectId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const project = await storage.getProject(projectId)
      if (project) {
        setCurrentProject(project)
      } else {
        setError('项目不存在')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 创建新项目
  const createNewProject = useCallback(async (input: CreateProjectInput): Promise<string> => {
    setIsLoading(true)
    setError(null)
    try {
      const project = await storage.createProject(input)
      setCurrentProject(project)
      // 新项目始终从编剧阶段开始
      setCurrentStage('screenwriter')
      // 刷新项目列表
      const projectList = await storage.getProjectList()
      setProjects(projectList)
      return project.meta.id
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 更新项目
  const updateCurrentProject = useCallback(async (project: Project) => {
    setIsLoading(true)
    setError(null)
    try {
      await storage.updateProject(project)
      setCurrentProject(project)
      // 刷新项目列表
      const projectList = await storage.getProjectList()
      setProjects(projectList)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新项目失败')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 删除项目
  const deleteCurrentProject = useCallback(async (projectId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await storage.deleteProject(projectId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      if (currentProject?.meta.id === projectId) {
        setCurrentProject(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除项目失败')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [currentProject])

  // 重命名项目
  const renameCurrentProject = useCallback(async (projectId: string, newName: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const project = await storage.getProject(projectId)
      if (project) {
        project.meta.name = newName
        await storage.updateProject(project)
        setProjects(prev => 
          prev.map(p => p.id === projectId ? { ...p, name: newName } : p)
        )
        if (currentProject?.meta.id === projectId) {
          setCurrentProject(prev => prev ? {
            ...prev,
            meta: { ...prev.meta, name: newName }
          } : null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名项目失败')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [currentProject])

  const value: ProjectContextValue = {
    projects,
    loadProjects,
    currentProject,
    loadProject,
    createProject: createNewProject,
    updateProject: updateCurrentProject,
    deleteProject: deleteCurrentProject,
    renameProject: renameCurrentProject,
    currentStage,
    setCurrentStage,
    isLoading,
    error,
  }

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
