'use client';

import { cn } from '@/lib/utils';
import type { WorkflowType } from '@/lib/chat';
import { Bot, MessageSquareText, Sparkles } from 'lucide-react';

type WorkflowTypeSelectorProps = {
  value: WorkflowType;
  onChange: (value: WorkflowType) => void;
  compact?: boolean;
};

const workflowTypes: Array<{
  value: WorkflowType;
  title: string;
  description: string;
  detail: string;
  icon: typeof Sparkles;
}> = [
  {
    value: 'automation',
    title: 'Automation',
    description: 'Trigger-based workflows.',
    detail: 'Runs on schedule, webhook, or events.',
    icon: Sparkles,
  },
  {
    value: 'chat',
    title: 'Chat',
    description: 'Conversational AI assistant.',
    detail: 'Public chat URL with embeddable widget.',
    icon: MessageSquareText,
  },
  {
    value: 'agent',
    title: 'Agent',
    description: 'Multi-step reasoning.',
    detail: 'Tool use, memory, and guided autonomy.',
    icon: Bot,
  },
];

export function WorkflowTypeSelector({ value, onChange, compact = false }: WorkflowTypeSelectorProps) {
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 xl:grid-cols-3')}>
      {workflowTypes.map((type) => {
        const Icon = type.icon;
        const active = type.value === value;

        return (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border text-left transition-all duration-200',
              compact ? 'p-4' : 'p-5',
              active
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_var(--color-primary)]'
                : 'border-border bg-card/70 hover:border-primary/50 hover:bg-accent/40'
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_50%)] opacity-80" />
            <div className="relative flex items-start gap-3">
              <div className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl border',
                active
                  ? 'border-primary/50 bg-primary text-primary-foreground'
                  : 'border-border bg-background/80 text-muted-foreground group-hover:text-foreground'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{type.title}</span>
                  {active && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-primary">Selected</span>}
                </div>
                <p className="text-sm text-foreground/90">{type.description}</p>
                <p className="text-xs text-muted-foreground">{type.detail}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
