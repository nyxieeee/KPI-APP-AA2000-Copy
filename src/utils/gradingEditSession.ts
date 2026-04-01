import type { CategoryWeightItem } from '../types';

export const GRADING_EDIT_SESSION_KEY = 'aa2000_kpi_grading_edit_session';

export function saveGradingEditSession(dept: string, draft: CategoryWeightItem[]): void {
  try {
    localStorage.setItem(
      GRADING_EDIT_SESSION_KEY,
      JSON.stringify({ dept, draft, updatedAt: Date.now() })
    );
  } catch {
    // ignore
  }
}

export function clearGradingEditSession(): void {
  try {
    localStorage.removeItem(GRADING_EDIT_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadGradingEditSession(): { dept: string; draft: CategoryWeightItem[] } | null {
  try {
    const raw = localStorage.getItem(GRADING_EDIT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dept?: string; draft?: CategoryWeightItem[] };
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.dept !== 'string' || !Array.isArray(parsed.draft)) return null;
    return { dept: parsed.dept, draft: parsed.draft };
  } catch {
    return null;
  }
}
