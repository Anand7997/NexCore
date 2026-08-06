import React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  icon?: LucideIcon;
}

export function EmptyState({ message, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon size={28} style={{ color: 'var(--cp-fg-subtle)' }} />
      <p className="text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
        {message}
      </p>
    </div>
  );
}

export default EmptyState;
