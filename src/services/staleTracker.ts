/**
 * StaleTracker - 过期标记传播服务
 * 
 * 当上游数据变化时，自动标记下游数据为"过期"（stale）
 * 
 * 数据依赖链：
 * 编剧(剧本) → 分镜师(分镜) → 图像设计师(提示词) → 美工(图片) → 导演(视频)
 */

import type { 
  Project, 
  ProjectStage,
  EpisodeScript,
  StoryboardEpisode,
  Shot,
  KeyframePrompt,
  GeneratedImage,
  GeneratedVideo,
} from '@/types';

/** 过期标记粒度 */
export type StaleGranularity = 
  | 'project'      // 整个项目
  | 'episode'      // 单集
  | 'scene'        // 场景
  | 'shot';        // 镜头

/** 过期标记变更事件 */
export interface StaleChangeEvent {
  stage: ProjectStage;
  granularity: StaleGranularity;
  affectedIds: string[];
  timestamp: number;
}

/**
 * 标记编剧数据为过期，并传播到下游
 */
export function markScreenwriterStale(
  project: Project,
  episodeNumbers?: number[]
): Project {
  const updated = { ...project };
  
  if (!updated.screenwriter) return updated;

  // 标记编剧数据
  updated.screenwriter = { ...updated.screenwriter, isStale: true };

  if (episodeNumbers && episodeNumbers.length > 0) {
    // 标记特定集
    updated.screenwriter.scripts = updated.screenwriter.scripts.map(script => {
      if (episodeNumbers.includes(script.episodeNumber)) {
        return {
          ...script,
          isStale: true,
          scenes: script.scenes.map(scene => ({ ...scene, isStale: true })),
        };
      }
      return script;
    });

    updated.screenwriter.outline = updated.screenwriter.outline.map(outline => {
      if (episodeNumbers.includes(outline.episodeNumber)) {
        return { ...outline, isStale: true };
      }
      return outline;
    });
  } else {
    // 标记所有
    updated.screenwriter.scripts = updated.screenwriter.scripts.map(script => ({
      ...script,
      isStale: true,
      scenes: script.scenes.map(scene => ({ ...scene, isStale: true })),
    }));

    updated.screenwriter.outline = updated.screenwriter.outline.map(outline => ({
      ...outline,
      isStale: true,
    }));

    updated.screenwriter.characters = updated.screenwriter.characters.map(char => ({
      ...char,
      isStale: true,
    }));
  }

  // 传播到下游
  return propagateStaleToDownstream(updated, 'screenwriter', episodeNumbers);
}

/**
 * 标记分镜数据为过期，并传播到下游
 */
export function markStoryboardStale(
  project: Project,
  episodeNumbers?: number[],
  shotIds?: string[]
): Project {
  const updated = { ...project };

  if (!updated.storyboard) return updated;

  updated.storyboard = { ...updated.storyboard, isStale: true };

  if (shotIds && shotIds.length > 0) {
    // 标记特定镜头
    updated.storyboard.episodes = updated.storyboard.episodes.map(ep => ({
      ...ep,
      shots: ep.shots.map(shot => {
        if (shotIds.includes(shot.id)) {
          return { ...shot, isStale: true };
        }
        return shot;
      }),
    }));
  } else if (episodeNumbers && episodeNumbers.length > 0) {
    // 标记特定集
    updated.storyboard.episodes = updated.storyboard.episodes.map(ep => {
      if (episodeNumbers.includes(ep.episodeNumber)) {
        return {
          ...ep,
          isStale: true,
          shots: ep.shots.map(shot => ({ ...shot, isStale: true })),
        };
      }
      return ep;
    });
  } else {
    // 标记所有
    updated.storyboard.episodes = updated.storyboard.episodes.map(ep => ({
      ...ep,
      isStale: true,
      shots: ep.shots.map(shot => ({ ...shot, isStale: true })),
    }));
  }

  // 传播到下游
  return propagateStaleToDownstream(updated, 'storyboard', episodeNumbers, shotIds);
}

/**
 * 标记图像设计数据为过期，并传播到下游
 */
export function markImageDesignerStale(
  project: Project,
  promptIds?: string[]
): Project {
  const updated = { ...project };

  if (!updated.imageDesigner) return updated;

  updated.imageDesigner = { ...updated.imageDesigner, isStale: true };

  if (promptIds && promptIds.length > 0) {
    // 标记特定提示词
    updated.imageDesigner.keyframePrompts = updated.imageDesigner.keyframePrompts.map(kf => {
      if (promptIds.includes(kf.id)) {
        return { ...kf, isStale: true };
      }
      return kf;
    });
  } else {
    // 标记所有
    updated.imageDesigner.characterPrompts = updated.imageDesigner.characterPrompts.map(p => ({
      ...p,
      isStale: true,
    }));
    updated.imageDesigner.scenePrompts = updated.imageDesigner.scenePrompts.map(p => ({
      ...p,
      isStale: true,
    }));
    updated.imageDesigner.keyframePrompts = updated.imageDesigner.keyframePrompts.map(p => ({
      ...p,
      isStale: true,
    }));
  }

  // 传播到下游
  return propagateStaleToDownstream(updated, 'imageDesigner', undefined, undefined, promptIds);
}

/**
 * 向下游传播过期标记
 */
function propagateStaleToDownstream(
  project: Project,
  fromStage: ProjectStage,
  episodeNumbers?: number[],
  shotIds?: string[],
  promptIds?: string[]
): Project {
  let updated = { ...project };

  switch (fromStage) {
    case 'screenwriter':
      // 编剧 → 分镜师
      if (updated.storyboard) {
        updated.storyboard = { ...updated.storyboard, isStale: true };
        
        if (episodeNumbers && episodeNumbers.length > 0) {
          updated.storyboard.episodes = updated.storyboard.episodes.map(ep => {
            if (episodeNumbers.includes(ep.episodeNumber)) {
              return {
                ...ep,
                isStale: true,
                shots: ep.shots.map(shot => ({ ...shot, isStale: true })),
              };
            }
            return ep;
          });
        } else {
          updated.storyboard.episodes = updated.storyboard.episodes.map(ep => ({
            ...ep,
            isStale: true,
            shots: ep.shots.map(shot => ({ ...shot, isStale: true })),
          }));
        }
      }
      // 继续传播
      updated = propagateStaleToDownstream(updated, 'storyboard', episodeNumbers);
      break;

    case 'storyboard':
      // 分镜师 → 图像设计师
      if (updated.imageDesigner) {
        updated.imageDesigner = { ...updated.imageDesigner, isStale: true };

        // 根据 shotIds 找到关联的关键帧提示词
        const affectedKeyframes = shotIds
          ? updated.imageDesigner.keyframePrompts.filter(kf => shotIds.includes(kf.shotId))
          : updated.imageDesigner.keyframePrompts;

        const affectedPromptIds = affectedKeyframes.map(kf => kf.id);

        updated.imageDesigner.keyframePrompts = updated.imageDesigner.keyframePrompts.map(kf => {
          if (!shotIds || shotIds.includes(kf.shotId)) {
            return { ...kf, isStale: true };
          }
          return kf;
        });

        // 继续传播
        updated = propagateStaleToDownstream(updated, 'imageDesigner', undefined, undefined, affectedPromptIds);
      }
      break;

    case 'imageDesigner':
      // 图像设计师 → 美工
      if (updated.artist) {
        updated.artist = { ...updated.artist, isStale: true };

        updated.artist.keyframeImages = updated.artist.keyframeImages.map(img => {
          if (!promptIds || promptIds.includes(img.promptId)) {
            return { ...img, isStale: true };
          }
          return img;
        });

        // 获取受影响的图片ID
        const affectedImageIds = updated.artist.keyframeImages
          .filter(img => !promptIds || promptIds.includes(img.promptId))
          .map(img => img.id);

        // 继续传播到导演
        updated = propagateStaleToDownstream(updated, 'artist', undefined, undefined, undefined);
      }
      break;

    case 'artist':
      // 美工 → 导演
      if (updated.director) {
        updated.director = { ...updated.director, isStale: true };
        updated.director.videos = updated.director.videos.map(video => ({
          ...video,
          isStale: true,
        }));
      }
      break;
  }

  return updated;
}

/**
 * 清除过期标记（当数据被重新生成后）
 */
export function clearStaleMarks(
  project: Project,
  stage: ProjectStage,
  ids?: string[]
): Project {
  const updated = { ...project };

  switch (stage) {
    case 'screenwriter':
      if (updated.screenwriter) {
        if (ids) {
          // 清除特定项
          updated.screenwriter.scripts = updated.screenwriter.scripts.map(script => ({
            ...script,
            isStale: ids.includes(String(script.episodeNumber)) ? false : script.isStale,
          }));
        } else {
          // 清除所有
          updated.screenwriter = { ...updated.screenwriter, isStale: false };
          updated.screenwriter.scripts = updated.screenwriter.scripts.map(s => ({
            ...s,
            isStale: false,
            scenes: s.scenes.map(sc => ({ ...sc, isStale: false })),
          }));
        }
      }
      break;

    case 'storyboard':
      if (updated.storyboard) {
        if (ids) {
          updated.storyboard.episodes = updated.storyboard.episodes.map(ep => ({
            ...ep,
            shots: ep.shots.map(shot => ({
              ...shot,
              isStale: ids.includes(shot.id) ? false : shot.isStale,
            })),
          }));
        } else {
          updated.storyboard = { ...updated.storyboard, isStale: false };
          updated.storyboard.episodes = updated.storyboard.episodes.map(ep => ({
            ...ep,
            isStale: false,
            shots: ep.shots.map(shot => ({ ...shot, isStale: false })),
          }));
        }
      }
      break;

    case 'imageDesigner':
      if (updated.imageDesigner) {
        updated.imageDesigner = { ...updated.imageDesigner, isStale: false };
        updated.imageDesigner.keyframePrompts = updated.imageDesigner.keyframePrompts.map(kf => ({
          ...kf,
          isStale: ids ? (ids.includes(kf.id) ? false : kf.isStale) : false,
        }));
      }
      break;

    case 'artist':
      if (updated.artist) {
        updated.artist = { ...updated.artist, isStale: false };
        updated.artist.keyframeImages = updated.artist.keyframeImages.map(img => ({
          ...img,
          isStale: ids ? (ids.includes(img.id) ? false : img.isStale) : false,
        }));
      }
      break;

    case 'director':
      if (updated.director) {
        updated.director = { ...updated.director, isStale: false };
        updated.director.videos = updated.director.videos.map(v => ({
          ...v,
          isStale: ids ? (ids.includes(v.id) ? false : v.isStale) : false,
        }));
      }
      break;
  }

  return updated;
}

/**
 * 获取过期数据统计
 */
export function getStaleStats(project: Project): {
  screenwriter: { staleEpisodes: number; totalEpisodes: number };
  storyboard: { staleShots: number; totalShots: number };
  imageDesigner: { stalePrompts: number; totalPrompts: number };
  artist: { staleImages: number; totalImages: number };
  director: { staleVideos: number; totalVideos: number };
} {
  const stats = {
    screenwriter: { staleEpisodes: 0, totalEpisodes: 0 },
    storyboard: { staleShots: 0, totalShots: 0 },
    imageDesigner: { stalePrompts: 0, totalPrompts: 0 },
    artist: { staleImages: 0, totalImages: 0 },
    director: { staleVideos: 0, totalVideos: 0 },
  };

  if (project.screenwriter) {
    stats.screenwriter.totalEpisodes = project.screenwriter.scripts.length;
    stats.screenwriter.staleEpisodes = project.screenwriter.scripts.filter(s => s.isStale).length;
  }

  if (project.storyboard) {
    for (const ep of project.storyboard.episodes) {
      stats.storyboard.totalShots += ep.shots.length;
      stats.storyboard.staleShots += ep.shots.filter(s => s.isStale).length;
    }
  }

  if (project.imageDesigner) {
    stats.imageDesigner.totalPrompts = project.imageDesigner.keyframePrompts.length;
    stats.imageDesigner.stalePrompts = project.imageDesigner.keyframePrompts.filter(p => p.isStale).length;
  }

  if (project.artist) {
    stats.artist.totalImages = project.artist.keyframeImages.length;
    stats.artist.staleImages = project.artist.keyframeImages.filter(i => i.isStale).length;
  }

  if (project.director) {
    stats.director.totalVideos = project.director.videos.length;
    stats.director.staleVideos = project.director.videos.filter(v => v.isStale).length;
  }

  return stats;
}
