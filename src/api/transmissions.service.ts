import type { Transmission, SystemStats } from '../types';

const MAX_HISTORY = 500;
let pending: Transmission[] = [];
let history: Transmission[] = [];

/** Initialize in-memory store (mock). Omit when using real backend. */
export function initTransmissions(initialPending: Transmission[], initialHistory: Transmission[]): void {
  pending = initialPending;
  history = initialHistory;
}

export async function getPending(): Promise<Transmission[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/transmissions/pending`)).json(); }
  return [...pending];
}

export async function getHistory(): Promise<Transmission[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/transmissions/history`)).json(); }
  return [...history];
}

/** Derived from validated items in history. */
export async function getValidatedStats(): Promise<Record<string, SystemStats>> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/transmissions/validated-stats`)).json(); }
  const stats: Record<string, SystemStats> = {};
  for (const t of history) {
    if (t.status === 'validated' && t.userId) {
      stats[t.userId] = {
        responseTime: t.responseTime,
        accuracy: t.accuracy,
        uptime: t.uptime,
        supervisorComment: t.supervisorComment,
        ratings: t.ratings,
      };
    }
  }
  return stats;
}

export async function submitTransmission(t: Transmission): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/transmissions`, { method: 'POST', body: JSON.stringify(t) }); return; }
  pending = [...pending, t];
}

export async function validateTransmission(
  transmissionId: string,
  overrides?: SystemStats,
  status: 'validated' | 'rejected' = 'validated'
): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(...); return; }
  const idx = pending.findIndex((x) => x.id === transmissionId);
  if (idx === -1) return;
  const transmission = pending[idx];
  const statsToUse = overrides ?? {
    responseTime: transmission.responseTime,
    accuracy: transmission.accuracy,
    uptime: transmission.uptime,
  };
  const finalT: Transmission = { ...transmission, ...statsToUse, status };
  history = [finalT, ...history].slice(0, MAX_HISTORY);
  pending = pending.filter((x) => x.id !== transmissionId);
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
