import type { SystemNotification } from '../types';

const MAX = 100;
let list: SystemNotification[] = [];

export async function listNotifications(): Promise<SystemNotification[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/notifications`)).json(); }
  return [...list];
}

export async function addNotification(notification: Omit<SystemNotification, 'id'>): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(...); return; }
  const withId: SystemNotification = {
    ...notification,
    id: Math.random().toString(36).substr(2, 9).toUpperCase(),
  };
  list = [withId, ...list].slice(0, MAX);
}

export async function deleteNotification(id: string): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/notifications/${id}`, { method: 'DELETE' }); return; }
  list = list.filter((n) => n.id !== id);
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
