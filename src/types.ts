export enum UserRole {
  EMPLOYEE = 'Employee',
  SUPERVISOR = 'Supervisor',
  ADMIN = 'Admin'
}

export interface SystemStats {
  responseTime: string;
  accuracy: string;
  uptime: string;
  supervisorComment?: string;
  ratings?: {
    performance: number;
    proficiency: number;
    professionalism: number;
    finalScore: number;
    incentivePct: number;
    /** Snapshot of category weights and scores at validation time for receipt/log detail (unchanged by later admin weight changes) */
    logDetailSnapshot?: { name: string; weightPct: number; score: number }[];
    marketingMetrics?: {
      leadGen: number;
      execution: number;
      salesEnable: number;
      revenue: number;
      responsibilities: number;
      attendance: number;
    };
    salesMetrics?: {
      revenueScore: number;
      accountsScore: number;
      activitiesScore: number;
      quotationScore: number;
      attendanceScore: number;
      additionalRespScore: number;
    };
    accountingMetrics?: {
      auditScore: number;
      taxScore: number;
      apArScore: number;
      budgetScore: number;
      attendanceScore: number;
      additionalRespScore: number;
    };
  };
}

export interface Transmission extends SystemStats {
  id: string;
  userId: string;
  userName: string;
  /** Canonical department bucket for this audit record (used for supervisor containers). */
  department?: string;
  timestamp: string;
  jobId: string;
  clientSite: string;
  jobType: string;
  systemStatus: string;
  projectReport?: string;
  attachments?: { name: string, type: string, size: string, data?: string }[];
  status?: 'validated' | 'rejected';
  /**
   * Set by supervisor when they finish grading but before admin approval.
   * Admin will later set `status` to `validated`/`rejected`.
   */
  supervisorRecommendation?: 'approved' | 'rejected';
  startTime?: string;
  endTime?: string;
  pmChecklist?: Record<string, any>;
  revenueValue?: number;
  accountsClosedValue?: number;
  /**
   * Fingerprint of `departmentWeights[department]` at broadcast time.
   * If current admin grading differs, pending audits are treated as outdated (see `gradingConfigSignature` utils).
   */
  gradingConfigSignature?: string;
  allSalesData?: Record<string, {
    checklist: Record<string, boolean>;
    revenue: number;
    accountsClosed: number;
    status: string;
    activities?: {
      quotations: number;
      meetings: number;
      calls: number;
    };
    attendance?: {
      days: number;
      late: number;
      violations: number;
    };
    quotationMgmt?: {
      onTime: number;
      errorFree: number;
      followedUp: number;
      total: number;
    };
  }>;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  type: 'INFO' | 'OK' | 'WARN';
}

export interface SystemNotification {
  id: string;
  targetUserId: string;
  message: string;
  timestamp: string;
  type: 'INFO' | 'SUCCESS' | 'ALERT';
  linkedTransmissionId?: string;
  linkedDepartment?: string;
}

export interface Announcement {
  id: string;
  department: string;
  senderName: string;
  message: string;
  timestamp: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  baseSalary: number;
  incentiveTarget: number;
  department?: string;
}

/** Per-criterion UI from admin (panel builder + definition for employee icon hover). */
export type CategoryContentItem = {
  label: string;
  maxPoints: number;
  ui?: {
    elements?: unknown[];
    definition?: string;
  };
};

export interface CategoryWeightItem {
  label: string;
  weightPct: number;
  definition?: string;
  icon?: string;
  content?: CategoryContentItem[];
}
export type DepartmentWeights = Record<string, CategoryWeightItem[]>;

export interface AppState {
  user: User | null;
}
