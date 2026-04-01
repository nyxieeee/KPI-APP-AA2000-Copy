/**
 * Panel-rule chevron hold (see `.cursor/rules/panel-rule.mdc`):
 * - Immediate step on press
 * - First repeat after 1000ms (not 1000ms + first interval)
 * - Accelerating repeats (recursive timeout, min 48ms)
 * - stopAuditPanelHold clears the chain; subscribe global end events so release off-button still stops.
 */
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';

const INITIAL_REPEAT_MS = 1000;
const MIN_REPEAT_MS = 48;
const ACCEL_FACTOR = 0.88;

export function startAuditPanelHold(holdTimeoutRef: MutableRefObject<number | null>, fn: () => void): void {
  fn();
  if (holdTimeoutRef.current !== null) window.clearTimeout(holdTimeoutRef.current);
  let delay = INITIAL_REPEAT_MS;
  const run = () => {
    holdTimeoutRef.current = window.setTimeout(() => {
      fn();
      delay = Math.max(MIN_REPEAT_MS, delay * ACCEL_FACTOR);
      run();
    }, delay);
  };
  run();
}

export function stopAuditPanelHold(holdTimeoutRef: MutableRefObject<number | null>): void {
  if (holdTimeoutRef.current !== null) {
    window.clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
  }
}

/** mouseup / touch end off the button, touchcancel, window blur — all call `stopHold`. */
export function subscribeAuditPanelHoldGlobalStop(stopHold: () => void): () => void {
  window.addEventListener('mouseup', stopHold);
  window.addEventListener('touchend', stopHold);
  window.addEventListener('touchcancel', stopHold);
  window.addEventListener('blur', stopHold);
  return () => {
    window.removeEventListener('mouseup', stopHold);
    window.removeEventListener('touchend', stopHold);
    window.removeEventListener('touchcancel', stopHold);
    window.removeEventListener('blur', stopHold);
  };
}

/**
 * Use for any dashboard that renders `TechnicalCategoryAuditPanel` (or same chevron contract).
 * Keeps timing identical across departments.
 */
export function useAuditPanelCategoryHold(): {
  startHoldPanel: (fn: () => void) => void;
  stopHold: () => void;
} {
  const holdTimeoutRef = useRef<number | null>(null);
  const stopHold = useCallback(() => {
    stopAuditPanelHold(holdTimeoutRef);
  }, []);
  const startHoldPanel = useCallback((fn: () => void) => {
    startAuditPanelHold(holdTimeoutRef, fn);
  }, []);

  useEffect(() => subscribeAuditPanelHoldGlobalStop(stopHold), [stopHold]);

  return { startHoldPanel, stopHold };
}
