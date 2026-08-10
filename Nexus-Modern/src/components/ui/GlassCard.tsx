'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'blue' | 'violet' | 'cyan' | 'green' | 'red' | 'none';
  hover?: boolean;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
}

const GLOW_MAP = {
  blue: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] hover:border-blue-500/30',
  violet: 'hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] hover:border-violet-500/30',
  cyan: 'hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:border-cyan-500/30',
  green: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:border-emerald-500/30',
  red: 'hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] hover:border-red-500/30',
  none: '',
};

export default function GlassCard({
  children, className, glow = 'blue', hover = true, animate = true, delay = 0, onClick,
}: GlassCardProps) {
  const content = (
    <div
      className={cn(
        'glass rounded-xl transition-all duration-300',
        hover && GLOW_MAP[glow],
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (!animate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {content}
    </motion.div>
  );
}
