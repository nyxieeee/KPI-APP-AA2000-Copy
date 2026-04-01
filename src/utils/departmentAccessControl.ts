/**
 * Department Access Control Utilities
 * Enforces role-based access to department data
 */

import { User, UserRole, Transmission } from '../types';

/**
 * Check if a user can view transmissions from a specific department
 * - Admin: can view all departments
 * - Supervisor: can only view their own department
 * - Employee: can only view their own submissions
 */
export const canViewDepartment = (user: User, targetDepartment: string): boolean => {
  if (user.role === UserRole.ADMIN) {
    return true; // Admins can view everything
  }
  
  if (user.role === UserRole.SUPERVISOR) {
    return user.department === targetDepartment;
  }
  
  // Employees can only view their own department's data
  return user.department === targetDepartment;
};

/**
 * Filter transmissions visible to a user
 * - Admin: sees all
 * - Supervisor: sees reports from employees in their department
 * - Employee: sees only their own submissions
 */
export const filterVisibleTransmissions = (
  transmissions: Transmission[],
  user: User,
  registry: any[]
): Transmission[] => {
  if (user.role === UserRole.ADMIN) {
    return transmissions;
  }
  
  return transmissions.filter(transmission => {
    const employee = registry.find(u => u.name === transmission.userName);
    
    if (!employee) return false;
    
    if (user.role === UserRole.SUPERVISOR) {
      // Supervisors see reports from their department only
      return employee.department === user.department;
    }
    
    // Employees see only their own submissions
    return transmission.userName === user.name;
  });
};

/**
 * Count pending validations by department
 * Only for admin use
 */
export const countPendingByDepartment = (
  transmissions: Transmission[],
  department: string,
  registry: any[]
): number => {
  return transmissions.filter(transmission => {
    const employee = registry.find(u => u.name === transmission.userName);
    return employee?.department === department && transmission.status === 'pending';
  }).length;
};

/**
 * Get all departments for a user to access
 */
export const getAccessibleDepartments = (user: User): string[] => {
  if (user.role === UserRole.ADMIN) {
    return ['Technical', 'Sales', 'Marketing', 'IT'];
  }
  
  // Supervisors and employees only see their own department
  return [user.department || 'Technical'];
};

/**
 * Validate supervisor can modify employee data
 * - Admin: can modify all
 * - Supervisor: can only modify employees in their department
 */
export const canModifyEmployee = (
  currentUser: User,
  targetEmployeeDepartment: string
): boolean => {
  if (currentUser.role === UserRole.ADMIN) {
    return true;
  }
  
  if (currentUser.role === UserRole.SUPERVISOR) {
    return currentUser.department === targetEmployeeDepartment;
  }
  
  return false; // Employees can't modify anyone
};
