import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord, AccountMonthRow, PartnerSettlement, Partner } from '../types';
import {
  calculateDayBalanceSummary,
  calculateAllMonthsSummary,
} from '../utils/accountBalanceUtils';
import {
  calculatePartnerBalancesForDate,
  calculatePartnerBalancesForMonth,
  isIncomeAssignedToPartner,
  isExpensePaidByPartner,
  isSettlementForPartner,
  getSettlementDirection,
} from '../utils/partnerBalanceUtils';

// Format currency as Rs. 1,25,000 or -Rs. 2,000
export const formatPdfCurrency = (amount: number): string => {
  const isNegative = amount < 0;
  const num = Math.round(Math.abs(amount)) || 0;
  return `${isNegative ? '-' : ''}Rs. ${num.toLocaleString('en-IN')}`;
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

// Format Date YYYY-MM-DD to Day Header (e.g. 1 SEP, 2 SEP, 15 SEP)
export const formatDayHeader = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[0], 10);
  const d = new Date(year, month, day);
  const monthShort = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${day} ${monthShort}`;
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
  partnerBalance: number;
  expensesByThem: number;
  toHotel: number;
  balanceToHotel?: number;
  netBalance?: number;
  displayLabel?: string;
  displayAmount?: number;
  isZero?: boolean;
}

function matchPartnerName(inputName: string, officialName: string): boolean {
  const normInput = (inputName || '').trim().toUpperCase();
  const normOfficial = officialName.toUpperCase();
  if (!normInput || !normOfficial) return false;
  if (normInput === normOfficial) return true;
  if (normOfficial === 'MUSADDIQ' && (normInput === 'MUSSADDIQ' || normInput === 'MUSADDIQ')) return true;
  return false;
}

/**
 * Compute Partner Balances, Expenses, and NET "To Hotel" for the ledger period
 * - Formula: PARTNER TO HOTEL = PARTNER BALANCE - PARTNER EXPENSES
 * - Aggregates income and expense records for this report/date
 * - Uses actual partners present in data alongside official partners
 */
export const calculatePartnerTotals = (
  incomeList: IncomeRecord[],
  expenseList: ExpenseRecord[]
): PartnerCalculationResult[] => {
  const partnerSet = new Set<string>();
  OFFICIAL_PARTNERS.forEach((p) => partnerSet.add(p));

  // Dynamically include any partner present in income or expense records
  incomeList.forEach((inc) => {
    const pAccountName = (inc.balanceAccountPartnerName || '').trim().toUpperCase();
    if (pAccountName && pAccountName !== 'LOKESH') partnerSet.add(pAccountName);
    const pAccountId = (inc.balanceAccountPartnerId || '').toString().trim().toUpperCase();
    if (pAccountId && isNaN(Number(pAccountId)) && pAccountId !== 'LOKESH') partnerSet.add(pAccountId);
  });

  expenseList.forEach((exp) => {
    const paidBy = (exp.paidBy || '').trim().toUpperCase();
    if (paidBy && paidBy !== 'HOTEL' && paidBy !== 'CASH' && paidBy !== 'LOKESH') partnerSet.add(paidBy);
    const paidByPartnerId = (exp.paidByPartnerId || '').toString().trim().toUpperCase();
    if (paidByPartnerId && isNaN(Number(paidByPartnerId)) && paidByPartnerId !== 'LOKESH') partnerSet.add(paidByPartnerId);
  });

  // Preserve official partners order first, then any extra dynamically discovered partners
  const sortedPartners: string[] = [];
  OFFICIAL_PARTNERS.forEach((p) => {
    if (partnerSet.has(p)) {
      sortedPartners.push(p);
      partnerSet.delete(p);
    }
  });
  Array.from(partnerSet)
    .sort((a, b) => a.localeCompare(b))
    .forEach((p) => sortedPartners.push(p));

  return sortedPartners.map((partnerName) => {
    // 1. Partner Balance (Unpaid balance owed by or attributed to this partner in this report)
    const partnerBalance = incomeList.reduce((sum, inc) => {
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

    // 2. Partner Expenses (Expenses paid by this partner in this report)
    const expensesByThem = expenseList.reduce((sum, exp) => {
      const paidBy = (exp.paidBy || '').trim();
      const paidByPartnerId = (exp.paidByPartnerId || '').toString().trim();

      if (matchPartnerName(paidBy, partnerName) || matchPartnerName(paidByPartnerId, partnerName)) {
        return sum + (Number(exp.amount) || 0);
      }
      return sum;
    }, 0);

    // 3. Partner To Hotel = Partner Balance - Partner Expenses
    const toHotel = partnerBalance - expensesByThem;

    return {
      partner: partnerName,
      partnerBalance,
      expensesByThem,
      toHotel,
      balanceToHotel: toHotel,
      netBalance: toHotel,
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

  if (inc.mealPlan === 'other') {
    const customName = (inc.mealType ? String(inc.mealType).trim().toUpperCase() : '') || 'OTHER';
    const count = inc.membersCount || 0;
    return count > 0 ? `${customName} (${count})` : customName;
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
 * Displaying clean 2-column grid:
 * Row 1: Opening Balance (left) | Total Income (right)
 * Row 2: Received (left)        | Total Expense (right)
 * Row 3: CLOSING BALANCE (date): Rs. XXX (Full-width green box)
 * Row 4+: [PARTNER] TO HOTEL: Rs. XXX (Full-width gold/red box for each partner with non-zero balance)
 */
const drawSummaryBox = (
  doc: jsPDF,
  startY: number,
  openingBalance: number,
  openingDateStr: string,
  totalIncome: number,
  totalPaid: number,
  totalExpense: number,
  closingBalance: number,
  closingDateStr: string,
  partnerTotals: PartnerCalculationResult[],
  fontFamily: string,
  leftMargin: number,
  contentWidth: number,
  pageHeight: number
): number => {
  let y = startY;

  // Filter: ONLY partners who have a non-zero calculated balance for this report/date
  const activePartners = (partnerTotals || []).filter((p) => {
    const rounded = Math.round((p.toHotel + Number.EPSILON) * 100) / 100;
    return rounded !== 0;
  });

  const partnerBoxesHeight = activePartners.length > 0 ? activePartners.length * 16 + 1 : 0;
  const actualBoxHeight = 67 + partnerBoxesHeight;

  // Space check: ensure room for summary box before bottom footer line
  if (y + actualBoxHeight > pageHeight - 26) {
    doc.addPage();
    y = 36;
  }

  // Summary Container (Clean, luxury black/gold border)
  doc.setFillColor(254, 254, 252);
  doc.setDrawColor(212, 175, 55); // Gold border
  doc.setLineWidth(1.0);
  doc.roundedRect(leftMargin, y, contentWidth, actualBoxHeight, 2, 2, 'FD');

  // Title Pill
  doc.setFillColor(212, 175, 55);
  doc.roundedRect(leftMargin, y, 76, 13, 2, 2, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(10, 10, 10);
  doc.text('SUMMARY', leftMargin + 6, y + 9.5);

  const colW2 = contentWidth / 2;

  // Row 1: Opening Balance (Left Col) & Total Income (Right Col)
  const row1Y = y + 22;

  // 1. Opening Balance (Date)
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(70, 70, 70);
  doc.text(`Opening Balance (${openingDateStr}):`, leftMargin + 10, row1Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(20, 20, 20);
  doc.text(formatPdfCurrency(openingBalance), leftMargin + colW2 - 14, row1Y, { align: 'right' });

  // 2. Total Income
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(70, 70, 70);
  doc.text('Total Income:', leftMargin + colW2 + 14, row1Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalIncome), leftMargin + contentWidth - 14, row1Y, { align: 'right' });

  // Row 2: Received (Left Col) & Total Expense (Right Col)
  const row2Y = y + 36;

  // 3. Received (Total Paid)
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(70, 70, 70);
  doc.text('Received:', leftMargin + 10, row2Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalPaid), leftMargin + colW2 - 14, row2Y, { align: 'right' });

  // 4. Total Expense
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(70, 70, 70);
  doc.text('Total Expense:', leftMargin + colW2 + 14, row2Y);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(180, 24, 24); // Red
  doc.text(formatPdfCurrency(totalExpense), leftMargin + contentWidth - 14, row2Y, { align: 'right' });

  // Row 3: Prominent CLOSING BALANCE Full-Width Green Highlight Box
  doc.setFillColor(240, 253, 244); // Soft pale green tint
  doc.setDrawColor(22, 101, 52); // Dark bold green border
  doc.setLineWidth(0.8);
  doc.roundedRect(leftMargin + 6, y + 48, contentWidth - 12, 14, 1.5, 1.5, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(22, 101, 52); // Dark Bold Green for entire text and amount
  doc.text(
    `CLOSING BALANCE (${closingDateStr}): ${formatPdfCurrency(closingBalance)}`,
    leftMargin + contentWidth / 2,
    y + 57.5,
    { align: 'center' }
  );

  // Row 4+: Partner Highlight Box(es) inside Summary (ONLY displayed if calculated balance !== 0)
  activePartners.forEach((p, idx) => {
    const rounded = Math.round((p.toHotel + Number.EPSILON) * 100) / 100;
    const isPositive = rounded > 0;
    const isIrshad = (p.partner || '').trim().toUpperCase() === 'IRSHAD';
    const partnerLabel = isPositive
      ? (isIrshad
          ? `IRSHAD OUTSTANDING: ${formatPdfCurrency(rounded)}`
          : `${p.partner} TO HOTEL: ${formatPdfCurrency(rounded)}`)
      : `HOTEL TO ${p.partner}: ${formatPdfCurrency(Math.abs(rounded))}`;

    const boxY = y + 65 + idx * 16;
    doc.setFillColor(isPositive ? 250 : 240, isPositive ? 245 : 253, isPositive ? 230 : 244);
    doc.setDrawColor(isPositive ? 212 : 22, isPositive ? 175 : 101, isPositive ? 55 : 52);
    doc.setLineWidth(0.8);
    doc.roundedRect(leftMargin + 6, boxY, contentWidth - 12, 14, 1.5, 1.5, 'FD');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(isPositive ? 180 : 22, isPositive ? 24 : 101, isPositive ? 24 : 52);
    doc.text(
      partnerLabel,
      leftMargin + contentWidth / 2,
      boxY + 9.5,
      { align: 'center' }
    );
  });

  return y + actualBoxHeight;
};

/**
 * GENERATE DAILY ACCOUNTS PDF (A4 Portrait)
 */
export const generateDailyAccountsPdf = (
  dateStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  accountMonths?: AccountMonthRow[],
  partnerSettlements?: PartnerSettlement[],
  partners?: Partner[]
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
      'PARTICULARS', 'PAID BY', 'AMOUNT',
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
      0: { cellWidth: 118 }, // Income NAME
      1: { cellWidth: 44, halign: 'center' }, // Income MEAL
      2: { cellWidth: 58, halign: 'right' }, // Income BALANCE
      3: { cellWidth: 54, halign: 'right' }, // Income PAID
      4: { cellWidth: 56, halign: 'right', fontStyle: 'bold' }, // Income TOTAL
      5: { cellWidth: 103 }, // Expense PARTICULARS
      6: { cellWidth: 56 }, // Expense PAID BY
      7: { cellWidth: 58, halign: 'right', fontStyle: 'bold' }, // Expense AMOUNT
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

  // 1. Calculate partner totals for this report/date using unified running partner balance
  const partnerBalances = calculatePartnerBalancesForDate(
    dateStr,
    incomeRecords,
    expenseRecords,
    partnerSettlements || [],
    partners || []
  );

  const partnerTotals: PartnerCalculationResult[] = partnerBalances.map((pb) => ({
    partner: pb.partnerName,
    partnerBalance: pb.incomeBalanceAdded,
    expensesByThem: pb.expensesPaid,
    toHotel: pb.netBalance,
    balanceToHotel: pb.netBalance > 0 ? pb.netBalance : 0,
    netBalance: pb.netBalance,
    displayLabel: pb.displayLabel,
    displayAmount: pb.displayAmount,
    isZero: pb.isZero,
  }));

  // 2. Draw Summary Box after ledger table (includes partner balance(s))
  currentY = drawSummaryBox(
    doc,
    currentY,
    openingBalance,
    dateFormattedMedium,
    totalIncome,
    totalPaid,
    totalExpense,
    closingBalance,
    dateFormattedMedium,
    partnerTotals,
    fontFamily,
    leftMargin,
    contentWidth,
    pageHeight
  );

  // 3. Draw Page Numbers and Headers across generated pages
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
  partnerSettlements?: PartnerSettlement[],
  partners?: Partner[]
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

  // Unique dates that actually have accounts in this month (sorted chronologically)
  const uniqueDates = Array.from(
    new Set([
      ...monthIncome.map((r) => r.date).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ...monthExpenses.map((r) => r.date).filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ])
  ).sort((a, b) => a.localeCompare(b));

  // Determine actual cutoff dates for summary labels:
  // - Opening Date: First recorded entry date or 1st of month
  // - Closing Date: If month is closed in DB, use closed_at; if open, use latest accounting date available in this month
  const firstDateFormatted = uniqueDates.length > 0
    ? formatPdfDateMedium(uniqueDates[0])
    : formatPdfDateMedium(`${monthStr}-01`);

  let closingDateFormatted = '';
  const dbMonth = accountMonths?.find((m) => m.month_start && m.month_start.startsWith(monthStr));
  if (dbMonth?.is_closed && dbMonth.closed_at) {
    closingDateFormatted = formatPdfDateMedium(dbMonth.closed_at.substring(0, 10));
  } else if (uniqueDates.length > 0) {
    closingDateFormatted = formatPdfDateMedium(uniqueDates[uniqueDates.length - 1]);
  } else {
    closingDateFormatted = formatPdfDateMedium(monthData?.lastDate || `${monthStr}-01`);
  }

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
  currentY += 12;

  // Table Header definition
  const tableHead = [
    [
      {
        content: 'INCOME',
        colSpan: 5,
        styles: {
          halign: 'center',
          fillColor: [26, 26, 26],
          textColor: [212, 175, 55],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
      },
      {
        content: 'EXPENSE',
        colSpan: 3,
        styles: {
          halign: 'center',
          fillColor: [35, 35, 35],
          textColor: [212, 175, 55],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
      },
    ],
    [
      'NAME',
      'MEAL',
      'BALANCE',
      'PAID',
      'TOTAL',
      'PARTICULARS',
      'PAID BY',
      'AMOUNT',
    ],
  ];

  if (uniqueDates.length === 0) {
    // No transactions for the month
    const emptyBody = [['No transactions found for this month.', '', '', '', '', '', '', '']];
    autoTable(doc, {
      head: tableHead as any,
      body: emptyBody,
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
      columnStyles: {
        0: { cellWidth: 118 },
        1: { cellWidth: 44, halign: 'center' },
        2: { cellWidth: 58, halign: 'right' },
        3: { cellWidth: 54, halign: 'right' },
        4: { cellWidth: 56, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 103 },
        6: { cellWidth: 56 },
        7: { cellWidth: 58, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === 0 && data.section === 'body') {
          if (data.column.index === 0) {
            data.cell.colSpan = 8;
            data.cell.styles.halign = 'center';
            data.cell.styles.textColor = [120, 120, 120];
            data.cell.styles.fontStyle = 'italic';
          }
        }
      },
      showHead: 'everyPage',
      pageBreak: 'auto',
    });
    currentY = (doc as any).lastAutoTable.finalY + 12;
  } else {
    // Render each date that has accounts
    for (let dIdx = 0; dIdx < uniqueDates.length; dIdx++) {
      const dateStr = uniqueDates[dIdx];
      const dayIncome = monthIncome.filter((r) => r.date === dateStr);
      const dayExpenses = monthExpenses.filter((r) => r.date === dateStr);
      const maxRows = Math.max(dayIncome.length, dayExpenses.length);

      if (maxRows === 0) continue;

      const dayBody: string[][] = [];
      for (let i = 0; i < maxRows; i++) {
        const inc = dayIncome[i];
        const exp = dayExpenses[i];

        const incName = inc ? formatIncomeName(inc) : '';
        const incMeal = inc ? formatMealColumn(inc) : '';
        const incBalance = inc ? formatIncomeBalance(inc) : '';
        const incPaid = inc ? formatPdfCurrency(inc.amountPaid || 0) : '';
        const incTotal = inc ? formatPdfCurrency(inc.total || 0) : '';

        const expName = exp ? formatExpenseName(exp) : '';
        const expPaidBy = exp ? (exp.paidBy || 'Hotel').trim() : '';
        const expAmount = exp ? formatPdfCurrency(exp.amount || 0) : '';

        dayBody.push([
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

      // Calculate daily total income and expense for this specific date ONLY
      const dayTotalIncome = dayIncome.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
      const dayTotalExpense = dayExpenses.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      // Append daily total row immediately after this day's ledger entries
      dayBody.push([
        'TOTAL INCOME:',
        '',
        '',
        '',
        formatPdfCurrency(dayTotalIncome),
        'TOTAL EXPENSE:',
        '',
        formatPdfCurrency(dayTotalExpense),
      ]);

      // Calculate required vertical height for this complete date section:
      // columns widths: [118, 44, 58, 54, 56, 103, 56, 58]
      const colWidths = [118, 44, 58, 54, 56, 103, 56, 58];
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(7);

      let estimatedRowsHeight = 0;
      for (let rIdx = 0; rIdx < dayBody.length; rIdx++) {
        const row = dayBody[rIdx];
        let maxLines = 1;
        if (row[0]) {
          const lines0 = doc.splitTextToSize(String(row[0]), colWidths[0] - 8).length;
          if (lines0 > maxLines) maxLines = lines0;
        }
        if (row[5]) {
          const lines5 = doc.splitTextToSize(String(row[5]), colWidths[5] - 8).length;
          if (lines5 > maxLines) maxLines = lines5;
        }
        estimatedRowsHeight += Math.max(15.5, 6.5 + maxLines * 8.5);
      }

      const dateHeadingHeight = 12; // Date label text + spacing
      const tableHeadersHeight = 32; // Two header rows (INCOME/EXPENSE + column labels)
      const safetyBuffer = 6; // Safety margin to prevent boundary split
      const totalDateSectionHeight = dateHeadingHeight + tableHeadersHeight + estimatedRowsHeight + safetyBuffer;

      // Usable bottom margin is 32pt (above footer line at pageHeight - 20)
      const bottomLimit = pageHeight - 32;
      const maxSinglePageHeight = bottomLimit - 36; // Maximum available height on a single fresh page (~774pt)

      // Pagination Rules:
      // 1. If a normal date section CAN fit on a single page (totalDateSectionHeight <= maxSinglePageHeight):
      //    Keep the entire day together! If it doesn't fit in the remaining page space, move to the next page.
      // 2. If a day's section itself is larger than one page (totalDateSectionHeight > maxSinglePageHeight):
      //    Remove the restriction! Allow that day's section to continue naturally onto the next page.
      //    Only move to the next page if there is not even minimal room (< 58pt) to cleanly start the day
      //    with its heading, table headers, and initial rows.
      if (totalDateSectionHeight <= maxSinglePageHeight) {
        // Normal date: fits on a single page.
        // If it cannot fit in remaining space on this page, move the ENTIRE date section to the next page.
        if (currentY + totalDateSectionHeight > bottomLimit && currentY > 40) {
          doc.addPage();
          currentY = 36;
        }
      } else {
        // Large single-day section: exceeds a single page.
        // Allow it to span multiple pages naturally.
        // Only start on a new page if the current page has almost no room left for heading + table headers + row (~58pt).
        if (currentY + 58 > bottomLimit && currentY > 40) {
          doc.addPage();
          currentY = 36;
        }
      }

      // Date Label Header (e.g. "1 SEPT • 01 Sept 2026") - Noticeably Bolder & Larger
      const dayHeader = formatDayHeader(dateStr);
      const fullDateMedium = formatPdfDateMedium(dateStr);

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(180, 130, 20); // Warm Gold
      doc.text(dayHeader, leftMargin, currentY + 6);

      const dayHeaderWidth = doc.getTextWidth(dayHeader);

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(40, 40, 40); // Noticeably bold dark gray/black
      doc.text(`•  ${fullDateMedium}`, leftMargin + dayHeaderWidth + 6, currentY + 6);

      currentY += 12;

      let pagesDrawnForTable = 0;

      autoTable(doc, {
        head: tableHead as any,
        body: dayBody,
        startY: currentY,
        margin: { left: leftMargin, right: rightMargin, top: 48, bottom: 32 },
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
          0: { cellWidth: 118 }, // Income NAME
          1: { cellWidth: 44, halign: 'center' }, // Income MEAL
          2: { cellWidth: 58, halign: 'right' }, // Income BALANCE
          3: { cellWidth: 54, halign: 'right' }, // Income PAID
          4: { cellWidth: 56, halign: 'right', fontStyle: 'bold' }, // Income TOTAL
          5: { cellWidth: 103 }, // Expense PARTICULARS
          6: { cellWidth: 56 }, // Expense PAID BY
          7: { cellWidth: 58, halign: 'right', fontStyle: 'bold' }, // Expense AMOUNT
        },
        didParseCell: (data) => {
          // Visually dark daily total row before next date begins
          if (data.section === 'body' && data.row.index === dayBody.length - 1) {
            data.cell.styles.fillColor = [30, 30, 30]; // Visually dark row background
            data.cell.styles.textColor = [255, 255, 255]; // Crisp white text
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 7;
          }
        },
        didDrawCell: (data) => {
          // Thicker vertical divider between INCOME (col 0-4) and EXPENSE (col 5-7)
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
        didDrawPage: () => {
          // Track pages rendered by this table
          pagesDrawnForTable++;
          // When a large single-day section spans onto subsequent page(s),
          // repeat the date heading on the new page above the repeated table header.
          if (pagesDrawnForTable > 1) {
            doc.setFont(fontFamily, 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(180, 130, 20); // Warm Gold
            doc.text(dayHeader, leftMargin, 42);

            const dayHdrWidth = doc.getTextWidth(dayHeader);

            doc.setFont(fontFamily, 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(40, 40, 40); // Noticeably bold dark gray/black
            doc.text(`•  ${fullDateMedium}`, leftMargin + dayHdrWidth + 6, 42);
          }
        },
        showHead: 'everyPage',
        pageBreak: 'auto',
      });

      currentY = (doc as any).lastAutoTable.finalY + 11;
    }
  }

  // 1. Calculate partner totals for this month's report using unified running partner balance
  const partnerBalances = calculatePartnerBalancesForMonth(
    monthStr,
    incomeRecords,
    expenseRecords,
    partnerSettlements || [],
    partners || []
  );

  const partnerTotals: PartnerCalculationResult[] = partnerBalances.map((pb) => ({
    partner: pb.partnerName,
    partnerBalance: pb.incomeBalanceAdded,
    expensesByThem: pb.expensesPaid,
    toHotel: pb.netBalance,
    balanceToHotel: pb.netBalance > 0 ? pb.netBalance : 0,
    netBalance: pb.netBalance,
    displayLabel: pb.displayLabel,
    displayAmount: pb.displayAmount,
    isZero: pb.isZero,
  }));

  // 2. Draw Summary Box after ledger tables (includes partner balance(s))
  currentY = drawSummaryBox(
    doc,
    currentY,
    openingBalance,
    firstDateFormatted,
    totalIncome,
    totalPaid,
    totalExpense,
    closingBalance,
    closingDateFormatted,
    partnerTotals,
    fontFamily,
    leftMargin,
    contentWidth,
    pageHeight
  );

  // 3. Draw Page Numbers and Headers across all generated pages
  drawPageHeaderAndFooter(doc, fontFamily, pageWidth, pageHeight, leftMargin, rightMargin);

  return doc;
};

/**
 * GENERATE CLOSING BALANCE PDF (Strictly 1 Page, Luxury Black & Gold Design)
 * Specifically for Analytics -> Closing Balance page
 */
export const generateClosingBalancePdf = (
  monthStr: string, // YYYY-MM
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  accountMonths?: AccountMonthRow[],
  partnerSettlements?: PartnerSettlement[],
  partners?: Partner[]
): jsPDF => {
  // 1. Calculate Monthly Summaries
  const allMonths = calculateAllMonthsSummary(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );

  const monthIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(monthStr));
  const monthExpenses = expenseRecords.filter((r) => r.date && r.date.startsWith(monthStr));

  const totalIncome = monthIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalExpense = monthExpenses.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const monthData = allMonths[monthStr];
  const openingBalance = monthData?.openingBalance ?? 0;
  const closingBalance = monthData?.closingBalance ?? (openingBalance + totalIncome - totalExpense);

  const dbMonth = accountMonths?.find((m) => m.month_start && m.month_start.startsWith(monthStr));
  const isClosed = Boolean(dbMonth?.is_closed ?? monthData?.isClosed);

  const monthFormatted = formatPdfMonth(monthStr); // e.g. "September 2026"

  // Profit Distribution Calculations (75% / 25% of Closing Balance)
  const profitMagnifique = Math.round(Math.max(0, closingBalance) * 0.75);
  const profitPartners = Math.round(Math.max(0, closingBalance) * 0.25);

  // 2. Partner Data Extraction
  // Target partners: IRSHAD, ANSARI, SATHISH, YOGESH (and any other active partners)
  const targetPartners = ['IRSHAD', 'ANSARI', 'SATHISH', 'YOGESH'];
  const allPartnersList = partners || [];

  // Collect all distinct months up to selected monthStr
  const monthsSet = new Set<string>();
  incomeRecords.forEach((r) => r.date && monthsSet.add(r.date.substring(0, 7)));
  expenseRecords.forEach((r) => r.date && monthsSet.add(r.date.substring(0, 7)));
  (partnerSettlements || []).forEach((s) => {
    const m = s.settlementMonth
      ? s.settlementMonth.substring(0, 7)
      : s.date
      ? s.date.substring(0, 7)
      : '';
    if (m) monthsSet.add(m);
  });
  if (monthStr) monthsSet.add(monthStr);

  const allSortedMonths = Array.from(monthsSet)
    .filter((m) => m <= monthStr)
    .sort();

  interface BalanceMonthItem {
    month: string;
    monthName: string;
    amount: number;
    direction: 'to_hotel' | 'from_hotel';
  }

  interface PartnerPdfSection {
    partnerName: string;
    balanceLabel: string;
    balanceDirection: 'to_hotel' | 'from_hotel';
    balanceMonths: BalanceMonthItem[];
    totalBalance: number;
    showBalanceTotal: boolean;
    expenseLabel: string;
    expenseMonths: { month: string; monthName: string; amount: number }[];
    totalExpense: number;
    showExpenseTotal: boolean;
  }

  const partnerSections: PartnerPdfSection[] = [];

  for (const name of targetPartners) {
    const p = allPartnersList.find((pt) => pt.name.trim().toUpperCase() === name);
    const pid = p?.id;

    const balanceMonths: BalanceMonthItem[] = [];
    const expenseMonths: { month: string; monthName: string; amount: number }[] = [];

    for (const m of allSortedMonths) {
      const mInc = incomeRecords
        .filter((r) => r.date && r.date.startsWith(m) && isIncomeAssignedToPartner(r, name, pid))
        .reduce((sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0), 0);
      const mExp = expenseRecords
        .filter((r) => r.date && r.date.startsWith(m) && isExpensePaidByPartner(r, name, pid))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      const mSettled = (partnerSettlements || []).filter((s) => {
        if (!isSettlementForPartner(s, name, pid)) return false;
        const sM = s.settlementMonth
          ? s.settlementMonth.substring(0, 7)
          : s.date
          ? s.date.substring(0, 7)
          : '';
        return sM === m;
      });

      const toHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'to_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const fromHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'from_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      const net = Math.round(mInc - mExp - toHotel + fromHotel);
      if (net > 0) {
        balanceMonths.push({
          month: m,
          monthName: formatPdfMonth(m).split(' ')[0],
          amount: net,
          direction: 'to_hotel',
        });
      } else if (net < 0) {
        balanceMonths.push({
          month: m,
          monthName: formatPdfMonth(m).split(' ')[0],
          amount: Math.abs(net),
          direction: 'from_hotel',
        });
      }

      if (mExp > 0) {
        expenseMonths.push({
          month: m,
          monthName: formatPdfMonth(m).split(' ')[0],
          amount: mExp,
        });
      }
    }

    // Cumulative net balance across all months up to selected month
    const cumulativeNet = allSortedMonths.reduce((sum, m) => {
      const mInc = incomeRecords
        .filter((r) => r.date && r.date.startsWith(m) && isIncomeAssignedToPartner(r, name, pid))
        .reduce((s, r) => s + (Number(r.balance) > 0 ? Number(r.balance) : 0), 0);
      const mExp = expenseRecords
        .filter((r) => r.date && r.date.startsWith(m) && isExpensePaidByPartner(r, name, pid))
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const mSettled = (partnerSettlements || []).filter((s) => {
        if (!isSettlementForPartner(s, name, pid)) return false;
        const sM = s.settlementMonth
          ? s.settlementMonth.substring(0, 7)
          : s.date
          ? s.date.substring(0, 7)
          : '';
        return sM === m;
      });
      const toHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'to_hotel')
        .reduce((s, sItem) => s + (Number(sItem.amount) || 0), 0);
      const fromHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'from_hotel')
        .reduce((s, sItem) => s + (Number(sItem.amount) || 0), 0);
      return sum + (mInc - mExp - toHotel + fromHotel);
    }, 0);

    const balanceDirection: 'to_hotel' | 'from_hotel' = cumulativeNet >= 0 ? 'to_hotel' : 'from_hotel';
    const balanceLabel = balanceDirection === 'to_hotel'
      ? `${name} TO HOTEL`
      : `HOTEL TO ${name}`;

    const totalBalance = Math.abs(Math.round(cumulativeNet));
    // Rule: Only show TOTAL OUTSTANDING when partner has outstanding from 2 OR MORE months
    const showBalanceTotal = balanceMonths.length >= 2;
    const totalExpense = expenseMonths.reduce((sum, e) => sum + e.amount, 0);
    // Rule: Only show TOTAL EXPENSE when partner has expense from 2 OR MORE months
    const showExpenseTotal = expenseMonths.length >= 2;
    const expenseLabel = `EXPENSE BY ${name}`;

    // Only include partner if they have balance or expenses
    if (balanceMonths.length > 0 || expenseMonths.length > 0) {
      partnerSections.push({
        partnerName: name,
        balanceLabel,
        balanceDirection,
        balanceMonths,
        totalBalance,
        showBalanceTotal,
        expenseLabel,
        expenseMonths,
        totalExpense,
        showExpenseTotal,
      });
    }
  }

  // 3. Initialize jsPDF (Strictly 1-page A4 Portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const fontFamily = PDF_FONT;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~841.89 pt
  const leftMargin = 32;
  const rightMargin = 32;
  const contentWidth = pageWidth - leftMargin - rightMargin; // ~531.28 pt

  // Luxury Background Subtle Accent
  doc.setFillColor(254, 254, 252);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Top Dark Border Bar
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageWidth, 5, 'F');

  // --- TOP HEADER ---
  let currentY = 38;

  // Title: MAGNIFIQUE 2.0
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text('MAGNIFIQUE 2.0', leftMargin, currentY);

  // Sub-title: CLOSING BALANCE
  currentY += 16;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(190, 140, 20); // Luxury Gold
  doc.text('CLOSING BALANCE', leftMargin, currentY);

  // Month: September 2026
  currentY += 14;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(70, 70, 70);
  doc.text(monthFormatted, leftMargin, currentY);

  // Status Badge on the right
  const statusText = isClosed ? 'MONTH STATUS: CLOSED' : 'MONTH STATUS: ACTIVE / OPEN';
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  const badgeTextWidth = doc.getTextWidth(statusText);
  const badgePaddingX = 10;
  const badgeWidth = badgeTextWidth + badgePaddingX * 2;
  const badgeHeight = 20;
  const badgeX = pageWidth - rightMargin - badgeWidth;
  const badgeY = 36;

  if (isClosed) {
    doc.setFillColor(254, 242, 242); // Soft red
    doc.setDrawColor(239, 68, 68);
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 3, 3, 'FD');
    doc.setTextColor(185, 28, 28);
    doc.text(statusText, badgeX + badgePaddingX, badgeY + 13.5);
  } else {
    doc.setFillColor(240, 253, 244); // Soft green
    doc.setDrawColor(34, 197, 94);
    doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 3, 3, 'FD');
    doc.setTextColor(21, 128, 61);
    doc.text(statusText, badgeX + badgePaddingX, badgeY + 13.5);
  }

  // Gold Divider Line
  currentY += 12;
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.5);
  doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);

  // --- SECTION: 3 KEY METRICS ---
  currentY += 14;

  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  const cardHeight = 48;

  // 1. TOTAL INCOME
  const col1X = leftMargin;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(187, 247, 208); // Green border
  doc.setLineWidth(0.8);
  doc.roundedRect(col1X, currentY, cardWidth, cardHeight, 3, 3, 'FD');

  doc.setFillColor(34, 197, 94);
  doc.rect(col1X, currentY, cardWidth, 2.5, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52);
  doc.text('TOTAL INCOME', col1X + 10, currentY + 16);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(22, 101, 52);
  doc.text(formatPdfCurrency(totalIncome), col1X + 10, currentY + 36);

  // 2. TOTAL EXPENSE
  const col2X = col1X + cardWidth + cardGap;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(254, 202, 202); // Red border
  doc.setLineWidth(0.8);
  doc.roundedRect(col2X, currentY, cardWidth, cardHeight, 3, 3, 'FD');

  doc.setFillColor(239, 68, 68);
  doc.rect(col2X, currentY, cardWidth, 2.5, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 28, 28);
  doc.text('TOTAL EXPENSE', col2X + 10, currentY + 16);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(185, 28, 28);
  doc.text(formatPdfCurrency(totalExpense), col2X + 10, currentY + 36);

  // 3. CLOSING BALANCE
  const col3X = col2X + cardWidth + cardGap;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(212, 175, 55); // Gold border
  doc.setLineWidth(1.0);
  doc.roundedRect(col3X, currentY, cardWidth, cardHeight, 3, 3, 'FD');

  doc.setFillColor(212, 175, 55);
  doc.rect(col3X, currentY, cardWidth, 2.5, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 130, 20);
  doc.text('CLOSING BALANCE', col3X + 10, currentY + 16);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(180, 130, 20);
  doc.text(formatPdfCurrency(closingBalance), col3X + 10, currentY + 36);

  // --- SECTION: PROFIT DISTRIBUTION ---
  currentY += cardHeight + 10;
  const pCardW = (contentWidth - 10) / 2;
  const pCardH = 38;

  // Magnifique 75%
  doc.setFillColor(254, 253, 248);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.8);
  doc.roundedRect(leftMargin, currentY, pCardW, pCardH, 3, 3, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 130, 20);
  doc.text('PROFIT DISTRIBUTION • MAGNIFIQUE 75%', leftMargin + 10, currentY + 14);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(formatPdfCurrency(profitMagnifique), leftMargin + 10, currentY + 30);

  // Irshad + Ansari 25%
  const pCol2X = leftMargin + pCardW + 10;
  doc.setFillColor(250, 254, 250);
  doc.setDrawColor(187, 247, 208);
  doc.setLineWidth(0.8);
  doc.roundedRect(pCol2X, currentY, pCardW, pCardH, 3, 3, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52);
  doc.text('PROFIT DISTRIBUTION • IRSHAD + ANSARI 25%', pCol2X + 10, currentY + 14);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(formatPdfCurrency(profitPartners), pCol2X + 10, currentY + 30);

  // --- SECTION: PARTNER OUTSTANDING & EXPENSES ---
  currentY += pCardH + 14;

  // Header Banner
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(leftMargin, currentY, contentWidth, 22, 2, 2, 'F');

  doc.setFillColor(212, 175, 55); // Gold indicator
  doc.rect(leftMargin, currentY, 3.5, 22, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('PARTNER OUTSTANDING & EXPENSES', leftMargin + 12, currentY + 14.5);

  currentY += 30;
  const footerY = pageHeight - 48;

  if (partnerSections.length === 0) {
    // Clean Empty State
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.8);
    doc.roundedRect(leftMargin, currentY, contentWidth, 36, 2, 2, 'FD');

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text('All partner accounts are fully settled or balanced for this period.', leftMargin + 14, currentY + 22);
  } else {
    // Render Separate Card for EACH Partner
    for (const pSec of partnerSections) {
      // Calculate dynamic card height
      let linesCount = 0;
      if (pSec.balanceMonths.length > 0) {
        linesCount += 1 + pSec.balanceMonths.length + (pSec.showBalanceTotal ? 1 : 0);
      }
      if (pSec.expenseMonths.length > 0) {
        if (pSec.balanceMonths.length > 0) linesCount += 0.4; // divider spacing
        linesCount += 1 + pSec.expenseMonths.length + (pSec.showExpenseTotal ? 1 : 0);
      }

      // Height: Header bar (20pt) + content lines + padding
      const cardContentH = 20 + Math.ceil(linesCount * 13) + 8;

      // Page boundary check
      if (currentY + cardContentH > footerY - 10) {
        doc.addPage();
        doc.setFillColor(254, 254, 252);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        doc.setFillColor(26, 26, 26);
        doc.rect(0, 0, pageWidth, 5, 'F');
        currentY = 35;
      }

      // Card Container
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(220, 220, 218);
      doc.setLineWidth(0.75);
      doc.roundedRect(leftMargin, currentY, contentWidth, cardContentH, 2.5, 2.5, 'FD');

      // Card Header: Partner Name
      doc.setFillColor(248, 248, 246);
      doc.roundedRect(leftMargin, currentY, contentWidth, 20, 2.5, 2.5, 'F');
      doc.setFillColor(212, 175, 55);
      doc.rect(leftMargin, currentY, 3, 20, 'F');

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      doc.text(pSec.partnerName, leftMargin + 10, currentY + 13.5);

      let innerY = currentY + 30;

      // Subsection A: BALANCE TO HOTEL / HOTEL TO PARTNER
      if (pSec.balanceMonths.length > 0) {
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.5);
        if (pSec.balanceDirection === 'to_hotel') {
          doc.setTextColor(180, 130, 20);
        } else {
          doc.setTextColor(21, 128, 61);
        }
        doc.text(pSec.balanceLabel, leftMargin + 12, innerY);
        innerY += 12;

        pSec.balanceMonths.forEach((b) => {
          doc.setFont(fontFamily, 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(50, 50, 50);
          doc.text(b.monthName, leftMargin + 18, innerY);

          doc.setFont(fontFamily, 'bold');
          doc.setTextColor(20, 20, 20);
          doc.text(formatPdfCurrency(b.amount), leftMargin + contentWidth - 16, innerY, { align: 'right' });
          innerY += 13;
        });

        // Show TOTAL OUTSTANDING only if >= 2 months
        if (pSec.showBalanceTotal) {
          doc.setFont(fontFamily, 'bold');
          doc.setFontSize(8.5);
          if (pSec.balanceDirection === 'to_hotel') {
            doc.setTextColor(180, 130, 20);
          } else {
            doc.setTextColor(21, 128, 61);
          }
          doc.text('TOTAL OUTSTANDING', leftMargin + 18, innerY);
          doc.text(formatPdfCurrency(pSec.totalBalance), leftMargin + contentWidth - 16, innerY, { align: 'right' });
          innerY += 14;
        }
      }

      // Subsection B: EXPENSE BY PARTNER
      if (pSec.expenseMonths.length > 0) {
        if (pSec.balanceMonths.length > 0) {
          doc.setDrawColor(235, 235, 235);
          doc.setLineWidth(0.5);
          doc.line(leftMargin + 10, innerY - 4, leftMargin + contentWidth - 10, innerY - 4);
          innerY += 4;
        }

        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(185, 28, 28);
        doc.text(pSec.expenseLabel, leftMargin + 12, innerY);
        innerY += 12;

        pSec.expenseMonths.forEach((e) => {
          doc.setFont(fontFamily, 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(50, 50, 50);
          doc.text(e.monthName, leftMargin + 18, innerY);

          doc.setFont(fontFamily, 'bold');
          doc.setTextColor(20, 20, 20);
          doc.text(formatPdfCurrency(e.amount), leftMargin + contentWidth - 16, innerY, { align: 'right' });
          innerY += 13;
        });

        // Show TOTAL EXPENSE only if >= 2 months
        if (pSec.showExpenseTotal) {
          doc.setFont(fontFamily, 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(185, 28, 28);
          doc.text('TOTAL EXPENSE', leftMargin + 18, innerY);
          doc.text(formatPdfCurrency(pSec.totalExpense), leftMargin + contentWidth - 16, innerY, { align: 'right' });
          innerY += 14;
        }
      }

      currentY += cardContentH + 8;
    }
  }

  // --- FOOTER & OFFICIAL SIGN-OFF ---
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const dateFormatted = formatPdfDateMedium(now.toISOString().substring(0, 10));
  const timeFormatted = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);
    const footerY = pageHeight - 48;

    doc.setDrawColor(212, 175, 55); // Gold line
    doc.setLineWidth(0.75);
    doc.line(leftMargin, footerY, pageWidth - rightMargin, footerY);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on: ${dateFormatted}, ${timeFormatted}`, leftMargin, footerY + 15);

    doc.setFont(fontFamily, 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 130, 20);
    doc.text('Official Monthly Closing Record', leftMargin, footerY + 27);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text('Magnifique Business Management System', pageWidth - rightMargin, footerY + 15, { align: 'right' });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - rightMargin, footerY + 27, { align: 'right' });
  }

  return doc;
};
