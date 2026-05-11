'use client';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { motion } from 'framer-motion';
import { fadeInUp } from '@/lib/motion/variants';
import { cn } from '@/lib/utils';

export const TooltipProvider = RadixTooltip.Provider;

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  delay?: number;
  className?: string;
}

export function Tooltip({ children, content, side = 'top', align = 'center', delay = 400, className }: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content side={side} align={align} sideOffset={6} asChild>
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fadeInUp}
            className={cn(
              'z-50 rounded-md px-2.5 py-1.5 text-xs text-slate-200 max-w-55',
              'glass border border-white/10 shadow-xl',
              className,
            )}
          >
            {content}
          </motion.div>
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
