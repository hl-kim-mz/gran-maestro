import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResizableSidebarOptions {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

interface UseResizableSidebarReturn {
  sidebarWidth: number;
  isResizing: boolean;
  startResizing: (e: React.MouseEvent) => void;
  sidebarRef: React.RefObject<HTMLDivElement>;
}

export function useResizableSidebar({
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  storageKey,
}: UseResizableSidebarOptions): UseResizableSidebarReturn {
  const getInitialWidth = (): number => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
          return Math.min(Math.max(parsed, minWidth), maxWidth);
        }
      }
    }
    return defaultWidth;
  };

  const [sidebarWidth, setSidebarWidth] = useState<number>(getInitialWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const stopResizing = useCallback(() => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(
        Math.max(startWidthRef.current + delta, minWidth),
        maxWidth
      );
      setSidebarWidth(newWidth);
      if (storageKey) {
        localStorage.setItem(storageKey, String(newWidth));
      }
    },
    [minWidth, maxWidth, storageKey]
  );

  const onMouseUp = useCallback(() => {
    stopResizing();
  }, [stopResizing]);

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Clean up body styles if unmounted while resizing
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onMouseMove, onMouseUp]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarRef.current
      ? sidebarRef.current.getBoundingClientRect().width
      : sidebarWidth;
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  return {
    sidebarWidth,
    isResizing,
    startResizing,
    sidebarRef,
  };
}

/**
 * Inline style helper for the drag handle element.
 *
 * Usage:
 *   <div
 *     onMouseDown={startResizing}
 *     style={resizeHandleStyle(isResizing)}
 *   />
 *
 * The handle should be placed between the sidebar and the main content area.
 */
export function resizeHandleStyle(isResizing: boolean): React.CSSProperties {
  return {
    width: '4px',
    flexShrink: 0,
    cursor: 'col-resize',
    backgroundColor: isResizing ? '#6366f1' : 'transparent',
    transition: 'background-color 0.15s ease',
    position: 'relative',
    // Expand the interactive hit-area while keeping the visual strip narrow
    // via a pseudo-element effect using an outline on hover.
    // The visible line is rendered via the ::after equivalent below.
  };
}
