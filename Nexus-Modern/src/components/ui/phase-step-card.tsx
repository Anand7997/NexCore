import React from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Phase card anatomy shared with the Home "Automation Pro Suite" cards
 * (see MainDashboard.renderHomeContent): coloured left border, 12x12 icon
 * tile, title, description, phase/step badge and a trailing arrow.
 *
 * Every automation block reuses this so its sub-steps look like the phases
 * on Home.
 */

export type PhaseAccent =
  | 'blue'
  | 'violet'
  | 'purple'
  | 'emerald'
  | 'green'
  | 'amber'
  | 'orange'
  | 'cyan'
  | 'sky'
  | 'teal'
  | 'indigo'
  | 'rose'
  | 'red'
  | 'slate';

interface AccentStyles {
  border: string;
  hoverBorder: string;
  tile: string;
  badge: string;
  arrow: string;
}

// Full class strings only - Tailwind cannot see interpolated class names.
const ACCENTS: Record<PhaseAccent, AccentStyles> = {
  blue: {
    border: 'border-l-blue-600',
    hoverBorder: 'hover:border-blue-300',
    tile: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    arrow: 'text-blue-500',
  },
  violet: {
    border: 'border-l-violet-600',
    hoverBorder: 'hover:border-violet-300',
    tile: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    arrow: 'text-violet-500',
  },
  purple: {
    border: 'border-l-purple-600',
    hoverBorder: 'hover:border-purple-300',
    tile: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    arrow: 'text-purple-500',
  },
  emerald: {
    border: 'border-l-emerald-600',
    hoverBorder: 'hover:border-emerald-300',
    tile: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    arrow: 'text-emerald-500',
  },
  green: {
    border: 'border-l-green-600',
    hoverBorder: 'hover:border-green-300',
    tile: 'bg-green-500',
    badge: 'bg-green-100 text-green-800 border-green-200',
    arrow: 'text-green-500',
  },
  amber: {
    border: 'border-l-amber-600',
    hoverBorder: 'hover:border-amber-300',
    tile: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    arrow: 'text-amber-500',
  },
  orange: {
    border: 'border-l-orange-600',
    hoverBorder: 'hover:border-orange-300',
    tile: 'bg-orange-500',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    arrow: 'text-orange-500',
  },
  cyan: {
    border: 'border-l-cyan-600',
    hoverBorder: 'hover:border-cyan-300',
    tile: 'bg-cyan-600',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    arrow: 'text-cyan-600',
  },
  sky: {
    border: 'border-l-sky-600',
    hoverBorder: 'hover:border-sky-300',
    tile: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    arrow: 'text-sky-600',
  },
  teal: {
    border: 'border-l-teal-600',
    hoverBorder: 'hover:border-teal-300',
    tile: 'bg-teal-600',
    badge: 'bg-teal-100 text-teal-800 border-teal-200',
    arrow: 'text-teal-600',
  },
  indigo: {
    border: 'border-l-indigo-600',
    hoverBorder: 'hover:border-indigo-300',
    tile: 'bg-indigo-500',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    arrow: 'text-indigo-500',
  },
  rose: {
    border: 'border-l-rose-600',
    hoverBorder: 'hover:border-rose-300',
    tile: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    arrow: 'text-rose-500',
  },
  red: {
    border: 'border-l-red-600',
    hoverBorder: 'hover:border-red-300',
    tile: 'bg-red-500',
    badge: 'bg-red-100 text-red-800 border-red-200',
    arrow: 'text-red-500',
  },
  slate: {
    border: 'border-l-slate-600',
    hoverBorder: 'hover:border-slate-300',
    tile: 'bg-slate-500',
    badge: 'bg-slate-100 text-slate-800 border-slate-200',
    arrow: 'text-slate-600',
  },
};

export interface PhaseStepCardProps {
  /** Lucide icon rendered inside the coloured tile. */
  icon: LucideIcon;
  title: string;
  description: string;
  /** Badge text - "Step 1", "Phase 2", "Tools", ... */
  step: string;
  accent?: PhaseAccent;
  onClick?: () => void;
  /** Blocks the click, dims the card and swaps the arrow for a lock. */
  disabled?: boolean;
  /** Reason shown when disabled, e.g. "Select a project first". */
  disabledHint?: string;
  /** Marks the card as the currently opened phase/step. */
  active?: boolean;
  /** Extra content between description and badge row (live status badges). */
  children?: React.ReactNode;
  className?: string;
}

export const PhaseStepCard: React.FC<PhaseStepCardProps> = ({
  icon: Icon,
  title,
  description,
  step,
  accent = 'blue',
  onClick,
  disabled = false,
  disabledHint,
  active = false,
  children,
  className,
}) => {
  const styles = ACCENTS[accent] ?? ACCENTS.blue;
  const isInteractive = !disabled && Boolean(onClick);

  return (
    <Card
      className={cn(
        'transition-all duration-200 border-l-4',
        styles.border,
        disabled
          ? 'cursor-not-allowed opacity-60'
          : cn(styles.hoverBorder, isInteractive && 'cursor-pointer hover:shadow-md'),
        active && 'ring-2 ring-primary/40 shadow-md bg-primary/5',
        className
      )}
      aria-current={active ? 'step' : undefined}
      onClick={() => {
        if (isInteractive) {
          onClick?.();
        }
      }}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={(event) => {
        if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick?.();
        }
      }}
      aria-disabled={disabled || undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-3">
          <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', styles.tile)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg text-foreground">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm mb-4">{description}</p>

        {children && <div className="mb-4">{children}</div>}

        {disabled && disabledHint && (
          <p className="text-muted-foreground text-xs font-medium mb-4">{disabledHint}</p>
        )}

        <div className="flex items-center justify-between">
          <Badge variant="secondary" className={styles.badge}>
            {step}
          </Badge>
          {disabled ? (
            <Lock className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ArrowRight className={cn('w-4 h-4', styles.arrow)} />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PhaseStepCard;
