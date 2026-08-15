import { useEffect } from 'react';
import { ToolType } from '../lib/drawing-utils';

export interface ShortcutHandlers {
  setTool?: (tool: ToolType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  onIncreaseBrushSize?: () => void;
  onDecreaseBrushSize?: () => void;
  onToggleSymmetry?: () => void;
  onToggleGrid?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contenteditable
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Undo/Redo (Ctrl/Cmd + Z / Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onRedo?.();
        } else {
          handlers.onUndo?.();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handlers.onRedo?.();
        return;
      }

      // Brush size adjustments: '[' decrease, ']' increase
      if (e.key === '[') {
        e.preventDefault();
        handlers.onDecreaseBrushSize?.();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handlers.onIncreaseBrushSize?.();
        return;
      }

      // Single-key tool selectors
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
          case 'p':
            handlers.setTool?.('pen');
            break;
          case 'e':
            handlers.setTool?.('eraser');
            break;
          case 'f':
            handlers.setTool?.('fill');
            break;
          case 't':
            handlers.setTool?.('text');
            break;
          case 's':
          case 'v':
            handlers.setTool?.('select');
            break;
          case 'i':
            handlers.setTool?.('eyedropper');
            break;
          case 'l':
            handlers.setTool?.('line');
            break;
          case 'r':
            handlers.setTool?.('rectangle');
            break;
          case 'c':
            handlers.setTool?.('circle');
            break;
          case 'g':
            handlers.onToggleGrid?.();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};

