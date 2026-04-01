import React from 'react';
import { User, Transmission, SystemStats, AuditEntry, Announcement, DepartmentWeights } from '../types';
import TechnicalSupervisorDashboard from './TechnicalSupervisorDashboard';
import MarketingSupervisorDashboard from './MarketingSupervisorDashboard';
import SalesSupervisorDashboard from './SalesSupervisorDashboard';
import AccountingSupervisorDashboard from './AccountingSupervisorDashboard';
import ITSupervisorDashboard from './ITSupervisorDashboard';
import type { AuditBuckets } from '../utils/auditStore';

interface Props {
  user: User;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  auditBuckets: AuditBuckets;
  announcements: Announcement[];
  departmentWeights: DepartmentWeights;
  onSupervisorGrade: (id: string, overrides?: any, supervisorRecommendation?: 'approved' | 'rejected') => void;
  onAddAuditEntry: (action: string, details: string, type?: 'INFO' | 'OK' | 'WARN', userName?: string) => void;
  onPostAnnouncement: (message: string) => void;
  onDeleteAnnouncement: (id: string) => void;
  registry: any[];
  adminUsers: Record<string, string[]>;
}

const SupervisorDashboard: React.FC<Props> = (props) => {
  const department = props.user.department || 'Technical';

  switch (department) {
    case 'Marketing':
      return <MarketingSupervisorDashboard {...props} />;
    case 'Sales':
      return <SalesSupervisorDashboard {...props} />;
    case 'Accounting':
      return <AccountingSupervisorDashboard {...props} />;
    case 'IT':
      return <ITSupervisorDashboard {...props} />;
    case 'Technical':
    default:
      return <TechnicalSupervisorDashboard {...props} />;
  }
};

export default SupervisorDashboard;