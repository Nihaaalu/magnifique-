import jsPDF from 'jspdf';
import {
  IncomeRecord,
  ExpenseRecord,
  AccountMonthRow,
  PartnerSettlement,
  Partner,
} from '../types';
import { formatPdfMonth } from './pdfReportGenerator';
import {
  isIncomeAssignedToPartner,
  isExpensePaidByPartner,
  isSettlementForPartner,
  getSettlementDirection,
} from '../utils/partnerBalanceUtils';

export interface ClosingBalancePdfData {
  selectedMonth: string; // 'YYYY-MM'
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  isClosed: boolean;
  partnerLines: Array<{
    label: string;
    amount: number;
    direction: 'to_hotel' | 'to_partner';
  }>;
}

/**
 * Format currency with proper Indian numbering (Rs. X,XX,XXX)
 */
export function formatInrPdf(amount: number): string {
  const rounded = Math.round(Math.abs(amount)) || 0;
  return `Rs. ${rounded.toLocaleString('en-IN')}`;
}

/**
 * Calculate partner outstanding lines for the Closing Balance PDF and UI.
 * 
 * Rules:
 * 1. For each partner, calculate monthly outstanding for selectedMonth.
 *    If non-zero: show `PARTNER TO HOTEL (MONTH)` or `HOTEL TO PARTNER (MONTH)`.
 *    If zero: hide completely.
 * 2. For each partner, calculate total accumulated outstanding across all relevant months up to selectedMonth.
 *    If non-zero: show `PARTNER TO HOTEL (TOTAL)` or `HOTEL TO PARTNER (TOTAL)`.
 *    If zero: hide completely.
 */
export function calculatePartnerOutstandingLines(
  selectedMonth: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: PartnerSettlement[] = [],
  partners: Partner[] = []
): Array<{
  partnerName: string;
  partnerId: string;
  monthLabel: string;
  monthAmount: number;
  monthDirection: 'to_hotel' | 'to_partner' | 'zero';
  hasMonthBalance: boolean;
  totalLabel: string;
  totalAmount: number;
  totalDirection: 'to_hotel' | 'to_partner' | 'zero';
  hasTotalBalance: boolean;
}> {
  const officialNames = ['IRSHAD', 'ANSARI', 'SATHISH', 'YOGESH', 'MUSADDIQ'];
  const monthNameUpper = formatPdfMonth(selectedMonth).toUpperCase();

  return officialNames.map((name) => {
    const partnerObj = partners.find((p) => p.name.trim().toUpperCase() === name);
    const partnerId = partnerObj ? String(partnerObj.id) : '';

    // --- 1. MONTHLY BALANCE FOR selectedMonth ---
    const mIncome = incomeRecords.filter(
      (r) => r.date && r.date.startsWith(selectedMonth) && isIncomeAssignedToPartner(r, name, partnerId)
    );
    const mExpense = expenseRecords.filter(
      (r) => r.date && r.date.startsWith(selectedMonth) && isExpensePaidByPartner(r, name, partnerId)
    );
    const mSettlements = partnerSettlements.filter((s) => {
      if (!isSettlementForPartner(s, name, partnerId)) return false;
      const sMonth = s.settlementMonth
        ? s.settlementMonth.substring(0, 7)
        : s.date
        ? s.date.substring(0, 7)
        : '';
      return sMonth === selectedMonth;
    });

    const mIncomeBal = mIncome.reduce(
      (sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0),
      0
    );
    const mExpTotal = mExpense.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const mToHotel = mSettlements
      .filter((s) => getSettlementDirection(s) === 'to_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const mFromHotel = mSettlements
      .filter((s) => getSettlementDirection(s) === 'from_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const netMonth = mIncomeBal - mExpTotal - mToHotel + mFromHotel;
    const roundedNetMonth = Math.round(netMonth);

    let monthDirection: 'to_hotel' | 'to_partner' | 'zero' = 'zero';
    let monthLabel = '';
    let hasMonthBalance = false;

    if (roundedNetMonth > 0) {
      monthDirection = 'to_hotel';
      monthLabel = `${name} TO HOTEL (${monthNameUpper})`;
      hasMonthBalance = true;
    } else if (roundedNetMonth < 0) {
      monthDirection = 'to_partner';
      monthLabel = `HOTEL TO ${name} (${monthNameUpper})`;
      hasMonthBalance = true;
    }

    // --- 2. TOTAL ACCUMULATED OUTSTANDING (All months up to selectedMonth) ---
    const allIncome = incomeRecords.filter((r) => {
      const rMonth = r.date ? r.date.substring(0, 7) : '';
      return rMonth <= selectedMonth && isIncomeAssignedToPartner(r, name, partnerId);
    });
    const allExpense = expenseRecords.filter((r) => {
      const rMonth = r.date ? r.date.substring(0, 7) : '';
      return rMonth <= selectedMonth && isExpensePaidByPartner(r, name, partnerId);
    });
    const allSettlements = partnerSettlements.filter((s) => {
      if (!isSettlementForPartner(s, name, partnerId)) return false;
      const sMonth = s.settlementMonth
        ? s.settlementMonth.substring(0, 7)
        : s.date
        ? s.date.substring(0, 7)
        : '';
      return sMonth <= selectedMonth;
    });

    const totalIncomeBal = allIncome.reduce(
      (sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0),
      0
    );
    const totalExp = allExpense.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalToHotel = allSettlements
      .filter((s) => getSettlementDirection(s) === 'to_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const totalFromHotel = allSettlements
      .filter((s) => getSettlementDirection(s) === 'from_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const netTotal = totalIncomeBal - totalExp - totalToHotel + totalFromHotel;
    const roundedNetTotal = Math.round(netTotal);

    let totalDirection: 'to_hotel' | 'to_partner' | 'zero' = 'zero';
    let totalLabel = '';
    let hasTotalBalance = false;

    if (roundedNetTotal > 0) {
      totalDirection = 'to_hotel';
      totalLabel = `${name} TO HOTEL (TOTAL)`;
      hasTotalBalance = true;
    } else if (roundedNetTotal < 0) {
      totalDirection = 'to_partner';
      totalLabel = `HOTEL TO ${name} (TOTAL)`;
      hasTotalBalance = true;
    }

    return {
      partnerName: name,
      partnerId,
      monthLabel,
      monthAmount: Math.abs(roundedNetMonth),
      monthDirection,
      hasMonthBalance,
      totalLabel,
      totalAmount: Math.abs(roundedNetTotal),
      totalDirection,
      hasTotalBalance,
    };
  });
}

/**
 * Generates the compact Closing Balance PDF.
 */
export function generateClosingBalancePdf(
  selectedMonth: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = [],
  partners: Partner[] = []
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Monthly income & expense calculations
  const mIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
  const mExpense = expenseRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
  const totalIncome = mIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalExpense = mExpense.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const dbMonth = accountMonths.find(
    (m) => m.month_start && m.month_start.startsWith(selectedMonth)
  );
  const isClosed = dbMonth ? !!dbMonth.is_closed : false;
  const openingBalance = dbMonth && dbMonth.opening_balance !== null && dbMonth.opening_balance !== undefined
    ? Number(dbMonth.opening_balance)
    : 0;
  const closingBalance = openingBalance + totalIncome - totalExpense;

  const monthLabel = formatPdfMonth(selectedMonth);

  // Partner calculations
  const partnerData = calculatePartnerOutstandingLines(
    selectedMonth,
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    partners
  );

  // Collect display rows (only non-zero)
  const displayRows: Array<{ label: string; amountStr: string; direction: 'to_hotel' | 'to_partner' }> = [];
  partnerData.forEach((p) => {
    if (p.hasMonthBalance) {
      displayRows.push({
        label: p.monthLabel,
        amountStr: formatInrPdf(p.monthAmount),
        direction: p.monthDirection === 'to_hotel' ? 'to_hotel' : 'to_partner',
      });
    }
    if (p.hasTotalBalance) {
      displayRows.push({
        label: p.totalLabel,
        amountStr: formatInrPdf(p.totalAmount),
        direction: p.totalDirection === 'to_hotel' ? 'to_hotel' : 'to_partner',
      });
    }
  });

  // Background
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  let currentY = margin;

  // Header Box
  doc.setFillColor(23, 23, 23);
  doc.roundedRect(margin, currentY, contentWidth, 76, 8, 8, 'F');
  doc.setDrawColor(42, 42, 42);
  doc.setLineWidth(1);
  doc.roundedRect(margin, currentY, contentWidth, 76, 8, 8, 'S');

  // Title: MAGNIFIQUE 2.0
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(212, 175, 55); // Gold
  doc.text('MAGNIFIQUE 2.0', margin + 18, currentY + 24);

  // Subtitle: CLOSING BALANCE
  doc.setFontSize(12);
  doc.setTextColor(245, 245, 245);
  doc.text('CLOSING BALANCE', margin + 18, currentY + 44);

  // Month
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(184, 184, 184);
  doc.text(monthLabel, margin + 18, currentY + 62);

  // Status Badge (Right-aligned)
  const statusText = isClosed ? 'CLOSED & LOCKED' : 'ACTIVE MONTH';
  const badgeWidth = 100;
  const badgeX = margin + contentWidth - badgeWidth - 18;
  doc.setFillColor(isClosed ? 32 : 18, isClosed ? 18 : 32, isClosed ? 18 : 20);
  doc.roundedRect(badgeX, currentY + 24, badgeWidth, 24, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(isClosed ? 248 : 74, isClosed ? 113 : 222, isClosed ? 113 : 128);
  doc.text(statusText, badgeX + badgeWidth / 2, currentY + 39, { align: 'center' });

  currentY += 92;

  // ==================================================
  // 3 LARGE HIGHLIGHTED SUMMARY CARDS
  // ==================================================
  const cardGap = 10;
  const colWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 62;

  // 1. TOTAL INCOME
  doc.setFillColor(17, 17, 17);
  doc.roundedRect(margin, currentY, colWidth, cardHeight, 6, 6, 'F');
  doc.setDrawColor(42, 42, 42);
  doc.roundedRect(margin, currentY, colWidth, cardHeight, 6, 6, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(74, 222, 128); // Green
  doc.text('TOTAL INCOME', margin + 14, currentY + 20);

  doc.setFontSize(15);
  doc.text(formatInrPdf(totalIncome), margin + 14, currentY + 46);

  // 2. TOTAL EXPENSE
  const col2X = margin + colWidth + cardGap;
  doc.setFillColor(17, 17, 17);
  doc.roundedRect(col2X, currentY, colWidth, cardHeight, 6, 6, 'F');
  doc.setDrawColor(42, 42, 42);
  doc.roundedRect(col2X, currentY, colWidth, cardHeight, 6, 6, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(248, 113, 113); // Red
  doc.text('TOTAL EXPENSE', col2X + 14, currentY + 20);

  doc.setFontSize(15);
  doc.text(formatInrPdf(totalExpense), col2X + 14, currentY + 46);

  currentY += cardHeight + cardGap;

  // 3. CLOSING BALANCE (Full-width card, prominent gold)
  doc.setFillColor(26, 22, 14);
  doc.roundedRect(margin, currentY, contentWidth, 68, 6, 6, 'F');
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.2);
  doc.roundedRect(margin, currentY, contentWidth, 68, 6, 6, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(212, 175, 55);
  doc.text('CLOSING BALANCE', margin + 16, currentY + 22);

  doc.setFontSize(18);
  doc.setTextColor(242, 201, 76);
  doc.text(formatInrPdf(closingBalance), margin + 16, currentY + 50);

  currentY += 68 + 22;

  // ==================================================
  // PARTNER OUTSTANDING SECTION
  // ==================================================
  doc.setFillColor(23, 23, 23);
  doc.setDrawColor(42, 42, 42);
  doc.setLineWidth(1);

  // Calculate box height based on number of rows
  const rowHeight = 32;
  const partnerHeaderHeight = 34;
  const partnerBoxHeight = Math.max(80, partnerHeaderHeight + displayRows.length * rowHeight + 12);

  doc.roundedRect(margin, currentY, contentWidth, partnerBoxHeight, 8, 8, 'F');
  doc.roundedRect(margin, currentY, contentWidth, partnerBoxHeight, 8, 8, 'S');

  // Section Header: PARTNER OUTSTANDING
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(212, 175, 55); // Gold
  doc.text('PARTNER OUTSTANDING', margin + 16, currentY + 22);

  // Small subtitle
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(119, 119, 119);
  doc.text(
    `${monthLabel.toUpperCase()} & ACCUMULATED TOTAL OUTSTANDING`,
    margin + contentWidth - 16,
    currentY + 22,
    { align: 'right' }
  );

  let rowY = currentY + partnerHeaderHeight;

  if (displayRows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(119, 119, 119);
    doc.text('No active partner outstanding balances for this period.', margin + 16, rowY + 20);
  } else {
    displayRows.forEach((row, idx) => {
      // Row separator
      if (idx > 0) {
        doc.setDrawColor(32, 32, 32);
        doc.setLineWidth(0.5);
        doc.line(margin + 12, rowY - 4, margin + contentWidth - 12, rowY - 4);
      }

      // Partner Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      if (row.direction === 'to_hotel') {
        doc.setTextColor(242, 201, 76); // Gold / amber
      } else {
        doc.setTextColor(74, 222, 128); // Green
      }
      doc.text(row.label, margin + 16, rowY + 14);

      // Amount (Right-aligned)
      doc.setFontSize(11);
      doc.setTextColor(245, 245, 245);
      doc.text(row.amountStr, margin + contentWidth - 16, rowY + 14, { align: 'right' });

      rowY += rowHeight;
    });
  }

  // Footer note at bottom
  const footerY = pageHeight - margin + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(85, 85, 85);
  doc.text(
    `MAGNIFIQUE 2.0 • Official Closing Balance Verification • Generated ${new Date().toLocaleDateString('en-GB')}`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  return doc;
}
