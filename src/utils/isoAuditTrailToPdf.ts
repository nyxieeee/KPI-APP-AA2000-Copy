import { jsPDF } from 'jspdf';
import type { AuditEntry } from '../types';
import { drawAppLogoFallback, getAppLogoDataUrl } from './pdfCommon';

const BORDER_INSET = 8;
const MARGIN = 20;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const colors = {
  slate: {
    900: [15, 23, 42] as [number, number, number],
    800: [30, 41, 59] as [number, number, number],
    700: [51, 65, 85] as [number, number, number],
    500: [100, 116, 139] as [number, number, number],
    300: [203, 213, 225] as [number, number, number],
    200: [226, 232, 240] as [number, number, number],
    100: [241, 245, 249] as [number, number, number],
    50: [248, 250, 252] as [number, number, number],
  },
  blue: { 600: [29, 78, 216] as [number, number, number], 50: [239, 246, 255] as [number, number, number] },
  emerald: { 600: [5, 150, 105] as [number, number, number], 50: [236, 253, 245] as [number, number, number] },
  red: { 600: [220, 38, 38] as [number, number, number], 50: [254, 242, 242] as [number, number, number] },
  amber: { 600: [217, 119, 6] as [number, number, number], 50: [255, 251, 235] as [number, number, number] },
};

const FOOTER_TEXT =
  '© 2026 AA2000. All rights reserved. This document is an official record and must not be altered, modified, or tampered with in any way.';

function drawPageBorder(pdf: jsPDF) {
  const x = BORDER_INSET;
  const y = BORDER_INSET;
  const w = PAGE_WIDTH - 2 * BORDER_INSET;
  const h = PAGE_HEIGHT - 2 * BORDER_INSET;
  pdf.setDrawColor(...colors.slate[300]);
  pdf.setLineWidth(0.4);
  pdf.rect(x, y, w, h);
  pdf.setDrawColor(...colors.slate[200]);
  pdf.setLineWidth(0.2);
  pdf.rect(x + 2, y + 2, w - 4, h - 4);
}

function drawFooterOnPage(pdf: jsPDF) {
  const footerY = PAGE_HEIGHT - 12;
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.slate[500]);
  pdf.text(FOOTER_TEXT, PAGE_WIDTH / 2, footerY, { align: 'center' });
}

function addSectionTitle(pdf: jsPDF, y: number, title: string): number {
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.slate[700]);
  pdf.text(title.toUpperCase(), MARGIN, y);
  return y + 6;
}

function addLine(pdf: jsPDF, y: number): number {
  pdf.setDrawColor(...colors.slate[200]);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 5;
}

function addKeyValueRow(
  pdf: jsPDF,
  y: number,
  key: string,
  value: string,
  isValueBold = false
): number {
  // Label at left, value wraps on the right.
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.slate[500]);
  pdf.text(key, MARGIN, y);
  pdf.setFont('helvetica', isValueBold ? 'bold' : 'normal');
  pdf.setTextColor(...colors.slate[900]);
  const xValue = MARGIN + 50;
  const maxTextWidth = CONTENT_WIDTH - (xValue - MARGIN) - 2;
  const lines = pdf.splitTextToSize(String(value ?? ''), maxTextWidth);
  pdf.text(lines, xValue, y);
  return y + Math.max(1, lines.length) * 4 + 2;
}

function ensureSpace(pdf: jsPDF, y: number, requiredH: number): number {
  if (y + requiredH <= PAGE_HEIGHT - 18) return y;
  pdf.addPage();
  drawPageBorder(pdf);
  drawFooterOnPage(pdf);
  return MARGIN;
}

function getAuditEntryTheme(type: AuditEntry['type']) {
  switch (type) {
    case 'OK':
      return { fill: colors.emerald[50], bar: colors.emerald[600] };
    case 'WARN':
      return { fill: colors.amber[50], bar: colors.amber[600] };
    case 'INFO':
    default:
      return { fill: colors.blue[50], bar: colors.blue[600] };
  }
}

export async function downloadIsoAuditTrailPdf(opts: {
  auditLogs: AuditEntry[];
  authorizingAdmin: string;
  filename?: string;
  generatedAt?: Date;
  filtersLabel?: string;
}): Promise<void> {
  const { auditLogs, authorizingAdmin, filename, filtersLabel } = opts;
  const generatedAt = opts.generatedAt ?? new Date();

  const pdf = new jsPDF('p', 'mm', 'a4');
  drawPageBorder(pdf);

  // Logo row (like log-detail PDF)
  const logoRowH = 20;
  const logoMm = 14;
  const logoX = (PAGE_WIDTH - logoMm) / 2;
  const logoY = BORDER_INSET + 2 + (logoRowH - logoMm) / 2;
  let y = BORDER_INSET + 2 + logoRowH;

  let logoDataUrl: string | undefined;
  try {
    logoDataUrl = await getAppLogoDataUrl();
  } catch {
    logoDataUrl = undefined;
  }
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, 'PNG', logoX, logoY, logoMm, logoMm);
    } catch {
      drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm);
    }
  } else {
    drawAppLogoFallback(pdf, logoX + logoMm / 2, logoY + logoMm / 2, logoMm);
  }

  // Header block
  const headerH = 24;
  const contentLeft = BORDER_INSET + 2;
  const contentWidth = PAGE_WIDTH - 2 * BORDER_INSET - 4;
  pdf.setFillColor(...colors.slate[50]);
  pdf.rect(contentLeft, y, contentWidth, headerH, 'F');
  pdf.setDrawColor(...colors.slate[200]);
  pdf.setLineWidth(0.25);
  pdf.line(contentLeft, y + headerH, contentLeft + contentWidth, y + headerH);

  const tagline = 'AA2000 Audit Trail Report';
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 58, 138);
  const xStart = PAGE_WIDTH / 2 - pdf.getTextWidth(tagline) / 2;
  pdf.text(tagline, xStart, y + 9);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.slate[500]);
  pdf.text(`Date Generated: ${generatedAt.toLocaleString()}`, MARGIN, y + 17);
  pdf.text(`Authorizing Admin: ${authorizingAdmin}`, PAGE_WIDTH - MARGIN - 90, y + 17);

  y += headerH + 6;
  // Simple colored table layout (instead of sectioned key/value blocks)
  const TABLE_X = MARGIN;
  const TABLE_W = CONTENT_WIDTH;
  const lineH = 4;
  const cellPadY = 2;
  const cellBorder = colors.slate[200];
  const headerFill = colors.slate[50];
  const headerText = colors.slate[700];

  // Column widths (must sum to TABLE_W). Details column gets the remainder.
  const colEntryW = 18;
  const colTypeW = 16;
  const colTimeW = 34;
  const colActionW = 26;
  const colOperatorW = 24;
  const colDetailsW = TABLE_W - (colEntryW + colTypeW + colTimeW + colActionW + colOperatorW);

  const colX = {
    entry: TABLE_X,
    type: TABLE_X + colEntryW,
    time: TABLE_X + colEntryW + colTypeW,
    action: TABLE_X + colEntryW + colTypeW + colTimeW,
    operator: TABLE_X + colEntryW + colTypeW + colTimeW + colActionW,
    details: TABLE_X + colEntryW + colTypeW + colTimeW + colActionW + colOperatorW,
  };

  const split = (text: string, width: number) => pdf.splitTextToSize(String(text ?? ''), width);

  const drawScopeRow = (scope: string, y0: number) => {
    const h = 10;
    pdf.setFillColor(...headerFill);
    pdf.rect(TABLE_X, y0, TABLE_W, h, 'F');
    pdf.setDrawColor(...cellBorder);
    pdf.setLineWidth(0.25);
    pdf.rect(TABLE_X, y0, TABLE_W, h, 'S');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...headerText);
    pdf.text('Scope', TABLE_X + 2, y0 + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.slate[900]);
    const scopeLines = split(scope, TABLE_W - 18);
    pdf.text(scopeLines.slice(0, 1), TABLE_X + 22, y0 + 6);
    return y0 + h + 2;
  };

  const drawTableHeader = (y0: number) => {
    const h = 10;
    pdf.setFillColor(...headerFill);
    pdf.rect(TABLE_X, y0, TABLE_W, h, 'F');
    pdf.setDrawColor(...cellBorder);
    pdf.setLineWidth(0.25);
    pdf.rect(TABLE_X, y0, TABLE_W, h, 'S');

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...headerText);
    pdf.text('ENTRY', colX.entry + 2, y0 + 6);
    pdf.text('TYPE', colX.type + 2, y0 + 6);
    pdf.text('TIMESTAMP', colX.time + 1.5, y0 + 6);
    pdf.text('ACTION', colX.action + 1.5, y0 + 6);
    pdf.text('OPERATOR', colX.operator + 1.5, y0 + 6);
    pdf.text('DETAILS', colX.details + 1.5, y0 + 6);
    return y0 + h + 2;
  };

  const drawRow = (log: AuditEntry, idx: number, y0: number) => {
    const theme = getAuditEntryTheme(log.type);

    const detailsW = colDetailsW - 4;
    const timeLines = split(new Date(log.timestamp).toLocaleString(), colTimeW - 4);
    const actionLines = split(log.action, colActionW - 4);
    const operatorLines = split(log.user, colOperatorW - 4);
    const detailsLines = split(log.details, detailsW);

    const maxLines = Math.max(1, timeLines.length, actionLines.length, operatorLines.length, detailsLines.length);
    const rowH = cellPadY + maxLines * lineH + cellPadY;

    pdf.setFillColor(...theme.fill);
    pdf.rect(TABLE_X, y0, TABLE_W, rowH, 'F');
    pdf.setDrawColor(...cellBorder);
    pdf.setLineWidth(0.25);
    pdf.rect(TABLE_X, y0, TABLE_W, rowH, 'S');

    // vertical grid lines
    const xLines = [colX.type, colX.time, colX.action, colX.operator, colX.details];
    pdf.setDrawColor(...cellBorder);
    pdf.setLineWidth(0.15);
    xLines.forEach((x) => pdf.line(x, y0, x, y0 + rowH));

    pdf.setFontSize(7);
    pdf.setTextColor(...colors.slate[900]);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`#${idx + 1}`, colX.entry + 2, y0 + cellPadY + lineH);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(log.type ?? ''), colX.type + 2, y0 + cellPadY + lineH);

    pdf.setFont('helvetica', 'normal');
    const startY = y0 + cellPadY;

    // Timestamp
    timeLines.forEach((l, i) => pdf.text(l, colX.time + 1.5, startY + (i + 1) * lineH));
    // Action
    actionLines.forEach((l, i) => pdf.text(l, colX.action + 1.5, startY + (i + 1) * lineH));
    // Operator
    operatorLines.forEach((l, i) => pdf.text(l, colX.operator + 1.5, startY + (i + 1) * lineH));
    // Details
    detailsLines.forEach((l, i) => pdf.text(l, colX.details + 1.5, startY + (i + 1) * lineH));

    return y0 + rowH + 2;
  };

  if (filtersLabel) {
    y = drawScopeRow(filtersLabel, y);
  }

  y = drawTableHeader(y);

  auditLogs.forEach((log, idx) => {
    // Pre-calc row height by splitting details only (good enough for pagination guard).
    // For perfect row height we draw again, but ensureSpace is only used to avoid clipping.
    const theme = getAuditEntryTheme(log.type);
    const detailsLines = split(log.details, colDetailsW - 4);
    const rowHApprox = cellPadY + Math.max(1, detailsLines.length) * lineH + cellPadY;

    const pageBefore = pdf.getNumberOfPages();
    y = ensureSpace(pdf, y, rowHApprox + 2);

    if (pdf.getNumberOfPages() > pageBefore) {
      y = drawTableHeader(y);
    }

    // draw full row (includes timestamp/action/operator/details wrapping)
    y = drawRow(log, idx, y);
  });

  // footer on every page
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    drawFooterOnPage(pdf);
  }

  const safe = (s: string) => String(s || '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const downloadName =
    filename ||
    `AA2000_AuditLog_${safe(authorizingAdmin)}_${generatedAt.toISOString().slice(0, 10)}.pdf`;

  try {
    pdf.save(downloadName);
  } catch {
    pdf.save(downloadName);
  }
}

