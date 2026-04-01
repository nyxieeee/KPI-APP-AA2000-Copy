/**
 * API base URL for backend. Set VITE_API_URL in .env for production.
 * Empty string = use in-memory mock services.
 */
export const getApiBaseUrl = (): string => {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
};

export const isBackendEnabled = (): boolean => Boolean(getApiBaseUrl());
