import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  onSave?: () => void;
  onRun?: () => void;
  onDelete?: () => void;
  onEscape?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleHelp?: () => void;
  onSearch?: () => void;
  disabled?: boolean;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

export function useKeyboardShortcuts({
  onSave,
  onRun,
  onDelete,
  onEscape,
  onUndo,
  onRedo,
  onToggleHelp,
  onSearch,
  disabled = false,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;
      const isTyping = isEditableTarget(event.target);

      if (!hasModifier && !isTyping && event.key === '?') {
        event.preventDefault();
        onToggleHelp?.();
        return;
      }

      if (isTyping) {
        return;
      }

      if (hasModifier && key === 'f' && onSearch) {
        event.preventDefault();
        onSearch();
        return;
      }

      if (hasModifier && key === 's') {
        event.preventDefault();
        onSave?.();
        return;
      }

      if (hasModifier && key === 'enter') {
        event.preventDefault();
        onRun?.();
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        onDelete?.();
        return;
      }

      if (key === 'escape') {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (hasModifier && event.shiftKey && key === 'z') {
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (hasModifier && key === 'y') {
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (hasModifier && key === 'z') {
        event.preventDefault();
        onUndo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onDelete, onEscape, onRedo, onRun, onSave, onSearch, onToggleHelp, onUndo]);
}
