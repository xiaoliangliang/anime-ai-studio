/**
 * 文字闪烁动效组件 - 纯 CSS 实现，不依赖 Tailwind
 */
import React from 'react';
import './text-shimmer.css';

interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
}

export function TextShimmer({
  children,
  className = '',
  duration = 1.5,
}: TextShimmerProps) {
  return (
    <span 
      className={`text-shimmer ${className}`}
      style={{ 
        animationDuration: `${duration}s`,
      }}
    >
      {children}
    </span>
  );
}
