'use client';
import { EdgeLabelRenderer } from '@xyflow/react';
import { cn } from '@/lib/utils';

interface AnimatedEdgeLabelProps {
  labelX: number;
  labelY: number;
  label?: string;
  isTraversing?: boolean;
  color?: string;
}

export function AnimatedEdgeLabel({ labelX, labelY, label, isTraversing, color = '#6366f1' }: AnimatedEdgeLabelProps) {
  if (!label && !isTraversing) return null;

  return (
    <EdgeLabelRenderer>
      <div
        className={cn(
          'absolute pointer-events-none flex items-center gap-1',
          'text-[9px] font-mono',
        )}
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
      >
        {isTraversing && (
          <span
            className="w-2 h-2 rounded-full block shrink-0"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}`,
              animation: 'edge-traversal 1.2s ease-in-out infinite',
            }}
          />
        )}
        {label && (
          <span
            className="px-1 py-0.5 rounded text-[9px]"
            style={{
              color,
              background: `${color}15`,
              border: `1px solid ${color}30`,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </EdgeLabelRenderer>
  );
}
