import React from 'react';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Transmission } from '../types';

interface ValidationTabsProps {
  pendingTransmissions: Transmission[];
  validatedTransmissions: Transmission[];
  rejectedTransmissions: Transmission[];
  registry: any[];
  activeTab: string;
  onTabChange: (dept: string) => void;
}

type Department = 'Technical' | 'Sales' | 'Marketing' | 'IT';

const DEPARTMENTS: Department[] = ['Technical', 'Sales', 'Marketing', 'IT'];

export const ValidationTabs: React.FC<ValidationTabsProps> = ({
  pendingTransmissions,
  validatedTransmissions,
  rejectedTransmissions,
  registry,
  activeTab,
  onTabChange,
}) => {
  const countByDept = (transmissions: Transmission[], dept: Department): number => {
    return transmissions.filter(tx => {
      const employee = registry.find(u => u.name === tx.userName);
      return employee?.department === dept;
    }).length;
  };

  const getPendingCount = (dept: Department) => countByDept(pendingTransmissions, dept);
  const getValidatedCount = (dept: Department) => countByDept(validatedTransmissions, dept);
  const getRejectedCount = (dept: Department) => countByDept(rejectedTransmissions, dept);

  const totalPending = DEPARTMENTS.reduce((sum, dept) => sum + getPendingCount(dept), 0);

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {DEPARTMENTS.map((dept) => {
          const pending = getPendingCount(dept as Department);
          const isActive = activeTab === dept;
          
          return (
            <button
              key={dept}
              onClick={() => onTabChange(dept)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all border ${
                isActive
                  ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">Pending</p>
          </div>
          <p className="text-2xl font-bold text-amber-900">{getPendingCount(activeTab as Department)}</p>
        </div>

        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-green-700">Validated</p>
          </div>
          <p className="text-2xl font-bold text-green-900">{getValidatedCount(activeTab as Department)}</p>
        </div>

        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-xs font-semibold text-red-700">Rejected</p>
          </div>
          <p className="text-2xl font-bold text-red-900">{getRejectedCount(activeTab as Department)}</p>
        </div>
      </div>

      {/* Overall Stats */}
      {totalPending > 0 && (
        <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-sm font-semibold text-blue-900">
            <span className="font-bold text-lg">{totalPending}</span> total pending validations across all departments
          </p>
        </div>
      )}

      {totalPending === 0 && (
        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-center">
          <p className="text-sm font-semibold text-green-700">
            ✓ All submissions validated
          </p>
        </div>
      )}
    </div>
  );
};

export default ValidationTabs;
