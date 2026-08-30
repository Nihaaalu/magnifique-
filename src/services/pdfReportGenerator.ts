import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord } from '../types';

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

// Format Date YYYY-MM-DD to short display (e.g. 30 Aug)
export const formatPdfDateShort = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
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
    doc.setFontSize(9);
    doc.setTextColor(26, 26, 26);
    doc.text('MAGNIFIQUE 2.0', leftMargin, 20);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text('Restaurant Accounts Ledger', leftMargin + 86, 20);

    // Gold divider under header
    doc.setDrawColor(212, 175, 55); // Gold
    doc.setLineWidth(1.2);
    doc.line(leftMargin, 26, pageWidth - rightMargin, 26);

    // --- Bottom Footer ---
    doc.setDrawColor(220, 220, 220); // Subtle gray line
    doc.setLineWidth(0.6);
    doc.line(leftMargin, pageHeight - 24, pageWidth - rightMargin, pageHeight - 24);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text('MAGNIFIQUE 2.0 • Official Accounts Ledger', leftMargin, pageHeight - 13);

    const pageText = `Page ${i} of ${totalPages}`;
    doc.text(pageText, pageWidth - rightMargin, pageHeight - 13, { align: 'right' });
  }
};

/**
 * Format Meal Code:
 * B, L, D, B/L, B/D, L/D, B/L/D, ALACARTE
 */
const getMealCode = (inc: IncomeRecord): string => {
  if (inc.mealPlan === 'alacarte' || inc.incomeType === 'À La Carte' || inc.byWho === 'À LA CARTE') {
    return 'ALACARTE';
  }
  if (inc.mealPlan === '3_time' || inc.mealCombination === 'all') {
    return 'B/L/D';
  }
  if (inc.mealPlan === '2_time') {
    if (inc.mealCombination === 'breakfast_lunch') return 'B/L';
    if (inc.mealCombination === 'breakfast_dinner') return 'B/D';
    if (inc.mealCombination === 'lunch_dinner') return 'L/D';
    return 'B/L';
  }
  if (inc.mealPlan === '1_time') {
    if (inc.mealCombination === 'lunch' || inc.mealType === 'Lunch') return 'L';
    if (inc.mealCombination === 'dinner' || inc.mealType === 'Dinner') return 'D';
    return 'B';
  }
  if (inc.mealType === 'Lunch') return 'L';
  if (inc.mealType === 'Dinner') return 'D';
  if (inc.mealType === 'Breakfast') return 'B';
  return 'B';
};

/**
 * Format Income Cell:
 * Priority Order:
 * 1. NAME (By Who + Travel in brackets; For À LA CARTE: do NOT show By Who)
 * 2. MEAL (B, L, D, B/L, B/D, L/D, B/L/D, ALACARTE)
 * 3. BALANCE (Balance: ₹XX,XXX (PARTNER) or Balance: ₹ 0)
 * 4. PAID (Paid: ₹XX,XXX)
 * 5. TOTAL (Total: ₹XX,XXX)
 */
const formatIncomeCell = (inc: IncomeRecord): string => {
  const isAlaCarte = inc.mealPlan === 'alacarte' || inc.incomeType === 'À La Carte' || inc.byWho === 'À LA CARTE';

  // 1. NAME
  let nameLine = '';
  if (isAlaCarte) {
    nameLine = (inc.travels || '').trim() || '-';
  } else {
    const byWho = (inc.byWho || '').trim();
    const travels = (inc.travels || '').trim();
    if (byWho && travels) {
      nameLine = `${byWho} (${travels})`;
    } else if (byWho) {
      nameLine = byWho;
    } else if (travels) {
      nameLine = `(${travels})`;
    } else {
      nameLine = '-';
    }
  }

  // 2. MEAL
  const mealCode = getMealCode(inc);

  // 3. BALANCE
  const balanceAmount = inc.balance || 0;
  let balanceLine = '';
  if (balanceAmount > 0) {
    const partnerName = (inc.balanceAccountPartnerName || inc.balanceAccountPartnerId || '').trim();
    balanceLine = `Balance: ${formatPdfCurrency(balanceAmount)}${partnerName ? ` (${partnerName})` : ''}`;
  } else {
    balanceLine = 'Balance: Rs. 0';
  }

  // 4. PAID
  const paidLine = `Paid: ${formatPdfCurrency(inc.amountPaid || 0)}`;

  // 5. TOTAL
  const totalLine = `Total: ${formatPdfCurrency(inc.total || 0)}`;

  return [nameLine, mealCode, balanceLine, paidLine, totalLine].join('\n');
};

/**
 * Format Expense Cell:
 * Priority Order:
 * 1. NAME (Description if available, otherwise Category)
 * 2. PAID BY (Paid by: Partner/Hotel)
 * 3. AMOUNT (₹XX,XXX)
 */
const formatExpenseCell = (exp: ExpenseRecord): string => {
  const desc = (exp.name || '').trim();
  const nameLine = desc.length > 0 ? desc : (exp.category || 'Expense');
  const paidBy = (exp.paidBy || 'Hotel').trim();
  const paidByLine = `Paid by: ${paidBy}`;
  const amountLine = formatPdfCurrency(exp.amount || 0);

  return [nameLine, paidByLine, amountLine].join('\n');
};

// Unified Ledger Transaction Item
interface LedgerItem {
  id: string;
  date: string;
  type: 'income' | 'expense';
  incomeRecord?: IncomeRecord;
  expenseRecord?: ExpenseRecord;
  sortTimestamp: string;
}

/**
 * GENERATE DAILY ACCOUNTS PDF
 */
export const generateDailyAccountsPdf = (
  dateStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[]
): jsPDF => {
  // Filter for the specific day
  const todayIncome = incomeRecords.filter((r) => r.date === dateStr);
  const todayExpenses = expenseRecords.filter((r) => r.date === dateStr);

  const totalIncome = todayIncome.reduce((acc, r) => acc + (r.total || 0), 0);
  const totalPaid = todayIncome.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  const totalBalance = todayIncome.reduce((acc, r) => acc + (r.balance || 0), 0);
  const totalExpense = todayExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);

  // Combine into single chronological ledger
  const ledgerItems: LedgerItem[] = [
    ...todayIncome.map((inc) => ({
      id: inc.id,
      date: inc.date,
      type: 'income' as const,
      incomeRecord: inc,
      sortTimestamp: inc.created_at || inc.time || `${inc.date}T00:00:00`,
    })),
    ...todayExpenses.map((exp) => ({
      id: exp.id,
      date: exp.date,
      type: 'expense' as const,
      expenseRecord: exp,
      sortTimestamp: exp.created_at || exp.time || `${exp.date}T00:00:00`,
    })),
  ];

  // Stable sort by creation/time order
  ledgerItems.sort((a, b) => a.sortTimestamp.localeCompare(b.sortTimestamp));

  // Initialize Landscape A4 document
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const fontFamily = PDF_FONT;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~841.89 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~595.28 pt
  const leftMargin = 36;
  const rightMargin = 36;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  let currentY = 48;

  // Title & Header Branding
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text('MAGNIFIQUE 2.0', leftMargin, currentY);

  currentY += 16;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(180, 130, 20); // Warm Gold
  doc.text('DAILY ACCOUNT LEDGER', leftMargin, currentY);

  currentY += 14;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  const formattedDate = formatPdfDate(dateStr);
  doc.text(`Date: ${formattedDate}`, leftMargin, currentY);

  // Metadata right aligned
  const genTimestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${genTimestamp}`, pageWidth - rightMargin, currentY - 28, { align: 'right' });
  doc.text('Combined Accounts Ledger', pageWidth - rightMargin, currentY - 16, { align: 'right' });

  currentY += 12;
  // Gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.0);
  doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);
  currentY += 14;

  // Build Table Head & Body
  const tableHead = [['DATE', 'INCOME', 'EXPENSE']];
  let tableBody: string[][] = [];

  if (ledgerItems.length === 0) {
    tableBody = [['No transactions found for this date.', '', '']];
  } else {
    tableBody = ledgerItems.map((item) => {
      const dateDisplay = formatPdfDateShort(item.date) || item.date;
      if (item.type === 'income' && item.incomeRecord) {
        return [dateDisplay, formatIncomeCell(item.incomeRecord), '-'];
      } else if (item.type === 'expense' && item.expenseRecord) {
        return [dateDisplay, '-', formatExpenseCell(item.expenseRecord)];
      }
      return [dateDisplay, '-', '-'];
    });
  }

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin, top: 35, bottom: 35 },
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 8.5,
      cellPadding: 6,
      lineColor: [225, 225, 222],
      lineWidth: 0.5,
      textColor: [30, 30, 30],
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [212, 175, 55], // Gold text on dark header
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: 6,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 250],
    },
    columnStyles: {
      0: { cellWidth: 85, fontStyle: 'bold', textColor: [40, 40, 40] }, // DATE
      1: { cellWidth: 340 }, // INCOME
      2: { cellWidth: 345 }, // EXPENSE
    },
    didParseCell: (data) => {
      if (ledgerItems.length === 0 && data.row.index === 0 && data.section === 'body') {
        if (data.column.index === 0) {
          data.cell.colSpan = 3;
          data.cell.styles.halign = 'center';
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
    showHead: 'everyPage',
    pageBreak: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 14;

  // Ensure room for summary box
  if (currentY > pageHeight - 95) {
    doc.addPage();
    currentY = 45;
  }

  // Summary Container (Clean, professional, high contrast)
  const summaryBoxHeight = 50;
  doc.setFillColor(254, 254, 252);
  doc.setDrawColor(212, 175, 55); // Gold border
  doc.setLineWidth(1.2);
  doc.roundedRect(leftMargin, currentY, contentWidth, summaryBoxHeight, 3, 3, 'FD');

  // Title Pill
  doc.setFillColor(212, 175, 55);
  doc.roundedRect(leftMargin, currentY, 100, 15, 2, 2, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  doc.text('SUMMARY', leftMargin + 8, currentY + 11);

  // 4 Metrics inside Summary
  const metricY = currentY + 33;
  const colW = contentWidth / 4;

  // 1. Total Income
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Income:', leftMargin + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalIncome), leftMargin + 72, metricY);

  // 2. Total Paid
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Paid:', leftMargin + colW + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalPaid), leftMargin + colW + 60, metricY);

  // 3. Total Balance
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Balance:', leftMargin + colW * 2 + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27); // Dark red
  doc.text(formatPdfCurrency(totalBalance), leftMargin + colW * 2 + 75, metricY);

  // 4. Total Expense
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Expense:', leftMargin + colW * 3 + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27); // Dark red
  doc.text(formatPdfCurrency(totalExpense), leftMargin + colW * 3 + 78, metricY);

  // Draw Page Numbers and Headers across all generated pages
  drawPageHeaderAndFooter(doc, fontFamily, pageWidth, pageHeight, leftMargin, rightMargin);

  return doc;
};

/**
 * GENERATE THIS MONTH'S ACCOUNTS PDF
 */
export const generateMonthlyAccountsPdf = (
  monthStr: string, // YYYY-MM
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[]
): jsPDF => {
  // Filter for the specific month
  const monthIncome = incomeRecords.filter((r) => r.date.startsWith(monthStr));
  const monthExpenses = expenseRecords.filter((r) => r.date.startsWith(monthStr));

  const totalIncome = monthIncome.reduce((acc, r) => acc + (r.total || 0), 0);
  const totalPaid = monthIncome.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  const totalBalance = monthIncome.reduce((acc, r) => acc + (r.balance || 0), 0);
  const totalExpense = monthExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);

  // Combine into single chronological ledger
  const ledgerItems: LedgerItem[] = [
    ...monthIncome.map((inc) => ({
      id: inc.id,
      date: inc.date,
      type: 'income' as const,
      incomeRecord: inc,
      sortTimestamp: inc.created_at || inc.time || `${inc.date}T00:00:00`,
    })),
    ...monthExpenses.map((exp) => ({
      id: exp.id,
      date: exp.date,
      type: 'expense' as const,
      expenseRecord: exp,
      sortTimestamp: exp.created_at || exp.time || `${exp.date}T00:00:00`,
    })),
  ];

  // Sort by date ascending; within same date, preserve chronological order
  ledgerItems.sort((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);
    if (dateComparison !== 0) return dateComparison;
    return a.sortTimestamp.localeCompare(b.sortTimestamp);
  });

  // Initialize Landscape A4 document
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const fontFamily = PDF_FONT;
  const pageWidth = doc.internal.pageSize.getWidth(); // ~841.89 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // ~595.28 pt
  const leftMargin = 36;
  const rightMargin = 36;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  let currentY = 48;

  // Title & Header Branding
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text('MAGNIFIQUE 2.0', leftMargin, currentY);

  currentY += 16;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(180, 130, 20); // Warm Gold
  doc.text('MONTHLY ACCOUNT LEDGER', leftMargin, currentY);

  currentY += 14;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  const formattedMonth = formatPdfMonth(monthStr);
  doc.text(`Month: ${formattedMonth}`, leftMargin, currentY);

  // Metadata right aligned
  const genTimestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${genTimestamp}`, pageWidth - rightMargin, currentY - 28, { align: 'right' });
  doc.text('Combined Accounts Ledger', pageWidth - rightMargin, currentY - 16, { align: 'right' });

  currentY += 12;
  // Gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.0);
  doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);
  currentY += 14;

  // Build Table Head & Body
  const tableHead = [['DATE', 'INCOME', 'EXPENSE']];
  let tableBody: string[][] = [];

  if (ledgerItems.length === 0) {
    tableBody = [['No transactions found for this month.', '', '']];
  } else {
    tableBody = ledgerItems.map((item) => {
      const dateDisplay = formatPdfDateShort(item.date) || item.date;
      if (item.type === 'income' && item.incomeRecord) {
        return [dateDisplay, formatIncomeCell(item.incomeRecord), '-'];
      } else if (item.type === 'expense' && item.expenseRecord) {
        return [dateDisplay, '-', formatExpenseCell(item.expenseRecord)];
      }
      return [dateDisplay, '-', '-'];
    });
  }

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin, top: 35, bottom: 35 },
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 8.5,
      cellPadding: 6,
      lineColor: [225, 225, 222],
      lineWidth: 0.5,
      textColor: [30, 30, 30],
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [212, 175, 55], // Gold text on dark header
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: 6,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 250],
    },
    columnStyles: {
      0: { cellWidth: 85, fontStyle: 'bold', textColor: [40, 40, 40] }, // DATE
      1: { cellWidth: 340 }, // INCOME
      2: { cellWidth: 345 }, // EXPENSE
    },
    didParseCell: (data) => {
      if (ledgerItems.length === 0 && data.row.index === 0 && data.section === 'body') {
        if (data.column.index === 0) {
          data.cell.colSpan = 3;
          data.cell.styles.halign = 'center';
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    },
    showHead: 'everyPage',
    pageBreak: 'auto',
  });

  currentY = (doc as any).lastAutoTable.finalY + 14;

  // Ensure room for summary box
  if (currentY > pageHeight - 95) {
    doc.addPage();
    currentY = 45;
  }

  // Summary Container
  const summaryBoxHeight = 50;
  doc.setFillColor(254, 254, 252);
  doc.setDrawColor(212, 175, 55); // Gold border
  doc.setLineWidth(1.2);
  doc.roundedRect(leftMargin, currentY, contentWidth, summaryBoxHeight, 3, 3, 'FD');

  // Title Pill
  doc.setFillColor(212, 175, 55);
  doc.roundedRect(leftMargin, currentY, 100, 15, 2, 2, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  doc.text('SUMMARY', leftMargin + 8, currentY + 11);

  // 4 Metrics inside Summary
  const metricY = currentY + 33;
  const colW = contentWidth / 4;

  // 1. Total Income
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Income:', leftMargin + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalIncome), leftMargin + 72, metricY);

  // 2. Total Paid
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Paid:', leftMargin + colW + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // Green
  doc.text(formatPdfCurrency(totalPaid), leftMargin + colW + 60, metricY);

  // 3. Total Balance
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Balance:', leftMargin + colW * 2 + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27); // Dark red
  doc.text(formatPdfCurrency(totalBalance), leftMargin + colW * 2 + 75, metricY);

  // 4. Total Expense
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Total Expense:', leftMargin + colW * 3 + 12, metricY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(153, 27, 27); // Dark red
  doc.text(formatPdfCurrency(totalExpense), leftMargin + colW * 3 + 78, metricY);

  // Draw Page Numbers and Headers across all generated pages
  drawPageHeaderAndFooter(doc, fontFamily, pageWidth, pageHeight, leftMargin, rightMargin);

  return doc;
};

