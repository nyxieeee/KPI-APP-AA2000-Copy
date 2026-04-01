import { UserRole, type User } from '../types';

const ROLE_FINANCIALS: Record<UserRole, { base: number; target: number }> = {
  [UserRole.EMPLOYEE]: { base: 62000, target: 12000 },
  [UserRole.SUPERVISOR]: { base: 88000, target: 18000 },
  [UserRole.ADMIN]: { base: 105000, target: 25000 },
};

export interface LoginCredentials {
  name: string;
  password: string;
  role: UserRole;
}

/** Matches registry entries (role as string for flexibility). */
export interface RegistryUser {
  name: string;
  password: string;
  department: string;
  role: UserRole | string;
  isActive?: boolean;
}

let currentUser: User | null = null;

function toUserId(name: string): string {
  return btoa(name).substring(0, 12);
}

function buildUser(registryUser: RegistryUser): User {
  const role = registryUser.role as UserRole;
  const financial = ROLE_FINANCIALS[role];
  const name = registryUser.name;
  return {
    id: toUserId(name),
    name,
    email: `${name.replace(/\s/g, '')}@aa2000.com`,
    role,
    baseSalary: financial?.base ?? 0,
    incentiveTarget: financial?.target ?? 0,
    department: registryUser.department,
  };
}

/** Get current session (mock: in-memory). Replace with token/session fetch when backend is used. */
export async function getSession(): Promise<User | null> {
  if (getApiBaseUrl()) {
    // TODO: fetch('/api/auth/session') and return user or null
    return currentUser;
  }
  return currentUser;
}

/** Login. Validates against registry; in backend mode would POST to /api/auth/login. */
export async function login(credentials: LoginCredentials, registry: RegistryUser[]): Promise<User> {
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    // TODO: const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', body: JSON.stringify(credentials) });
    // const user = await res.json(); currentUser = user; return user;
  }
  const matched = registry.filter((u) => u.name.toLowerCase() === credentials.name.trim().toLowerCase());
  const found = matched.find((u) => u.role === credentials.role);
  if (!found) throw new Error('ACCESS_DENIED_ROLE');
  if (found.isActive === false) throw new Error('ACCESS_DENIED_INACTIVE');
  if (found.password !== credentials.password) throw new Error('ACCESS_DENIED_PASSKEY');
  const user = buildUser(found);
  currentUser = user;
  return user;
}

/** Clear session. In backend mode would POST to /api/auth/logout. */
export async function logout(): Promise<void> {
  if (getApiBaseUrl()) {
    // TODO: await fetch(`${getApiBaseUrl()}/api/auth/logout`, { method: 'POST' });
  }
  currentUser = null;
}

function getApiBaseUrl(): string {
  return (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';
}
