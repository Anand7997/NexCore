import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-default)] disabled:pointer-events-none disabled:opacity-40 cursor-pointer rounded-lg whitespace-nowrap',
  {
    variants: {
      variant: {
        ghost:  'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)] hover:bg-[var(--color-accent-soft)]',
        glass:  'glass text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)] hover:border-[var(--color-line-strong)] hover:bg-white/6',
        neon:   'bg-[var(--color-accent-soft)] border border-[rgba(34,211,238,0.40)] text-[var(--color-accent-default)] hover:bg-[rgba(34,211,238,0.18)] hover:border-[rgba(34,211,238,0.62)] hover:text-cyan-100',
        danger: 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:border-red-400/50 hover:text-red-300',
      },
      size: {
        xs: 'h-8 px-3 text-[13px] gap-1.5',
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-10 px-4 text-[15px]',
      },
    },
    defaultVariants: { variant: 'glass', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
    >
      {children}
    </motion.button>
  );
}
