import React, { useState } from 'react';
import {
  X,
  User,
  Lock,
  Bell,
  Shield,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  ShieldAlert,
  KeyRound,
  Sun,
  Moon,
  Smartphone,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Activity,
  Monitor,
} from 'lucide-react';
import { User as UserType, UserRole } from '../types';
import { useDarkMode } from '../contexts/DarkModeContext';

interface ProfileSettingsOverlayProps {
  user: UserType;
  registry: any[];
  onUpdateRegistry: (r: any[]) => void;
  onClearLocalCache: () => void;
  onClose: () => void;
}

type Tab = 'profile' | 'security' | 'notifications';

const ProfileSettingsOverlay: React.FC<ProfileSettingsOverlayProps> = ({
  user,
  registry,
  onUpdateRegistry,
  onClearLocalCache,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isDark, toggle: toggleDark } = useDarkMode();

  // Personal info
  const [fullName, setFullName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState('+63 9XX XXX XXXX');
  const [infoSaved, setInfoSaved] = useState(false);

  // Password change
  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<{ type: 'ERROR' | 'SUCCESS'; msg: string } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // 2FA toggle (UI only)
  const [twoFa, setTwoFa] = useState(false);

  // Notification prefs
  const [emailNotif, setEmailNotif] = useState(true);
  const [approvalNotif, setApprovalNotif] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  const handleSaveInfo = () => {
    setInfoSaved(true);
    setTimeout(() => setInfoSaved(false), 2500);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdFeedback(null);
    setIsUpdatingPwd(true);
    setTimeout(() => {
      const userIndex = registry.findIndex(
        (u: any) => u.name.toLowerCase() === user.name.toLowerCase()
      );
      if (userIndex === -1) {
        setPwdFeedback({ type: 'ERROR', msg: 'Could not find your account. Try signing out and in again.' });
        setIsUpdatingPwd(false);
        return;
      }
      if (registry[userIndex].password !== pwdForm.current) {
        setPwdFeedback({ type: 'ERROR', msg: 'Current password is incorrect.' });
        setIsUpdatingPwd(false);
        return;
      }
      if (pwdForm.new !== pwdForm.confirm) {
        setPwdFeedback({ type: 'ERROR', msg: 'New password and confirmation do not match.' });
        setIsUpdatingPwd(false);
        return;
      }
      if (pwdForm.new.length < 3) {
        setPwdFeedback({ type: 'ERROR', msg: 'New password must be at least 3 characters.' });
        setIsUpdatingPwd(false);
        return;
      }
      const updated = [...registry];
      updated[userIndex] = { ...updated[userIndex], password: pwdForm.new };
      onUpdateRegistry(updated);
      setPwdFeedback({ type: 'SUCCESS', msg: 'Password updated successfully.' });
      setIsUpdatingPwd(false);
      setPwdForm({ current: '', new: '', confirm: '' });
    }, 900);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-[5000] flex bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Sidebar */}
      <div
        className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarCollapsed ? 'w-16 p-3' : 'w-64 p-6'
        }`}
      >
        {sidebarCollapsed ? (
          /* ── COLLAPSED: icons only, expand arrow pinned to bottom ── */
          <>
            {/* Avatar icon */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </div>
            </div>

            {/* Nav tab icons */}
            <div className="flex flex-col gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`flex justify-center items-center p-2.5 rounded-xl transition-all ${
                    activeTab === tab.id
                      ? 'bg-slate-900 dark:bg-slate-700 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.icon}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Expand arrow at bottom */}
            <button
              onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              className="flex justify-center items-center p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </>
        ) : (
          /* ── EXPANDED: full labels ── */
          <>
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Profile</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Your account and settings</p>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{user.role}</p>
              </div>
            </div>

            {/* Nav tabs */}
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left w-full ${
                  activeTab === tab.id
                    ? 'bg-slate-900 dark:bg-slate-700 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            <div className="flex-1" />

            {/* Collapse button — fully spelled out, above Close */}
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              Collapse
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all w-full"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* Top bar (mobile) */}
        <div className="flex md:hidden items-center justify-between px-4 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Profile</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Your account and settings</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile tab bar */}
        <div className="flex md:hidden gap-1 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-slate-900 dark:bg-slate-700 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <>
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <User className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 dark:text-white">{user.name}</p>
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest">
                        {user.role}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Appearance */}
                <Card>
                  <SectionHeader title="Appearance" subtitle="Light or dark interface for the whole app." />
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Appearance</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{isDark ? 'Dark mode' : 'Light mode'}</p>
                    </div>
                    <button
                      onClick={toggleDark}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#0d1526] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-all"
                      title="Toggle appearance"
                    >
                      {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                    </button>
                  </div>
                </Card>

                {/* Personal information */}
                <Card>
                  <SectionHeader title="Personal information" subtitle="Update your name, email, and contact info." />
                  <div className="mt-5 space-y-4">
                    {infoSaved && (
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 animate-in slide-in-from-top-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-black uppercase tracking-widest">Changes saved.</p>
                      </div>
                    )}
                    <FieldGroup label="Full name" icon={<User className="w-4 h-4 text-slate-400" />}>
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Your full name"
                        className={inputCls}
                      />
                    </FieldGroup>
                    <FieldGroup label="Email" icon={<Mail className="w-4 h-4 text-slate-400" />}>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={inputCls}
                      />
                    </FieldGroup>
                    <FieldGroup label="Phone" icon={<Phone className="w-4 h-4 text-slate-400" />}>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+63 9XX XXX XXXX"
                        className={inputCls}
                      />
                    </FieldGroup>
                    <div className="grid grid-cols-2 gap-4">
                      <FieldGroup label="Role" icon={<Briefcase className="w-4 h-4 text-slate-400" />}>
                        <input
                          type="text"
                          value={user.role}
                          readOnly
                          className={`${inputCls} bg-slate-100 dark:bg-[#0d1526]/50 cursor-not-allowed text-slate-500 dark:text-slate-500`}
                        />
                      </FieldGroup>
                      <FieldGroup label="Department" icon={<Building2 className="w-4 h-4 text-slate-400" />}>
                        <input
                          type="text"
                          value={user.department || '—'}
                          readOnly
                          className={`${inputCls} bg-slate-100 dark:bg-[#0d1526]/50 cursor-not-allowed text-slate-500 dark:text-slate-500`}
                        />
                      </FieldGroup>
                    </div>
                    <button
                      onClick={handleSaveInfo}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 dark:bg-blue-700 text-white text-sm font-bold hover:bg-blue-700 dark:hover:bg-blue-600 transition-all flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save changes
                    </button>
                  </div>
                </Card>
              </>
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <>
                <Card>
                  <SectionHeader title="Account &amp; security" subtitle="Password and security options." />
                  <div className="mt-4 space-y-4">
                    <div className="flex items-start justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Password</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Password details are managed by the backend.</p>
                      </div>
                    </div>
                    <div className="flex items-start justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Two-factor authentication</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Add extra security to your account</p>
                      </div>
                      <Toggle checked={twoFa} onChange={setTwoFa} />
                    </div>
                    <div className="flex items-start justify-between py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Login activity</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Login activity is provided by the backend.</p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Change password" subtitle="Update the password you use to sign in." />
                  <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
                    {pwdFeedback && (
                      <div className={`p-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2 ${pwdFeedback.type === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400'}`}>
                        {pwdFeedback.type === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
                        <p className="text-xs font-black uppercase tracking-widest">{pwdFeedback.msg}</p>
                      </div>
                    )}
                    <PasswordField
                      label="Current password"
                      icon={<Lock className="w-4 h-4 text-slate-400" />}
                      value={pwdForm.current}
                      show={showCurrent}
                      onToggle={() => setShowCurrent(s => !s)}
                      onChange={v => setPwdForm(f => ({ ...f, current: v }))}
                    />
                    <PasswordField
                      label="New password"
                      icon={<KeyRound className="w-4 h-4 text-slate-400" />}
                      value={pwdForm.new}
                      show={showNew}
                      onToggle={() => setShowNew(s => !s)}
                      onChange={v => setPwdForm(f => ({ ...f, new: v }))}
                    />
                    <PasswordField
                      label="Confirm new password"
                      icon={<CheckCircle2 className="w-4 h-4 text-slate-400" />}
                      value={pwdForm.confirm}
                      show={showConfirm}
                      onToggle={() => setShowConfirm(s => !s)}
                      onChange={v => setPwdForm(f => ({ ...f, confirm: v }))}
                    />
                    <button
                      type="submit"
                      disabled={isUpdatingPwd}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${isUpdatingPwd ? 'bg-slate-100 dark:bg-[#0d1526] text-slate-400 cursor-not-allowed' : 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600'}`}
                    >
                      {isUpdatingPwd ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                      Save password
                    </button>
                  </form>
                </Card>

                <Card>
                  <SectionHeader title="Active sessions" subtitle="Devices where you're currently signed in." />
                  <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                    <div className="p-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-100 dark:border-slate-600 shrink-0">
                      <Monitor className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">This device</p>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-widest">Active</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Unknown · Just now</p>
                    </div>
                  </div>
                </Card>

                {user.role === UserRole.ADMIN && (
                  <Card>
                    <SectionHeader title="Developer tools" subtitle="Admin-only actions for testing and maintenance." />
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            'Clear local cache?\n\nThis will reset cached transmissions and grading weights back to defaults. Preinstalled accounts and seeded audits will be kept.'
                          );
                          if (!ok) return;
                          onClearLocalCache();
                          onClose();
                        }}
                        className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-100 dark:border-red-900/50"
                      >
                        Clear Local Cache
                      </button>
                      <p className="mt-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
                        Keeps built-in accounts and seeded audits. Use for testing fresh state.
                      </p>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {activeTab === 'notifications' && (
              <Card>
                <SectionHeader title="Notification preferences" subtitle="Choose which notifications you receive." />
                <div className="mt-4 space-y-1 divide-y divide-slate-100 dark:divide-slate-700">
                  <NotifRow
                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                    title="Email notifications"
                    description="Receive updates and alerts via email"
                    checked={emailNotif}
                    onChange={setEmailNotif}
                  />
                  <NotifRow
                    icon={<Activity className="w-4 h-4 text-slate-400" />}
                    title="Approval requests"
                    description="Get notified about new sign-up requests"
                    checked={approvalNotif}
                    onChange={setApprovalNotif}
                  />
                  <NotifRow
                    icon={<Smartphone className="w-4 h-4 text-slate-400" />}
                    title="Security alerts"
                    description="Important security and login notifications"
                    checked={securityAlerts}
                    onChange={setSecurityAlerts}
                  />
                </div>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls =
  'w-full pl-10 pr-3 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 dark:focus:border-blue-600 transition-all';

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 md:p-6">
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3
        className="text-sm font-black text-slate-900 dark:text-white tracking-tight"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
    </div>
  );
}

function FieldGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  icon,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        <input
          type={show ? 'text' : 'password'}
          required
          placeholder="••••••••"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputCls + ' pr-10'}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-800 shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function NotifRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default ProfileSettingsOverlay;
