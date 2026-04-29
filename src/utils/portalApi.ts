import type { PortalSessionResponse } from './portalSession';

/**
 * Thin client for the AA2000 portal backend, used to resolve a session token
 * (passed in by the portal launch URL) into a full account/employee record.
 *
 * Configure with these env vars (mirrors the portal app's own setup):
 *   - VITE_API_BASE_URL          single base URL (no trailing slash)
 *   - VITE_API_BASE_URLS         optional comma-separated list for failover
 *   - VITE_API_PREFIX            optional path prefix (e.g. "/api")
 *   - VITE_SESSION_LOOKUP_PATH   override session lookup path (e.g. "/security/session")
 *   - VITE_SESSION_LOOKUP_PATHS  comma-separated list of override paths
 */

const DEFAULT_SESSION_PATH_PREFIXES = [
  '/session',
  '/security/session',
  '/security/login/session',
  '/api/session',
  '/api/security/session',
];

const DEFAULT_SESSION_LOOKUP_TIMEOUT_MS = 7000;

function getApiBaseUrls(): string[] {
  const multi = import.meta.env.VITE_API_BASE_URLS;
  if (typeof multi === 'string' && multi.trim()) {
    return multi
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  }
  const single = import.meta.env.VITE_API_BASE_URL;
  if (typeof single === 'string' && single.trim()) {
    return [single.trim().replace(/\/+$/, '')];
  }
  return [];
}

function getApiPrefix(): string {
  const raw = import.meta.env.VITE_API_PREFIX;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizePrefix(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  return withSlash.replace(/\/+$/, '');
}

function getSessionLookupPrefixes(): string[] {
  const raw = String(
    import.meta.env.VITE_SESSION_LOOKUP_PATHS ?? import.meta.env.VITE_SESSION_LOOKUP_PATH ?? ''
  );
  const fromEnv = raw.split(',').map(normalizePrefix).filter(Boolean);
  return Array.from(new Set([...fromEnv, ...DEFAULT_SESSION_PATH_PREFIXES.map(normalizePrefix)]));
}

function getSessionLookupTimeoutMs(): number {
  const raw = Number((import.meta as any).env?.VITE_SESSION_LOOKUP_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_SESSION_LOOKUP_TIMEOUT_MS;
}

export function hasPortalApiConfigured(): boolean {
  return getApiBaseUrls().length > 0;
}

let preferredSessionPrefix: string | null = null;

/**
 * Resolves a portal session token (either `Session.s_name` or whatever the
 * portal passed via `?s_name=` / decrypted `?__launch=`) into the portal's
 * `{ session, account, employee }` payload. Tries each configured base URL
 * and each candidate session-lookup path until one succeeds.
 */
export async function fetchPortalSessionByToken(sessionToken: string): Promise<PortalSessionResponse | null> {
  const token = String(sessionToken ?? '').trim();
  if (!token) return null;

  const bases = getApiBaseUrls();
  if (bases.length === 0) {
    console.error(
      '[portalApi] VITE_API_BASE_URL is not set — cannot look up portal session. Set it in .env (and restart vite) or in the deploy environment.'
    );
    return null;
  }

  const prefix = getApiPrefix();
  const allPrefixes = getSessionLookupPrefixes();
  const orderedPrefixes = preferredSessionPrefix
    ? [preferredSessionPrefix, ...allPrefixes.filter((p) => p !== preferredSessionPrefix)]
    : allPrefixes;

  const encodedToken = encodeURIComponent(token);
  const timeoutMs = getSessionLookupTimeoutMs();
  const timeoutMsWithBuffer = Math.max(3000, timeoutMs);

  for (const base of bases) {
    for (const sessionPrefix of orderedPrefixes) {
      const url = `${base}${prefix}${sessionPrefix}/${encodedToken}`;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMsWithBuffer);
      try {
        const res = await fetch(url, {
          method: 'GET',
          // Keep this a simple CORS GET (no custom headers) so deployed
          // cross-origin session lookups avoid unnecessary preflight failures.
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const raw = await res.text();
        if (!raw) continue;
        let data: PortalSessionResponse | null = null;
        try {
          data = JSON.parse(raw) as PortalSessionResponse;
        } catch {
          data = null;
        }
        if (!data) continue;
        if (data && typeof data === 'object' && data.account) {
          preferredSessionPrefix = sessionPrefix;
          return data;
        }
      } catch {
        // try next combination
      } finally {
        window.clearTimeout(timeoutId);
      }
    }
  }

  console.error(`[portalApi] Could not resolve session token via any of ${orderedPrefixes.length} candidate paths across ${bases.length} base URL(s).`);
  return null;
}
