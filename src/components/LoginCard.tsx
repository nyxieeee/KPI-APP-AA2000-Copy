import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { LogIn, User as UserIcon, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Logo from './Logo';

interface LoginCardProps {
  onLogin: (user: User) => void;
  onAddAuditEntry: (action: string, details: string, type?: 'INFO' | 'OK' | 'WARN', userName?: string) => void;
  registry: any[];
}

const ROLE_FINANCIALS: Record<UserRole, { base: number; target: number }> = {
  [UserRole.EMPLOYEE]: { base: 62000, target: 12000 },
  [UserRole.SUPERVISOR]: { base: 88000, target: 18000 },
  [UserRole.ADMIN]: { base: 105000, target: 25000 },
};

const SORTED_ROLES = [
  UserRole.ADMIN,
  UserRole.SUPERVISOR,
  UserRole.EMPLOYEE,
];

const LoginCard: React.FC<LoginCardProps> = ({ onLogin, onAddAuditEntry, registry }) => {
  const [name, setName] = useState('');
  const [passkey, setPasskey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);
  const [showPasskey, setShowPasskey] = useState(false);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    setTimeout(() => {
      const trimmedName = name.trim();
      const matchedByName = registry.filter((u: any) => u.name.toLowerCase() === trimmedName.toLowerCase());

      if (matchedByName.length === 0) {
        onAddAuditEntry('AUTH_FAILURE', `Unrecognized identity login attempt: ${trimmedName}`, 'WARN');
        setFeedback({ type: 'ERROR', message: 'We could not find that name in the directory. Check spelling or contact your admin.' });
        setIsLoading(false);
        return;
      }

      // Find the user whose password matches (auto-detect role)
      const foundUser = matchedByName.find((u: any) => u.password === passkey);

      if (!foundUser) {
        onAddAuditEntry('AUTH_FAILURE', `Incorrect password for: ${trimmedName}`, 'WARN');
        setFeedback({ type: 'ERROR', message: 'Incorrect password. Try again or reset with your admin.' });
        setIsLoading(false);
        return;
      }

      if (foundUser.isActive === false) {
        onAddAuditEntry('AUTH_FAILURE', `Inactive account attempt by: ${trimmedName}`, 'WARN');
        setFeedback({ type: 'ERROR', message: 'This account is inactive. Contact your administrator.' });
        setIsLoading(false);
        return;
      }

      const detectedRole: UserRole = foundUser.role as UserRole;
      const finalName = foundUser.name;
      const foundDept = foundUser.department;

      setFeedback({ type: 'SUCCESS', message: `Signed in as ${detectedRole}. Opening your dashboard…` });

      const financial = ROLE_FINANCIALS[detectedRole] ?? ROLE_FINANCIALS[UserRole.EMPLOYEE];
      const stableId = btoa(finalName || detectedRole);

      setTimeout(() => {
        onLogin({
          id: stableId,
          name: finalName || `User_${detectedRole}`,
          email: `${(finalName || detectedRole).replace(/\s/g, '')}@aa2000.com`,
          role: detectedRole,
          baseSalary: financial.base,
          incentiveTarget: financial.target,
          department: foundDept
        });
      }, 800);
    }, 1200);
  };

  return (
    <div className="w-full max-w-md min-w-[20rem] animate-in fade-in zoom-in duration-700 relative">
      <div className="bg-white dark:bg-slate-900 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
          <Logo size="md" className="mb-8" />
          <div className="text-center mb-8 w-full">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Sign in
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-normal mt-2 leading-snug">
              Enter your credentials to access your dashboard
            </p>
          </div>
          <div className="w-full">
            {feedback && (
              <div className={`mb-6 px-4 py-3 rounded-lg border flex items-start gap-2.5 text-sm font-medium animate-in fade-in duration-200 ${
                feedback.type === 'SUCCESS' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {feedback.type === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <span className="leading-snug">{feedback.message}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text" required placeholder="e.g., employee sales"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-700 transition-all"
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPasskey ? 'text' : 'password'} required placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-700 transition-all"
                    value={passkey} onChange={(e) => setPasskey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasskey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 transition-colors focus:outline-none"
                    aria-label={showPasskey ? 'Hide password' : 'Show password'}
                  >
                    {showPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={isLoading}
                className="w-full mt-6 font-semibold py-2.5 rounded-lg bg-blue-600 text-white flex items-center justify-center gap-2 text-sm hover:bg-blue-700 disabled:bg-slate-400 transition-all active:scale-95"
              >
                {isLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" aria-hidden />Signing in…</>
                ) : (
                  <>Sign In <LogIn className="w-4 h-4 shrink-0" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-slate-400 dark:text-slate-500 text-xs font-normal">AA2000 KPI Workspace</p>
    </div>
  );
};

export default LoginCard;
