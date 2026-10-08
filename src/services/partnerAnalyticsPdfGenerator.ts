import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord, Partner } from '../types';
import { formatDisplayDate } from '../utils/formatters';
import {
  normalizePartnerName,
  getEffectivePartners,
  isExpensePaidByPartner,
  isIncomeAssignedToPartner,
} from '../utils/partnerBalanceUtils';
import { getExpenseAccountingMonth } from '../utils/accountBalanceUtils';

// ============================================================================
// FORMATTING HELPERS (CLEAN UNICODE / ASCII COMPATIBLE FOR JSPDF)
// Strictly avoids currency symbols (like ₹) that cause glyph corruption
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

export type PartnerReportType = 'EXPENSE' | 'INCOME' | 'INCOME + EXPENSE';

export interface GroupedExpenseItem {
  name: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface PartnerAnalyticsPdfOptions {
  partnerName: string; // e.g. 'IRSHAD', 'ANSARI', etc.
  reportType?: PartnerReportType; // 'EXPENSE' | 'INCOME' | 'INCOME + EXPENSE'
  accountingMonth?: string; // e.g. '2026-09' or '2026-10'
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  incomeRecords?: IncomeRecord[];
  expenseRecords?: ExpenseRecord[];
  partners?: Partner[];
}

// ============================================================================
// GROUPING ENGINE (CASE-INSENSITIVE DESCRIPTION AGGREGATION & STRICT NORMALIZATION)
// ============================================================================

/**
 * Normalizes an expense description according to partner grouping rules:
 * 1. VEGETABLES GROUP -> "VEGETABLES"
 * 2. CAKE GROUP -> "CAKE"
 * 3. DJ GROUP -> "DJ"
 * 4. ALL OTHER DESCRIPTIONS -> distinct normalized description
 */
export function normalizePartnerExpenseDescription(rawDesc: string): string {
  const cleaned = rawDesc.trim().toUpperCase().replace(/\s+/g, ' ');

  if (/^VEGETABLES?(\s*\(\s*\d+\s*\))?$/i.test(cleaned)) {
    return 'VEGETABLES';
  }
  if (/\bCAKES?\b/i.test(cleaned)) {
    return 'CAKE';
  }
  if (/\bDJ\b/i.test(cleaned)) {
    return 'DJ';
  }
  return cleaned;
}

/**
 * Groups all partner expenses by their normalized description/particulars.
 */
export function groupPartnerExpenses(
  expenses: ExpenseRecord[],
  totalExpense: number
): GroupedExpenseItem[] {
  const map = new Map<string, { name: string; amount: number; count: number }>();

  for (const exp of expenses) {
    const rawDesc = (exp.description || exp.name || exp.category || 'EXPENSE').trim();
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

  const allGrouped = Array.from(map.values()).map((item) => {
    const pct = totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0;
    return {
      name: item.name,
      amount: item.amount,
      percentage: Math.round(pct * 10) / 10,
      count: item.count,
    };
  });

  allGrouped.sort((a, b) => b.amount - a.amount);
  return allGrouped;
}

// ============================================================================
// FULLY PAID INCOME HELPER FOR HOTEL
// ============================================================================

export function isFullyPaidIncome(r: IncomeRecord): boolean {
  const status = String(r.paymentStatus || (r as any).payment_status || '').toLowerCase().trim();
  const isPaidFullStatus = status === 'paid full' || status === 'paid_full';

  const total = Number(r.total ?? (r as any).total_amount) || 0;
  const received = Number(r.amountPaid ?? (r as any).amount_received) || 0;
  const balance = Number(r.balance ?? (r as any).balance_amount) || 0;

  if (isPaidFullStatus && balance <= 0) {
    return true;
  }

  if (total > 0 && received >= total && balance <= 0) {
    return true;
  }

  if (isPaidFullStatus && total > 0 && received >= total) {
    return true;
  }

  return false;
}

// ============================================================================
// OTHER INCOME HELPER (DYNAMIC NON-PARTNER BY_WHO EXTRACTION)
// ============================================================================

const FIVE_OFFICIAL_PARTNERS = new Set([
  'IRSHAD',
  'ANSARI',
  'MUSADDIQ',
  'MUSSADDIQ',
  'SATHISH',
  'YOGESH',
]);

/**
 * Checks if an income entry belongs to 'OTHER':
 * - Received from a person/source who is NOT one of the five partners
 * - Determined dynamically from income_entries.by_who (trimmed, case-insensitive)
 * - Only includes fully paid income entries
 */
export function isOtherIncomeRecord(r: IncomeRecord): boolean {
  if (!isFullyPaidIncome(r)) return false;

  const rawByWho = String((r as any).by_who ?? r.byWho ?? '').trim();
  if (!rawByWho) return false;

  const upper = rawByWho.toUpperCase();
  if (upper === 'À LA CARTE' || upper === 'A LA CARTE') return false;

  const norm = normalizePartnerName(upper);
  return !FIVE_OFFICIAL_PARTNERS.has(norm);
}

// ============================================================================
// UNIVERSAL PARTNER ANALYTICS PDF GENERATOR
// ============================================================================

export async function generatePartnerAnalyticsPDF(
  options: PartnerAnalyticsPdfOptions
): Promise<void> {
  const {
    partnerName,
    reportType = 'EXPENSE',
    accountingMonth,
    dateRangeLabel,
    startDate,
    endDate,
    incomeRecords = [],
    expenseRecords = [],
    partners = [],
  } = options;

  const normPartner = normalizePartnerName(partnerName);
  const isHotel = normPartner === 'HOTEL';
  const isOther = normPartner === 'OTHER';
  const targetMonth = accountingMonth || startDate.substring(0, 7);

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
    formatDisplayDate(now) +
    ', ' +
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Effective partners and ID mapping for robust partner transaction matching
  const effectivePartners = getEffectivePartners(partners, incomeRecords, expenseRecords);
  const idToNameMap = new Map<string, string>();
  effectivePartners.forEach((p) => {
    if (p.id) {
      idToNameMap.set(String(p.id).trim().toUpperCase(), p.name);
    }
  });

  const partnerObj = effectivePartners.find((p) => p.name === normPartner);
  const targetPartnerId = partnerObj?.id;

  // --------------------------------------------------------------------------
  // 1. FILTER DATA CHRONOLOGICALLY FOR THIS PARTNER / HOTEL / OTHER & MONTH
  // --------------------------------------------------------------------------
  const partnerExpenses = expenseRecords.filter((r) => {
    const accMonth = getExpenseAccountingMonth(r);
    const dateMatch = accMonth ? accMonth === targetMonth : (r.date && r.date >= startDate && r.date <= endDate);
    if (!dateMatch) return false;
    return isExpensePaidByPartner(r, normPartner, targetPartnerId, idToNameMap);
  });

  let totalExpense = 0;
  for (const exp of partnerExpenses) {
    totalExpense += Number(exp.amount) || 0;
  }

  const partnerIncomes = incomeRecords.filter((r) => {
    if (!r.date || r.date < startDate || r.date > endDate) return false;
    if (isHotel) {
      return isFullyPaidIncome(r);
    }
    if (isOther) {
      return isOtherIncomeRecord(r);
    }
    return isIncomeAssignedToPartner(r, normPartner, targetPartnerId, idToNameMap);
  });

  // Sort income records chronologically from first day to last day (ascending by actual underlying date)
  // specifically for Partner Analytics -> Income -> Download PDF.
  // Preserves descending order for Expense reports, Other Income reports, etc.
  if (reportType === 'INCOME' && !isOther) {
    partnerIncomes.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      const timeA = a.time || '';
      const timeB = b.time || '';
      if (timeA && timeB && timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      const createdA = a.created_at || '';
      const createdB = b.created_at || '';
      if (createdA && createdB && createdA !== createdB) {
        return createdA.localeCompare(createdB);
      }
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  let totalIncomeBilled = 0;
  let totalIncomeReceived = 0;
  let totalIncomeBalance = 0;
  for (const inc of partnerIncomes) {
    const billed = Number(inc.total) || 0;
    const received = Number(inc.amountPaid) || (isHotel || isOther ? billed : 0);
    const bal = isHotel || isOther ? 0 : (Number(inc.balance) || 0);
    totalIncomeBilled += billed;
    totalIncomeReceived += received;
    totalIncomeBalance += bal;
  }

  const groupedExpenses = groupPartnerExpenses(partnerExpenses, totalExpense);

  // --------------------------------------------------------------------------
  // 2. HEADER DRAWING FUNCTION (Multi-page safe)
  // --------------------------------------------------------------------------
  let reportTitle = isHotel ? 'HOTEL EXPENSE REPORT' : isOther ? 'OTHER EXPENSE REPORT' : `${normPartner} EXPENSE REPORT`;
  if (reportType === 'INCOME') {
    reportTitle = isHotel
      ? 'HOTEL FULLY PAID INCOME REPORT'
      : isOther
      ? 'OTHER FULLY PAID INCOME REPORT'
      : `${normPartner} INCOME REPORT`;
  } else if (reportType === 'INCOME + EXPENSE') {
    reportTitle = isHotel
      ? 'HOTEL INCOME & EXPENSE REPORT'
      : isOther
      ? 'OTHER INCOME & EXPENSE REPORT'
      : `${normPartner} INCOME & EXPENSE REPORT`;
  }

  const drawnHeaders = new Set<number>();
  const drawPageHeader = (pageNumber: number) => {
    if (drawnHeaders.has(pageNumber)) return;
    drawnHeaders.add(pageNumber);
    doc.setPage(pageNumber);

    if (pageNumber === 1) {
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
      doc.text(reportTitle, margin, 18);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Generated: ${generatedTimeStr}`, pageWidth - margin, 11.5, { align: 'right' });
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 18, { align: 'right' });
    } else {
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
      doc.text(`- ${reportTitle}`, margin + 42, 10);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 10, { align: 'right' });
    }
  };

  drawPageHeader(1);
  let curY = 28.5;

  // ==========================================================================
  // CASE 1: EXPENSE REPORT ONLY
  // ==========================================================================
  if (reportType === 'EXPENSE') {
    // Summary Card
    const summaryCardH = 17;
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, curY, contentWidth, summaryCardH, 2, 2, 'FD');

    doc.setFillColor(244, 63, 94);
    doc.rect(margin, curY, 2.5, summaryCardH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(159, 18, 57);
    doc.text(
      isHotel ? 'TOTAL HOTEL EXPENSE' : isOther ? 'TOTAL OTHER EXPENSE' : `TOTAL ${normPartner} EXPENSE`,
      margin + 6,
      curY + 5.5
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      isHotel
        ? 'Total expenses paid by HOTEL'
        : isOther
        ? 'Total expenses paid by OTHER'
        : `Total expenses paid by ${normPartner}`,
      margin + 6,
      curY + 12.0
    );

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

    // Table Header Info
    doc.setFillColor(244, 63, 94);
    doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isHotel
        ? 'HOTEL EXPENSE BREAKDOWN BY PARTICULARS'
        : isOther
        ? 'OTHER EXPENSE BREAKDOWN BY PARTICULARS'
        : 'EXPENSE BREAKDOWN BY PARTICULARS / DESCRIPTION',
      margin + 5,
      curY + 2.5
    );

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
              isHotel
                ? 'No expenses recorded for HOTEL in this period'
                : isOther
                ? 'No expenses recorded for OTHER in this period'
                : `No expenses recorded for ${normPartner} in this period`,
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
          isHotel ? 'TOTAL HOTEL EXPENSE' : isOther ? 'TOTAL OTHER EXPENSE' : `TOTAL ${normPartner} EXPENSE`,
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
  }

  // ==========================================================================
  // CASE 2: INCOME REPORT ONLY
  // ==========================================================================
  else if (reportType === 'INCOME') {
    const summaryCardH = 17;
    doc.setFillColor(240, 253, 244); // Emerald-50
    doc.setDrawColor(187, 247, 208); // Emerald-200
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, curY, contentWidth, summaryCardH, 2, 2, 'FD');

    doc.setFillColor(34, 197, 94); // Emerald-500
    doc.rect(margin, curY, 2.5, summaryCardH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(20, 83, 45);
    doc.text(
      isHotel
        ? 'TOTAL HOTEL INCOME'
        : isOther
        ? 'TOTAL OTHER INCOME'
        : `TOTAL ${normPartner} INCOME BALANCE ASSIGNED`,
      margin + 6,
      curY + 5.5
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      isHotel
        ? 'Total fully paid income received by Hotel'
        : isOther
        ? 'Total fully paid income from non-partner sources'
        : `Billed: ${formatIndianCurrency(totalIncomeBilled)}  |  Received: ${formatIndianCurrency(totalIncomeReceived)}`,
      margin + 6,
      curY + 12.0
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(22, 101, 52);
    doc.text(
      `Rs. ${formatIndianNumber(isHotel || isOther ? totalIncomeBilled : totalIncomeBalance)}`,
      pageWidth - margin - 6,
      curY + 10.5,
      { align: 'right' }
    );

    curY += summaryCardH + 5.5;

    // Section Header
    doc.setFillColor(34, 197, 94);
    doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isHotel
        ? 'FULLY PAID INCOME RECEIVED BY HOTEL'
        : isOther
        ? 'FULLY PAID INCOME FROM OTHER SOURCES'
        : `INCOME RECORDS ASSIGNED TO ${normPartner}`,
      margin + 5,
      curY + 2.5
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      isHotel || isOther
        ? `${partnerIncomes.length} Entries • Total Received: ${formatIndianCurrency(totalIncomeReceived)}`
        : `${partnerIncomes.length} Entries • Total Balance: ${formatIndianCurrency(totalIncomeBalance)}`,
      pageWidth - margin,
      curY + 2.5,
      { align: 'right' }
    );

    curY += 5.0;

    const incomeRows =
      partnerIncomes.length > 0
        ? partnerIncomes.map((item, idx) => {
            const rawBy = (item.byWho || (item as any).by_who || '').trim();
            const particulars = item.travels
              ? (rawBy ? `${item.travels} (${rawBy})` : item.travels)
              : (rawBy ? `By ${rawBy}` : (item.incomeType || 'Direct'));
            const itemBilled = Number(item.total) || 0;
            const itemReceived = Number(item.amountPaid) || (isHotel || isOther ? itemBilled : 0);
            const itemBal = isHotel || isOther ? 0 : (Number(item.balance) || 0);
            return [
              String(idx + 1),
              formatDisplayDate(item.date) || '',
              particulars,
              formatIndianCurrency(itemBilled),
              formatIndianCurrency(itemReceived),
              formatIndianCurrency(itemBal),
            ];
          })
        : [
            [
              '-',
              '-',
              isHotel
                ? 'No fully paid income records in this period'
                : isOther
                ? 'No fully paid income records from other sources in this period'
                : `No income records assigned to ${normPartner} in this period`,
              'Rs. 0',
              'Rs. 0',
              'Rs. 0',
            ],
          ];

    autoTable(doc, {
      startY: curY,
      margin: { left: margin, right: margin, top: 24.5, bottom: 14 },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      head: [[
        '#',
        'DATE',
        'PARTICULARS / CUSTOMER',
        'BILLED (INR)',
        'RECEIVED (INR)',
        isHotel || isOther ? 'BALANCE (INR)' : 'BALANCE ASSIGNED (INR)',
      ]],
      body: incomeRows,
      foot: [
        [
          '',
          '',
          isHotel ? 'TOTAL HOTEL INCOME' : isOther ? 'TOTAL OTHER INCOME' : `TOTAL ${normPartner} INCOME`,
          formatIndianCurrency(totalIncomeBilled),
          formatIndianCurrency(totalIncomeReceived),
          formatIndianCurrency(isHotel || isOther ? 0 : totalIncomeBalance),
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.0,
        cellPadding: { top: 1.4, bottom: 1.4, left: 1.8, right: 1.8 },
        minCellHeight: 5.2,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [26, 26, 26],
        textColor: [242, 201, 76],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 },
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 },
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 'auto', fontStyle: 'bold' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: (data) => {
        drawPageHeader(data.pageNumber);
      },
    });
  }

  // ==========================================================================
  // CASE 3: INCOME + EXPENSE COMBINED REPORT
  // ==========================================================================
  else {
    // 3 Summary Cards in row
    const cardW = (contentWidth - 6) / 3;
    const summaryCardH = 17;

    // Card 1: Income Balance / Fully Paid Income
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, curY, cardW, summaryCardH, 2, 2, 'FD');
    doc.setFillColor(34, 197, 94);
    doc.rect(margin, curY, 2.0, summaryCardH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(20, 83, 45);
    doc.text(
      isHotel || isOther ? 'FULLY PAID INCOME RECEIVED' : 'INCOME BALANCE ASSIGNED',
      margin + 4.5,
      curY + 4.8
    );
    doc.setFontSize(10.5);
    doc.setTextColor(22, 101, 52);
    doc.text(
      `Rs. ${formatIndianNumber(isHotel || isOther ? totalIncomeReceived : totalIncomeBalance)}`,
      margin + 4.5,
      curY + 11.5
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      isHotel || isOther ? `${partnerIncomes.length} fully paid entries` : `${partnerIncomes.length} income entries`,
      margin + 4.5,
      curY + 15.0
    );

    // Card 2: Total Expense
    const card2X = margin + cardW + 3;
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
    doc.roundedRect(card2X, curY, cardW, summaryCardH, 2, 2, 'FD');
    doc.setFillColor(244, 63, 94);
    doc.rect(card2X, curY, 2.0, summaryCardH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(159, 18, 57);
    doc.text(
      isHotel ? 'TOTAL HOTEL EXPENSES' : isOther ? 'TOTAL OTHER EXPENSES' : 'TOTAL EXPENSES PAID',
      card2X + 4.5,
      curY + 4.8
    );
    doc.setFontSize(10.5);
    doc.setTextColor(225, 29, 72);
    doc.text(`Rs. ${formatIndianNumber(totalExpense)}`, card2X + 4.5, curY + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${partnerExpenses.length} expense entries`, card2X + 4.5, curY + 15.0);

    // Card 3: Net Operational Balance / Net Position
    const card3X = card2X + cardW + 3;
    const netDifference =
      isHotel || isOther ? (totalIncomeReceived - totalExpense) : (totalIncomeBalance - totalExpense);
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(card3X, curY, cardW, summaryCardH, 2, 2, 'FD');
    doc.setFillColor(212, 175, 55);
    doc.rect(card3X, curY, 2.0, summaryCardH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(146, 64, 14);
    doc.text(
      isHotel ? 'NET HOTEL POSITION' : isOther ? 'NET OTHER POSITION' : 'NET OPERATIONAL BALANCE',
      card3X + 4.5,
      curY + 4.8
    );
    doc.setFontSize(10.5);
    doc.setTextColor(180, 83, 9);
    doc.text(`Rs. ${formatIndianNumber(netDifference)}`, card3X + 4.5, curY + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      isHotel || isOther
        ? (netDifference >= 0 ? 'Surplus / Net Profit' : 'Deficit / Net Loss')
        : (netDifference >= 0 ? `${normPartner} to Hotel` : `Hotel to ${normPartner}`),
      card3X + 4.5,
      curY + 15.0
    );

    curY += summaryCardH + 5.5;

    // SECTION A: INCOME BREAKDOWN
    doc.setFillColor(34, 197, 94);
    doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isHotel || isOther ? '1. FULLY PAID INCOME RECEIVED' : '1. INCOME ASSIGNED BREAKDOWN',
      margin + 5,
      curY + 2.5
    );

    curY += 4.5;

    const incomeRows =
      partnerIncomes.length > 0
        ? partnerIncomes.map((item, idx) => {
            const rawBy = (item.byWho || (item as any).by_who || '').trim();
            const particulars = item.travels
              ? (rawBy ? `${item.travels} (${rawBy})` : item.travels)
              : (rawBy ? `By ${rawBy}` : (item.incomeType || 'Direct'));
            const itemBilled = Number(item.total) || 0;
            const itemReceived = Number(item.amountPaid) || (isHotel || isOther ? itemBilled : 0);
            const itemBal = isHotel || isOther ? 0 : (Number(item.balance) || 0);
            return [
              String(idx + 1),
              formatDisplayDate(item.date) || '',
              particulars,
              formatIndianCurrency(itemBilled),
              formatIndianCurrency(itemReceived),
              formatIndianCurrency(itemBal),
            ];
          })
        : [
            [
              '-',
              '-',
              isHotel
                ? 'No fully paid income records in this period'
                : isOther
                ? 'No fully paid income records from other sources in this period'
                : `No income records assigned to ${normPartner} in this period`,
              'Rs. 0',
              'Rs. 0',
              'Rs. 0',
            ],
          ];

    autoTable(doc, {
      startY: curY,
      margin: { left: margin, right: margin, top: 24.5, bottom: 14 },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      head: [['#', 'DATE', 'PARTICULARS / CUSTOMER', 'BILLED', 'RECEIVED', isHotel || isOther ? 'BALANCE' : 'BALANCE ASSIGNED']],
      body: incomeRows,
      foot: [
        [
          '',
          '',
          isHotel ? 'TOTAL HOTEL INCOME' : isOther ? 'TOTAL OTHER INCOME' : 'TOTAL INCOME ASSIGNED',
          formatIndianCurrency(totalIncomeBilled),
          formatIndianCurrency(totalIncomeReceived),
          formatIndianCurrency(isHotel || isOther ? 0 : totalIncomeBalance),
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 6.8,
        cellPadding: { top: 1.2, bottom: 1.2, left: 1.6, right: 1.6 },
        minCellHeight: 4.8,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [26, 26, 26],
        textColor: [242, 201, 76],
        fontStyle: 'bold',
        fontSize: 7.0,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.0,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 'auto', fontStyle: 'bold' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: (data) => {
        drawPageHeader(data.pageNumber);
      },
    });

    // Get table bottom Y
    const lastTable = (doc as any).lastAutoTable;
    let nextY = lastTable ? lastTable.finalY + 6.0 : curY + 20;

    // Check if new page is needed for Section 2
    if (nextY > pageHeight - 40) {
      doc.addPage();
      drawPageHeader(doc.getNumberOfPages());
      nextY = 28.5;
    }

    // SECTION B: EXPENSE BREAKDOWN
    doc.setFillColor(244, 63, 94);
    doc.circle(margin + 1.5, nextY + 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isHotel ? '2. HOTEL EXPENSE BREAKDOWN BY PARTICULARS' : '2. EXPENSE BREAKDOWN BY PARTICULARS',
      margin + 5,
      nextY + 2.5
    );

    nextY += 4.5;

    const expenseTableRows =
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
              isHotel
                ? 'No expenses recorded for HOTEL in this period'
                : `No expenses recorded for ${normPartner} in this period`,
              'Rs. 0',
              '0.0%',
            ],
          ];

    autoTable(doc, {
      startY: nextY,
      margin: { left: margin, right: margin, top: 24.5, bottom: 14 },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      head: [['#', 'EXPENSE ITEM', 'TOTAL AMOUNT (INR)', 'SHARE (%)']],
      body: expenseTableRows,
      foot: [
        [
          '',
          isHotel ? 'TOTAL HOTEL EXPENSES' : `TOTAL ${normPartner} EXPENSES`,
          formatIndianCurrency(totalExpense),
          '100.0%',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 6.8,
        cellPadding: { top: 1.2, bottom: 1.2, left: 1.8, right: 1.8 },
        minCellHeight: 4.8,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [26, 26, 26],
        textColor: [242, 201, 76],
        fontStyle: 'bold',
        fontSize: 7.0,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.0,
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
  }

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
      `MAGNIFIQUE 2.0 - ${reportTitle}`,
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
  const typeSuffix = reportType === 'INCOME' ? 'Income' : reportType === 'INCOME + EXPENSE' ? 'Income_Expense' : 'Expense';
  const fileName =
    safeStart && safeEnd
      ? `Magnifique_${cleanPartner}_${typeSuffix}_Report_${safeStart}_to_${safeEnd}.pdf`
      : `Magnifique_${cleanPartner}_${typeSuffix}_Report.pdf`;

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
