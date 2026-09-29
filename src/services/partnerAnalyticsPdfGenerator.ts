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

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Combines meal information and PAX into one compact value.
 * Examples:
 *   B (100)
 *   L (100)
 *   D (100)
 *   B/L (100)
 *   L/D (100)
 *   B/L/D (100)
 *   ALACARTE
 *   TEA (30)
 */
function formatCompactMeal(inc: IncomeRecord): string {
  const pax = inc.membersCount && inc.membersCount > 0 ? inc.membersCount : 0;
  const paxStr = pax > 0 ? ` (${pax})` : '';

  const isAlaCarte =
    inc.mealPlan === 'alacarte' ||
    inc.incomeType === 'À La Carte' ||
    (inc.byWho &&
      (inc.byWho.toUpperCase() === 'À LA CARTE' || inc.byWho.toUpperCase() === 'A LA CARTE'));

  if (isAlaCarte) {
    return pax > 0 ? `ALACARTE (${pax})` : 'ALACARTE';
  }

  if (inc.mealPlan === 'other') {
    const customName = (inc.mealType ? String(inc.mealType).trim().toUpperCase() : '') || 'OTHER';
    return `${customName}${paxStr}`;
  }

  if (inc.mealPlan === '3_time' || inc.mealCombination === 'all') {
    return `B/L/D${paxStr}`;
  } else if (inc.mealPlan === '2_time') {
    if (inc.mealCombination === 'breakfast_lunch') return `B/L${paxStr}`;
    if (inc.mealCombination === 'breakfast_dinner') return `B/D${paxStr}`;
    if (inc.mealCombination === 'lunch_dinner') return `L/D${paxStr}`;
    return `2 TIME${paxStr}`;
  } else if (inc.mealPlan === '1_time') {
    if (inc.mealCombination === 'lunch' || inc.mealType === 'Lunch') return `L${paxStr}`;
    if (inc.mealCombination === 'dinner' || inc.mealType === 'Dinner') return `D${paxStr}`;
    return `B${paxStr}`;
  }

  if (inc.mealType) {
    const m = String(inc.mealType).trim().toUpperCase();
    if (m === 'BREAKFAST') return `B${paxStr}`;
    if (m === 'LUNCH') return `L${paxStr}`;
    if (m === 'DINNER') return `D${paxStr}`;
    return `${m}${paxStr}`;
  }

  return pax > 0 ? `MEAL (${pax})` : '1 TIME';
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

  for (const inc of partnerIncome) {
    const incTotal = Number(inc.total) || 0;
    const incPaid = Number(inc.amountPaid) || 0;
    const incBal = Number(inc.balance) || 0;

    totalIncome += incTotal;
    totalReceived += incPaid;
    totalBalance += incBal;
  }

  let totalExpense = 0;
  for (const exp of partnerExpenses) {
    totalExpense += Number(exp.amount) || 0;
  }

  // --------------------------------------------------------------------------
  // 2. HEADER DRAWING FUNCTION (Multi-page safe with duplicate prevention)
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
      doc.text(`PARTNER ANALYTICS REPORT - ${normPartner}`, margin, 18);

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
      doc.text(`- PARTNER ANALYTICS REPORT - ${normPartner}`, margin + 42, 10);

      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 10, { align: 'right' });
    }
  };

  // Helper to ensure safe page breaks
  const ensureSafeSpace = (neededHeight: number, currentY: number): number => {
    if (currentY + neededHeight > pageHeight - 14) {
      doc.addPage();
      const newPageNum = doc.getNumberOfPages();
      drawPageHeader(newPageNum);
      return 24.5; // Safe top offset below 18.2mm header on page 2+
    }
    return currentY;
  };

  // Draw Page 1 header initially
  drawPageHeader(1);

  // Content begins safely below Page 1 gold divider line (ends at 24.4mm)
  let curY = 28.0;

  // ==========================================================================
  // SECTION 1: IRSHAD INCOME
  // ==========================================================================
  doc.setFillColor(16, 185, 129); // Emerald
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`1. ${normPartner} INCOME`, margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Billed: ${formatIndianCurrency(totalIncome)}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 4.5;

  // Income Ledger Table: Exactly 7 columns:
  // # | DATE | TRAVELLER | MEAL | TOTAL AMOUNT | RECEIVED | BALANCE
  const incomeRows =
    partnerIncome.length > 0
      ? partnerIncome.map((inc, idx) => [
          String(idx + 1),
          formatDisplayDate(inc.date),
          formatTraveller(inc),
          formatCompactMeal(inc),
          formatIndianCurrency(inc.total || 0),
          formatIndianCurrency(inc.amountPaid || 0),
          formatIndianCurrency(inc.balance || 0),
        ])
      : [
          [
            '-',
            '-',
            `No income entries recorded for ${normPartner} in this period`,
            '-',
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
    head: [['#', 'DATE', 'TRAVELLER', 'MEAL', 'TOTAL AMOUNT', 'RECEIVED', 'BALANCE']],
    body: incomeRows,
    foot: [
      [
        '',
        'Total',
        '',
        '',
        formatIndianCurrency(totalIncome),
        formatIndianCurrency(totalReceived),
        formatIndianCurrency(totalBalance),
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: { top: 1.1, bottom: 1.1, left: 1.5, right: 1.5 },
      minCellHeight: 4.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.2,
      cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 },
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.2,
      cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 },
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'left' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      drawPageHeader(data.pageNumber);
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 3.0;

  // --------------------------------------------------------------------------
  // Income Summary (Compact 2-Column + Full-Width Balance Layout)
  // --------------------------------------------------------------------------
  curY = ensureSafeSpace(28, curY);

  const cardColGap = 3.5;
  const topCardW = (contentWidth - cardColGap) / 2;
  const topCardH = 13.0;

  // Card 1: Left - TOTAL IRSHAD INCOME
  const card1X = margin;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(card1X, curY, topCardW, topCardH, 1.5, 1.5, 'FD');

  doc.setFillColor(16, 185, 129); // Emerald
  doc.rect(card1X, curY, 2.5, topCardH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`TOTAL ${normPartner} INCOME`, card1X + 5, curY + 4.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Rs. ${formatIndianNumber(totalIncome)}`, card1X + 5, curY + 8.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text('Total Billed Amount', card1X + 5, curY + 11.5);

  // Card 2: Right - TOTAL RECEIVED
  const card2X = margin + topCardW + cardColGap;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(card2X, curY, topCardW, topCardH, 1.5, 1.5, 'FD');

  doc.setFillColor(56, 189, 248); // Sky blue
  doc.rect(card2X, curY, 2.5, topCardH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL RECEIVED', card2X + 5, curY + 4.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Rs. ${formatIndianNumber(totalReceived)}`, card2X + 5, curY + 8.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text('Actual Cash Received', card2X + 5, curY + 11.5);

  // Card 3: Full-Width Row Below - TOTAL BALANCE
  curY += topCardH + 2.5;

  const botCardH = 12.0;
  doc.setFillColor(255, 251, 235); // Amber-50
  doc.setDrawColor(253, 230, 138); // Amber-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, botCardH, 1.5, 1.5, 'FD');

  doc.setFillColor(245, 158, 11); // Amber-500
  doc.rect(margin, curY, 2.5, botCardH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(146, 64, 14); // Amber-800
  doc.text('TOTAL BALANCE', margin + 5, curY + 4.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(180, 83, 9);
  doc.text('Outstanding / Receivables', margin + 5, curY + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(194, 65, 12);
  doc.text(`Rs. ${formatIndianNumber(totalBalance)}`, pageWidth - margin - 5, curY + 7.5, {
    align: 'right',
  });

  curY += botCardH + 5.0;

  // ==========================================================================
  // SECTION 2: IRSHAD EXPENSE
  // ==========================================================================
  curY = ensureSafeSpace(26, curY);

  doc.setFillColor(244, 63, 94); // Rose
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. ${normPartner} EXPENSE`, margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Expenses: ${formatIndianCurrency(totalExpense)}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 4.5;

  const expenseRows =
    partnerExpenses.length > 0
      ? partnerExpenses.map((exp, idx) => [
          String(idx + 1),
          formatDisplayDate(exp.date),
          (exp.description || exp.name || 'Expense').toUpperCase(),
          exp.category || 'Other',
          formatIndianCurrency(exp.amount || 0),
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
    margin: { left: margin, right: margin, top: 24.5, bottom: 14 },
    showHead: 'everyPage',
    showFoot: 'lastPage',
    head: [['#', 'DATE', 'PARTICULARS / DESCRIPTION', 'CATEGORY', 'AMOUNT (INR)']],
    body: expenseRows,
    foot: [
      [
        '',
        'Total ' + normPartner + ' Expense',
        '',
        '',
        formatIndianCurrency(totalExpense),
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: { top: 1.1, bottom: 1.1, left: 1.5, right: 1.5 },
      minCellHeight: 4.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.2,
      cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 },
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.2,
      cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 },
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 32 },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      drawPageHeader(data.pageNumber);
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 3.0;

  // Expense Summary Box: Compact Highlighted Total Card
  curY = ensureSafeSpace(16, curY);

  const expBoxH = 11.5;
  doc.setFillColor(255, 241, 242); // Rose-50
  doc.setDrawColor(254, 205, 211); // Rose-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, expBoxH, 1.5, 1.5, 'FD');

  doc.setFillColor(244, 63, 94);
  doc.rect(margin, curY, 2.5, expBoxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(159, 18, 57);
  doc.text(`TOTAL ${normPartner} EXPENSE`, margin + 5, curY + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text(`Actual business expenses incurred & paid by ${normPartner}`, margin + 5, curY + 8.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(225, 29, 72);
  doc.text(`Rs. ${formatIndianNumber(totalExpense)}`, pageWidth - margin - 5, curY + 7.5, {
    align: 'right',
  });

  curY += expBoxH + 5.0;

  // ==========================================================================
  // SECTION 3: IRSHAD FINAL SETTLEMENT (COMPACT TWO-COLUMN LAYOUT)
  // ==========================================================================
  // Calculation:
  //   IRSHAD INCOME BALANCE - IRSHAD EXPENSE = RETURN TO HOTEL
  // If IRSHAD INCOME BALANCE > IRSHAD EXPENSE => RETURN TO HOTEL
  // If IRSHAD EXPENSE > IRSHAD INCOME BALANCE => HOTEL TO IRSHAD
  // If equal => SETTLED (BALANCED)
  const isReturnToHotel = totalBalance > totalExpense;
  const isHotelToPartner = totalExpense > totalBalance;
  const settlementDiff = Math.abs(totalBalance - totalExpense);

  const settlementActionLabel = isReturnToHotel
    ? 'RETURN TO HOTEL'
    : isHotelToPartner
    ? `HOTEL TO ${normPartner}`
    : 'SETTLED (BALANCED)';

  // Check safe space for the entire final calculation + summary block (~48mm)
  curY = ensureSafeSpace(48, curY);

  doc.setFillColor(212, 175, 55); // Gold
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`3. ${normPartner} FINAL SETTLEMENT`, margin + 5, curY + 2.5);

  curY += 4.5;

  const section3W = contentWidth;
  const colGap = 4.0;
  const colW = (section3W - colGap) / 2; // 89 mm each
  const blockH = 37.0;

  const col1X = margin;
  const col2X = margin + colW + colGap;

  // --------------------------------------------------------------------------
  // Left Column: Settlement Calculation
  // --------------------------------------------------------------------------
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(col1X, curY, colW, blockH, 2, 2, 'FD');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('SETTLEMENT CALCULATION', col1X + 4, curY + 4.8);

  // Line 1: Partner Income Balance
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${normPartner} INCOME BALANCE`, col1X + 4, curY + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${formatIndianNumber(totalBalance)}`, col1X + colW - 4, curY + 10.5, {
    align: 'right',
  });

  // Line 2: - Partner Expense
  doc.setFont('helvetica', 'normal');
  doc.text(`- ${normPartner} EXPENSE`, col1X + 4, curY + 16.0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${formatIndianNumber(totalExpense)}`, col1X + colW - 4, curY + 16.0, {
    align: 'right',
  });

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(col1X + 4, curY + 19.5, col1X + colW - 4, curY + 19.5);

  // Result Highlight Box
  const resBoxY = curY + 22.0;
  const resBoxH = 12.0;
  const resBoxW = colW - 8;

  if (isReturnToHotel) {
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(16, 185, 129); // Emerald-500
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.0);
    doc.setTextColor(6, 95, 70); // Emerald-800
    doc.text('RETURN TO HOTEL', col1X + 7, resBoxY + 4.5);

    doc.setFontSize(10.0);
    doc.text(`Rs. ${formatIndianNumber(settlementDiff)}`, col1X + 7, resBoxY + 9.5);
  } else if (isHotelToPartner) {
    doc.setFillColor(255, 241, 242); // Rose-50
    doc.setDrawColor(244, 63, 94); // Rose-500
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.0);
    doc.setTextColor(159, 18, 57); // Rose-800
    doc.text(`HOTEL TO ${normPartner}`, col1X + 7, resBoxY + 4.5);

    doc.setFontSize(10.0);
    doc.text(`Rs. ${formatIndianNumber(settlementDiff)}`, col1X + 7, resBoxY + 9.5);
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(col1X + 4, resBoxY, resBoxW, resBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.0);
    doc.setTextColor(51, 65, 85);
    doc.text('SETTLED (BALANCED)', col1X + 7, resBoxY + 4.5);

    doc.setFontSize(10.0);
    doc.text('Rs. 0', col1X + 7, resBoxY + 9.5);
  }

  // --------------------------------------------------------------------------
  // Right Column: Compact Final Summary
  // --------------------------------------------------------------------------
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(col2X, curY, colW, blockH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('COMPACT FINAL SUMMARY', col2X + 4, curY + 4.8);

  const summaryItems = [
    {
      label: `TOTAL ${normPartner} INCOME`,
      val: `Rs. ${formatIndianNumber(totalIncome)}`,
      color: [15, 23, 42],
    },
    {
      label: `TOTAL ${normPartner} RECEIVED`,
      val: `Rs. ${formatIndianNumber(totalReceived)}`,
      color: [15, 23, 42],
    },
    {
      label: `${normPartner} INCOME BALANCE`,
      val: `Rs. ${formatIndianNumber(totalBalance)}`,
      color: totalBalance > 0 ? [194, 65, 12] : [15, 23, 42],
    },
    {
      label: `TOTAL ${normPartner} EXPENSE`,
      val: `Rs. ${formatIndianNumber(totalExpense)}`,
      color: [225, 29, 72],
    },
  ];

  const rowStartY = curY + 9.5;
  const itemH = 4.6;

  summaryItems.forEach((item, rIdx) => {
    const itemY = rowStartY + rIdx * itemH;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(71, 85, 105);
    doc.text(item.label, col2X + 4, itemY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.val, col2X + colW - 4, itemY, { align: 'right' });
  });

  // Divider above Final Settlement
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(col2X + 4, curY + 28.5, col2X + colW - 4, curY + 28.5);

  // Final Settlement Row (Highlighted)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col2X + 3, curY + 29.8, colW - 6, 5.8, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`FINAL SETTLEMENT (${settlementActionLabel})`, col2X + 5, curY + 33.8);

  doc.setFontSize(7.2);
  doc.setTextColor(
    isReturnToHotel ? 5 : isHotelToPartner ? 225 : 15,
    isReturnToHotel ? 150 : isHotelToPartner ? 29 : 23,
    isReturnToHotel ? 105 : isHotelToPartner ? 72 : 42
  );
  doc.text(`Rs. ${formatIndianNumber(settlementDiff)}`, col2X + colW - 5, curY + 33.8, {
    align: 'right',
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
      `MAGNIFIQUE 2.0 - PARTNER ANALYTICS REPORT - ${normPartner}`,
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
