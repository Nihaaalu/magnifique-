import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord, Partner } from '../types';
import {
  normalizePartnerName,
  getEffectivePartners,
  isExpensePaidByPartner,
} from '../utils/partnerBalanceUtils';

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

export function formatIndianCurrency(amount: number, prefix: 'symbol' | 'text' = 'text'): string {
  const isNegative = amount < 0;
  const num = Math.round(Math.abs(amount)) || 0;
  const formatted = num.toLocaleString('en-IN');
  const sign = isNegative ? '-' : '';
  return prefix === 'symbol' ? `${sign}₹${formatted}` : `${sign}Rs. ${formatted}`;
}

export function formatIndianNumber(num: number): string {
  const isNegative = num < 0;
  const rounded = Math.round(Math.abs(num)) || 0;
  const formatted = rounded.toLocaleString('en-IN');
  return isNegative ? `-${formatted}` : formatted;
}

function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatMealType(inc: IncomeRecord): string {
  const isAlaCarte =
    inc.mealPlan === 'alacarte' ||
    inc.incomeType === 'À La Carte' ||
    (inc.byWho && (inc.byWho.toUpperCase() === 'À LA CARTE' || inc.byWho.toUpperCase() === 'A LA CARTE'));

  if (isAlaCarte) {
    return 'ALACARTE';
  }

  if (inc.mealPlan === 'other') {
    const customName = (inc.mealType ? String(inc.mealType).trim().toUpperCase() : '') || 'OTHER';
    return customName;
  }

  if (inc.mealPlan === '3_time' || inc.mealCombination === 'all') {
    return 'B/L/D (3 Time)';
  } else if (inc.mealPlan === '2_time') {
    if (inc.mealCombination === 'breakfast_lunch') return 'B/L (2 Time)';
    if (inc.mealCombination === 'breakfast_dinner') return 'B/D (2 Time)';
    if (inc.mealCombination === 'lunch_dinner') return 'L/D (2 Time)';
    return '2 TIME';
  } else if (inc.mealPlan === '1_time') {
    if (inc.mealCombination === 'lunch' || inc.mealType === 'Lunch') return 'L (1 Time)';
    if (inc.mealCombination === 'dinner' || inc.mealType === 'Dinner') return 'D (1 Time)';
    return 'B (1 Time)';
  }

  if (inc.mealType) {
    return String(inc.mealType).toUpperCase();
  }

  return '1 TIME';
}

function formatTraveller(inc: IncomeRecord): string {
  const trav = (inc.travels || '').trim();
  return trav.length > 0 ? trav : '-';
}

// ============================================================================
// PARTNER ANALYTICS PDF GENERATOR
// ============================================================================

export interface PartnerAnalyticsPdfOptions {
  partnerName: string; // e.g. 'IRSHAD'
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  partners?: Partner[];
}

export async function generatePartnerAnalyticsPDF(
  options: PartnerAnalyticsPdfOptions
): Promise<void> {
  const {
    partnerName,
    dateRangeLabel,
    startDate,
    endDate,
    incomeRecords,
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
  // 1. FILTER DATA CHRONOLOGICALLY FOR THE CURRENT PERIOD
  // --------------------------------------------------------------------------

  // Partner Income: entries where By Who is IRSHAD (or balanceAccountPartner is IRSHAD)
  const partnerIncome = incomeRecords
    .filter((r) => {
      if (!r.date || r.date < startDate || r.date > endDate) return false;
      const byWhoMatch = r.byWho && normalizePartnerName(r.byWho) === normPartner;
      const balancePartnerMatch =
        r.balanceAccountPartnerName &&
        normalizePartnerName(r.balanceAccountPartnerName) === normPartner;
      return Boolean(byWhoMatch || balancePartnerMatch);
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Partner Expenses: expenses paid by IRSHAD in this period
  const partnerExpenses = expenseRecords
    .filter((r) => {
      if (!r.date || r.date < startDate || r.date > endDate) return false;
      return isExpensePaidByPartner(r, normPartner, targetPartnerId, idToNameMap);
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Aggregated totals
  let totalIncome = 0;
  let totalReceived = 0;
  let totalBalance = 0;
  let totalPax = 0;

  for (const inc of partnerIncome) {
    const incTotal = Number(inc.total) || 0;
    const incPaid = Number(inc.amountPaid) || 0;
    const incBal = Number(inc.balance) || 0;
    const pax = Number(inc.membersCount) || 0;

    totalIncome += incTotal;
    totalReceived += incPaid;
    totalBalance += incBal;
    totalPax += pax;
  }

  let totalExpense = 0;
  for (const exp of partnerExpenses) {
    totalExpense += Number(exp.amount) || 0;
  }

  // --------------------------------------------------------------------------
  // 2. HEADER DRAWING FUNCTION (Multi-page safe)
  // --------------------------------------------------------------------------
  const drawPageHeader = (pageNumber: number) => {
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
      doc.text(`PARTNER ANALYTICS REPORT • ${normPartner}`, margin, 18);

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
      doc.text(`• PARTNER ANALYTICS REPORT - ${normPartner}`, margin + 42, 10);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 10, { align: 'right' });
    }
  };

  // Helper to ensure safe page breaks
  const ensureSafeSpace = (neededHeight: number, currentY: number): number => {
    if (currentY + neededHeight > pageHeight - 16) {
      doc.addPage();
      const newPageNum = doc.getNumberOfPages();
      drawPageHeader(newPageNum);
      return 26.2; // Safe offset below 18.2mm header
    }
    return currentY;
  };

  // Draw Page 1 header initially
  drawPageHeader(1);

  // Content begins safely below Page 1 gold divider line (ends at 24.4mm)
  let curY = 28.5;

  // ==========================================================================
  // SECTION 1: IRSHAD INCOME
  // ==========================================================================
  doc.setFillColor(16, 185, 129); // Emerald
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`1. ${normPartner} INCOME`, margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Billed: ${formatIndianCurrency(totalIncome, 'text')}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 5.5;

  // Income Ledger Table
  const incomeRows =
    partnerIncome.length > 0
      ? partnerIncome.map((inc, idx) => [
          String(idx + 1),
          formatDisplayDate(inc.date),
          formatTraveller(inc),
          formatMealType(inc),
          inc.membersCount && inc.membersCount > 0 ? String(inc.membersCount) : '-',
          formatIndianCurrency(inc.total || 0, 'text'),
          formatIndianCurrency(inc.amountPaid || 0, 'text'),
          formatIndianCurrency(inc.balance || 0, 'text'),
        ])
      : [
          [
            '-',
            '-',
            `No income entries recorded for ${normPartner} in this period`,
            '-',
            '-',
            'Rs. 0',
            'Rs. 0',
            'Rs. 0',
          ],
        ];

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, top: 26, bottom: 14 },
    head: [['#', 'Date', 'Traveller / Group', 'Meal / Type', 'PAX', 'Total Amount', 'Received', 'Balance']],
    body: incomeRows,
    foot: [
      [
        '',
        'Total',
        '',
        '',
        totalPax > 0 ? String(totalPax) : '-',
        formatIndianCurrency(totalIncome, 'text'),
        formatIndianCurrency(totalReceived, 'text'),
        formatIndianCurrency(totalBalance, 'text'),
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.4,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 28 },
      4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      drawPageHeader(data.pageNumber);
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 3.5;

  // Income Summary: TOTAL INCOME, TOTAL RECEIVED, TOTAL BALANCE
  curY = ensureSafeSpace(22, curY);

  const cardGap = 3.5;
  const numCards = 3;
  const cardW = (contentWidth - cardGap * (numCards - 1)) / numCards;
  const cardH = 17;

  const incomeSummaryCards = [
    {
      label: `TOTAL ${normPartner} INCOME`,
      value: `₹ ${formatIndianNumber(totalIncome)}`,
      sub: 'Total Billed Amount',
      accent: [16, 185, 129], // Emerald
      valColor: [15, 23, 42],
    },
    {
      label: 'TOTAL RECEIVED',
      value: `₹ ${formatIndianNumber(totalReceived)}`,
      sub: 'Actual Cash Received',
      accent: [56, 189, 248], // Sky Blue
      valColor: [15, 23, 42],
    },
    {
      label: 'TOTAL BALANCE',
      value: `₹ ${formatIndianNumber(totalBalance)}`,
      sub: 'Outstanding / Receivables',
      accent: [251, 146, 60], // Amber/Orange
      valColor: totalBalance > 0 ? [225, 29, 72] : [15, 23, 42],
    },
  ];

  incomeSummaryCards.forEach((c, idx) => {
    const cardX = margin + idx * (cardW + cardGap);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, curY, cardW, cardH, 2, 2, 'FD');

    // Accent line on left
    doc.setFillColor(c.accent[0], c.accent[1], c.accent[2]);
    doc.roundedRect(cardX, curY, 2.5, cardH, 1, 1, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, cardX + 5, curY + 4.5);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(c.valColor[0], c.valColor[1], c.valColor[2]);
    doc.text(c.value, cardX + 5, curY + 10.5);

    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(148, 163, 184);
    doc.text(c.sub, cardX + 5, curY + 14.5);
  });

  curY += cardH + 6.0;

  // ==========================================================================
  // SECTION 2: IRSHAD EXPENSE
  // ==========================================================================
  curY = ensureSafeSpace(36, curY);

  doc.setFillColor(244, 63, 94); // Rose
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. ${normPartner} EXPENSE`, margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Expenses: ${formatIndianCurrency(totalExpense, 'text')}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 5.5;

  const expenseRows =
    partnerExpenses.length > 0
      ? partnerExpenses.map((exp, idx) => [
          String(idx + 1),
          formatDisplayDate(exp.date),
          (exp.description || exp.name || 'Expense').toUpperCase(),
          exp.category || 'Other',
          formatIndianCurrency(exp.amount || 0, 'text'),
        ])
      : [
          [
            '-',
            '-',
            `No expenses recorded for ${normPartner} in this period`,
            '-',
            'Rs. 0',
          ],
        ];

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, top: 26, bottom: 14 },
    head: [['#', 'Date', 'Particulars / Description', 'Category', 'Amount (INR)']],
    body: expenseRows,
    foot: [
      [
        '',
        'Total ' + normPartner + ' Expense',
        '',
        '',
        formatIndianCurrency(totalExpense, 'text'),
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.4,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 28 },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      drawPageHeader(data.pageNumber);
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 3.5;

  // Expense Summary Box: TOTAL IRSHAD EXPENSE
  curY = ensureSafeSpace(20, curY);

  const expBoxH = 15;
  doc.setFillColor(255, 241, 242); // Rose-50
  doc.setDrawColor(254, 205, 211); // Rose-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, expBoxH, 2, 2, 'FD');

  doc.setFillColor(244, 63, 94);
  doc.roundedRect(margin, curY, 2.5, expBoxH, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(159, 18, 57);
  doc.text(`TOTAL ${normPartner} EXPENSE`, margin + 6, curY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Actual business expenses incurred & paid by ${normPartner}`, margin + 6, curY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(225, 29, 72);
  doc.text(`₹ ${formatIndianNumber(totalExpense)}`, pageWidth - margin - 5, curY + 9.5, {
    align: 'right',
  });

  curY += expBoxH + 6.0;

  // ==========================================================================
  // SECTION 3: IRSHAD FINAL SETTLEMENT
  // ==========================================================================
  // Settlement Formula:
  //   IRSHAD EXPENSE - IRSHAD INCOME BALANCE
  // If IRSHAD INCOME BALANCE > IRSHAD EXPENSE => RETURN TO HOTEL: (BALANCE - EXPENSE)
  // If IRSHAD EXPENSE > IRSHAD INCOME BALANCE => HOTEL TO IRSHAD: (EXPENSE - BALANCE)
  // If equal => SETTLED: 0
  const isReturnToHotel = totalBalance > totalExpense;
  const isHotelToPartner = totalExpense > totalBalance;
  const settlementDiff = Math.abs(totalBalance - totalExpense);

  const settlementActionLabel = isReturnToHotel
    ? 'RETURN TO HOTEL'
    : isHotelToPartner
    ? `HOTEL TO ${normPartner}`
    : 'SETTLED (BALANCED)';

  // Check safe space for the entire final calculation + summary block (~54mm)
  curY = ensureSafeSpace(56, curY);

  doc.setFillColor(212, 175, 55); // Gold
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`3. ${normPartner} FINAL SETTLEMENT`, margin + 5, curY + 2.5);

  curY += 5.5;

  const section3W = contentWidth;
  const colGap = 4.0;
  const col1W = Math.floor((section3W - colGap) * 0.48); // ~85mm (Calculation Formula)
  const col2W = section3W - col1W - colGap; // ~93mm (Compact Final Summary)
  const blockH = 44;

  const col1X = margin;
  const col2X = margin + col1W + colGap;

  // --------------------------------------------------------------------------
  // Left Column: Settlement Formula Breakdown
  // --------------------------------------------------------------------------
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(col1X, curY, col1W, blockH, 2.5, 2.5, 'FD');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('SETTLEMENT CALCULATION', col1X + 4, curY + 5.5);

  // Line 1: Partner Expense
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${normPartner} EXPENSE`, col1X + 4, curY + 12);
  doc.setFont('helvetica', 'bold');
  doc.text(`₹ ${formatIndianNumber(totalExpense)}`, col1X + col1W - 4, curY + 12, {
    align: 'right',
  });

  // Line 2: - Partner Income Balance
  doc.setFont('helvetica', 'normal');
  doc.text(`− ${normPartner} INCOME BALANCE`, col1X + 4, curY + 18.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`₹ ${formatIndianNumber(totalBalance)}`, col1X + col1W - 4, curY + 18.5, {
    align: 'right',
  });

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(col1X + 4, curY + 22.5, col1X + col1W - 4, curY + 22.5);

  // Result Highlight Box
  const resBoxY = curY + 25.5;
  const resBoxH = 14.5;
  const resBoxW = col1W - 8;

  if (isReturnToHotel) {
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129); // Emerald-500
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(6, 95, 70); // Emerald-800
    doc.text('RETURN TO HOTEL', col1X + 8, resBoxY + 5.5);

    doc.setFontSize(10.5);
    doc.text(`₹ ${formatIndianNumber(settlementDiff)}`, col1X + 8, resBoxY + 11.5);
  } else if (isHotelToPartner) {
    doc.setFillColor(255, 241, 242); // Rose-50
    doc.setDrawColor(244, 63, 94); // Rose-500
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(159, 18, 57); // Rose-800
    doc.text(`HOTEL TO ${normPartner}`, col1X + 8, resBoxY + 5.5);

    doc.setFontSize(10.5);
    doc.text(`₹ ${formatIndianNumber(settlementDiff)}`, col1X + 8, resBoxY + 11.5);
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('SETTLED (BALANCED)', col1X + 8, resBoxY + 5.5);

    doc.setFontSize(10.5);
    doc.text('₹ 0', col1X + 8, resBoxY + 11.5);
  }

  // --------------------------------------------------------------------------
  // Right Column: Compact Final Summary
  // --------------------------------------------------------------------------
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(col2X, curY, col2W, blockH, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('COMPACT FINAL SUMMARY', col2X + 4, curY + 5.5);

  const summaryRows = [
    {
      label: `TOTAL ${normPartner} INCOME`,
      val: `₹ ${formatIndianNumber(totalIncome)}`,
      bold: false,
      color: [15, 23, 42],
    },
    {
      label: `TOTAL ${normPartner} RECEIVED`,
      val: `₹ ${formatIndianNumber(totalReceived)}`,
      bold: false,
      color: [15, 23, 42],
    },
    {
      label: `${normPartner} INCOME BALANCE`,
      val: `₹ ${formatIndianNumber(totalBalance)}`,
      bold: false,
      color: totalBalance > 0 ? [194, 65, 12] : [15, 23, 42],
    },
    {
      label: `TOTAL ${normPartner} EXPENSE`,
      val: `₹ ${formatIndianNumber(totalExpense)}`,
      bold: false,
      color: [225, 29, 72],
    },
    {
      label: `FINAL SETTLEMENT (${settlementActionLabel})`,
      val: `₹ ${formatIndianNumber(settlementDiff)}`,
      bold: true,
      color: isReturnToHotel ? [5, 150, 105] : isHotelToPartner ? [225, 29, 72] : [15, 23, 42],
    },
  ];

  const rowStartY = curY + 8.5;
  const itemH = 6.6;

  summaryRows.forEach((item, rIdx) => {
    const itemY = rowStartY + rIdx * itemH;

    // Zebra background for final settlement
    if (item.bold) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(col2X + 2, itemY - 1.2, col2W - 4, itemH - 0.5, 1, 1, 'F');
    }

    doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(item.bold ? 15 : 71, item.bold ? 23 : 85, item.bold ? 42 : 105);
    doc.text(item.label, col2X + 4, itemY + 3.0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.val, col2X + col2W - 4, itemY + 3.0, { align: 'right' });
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
      `MAGNIFIQUE 2.0 • PARTNER ANALYTICS REPORT - ${normPartner}`,
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
      ? `Magnifique_${cleanPartner}_Analytics_Report_${safeStart}_to_${safeEnd}.pdf`
      : `Magnifique_${cleanPartner}_Analytics_Report.pdf`;

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
