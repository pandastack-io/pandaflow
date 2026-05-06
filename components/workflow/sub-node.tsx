'use client';

import { memo, useState, type ComponentType } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import { BrandIcon } from '@/components/ui/brand-icon';
import { getProviderIcon } from '@/lib/credentials/brand-icons';
import { getNodeByType } from '@/lib/nodes/registry';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/types/nodes';

const DEFAULT_ICON = 'Box';

const roleStyles = {
  model: {
    border: 'border-violet-500/60',
    background: 'bg-violet-500/10',
    text: 'text-violet-300',
    handle: '!bg-violet-500',
  },
  memory: {
    border: 'border-emerald-500/60',
    background: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    handle: '!bg-emerald-500',
  },
  tool: {
    border: 'border-amber-500/60',
    background: 'bg-amber-500/10',
    text: 'text-amber-300',
    handle: '!bg-amber-500',
  },
} as const;

export const SubNode = memo(({ id, data, selected }: NodeProps<WorkflowNodeData>) => {
  const nodeInfo = getNodeByType(data.type);
  const deleteNode = useWorkflowStore((state) => state.deleteNode);
  const [isHovered, setIsHovered] = useState(false);

  if (!nodeInfo || !data.subNodeRole) {
    return null;
  }

  const style = roleStyles[data.subNodeRole];
  const iconName = (nodeInfo.icon || DEFAULT_ICON) as keyof typeof LucideIcons;
  const IconComponent = (LucideIcons[iconName] || LucideIcons.Box) as ComponentType<{ className?: string }>;
  const brandIcon = getProviderIcon(
    typeof data.config?.provider === 'string' ? data.config.provider : null,
    nodeInfo.brandIcon,
    nodeInfo.type.split('.').slice(1).join('.'),
    nodeInfo.type.split('.').at(-1)
  );

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex w-[96px] flex-col items-center"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className={cn('!h-3 !w-3 !border-2 !border-background', style.handle)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className={cn('!h-3 !w-3 !border-2 !border-background', style.handle)}
      />

      {isHovered && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            deleteNode(id);
          }}
          className="nowheel nodrag nopan absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/95 text-muted-foreground shadow-sm transition hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg transition-all',
          style.border,
          style.background,
          selected && 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
        )}
      >
        {brandIcon ? <BrandIcon icon={brandIcon} size={26} branded={false} /> : <IconComponent className={cn('h-7 w-7', style.text)} />}
      </div>
      <div className="mt-2 max-w-[96px] text-center text-xs font-medium text-foreground">
        {data.config?.label || nodeInfo.name}
      </div>
    </div>
  );
});

SubNode.displayName = 'SubNode';
