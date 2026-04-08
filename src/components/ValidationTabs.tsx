import React from 'react';

import { Transmission } from '../types';

interface ValidationTabsProps {
  pendingTransmissions: Transmission[];
  validatedTransmissions: Transmission[];
  rejectedTransmissions: Transmission[];
  registry: any[];
  activeTab: string;
  onTabChange: (dept: string) => void;
}

type Department = 'Technical' | 'Sales' | 'Marketing' | 'IT' | 'Accounting';

const DEPARTMENTS: Department[] = ['Technical', 'IT', 'Sales', 'Marketing', 'Accounting'];

export const ValidationTabs: React.FC<ValidationTabsProps> = ({
  pendingTransmissions,
  validatedTransmissions,
  rejectedTransmissions,
  registry,
  activeTab,
  onTabChange,
}) => {
  // Count pending submissions that have a supervisor recommendation (for badge display on department tabs)
  const getPendingCount = (dept: Department) => pendingTransmissions.filter(tx => {
    const employee = registry.find(u => u.name === tx.userName);
    return employee?.department === dept &&
      tx.status !== 'validated' &&
      tx.status !== 'rejected' &&
      !!tx.supervisorRecommendation;
  }).length;

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-600 pb-4">
        {DEPARTMENTS.map((dept) => {
          const pending = getPendingCount(dept as Department);
          const isActive = activeTab === dept;
          
          return (
            <button
              key={dept}
              onClick={() => onTabChange(dept)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all border ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 text-blue-900 dark:text-blue-300 shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <span>{dept}</span>
              {pending > 0 && (
                <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md text-xs font-bold ${
                  isActive
                    ? 'bg-blue-200 text-blue-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {pending}
                </span>
              )}
            </button>
          );
        })}
      </div>


    </div>
  );
};

export default ValidationTabs;
