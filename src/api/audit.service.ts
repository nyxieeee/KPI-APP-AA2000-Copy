import type { AuditEntry } from '../types';

const MAX_ENTRIES = 500;
let entries: AuditEntry[] = [];

export async function listAudit(): Promise<AuditEntry[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/audit`)).json(); }
  return [...entries];
}

export async function appendAudit(entry: Omit<AuditEntry, 'id'>): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/audit`, { method: 'POST', body: JSON.stringify(entry) }); return; }
  const withId: AuditEntry = {
    ...entry,
    id: Math.random().toString(36).substr(2, 8).toUpperCase(),
  };
  entries = [withId, ...entries].slice(0, MAX_ENTRIES);
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
