'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-40 cursor-pointer rounded-md whitespace-nowrap',
  {
    variants: {
      variant: {
        ghost:  'text-slate-400 hover:text-slate-200 hover:bg-white/5',
        glass:  'glass text-slate-300 hover:text-white hover:border-white/15 hover:bg-white/6',
        neon:   'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60 hover:text-indigo-200',
        danger: 'bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:border-red-400/50 hover:text-red-300',
      },
      size: {
        xs: 'h-6 px-2 text-[11px] gap-1',
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
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
