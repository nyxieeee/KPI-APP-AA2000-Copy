import React from 'react';
import { User, Transmission, SystemStats, Announcement, DepartmentWeights, SystemNotification } from '../types';
import TechnicalDashboard from './departments/Technical Department/TechnicalDashboard';
import SalesDashboard from './departments/Sales Department/SalesDashboard';
import MarketingDashboard from './departments/Marketing Department/MarketingDashboard';
import AccountingDashboard from './departments/Accounting Department/AccountingDashboard';
import ITDashboard from './departments/IT Department/ITDashboard';

interface Props {
  user: User;
  validatedStats?: SystemStats;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  announcements: Announcement[];
  onTransmit: (t: Transmission) => void;
  onEditSubmission?: (t: Transmission) => void;
  onClearMyLogs?: () => void;
  departmentWeights: DepartmentWeights;
  notifications?: SystemNotification[];
  onDeleteNotification?: (id: string) => void;
}

const EmployeeDashboard: React.FC<Props> = (props) => {
  const department = props.user.department || 'Technical';

  switch (department) {
    case 'Technical':
      return <TechnicalDashboard {...props} />;
    case 'IT':
      return <ITDashboard {...props} />;
    case 'Sales':
      return <SalesDashboard {...props} />;
    case 'Marketing':
      return <MarketingDashboard {...props} />;
    case 'Accounting':
      return <AccountingDashboard {...props} />;
    default:
      // Default to Technical for any undefined or administrative employee departments
      return <TechnicalDashboard {...props} />;
  }
};

export default EmployeeDashboard;