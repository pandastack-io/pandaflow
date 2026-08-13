'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

export function ReplayControls({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onJumpToStart,
  onJumpToEnd,
}: ReplayControlsProps) {
  React.useEffect(() => {
    if (totalSteps === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrevious, totalSteps]);

  const hasSteps = totalSteps > 0;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
      <div className="text-sm font-medium text-foreground">
        {hasSteps ? `Step ${currentStep + 1} of ${totalSteps}` : 'No steps'}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onJumpToStart} disabled={!hasSteps || currentStep === 0}>
          <SkipBack className="h-4 w-4" />
          Jump to Start
        </Button>
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasSteps || currentStep === 0}>
          <ChevronLeft className="h-4 w-4" />
          Previous step
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasSteps || currentStep >= totalSteps - 1}>
          Next step
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onJumpToEnd} disabled={!hasSteps || currentStep >= totalSteps - 1}>
          Jump to End
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
