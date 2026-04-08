import { jsPDF } from 'jspdf';
import { drawAppLogoFallback } from './pdfCommon';
import { getGradeForScore } from './gradingSystem';

// ─── Page geometry (mirrors logDetailToPdf exactly) ──────────────────────────
const BORDER_INSET      = 8;
const MARGIN            = 20;
const PAGE_WIDTH        = 210;
const PAGE_HEIGHT       = 297;
const CONTENT_WIDTH     = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_LEFT      = BORDER_INSET + 2;
const CONTENT_BOX_WIDTH = PAGE_WIDTH - 2 * BORDER_INSET - 4;

// ─── Design tokens (mirrors logDetailToPdf) ───────────────────────────────────
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
  b600:  [29,  78,  216] as Rgb,
  b50:   [239, 246, 255] as Rgb,
  bLight:[219, 234, 254] as Rgb,
  // emerald / green
  e600:  [5,   150, 105] as Rgb,
  e50:   [236, 253, 245] as Rgb,
  eLight:[220, 252, 231] as Rgb,
  // amber
  a700:  [180, 83,  9]   as Rgb,
  a50:   [255, 251, 235] as Rgb,
  // white
  white: [255, 255, 255] as Rgb,
};

// ─── Footer (identical wording to log detail) ─────────────────────────────────
const FOOTER_TEXT =
  '© 2026 AA2000. All rights reserved. This document is an official record and must not be altered, modified, or tampered with in any way.';

// ─── Public interfaces ────────────────────────────────────────────────────────
export interface PerformanceCategoryForPdf {
  label: string;
  name: string;
  weightPct: number;
  avgPct: number | undefined; // 0..100
}

export interface QuarterPerformanceForPdf {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  count: number;
  finalScore: number | undefined; // 0..100
  categories: PerformanceCategoryForPdf[];
}

export interface PerformanceScorecardPdfOptions {
  employeeName: string;
  department: string;
  year: number;
  quarters: QuarterPerformanceForPdf[];
  logoDataUrl?: string;
}

export function getPerformanceScorecardPdfFilename(opts: PerformanceScorecardPdfOptions): string {
  const safe = (s: string) =>
    String(s || '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return `${safe(opts.employeeName)}_${safe(opts.department)}_${opts.year}_Performance_Scorecard.pdf`;
}

// ─── Page chrome (matches logDetailToPdf) ────────────────────────────────────
function drawPageBorder(pdf: jsPDF): void {
  const x = BORDER_INSET, y = BORDER_INSET;
  const w = PAGE_WIDTH  - 2 * BORDER_INSET;
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

// ─── Page helpers (mirrors logDetailToPdf) ────────────────────────────────────
function newPage(pdf: jsPDF): number {
  pdf.addPage();
  drawPageBorder(pdf);
  drawFooterOnPage(pdf);
  return MARGIN;
}

function checkY(pdf: jsPDF, y: number, needed: number): number {
  return y + needed > PAGE_HEIGHT - 18 ? newPage(pdf) : y;
}

// ─── Typography helpers (mirrors logDetailToPdf) ──────────────────────────────
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

// ─── Final Grade Block (identical layout to logDetailToPdf) ──────────────────
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

// ─── Category Breakdown (matches logDetailToPdf card style with accent bar + chips) ─
function drawCategoryBreakdown(pdf: jsPDF, y: number, categories: PerformanceCategoryForPdf[]): number {
  y = checkY(pdf, y, 20);
  y = sectionTitle(pdf, y, 'Category Breakdown');
  y = hRule(pdf, y);

  for (const cat of categories) {
    const avgDisplay = cat.avgPct == null || !Number.isFinite(cat.avgPct) ? null : Math.round(cat.avgPct);
    y = checkY(pdf, y, 14);

    // ── Category header row ─────────────────────────────────────────────────
    pdf.setFillColor(...C.s50);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, 11, 'F');
    pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.2);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, 11, 'S');
    // Left accent bar
    pdf.setFillColor(...C.b600);
    pdf.rect(MARGIN, y, 2.5, 11, 'F');
    // Category name
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.s900);
    pdf.text(String(cat.name ?? ''), MARGIN + 6, y + 7.5);

    // Weight chip
    const weightStr = `${Math.round(cat.weightPct)}% weight`;
    const wChipW    = pdf.getTextWidth(weightStr) + 7;
    const scoreGap  = avgDisplay != null ? 44 : 2;
    const wChipX    = PAGE_WIDTH - MARGIN - wChipW - scoreGap;
    pdf.setFillColor(...C.s100);
    pdf.roundedRect(wChipX, y + 2, wChipW, 7, 1, 1, 'F');
    pdf.setFontSize(7); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.s700);
    pdf.text(weightStr, wChipX + wChipW / 2, y + 7, { align: 'center' });

    // Avg score chip (green if quota met, blue otherwise)
    if (avgDisplay != null) {
      const scoreStr = `${avgDisplay}% avg`;
      const sChipW   = pdf.getTextWidth(scoreStr) + 7;
      const sChipX   = PAGE_WIDTH - MARGIN - sChipW;
      const isGood   = avgDisplay >= 90;
      pdf.setFillColor(...(isGood ? C.eLight : C.bLight));
      pdf.roundedRect(sChipX, y + 2, sChipW, 7, 1, 1, 'F');
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...(isGood ? C.e600 : C.b600));
      pdf.text(scoreStr, sChipX + sChipW / 2, y + 7, { align: 'center' });
    }

    y += 13;
  }

  return y + 3;
}

// ─── Score Computation Summary (mirrors logDetailToPdf exactly) ──────────────
function drawScoreComputationSummary(
  pdf: jsPDF,
  y: number,
  categories: PerformanceCategoryForPdf[],
  authoritiveFinalScore: number | undefined
): number {
  y = checkY(pdf, y, 10 + categories.length * 7 + 12);
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
  pdf.text('WEIGHT',       TC2,     y + 5, { align: 'right' });
  pdf.text('AVG SCORE',    TC3,     y + 5, { align: 'right' });
  pdf.text('CONTRIBUTION', TC4,     y + 5, { align: 'right' });
  y += 9;

  // Accumulate exact contributions to avoid rounding drift
  let grandTotalExact = 0;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const wp  = cat.weightPct ?? 0;
    const avg = cat.avgPct;

    // Weighted contribution = (avgPct / 100) * weightPct
    const exact: number | null =
      avg != null && Number.isFinite(avg) && wp
        ? (avg / 100) * wp
        : null;
    if (exact != null) grandTotalExact += exact;
    const display = exact != null ? Math.round(exact * 10) / 10 : null;

    if (i % 2 === 0) {
      pdf.setFillColor(...C.s50);
      pdf.rect(MARGIN, y - 1, CONTENT_WIDTH, 7, 'F');
    }

    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.s700);
    pdf.text(String(cat.name ?? ''), TC1 + 3, y + 4);

    pdf.text(wp ? `${Math.round(wp)}%` : '—', TC2, y + 4, { align: 'right' });

    const avgStr = avg != null && Number.isFinite(avg) ? `${Math.round(avg)}%` : '—';
    pdf.text(avgStr, TC3, y + 4, { align: 'right' });

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

  // Grand total row – use authoritative finalScore for consistency
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
export function downloadPerformanceScorecardPdf(opts: PerformanceScorecardPdfOptions): void {
  if (!opts || !opts.employeeName) throw new Error('Missing PDF options');

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  drawPageBorder(pdf);
  drawFooterOnPage(pdf);

  // ── Logo row (centred, same as logDetailToPdf) ────────────────────────────
  const logoRowH = 20;
  const logoMm   = 14;
  const logoX    = (PAGE_WIDTH - logoMm) / 2;
  const logoY    = BORDER_INSET + 2 + (logoRowH - logoMm) / 2;
  if (opts.logoDataUrl) {
    try { pdf.addImage(opts.logoDataUrl, 'PNG', logoX, logoY, logoMm, logoMm); }
    catch { drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm); }
  } else {
    drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm);
  }
  let y = BORDER_INSET + 2 + logoRowH;

  // ── Header block (same as logDetailToPdf: slate[50] bg, bottom rule, multi-colour title) ──
  const headerH = 24;
  pdf.setFillColor(...C.s50);
  pdf.rect(CONTENT_LEFT, y, CONTENT_BOX_WIDTH, headerH, 'F');
  pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.25);
  pdf.line(CONTENT_LEFT, y + headerH, CONTENT_LEFT + CONTENT_BOX_WIDTH, y + headerH);

  // Multi-colour wordmark: "AA2000 KPI Performance Scorecard"
  const tagline = 'AA2000 KPI Performance Scorecard';
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
  const xStart = PAGE_WIDTH / 2 - pdf.getTextWidth(tagline) / 2;
  pdf.setTextColor(30, 58, 138);                                 // navy "AA"
  pdf.text('AA', xStart, y + 9);
  pdf.setTextColor(...C.b600);                                   // brand blue "2000"
  pdf.text('2000', xStart + pdf.getTextWidth('AA'), y + 9);
  pdf.setTextColor(...C.s700);                                   // slate " KPI Performance Scorecard"
  pdf.text(' KPI Performance Scorecard', xStart + pdf.getTextWidth('AA2000'), y + 9);

  // Sub-line
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.s500);
  pdf.text(`Year: ${opts.year}`, MARGIN, y + 17);
  pdf.setFontSize(8);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_WIDTH - MARGIN - 52, y + 17);
  y += headerH + 6;

  // ── Employee Summary ──────────────────────────────────────────────────────
  y = sectionTitle(pdf, y, 'Employee Summary');
  y = hRule(pdf, y);
  y = keyValue(pdf, MARGIN, y, 'Employee',   opts.employeeName || '—', true)  + 1;
  y = keyValue(pdf, MARGIN, y, 'Department', opts.department   || '—', true)  + 4;

  // ── Per-quarter sections ──────────────────────────────────────────────────
  opts.quarters.forEach((q, index) => {
    if (index > 0) y += 14;
    y = checkY(pdf, y, 12);
    y = sectionTitle(pdf, y, `${q.quarter} Performance`);
    y = hRule(pdf, y);

    // No-data state (styled consistently with logDetailToPdf info blocks)
    if (!q.count || q.count === 0 || q.finalScore == null || !Number.isFinite(q.finalScore)) {
      y = checkY(pdf, y, 18);
      pdf.setFillColor(...C.b50);
      pdf.rect(MARGIN, y, CONTENT_WIDTH, 14, 'F');
      pdf.setDrawColor(...C.s200); pdf.setLineWidth(0.25);
      pdf.rect(MARGIN, y, CONTENT_WIDTH, 14, 'S');
      // Left accent bar
      pdf.setFillColor(...C.b600);
      pdf.rect(MARGIN, y, 2.5, 14, 'F');
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C.s700);
      pdf.text('No data recorded', MARGIN + 6, y + 9);
      pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C.s500);
      pdf.text('No validated audits found for this quarter.', MARGIN + 6, y + 12.5);
      y += 18;
      return;
    }

    // ── Final Assessment Grade ───────────────────────────────────────────
    y = checkY(pdf, y, 44);
    y = sectionTitle(pdf, y, 'Final Assessment Grade');
    y = hRule(pdf, y);
    y = drawFinalScoreBlock(pdf, y, Number(q.finalScore));

    // ── Category Breakdown ───────────────────────────────────────────────
    if (q.categories && q.categories.length > 0) {
      y = drawCategoryBreakdown(pdf, y, q.categories);

      // ── Score Computation Summary ──────────────────────────────────────
      y = drawScoreComputationSummary(pdf, y, q.categories, q.finalScore);
    }
  });

  // ── Apply border + footer to every page ──────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawPageBorder(pdf);
    drawFooterOnPage(pdf);
  }

  // ── Download via Blob + link (reliable) ──────────────────────────────────
  const filename = getPerformanceScorecardPdfFilename(opts);
  const blob     = pdf.output('blob') as Blob;
  const blobUrl  = URL.createObjectURL(blob);
  const link     = document.createElement('a');
  link.href      = blobUrl;
  link.download  = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(blobUrl); link.remove(); }, 0);
}
