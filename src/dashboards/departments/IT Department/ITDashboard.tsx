import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { User, Transmission, SystemStats, Announcement, DepartmentWeights, CategoryWeightItem, SystemNotification } from '../../../types';
import TechnicalCategoryAuditPanel, {
  buildDefaultPmChecklistForCategory,
  computeCategoryAggregateMetrics,
  scoreForCriterionContentItem,
} from '../../../components/audit/TechnicalCategoryAuditPanel';
import { getEmployeeCategoryIcon } from '../../../utils/employeeCategoryIcons';
import { LedgerRegistryPanel } from '../../../components/modals/LedgerRegistryModal';
import { EMPLOYEE_WORKSPACE_ID } from '../../../utils/employeeWorkspaceScroll';
import { DirectDirectiveModal } from '../../../components/modals/DirectDirectiveModal';
import AttachmentLivePreviewPanel from '../../../components/panels/AttachmentLivePreviewPanel';
import { downloadLogDetailPdf, getLogDetailPdfFilename, type CategoryScoreForPdf } from '../../../utils/logDetailToPdf';
import { getAppLogoDataUrl } from '../../../utils/pdfCommon';
import { getITWeightedKpiSum } from '../../../utils/technicalWeightedKpi';
import { computeGradingConfigSignature, isPendingGradingConfigExpired } from '../../../utils/gradingConfigSignature';
import { getScoreSuggestion } from '../../../utils/scoreSuggestion';
import { downloadPerformanceScorecardPdf, type QuarterPerformanceForPdf } from '../../../utils/performanceScorecardToPdf';
import { computeQuarterlyStats, getCurrentQuarter, type Quarter, type PerformanceCategory } from '../../../utils/performanceMatrix';
import { getSubmissionStatusLabel, getSubmissionStatusSubLabel } from '../../../utils/submissionStatus';
import {
  createStoredAttachmentFromFile,
  hydrateAttachmentData,
  attachmentsMatch,
  type HydratableAttachment,
} from '../../../utils/attachmentStore';
import { PerformanceMatrix as PerformanceMatrixCard } from '../../../components/panels/PerformanceMatrix';
import { TechnicalLogDetailAuditReview } from '../../../components/panels/TechnicalLogDetailAuditReview';
import { PdfToast, type PdfToastState } from '../../../components/toasts/PdfToast';
import DashboardNotificationBanner from '../../../components/workspace/DashboardNotificationBanner';
import { getGradeForScore, getGradeColorClasses } from '../../../utils/gradingSystem';
import { RoleSidenav } from '../../../components/navigation/RoleSidenav';
import { APP_NAV_RAIL_PL_COLLAPSED, APP_NAV_RAIL_PL_EXPANDED } from '../../../constants/navbarLayout';
import { useMobileSidenav } from '../../../contexts/MobileSidenavContext';
import { useRoleSidenavRail } from '../../../contexts/RoleSidenavRailContext';
import { useLockBodyScroll } from '../../../hooks/useLockBodyScroll';
import {
  startAuditPanelHold,
  stopAuditPanelHold,
  subscribeAuditPanelHoldGlobalStop,
} from '../../../utils/auditPanelHold';
import {
  Activity, CheckCircle2, Clock, Briefcase, MapPin,
  FileCheck, ChevronRight, Info, ChevronLeft, ShieldCheck, Zap,
  CheckCircle, Wrench, Upload, FileImage,
  File as FileIcon, X, Trophy, AlertCircle, Megaphone, Sparkles,
  Download, FileText, ClipboardList, Tag, CalendarDays, Check, Calendar, CalendarCheck,
  Handshake, Users2, TrendingUp, FileStack, XCircle, AlertOctagon, History as HistoryIcon,
  Star, Smile, RefreshCcw, MessageSquare, Users, ShieldAlert, UserCheck, MessageCircle,
  Medal, AlertTriangle, Loader2
} from 'lucide-react';

interface Props {
  user: User;
  validatedStats?: SystemStats;
  pendingTransmissions: Transmission[];
  transmissionHistory: Transmission[];
  announcements: Announcement[];
  onTransmit: (t: Transmission) => void;
  onDeleteSubmission?: (t: Transmission) => void;
  onEditSubmission?: (t: Transmission) => void;
  onClearMyLogs?: () => void;
  departmentWeights?: DepartmentWeights;
  notifications?: SystemNotification[];
  onDeleteNotification?: (id: string) => void;
}


const ITDashboard: React.FC<Props> = ({ user, validatedStats, pendingTransmissions, transmissionHistory, announcements, onTransmit, departmentWeights, onDeleteSubmission, onEditSubmission, onClearMyLogs, notifications = [], onDeleteNotification }) => {
  const [activeStep, setActiveStep] = useState(1);
  const { railOpen } = useRoleSidenavRail();
  const { setConfig: setMobileNavConfig } = useMobileSidenav();
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<Transmission | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    type?: string;
    size?: string;
    data?: string;
    storageKey?: string;
  } | null>(null);

  // Keep selectedLog in sync: when supervisor/admin updates a submission, reflect the latest status
  useEffect(() => {
    if (!selectedLog) return;
    const updated = [...pendingTransmissions, ...transmissionHistory].find(t => t.id === selectedLog.id);
    if (updated && (
      updated.status !== selectedLog.status ||
      updated.supervisorRecommendation !== selectedLog.supervisorRecommendation
    )) {
      setSelectedLog(updated);
    }
  }, [pendingTransmissions, transmissionHistory, selectedLog]);

  const logDetailFromLedgerRef = useRef(false);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>(() => {
    try {
      const key = `aa2000-kpi-ack-${user?.id ?? ''}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`aa2000-kpi-ack-${user.id}`, JSON.stringify(acknowledgedIds));
    } catch { /* ignore */ }
  }, [user?.id, acknowledgedIds]);

  const ledgerEntryCount = useMemo(() => {
    if (!user?.id) return 0;
    return (
      pendingTransmissions.filter((t) => t.userId === user.id).length +
      transmissionHistory.filter((t) => t.userId === user.id).length
    );
  }, [pendingTransmissions, transmissionHistory, user?.id]);

  useEffect(() => {
    setMobileNavConfig({
      ariaLabel: 'Employee navigation',
      items: [
        { id: '1', label: 'Core', icon: Activity },
        { id: '2', label: 'Verify', icon: ShieldCheck },
        { id: '3', label: 'Evidence', icon: FileText },
        { id: '4', label: 'Submit', icon: Megaphone },
        {
          id: 'ledger',
          label: 'Submission History',
          icon: HistoryIcon,
          badge: ledgerEntryCount > 0 ? ledgerEntryCount : null,
        },
      ],
      activeId: selectedLog ? 'ledger' : isRegistryOpen ? 'ledger' : `${activeStep}`,
      onSelect: (id) => {
        logDetailFromLedgerRef.current = false;
        if (id === 'ledger') {
          setSelectedLog(null);
          setIsRegistryOpen(true);
        } else {
          setSelectedLog(null);
          setActiveStep(Number(id));
          setIsRegistryOpen(false);
        }
      },
      showSignOut: true,
    });

    return () => setMobileNavConfig(null);
  }, [setMobileNavConfig, activeStep, isRegistryOpen, ledgerEntryCount, selectedLog]);
  const [completedCategories, setCompletedCategories] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pdfToast, setPdfToast] = useState<PdfToastState>(null);

  useLockBodyScroll(Boolean(isBroadcastModalOpen));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeLogDetail = useCallback(() => {
    setSelectedLog(null);
    if (logDetailFromLedgerRef.current) {
      logDetailFromLedgerRef.current = false;
      setIsRegistryOpen(true);
    }
  }, []);
  const holdIntervalRef = useRef<number | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);
  const csatTrackRef = useRef<HTMLDivElement>(null);
  const csatDragKeyRef = useRef<string | null>(null);
  const firstTimeFixDragKeyRef = useRef<string | null>(null);
  const [isCsatDragging, setIsCsatDragging] = useState(false);
  const ratingDragFieldRef = useRef<'csatRating' | 'rating'>('csatRating');
  const ratingDragmaxpointsRef = useRef<number>(50);
  const rateDragTypeRef = useRef<'timeliness' | 'accuracy' | null>(null);

  useEffect(() => {
    if (!isCsatDragging) return;
    const track = csatTrackRef.current;
    const key = csatDragKeyRef.current;
    const firstTimeFixKey = firstTimeFixDragKeyRef.current;
    const field = ratingDragFieldRef.current;
    const maxPts = ratingDragmaxpointsRef.current;
    const getScore = (v: number) => {
      if (v >= 4.8) return field === 'csatRating' ? 50 : maxPts;
      if (v >= 4.5) return field === 'csatRating' ? 40 : Math.round(maxPts * 0.75);
      if (v >= 4.0) return field === 'csatRating' ? 30 : Math.round(maxPts * 0.5);
      return 0;
    };
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!track) return;
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      if (clientX == null) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (firstTimeFixKey) {
        const pctValue = Math.round(pct * 100);
        const score = pctValue >= 100 ? 25 : pctValue >= 90 ? 15 : 0;
        setFormData(prev => {
          const current = (prev.pmChecklist as any)[firstTimeFixKey] || {};
          return { ...prev, pmChecklist: { ...prev.pmChecklist, [firstTimeFixKey]: { ...current, percentage: pctValue, score } } };
        });
        return;
      }
      const rateType = rateDragTypeRef.current;
      if (key && rateType) {
        const rate = Math.round(pct * 100);
        let score = 0;
        if (rateType === 'timeliness') {
          if (rate >= 95) score = 60;
          else if (rate >= 85) score = 40;
        } else {
          if (rate === 100) score = 40;
          else if (rate >= 90) score = 20;
        }
        setFormData(prev => {
          const current = (prev.pmChecklist as any)[key] || {};
          return { ...prev, pmChecklist: { ...prev.pmChecklist, [key]: { ...current, rate, score } } };
        });
        return;
      }
      if (!key) return;
      const value = Math.round(pct * 50) / 10;
      const rating = Math.max(0, Math.min(5, value));
      const score = getScore(rating);
      setFormData(prev => {
        const current = (prev.pmChecklist as any)[key] || {};
        return { ...prev, pmChecklist: { ...prev.pmChecklist, [key]: { ...current, [field]: rating, score } } };
      });
    };
    const handleEnd = () => { firstTimeFixDragKeyRef.current = null; rateDragTypeRef.current = null; csatDragKeyRef.current = null; setIsCsatDragging(false); };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: true });
    document.addEventListener('touchend', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isCsatDragging]);

  const stopHold = useCallback(() => {
    stopAuditPanelHold(holdTimeoutRef);
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const startHold = useCallback((fn: () => void) => {
    fn();
    stopAuditPanelHold(holdTimeoutRef);
    if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    let delay = 380;
    const run = () => {
      holdTimeoutRef.current = window.setTimeout(() => {
        fn();
        delay = Math.max(48, delay * 0.88);
        run();
      }, delay);
    };
    run();
  }, []);

  const startHoldPanel = useCallback((fn: () => void) => {
    startAuditPanelHold(holdTimeoutRef, fn);
  }, []);

  useEffect(() => subscribeAuditPanelHoldGlobalStop(stopHold), [stopHold]);

  // Draft audit data is kept in a ref to avoid heavy rerenders/lag while editing.
  // We only "materialize" (read) it for review/broadcast when needed.
  const categoryInputsRef = useRef<Record<string, {
    checklist: Record<string, unknown>,
    status: string,
    additionalRespValue?: number
  }>>({});
  const [draftRevision, setDraftRevision] = useState(0);

  const [formData, setFormData] = useState({
    jobId: '',
    clientSite: '',
    jobType: 'System Uptime & Reliability',
    startTime: '',
    endTime: '',
    systemStatus: 'Operational',
    projectReport: '',
    attachments: [] as { name: string, type: string, size: string, data?: string, storageKey?: string }[],
    pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false } as Record<string, unknown>,
    additionalRespValue: 0,
  });

  useEffect(() => {
    const list = departmentWeights?.IT;
    if (!list?.length) return;
    setFormData((prev) => {
      if (list.some((c) => c.label === prev.jobType)) return prev;
      return { ...prev, jobType: list[0].label };
    });
  }, [departmentWeights]);

  useEffect(() => {
    const saved = categoryInputsRef.current[formData.jobType];
    if (saved) {
      setFormData(prev => ({
        ...prev,
        pmChecklist: saved.checklist,
        systemStatus: saved.status,
      }));
      return;
    }
    const cat = departmentWeights?.IT?.find((c) => c.label === formData.jobType);
    if (cat?.content?.length) {
      setFormData(prev => ({
        ...prev,
        pmChecklist: buildDefaultPmChecklistForCategory(cat),
        systemStatus: 'Operational',
      }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false },
      systemStatus: 'Operational',
    }));
  }, [formData.jobType, departmentWeights]);

  const saveCurrentCategoryData = () => {
    categoryInputsRef.current = {
      ...categoryInputsRef.current,
      [formData.jobType]: {
        checklist: formData.pmChecklist,
        status: formData.systemStatus,
      },
    };
    setDraftRevision(v => v + 1);
  };

  const updateTeamLeadershipTotalProjects = (pc: number | string) => {
    setDraftRevision(v => v + 1);
    const pcNum = typeof pc === 'number' ? pc : 0;
    const teamLeadership = categoryInputsRef.current['Team Leadership & Accountability'] || { checklist: {}, status: 'Operational' };
    const task1 = (teamLeadership.checklist as any).task1 || {};
    let sp = task1.successfulProjects ?? 0;
    if (sp > pcNum) sp = pcNum;
    let pct1 = 0;
    if (pcNum > 0) {
      pct1 = Math.max(0, Math.min(100, Math.round((sp / pcNum) * 100)));
    }
    let score1 = 0;
    if (pcNum > 0) {
      if (pct1 === 100) score1 = 40;
      else if (pct1 >= 90) score1 = 25;
      else score1 = 0;
    }
    categoryInputsRef.current = {
      ...categoryInputsRef.current,
      'Team Leadership & Accountability': {
        ...teamLeadership,
        checklist: {
          ...teamLeadership.checklist,
          task1: { ...task1, totalProjects: pcNum, successfulProjects: sp, percentage: pct1, score: score1 },
        },
      },
    };
  };

  const isStep1Complete = true;
  const isStep3Complete = formData.attachments.length > 0;

  const handleNext = () => {
    if (activeStep === 1) {
      saveCurrentCategoryData();

      if (!completedCategories.includes(formData.jobType)) {
        setCompletedCategories(prev => [...prev, formData.jobType]);
      }

      const currentIndex = CLASSIFICATIONS.findIndex(c => c.name === formData.jobType);
      if (currentIndex < CLASSIFICATIONS.length - 1) {
        const nextCategory = CLASSIFICATIONS[currentIndex + 1].name;
        setFormData(prev => ({
          ...prev,
          jobType: nextCategory
        }));
      } else {
        setActiveStep(2);
      }
    } else {
      setActiveStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (activeStep === 1) {
      saveCurrentCategoryData();
      const currentIndex = CLASSIFICATIONS.findIndex(c => c.name === formData.jobType);
      if (currentIndex > 0) {
        setFormData(prev => ({ ...prev, jobType: CLASSIFICATIONS[currentIndex - 1].name }));
      }
    } else {
      if (activeStep === 2) {
        const lastCategory = CLASSIFICATIONS[CLASSIFICATIONS.length - 1].name;
        setFormData(prev => ({ ...prev, jobType: lastCategory }));
      }
      setActiveStep(prev => Math.max(1, prev - 1));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      const processedFiles = await Promise.all(fileList.map((f: File) => createStoredAttachmentFromFile(f)));
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...processedFiles] }));
      if (processedFiles.length > 0) setPreviewFile(processedFiles[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files);
      const processedFiles = await Promise.all(fileList.map((f: File) => createStoredAttachmentFromFile(f)));
      setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...processedFiles] }));
      if (processedFiles.length > 0) setPreviewFile(processedFiles[0]);
    }
  };

  const removeFile = (index: number) => {
    setFormData((prev) => {
      const removed = prev.attachments[index];
      const next = prev.attachments.filter((_, i) => i !== index);
      queueMicrotask(() => {
        if (next.length === 0) {
          setPreviewFile(null);
        } else {
          setPreviewFile((cur) => {
            if (!cur || !removed) return cur;
            if (attachmentsMatch(cur, removed)) return next[0] ?? null;
            if (!next.some((a) => attachmentsMatch(cur, a))) return next[0] ?? null;
            return cur;
          });
        }
      });
      return { ...prev, attachments: next };
    });
  };

  const handlePreview = async (file: HydratableAttachment) => {
    const hydratedFile = await hydrateAttachmentData(file);
    if (!hydratedFile.data) return;
    setPreviewFile(hydratedFile);
  };

  const handleDownload = async (file: { name: string; type?: string; size: string; data?: string; storageKey?: string }) => {
    const hydratedFile = await hydrateAttachmentData(file);
    if (!hydratedFile.data) {
      alert("System error: Binary source not found in cache.");
      return;
    }
    const link = document.createElement('a');
    link.href = hydratedFile.data;
    link.download = hydratedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const calculateAutomaticGrades = () => {
    // Calculate average performance across all categories
    let totalPerf = 0;
    let totalProf = 0;
    const categories = Object.keys(categoryInputsRef.current);

    if (categories.length === 0) return { performance: 4.0, proficiency: 0, professionalism: 3.0 };

    categories.forEach(cat => {
      const input = categoryInputsRef.current[cat];

      // Performance based on System Status
      let perf = 5.0;
      if (input.status === 'Degraded') perf = 4.0;
      if (input.status === 'Critical') perf = 3.0;
      totalPerf += perf;

      // Proficiency based on Checklist
      const checkedCount = Object.values(input.checklist).filter(v => v).length;
      const prof = (checkedCount / 6) * 5;
      totalProf += prof;
    });

    const avgPerf = totalPerf / categories.length;
    const avgProf = totalProf / categories.length;

    const reportScore = Math.min(2.5, (formData.projectReport.length / 300) * 2.5);
    const attachmentScore = Math.min(2.5, (formData.attachments.length / 3) * 2.5);
    const professionalism = Math.max(3.0, Math.min(5, reportScore + attachmentScore + 2.0));

    return {
      performance: parseFloat(avgPerf.toFixed(1)),
      proficiency: parseFloat(avgProf.toFixed(1)),
      professionalism: parseFloat(professionalism.toFixed(1))
    };
  };

  const handleTransmit = () => {
    if (!isStep3Complete) {
      alert("Please add at least one attachment before submitting.");
      return;
    }

    setIsTransmitting(true);
    const suggestedGrades = calculateAutomaticGrades();

    const transmission: Transmission = {
      id: `TX-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      userId: user.id, userName: user.name, timestamp: new Date().toISOString(),
      responseTime: '312ms', accuracy: '100%', uptime: '100%',
      jobId: formData.jobId, clientSite: formData.clientSite, jobType: 'Multi-Category Audit',
      systemStatus: 'Operational', projectReport: formData.projectReport,
      attachments: formData.attachments,
      startTime: formData.startTime,
      endTime: formData.endTime,
      pmChecklist: { ...formData.pmChecklist },
      allSalesData: categoryInputsRef.current as any,
      ratings: {
        performance: 0, proficiency: 0, professionalism: 0, finalScore: 0, incentivePct: 0
      },
      gradingConfigSignature: computeGradingConfigSignature('IT', departmentWeights),
    };

    setTimeout(() => {
      onTransmit(transmission);
      setIsTransmitting(false);
      setShowSuccess(true);
      setActiveStep(1);
      setCompletedCategories([]);
      categoryInputsRef.current = {};
      setDraftRevision(v => v + 1);
      setPreviewFile(null);
      setFormData({
        jobId: '', clientSite: '', jobType: 'System Uptime & Reliability', startTime: '', endTime: '',
        systemStatus: 'Operational', projectReport: '', attachments: [],
        pmChecklist: { task1: false, task2: false, task3: false, task4: false, task5: false, task6: false } as Record<string, unknown>,
        additionalRespValue: 0,
      });
      setTimeout(() => setShowSuccess(false), 4000);
    }, 2000);
  };

  const mySubmissions = useMemo(() => {
    const pending = pendingTransmissions.filter(t => t.userId === user.id);
    const history = transmissionHistory.filter(t => t.userId === user.id);
    return [...pending, ...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [pendingTransmissions, transmissionHistory, user.id]);

  // Project Execution Quality: KPI1_Score = BackJob_Points + FirstTimeFix_Points + Compliance_Points + Schedule_Points; Weighted_Score = KPI1_Score * weight. Zero back-jobs = 50 pts.
  const sumChecklistTaskScores = (checklist: any): number => {
    if (!checklist || typeof checklist !== 'object') return 0;
    return Object.values(checklist).reduce<number>((sum: number, task: any) => {
      if (task != null && typeof task === 'object' && !Array.isArray(task) && task.score != null) {
        return sum + (Number(task.score) || 0);
      }
      return sum;
    }, 0);
  };


  const categoriesFromProgram = useMemo(() => {
    if (departmentWeights?.IT?.length) {
      return departmentWeights.IT.map((c, i) => ({
        name: c.label,
        label: c.label.slice(0, 3).toUpperCase(),
        weightPct: c.weightPct,
        maxpoints: 100,
        color: 'bg-[#4CAF50]',
        textColor: 'text-[#4CAF50]'
      }));
    }
    return [];
  }, [departmentWeights]);

  const CLASSIFICATIONS = useMemo(() => {
    if (departmentWeights?.IT?.length) {
      return departmentWeights.IT.map((c) => ({
        name: c.label,
        description: `${c.weightPct}% Weight`,
        weight: `${c.weightPct}%`,
        tooltip: `Weighted impact: ${c.weightPct}%`,
        icon: getEmployeeCategoryIcon(c.icon),
      }));
    }
    return [];
  }, [departmentWeights]);

  const selectedCategoryConfig = useMemo((): CategoryWeightItem | undefined => {
    const tech = departmentWeights?.IT;
    if (!tech?.length) return undefined;
    return tech.find((c) => c.label === formData.jobType) ?? tech[0];
  }, [departmentWeights, formData.jobType]);

  /** Draft snapshot for Verify (step 2): ref + latest Core edits for current category; not persisted until Broadcast. */
  const pmForVerifyMerge = activeStep === 2 ? formData.pmChecklist : null;
  const verifyDraftSnapshot = useMemo(() => {
    const mergeChecklist = (label: string) => {
      const fromRef = categoryInputsRef.current[label];
      let checklist: Record<string, unknown> = { ...(fromRef?.checklist as Record<string, unknown> | undefined) };
      if (pmForVerifyMerge && label === formData.jobType) {
        checklist = { ...checklist, ...(pmForVerifyMerge as Record<string, unknown>) };
      }
      return checklist;
    };
    const tech = departmentWeights?.IT;
    if (tech?.length) {
      const out: Record<string, { checklist: Record<string, unknown>; status: string }> = {};
      for (const cat of tech) {
        out[cat.label] = {
          checklist: mergeChecklist(cat.label),
          status: categoryInputsRef.current[cat.label]?.status ?? 'Operational',
        };
      }
      return out;
    }
    const out: Record<string, { checklist: Record<string, unknown>; status: string }> = {};
    for (const [label, data] of Object.entries(categoryInputsRef.current as Record<string, any>)) {
      out[label] = {
        checklist: mergeChecklist(label),
        status: (data as any).status,
      };
    }
    return out;
  }, [draftRevision, activeStep, formData.jobType, pmForVerifyMerge, departmentWeights]);

  /** Log detail modal + PDF: scores from `allSalesData` + admin `departmentWeights.IT` content (same as Core audit). */
  const buildTechnicalLogPdfCategoryScores = useCallback(
    (log: Transmission): { categoryScores: CategoryScoreForPdf[]; weightedSumApprox: number } => {
      const allData = log.allSalesData || {};
      const tech = departmentWeights?.IT;
      const categoryOrder = tech?.length ? tech.map((c) => c.label) : Object.keys(allData);
      const categoryScores: CategoryScoreForPdf[] = [];

      for (const category of categoryOrder) {
        const catData = allData[category] || { checklist: {} };
        const checklist = (catData.checklist || {}) as Record<string, unknown>;
        const catCfg = tech?.find((w) => w.label === category);

        if (catCfg?.content?.length) {
          const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
          const panelItems = catCfg.content.map((item, taskIdx) => ({
            name: item.label,
            score: scoreForCriterionContentItem(item, checklist[`task${taskIdx + 1}`] as any),
          }));
          categoryScores.push({
            name: category,
            score: m.aggregatePts,
            maxScore: m.categorymaxpoints || undefined,
            weightPct: catCfg.weightPct, // Already a percentage (e.g. 35 means 35%)
            panelItems,
          });
        }
      }
      const weightedSumApprox = getITWeightedKpiSum(log, departmentWeights);
      return { categoryScores, weightedSumApprox };
    },
    [departmentWeights]
  );

  const getReviewTotalScoreLegacy = (category: string, checklist: any): number => {
    if (!checklist) return 0;
    return sumChecklistTaskScores(checklist);
  };

  const getWeightedKpiScore = (sub: Transmission): number => {
    if (sub.ratings?.finalScore != null && sub.status === 'validated') return sub.ratings.finalScore;
    return Math.round(getITWeightedKpiSum(sub, departmentWeights));
  };

  const currentTotalWeightedScore = useMemo(() => {
    const mock = { allSalesData: categoryInputsRef.current, status: 'pending', ratings: {} } as any;
    const score = getWeightedKpiScore(mock);
    return Number.isFinite(score) ? score : 0;
  }, [draftRevision, formData.jobType, departmentWeights]);

  const hasUserPending = useMemo(() => {
    return pendingTransmissions.some(t => t.userId === user.id);
  }, [pendingTransmissions, user.id]);

  const currentYear = new Date().getFullYear();
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(() => getCurrentQuarter());

  useEffect(() => {
    setSelectedQuarter(getCurrentQuarter());
  }, []);

  const getQuarterPerformanceForPdf = useMemo(() => {
    const categories = categoriesFromProgram;

    const getCategoryScore = (allData: any, categoryName: string) => {
      const checklist = allData?.[categoryName]?.checklist;
      if (!checklist) return 0;
      const catCfg = departmentWeights?.IT?.find((c) => c.label === categoryName);
      if (catCfg) {
        const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
        return m.aggregatePts;
      }
      return sumChecklistTaskScores(checklist);
    };

    return (q: 'Q1' | 'Q2' | 'Q3' | 'Q4'): QuarterPerformanceForPdf => {
      const history = transmissionHistory.filter(t => t.userId === user.id && t.status === 'validated');
      const currentQuarterHistory = history.filter(t => {
        const d = new Date(t.timestamp);
        const m = d.getMonth();
        const y = d.getFullYear();
        const tQ = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
        return tQ === q && y === currentYear;
      });

      if (currentQuarterHistory.length === 0) {
        return {
          quarter: q,
          count: 0,
          finalScore: undefined,
          categories: categories.map(c => ({ label: c.label, name: c.name, weightPct: c.weightPct, avgPct: undefined })),
        };
      }

      const totalFinal = currentQuarterHistory.reduce((sum, t) => sum + (t.ratings?.finalScore || 0), 0);
      const finalScore = Math.round(totalFinal / currentQuarterHistory.length);

      const quarterCats = categories.map(c => {
        const totalCat = currentQuarterHistory.reduce((sum, t) => sum + getCategoryScore(t.allSalesData || {}, c.name), 0);
        const avgCat = totalCat / currentQuarterHistory.length;
        const pct = c.maxpoints > 0 ? (avgCat / c.maxpoints) * 100 : 0;
        const avgPct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : undefined;
        return { label: c.label, name: c.name, weightPct: c.weightPct, avgPct };
      });

      return { quarter: q, count: currentQuarterHistory.length, finalScore, categories: quarterCats };
    };
  }, [currentYear, transmissionHistory, user.id, categoriesFromProgram, departmentWeights]);

  const quarterlyStats = useMemo(() => {
    const categories: PerformanceCategory[] = categoriesFromProgram.map((c: any) => ({
      name: c.name,
      label: c.label,
      weightPct: c.weightPct,
    }));

    const getCategoryScoreFallback = (t: Transmission, categoryName: string) => {
      const allData: any = t.allSalesData || {};
      const catCfg = departmentWeights?.IT?.find((x: any) => x.label === categoryName);
      const checklist = allData?.[categoryName]?.checklist;
      if (!checklist || !catCfg) return 0;
      const m = computeCategoryAggregateMetrics(catCfg, checklist as any);
      const maxpoints = catCfg.content?.reduce((sum, l) => sum + (l.maxpoints || 0), 0) || 100;
      return (m.aggregatePts / maxpoints) * 100;
    };

    return computeQuarterlyStats({
      transmissions: transmissionHistory,
      userId: user.id,
      department: user.department,
      quarter: selectedQuarter,
      year: currentYear,
      categories,
      getCategoryScoreFallback,
    }) as any;
  }, [transmissionHistory, user.id, selectedQuarter, currentYear, categoriesFromProgram, departmentWeights]);

  const isValidated = !!quarterlyStats?.ratings;
  const score = quarterlyStats?.ratings?.finalScore || 0;
  const dash = 251.2;
  const offset = dash - (dash * (score / 100));

  const [displayScore, setDisplayScore] = useState(0);
  const displayScoreRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(score)) return;
    const startScore = displayScoreRef.current;
    const endScore = score;
    const duration = 1000;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let startTime: number | null = null;
    const step = (now: number) => {
      if (startTime == null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const k = easeOutCubic(t);
      const scoreVal = startScore + (endScore - startScore) * k;
      displayScoreRef.current = scoreVal;
      setDisplayScore(scoreVal);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  const ringOffset = dash - (dash * (Math.max(0, Math.min(100, displayScore)) / 100));

  const handleDownloadPdf = useCallback(() => {
    try {
      setPdfToast('preparing');
      const quarters: QuarterPerformanceForPdf[] = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => getQuarterPerformanceForPdf(q));
      const opts = { employeeName: user.name, department: user.department, year: currentYear, quarters };
      getAppLogoDataUrl()
        .then((logoDataUrl) => downloadPerformanceScorecardPdf({ ...opts, logoDataUrl }))
        .catch(() => downloadPerformanceScorecardPdf(opts))
        .finally(() => setPdfToast('done'));
    } catch (err) {
      console.error('Scorecard PDF download failed', err);
      alert('Scorecard PDF download failed.');
      setPdfToast(null);
    }
  }, [user.name, user.department, currentYear, getQuarterPerformanceForPdf]);

  const deptAnnouncements = useMemo(() => {
    return announcements
      .filter(a => a.department === user.department)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [announcements, user.department]);

  const latestBroadcast = deptAnnouncements.length > 0 ? deptAnnouncements[0] : null;

  const isNewBroadcast = useMemo(() => {
    if (!latestBroadcast) return false;
    if (acknowledgedIds.includes(latestBroadcast.id)) return false;
    const broadcastTime = new Date(latestBroadcast.timestamp).getTime();
    const now = new Date().getTime();
    return (now - broadcastTime) < (24 * 60 * 60 * 1000);
  }, [latestBroadcast, acknowledgedIds]);

  const handleAcknowledge = () => {
    if (latestBroadcast && !acknowledgedIds.includes(latestBroadcast.id)) {
      const nextIds = [...acknowledgedIds, latestBroadcast.id];
      setAcknowledgedIds(nextIds);
    }
    setIsBroadcastModalOpen(false);
  };

  const getCompletedTasks = (log: Transmission) => {
    if (!log.allSalesData) return [];
    const tech = departmentWeights?.IT || [];
    const completed: string[] = [];
    for (const cat of tech) {
      const data = log.allSalesData[cat.label];
      if (data?.checklist) {
        completed.push(cat.label);
      }
    }
    return completed;
  };

  return (
    <div
      className={`w-full max-w-full xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto flex flex-col gap-4`}
    >
      <DirectDirectiveModal
        open={isBroadcastModalOpen}
        items={deptAnnouncements}
        acknowledgedIds={acknowledgedIds}
        latestBroadcast={latestBroadcast || null}
        onAcknowledge={handleAcknowledge}
        onClose={() => setIsBroadcastModalOpen(false)}
      />

      <DashboardNotificationBanner
        notifications={notifications}
        onDismiss={(id) => onDeleteNotification?.(id)}
      />

      {showSuccess && (
        <div className="fixed top-24 right-8 z-[9999] animate-in slide-in-from-right-full fade-in duration-500">
          <div className="bg-[#0b1222] text-white px-6 py-2 rounded-lg shadow-sm border border-blue-500/30 flex items-center gap-4">
            <CheckCircle2 className="w-6 h-6 text-blue-500" />
            <div><p className="text-[11px] font-black uppercase tracking-wide mb-1">Submission sent</p><p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Your supervisor can review it next</p></div>
          </div>
        </div>
      )}

      {activeStep === 1 && (
        <>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-50 dark:bg-[#0b1222] backdrop-blur-md border-b border-slate-200 dark:border-slate-600/60 -mx-3 sm:-mx-5 md:-mx-6 px-3 sm:px-5 md:px-6 py-4 sm:py-6">
            <div className="space-y-4">
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">Welcome, {user.name}!</h1>
              <p className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-slate-100 to-blue-50 dark:from-slate-800/50 dark:to-slate-800/30 border border-slate-200 dark:border-slate-600/80 shadow-sm">
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide">IT KPI Logs</span>
              </p>
            </div>

            <button
              onClick={() => setIsBroadcastModalOpen(true)}
              className="hidden lg:flex items-center text-left gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm min-w-[350px] max-w-md hover:bg-slate-50 dark:hover:bg-slate-900 transition-all group"
            >
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform relative">
                <Megaphone className={`w-6 h-6 text-amber-600 ${isNewBroadcast ? 'animate-shake' : ''}`} />
                {isNewBroadcast && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-1">Team announcements</p>
                <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase truncate">
                  {latestBroadcast ? latestBroadcast.message : 'No new messages from your supervisor'}
                </p>
              </div>
            </button>
          </div>

          <PerformanceMatrixCard
            title="Performance Scorecard"
            isValidated={!!quarterlyStats?.ratings}
            hasUserPending={hasUserPending}
            displayScore={displayScore}
            dash={dash}
            ringOffset={ringOffset}
            quarterlyStats={quarterlyStats}
            onDownloadPdf={handleDownloadPdf}
            suggestion={getScoreSuggestion(quarterlyStats?.ratings?.finalScore, (quarterlyStats?.categoryStats ?? []).map(s => ({ label: s.label, val: s.val })), quarterlyStats?.count ?? 0)}
            variantStyles={{ excellent: 'text-blue-600', good: 'text-blue-600', solid: 'text-slate-700 dark:text-slate-300', progress: 'text-amber-600', growth: 'text-slate-600 dark:text-slate-400 dark:text-slate-400', empty: 'text-slate-500 dark:text-slate-400 dark:text-slate-400' }}
          />
        </>
      )}

      <div>
        <div className="flex flex-col gap-3">
          <div className="hidden lg:block">
            <RoleSidenav
              roleLabel="Employee"
              items={[
                { id: '1', label: 'Core', description: 'Fill KPI inputs', icon: Activity },
                { id: '2', label: 'Verify', description: 'Review before submit', icon: ShieldCheck },
                { id: '3', label: 'Evidence', description: 'Attach evidence', icon: FileText },
                { id: '4', label: 'Submit', description: 'Send to supervisor', icon: Megaphone },
                {
                  id: 'ledger',
                  label: 'Submission History',
                  description: 'Your submission log',
                  icon: HistoryIcon,
                  badge: ledgerEntryCount > 0 ? ledgerEntryCount : null,
                },
              ]}
              activeId={(selectedLog ? 'ledger' : isRegistryOpen ? 'ledger' : `${activeStep}`) as '1' | '2' | '3' | '4' | 'ledger'}
              onSelect={(id) => {
                logDetailFromLedgerRef.current = false;
                if (id === 'ledger') {
                  setSelectedLog(null);
                  setIsRegistryOpen(true);
                } else {
                  setSelectedLog(null);
                  setActiveStep(Number(id));
                  setIsRegistryOpen(false);
                }
              }}
            />
          </div>

          <div>
            <div
              id={EMPLOYEE_WORKSPACE_ID}
              className="w-full bg-white dark:bg-[#0b1222] rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm flex flex-col"
            >
              <div className="flex lg:hidden bg-slate-50 dark:bg-slate-900 px-4 py-3 items-center justify-between border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  {[{ id: 1, label: 'Core' }, { id: 2, label: 'Verify' }, { id: 3, label: 'Evidence' }, { id: 4, label: 'Submit' }].map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] transition-all ${activeStep === s.id ? 'bg-blue-600 text-white shadow-lg scale-110' : (activeStep > s.id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-300 border border-slate-200 dark:border-slate-600')}`}>
                        {activeStep > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wide hidden md:inline ${activeStep === s.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300'}`}>{s.label}</span>
                      {s.id < 4 && <div className="w-4 h-px bg-slate-200 dark:bg-slate-700 ml-2 hidden md:block"></div>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg"><ShieldCheck className="w-3 h-3" /><p className="text-[10px] font-black uppercase tracking-wide">Signed in</p></div>
              </div>

              <div className="flex-grow p-5 space-y-8 flex flex-col min-h-0">
                {selectedLog ? (
                  <div className="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300">
                    <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${selectedLog.status === 'validated' ? 'bg-emerald-50 dark:bg-emerald-900/30' : selectedLog.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-blue-600'}`}>
                          <FileText className={`w-6 h-6 ${selectedLog.status === 'validated' ? 'text-emerald-600' : selectedLog.status === 'rejected' ? 'text-red-600' : 'text-white'}`} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">IT Log Review</h2>
                          <p className="text-xs font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide truncate">{selectedLog.id} • {new Date(selectedLog.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          role="button"
                          tabIndex={0}
                          className="px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-700 rounded-lg transition-all flex items-center gap-2 shadow-md cursor-pointer"
                          title="Download as PDF"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const { categoryScores } = buildTechnicalLogPdfCategoryScores(selectedLog);
                              const finalScore = getWeightedKpiScore(selectedLog);
                              const opts = {
                                title: 'IT Log Review',
                                filename: getLogDetailPdfFilename(selectedLog, 'IT'),
                                categoryScores: categoryScores.length ? categoryScores : undefined,
                                finalScore: Number.isFinite(finalScore) ? finalScore : undefined
                              };
                              setPdfToast('preparing');
                              getAppLogoDataUrl()
                                .then((logoDataUrl) => downloadLogDetailPdf(selectedLog, { ...opts, logoDataUrl }))
                                .catch(() => downloadLogDetailPdf(selectedLog, { ...opts, logoDataUrl: undefined }))
                                .finally(() => setPdfToast('done'));
                            } catch (err) {
                              console.error('PDF download failed', err);
                              alert('PDF download failed. Try allowing downloads for this site or check the console.');
                              setPdfToast(null);
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                        >
                          <Download className="w-5 h-5" />
                          <span className="text-[10px] font-black uppercase tracking-wide">PDF</span>
                        </div>
                        <button type="button" onClick={closeLogDetail} className="p-3 text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg transition-all" aria-label="Close log detail"><X className="w-6 h-6" /></button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-10 py-6 pr-1">
                      <div className={`w-full p-6 rounded-lg border flex items-center justify-between ${selectedLog.status === 'validated' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100' :
                          selectedLog.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/30 border-red-100' :
                            'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-900/50'
                        }`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedLog.status === 'validated' ? 'bg-emerald-100 text-emerald-600' :
                              selectedLog.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                'bg-blue-100 text-blue-600'
                            }`}>
                            {selectedLog.status === 'validated' ? <CheckCircle2 className="w-6 h-6" /> :
                              selectedLog.status === 'rejected' ? <XCircle className="w-6 h-6" /> :
                                <Clock className="w-6 h-6" />}
                          </div>
                          <div>
                            <h3 className={`text-lg font-black uppercase tracking-tight ${selectedLog.status === 'validated' ? 'text-emerald-900' :
                                selectedLog.status === 'rejected' ? 'text-red-900' :
                                  selectedLog.supervisorRecommendation ? 'text-orange-900' :
                                    'text-blue-900 dark:text-blue-300'
                              }`}>
                              {getSubmissionStatusLabel(selectedLog)}
                            </h3>
                            <p className={`text-[10px] font-bold uppercase tracking-wide ${selectedLog.status === 'validated' ? 'text-emerald-600' :
                                selectedLog.status === 'rejected' ? 'text-red-600' :
                                  selectedLog.supervisorRecommendation ? 'text-orange-600' :
                                    'text-blue-600'
                              }`}>
                              {getSubmissionStatusSubLabel(selectedLog)}
                            </p>
                          </div>
                        </div>
                        <div className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide ${selectedLog.status === 'validated' ? 'bg-emerald-200 text-emerald-800' :
                            selectedLog.status === 'rejected' ? 'bg-red-200 text-red-800' :
                              selectedLog.supervisorRecommendation ? 'bg-orange-200 text-orange-800' :
                                'bg-blue-200 text-blue-800'
                          }`}>
                          {getSubmissionStatusLabel(selectedLog)}
                        </div>
                      </div>

                      {selectedLog.status === 'validated' && selectedLog.ratings && (
                        <div className="w-full p-5 bg-slate-900 rounded-xl shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                          <div className="relative z-[1] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {(() => {
                                const gradeInfo = getGradeForScore(selectedLog.ratings.finalScore);
                                const cls = getGradeColorClasses(gradeInfo.color);
                                return (
                                  <div className={`px-5 py-2.5 rounded-2xl border ${cls.bg} ${cls.text} ${cls.border} flex flex-col items-center leading-none shadow-lg shadow-black/20`}>
                                    <span className="text-2xl font-black">{gradeInfo.letter}</span>
                                    <span className="text-[10px] uppercase font-bold tracking-tighter opacity-80 mt-0.5">{gradeInfo.label}</span>
                                  </div>
                                );
                              })()}
                              <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-0.5">Final Grade</h3>
                                <p className="text-slate-400 dark:text-slate-500 dark:text-slate-500 text-[10px] font-bold uppercase tracking-wide">Official Performance Outcome</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-6xl font-black text-white tracking-tighter tabular-nums">{selectedLog.ratings.finalScore}%</span>
                              <div className="flex items-center gap-2 justify-end mt-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${selectedLog.ratings.finalScore >= 90 ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                  {selectedLog.ratings.finalScore >= 90 ? 'Quota Met' : 'Below Target'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <TechnicalLogDetailAuditReview
                        selectedLog={selectedLog}
                        departmentKey="IT"
                        departmentWeights={departmentWeights}
                        CLASSIFICATIONS={CLASSIFICATIONS}
                        getReviewTotalScoreLegacy={getReviewTotalScoreLegacy}
                        handleDownload={handleDownload}
                      />

                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <ClipboardList className="w-4 h-4 text-slate-900 dark:text-slate-100" />
                          <h3 className="text-xs font-black uppercase tracking-wide text-black dark:text-white">Your report</h3>
                        </div>
                        <div className="p-5 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-3xl">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">&quot;{selectedLog.projectReport || 'No narrative provided.'}&quot;</p>
                        </div>
                      </div>

                      {selectedLog.attachments && selectedLog.attachments.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <FileCheck className="w-4 h-4 text-slate-900 dark:text-slate-100" />
                            <h3 className="text-xs font-black uppercase tracking-wide text-black dark:text-white">Attachments</h3>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {selectedLog.attachments.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg group/file overflow-hidden">
                                <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                                  {file.type.includes('image') ? <FileImage className="w-4 h-4 text-blue-500 shrink-0" /> : <FileIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-500 shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 truncate uppercase">{file.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500">{file.size}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDownload(file)}
                                  className="p-2 shrink-0 opacity-0 group-hover/file:opacity-100 text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-blue-600 transition-all"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selectedLog.status === 'validated' || selectedLog.status === 'rejected') && (
                        <div className="p-5 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/50 rounded-lg space-y-3">
                          <div className="flex items-center gap-2 text-amber-700">
                            <AlertCircle className="w-4 h-4" />
                            <p className="text-[10px] font-black uppercase tracking-wide">Supervisor feedback</p>
                          </div>
                          <p className="text-sm font-bold text-amber-900 dark:text-amber-300 leading-relaxed italic">&quot;{selectedLog.supervisorComment || 'No supervisor justification recorded.'}&quot;</p>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                      <button type="button" onClick={closeLogDetail} className="px-10 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-wide shadow-sm">Close</button>
                    </div>
                  </div>
                ) : isRegistryOpen ? (
                  <LedgerRegistryPanel
                    className="flex-1 min-h-0"
                    title="My Submissions"
                    emptyText="No local technical records found."
                    records={mySubmissions}
                    onSelect={(sub) => {
                      logDetailFromLedgerRef.current = true;
                      setSelectedLog(sub);
                      setIsRegistryOpen(false);
                    }}
                    getInitialScore={(t) => getWeightedKpiScore({ ...t, status: undefined })}
                    getValidatedScore={(t) =>
                      t.status === 'validated' && t.ratings?.finalScore != null ? t.ratings.finalScore : undefined
                    }
                    isGradingExpired={(t) => isPendingGradingConfigExpired(t, 'IT', departmentWeights)}
                    onDelete={onDeleteSubmission}
                    onEdit={onEditSubmission}
                    onClearLogs={onClearMyLogs}
                  />
                ) : (
                  <>
                    {activeStep === 1 && (
                      <div className="space-y-6 animate-in slide-in-from-left-4 fade-in duration-500">
                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">KPI Category Selection</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {CLASSIFICATIONS.map(c => {
                              const isActive = formData.jobType === c.name;
                              const isCompleted = completedCategories.includes(c.name);
                              const isClickable = isActive || isCompleted;

                              return (
                                <div key={c.name} className="relative group">
                                  <button
                                    disabled={!isClickable}
                                    onClick={() => {
                                      if (isClickable) {
                                        saveCurrentCategoryData();
                                        setFormData({ ...formData, jobType: c.name });
                                      }
                                    }}
                                    className={`w-full text-left px-5 py-2 border rounded-lg font-bold text-xs transition-all flex justify-between items-center ${isActive ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : isCompleted ? 'bg-[#1B367B] text-white border-[#1B367B] shadow-md' : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:border-[#1B367B] hover:shadow-md'} ${!isClickable ? 'opacity-40 cursor-not-allowed filter grayscale-[0.5]' : ''}`}
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                                      <c.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : isCompleted ? 'text-white/90' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`} />
                                      <span className="uppercase tracking-tight truncate">{c.name}</span>
                                    </div>
                                    <span className={`text-sm font-black tabular-nums shrink-0 ${isActive || isCompleted ? 'text-white/90' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}>{c.weight}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {selectedCategoryConfig && (selectedCategoryConfig.content?.length ?? 0) > 0 ? (
                          <div className="bg-white dark:bg-slate-800 p-5 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm mt-6 animate-in slide-in-from-top-4 duration-500 flex flex-col">
                            <TechnicalCategoryAuditPanel
                              category={selectedCategoryConfig}
                              pmChecklist={formData.pmChecklist as any}
                              setFormData={setFormData}
                              startHold={startHoldPanel}
                              stopHold={stopHold}
                            />
                          </div>
                        ) : (
                          <div className="p-5 mt-6 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-center space-y-3">
                            <p className="text-sm font-black text-amber-900 dark:text-amber-300 uppercase tracking-tight">Department grading not configured</p>
                            <p className="text-xs text-amber-800/90 max-w-lg mx-auto leading-relaxed">
                              This category has no audit criteria from the administrator yet. Configure <span className="font-bold">Department grading breakdown</span> for IT in admin.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {activeStep === 2 && (
                      <div className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-500 pb-10">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-6">
                          <div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Review & Verification</h3>
                            <p className="text-slate-400 dark:text-slate-500 dark:text-slate-500 text-sm font-medium mt-1">Please verify all inputs before proceeding to evidence submission.</p>
                          </div>
                          <div className="px-6 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl text-xs font-black uppercase tracking-wide border border-blue-100 dark:border-blue-900/50">
                            Status: Ready for Review
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {(departmentWeights?.IT?.length
                            ? departmentWeights.IT.map((c) => [c.label, verifyDraftSnapshot[c.label]] as const)
                            : (Object.entries(verifyDraftSnapshot) as [string, { checklist: Record<string, unknown>; status: string }][])
                          ).map(([cat, data]) => {
                            const catCfg = departmentWeights?.IT?.find((w) => w.label === cat);
                            const checklist = (data?.checklist ?? {}) as Record<string, unknown>;
                            const hasAdminCriteria = Boolean(catCfg?.content?.length);
                            const agg = hasAdminCriteria && catCfg
                              ? computeCategoryAggregateMetrics(catCfg, checklist as any)
                              : null;
                            const totalScore = agg ? agg.aggregatePts : 0;
                            const weightPct = catCfg?.weightPct ?? 0;
                            const weightedScoreText = agg
                              ? `+${agg.weightedImpactPct.toFixed(2)}%`
                              : '0.00%';
                            const weightedScoreColor =
                              totalScore >= 70 ? 'text-blue-600' : totalScore >= 50 ? 'text-amber-600' : 'text-rose-600';
                            const ReviewIcon = getEmployeeCategoryIcon(catCfg?.icon);
                            const reviewRows =
                              catCfg?.content?.length
                                ? catCfg.content.map((c, taskIdx) => ({ mainText: c.label, maxpoints: c.maxpoints, taskIdx }))
                                : [];
                            return (
                              <div key={cat} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-6">
                                <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-700 pb-4">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                      <ReviewIcon className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                      <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{cat}</h4>
                                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                        {hasAdminCriteria ? 'Aggregate' : 'Total score'}: {Number.isInteger(totalScore) ? totalScore : totalScore.toFixed(1)} pts
                                        {agg && agg.categorymaxpoints > 0 ? (
                                          <span className="text-slate-300"> / {agg.categorymaxpoints} max</span>
                                        ) : null}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide">
                                      {hasAdminCriteria ? 'Weighted impact (category)' : 'Weighted score'}
                                    </span>
                                    <span className={`text-lg font-black tracking-tight ${weightedScoreColor}`}>
                                      {weightedScoreText}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {reviewRows.map((row) => {
                                    const key = `task${row.taskIdx + 1}`;
                                    const value = checklist[key];
                                    const maxpoints = row.maxpoints;
                                    const mainText = row.mainText;
                                    const score =
                                      typeof value === 'object' && value != null && (value as any).score != null
                                        ? Number((value as any).score) || 0
                                        : value
                                          ? maxpoints
                                          : 0;

                                    return (
                                      <div key={row.taskIdx} className="bg-slate-50 dark:bg-slate-900 p-5 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col justify-between gap-3 hover:border-blue-200 dark:hover:border-blue-700 transition-colors">
                                        <div>
                                          <div className="flex justify-between items-start mb-2">
                                            <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight leading-tight">{mainText}</span>
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${score === maxpoints ? 'bg-blue-100 text-blue-600' : 'bg-blue-100 text-blue-600'}`}>
                                              {score} / {maxpoints}
                                            </span>
                                          </div>

                                          {typeof value === 'object' && value != null && (
                                            <div className="space-y-1.5">
                                              {(value as any).backJobs !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Back-jobs:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).backJobs}</span></div>
                                              )}
                                              {(value as any).fixTime !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Fix Time:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).fixTime} hrs</span></div>
                                              )}
                                              {(value as any).projectsCompleted !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Projects:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).projectsCompleted}</span></div>
                                              )}
                                              {(value as any).requiresBackJob !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Req. Back-job:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).requiresBackJob}</span></div>
                                              )}
                                              {(value as any).percentage !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Success Rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).percentage}%</span></div>
                                              )}
                                              {(value as any).totalProjects !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Total Projects:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).totalProjects}</span></div>
                                              )}
                                              {(value as any).onTimeProjects !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>On-Time:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).onTimeProjects}</span></div>
                                              )}
                                              {(value as any).csatRating !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>CSAT:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).csatRating}</span></div>
                                              )}
                                              {(value as any).complaints !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Complaints:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).complaints}</span></div>
                                              )}
                                              {(value as any).severity !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Severity:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).severity}</span></div>
                                              )}
                                              {(value as any).visits !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Visits / month:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).visits}</span></div>
                                              )}
                                              {(value as any).conversionRate !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Conversion rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).conversionRate}%</span></div>
                                              )}
                                              {(value as any).rating !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Rating:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).rating}</span></div>
                                              )}
                                              {(value as any).num !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Value:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).num === '' ? '—' : String((value as any).num)}</span></div>
                                              )}
                                              {Array.isArray((value as any).checks) && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Checked:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).checks.filter(Boolean).length} / {(value as any).checks.length}</span></div>
                                              )}
                                              {(value as any).rate !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Rate:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).rate}%</span></div>
                                              )}
                                              {(value as any).absences !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Absences:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).absences}</span></div>
                                              )}
                                              {(value as any).tardies !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Tardies:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).tardies}</span></div>
                                              )}
                                              {(value as any).violations !== undefined && (
                                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400"><span>Violations:</span> <span className="font-bold text-slate-900 dark:text-slate-100">{(value as any).violations}</span></div>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {typeof value === 'object' && value != null && (value as any).file && (
                                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600/50">
                                            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/50">
                                              <FileCheck className="w-3 h-3 shrink-0" />
                                              <span className="text-[10px] font-bold truncate">{(value as any).file.name}</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="bg-slate-900 p-5 rounded-xl text-white flex items-center gap-6 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full -mr-32 -mt-32"></div>
                          <div className="relative z-10 w-16 h-16 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/20 shrink-0">
                            <ShieldCheck className="w-8 h-8 text-blue-400" />
                          </div>
                          <div className="relative z-10">
                            <h4 className="text-xl font-black tracking-tight uppercase">Confirm Entries</h4>
                            <p className="text-slate-400 text-xs font-medium mt-1">Please ensure all recorded scores are accurate before submitting.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeStep === 3 && (
                      <div className="space-y-3 animate-in slide-in-from-left-4 fade-in duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
                          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg p-3 md:p-4 flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Project report</label>
                              <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400">{formData.projectReport.length} characters</span>
                            </div>
                            <textarea
                              placeholder="Detailed summary of all operations..."
                              className="w-full flex-1 min-h-[26rem] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg p-4 text-sm font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500"
                              value={formData.projectReport}
                              onChange={e => setFormData({ ...formData, projectReport: e.target.value })}
                            />
                          </div>

                          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg p-3 md:p-4 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-black text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wide ml-1">Global Proof (PDF/PNG/JPG) *</label>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-black uppercase tracking-wide transition-all ${isDragging ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400'}`}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Upload
                              </button>
                            </div>
                            <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileSelect} />

                            <div className="shrink-0 flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700 mb-1.5">
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Attached Files ({formData.attachments.length})</span>
                              {formData.attachments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => ({ ...prev, attachments: [] }));
                                    setPreviewFile(null);
                                  }}
                                  title="Remove every attached file"
                                  aria-label="Clear all attachments"
                                  className="text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 dark:hover:border-red-600 transition-colors"
                                >
                                  Clear All
                                </button>
                              )}
                            </div>
                            <div className="min-h-[7rem] max-h-44 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 overscroll-y-contain">
                              {formData.attachments.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-5 text-center">
                                  <FileIcon className="w-7 h-7 text-slate-200 mb-1.5" />
                                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-wide">No files attached</p>
                                </div>
                              ) : (
                                formData.attachments.map((file, idx) => {
                                  const isActive = attachmentsMatch(previewFile, file);
                                  return (
                                    <div
                                      key={file.storageKey ?? `${file.name}-${idx}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => void handlePreview(file)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          void handlePreview(file);
                                        }
                                      }}
                                      className={`flex items-center justify-between p-2 rounded-lg group border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800 cursor-pointer ${
                                        isActive
                                          ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-600 ring-1 ring-blue-400/80'
                                          : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                        <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-md flex items-center justify-center border border-slate-100 dark:border-slate-700 shrink-0">
                                          {file.type.includes('image') ? <FileImage className="w-4 h-4 text-blue-500" /> : <FileIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-500" />}
                                        </div>
                                        <div className="overflow-hidden min-w-0 text-left">
                                          <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 truncate uppercase">{file.name}</p>
                                          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500">{file.size}</p>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFile(idx);
                                        }}
                                        title="Remove this file"
                                        aria-label="Remove file"
                                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-600 px-1.5 py-1 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0"
                                      >
                                        <X className="w-3.5 h-3.5 shrink-0" />
                                        <span className="hidden sm:inline text-[9px] font-black uppercase tracking-wide">Remove</span>
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            <AttachmentLivePreviewPanel file={previewFile} />
                          </div>
                        </div>
                      </div>
                    )}
                    {activeStep === 4 && (
                      <div className="flex flex-col items-center justify-center py-10 space-y-10 animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm animate-pulse"><FileCheck className="w-12 h-12 text-white" /></div>
                        <div className="text-center space-y-3"><h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Ready to Submit</h3><p className="text-slate-400 dark:text-slate-500 dark:text-slate-500 text-base font-medium">Review your details, then submit your KPI log for supervisor review.</p></div>
                        <div className="w-full max-w-sm space-y-4"><div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 p-5 rounded-xl space-y-4">
                          <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide"><span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Submission status</span><span className="text-blue-500">{isTransmitting ? 'Sending…' : 'Ready to send'}</span></div>
                          <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide"><span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Submitted by</span><span className="text-blue-600">{user.name}</span></div>
                          <div className="flex justify-between items-start text-xs font-black uppercase tracking-wide border-t border-slate-100 dark:border-slate-700 pt-3 mt-1">
                            <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500 mt-1">Grade Outcome</span>
                            {(() => {
                              const gradeInfo = getGradeForScore(currentTotalWeightedScore);
                              const cls = getGradeColorClasses(gradeInfo.color);
                              return (
                                <div className={`px-4 py-1.5 rounded-xl border ${cls.bg} ${cls.text} ${cls.border} flex flex-col items-center leading-none shadow-sm`}>
                                  <span className="text-lg font-black">{gradeInfo.letter}</span>
                                  <span className="text-[8px] uppercase font-bold tracking-tighter opacity-80">{gradeInfo.label}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide"><span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">Weighted score (est.)</span><span className="text-slate-900 dark:text-slate-100">{currentTotalWeightedScore}%</span></div>
                        </div></div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {!selectedLog && !isRegistryOpen && (
                <div className="bg-slate-50 dark:bg-slate-900 p-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 rounded-b-[2.5rem]">
                  <button onClick={handlePrevious} disabled={activeStep === 1 && CLASSIFICATIONS.findIndex(c => c.name === formData.jobType) === 0} className={`flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-wide transition-all ${activeStep === 1 && CLASSIFICATIONS.findIndex(c => c.name === formData.jobType) === 0 ? 'opacity-0' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'}`}><ChevronLeft className="w-4 h-4" /> Previous</button>
                  {activeStep < 4 ? (
                    <button onClick={handleNext} disabled={(activeStep === 3 && !isStep3Complete)} className={`flex items-center gap-2 px-10 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide shadow-sm transition-all ${((activeStep === 1) || (activeStep === 2) || (activeStep === 3 && isStep3Complete)) ? 'bg-slate-900 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 dark:text-slate-500 cursor-not-allowed'}`}>Continue <ChevronRight className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={handleTransmit} disabled={isTransmitting} className="bg-blue-600 text-white px-12 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide shadow-sm active:scale-95 flex items-center gap-3">{isTransmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {isTransmitting ? 'Submitting…' : 'Submit KPI log'}</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      <PdfToast state={pdfToast} onDismiss={() => setPdfToast(null)} />
    </div>
  );
};

export default ITDashboard;



