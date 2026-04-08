import type { SystemNotification, Transmission } from '../types';
import { UserRole } from '../types';

type RegistryEntry = {
  name: string;
  department: string;
  role: UserRole;
  isActive?: boolean;
};

function genId(len = 9): string {
  return Math.random().toString(36).substr(2, len).toUpperCase();
}

/** Push-style notifications for active supervisors in `dept` when an employee transmits an audit. */
export function notifyDepartmentSupervisorsOnSubmission(
  transmission: Transmission,
  dept: string,
  registry: RegistryEntry[],
  submitterUserId: string
): SystemNotification[] {
  const supervisors = registry.filter(
    (u) =>
      u.department === dept &&
      u.role === UserRole.SUPERVISOR &&
      u.isActive !== false
  );
  const now = new Date().toISOString();
  const out: SystemNotification[] = [];
  for (const sup of supervisors) {
    const targetUserId = btoa(sup.name);
    if (targetUserId === submitterUserId) continue;
    out.push({
      id: genId(9),
      targetUserId,
      message: `New submission ${transmission.id} from ${transmission.userName} is pending your review.`,
      timestamp: now,
      type: 'INFO',
      linkedTransmissionId: transmission.id,
      linkedDepartment: dept,
    });
  }
  return out;
}
