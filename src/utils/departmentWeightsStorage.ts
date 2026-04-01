import type { DepartmentWeights } from '../types';

export const DEPARTMENT_WEIGHTS_STORAGE_KEY = 'aa2000_kpi_department_weights';

export function saveDepartmentWeightsToStorage(weights: DepartmentWeights): void {
  try {
    localStorage.setItem(DEPARTMENT_WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
  } catch {
    // ignore quota / private mode
  }
}

export function loadDepartmentWeightsFromStorage(): DepartmentWeights | null {
  try {
    const raw = localStorage.getItem(DEPARTMENT_WEIGHTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DepartmentWeights;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}
