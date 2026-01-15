export type DirectorVideoResolution = '480p' | '720p'
export type DirectorVideoRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

export interface DirectorVideoConfig {
  resolution: DirectorVideoResolution
  ratio: DirectorVideoRatio
}

const DEFAULT_CONFIG: DirectorVideoConfig = {
  resolution: '480p',
  ratio: '16:9',
}

function getStorageKey(projectId: string): string {
  return `directorVideoConfig:${projectId}`
}

function isValidResolution(v: unknown): v is DirectorVideoResolution {
  return v === '480p' || v === '720p'
}

function isValidRatio(v: unknown): v is DirectorVideoRatio {
  return v === '16:9' || v === '4:3' || v === '1:1' || v === '3:4' || v === '9:16' || v === '21:9'
}

function normalizeConfig(input: Partial<DirectorVideoConfig> | null | undefined): DirectorVideoConfig {
  const resolution = isValidResolution(input?.resolution) ? input!.resolution : DEFAULT_CONFIG.resolution
  const ratio = isValidRatio(input?.ratio) ? input!.ratio : DEFAULT_CONFIG.ratio
  return { resolution, ratio }
}

export function getDirectorVideoConfig(projectId: string): DirectorVideoConfig {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId))
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return normalizeConfig(parsed)
  } catch {
    return DEFAULT_CONFIG
  }
}

export function setDirectorVideoConfig(projectId: string, patch: Partial<DirectorVideoConfig>): DirectorVideoConfig {
  const next = normalizeConfig({ ...getDirectorVideoConfig(projectId), ...patch })
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(next))
  } catch {
    // ignore write errors (e.g., private mode / quota)
  }
  return next
}
