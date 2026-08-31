import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord, AccountMonthRow, PartnerSettlement } from '../types';
import {
  calculateDayBalanceSummary,
  calculateAllMonthsSummary,
} from '../utils/accountBalanceUtils';

// Format currency as Rs. 1,25,000
export const formatPdfCurrency = (amount: number): string => {
  const num = Math.round(amount) || 0;
  return `Rs. ${num.toLocaleString('en-IN')}`;
};

// Format Date YYYY-MM-DD to DD Month YYYY (e.g. 30 August 2026)
export const formatPdfDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// Format Date YYYY-MM-DD to short display (e.g. 01 Aug 2026)
export const formatPdfDateMedium = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  const dd = String(day).padStart(2, '0');
  const mm = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${dd} ${mm} ${year}`;
};

// Format Month YYYY-MM to Month YYYY (e.g. August 2026)
export const formatPdfMonth = (monthStr: string): string => {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
};

const PDF_FONT = 'helvetica';

// EXACT 5 Official Partners (LOKESH is completely removed)
export const OFFICIAL_PARTNERS = ['ANSARI', 'IRSHAD', 'MUSADDIQ', 'SATHISH', 'YOGESH'] as const;

export interface PartnerCalculationResult {
  partner: string;
  balanceToHotel: number;
  expensesByThem: number;
}

function matchPartnerName(inputName: string, officialName: string): boolean {
  const normInput = (inputName || '').trim().toUpperCase();
  const normOfficial = officialName.toUpperCase();
  if (normInput === normOfficial) return true;
  if (normOfficial === 'MUSADDIQ' && (normInput === 'MUSSADDIQ' || normInput === 'MUSADDIQ')) return true;
  return false;
}

/**
 * Compute Partner Balances & Expenses for the ledger period
 * - Aggregates ALL income and expense records independently
 * - Does not overwrite one partner's value with another
 * - Case-insensitive matching
 */
export const calculatePartnerTotals = (
  incomeList: IncomeRecord[],
  expenseList: ExpenseRecord[]
): PartnerCalculationResult[] => {
  return OFFICIAL_PARTNERS.map((partnerName) => {
    // 1. Balance to Hotel (Unpaid balance owed by or attributed to this partner)
    const balanceToHotel = incomeList.reduce((sum, inc) => {
      const bal = Number(inc.balance) || 0;
      if (bal <= 0) return sum;

      const pAccountName = (inc.balanceAccountPartnerName || '').trim();
      const pAccountId = (inc.balanceAccountPartnerId || '').toString().trim();
      const byWho = (inc.byWho || '').trim();

      // Check if balance belongs to this partner
      if (matchPartnerName(pAccountName, partnerName) || matchPartnerName(pAccountId, partnerName)) {
        return sum + bal;
      }
      if (!pAccountName && !pAccountId && matchPartnerName(byWho, partnerName)) {
        return sum + bal;
      }
      return sum;
    }, 0);

    // 2. Expense by Them (Expenses paid by this partner)
    const expensesByThem = expenseList.reduce((sum, exp) => {
      const paidBy = (exp.paidBy || '').trim();
      const paidByPartnerId = (exp.paidByPartnerId || '').toString().trim();

      if (matchPartnerName(paidBy, partnerName) || matchPartnerName(paidByPartnerId, partnerName)) {
        return sum + (Number(exp.amount) || 0);
      }
      return sum;
    }, 0);

    return {
      partner: partnerName,
      balanceToHotel,
      expensesByThem,
    };
  });
};


// Add Header and Footer on each page
const drawPageHeaderAndFooter = (
  doc: jsPDF,
  fontFamily: string,
  pageWidth: number,
  pageHeight: number,
  leftMargin: number,
  rightMargin: number
) => {
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // --- Top Header ---
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(26, 26, 26);
    doc.text('MAGNIFIQUE 2.0', leftMargin, 18);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text('Restaurant Accounts Ledger', leftMargin + 82, 18);

    // Gold divider under header
    doc.setDrawColor(212, 175, 55); // Gold
    doc.setLineWidth(1.0);
    doc.line(leftMargin, 23, pageWidth - rightMargin, 23);

    // --- Bottom Footer ---
    doc.setDrawColor(220, 220, 220); // Subtle gray line
    doc.setLineWidth(0.5);
    doc.line(leftMargin, pageHeight - 20, pageWidth - rightMargin, pageHeight - 20);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text('MAGNIFIQUE 2.0 • Official Accounts Ledger', leftMargin, pageHeight - 10);

    const pageText = `Page ${i} of ${totalPages}`;
    doc.text(pageText, pageWidth - rightMargin, pageHeight - 10, { align: 'right' });
  }
};

/**
 * Format Meal Code:
 * - À LA CARTE: 'ALACARTE' (no member count)
 * - Meals: 'B (150)', 'L (150)', 'D (150)', 'B/L (150)', 'B/D (150)', 'L/D (150)', 'B/L/D (150)'
 */
const formatMealColumn = (inc: IncomeRecord): string => {
  const isAlaCarte =
    inc.mealPlan === 'alacarte' ||
    inc.incomeType === 'À La Carte' ||
    (inc.byWho && (inc.byWho.toUpperCase() === 'À LA CARTE' || inc.byWho.toUpperCase() === 'A LA CARTE'));

  if (isAlaCarte) {
    return 'ALACARTE';
  }

  let code = 'B';
  if (inc.mealPlan === '3_time' || inc.mealCombination === 'all') {
    code = 'B/L/D';
  } else if (inc.mealPlan === '2_time') {
    if (inc.mealCombination === 'breakfast_lunch') code = 'B/L';
    else if (inc.mealCombination === 'breakfast_dinner') code = 'B/D';
    else if (inc.mealCombination === 'lunch_dinner') code = 'L/D';
    else code = 'B/L';
  } else if (inc.mealPlan === '1_time') {
    if (inc.mealCombination === 'lunch' || inc.mealType === 'Lunch') code = 'L';
    else if (inc.mealCombination === 'dinner' || inc.mealType === 'Dinner') code = 'D';
    else code = 'B';
  } else if (inc.mealType === 'Lunch') {
    code = 'L';
  } else if (inc.mealType === 'Dinner') {
    code = 'D';
  }

  const count = inc.membersCount || 0;
  if (count > 0) {
    return `${code} (${count})`;
  }
  return code;
};

/**
 * Format Income Name:
 * Use By Who (+ travels in brackets). E.g. IRSHAD (SS TRAVELS)
 */
const formatIncomeName = (inc: IncomeRecord): string => {
  const byWho = (inc.byWho || '').trim();
  const travels = (inc.travels || '').trim();
  const isAlaCarte =
    inc.mealPlan === 'alacarte' ||
    inc.incomeType === 'À La Carte' ||
    byWho.toUpperCase() === 'À LA CARTE' ||
    byWho.toUpperCase() === 'A LA CARTE';

  if (isAlaCarte) {
    if (travels && byWho && byWho.toUpperCase() !== 'À LA CARTE' && byWho.toUpperCase() !== 'A LA CARTE') {
      return `${byWho} (${travels})`;
    }
    return travels || byWho || 'ALACARTE';
  }

  if (byWho && travels) {
    return `${byWho} (${travels})`;
  } else if (byWho) {
    return byWho;
  } else if (travels) {
    return `(${travels})`;
  }
  return '-';
};

/**
 * Format Income Balance:
 * e.g. Rs. 6,640 (Partner) or Rs. 0
 */
const formatIncomeBalance = (inc: IncomeRecord): string => {
  const bal = inc.balance || 0;
  if (bal > 0) {
    const partner = (inc.balanceAccountPartnerName || inc.balanceAccountPartnerId || '').trim();
    return partner ? `${formatPdfCurrency(bal)} (${partner})` : formatPdfCurrency(bal);
  }
  return 'Rs. 0';
};

/**
 * Format Expense Name:
 * Use description if present, otherwise category
 */
const formatExpenseName = (exp: ExpenseRecord): string => {
  const name = (exp.name || '').trim();
  return name.length > 0 ? name : (exp.category || 'Expense');
};

/**
 * Draw Summary Container
 * Displaying:
 * - Opening Balance (Date): Rs. XXXXX
 * - Total Income: Rs. XXXXX
 * - Total Paid: Rs. XXXXX
 * - Total Balance: Rs. XXXXX
 * - Total Expense: Rs. XXXXX
 * - Closing Balance (Date): Rs. XXXXX
 */
const drawSummaryBox = (
  doc: jsPDF,
  startY: number,
  openingBalance: number,
  openingDateStr: string,
  totalIncome: number,
  totalPaid: number,
  totalBalance: number,
  totalExpense: number,
  closingBalance: number,
  closingDateStr: string,
  fontFamily: string,
  leftMargin: number,
  contentWidth: number,
  pageHeight: number
): number => {
  let y = startY;
  const summaryBoxHeight = 56;

  // Space check: ensure room for summary box before bottom footer
  if (y + summaryBoxHeight > pageHeight - 35) {
    doc.addPage();
    y = 38;
  }

  // Summary Container (Clean, luxury black/gold border)
  doc.setFillColor(254, 254, 252);
  doc.setDrawColor(212, 175, 55); // Gold border
  doc.setLineWidth(1.0);
  doc.roundedRect(leftMargin, y, contentWidth, summaryBoxHeight, 2, 2, 'FD');

  // Title Pill
  doc.setFillColor(212, 175, 55);
  doc.roundedRect(leftMargin, y, 76, 13, 2, 2, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(10, 10, 10);
  doc.text('SUMMARY', leftMargin + 6, y + 9.5);

  // Row 1: Opening Balance, Total Income, Total Paid
  const row1Y = y + 26;
  const colW = contentWidth / 3;

  // 1. Opening Balance (Date)
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text(`Opening Balance (${openingDateStr}):`, leftMargin + 6, row1Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text(formatPdfCurrency(openingBalance), leftMargin + colW - 8, row1Y, { align: 'right' });

  // 2. Total Income
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Total Income:', leftMargin + colW + 12, row1Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalIncome), leftMargin + colW * 2 - 8, row1Y, { align: 'right' });

  // 3. Received (Total Paid)
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Received:', leftMargin + colW * 2 + 12, row1Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalPaid), leftMargin + contentWidth - 8, row1Y, { align: 'right' });

  // Row 2: Total Balance, Total Expense, Closing Balance
  const row2Y = y + 44;

  // 4. Total Balance
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Total Balance:', leftMargin + 6, row2Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 24, 24); // Red
  doc.text(formatPdfCurrency(totalBalance), leftMargin + colW - 8, row2Y, { align: 'right' });

  // 5. Total Expense
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Total Expense:', leftMargin + colW + 12, row2Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 24, 24); // Red
  doc.text(formatPdfCurrency(totalExpense), leftMargin + colW * 2 - 8, row2Y, { align: 'right' });

  // 6. Closing Balance (Date)
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  doc.text(`Closing Balance (${closingDateStr}):`, leftMargin + colW * 2 + 12, row2Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 130, 20); // Warm Gold / Black
  doc.text(formatPdfCurrency(closingBalance), leftMargin + contentWidth - 8, row2Y, { align: 'right' });

  return y + summaryBoxHeight;
};

/**
 * Draw Compact Partner Calculation Grid on a NEW A4 PAGE
 * ONLY displays partners where balanceToHotel > 0 OR expensesByThem > 0
 * NO labels ("Balance to Hotel", "Expense by Them")
 * First row = RED (Balance to Hotel)
 * Second row = GREEN (Expense by Them)
 */
const drawPartnerCalculationSection = (
  doc: jsPDF,
  allPartnerTotals: PartnerCalculationResult[],
  fontFamily: string,
  leftMargin: number,
  rightMargin: number,
  contentWidth: number
) => {
  // Always create a new A4 page specifically for Partner Calculation
  doc.addPage();

  let y = 38;

  // Title & Header Branding
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 17, 17);
  doc.text('MAGNIFIQUE 2.0', leftMargin, y);

  y += 14;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(180, 130, 20); // Warm Gold
  doc.text('PARTNER CALCULATION', leftMargin, y);

  y += 10;
  // Gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.0);
  doc.line(leftMargin, y, doc.internal.pageSize.getWidth() - rightMargin, y);
  y += 14;

  // Filter: ONLY display partners with non-zero values
  const activePartners = allPartnerTotals.filter(
    (p) => (p.balanceToHotel || 0) > 0 || (p.expensesByThem || 0) > 0
  );

  if (activePartners.length === 0) {
    // If no partners have positive balance or expense
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No active partner balances or expenses to display for this period.', leftMargin, y + 10);
    return;
  }

  // Compact table with equal columns for active partners
  const head = [activePartners.map((p) => p.partner)];
  const body = [
    activePartners.map((p) => formatPdfCurrency(p.balanceToHotel)),
    activePartners.map((p) => formatPdfCurrency(p.expensesByThem)),
  ];

  const colWidth = contentWidth / activePartners.length;
  const colStyles: Record<number, any> = {};
  activePartners.forEach((_, idx) => {
    colStyles[idx] = { cellWidth: colWidth };
  });

  autoTable(doc, {
    head: head as any,
    body: body,
    startY: y,
    margin: { left: leftMargin, right: rightMargin, top: 32, bottom: 32 },
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 8.5,
      cellPadding: 6,
      lineColor: [200, 200, 200],
      lineWidth: 0.5,
      textColor: [30, 30, 30],
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [212, 175, 55], // Gold
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: 6,
      lineColor: [26, 26, 26],
      lineWidth: 0.8,
    },
    alternateRowStyles: {
      fillColor: [253, 253, 251],
    },
    columnStyles: colStyles,
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.row.index === 0) {
          // Row 1: Balance to Hotel -> RED
          data.cell.styles.textColor = [190, 24, 24];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.row.index === 1) {
          // Row 2: Expense by Them -> GREEN
          data.cell.styles.textColor = [22, 128, 60];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawCell: (data) => {
      // Draw thicker/darker vertical divider borders between columns and outer box
      doc.setDrawColor(40, 40, 40);
      doc.setLineWidth(1.0);
      // Right edge
      doc.line(
        data.cell.x + data.cell.width,
        data.cell.y,
        data.cell.x + data.cell.width,
        data.cell.y + data.cell.height
      );
      // Left edge on first column
      if (data.column.index === 0) {
        doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
      }
    },
  });
};

/**
 * GENERATE DAILY ACCOUNTS PDF (A4 Portrait)
 */
export const generateDailyAccountsPdf = (
  dateStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  accountMonths?: AccountMonthRow[],
  partnerSettlements?: PartnerSettlement[]
): jsPDF => {
  // Filter for the specific day
  const todayIncome = incomeRecords.filter((r) => r.date === dateStr);
  const todayExpenses = expenseRecords.filter((r) => r.date === dateStr);

  const totalIncome = todayIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalPaid = todayIncome.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
  const totalBalance = todayIncome.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
  const totalExpense = todayExpenses.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  // Daily running balance calculation
  const dayBalance = calculateDayBalanceSummary(
    dateStr,
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );
  const openingBalance = dayBalance.openingBalance;
  const closingBalance = dayBalance.closingBalance;
  const dateFormattedMedium = formatPdfDateMedium(dateStr);


  // Initialize Exact A4 Portrait Document (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const fontFamily = PDF_FONT;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~841.89 pt
  const leftMargin = 24;
  const rightMargin = 24;
  const contentWidth = pageWidth - leftMargin - rightMargin; // ~547.28 pt

  let currentY = 38;

  // Title & Header Branding
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 17, 17);
  doc.text('MAGNIFIQUE 2.0', leftMargin, currentY);

  currentY += 14;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(180, 130, 20); // Warm Gold
  doc.text('DAILY ACCOUNT LEDGER', leftMargin, currentY);

  currentY += 13;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const formattedDate = formatPdfDate(dateStr);
  doc.text(`Date: ${formattedDate}`, leftMargin, currentY);

  // Metadata right aligned
  const genTimestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${genTimestamp}`, pageWidth - rightMargin, currentY - 24, { align: 'right' });
  doc.text('Combined Accounts Ledger', pageWidth - rightMargin, currentY - 13, { align: 'right' });

  currentY += 10;
  // Gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.0);
  doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);
  currentY += 10;

  // Build Structured Side-by-Side Table Head & Body
  const tableHead = [
    [
      { content: 'INCOME', colSpan: 5, styles: { halign: 'center', fillColor: [26, 26, 26], textColor: [212, 175, 55], fontStyle: 'bold', fontSize: 7.5 } },
      { content: 'EXPENSE', colSpan: 3, styles: { halign: 'center', fillColor: [35, 35, 35], textColor: [212, 175, 55], fontStyle: 'bold', fontSize: 7.5 } },
    ],
    [
      'NAME', 'MEAL', 'BALANCE', 'PAID', 'TOTAL',
      'DESCRIPTION', 'PAID BY', 'AMOUNT',
    ],
  ];

  const maxRows = Math.max(todayIncome.length, todayExpenses.length);
  let tableBody: string[][] = [];

  if (maxRows === 0) {
    tableBody = [['No transactions found for this date.', '', '', '', '', '', '', '']];
  } else {
    for (let i = 0; i < maxRows; i++) {
      const inc = todayIncome[i];
      const exp = todayExpenses[i];

      const incName = inc ? formatIncomeName(inc) : '';
      const incMeal = inc ? formatMealColumn(inc) : '';
      const incBalance = inc ? formatIncomeBalance(inc) : '';
      const incPaid = inc ? formatPdfCurrency(inc.amountPaid || 0) : '';
      const incTotal = inc ? formatPdfCurrency(inc.total || 0) : '';

      const expName = exp ? formatExpenseName(exp) : '';
      const expPaidBy = exp ? (exp.paidBy || 'Hotel').trim() : '';
      const expAmount = exp ? formatPdfCurrency(exp.amount || 0) : '';

      tableBody.push([
        incName,
        incMeal,
        incBalance,
        incPaid,
        incTotal,
        expName,
        expPaidBy,
        expAmount,
      ]);
    }
  }

  autoTable(doc, {
    head: tableHead as any,
    body: tableBody,
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin, top: 32, bottom: 32 },
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 7,
      cellPadding: 3,
      lineColor: [220, 220, 218],
      lineWidth: 0.5,
      textColor: [30, 30, 30],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left',
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 250],
    },
    columnStyles: {
      0: { cellWidth: 105 }, // Income NAME
      1: { cellWidth: 38, halign: 'center' }, // Income MEAL
      2: { cellWidth: 52, halign: 'right' }, // Income BALANCE
      3: { cellWidth: 52, halign: 'right' }, // Income PAID
      4: { cellWidth: 52, halign: 'right', fontStyle: 'bold' }, // Income TOTAL
      5: { cellWidth: 124 }, // Expense NAME
      6: { cellWidth: 60 }, // Expense PAID BY
      7: { cellWidth: 64, halign: 'right', fontStyle: 'bold' }, // Expense AMOUNT
    },
    didParseCell: (data) => {
      if (maxRows === 0 && data.row.index === 0 && data.section === 'body') {
        if (data.column.index === 0) {
          data.cell.colSpan = 8;
          data.cell.styles.halign = 'center';
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
    didDrawCell: (data) => {
      // Noticeably thicker vertical divider between INCOME (col 0-4) and EXPENSE (col 5-7)
      if (data.column.index === 4) {
        doc.setDrawColor(26, 26, 26);
        doc.setLineWidth(1.5);
        doc.line(
          data.cell.x + data.cell.width,
          data.cell.y,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        );
      }
    },
    showHead: 'everyPage',
    pageBreak: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // 1. Draw Summary Box after ledger table
  currentY = drawSummaryBox(
    doc,
    currentY,
    openingBalance,
    dateFormattedMedium,
    totalIncome,
    totalPaid,
    totalBalance,
    totalExpense,
    closingBalance,
    dateFormattedMedium,
    fontFamily,
    leftMargin,
    contentWidth,
    pageHeight
  );

  // 2. Draw Partner Calculation Section after summary (always starts on a new A4 page)
  const partnerTotals = calculatePartnerTotals(todayIncome, todayExpenses);
  drawPartnerCalculationSection(
    doc,
    partnerTotals,
    fontFamily,
    leftMargin,
    rightMargin,
    contentWidth
  );

  // 3. Draw Page Numbers and Headers across all generated pages
  drawPageHeaderAndFooter(doc, fontFamily, pageWidth, pageHeight, leftMargin, rightMargin);

  return doc;
};

/**
 * GENERATE THIS MONTH'S ACCOUNTS PDF (A4 Portrait)
 */
export const generateMonthlyAccountsPdf = (
  monthStr: string, // YYYY-MM
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  accountMonths?: AccountMonthRow[],
  partnerSettlements?: PartnerSettlement[]
): jsPDF => {
  // Filter for the specific month
  const monthIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(monthStr));
  const monthExpenses = expenseRecords.filter((r) => r.date && r.date.startsWith(monthStr));

  // Sort chronologically by date
  monthIncome.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  monthExpenses.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const totalIncome = monthIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalPaid = monthIncome.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
  const totalBalance = monthIncome.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
  const totalExpense = monthExpenses.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  // Monthly running balance calculation
  const allMonths = calculateAllMonthsSummary(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );
  const monthData = allMonths[monthStr];
  const openingBalance = monthData?.openingBalance ?? 0;
  const closingBalance = monthData?.closingBalance ?? (openingBalance + totalIncome - totalExpense);
  const firstDateFormatted = formatPdfDateMedium(monthData?.firstDate || `${monthStr}-01`);
  const lastDateFormatted = formatPdfDateMedium(monthData?.lastDate || `${monthStr}-30`);


  // Initialize Exact A4 Portrait Document (210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const fontFamily = PDF_FONT;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~841.89 pt
  const leftMargin = 24;
  const rightMargin = 24;
  const contentWidth = pageWidth - leftMargin - rightMargin; // ~547.28 pt

  let currentY = 38;

  // Title & Header Branding
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 17, 17);
  doc.text('MAGNIFIQUE 2.0', leftMargin, currentY);

  currentY += 14;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(180, 130, 20); // Warm Gold
  doc.text('MONTHLY ACCOUNT LEDGER', leftMargin, currentY);

  currentY += 13;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const formattedMonth = formatPdfMonth(monthStr);
  doc.text(`Month: ${formattedMonth}`, leftMargin, currentY);

  // Metadata right aligned
  const genTimestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${genTimestamp}`, pageWidth - rightMargin, currentY - 24, { align: 'right' });
  doc.text('Combined Accounts Ledger', pageWidth - rightMargin, currentY - 13, { align: 'right' });

  currentY += 10;
  // Gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.0);
  doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);
  currentY += 10;

  // Build Structured Side-by-Side Table Head & Body
  const tableHead = [
    [
      { content: 'INCOME', colSpan: 5, styles: { halign: 'center', fillColor: [26, 26, 26], textColor: [212, 175, 55], fontStyle: 'bold', fontSize: 7.5 } },
      { content: 'EXPENSE', colSpan: 3, styles: { halign: 'center', fillColor: [35, 35, 35], textColor: [212, 175, 55], fontStyle: 'bold', fontSize: 7.5 } },
    ],
    [
      'NAME', 'MEAL', 'BALANCE', 'PAID', 'TOTAL',
      'DESCRIPTION', 'PAID BY', 'AMOUNT',
    ],
  ];

  const maxRows = Math.max(monthIncome.length, monthExpenses.length);
  let tableBody: string[][] = [];

  if (maxRows === 0) {
    tableBody = [['No transactions found for this month.', '', '', '', '', '', '', '']];
  } else {
    for (let i = 0; i < maxRows; i++) {
      const inc = monthIncome[i];
      const exp = monthExpenses[i];

      const incName = inc ? formatIncomeName(inc) : '';
      const incMeal = inc ? formatMealColumn(inc) : '';
      const incBalance = inc ? formatIncomeBalance(inc) : '';
      const incPaid = inc ? formatPdfCurrency(inc.amountPaid || 0) : '';
      const incTotal = inc ? formatPdfCurrency(inc.total || 0) : '';

      const expName = exp ? formatExpenseName(exp) : '';
      const expPaidBy = exp ? (exp.paidBy || 'Hotel').trim() : '';
      const expAmount = exp ? formatPdfCurrency(exp.amount || 0) : '';

      tableBody.push([
        incName,
        incMeal,
        incBalance,
        incPaid,
        incTotal,
        expName,
        expPaidBy,
        expAmount,
      ]);
    }
  }

  autoTable(doc, {
    head: tableHead as any,
    body: tableBody,
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin, top: 32, bottom: 32 },
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 7,
      cellPadding: 3,
      lineColor: [220, 220, 218],
      lineWidth: 0.5,
      textColor: [30, 30, 30],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left',
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 250],
    },
    columnStyles: {
      0: { cellWidth: 105 }, // Income NAME
      1: { cellWidth: 38, halign: 'center' }, // Income MEAL
      2: { cellWidth: 52, halign: 'right' }, // Income BALANCE
      3: { cellWidth: 52, halign: 'right' }, // Income PAID
      4: { cellWidth: 52, halign: 'right', fontStyle: 'bold' }, // Income TOTAL
      5: { cellWidth: 124 }, // Expense NAME
      6: { cellWidth: 60 }, // Expense PAID BY
      7: { cellWidth: 64, halign: 'right', fontStyle: 'bold' }, // Expense AMOUNT
    },
    didParseCell: (data) => {
      if (maxRows === 0 && data.row.index === 0 && data.section === 'body') {
        if (data.column.index === 0) {
          data.cell.colSpan = 8;
          data.cell.styles.halign = 'center';
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
    didDrawCell: (data) => {
      // Noticeably thicker vertical divider between INCOME (col 0-4) and EXPENSE (col 5-7)
      if (data.column.index === 4) {
        doc.setDrawColor(26, 26, 26);
        doc.setLineWidth(1.5);
        doc.line(
          data.cell.x + data.cell.width,
          data.cell.y,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        );
      }
    },
    showHead: 'everyPage',
    pageBreak: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // 1. Draw Summary Box after ledger table
  currentY = drawSummaryBox(
    doc,
    currentY,
    openingBalance,
    firstDateFormatted,
    totalIncome,
    totalPaid,
    totalBalance,
    totalExpense,
    closingBalance,
    lastDateFormatted,
    fontFamily,
    leftMargin,
    contentWidth,
    pageHeight
  );

  // 2. Draw Partner Calculation Section after summary (always starts on a new A4 page)
  const partnerTotals = calculatePartnerTotals(monthIncome, monthExpenses);
  drawPartnerCalculationSection(
    doc,
    partnerTotals,
    fontFamily,
    leftMargin,
    rightMargin,
    contentWidth
  );

  // 3. Draw Page Numbers and Headers across all generated pages
  drawPageHeaderAndFooter(doc, fontFamily, pageWidth, pageHeight, leftMargin, rightMargin);

  return doc;
};
