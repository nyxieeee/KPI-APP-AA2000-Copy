import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { History } from 'lucide-react';

const STORAGE_KEY = 'ledger-fab-position';
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_LEFT = 32;
const DEFAULT_BOTTOM = 32;

interface DraggableLedgerFabProps {
  onOpen: () => void;
  hidden?: boolean;
  /** Optional key to scope position per dashboard (e.g. "accounting", "sales") */
  storageKey?: string;
  /** Merged onto the FAB root (e.g. `lg:hidden` when ledger lives in desktop sidenav) */
  className?: string;
}

export const DraggableLedgerFab: React.FC<DraggableLedgerFabProps> = ({
  onOpen,
  hidden = false,
  storageKey = 'default',
  className,
}) => {
  const key = `${STORAGE_KEY}-${storageKey}`;

  const loadPositionOnce = useCallback((): { left: number; bottom: number } => {
    if (typeof window === 'undefined') return { left: DEFAULT_LEFT, bottom: DEFAULT_BOTTOM };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { left?: number; bottom?: number };
        if (typeof parsed.left === 'number' && typeof parsed.bottom === 'number') {
          return { left: parsed.left, bottom: parsed.bottom };
        }
      }
    } catch {
      // ignore
    }
    return { left: DEFAULT_LEFT, bottom: DEFAULT_BOTTOM };
  }, [key]);

  const [position, setPosition] = useState(() => ({ left: DEFAULT_LEFT, bottom: DEFAULT_BOTTOM }));
  const positionInitialized = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; left: number; bottom: number } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    if (positionInitialized.current) return;
    positionInitialized.current = true;
    setPosition(loadPositionOnce());
  }, [loadPositionOnce]);

  const savePosition = useCallback(
    (left: number, bottom: number) => {
      try {
        localStorage.setItem(key, JSON.stringify({ left, bottom }));
      } catch {
        // ignore
      }
    },
    [key]
  );

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (hidden) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
      didDragRef.current = false;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: position.left,
        bottom: position.bottom,
      };
    },
    [hidden, position.left, position.bottom]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = dragStartRef.current.y - e.clientY; // bottom: up = increase
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
      const w = typeof window !== 'undefined' ? window.innerWidth : 800;
      const h = typeof window !== 'undefined' ? window.innerHeight : 600;
      const btnW = 72;
      const btnH = 72;
      const left = clamp(dragStartRef.current.left + dx, 0, w - btnW);
      const bottom = clamp(dragStartRef.current.bottom + dy, 0, h - btnH);
      setPosition({ left, bottom });
    },
    [isDragging]
  );

  const endDrag = useCallback(
    (openIfClick: boolean) => {
      if (dragStartRef.current) {
        savePosition(position.left, position.bottom);
        if (openIfClick && !didDragRef.current) {
          onOpen();
        }
        dragStartRef.current = null;
      }
      setIsDragging(false);
    },
    [position.left, position.bottom, savePosition, onOpen]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      endDrag(true);
    },
    [endDrag]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onWindowPointerUp = () => endDrag(false);
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => window.removeEventListener('pointerup', onWindowPointerUp);
  }, [isDragging, endDrag]);

  if (hidden) return null;

  const fab = (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => {
        if (e.buttons !== 0) return;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        endDrag(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group fixed z-[5000] flex items-center gap-3 h-[4.5rem] w-[4.5rem] hover:w-72 overflow-hidden rounded-full bg-slate-900 text-white shadow-2xl border-[5px] border-slate-700 transition-[width,box-shadow] duration-300 ease-out hover:scale-105 p-2 select-none touch-none cursor-grab active:cursor-grabbing${className ? ` ${className}` : ''}`}
      style={{
        left: typeof position.left === 'number' ? position.left : DEFAULT_LEFT,
        bottom: typeof position.bottom === 'number' ? position.bottom : DEFAULT_BOTTOM,
      }}
    >
      <div className="w-11 h-11 shrink-0 rounded-full bg-blue-600 flex items-center justify-center pointer-events-none">
        <History className="w-5 h-5 text-white" />
      </div>
      <div className="overflow-hidden max-w-0 group-hover:max-w-[180px] transition-all duration-300 ease-out text-left">
        <div className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300 delay-100 py-0.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white leading-tight whitespace-nowrap">
            SUBMISSION HISTORY
          </p>
          <p className="text-[10px] font-normal text-slate-300 leading-tight whitespace-nowrap">View Log History</p>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(fab, document.body);
  }
  return fab;
};
