export const IMAGE_ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9 横屏', shape: '▭', width: 2560, height: 1440 },
  { value: '4:3', label: '4:3 标准', shape: '▭', width: 2304, height: 1728 },
  { value: '3:2', label: '3:2 摄影', shape: '▭', width: 2496, height: 1664 },
  { value: '1:1', label: '1:1 方形', shape: '□', width: 2048, height: 2048 },
  { value: '2:3', label: '2:3 竖版', shape: '▯', width: 1664, height: 2496 },
  { value: '3:4', label: '3:4 竖屏', shape: '▯', width: 1728, height: 2304 },
  { value: '9:16', label: '9:16 手机', shape: '▯', width: 1440, height: 2560 },
  { value: '21:9', label: '21:9 宽屏', shape: '━', width: 3024, height: 1296 },
] as const;
