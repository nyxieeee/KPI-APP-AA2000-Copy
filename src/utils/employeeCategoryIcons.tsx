import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Calculator,
  CalendarCheck,
  ClipboardCheck,
  Cpu,
  DollarSign,
  FileStack,
  FileText,
  Handshake,
  Scale,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users2,
  Wrench,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  Wrench,
  Handshake,
  Users2,
  TrendingUp,
  FileStack,
  ShieldCheck,
  FileText,
  ClipboardCheck,
  Trophy,
  CalendarCheck,
  Calculator,
  Activity,
  DollarSign,
  Target,
  Scale,
  Cpu,
};

export function getEmployeeCategoryIcon(iconKey: string | undefined): LucideIcon {
  if (!iconKey) return Wrench;
  return MAP[iconKey] ?? Wrench;
}
