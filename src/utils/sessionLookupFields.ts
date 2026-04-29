/**
 * Normalized reads for `GET /session/:token` (and variants) — shared by Portal profile
 * and KPI handoff so name / email / role resolve the same way for any backend shape.
 *
 * Keep in sync with: aa2000portal/src/utils/sessionLookupFields.ts
 */

export type SessionLookupAccount = Record<string, unknown> & {
  acc_ID?: number
}

export function accountUsername(account: Record<string, unknown> | null | undefined): string {
  if (!account) return ''
  return String(account.username ?? account.acc_username ?? '').trim()
}

/** Full name when the API stores it on the Account row instead of Employee. */
export function accountDisplayName(account: Record<string, unknown> | null | undefined): string {
  if (!account) return ''
  const full = String(
    account.displayName ??
      account.display_name ??
      account.fullName ??
      account.full_name ??
      account.name ??
      ''
  ).trim()
  if (full) return full
  const fn = String(
    account.acc_fname ?? account.Acc_fname ?? account.firstName ?? account.first_name ?? ''
  ).trim()
  const mn = String(account.acc_mname ?? account.Acc_mname ?? account.middleName ?? account.middle_name ?? '').trim()
  const ln = String(
    account.acc_lname ?? account.Acc_lname ?? account.lastName ?? account.last_name ?? ''
  ).trim()
  return [fn, mn, ln].filter(Boolean).join(' ').trim()
}

export function accountEmail(account: Record<string, unknown> | null | undefined): string {
  if (!account) return ''
  return String(account.acc_email ?? account.email ?? account.Email ?? '').trim()
}

export function accountRoleLabel(account: Record<string, unknown> | null | undefined): string {
  if (!account) return ''
  const nested = account.role
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const r = nested as Record<string, unknown>
    const n = String(r.role_name ?? r.r_name ?? r.name ?? '').trim()
    if (n) return n
  }
  return String(account.role_name ?? account.r_name ?? '').trim()
}

export function employeeFullNameFromRow(e: Record<string, unknown> | null | undefined): string {
  if (!e) return ''
  const full = String(e.fullName ?? e.full_name ?? e.name ?? '').trim()
  if (full) return full
  const fn = String(e.Emp_fname ?? e.emp_fname ?? e.Emp_firstName ?? e.firstName ?? e.first_name ?? '').trim()
  const mn = String(e.Emp_mname ?? e.emp_mname ?? e.middleName ?? e.middle_name ?? '').trim()
  const ln = String(e.Emp_lname ?? e.emp_lname ?? e.Emp_lastName ?? e.lastName ?? e.last_name ?? '').trim()
  return [fn, mn, ln].filter(Boolean).join(' ').trim()
}

export function employeeEmailFromRow(e: Record<string, unknown> | null | undefined): string {
  if (!e) return ''
  return String(e.Emp_email ?? e.emp_email ?? e.email ?? e.acc_email ?? '').trim()
}

export function employeePhoneFromRow(e: Record<string, unknown> | null | undefined): string {
  if (!e) return ''
  return String(e.Emp_cnum ?? e.emp_cnum ?? e.contact ?? e.phone ?? e.mobile ?? '').trim()
}

/** Job title / role label from joined Employee (for display and KPI tier inference). */
export function employeeRoleLabelFromRow(e: Record<string, unknown> | null | undefined): string {
  if (!e) return ''
  const direct = String(e.role ?? e.Role ?? e.emp_role_label ?? '').trim()
  if (direct && !/^\d+$/.test(direct)) return direct
  const er = e.Emp_role ?? e.emp_role
  if (typeof er === 'string') {
    const t = er.trim()
    if (t && !/^\d+$/.test(t)) return t
  }
  const nested = e.role
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const r = nested as Record<string, unknown>
    const n = String(r.role_name ?? r.r_name ?? r.name ?? '').trim()
    if (n) return n
  }
  return ''
}

export function employeeDepartmentFromRow(e: Record<string, unknown> | null | undefined): string {
  if (!e) return ''
  return String(
    e.Emp_dept ?? e.emp_dept ?? e.department ?? e.Department ?? e.dep_name ?? e.dept_name ?? ''
  ).trim()
}
