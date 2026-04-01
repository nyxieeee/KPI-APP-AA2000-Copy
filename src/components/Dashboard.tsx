import React from 'react';
import { User, UserRole, Transmission, SystemStats, AuditEntry, Announcement, DepartmentWeights } from '../types';
import EmployeeDashboard from '../dashboards/EmployeeDashboard.tsx';
import SupervisorDashboard from '../dashboards/SupervisorDashboard.tsx';
import AdminDashboard from '../dashboards/AdminDashboard.tsx';
import type { AuditBuckets } from '../utils/auditStore';

interface DashboardProps {
  user: User;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  auditBuckets: AuditBuckets;
  validatedStats: Record<string, SystemStats>;
  auditLogs: AuditEntry[];
  announcements: Announcement[];
  onTransmit: (t: Transmission) => void;
  onDeleteSubmission?: (t: Transmission) => void;
  onEditSubmission?: (t: Transmission) => void;
  onValidate: (id: string, overrides?: SystemStats, status?: 'validated' | 'rejected') => void;
  /**
   * Supervisor grades but does NOT finalize.
   * Admin later finalizes by setting `status` to validated/rejected.
   */
  onSupervisorGrade: (id: string, overrides?: any, supervisorRecommendation?: 'approved' | 'rejected') => void;
  onPostAnnouncement: (message: string) => void;
  onDeleteAnnouncement: (id: string) => void;
  onAddAuditEntry: (action: string, details: string, type?: 'INFO' | 'OK' | 'WARN', userName?: string) => void;
  onDeleteUser: (userId: string, userName: string) => void;
  onClearEmployeeAudits: () => void;
  registry: any[];
  adminUsers: Record<string, string[]>;
  departmentWeights: DepartmentWeights;
  onUpdateDepartmentWeights: (weights: DepartmentWeights) => void;
  onUpdateRegistry: (newRegistry: any[]) => void;
  onUpdateAdminUsers: (newAdminUsers: Record<string, string[]>) => void;
}

const Dashboard: React.FC<DashboardProps> = (props) => {
  const { user, auditLogs, onAddAuditEntry, onDeleteUser } = props;
  const wrapperClass = 'flex flex-col w-full min-w-0';
  const supervisorRest = props;

  switch (user.role) {
    case UserRole.EMPLOYEE:
      return (
        <div className={wrapperClass}>
          <EmployeeDashboard
            user={props.user}
            pendingTransmissions={props.pendingTransmissions}
            transmissionHistory={props.transmissionHistory}
            announcements={props.announcements}
            onTransmit={props.onTransmit}
            onDeleteSubmission={props.onDeleteSubmission}
            onEditSubmission={props.onEditSubmission}
            validatedStats={props.validatedStats[user.id]}
            departmentWeights={props.departmentWeights}
          />
        </div>
      );
    case UserRole.SUPERVISOR:
      return (
        <div className={wrapperClass}>
          <SupervisorDashboard {...supervisorRest} departmentWeights={props.departmentWeights} />
        </div>
      );
    case UserRole.ADMIN:
      return (
        <div className={wrapperClass}>
          <AdminDashboard
            user={user}
            auditLogs={auditLogs}
            registry={props.registry}
            adminUsers={props.adminUsers}
            pendingTransmissions={props.pendingTransmissions}
            transmissionHistory={props.transmissionHistory}
            departmentWeights={props.departmentWeights}
            onValidate={props.onValidate}
            onUpdateDepartmentWeights={props.onUpdateDepartmentWeights}
            onAddAuditEntry={onAddAuditEntry}
            onDeleteUser={onDeleteUser}
            onUpdateRegistry={props.onUpdateRegistry}
            onUpdateAdminUsers={props.onUpdateAdminUsers}
            onClearEmployeeAudits={props.onClearEmployeeAudits}
          />
        </div>
      );
    default:
      return (
        <div className="flex flex-1 items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Something went wrong</h1>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">Your account role is not supported on this screen. Sign out and try another account, or contact your administrator.</p>
          </div>
        </div>
      );
  }
};

export default Dashboard;
