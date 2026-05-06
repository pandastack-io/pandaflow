'use client';

import { memo } from 'react';
import { NodeProps, NodeResizer } from 'reactflow';
import { GripHorizontal, X } from 'lucide-react';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import type { StickyNote, StickyNoteColor } from '@/types/nodes';
import { cn } from '@/lib/utils';

export interface StickyNoteNodeData {
  note: StickyNote;
}

const NOTE_STYLES: Record<StickyNoteColor, { background: string; border: string; text: string; swatch: string }> = {
  yellow: {
    background: 'rgba(250, 204, 21, 0.72)',
    border: 'rgba(234, 179, 8, 0.9)',
    text: '#451a03',
    swatch: '#facc15',
  },
  blue: {
    background: 'rgba(59, 130, 246, 0.68)',
    border: 'rgba(37, 99, 235, 0.9)',
    text: '#0a0f2e',
    swatch: '#3b82f6',
  },
  green: {
    background: 'rgba(34, 197, 94, 0.65)',
    border: 'rgba(21, 128, 61, 0.9)',
    text: '#052e16',
    swatch: '#22c55e',
  },
  pink: {
    background: 'rgba(236, 72, 153, 0.65)',
    border: 'rgba(190, 24, 93, 0.9)',
    text: '#2d0a1e',
    swatch: '#ec4899',
  },
  purple: {
    background: 'rgba(168, 85, 247, 0.65)',
    border: 'rgba(126, 34, 206, 0.9)',
    text: '#1e0a3c',
    swatch: '#a855f7',
  },
};

export const StickyNoteNode = memo(({ id, data, selected }: NodeProps<StickyNoteNodeData>) => {
  const updateStickyNote = useWorkflowStore((state) => state.updateStickyNote);
  const deleteStickyNote = useWorkflowStore((state) => state.deleteStickyNote);
  const pushHistory = useWorkflowStore((state) => state.pushHistory);
  const style = NOTE_STYLES[data.note.color];

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={140}
        color={style.swatch}
        lineClassName="!border-dashed"
        handleClassName="!h-3 !w-3 !rounded-full !border-2 !border-background"
        onResizeEnd={(_, params) => {
          updateStickyNote(id, {
            width: Math.round(params.width),
            height: Math.round(params.height),
          });
        }}
      />
      <div
        className={cn(
          'h-full w-full overflow-hidden rounded-2xl border shadow-lg backdrop-blur-sm transition-all duration-200',
          selected && 'ring-2 ring-offset-2 ring-offset-background'
        )}
        style={{
          background: style.background,
          borderColor: style.border,
          color: style.text,
          boxShadow: selected
            ? `0 16px 40px -24px ${style.swatch}`
            : '0 14px 32px -24px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div className="sticky-note-drag-handle flex cursor-grab items-center gap-2 border-b border-black/10 px-3 py-2 active:cursor-grabbing">
          <button
            type="button"
            className="nodrag inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-current transition-colors hover:bg-black/10"
            onClick={(event) => {
              event.stopPropagation();
              pushHistory();
              deleteStickyNote(id);
              pushHistory();
            }}
            aria-label="Delete sticky note"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-black/5 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-current/80">
            <GripHorizontal className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">Note</span>
          </div>

          <div className="nodrag flex flex-shrink-0 items-center gap-1">
            {(Object.keys(NOTE_STYLES) as StickyNoteColor[]).map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  'h-4 w-4 rounded-full border border-white/70 shadow-sm transition-transform hover:scale-110',
                  data.note.color === color && 'scale-110 ring-2 ring-white/80'
                )}
                style={{ backgroundColor: NOTE_STYLES[color].swatch }}
                onClick={(event) => {
                  event.stopPropagation();
                  updateStickyNote(id, { color });
                }}
                aria-label={`Set sticky note color to ${color}`}
              />
            ))}
          </div>
        </div>

        <textarea
          value={data.note.content}
          onChange={(event) => updateStickyNote(id, { content: event.target.value })}
          onClick={(event) => event.stopPropagation()}
          placeholder="Add a note for your workflow..."
          className="nodrag h-[calc(100%-49px)] w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-current/90 outline-none placeholder:text-current/45"
        />
      </div>
    </>
  );
});

StickyNoteNode.displayName = 'StickyNoteNode';
