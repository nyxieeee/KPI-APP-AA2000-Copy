import React from 'react';
import { User, Transmission, SystemStats, Announcement, DepartmentWeights } from '../types';
import TechnicalDashboard from './departments/TechnicalDashboard';
import SalesDashboard from './departments/SalesDashboard';
import MarketingDashboard from './departments/MarketingDashboard';
import AccountingDashboard from './departments/AccountingDashboard';
import ITDashboard from './departments/ITDashboard';

interface Props {
  user: User;
  validatedStats?: SystemStats;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  announcements: Announcement[];
  onTransmit: (t: Transmission) => void;
  onDeleteSubmission?: (t: Transmission) => void;
  onEditSubmission?: (t: Transmission) => void;
  departmentWeights: DepartmentWeights;
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