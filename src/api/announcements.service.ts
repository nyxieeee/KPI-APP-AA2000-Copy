import type { Announcement } from '../types';

const MAX = 50;
let list: Announcement[] = [];

export async function listAnnouncements(): Promise<Announcement[]> {
  // if (getApiBaseUrl()) { return (await fetch(`${getApiBaseUrl()}/api/announcements`)).json(); }
  return [...list];
}

export async function createAnnouncement(announcement: Omit<Announcement, 'id'>): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(...); return; }
  const withId: Announcement = {
    ...announcement,
    id: Math.random().toString(36).substr(2, 9).toUpperCase(),
  };
  list = [withId, ...list].slice(0, MAX);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  // if (getApiBaseUrl()) { await fetch(`${getApiBaseUrl()}/api/announcements/${id}`, { method: 'DELETE' }); return; }
  list = list.filter((a) => a.id !== id);
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
