import { jsPDF } from 'jspdf';
import type { Transmission } from '../types';
import { getGradeForScore } from './gradingSystem';
import { drawAppLogoFallback } from './pdfCommon';

// ─── Page geometry (mirrors performanceScorecardToPdf exactly) ────────────────
const BORDER_INSET     = 8;
const MARGIN           = 20;
const PAGE_WIDTH       = 210;
const PAGE_HEIGHT      = 297;
const CONTENT_WIDTH    = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_LEFT     = BORDER_INSET + 2;
const CONTENT_BOX_WIDTH = PAGE_WIDTH - 2 * BORDER_INSET - 4;

// ─── Design tokens (mirrors performanceScorecardToPdf) ────────────────────────
type Rgb = [number, number, number];

const C = {
  // slate
  s900: [15,  23,  42]  as Rgb,
  s800: [30,  41,  59]  as Rgb,
  s700: [51,  65,  85]  as Rgb,
  s500: [100, 116, 139] as Rgb,
  s300: [203, 213, 225] as Rgb,
  s200: [226, 232, 240] as Rgb,
  s100: [241, 245, 249] as Rgb,
  s50:  [248, 250, 252] as Rgb,
  // brand blue
  b600: [29,  78,  216] as Rgb,   // same as scorecard blue[600]
  b50:  [239, 246, 255] as Rgb,
  bLight: [219, 234, 254] as Rgb,
  // emerald / green
  e600: [5,   150, 105] as Rgb,
  e50:  [236, 253, 245] as Rgb,
  eLight: [220, 252, 231] as Rgb,
  // amber
  a700: [180, 83,  9]   as Rgb,
  a50:  [255, 251, 235] as Rgb,
  aBg:  [254, 243, 199] as Rgb,
  // red
  r600: [220, 38,  38]  as Rgb,
  r50:  [254, 226, 226] as Rgb,
  // white
  white: [255, 255, 255] as Rgb,
};

// ─── Footer (identical wording to scorecard) ──────────────────────────────────
const FOOTER_TEXT =
  '© 2026 AA2000. All rights reserved. This document is an official record and must not be altered, modified, or tampered with in any way.';

// ─── Page chrome (matches scorecard's drawPageBorder / drawFooterOnPage) ──────
function drawPageBorder(pdf: jsPDF): void {
  const x = BORDER_INSET, y = BORDER_INSET;
  const w = PAGE_WIDTH - 2 * BORDER_INSET;
  const h = PAGE_HEIGHT - 2 * BORDER_INSET;
  pdf.setDrawColor(...C.s300); pdf.setLineWidth(0.4);
  pdf.rect(x, y, w, h);
  pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.2);
  pdf.rect(x + 2, y + 2, w - 4, h - 4);
}

function drawFooterOnPage(pdf: jsPDF): void {
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s500);
  pdf.text(FOOTER_TEXT, PAGE_WIDTH / 2, PAGE_HEIGHT - 12, { align: 'center' });
}

// ─── Page helpers ─────────────────────────────────────────────────────────────
function newPage(pdf: jsPDF): number {
  pdf.addPage();
  drawPageBorder(pdf);
  drawFooterOnPage(pdf);
  return MARGIN;
}

function checkY(pdf: jsPDF, y: number, needed: number): number {
  return y + needed > PAGE_HEIGHT - 18 ? newPage(pdf) : y;
}

// ─── Typography helpers (mirrors scorecard) ───────────────────────────────────
function sectionTitle(pdf: jsPDF, y: number, title: string): number {
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.s700);
  pdf.text(title.toUpperCase(), MARGIN, y);
  return y + 6;
}

function hRule(pdf: jsPDF, y: number): number {
  pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 5;
}

function keyValue(
  pdf: jsPDF, x: number, y: number,
  key: string, value: string, bold = false
): number {
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s500);
  pdf.text(key, x, y);
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setTextColor(...C.s900);
  const lines = pdf.splitTextToSize(String(value ?? ''), CONTENT_WIDTH - (x - MARGIN) - 50);
  pdf.text(lines, x + 45, y);
  return y + lines.length * 4 + 2;
}

// ─── Weighted contribution (exact, no accumulated rounding) ──────────────────
// Formula: (rawScore / maxScore) × weightPct
// Matches getDepartmentWeightedKpiSum: (aggregatePts / categoryMaxPts) × weightPct
function weightedContrib(score: number, maxScore: number, weightPct: number): number | null {
  if (!weightPct || !Number.isFinite(weightPct)) return null;
  return maxScore > 0
    ? (score / maxScore) * weightPct          // exact – round only at display
    : (score * weightPct) / 100;
}

// ─── Image loader ─────────────────────────────────────────────────────────────
function loadImageAsDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const D = 200;
        const canvas = document.createElement('canvas');
        canvas.width = D; canvas.height = D;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No canvas context')); return; }
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) { ctx.drawImage(img, 0, 0, D, D); resolve(canvas.toDataURL('image/png')); return; }
        const r = iw / ih;
        const dw = r >= 1 ? D : D * r;
        const dh = r >= 1 ? D / r : D;
        ctx.clearRect(0, 0, D, D);
        ctx.drawImage(img, (D - dw) / 2, (D - dh) / 2, dw, dh);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error(`Failed: ${url}`));
    img.src = url;
  });
}

export function getAppLogoDataUrl(): Promise<string> {
  return (async () => {
    for (const url of ['/logo.png', '/logo-from-png.svg', '/logo.svg']) {
      try { return await loadImageAsDataUrl(url); } catch (_) { /* try next */ }
    }
    throw new Error('No logo found');
  })();
}

// ─── Public types ─────────────────────────────────────────────────────────────
export interface PanelItemForPdf  { name: string; score: number; }
export interface CategoryScoreForPdf {
  name: string;
  score: number;
  maxScore?: number;
  weightPct?: number;
  panelNames?: string[];
  panelItems?: PanelItemForPdf[];
}
export interface LogDetailPdfOptions {
  title: string;
  filename: string;
  logoDataUrl?: string;
  categoryScores?: CategoryScoreForPdf[];
  finalScore?: number;
}

export function getLogDetailPdfFilename(log: Transmission, department: string): string {
  const n    = (log?.userName || 'employee').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  const d    = log?.timestamp
    ? new Date(log.timestamp).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const dept = (department || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '') || 'Log';
  return `${n}_${d}_${dept}.pdf`;
}

// ─── Final Grade Block (identical layout to scorecard's drawFinalScoreBlock) ──
function drawFinalScoreBlock(pdf: jsPDF, y: number, finalScore: number): number {
  const h = 26;
  y = checkY(pdf, y, h + 6);
  const gradeInfo = getGradeForScore(finalScore);
  const quotaMet  = finalScore >= 90;
  const accentC   = quotaMet ? C.e600 : C.b600;

  pdf.setFillColor(...C.s100);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, h, 'F');
  pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.25);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, h, 'S');
  // Accent top border
  pdf.setDrawColor(...accentC); pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  pdf.setLineWidth(0.25); pdf.setDrawColor(...C.s200);

  // Label
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s700);
  pdf.text('Official performance grade', MARGIN + 6, y + 10);

  // Grade letter (large)
  pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...accentC);
  pdf.text(gradeInfo.letter, MARGIN + 6, y + 20);

  // Performance label inline
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
  pdf.text(gradeInfo.label.toUpperCase(), MARGIN + 18, y + 20);

  // Numerical score (right)
  pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.s900);
  pdf.text(`${Math.round(finalScore)}%`, PAGE_WIDTH - MARGIN - 26, y + 12, { align: 'right' });

  // Quota label (right)
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...(quotaMet ? C.e600 : C.s500));
  pdf.text(quotaMet ? 'Quota met' : 'Below target', PAGE_WIDTH - MARGIN - 26, y + 20, { align: 'right' });

  return y + h + 6;
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function drawStatusPill(pdf: jsPDF, y: number, status: string): number {
  const bg: Rgb = status === 'validated' ? C.e50  : status === 'rejected' ? C.r50  : C.b50;
  const fg: Rgb = status === 'validated' ? C.e600 : status === 'rejected' ? C.r600 : C.b600;
  const label   = status === 'validated' ? 'VALIDATED' : status === 'rejected' ? 'REJECTED' : 'PENDING REVIEW';
  pdf.setFillColor(...bg);
  pdf.roundedRect(MARGIN, y, 36, 6.5, 1.5, 1.5, 'F');
  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...fg);
  pdf.text(label, MARGIN + 18, y + 4.5, { align: 'center' });
  return y + 10;
}

// ─── Category Breakdown section ───────────────────────────────────────────────
function drawCategoryBreakdown(pdf: jsPDF, y: number, cats: CategoryScoreForPdf[]): number {
  y = checkY(pdf, y, 20);
  y = sectionTitle(pdf, y, 'Category Breakdown');
  y = hRule(pdf, y);

  for (const cat of cats) {
    const wp  = cat.weightPct ?? 0;
    const ms  = cat.maxScore  ?? 0;
    const wc  = weightedContrib(cat.score, ms, wp);
    const wcDisplay = wc != null ? Math.round(wc * 10) / 10 : null;

    const itemCount = cat.panelItems?.length ?? cat.panelNames?.length ?? 0;
    const ROW_H = 7.5;
    const tableH = itemCount > 0 ? 7 + itemCount * ROW_H + 4 : 0;
    y = checkY(pdf, y, 12 + tableH + 5);

    // ── Category header row ──────────────────────────────────────────────────
    pdf.setFillColor(...C.s50);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, 11, 'F');
    pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.2);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, 11, 'S');
    // Left accent
    pdf.setFillColor(...C.b600);
    pdf.rect(MARGIN, y, 2.5, 11, 'F');
    // Name
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.s900);
    pdf.text(cat.name, MARGIN + 6, y + 7.5);

    // Raw score chip
    const scoreStr   = ms > 0 ? `${cat.score} / ${ms}` : `${cat.score}`;
    const scoreChipW = pdf.getTextWidth(scoreStr) + 7;
    const chipGap    = wcDisplay != null ? 44 : 2;
    const chipX      = PAGE_WIDTH - MARGIN - scoreChipW - chipGap;
    pdf.setFillColor(...C.bLight);
    pdf.roundedRect(chipX, y + 2, scoreChipW, 7, 1, 1, 'F');
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.b600);
    pdf.text(scoreStr, chipX + scoreChipW / 2, y + 7, { align: 'center' });

    // Weighted contribution chip
    if (wcDisplay != null) {
      const wStr   = `${wcDisplay}% of total`;
      const wChipW = pdf.getTextWidth(wStr) + 7;
      const wChipX = PAGE_WIDTH - MARGIN - wChipW;
      pdf.setFillColor(...C.eLight);
      pdf.roundedRect(wChipX, y + 2, wChipW, 7, 1, 1, 'F');
      pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C.e600);
      pdf.text(wStr, wChipX + wChipW / 2, y + 7, { align: 'center' });
    }

    y += 13;

    // ── Criterion rows ───────────────────────────────────────────────────────
    const rows: { name: string; score?: string }[] =
      cat.panelItems
        ? cat.panelItems.map(p => ({ name: p.name, score: String(p.score) }))
        : cat.panelNames
        ? cat.panelNames.map(n => ({ name: n }))
        : [];

    if (rows.length > 0) {
      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C.s500);
      pdf.text('CRITERION', MARGIN + 3, y + 4);
      if (cat.panelItems) pdf.text('SCORE', PAGE_WIDTH - MARGIN - 3, y + 4, { align: 'right' });
      pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.15);
      pdf.line(MARGIN, y + 5.5, PAGE_WIDTH - MARGIN, y + 5.5);
      y += 7;

      for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 0) {
          pdf.setFillColor(...C.s50);
          pdf.rect(MARGIN, y - 1, CONTENT_WIDTH, ROW_H, 'F');
        }
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...C.s700);
        pdf.text(rows[i].name, MARGIN + 3, y + 4.5);
        if (rows[i].score !== undefined) {
          pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...C.s900);
          pdf.text(rows[i].score!, PAGE_WIDTH - MARGIN - 3, y + 4.5, { align: 'right' });
        }
        pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.1);
        pdf.line(MARGIN, y + ROW_H - 1, PAGE_WIDTH - MARGIN, y + ROW_H - 1);
        y += ROW_H;
      }
      y += 4;
    }
    y += 3;
  }

  return y;
}

// ─── Score Computation Summary ────────────────────────────────────────────────
// Grand total is accumulated from EXACT (unrounded) contributions to avoid
// floating-point drift from summing pre-rounded per-category values.
function drawScoreComputationSummary(
  pdf: jsPDF,
  y: number,
  cats: CategoryScoreForPdf[],
  authoritiveFinalScore: number | undefined
): number {
  y = checkY(pdf, y, 10 + cats.length * 7 + 12);
  y = sectionTitle(pdf, y, 'Score Computation Summary');
  y = hRule(pdf, y);

  const TC1 = MARGIN;
  const TC2 = PAGE_WIDTH - MARGIN - 60;
  const TC3 = PAGE_WIDTH - MARGIN - 30;
  const TC4 = PAGE_WIDTH - MARGIN;

  // Header row
  pdf.setFillColor(...C.b50);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, 7.5, 'F');
  pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.b600);
  pdf.text('CATEGORY',     TC1 + 3, y + 5);
  pdf.text('RAW SCORE',    TC2,     y + 5, { align: 'right' });
  pdf.text('WEIGHT',       TC3,     y + 5, { align: 'right' });
  pdf.text('CONTRIBUTION', TC4,     y + 5, { align: 'right' });
  y += 9;

  // Accumulate exact contributions to avoid rounding drift
  let grandTotalExact = 0;

  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const ms  = cat.maxScore  ?? 0;
    const wp  = cat.weightPct ?? 0;

    const exact = weightedContrib(cat.score, ms, wp);   // null | exact float
    if (exact != null) grandTotalExact += exact;

    // Display: 1-decimal rounded per row
    const display = exact != null ? Math.round(exact * 10) / 10 : null;

    if (i % 2 === 0) {
      pdf.setFillColor(...C.s50);
      pdf.rect(MARGIN, y - 1, CONTENT_WIDTH, 7, 'F');
    }
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.s700);
    pdf.text(cat.name, TC1 + 3, y + 4);

    const scoreStr = ms > 0 ? `${cat.score} / ${ms}` : String(cat.score);
    pdf.text(scoreStr,             TC2, y + 4, { align: 'right' });
    pdf.text(wp ? `${wp}%` : '—', TC3, y + 4, { align: 'right' });

    if (display != null) {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...C.b600);
      pdf.text(`${display}%`, TC4, y + 4, { align: 'right' });
    } else {
      pdf.setTextColor(...C.s500);
      pdf.text('—', TC4, y + 4, { align: 'right' });
    }

    pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.1);
    pdf.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6);
    y += 7;
  }

  // Grand total row – prefer the authoritative passed-in finalScore (same value shown in
  // the grade block) so the table is consistent; fall back to freshly computed total.
  const totalForDisplay =
    authoritiveFinalScore != null && Number.isFinite(authoritiveFinalScore)
      ? Math.round(Number(authoritiveFinalScore) * 10) / 10
      : Math.round(grandTotalExact * 10) / 10;

  pdf.setFillColor(...C.b600);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, 9, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.white);
  pdf.text('FINAL WEIGHTED SCORE', TC1 + 3, y + 6);
  pdf.text(`${totalForDisplay}%`,   TC4,     y + 6, { align: 'right' });
  y += 15;

  return y;
}

// ─── Main PDF builder ─────────────────────────────────────────────────────────
function buildDocument(log: Transmission, opts: LogDetailPdfOptions): jsPDF {
  const { title, logoDataUrl, categoryScores, finalScore: optFinalScore } = opts;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  drawPageBorder(pdf);
  drawFooterOnPage(pdf);

  // ── Logo row (centred, same as scorecard) ──────────────────────────────────
  const logoRowH = 20;
  const logoMm   = 14;
  const logoX    = (PAGE_WIDTH - logoMm) / 2;
  const logoY    = BORDER_INSET + 2 + (logoRowH - logoMm) / 2;
  if (logoDataUrl) {
    try { pdf.addImage(logoDataUrl, 'PNG', logoX, logoY, logoMm, logoMm); }
    catch { drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm); }
  } else {
    drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm);
  }
  let y = BORDER_INSET + 2 + logoRowH;

  // ── Header block (same as scorecard: slate[50] bg, bottom rule, multi-colour title) ──
  const headerH = 24;
  pdf.setFillColor(...C.s50);
  pdf.rect(CONTENT_LEFT, y, CONTENT_BOX_WIDTH, headerH, 'F');
  pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.25);
  pdf.line(CONTENT_LEFT, y + headerH, CONTENT_LEFT + CONTENT_BOX_WIDTH, y + headerH);

  // Multi-colour wordmark: "AA2000 KPI Log Review"
  const tagline = 'AA2000 KPI Log Review';
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
  const xStart = PAGE_WIDTH / 2 - pdf.getTextWidth(tagline) / 2;
  pdf.setTextColor(30, 58, 138);                            // navy "AA"
  pdf.text('AA', xStart, y + 9);
  pdf.setTextColor(...C.b600);                              // brand blue "2000"
  pdf.text('2000', xStart + pdf.getTextWidth('AA'), y + 9);
  pdf.setTextColor(...C.s700);                              // slate " KPI Log Review"
  pdf.text(' KPI Log Review', xStart + pdf.getTextWidth('AA2000'), y + 9);

  // Sub-line
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s500);
  pdf.text(String(title ?? ''), MARGIN, y + 17);
  pdf.setFontSize(8);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH - MARGIN - 52, y + 17);
  y += headerH + 6;

  // ── Employee & Log ─────────────────────────────────────────────────────────
  y = sectionTitle(pdf, y, 'Employee & Log');
  y = hRule(pdf, y);
  y = keyValue(pdf, MARGIN, y, 'Employee', log.userName || '—', true)  + 1;
  y = keyValue(pdf, MARGIN, y, 'Log ID',   log.id       || '—', false) + 1;
  y = keyValue(pdf, MARGIN, y, 'Date',
    log.timestamp ? new Date(log.timestamp).toLocaleString() : '—', false) + 3;
  y = drawStatusPill(pdf, y, log.status || 'pending');

  // ── Final Assessment Grade ─────────────────────────────────────────────────
  const displayScore = optFinalScore ?? log.ratings?.finalScore;
  if (displayScore != null && Number.isFinite(displayScore)) {
    y = checkY(pdf, y, 44);
    y = sectionTitle(pdf, y, 'Final Assessment Grade');
    y = hRule(pdf, y);
    y = drawFinalScoreBlock(pdf, y, Number(displayScore));
  }

  // ── Category Breakdown ─────────────────────────────────────────────────────
  const cats = categoryScores && categoryScores.length > 0 ? categoryScores : undefined;
  if (cats) {
    y = drawCategoryBreakdown(pdf, y, cats);

    // ── Score Computation Summary ──────────────────────────────────────────
    const authFinal =
      optFinalScore ??
      (log.ratings?.finalScore != null && Number.isFinite(log.ratings.finalScore)
        ? (log.ratings.finalScore as number)
        : undefined);
    y = drawScoreComputationSummary(pdf, y, cats, authFinal);
  }

  // ── Employee Narrative ─────────────────────────────────────────────────────
  const narrative = String(log.projectReport || 'No narrative provided.');
  const narLines  = pdf.splitTextToSize(narrative, CONTENT_WIDTH);
  y = checkY(pdf, y, 14 + narLines.length * 4.5);
  y = sectionTitle(pdf, y, 'Employee Narrative');
  y = hRule(pdf, y);
  pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s700);
  pdf.text(narLines, MARGIN, y + 2);
  y += narLines.length * 4.5 + 10;

  // ── Evidence Registry ──────────────────────────────────────────────────────
  y = checkY(pdf, y, 18);
  y = sectionTitle(pdf, y, 'Evidence Registry');
  y = hRule(pdf, y);
  if (log.attachments && log.attachments.length > 0) {
    for (const f of log.attachments) {
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C.s700);
      pdf.text(`• ${f.name}${f.size ? `  (${f.size})` : ''}`, MARGIN + 2, y + 3);
      y += 6;
    }
  } else {
    pdf.setFontSize(8); pdf.setTextColor(...C.s500);
    pdf.text('No attached files.', MARGIN + 2, y + 3);
    y += 8;
  }
  y += 6;

  // ── Supervisor Directive / Feedback ───────────────────────────────────────
  const feedback = String(log.supervisorComment || 'No supervisor justification recorded.');
  const fbLines  = pdf.splitTextToSize(feedback, CONTENT_WIDTH - 10);
  const fbH      = Math.max(14, fbLines.length * 4.5 + 10);
  y = checkY(pdf, y, fbH + 18);
  y = sectionTitle(pdf, y, 'Supervisor Directive / Feedback');
  y = hRule(pdf, y);
  pdf.setFillColor(...C.aBg);
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, fbH, 2, 2, 'F');
  pdf.setDrawColor(...C.a700); pdf.setLineWidth(0.15);
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, fbH, 2, 2, 'S');
  pdf.setFillColor(...C.a700);
  pdf.roundedRect(MARGIN, y, 3, fbH, 1, 1, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.a700);
  pdf.text(fbLines, MARGIN + 7, y + 7);

  // ── Apply border + footer to every page ───────────────────────────────────
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    drawPageBorder(pdf);
    drawFooterOnPage(pdf);
  }

  return pdf;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function createLogDetailPdfBlob(log: Transmission, options: LogDetailPdfOptions): Blob {
  if (!log || !options) throw new Error('Cannot generate PDF: missing log or options');
  return buildDocument(log, options).output('blob') as Blob;
}

export function downloadLogDetailPdf(log: Transmission, options: LogDetailPdfOptions): void {
  if (!log || !options) throw new Error('Cannot generate PDF: missing log or options');
  const name = options.filename || 'log-review.pdf';
  try {
    const url = URL.createObjectURL(createLogDetailPdfBlob(log, options));
    const a   = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  } catch {
    buildDocument(log, options).save(name);
  }
}
