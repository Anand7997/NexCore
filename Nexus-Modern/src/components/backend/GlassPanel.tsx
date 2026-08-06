import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  hover?: boolean;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function GlassPanel({
  children,
  className = '',
  glow,
  hover = true,
  animate = true,
  delay = 0,
  onClick,
}: GlassPanelProps) {
  const reduceMotion = useReducedMotion();

  const content = (
    <div
      className={`cp-glass rounded-2xl transition-all duration-300 relative overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      onMouseEnter={(event) => {
        if (!hover || !glow) return;
        event.currentTarget.style.boxShadow = `0 0 32px ${glow}26`;
      }}
      onMouseLeave={(event) => {
        if (!hover || !glow) return;
        event.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </div>
  );

  if (!animate || reduceMotion) return content;

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {content}
    </motion.div>
  );
}

export default GlassPanel;
