import { User, UserRole } from '../types';

/**
 * Session handoff from the parent portal.
 *
 * The KPI app no longer logs in. The portal opens the KPI app with launch
 * params in the URL — this module reads them, decrypts them with the shared
 * AES-GCM key, and returns the (sessionToken, accountId) pair. The caller
 * then resolves the full user via the portal API (see portalApi.ts).
 *
 * URL contract (matches portal `src/utils/appendSessionToUrl.ts`):
 *   - Encrypted: `?__launch=<b64url(iv||ciphertext+tag)>&__actor=<same>`
 *   - Plain (fallback): `?s_name=<sessionToken>&acc_ID=<accountId>`
 *
 * Encryption: AES-GCM-256, IV = 12 random bytes prepended to ciphertext, key
 * material = `VITE_LAUNCH_AES_KEY` (32-byte hex64 or base64). In dev, if the
 * env var is unset, the key is derived as SHA-256 of LAUNCH_DEV_KEY_DERIVATION_STRING
 * — same fallback the portal uses.
 *
 * After hydration, all launch params are stripped from the URL.
 */

const PLAIN_SESSION_KEY = 's_name';
const PLAIN_ACCOUNT_KEY = 'acc_ID';
const ENC_SESSION_KEY = '__launch';
const ENC_ACCOUNT_KEY = '__actor';

const LAUNCH_PARAM_KEYS = [PLAIN_SESSION_KEY, PLAIN_ACCOUNT_KEY, ENC_SESSION_KEY, ENC_ACCOUNT_KEY];

const AES_IV_LEN = 12;
const AES_KEY_LEN = 32;

/** Must match the portal's `LAUNCH_DEV_KEY_DERIVATION_STRING` exactly. */
export const LAUNCH_DEV_KEY_DERIVATION_STRING = 'aa2000-portal-launch-dev-v1';

export type PortalLaunch = {
  sessionToken: string | null;
  accountId: string | null;
  /** True when the URL had encrypted (`__launch`/`__actor`) params, regardless of decrypt success. */
  encrypted: boolean;
};

let cachedKey: CryptoKey | null | undefined;

function parseAesKeyMaterial(): Uint8Array | null {
  const raw = import.meta.env.VITE_LAUNCH_AES_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(AES_KEY_LEN);
    for (let i = 0; i < AES_KEY_LEN; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    if (bin.length !== AES_KEY_LEN) return null;
    const out = new Uint8Array(AES_KEY_LEN);
    for (let i = 0; i < AES_KEY_LEN; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function resolveRawKeyMaterial(): Promise<Uint8Array | null> {
  const fromEnv = parseAesKeyMaterial();
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) {
    const enc = new TextEncoder().encode(LAUNCH_DEV_KEY_DERIVATION_STRING);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return new Uint8Array(digest);
  }
  return null;
}

async function getLaunchCryptoKey(): Promise<CryptoKey | null> {
  if (cachedKey !== undefined) return cachedKey;
  const material = await resolveRawKeyMaterial();
  if (!material) {
    cachedKey = null;
    return null;
  }
  try {
    // Normalize to an ArrayBuffer-backed view for stricter TS DOM lib signatures.
    const normalizedMaterial = new Uint8Array(material.byteLength);
    normalizedMaterial.set(material);
    cachedKey = await crypto.subtle.importKey(
      'raw',
      normalizedMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return cachedKey;
  } catch {
    cachedKey = null;
    return null;
  }
}

function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function decryptUtf8(token: string, key: CryptoKey): Promise<string | null> {
  const raw = b64urlToBytes(token);
  if (!raw || raw.length < AES_IV_LEN + 16) return null;
  const iv = raw.slice(0, AES_IV_LEN);
  const data = raw.slice(AES_IV_LEN);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Symmetric helper — exposed so dev tooling can produce matching launch params. */
export async function encryptLaunchValue(value: string): Promise<string | null> {
  const key = await getLaunchCryptoKey();
  if (!key) return null;
  const iv = new Uint8Array(AES_IV_LEN);
  crypto.getRandomValues(iv);
  const enc = new TextEncoder().encode(value);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return bytesToB64url(combined);
}

export async function readPortalLaunchFromUrl(url: string = window.location.href): Promise<PortalLaunch> {
  try {
    const u = new URL(url);
    const search = u.searchParams;
    const hash = parseHashParams(u.hash);
    const get = (key: string) => search.get(key) ?? hash.get(key);

    const encSession = get(ENC_SESSION_KEY);
    const encAccount = get(ENC_ACCOUNT_KEY);
    const plainSession = get(PLAIN_SESSION_KEY);
    const plainAccount = get(PLAIN_ACCOUNT_KEY);

    const encrypted = Boolean(encSession || encAccount);

    let sessionToken: string | null = null;
    let accountId: string | null = null;

    if (encSession || encAccount) {
      const key = await getLaunchCryptoKey();
      if (!key) {
        console.error('[portalSession] Encrypted launch params received but VITE_LAUNCH_AES_KEY is not set (and not in dev). Cannot decrypt.');
      } else {
        const [decodedSession, decodedAccount] = await Promise.all([
          encSession ? decryptUtf8(encSession, key) : Promise.resolve<string | null>(null),
          encAccount ? decryptUtf8(encAccount, key) : Promise.resolve<string | null>(null),
        ]);
        sessionToken = decodedSession;
        accountId = decodedAccount;
        if (encSession && !sessionToken) {
          console.error('[portalSession] AES-GCM decryption of __launch failed (wrong key or tampered token).');
        }
        if (encAccount && !accountId) {
          console.error('[portalSession] AES-GCM decryption of __actor failed (wrong key or tampered token).');
        }
      }
    }

    if (!sessionToken && plainSession) sessionToken = plainSession;
    if (!accountId && plainAccount) accountId = plainAccount;

    return {
      sessionToken: sessionToken ? sessionToken.trim() : null,
      accountId: accountId ? String(accountId).trim() : null,
      encrypted,
    };
  } catch (err) {
    console.error('[portalSession] Failed to read portal launch params:', err);
    return { sessionToken: null, accountId: null, encrypted: false };
  }
}

/** Removes launch params from the URL after hydration. */
export function clearPortalLaunchFromUrl(): void {
  try {
    const u = new URL(window.location.href);
    let touched = false;

    LAUNCH_PARAM_KEYS.forEach((k) => {
      if (u.searchParams.has(k)) {
        u.searchParams.delete(k);
        touched = true;
      }
    });

    let hash = u.hash;
    if (hash.startsWith('#')) {
      const hashParams = parseHashParams(hash);
      let hashTouched = false;
      LAUNCH_PARAM_KEYS.forEach((k) => {
        if (hashParams.has(k)) {
          hashParams.delete(k);
          hashTouched = true;
        }
      });
      if (hashTouched) {
        const remaining = hashParams.toString();
        hash = remaining ? `#${remaining}` : '';
        touched = true;
      }
    }

    if (touched) {
      const search = u.searchParams.toString();
      window.history.replaceState({}, '', `${u.pathname}${search ? `?${search}` : ''}${hash}`);
    }
  } catch {
    // ignore
  }
}

function parseHashParams(hash: string): URLSearchParams {
  if (!hash || hash === '#') return new URLSearchParams();
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

// ──────────────────────────────────────────────────────────────────────────────
// User mapping — turn a portal `/session/:token` response into the KPI app's User
// ──────────────────────────────────────────────────────────────────────────────

const ROLE_FINANCIALS: Record<UserRole, { base: number; target: number }> = {
  [UserRole.EMPLOYEE]: { base: 62000, target: 12000 },
  [UserRole.SUPERVISOR]: { base: 88000, target: 18000 },
  [UserRole.ADMIN]: { base: 105000, target: 25000 },
};

const KPI_DEPARTMENTS: Record<string, string[]> = {
  Technical: ['technical', 'engineer', 'engineering', 'developer', 'software', 'technician'],
  IT: ['it', 'information technology', 'systems'],
  Sales: ['sales', 'sale'],
  Marketing: ['marketing', 'brand', 'promo'],
  Accounting: ['accounting', 'accountant', 'finance', 'treasury', 'bookkeeping', 'bookkeeper'],
  Admin: ['admin', 'administrator', 'hr', 'human resource', 'director', 'owner', 'executive'],
};

export type PortalSessionResponse = {
  message?: string;
  session?: { s_ID: number; s_name: string; createdAt?: string };
  account?: {
    acc_ID: number;
    username: string;
    role_ID?: number;
    role_name?: string | null;
    status?: string;
  };
  employee?: Record<string, unknown> | null;
};

type RoleMapEntry = {
  appRole: UserRole;
  department?: string;
};

const DEFAULT_ROLE_ID_MAP: Record<number, RoleMapEntry> = {
  // Adjust these defaults to your backend role table if needed.
  1: { appRole: UserRole.ADMIN, department: 'Admin' },
  2: { appRole: UserRole.SUPERVISOR, department: 'Sales' },
  3: { appRole: UserRole.SUPERVISOR, department: 'Marketing' },
  4: { appRole: UserRole.SUPERVISOR, department: 'Accounting' },
  5: { appRole: UserRole.SUPERVISOR, department: 'Technical' },
};

function readRoleIdMapFromEnv(): Record<number, RoleMapEntry> {
  const envObj = (import.meta as any).env || {};
  const raw = String(envObj.VITE_KPI_ROLE_ID_MAP ?? '').trim();
  if (!raw) return DEFAULT_ROLE_ID_MAP;
  try {
    const parsed = JSON.parse(raw) as Record<string, { appRole?: string; department?: string }>;
    const out: Record<number, RoleMapEntry> = { ...DEFAULT_ROLE_ID_MAP };
    Object.entries(parsed).forEach(([id, value]) => {
      const n = Number(id);
      if (!Number.isFinite(n)) return;
      const roleText = String(value?.appRole ?? '').trim().toLowerCase();
      const appRole =
        roleText === 'admin'
          ? UserRole.ADMIN
          : roleText === 'supervisor'
            ? UserRole.SUPERVISOR
            : roleText === 'employee'
              ? UserRole.EMPLOYEE
              : undefined;
      if (!appRole) return;
      out[n] = { appRole, department: value?.department?.trim() || undefined };
    });
    return out;
  } catch {
    console.warn('[portalSession] Invalid VITE_KPI_ROLE_ID_MAP JSON; using defaults.');
    return DEFAULT_ROLE_ID_MAP;
  }
}

const ROLE_ID_MAP = readRoleIdMapFromEnv();

export function mapPortalSessionToUser(data: PortalSessionResponse): User | null {
  const account = data.account;
  if (!account) return null;

  const acc_ID = account.acc_ID;
  if (acc_ID == null) return null;

  const roleName = String(account.role_name ?? '').trim();
  const roleId = Number(account.role_ID);
  const roleFromId = Number.isFinite(roleId) ? ROLE_ID_MAP[roleId]?.appRole : undefined;
  const deptFromId = Number.isFinite(roleId) ? ROLE_ID_MAP[roleId]?.department : undefined;
  const role = roleFromId ?? inferKpiRole(roleName, account.username);
  const department = deptFromId ?? inferKpiDepartment(roleName, data.employee);

  const fullName = employeeFullName(data.employee) || String(account.username ?? '').trim();
  if (!fullName) return null;

  const email = employeeEmail(data.employee) || `${fullName.replace(/\s+/g, '')}@aa2000.com`;
  const financials = ROLE_FINANCIALS[role];

  return {
    id: String(acc_ID),
    name: fullName,
    email,
    role,
    department,
    baseSalary: financials.base,
    incentiveTarget: financials.target,
  };
}

function employeeFullName(e: Record<string, unknown> | null | undefined): string {
  if (!e) return '';
  const full = String(e.fullName ?? e.full_name ?? e.name ?? '').trim();
  if (full) return full;
  const fn = String(e.Emp_fname ?? e.emp_fname ?? e.Emp_firstName ?? e.firstName ?? e.first_name ?? '').trim();
  const mn = String(e.Emp_mname ?? e.emp_mname ?? e.middleName ?? e.middle_name ?? '').trim();
  const ln = String(e.Emp_lname ?? e.emp_lname ?? e.Emp_lastName ?? e.lastName ?? e.last_name ?? '').trim();
  return [fn, mn, ln].filter(Boolean).join(' ');
}

function employeeEmail(e: Record<string, unknown> | null | undefined): string {
  if (!e) return '';
  return String(e.Emp_email ?? e.emp_email ?? e.email ?? e.acc_email ?? '').trim();
}

function employeeDepartment(e: Record<string, unknown> | null | undefined): string {
  if (!e) return '';
  return String(
    e.Emp_dept ?? e.emp_dept ?? e.department ?? e.Department ?? e.dep_name ?? e.dept_name ?? ''
  ).trim();
}

function inferKpiRole(roleName: string, username: string | undefined): UserRole {
  const lower = roleName.toLowerCase();
  if (lower.includes('admin') || lower.includes('hr') || lower.includes('owner') || lower.includes('director')) {
    return UserRole.ADMIN;
  }
  if (lower.includes('supervisor') || lower.includes('manager') || lower.includes('lead')) {
    return UserRole.SUPERVISOR;
  }
  if (lower.includes('employee') || lower.includes('staff')) {
    return UserRole.EMPLOYEE;
  }
  // Try the username (matches INITIAL_REGISTRY entries like "supervisor sales", "admin")
  const u = String(username ?? '').toLowerCase();
  if (u.includes('admin')) return UserRole.ADMIN;
  if (u.includes('supervisor')) return UserRole.SUPERVISOR;
  return UserRole.EMPLOYEE;
}

function inferKpiDepartment(roleName: string, employee: Record<string, unknown> | null | undefined): string | undefined {
  const candidates = [roleName, employeeDepartment(employee)]
    .map((s) => s.toLowerCase())
    .filter(Boolean);

  for (const cand of candidates) {
    for (const [canonical, aliases] of Object.entries(KPI_DEPARTMENTS)) {
      if (aliases.some((alias) => cand.includes(alias))) return canonical;
    }
  }
  return undefined;
}
