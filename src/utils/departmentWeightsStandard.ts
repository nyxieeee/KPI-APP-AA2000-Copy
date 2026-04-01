import type { DepartmentWeights } from '../types';

export const DEPARTMENT_WEIGHTS_STANDARD_STORAGE_KEY = 'aa2000_kpi_department_weights_standard';

export const DEPARTMENT_WEIGHTS_STANDARD_UPDATED_EVENT = 'aa2000-kpi-department-weights-standard-updated';

/** True when a saved standard snapshot exists in localStorage (survives full page reload). */
export function hasDepartmentWeightsStandardSnapshot(): boolean {
  return loadDepartmentWeightsStandard() !== null;
}

/** Persists the grading standard for Load standard after reload. Returns false if storage failed. */
export function saveDepartmentWeightsStandard(weights: DepartmentWeights): boolean {
  try {
    localStorage.setItem(DEPARTMENT_WEIGHTS_STANDARD_STORAGE_KEY, JSON.stringify(weights));
    try {
      window.dispatchEvent(new Event(DEPARTMENT_WEIGHTS_STANDARD_UPDATED_EVENT));
    } catch {
      // ignore
    }
    return true;
  } catch {
    return false;
  }
}

export function loadDepartmentWeightsStandard(): DepartmentWeights | null {
  try {
    const raw = localStorage.getItem(DEPARTMENT_WEIGHTS_STANDARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DepartmentWeights;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
