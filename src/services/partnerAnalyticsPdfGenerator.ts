import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord, Partner } from '../types';
import {
  normalizePartnerName,
  getEffectivePartners,
  isExpensePaidByPartner,
} from '../utils/partnerBalanceUtils';

// ============================================================================
// FORMATTING HELPERS (CLEAN UNICODE / ASCII COMPATIBLE FOR JSPDF)
// Strictly avoids currency symbols (like ₹) that cause '¹' glyph corruption
// ============================================================================

export function formatIndianCurrency(amount: number): string {
  const isNegative = amount < 0;
  const num = Math.round(Math.abs(amount)) || 0;
  const formatted = num.toLocaleString('en-IN');
  const sign = isNegative ? '-' : '';
  return `Rs. ${sign}${formatted}`;
}

export function formatIndianNumber(num: number): string {
  const isNegative = num < 0;
  const rounded = Math.round(Math.abs(num)) || 0;
  const formatted = rounded.toLocaleString('en-IN');
  return isNegative ? `-${formatted}` : formatted;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface GroupedExpenseItem {
  name: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface PartnerAnalyticsPdfOptions {
  partnerName: string; // e.g. 'IRSHAD'
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  incomeRecords?: IncomeRecord[]; // Kept in interface for backward compatibility
  expenseRecords: ExpenseRecord[];
  partners?: Partner[];
}

// ============================================================================
// GROUPING ENGINE (CASE-INSENSITIVE DESCRIPTION AGGREGATION & STRICT NORMALIZATION)
// ============================================================================

/**
 * Normalizes an expense description according to the 3 specific partner grouping rules:
 * 1. VEGETABLES GROUP:
 *    Groups "VEGETABLES", "VEGETABLE", "VEGETABLE (1)", "VEGETABLE(1)", "VEGETABLE (2)", etc.
 *    into "VEGETABLES".
 * 2. CAKE GROUP:
 *    Groups cake-related descriptions ("CAKE", "CAKES", "WELCOME CAKE", "TEACHERS DAY CAKE",
 *    "BIRTHDAY CAKE", "BAASHA CAKE", "EXPRESS 2 CAKE", etc.) into "CAKE".
 * 3. DJ GROUP:
 *    Groups descriptions with "DJ" as a separate word ("DJ", "GET OUT DJ", "ART DJ",
 *    "BAASHA DJ", "DOODS DJ", "EXPRESS DJ", etc.) into "DJ".
 *    Does NOT group words like "DJANGO".
 * 4. ALL OTHER DESCRIPTIONS:
 *    Remain exactly as their own distinct normalized description (case-insensitive, trimmed).
 */
export function normalizePartnerExpenseDescription(rawDesc: string): string {
  const cleaned = rawDesc.trim().toUpperCase().replace(/\s+/g, ' ');

  // 1. VEGETABLES GROUP:
  // Matches "VEGETABLE", "VEGETABLES", "VEGETABLE (1)", "VEGETABLE(1)", "VEGETABLE (2)", etc.
  if (/^VEGETABLES?(\s*\(\s*\d+\s*\))?$/i.test(cleaned)) {
    return 'VEGETABLES';
  }

  // 2. CAKE GROUP:
  // Word-aware matching for "CAKE" or "CAKES"
  if (/\bCAKES?\b/i.test(cleaned)) {
    return 'CAKE';
  }

  // 3. DJ GROUP:
  // Word-aware matching for "DJ" as a standalone word (avoids "DJANGO", "ADJUST", etc.)
  if (/\bDJ\b/i.test(cleaned)) {
    return 'DJ';
  }

  // 4. All other descriptions remain distinct
  return cleaned;
}

/**
 * Groups all partner expenses by their normalized description/particulars.
 * - Trims whitespace
 * - Applies the 3 specific normalization rules: VEGETABLES, CAKE, DJ
 * - Case-insensitive grouping for all other items
 * - Does NOT merge distinct items ("CHICKEN GRAVY" vs "CHICKEN" remain separate)
 * - Verifies sum(grouped) === sum(transactions)
 * - Sorts descending by total amount
 * - Strictly NO "OTHER EXPENSES" or catch-all categories. Every unique description
 *   appears as its own individual row.
 */
export function groupPartnerExpenses(
  expenses: ExpenseRecord[],
  totalExpense: number
): GroupedExpenseItem[] {
  const map = new Map<string, { name: string; amount: number; count: number }>();

  for (const exp of expenses) {
    const rawDesc = (exp.description || exp.name || exp.category || 'EXPENSE').trim();
    // Normalize key using strict partner normalization rules
    const normKey = normalizePartnerExpenseDescription(rawDesc);

    const existing = map.get(normKey);
    const amount = Number(exp.amount) || 0;

    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(normKey, {
        name: normKey,
        amount,
        count: 1,
      });
    }
  }

  // Convert map to array with individual share percentages
  const allGrouped = Array.from(map.values()).map((item) => {
    const pct = totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0;
    return {
      name: item.name,
      amount: item.amount,
      percentage: Math.round(pct * 10) / 10,
      count: item.count,
    };
  });

  // Sort descending by amount (largest expense first)
  allGrouped.sort((a, b) => b.amount - a.amount);

  // Programmatic verification: Sum of all grouped amounts must match totalExpense
  const totalGroupedRaw = allGrouped.reduce((acc, it) => acc + it.amount, 0);
  if (Math.abs(totalGroupedRaw - totalExpense) > 0.01) {
    console.error(
      `[GroupPartnerExpenses] Discrepancy detected: Grouped sum (${totalGroupedRaw}) != Total expense (${totalExpense})`
    );
  }

  // Return ALL individually named grouped descriptions without any omitting or "OTHER" grouping
  return allGrouped;
}

// ============================================================================
// PARTNER EXPENSE PDF GENERATOR
// ============================================================================

export async function generatePartnerAnalyticsPDF(
  options: PartnerAnalyticsPdfOptions
): Promise<void> {
  const {
    partnerName,
    dateRangeLabel,
    startDate,
    endDate,
    expenseRecords,
    partners = [],
  } = options;

  const normPartner = normalizePartnerName(partnerName);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182 mm

  const now = new Date();
  const generatedTimeStr =
    now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ', ' +
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Effective partners and ID mapping for robust partner expense matching
  const effectivePartners = getEffectivePartners(partners, [], expenseRecords);
  const idToNameMap = new Map<string, string>();
  effectivePartners.forEach((p) => {
    if (p.id) {
      idToNameMap.set(String(p.id).trim().toUpperCase(), p.name);
    }
  });

  const partnerObj = effectivePartners.find((p) => p.name === normPartner);
  const targetPartnerId = partnerObj?.id;

  // --------------------------------------------------------------------------
  // 1. FILTER EXPENSES CHRONOLOGICALLY FOR THIS PARTNER & PERIOD
  // --------------------------------------------------------------------------
  const partnerExpenses = expenseRecords.filter((r) => {
    if (!r.date || r.date < startDate || r.date > endDate) return false;
    return isExpensePaidByPartner(r, normPartner, targetPartnerId, idToNameMap);
  });

  // Calculate authoritative total
  let totalExpense = 0;
  for (const exp of partnerExpenses) {
    totalExpense += Number(exp.amount) || 0;
  }

  // --------------------------------------------------------------------------
  // 2. GROUP EXPENSES BY DESCRIPTION
  // --------------------------------------------------------------------------
  const groupedExpenses = groupPartnerExpenses(partnerExpenses, totalExpense);

  // Verification check: ensure grouped amounts sum up to totalExpense
  const totalGroupedAmount = groupedExpenses.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(totalGroupedAmount - totalExpense) > 0.01) {
    throw new Error(
      `Integrity check failed: Grouped sum (Rs. ${totalGroupedAmount}) does not match total expense (Rs. ${totalExpense})`
    );
  }

  // --------------------------------------------------------------------------
  // 3. HEADER DRAWING FUNCTION (Multi-page safe with duplicate prevention)
  // --------------------------------------------------------------------------
  const drawnHeaders = new Set<number>();
  const drawPageHeader = (pageNumber: number) => {
    if (drawnHeaders.has(pageNumber)) return;
    drawnHeaders.add(pageNumber);
    doc.setPage(pageNumber);

    if (pageNumber === 1) {
      // Page 1 Header Banner (24mm)
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 23.2, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(242, 201, 76);
      doc.text('MAGNIFIQUE 2.0', margin, 11.5);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(210, 210, 210);
      doc.text(`${normPartner} EXPENSE REPORT`, margin, 18);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Generated: ${generatedTimeStr}`, pageWidth - margin, 11.5, { align: 'right' });
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 18, { align: 'right' });
    } else {
      // Subsequent Pages Header Banner (18mm)
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 17.2, pageWidth, 1.0, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(242, 201, 76);
      doc.text('MAGNIFIQUE 2.0', margin, 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(200, 200, 200);
      doc.text(`- ${normPartner} EXPENSE REPORT`, margin + 42, 10);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 10, { align: 'right' });
    }
  };

  // Draw Page 1 header initially
  drawPageHeader(1);

  // Content begins safely below Page 1 gold divider line (ends at 24.4mm)
  let curY = 28.5;

  // ==========================================================================
  // SECTION: SUMMARY CARD (TOTAL IRSHAD EXPENSE)
  // ==========================================================================
  const summaryCardH = 17;
  doc.setFillColor(255, 241, 242); // Rose-50
  doc.setDrawColor(254, 205, 211); // Rose-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, summaryCardH, 2, 2, 'FD');

  // Accent bar on left
  doc.setFillColor(244, 63, 94); // Rose-500
  doc.rect(margin, curY, 2.5, summaryCardH, 'F');

  // Card Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(159, 18, 57);
  doc.text(`TOTAL ${normPartner} EXPENSE`, margin + 6, curY + 5.5);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total expenses paid by ${normPartner}`, margin + 6, curY + 12.0);

  // Value
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(225, 29, 72);
  doc.text(
    `Rs. ${formatIndianNumber(totalExpense)}`,
    pageWidth - margin - 6,
    curY + 10.5,
    { align: 'right' }
  );

  curY += summaryCardH + 5.5;

  // ==========================================================================
  // SECTION: GROUPED EXPENSES TABLE
  // ==========================================================================
  // Section Title
  doc.setFillColor(244, 63, 94); // Rose bullet
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`EXPENSE BREAKDOWN BY PARTICULARS / DESCRIPTION`, margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${groupedExpenses.length} Unique Categories • Total: ${formatIndianCurrency(totalExpense)}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 5.0;

  // Prepare table rows
  const tableRows =
    groupedExpenses.length > 0
      ? groupedExpenses.map((item, idx) => [
          String(idx + 1),
          item.name,
          formatIndianCurrency(item.amount),
          `${item.percentage.toFixed(1)}%`,
        ])
      : [
          [
            '-',
            `No expenses recorded for ${normPartner} in this period`,
            'Rs. 0',
            '0.0%',
          ],
        ];

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, top: 24.5, bottom: 14 },
    showHead: 'everyPage',
    showFoot: 'lastPage',
    head: [['#', 'EXPENSE ITEM', 'TOTAL AMOUNT (INR)', 'SHARE (%)']],
    body: tableRows,
    foot: [
      [
        '',
        `TOTAL ${normPartner} EXPENSE`,
        formatIndianCurrency(totalExpense),
        '100.0%',
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2.0, right: 2.0 },
      minCellHeight: 5.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 1.6, bottom: 1.6, left: 2.0, right: 2.0 },
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 1.6, bottom: 1.6, left: 2.0, right: 2.0 },
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      drawPageHeader(data.pageNumber);
    },
  });

  // ==========================================================================
  // FOOTER (ON EVERY PAGE)
  // ==========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `MAGNIFIQUE 2.0 - ${normPartner} EXPENSE REPORT`,
      margin,
      pageHeight - 6.5
    );

    doc.text('CONFIDENTIAL FINANCIAL STATEMENT', pageWidth / 2, pageHeight - 6.5, {
      align: 'center',
    });

    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, {
      align: 'right',
    });
  }

  // Safe file name
  const cleanPartner = normPartner.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeStart = startDate ? startDate.replace(/[^0-9]/g, '') : '';
  const safeEnd = endDate ? endDate.replace(/[^0-9]/g, '') : '';
  const fileName =
    safeStart && safeEnd
      ? `Magnifique_${cleanPartner}_Expense_Report_${safeStart}_to_${safeEnd}.pdf`
      : `Magnifique_${cleanPartner}_Expense_Report.pdf`;

  // Cross-platform PDF download (Desktop, iOS Safari, Android Chrome)
  try {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    if (isIOS) {
      link.target = '_blank';
    }
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1200);
  } catch {
    doc.save(fileName);
  }
}
