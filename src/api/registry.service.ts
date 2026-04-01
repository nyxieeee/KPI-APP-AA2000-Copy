import type { SystemStats } from '../types';

export interface RegistryUser {
  name: string;
  password: string;
  department: string;
  role: string;
  isActive?: boolean;
}

let registry: RegistryUser[] = [];
let adminUsers: Record<string, string[]> = {};

/** Initialize in-memory store (mock). Omit when using real backend. */
export function initRegistry(r: RegistryUser[], admin: Record<string, string[]>): void {
  registry = r;
  adminUsers = admin;
}

export async function getRegistry(): Promise<RegistryUser[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/registry`)).json(); }
  return [...registry];
}

export async function updateRegistry(r: RegistryUser[]): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/registry`, { method: 'PUT', body: JSON.stringify(r) }); return; }
  registry = r;
}

export async function getAdminUsers(): Promise<Record<string, string[]>> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/admin-users`)).json(); }
  return { ...adminUsers };
}

export async function updateAdminUsers(u: Record<string, string[]>): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/admin-users`, { method: 'PUT', body: JSON.stringify(u) }); return; }
  adminUsers = u;
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
