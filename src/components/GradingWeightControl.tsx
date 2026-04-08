import React, { useMemo } from 'react';

interface GradingWeightControlProps {
  performance: number;
  proficiency: number;
  behavior: number;
  onPerformanceChange: (value: number) => void;
  onProficiencyChange: (value: number) => void;
  onBehaviorChange: (value: number) => void;
}

const PRESET_WEIGHTS = [10, 15, 20, 25, 30, 35, 40, 45, 50];

export const GradingWeightControl: React.FC<GradingWeightControlProps> = ({
  performance,
  proficiency,
  behavior,
  onPerformanceChange,
  onProficiencyChange,
  onBehaviorChange,
}) => {
  const total = useMemo(() => performance + proficiency + behavior, [performance, proficiency, behavior]);
  const remaining = 100 - total;
  const isValid = total === 100;
  const isMaxed = total === 100;

  const getAvailableWeights = (field: 'performance' | 'proficiency' | 'behavior', currentValue: number) => {
    return PRESET_WEIGHTS.filter(w => {
      const otherTotal = total - currentValue;
      return otherTotal + w <= 100;
    });
  };

  return (
    <div className="space-y-6">
      {/* Performance Weight */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
          Performance Weight
        </label>
        <select
          value={performance}
          onChange={(e) => onPerformanceChange(Number(e.target.value))}
          className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
        >
          <option value="">Select weight...</option>
          {getAvailableWeights('performance', performance).map((w) => (
            <option key={w} value={w}>
              {w}%
            </option>
          ))}
        </select>
      </div>

      {/* Proficiency Weight */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
          Proficiency Weight
        </label>
        <select
          value={proficiency}
          onChange={(e) => onProficiencyChange(Number(e.target.value))}
          className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
        >
          <option value="">Select weight...</option>
          {getAvailableWeights('proficiency', proficiency).map((w) => (
            <option key={w} value={w}>
              {w}%
            </option>
          ))}
        </select>
      </div>

      {/* Behavior Weight */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
          Behavior Weight
        </label>
        <select
          value={behavior}
          onChange={(e) => onBehaviorChange(Number(e.target.value))}
          className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
        >
          <option value="">Select weight...</option>
          {getAvailableWeights('behavior', behavior).map((w) => (
            <option key={w} value={w}>
              {w}%
            </option>
          ))}
        </select>
      </div>

      {/* Total Weight Display */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-600">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total Weight</span>
          <span className={`text-lg font-bold ${isValid ? 'text-green-600' : remaining >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
            {total} / 100
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              isValid ? 'bg-green-500' : remaining >= 0 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min((total / 100) * 100, 100)}%` }}
          />
        </div>

        {/* Remaining Weight */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {remaining > 0 ? `${remaining}% remaining` : remaining === 0 ? 'Perfect balance' : `${Math.abs(remaining)}% over`}
          </span>
          {!isValid && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-50 text-amber-700">
              Must total 100%
            </span>
          )}
        </div>
      </div>

      {/* Status Message */}
      {isValid ? (
        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs font-semibold text-green-700">
            ✓ Weight distribution is valid
          </p>
        </div>
      ) : isMaxed ? (
        <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-700">
            ⚠ Weight distribution is complete but not balanced
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs font-semibold text-blue-700">
            Allocate remaining {remaining}% of weight
          </p>
        </div>
      )}
    </div>
  );
};

export default GradingWeightControl;
