import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeRecord, ExpenseRecord } from '../types';
import {
  IncomeDistributionResult,
  ExpenseDistributionResult,
  ExpenseDistributionItem,
  MealCountResult,
} from '../utils/analyticsUtils';

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

/**
 * Fast RGB parser for jsPDF vector drawing
 */
function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// ============================================================================
// COLOR PALETTES (Darker, Deeper, Professional Financial / Restaurant Theme)
// ============================================================================

export const INCOME_PALETTE = [
  '#B45309', // Deep / Golden Yellow (Amber 700 - e.g. IRSHAD)
  '#9A6A15', // Muted Gold / Bronze (e.g. MUSADDIQ)
  '#15803D', // Deep Green (Green 700 - e.g. SATHISH)
  '#0E7490', // Darker Cyan / Ocean Blue (Cyan 700 - e.g. À LA CARTE)
  '#B91C1C', // Deep Red / Crimson (Red 700 - e.g. YOGESH)
  '#4338CA', // Muted Blue / Violet / Indigo (Indigo 700 - e.g. RAKESH)
  '#C2410C', // Dark Orange (Orange 700 - e.g. RAASHI)
  '#7E22CE', // Dark Purple (Purple 700)
  '#0F766E', // Dark Teal (Teal 700)
  '#1D4ED8', // Deep Royal Blue (Blue 700)
  '#9F1239', // Deep Wine / Crimson (Rose 800)
  '#6D28D9', // Muted Violet (Violet 700)
];

export const MEAL_PALETTE = {
  Breakfast: '#D97706', // Amber
  Lunch: '#059669',     // Emerald
  Dinner: '#4F46E5',    // Indigo
};

export const EXPENSE_PALETTE = [
  '#1D4ED8', // Deep Royal Blue
  '#B45309', // Darker Gold / Amber
  '#15803D', // Deep Green
  '#B91C1C', // Dark Red / Crimson
  '#0F766E', // Dark Teal
  '#7E22CE', // Dark Purple
  '#C2410C', // Dark Orange
  '#0E7490', // Muted Cyan / Deep Ocean
  '#4338CA', // Muted Blue / Indigo
  '#9F1239', // Deep Wine / Crimson
  '#A16207', // Muted Gold
  '#166534', // Deep Forest Green
  '#6D28D9', // Muted Violet
  '#9A3412', // Dark Rust / Terracotta
];

// ============================================================================
// CRITICAL FIX #1: EXPENSE GROUPING (< ₹10,000 COMBINED INTO OTHER EXPENSES)
// ============================================================================

/**
 * Normalizes and processes expense items for the PDF:
 * 1. Takes the intelligently normalized & description-grouped items.
 * 2. Checks each grouped total:
 *    - amount < 10000 => combined into OTHER EXPENSES (₹10,000 stays separate)
 *    - amount >= 10000 => kept as distinct visible row
 * 3. Sums all small groups into ONE 'OTHER EXPENSES' row.
 * 4. Sorts major visible groups highest to lowest.
 * 5. Appends OTHER EXPENSES at the end.
 * 6. Slices absorbed into OTHER EXPENSES do NOT appear individually.
 * 7. Sum equals totalExpense exactly (zero money lost).
 */
export function processExpensesForPdf(
  rawGroupedItems: ExpenseDistributionItem[],
  totalExpense: number
): ExpenseDistributionItem[] {
  const majorItems: ExpenseDistributionItem[] = [];
  let otherAmount = 0;

  for (const item of rawGroupedItems) {
    // Strictly amount < 10000 (₹10,000 is kept separate, ₹9,999 goes to Other Expenses)
    if (item.amount < 10000) {
      otherAmount += item.amount;
    } else {
      majorItems.push({ ...item });
    }
  }

  // Sort major visible groups descending by total amount
  majorItems.sort((a, b) => b.amount - a.amount);

  // Assign distinct curated colors
  const finalItems: ExpenseDistributionItem[] = majorItems.map((item, idx) => {
    const pct = totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0;
    return {
      ...item,
      percentage: Math.round(pct * 10) / 10,
      color: EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length],
    };
  });

  if (otherAmount > 0) {
    const otherPct = totalExpense > 0 ? (otherAmount / totalExpense) * 100 : 0;
    finalItems.push({
      name: 'OTHER EXPENSES',
      amount: otherAmount,
      percentage: Math.round(otherPct * 10) / 10,
      color: '#475569', // Neutral Dark Slate Gray
      isOther: true,
    });
  }

  return finalItems;
}

// ============================================================================
// CRITICAL FIX #2: MATHEMATICALLY PERFECT CIRCULAR DONUT CHART (1:1 SQUARE)
// ============================================================================

/**
 * Dedicated 1:1 square canvas donut chart generator.
 * Guaranteed:
 * - canvas.width === canvas.height === 1600 (Square)
 * - outerRadiusX === outerRadiusY === 720 (Circle)
 * - innerRadiusX === innerRadiusY === 450 (Circle)
 * - Ring thickness is uniform (270px) around 360 degrees
 * - Zero horizontal / vertical stretching or elliptical distortion
 * - Renders at ultra-high resolution (800+ DPI on PDF)
 */
function renderSquareDonutCanvas(options: {
  items: Array<{ name: string; amount: number; color: string }>;
  total: number;
  centerTitle: string;
  centerValue: string;
  emptyText?: string;
}): string {
  const size = 1600; // Perfect 1:1 square
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, size, size);

  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = 720;
  const innerRadius = 450;

  if (options.total <= 0 || options.items.length === 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
    ctx.arc(centerX, centerY, innerRadius, 2 * Math.PI, 0, true);
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.emptyText || 'No Data', centerX, centerY);
    return canvas.toDataURL('image/png');
  }

  let startAngle = -Math.PI / 2; // Start from top (12 o'clock)
  for (const item of options.items) {
    if (item.amount <= 0) continue;
    const sliceAngle = (item.amount / options.total) * (2 * Math.PI);
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();

    ctx.fillStyle = item.color;
    ctx.fill();

    // Crisp white divider line between slices
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.stroke();

    startAngle = endAngle;
  }

  // Pure white cutout for the donut hole
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Center Content
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Center Label
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(options.centerTitle, centerX, centerY - 42);

  // Center Value
  ctx.fillStyle = '#0F172A';
  const val = options.centerValue;
  const fontSize = val.length > 14 ? 64 : (val.length > 11 ? 74 : 84);
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(val, centerX, centerY + 38);

  return canvas.toDataURL('image/png');
}

/**
 * High-DPI Executive KPI Banner (Page 1)
 * Matches exact 182mm x 14mm aspect ratio (13:1) with zero stretching
 */
function renderKpiSummaryCanvas(
  totalIncome: number,
  netBalance: number,
  totalMeals: number
): string {
  const width = 2366;
  const height = 182;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, width, height);

  const cardW = 750;
  const cardH = 164;
  const cardY = 9;
  const gap = 48;

  const cards = [
    {
      label: 'TOTAL INCOME',
      value: `₹ ${formatIndianNumber(totalIncome)}`,
      accent: '#10B981',
      valColor: '#0F172A',
    },
    {
      label: 'NET BALANCE',
      value: `${netBalance < 0 ? '-' : ''}₹ ${formatIndianNumber(Math.abs(netBalance))}`,
      accent: netBalance >= 0 ? '#D4AF37' : '#F43F5E',
      valColor: netBalance >= 0 ? '#0F172A' : '#E11D48',
    },
    {
      label: 'MEALS SERVED',
      value: `${formatIndianNumber(totalMeals)} Meals`,
      accent: '#6366F1',
      valColor: '#3730A3',
    },
  ];

  cards.forEach((card, idx) => {
    const cardX = 14 + idx * (cardW + gap);

    // Card background
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = card.accent;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, 16, cardH, [14, 0, 0, 14]);
    ctx.fill();

    // Label
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(card.label, cardX + 44, cardY + 58);

    // Value
    ctx.fillStyle = card.valColor;
    ctx.font = '900 46px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(card.value, cardX + 44, cardY + 124);
  });

  return canvas.toDataURL('image/png');
}

// ============================================================================
// PDF GENERATOR (STRICTLY 2 PAGES)
// ============================================================================

export interface AnalyticsPdfOptions {
  dateRangeLabel: string;
  startDate?: string;
  endDate?: string;
  incomeRecords?: IncomeRecord[];
  expenseRecords?: ExpenseRecord[];
  incomeResult: IncomeDistributionResult;
  expenseResult: ExpenseDistributionResult;
  mealResult: MealCountResult;
}

export async function generateAnalyticsPDF(options: AnalyticsPdfOptions): Promise<void> {
  const {
    dateRangeLabel,
    startDate,
    endDate,
    incomeResult,
    expenseResult,
    mealResult,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const now = new Date();
  const generatedTimeStr =
    now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ', ' +
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const netBalance = incomeResult.totalIncome - expenseResult.totalExpense;

  // Process expenses strictly according to the < ₹10,000 threshold rule
  const finalExpenseItems = processExpensesForPdf(
    expenseResult.items,
    expenseResult.totalExpense
  );

  // ==========================================================================
  // PAGE 1: INCOME DISTRIBUTION & MEAL COUNT
  // ==========================================================================

  // Elegant Dark Header Banner
  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Gold accent stripe
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 23.2, pageWidth, 1.2, 'F');

  // Brand Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(242, 201, 76);
  doc.text('MAGNIFIQUE 2.0', margin, 11.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(210, 210, 210);
  doc.text('RESTAURANT ACCOUNTS & OPERATIONS ANALYTICS REPORT', margin, 18);

  doc.setFontSize(7.5);
  doc.setTextColor(170, 170, 170);
  doc.text(`Generated: ${generatedTimeStr}`, pageWidth - margin, 11.5, { align: 'right' });
  doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 18, { align: 'right' });

  // Executive KPI Summary Banner (182mm x 14mm, ratio locked)
  let curY = 27;
  const kpiImg = renderKpiSummaryCanvas(
    incomeResult.totalIncome,
    netBalance,
    mealResult.totalMeals
  );
  if (kpiImg) {
    doc.addImage(kpiImg, 'PNG', margin, curY, contentWidth, 14);
    curY += 14 + 4;
  }

  // --------------------------------------------------------------------------
  // SECTION A: INCOME DISTRIBUTION
  // --------------------------------------------------------------------------
  doc.setFillColor(212, 175, 55);
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('A. INCOME DISTRIBUTION', margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Income: ${formatIndianCurrency(incomeResult.totalIncome, 'text')}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 4.5;

  // Prepare Income items with curated colors
  const incomeItems = incomeResult.items.map((it, idx) => ({
    name: it.name,
    amount: it.amount,
    percentage: it.percentage,
    color: INCOME_PALETTE[idx % INCOME_PALETTE.length],
  }));

  // Render 1:1 SQUARE Donut Canvas
  const incomeDonutImg = renderSquareDonutCanvas({
    items: incomeItems,
    total: incomeResult.totalIncome,
    centerTitle: 'TOTAL INCOME',
    centerValue: `₹${formatIndianNumber(incomeResult.totalIncome)}`,
    emptyText: 'No Income Data',
  });

  // Card container for chart + legend
  const incomeCardH = 44;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, incomeCardH, 2.5, 2.5, 'FD');

  // Place Donut Chart: EXACT SQUARE (38mm x 38mm), width === height!
  const incomeChartSize = 38;
  const incomeChartX = margin + 3.5;
  const incomeChartY = curY + (incomeCardH - incomeChartSize) / 2;
  if (incomeDonutImg) {
    doc.addImage(incomeDonutImg, 'PNG', incomeChartX, incomeChartY, incomeChartSize, incomeChartSize);
  }

  // Legend on the Right (Vector text and crisp bullet dots)
  const incomeLegendX = incomeChartX + incomeChartSize + 7;
  const incomeLegendW = margin + contentWidth - incomeLegendX - 3;
  const useTwoColsIncome = incomeItems.length > 4;
  const incomeColGap = 5.0;
  const colWIncome = useTwoColsIncome ? (incomeLegendW - incomeColGap) / 2 : incomeLegendW;
  const maxRowsIncome = useTwoColsIncome ? Math.ceil(incomeItems.length / 2) : incomeItems.length;
  const rowHIncome = Math.min(8.5, (incomeCardH - 6) / Math.max(maxRowsIncome, 1));
  const totalIncomeLegendH = maxRowsIncome * rowHIncome;

  // Subtle thin vertical divider between the two income legend columns
  if (useTwoColsIncome) {
    const incomeDividerX = incomeLegendX + colWIncome + 2.0;
    const incomeDividerStartY = curY + 4 + 1.0;
    const incomeDividerEndY = curY + 4 + totalIncomeLegendH - 1.0;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(incomeDividerX, incomeDividerStartY, incomeDividerX, incomeDividerEndY);
  }

  incomeItems.forEach((item, idx) => {
    const col = useTwoColsIncome ? Math.floor(idx / maxRowsIncome) : 0;
    const row = useTwoColsIncome ? idx % maxRowsIncome : idx;
    const colStartX = incomeLegendX + col * (colWIncome + incomeColGap);
    const itemCenterY = curY + 4 + row * rowHIncome + rowHIncome / 2;

    // Color bullet
    const [r, g, b] = hexToRgb(item.color);
    doc.setFillColor(r, g, b);
    doc.circle(colStartX + 2, itemCenterY, 1.2, 'F');

    // Name (truncated if needed)
    let displayName = item.name;
    const maxChars = useTwoColsIncome ? 14 : 22;
    if (displayName.length > maxChars) {
      displayName = displayName.substring(0, maxChars - 2) + '..';
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(displayName, colStartX + 5, itemCenterY + 1.0);

    // Amount (pure Indian formatted number, strictly no currency symbol or prefix)
    const amtStr = formatIndianNumber(item.amount);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(amtStr, colStartX + colWIncome - 17, itemCenterY + 1.0, { align: 'right' });

    // Percentage
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(r, g, b);
    doc.text(`${item.percentage.toFixed(1)}%`, colStartX + colWIncome - 1, itemCenterY + 1.0, { align: 'right' });
  });

  curY += incomeCardH + 2;

  // Income Distribution Table
  const incomeTableRows = incomeItems.map((item, index) => [
    String(index + 1),
    item.name,
    formatIndianCurrency(item.amount, 'text'),
    `${item.percentage.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    head: [['#', 'Name', 'Total Amount (INR)', 'Share (%)']],
    body: incomeTableRows,
    foot: [['', 'Total Income', formatIndianCurrency(incomeResult.totalIncome, 'text'), '100.0%']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.4,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.4,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    pageBreak: 'avoid',
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // --------------------------------------------------------------------------
  // SECTION B: MEAL COUNT (MEALS SERVED) - ON PAGE 1
  // --------------------------------------------------------------------------
  doc.setFillColor(99, 102, 241);
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('B. MEAL COUNT (MEALS SERVED)', margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Total Meals: ${formatIndianNumber(mealResult.totalMeals)}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 4.5;

  // Slices: Breakfast, Lunch, Dinner (strictly 3 slices, NO prices!)
  const mealSlices = [
    { name: 'Breakfast', amount: mealResult.breakfast, color: MEAL_PALETTE.Breakfast },
    { name: 'Lunch', amount: mealResult.lunch, color: MEAL_PALETTE.Lunch },
    { name: 'Dinner', amount: mealResult.dinner, color: MEAL_PALETTE.Dinner },
  ];

  const mealDonutImg = renderSquareDonutCanvas({
    items: mealSlices,
    total: mealResult.totalMeals,
    centerTitle: 'TOTAL MEALS',
    centerValue: formatIndianNumber(mealResult.totalMeals),
    emptyText: 'No Meal Data',
  });

  const mealCardH = 44;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, mealCardH, 2.5, 2.5, 'FD');

  // Place Meal Donut Chart: EXACT SQUARE (38mm x 38mm), width === height!
  const mealChartSize = 38;
  const mealChartX = margin + 3.5;
  const mealChartY = curY + (mealCardH - mealChartSize) / 2;
  if (mealDonutImg) {
    doc.addImage(mealDonutImg, 'PNG', mealChartX, mealChartY, mealChartSize, mealChartSize);
  }

  // Right Side: 3 Distinct Summary Session Boxes + Total Row (Strictly NO monetary prices!)
  const mealLegendX = mealChartX + mealChartSize + 7;
  const mealLegendW = margin + contentWidth - mealLegendX - 3;
  const sessionBoxH = 8.5;
  const sessionGap = 1.6;

  const sessionConfigs = [
    {
      label: 'BREAKFAST',
      count: mealResult.breakfast,
      pct: mealResult.totalMeals > 0 ? (mealResult.breakfast / mealResult.totalMeals) * 100 : 0,
      color: MEAL_PALETTE.Breakfast,
      bg: [255, 251, 235], // Amber-50
      border: [253, 230, 138],
      titleColor: [146, 64, 14],
    },
    {
      label: 'LUNCH',
      count: mealResult.lunch,
      pct: mealResult.totalMeals > 0 ? (mealResult.lunch / mealResult.totalMeals) * 100 : 0,
      color: MEAL_PALETTE.Lunch,
      bg: [236, 253, 245], // Emerald-50
      border: [167, 243, 208],
      titleColor: [6, 95, 70],
    },
    {
      label: 'DINNER',
      count: mealResult.dinner,
      pct: mealResult.totalMeals > 0 ? (mealResult.dinner / mealResult.totalMeals) * 100 : 0,
      color: MEAL_PALETTE.Dinner,
      bg: [238, 242, 255], // Indigo-50
      border: [199, 210, 254],
      titleColor: [55, 48, 163],
    },
  ];

  sessionConfigs.forEach((cfg, idx) => {
    const boxY = curY + 2.5 + idx * (sessionBoxH + sessionGap);

    // Box fill & border
    doc.setFillColor(cfg.bg[0], cfg.bg[1], cfg.bg[2]);
    doc.setDrawColor(cfg.border[0], cfg.border[1], cfg.border[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(mealLegendX, boxY, mealLegendW, sessionBoxH, 1.5, 1.5, 'FD');

    // Dot
    const [cr, cg, cb] = hexToRgb(cfg.color);
    doc.setFillColor(cr, cg, cb);
    doc.circle(mealLegendX + 3.5, boxY + sessionBoxH / 2, 1.2, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(cfg.titleColor[0], cfg.titleColor[1], cfg.titleColor[2]);
    doc.text(cfg.label, mealLegendX + 7, boxY + sessionBoxH / 2 + 0.9);

    // Meals count
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${formatIndianNumber(cfg.count)} meals`,
      mealLegendX + mealLegendW - 24,
      boxY + sessionBoxH / 2 + 0.9,
      { align: 'right' }
    );

    // Share
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(cr, cg, cb);
    doc.text(`${cfg.pct.toFixed(1)}%`, mealLegendX + mealLegendW - 3, boxY + sessionBoxH / 2 + 0.9, {
      align: 'right',
    });
  });

  // Total bar below the 3 boxes
  const totalBarY = curY + 2.5 + 3 * (sessionBoxH + sessionGap);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(mealLegendX, totalBarY, mealLegendW, 6.5, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('TOTAL MEALS SERVED', mealLegendX + 5, totalBarY + 4.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${formatIndianNumber(mealResult.totalMeals)} meals  (100.0%)`,
    mealLegendX + mealLegendW - 3,
    totalBarY + 4.2,
    { align: 'right' }
  );

  curY += mealCardH + 2;

  // Meal Count Table
  const mealTableRows = mealResult.items.map((item, index) => [
    String(index + 1),
    item.name,
    formatIndianNumber(item.count),
    `${item.percentage.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    head: [['#', 'Meal Session', 'Number of Meals Served', 'Share (%)']],
    body: mealTableRows,
    foot: [['', 'Total Meals Served', formatIndianNumber(mealResult.totalMeals), '100.0%']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.4,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.4,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 46, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    pageBreak: 'avoid',
  });

  curY = (doc as any).lastAutoTable.finalY + 3;

  // Methodology Note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    '* Note: Meal counts are derived from guest member counts across individual meals, multi-meal combinations, and 3-time meal plans. Monetary values are intentionally excluded.',
    margin,
    curY + 2
  );

  // ==========================================================================
  // PAGE 2: EXPENSES ONLY
  // ==========================================================================
  doc.addPage();

  // Top Header on Page 2
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
  doc.text('• RESTAURANT ACCOUNTS & OPERATIONS ANALYTICS REPORT', margin + 42, 10);

  doc.setFontSize(7.5);
  doc.setTextColor(170, 170, 170);
  doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, 10, { align: 'right' });

  curY = 22.5;

  // Section Header: B. EXPENSE DISTRIBUTION
  doc.setFillColor(244, 63, 94);
  doc.circle(margin + 1.5, curY + 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('B. EXPENSE DISTRIBUTION', margin + 5, curY + 2.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(225, 29, 72);
  doc.text(
    `TOTAL EXPENSES: ${formatIndianCurrency(expenseResult.totalExpense, 'text')}`,
    pageWidth - margin,
    curY + 2.5,
    { align: 'right' }
  );

  curY += 5;

  // 1:1 SQUARE Large Donut Canvas for Expenses (using the EXACT SAME final grouped items!)
  const expenseDonutImg = renderSquareDonutCanvas({
    items: finalExpenseItems.map((it) => ({
      name: it.name,
      amount: it.amount,
      color: it.color,
    })),
    total: expenseResult.totalExpense,
    centerTitle: 'TOTAL EXPENSES',
    centerValue: `₹${formatIndianNumber(expenseResult.totalExpense)}`,
    emptyText: 'No Expense Data',
  });

  // Large Card Container on Page 2 (Giving the chart prominent, sharp display)
  const expenseCardH = 68;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, expenseCardH, 2.5, 2.5, 'FD');

  // Place Expense Donut Chart: EXACT SQUARE (58mm x 58mm), width === height!
  const expenseChartSize = 58;
  const expenseChartX = margin + 2.5;
  const expenseChartY = curY + (expenseCardH - expenseChartSize) / 2;
  if (expenseDonutImg) {
    doc.addImage(expenseDonutImg, 'PNG', expenseChartX, expenseChartY, expenseChartSize, expenseChartSize);
  }

  // Right Side: Fixed 2-Column Grid Legend for Expense Categories
  // Each column has 3 strictly defined independent sub-columns:
  // Column 1: Color Bullet + Name (left-aligned)
  // Column 2: Amount (right-aligned)
  // Column 3: Percentage (right-aligned)
  const nameColWidth = 35.0;
  const amountColWidth = 12.5;
  const percentColWidth = 9.0;
  const legendColWidth = nameColWidth + amountColWidth + percentColWidth; // 56.5 mm
  const legendColGap = 4.4;
  const expenseLegendX = 76.5;

  const numItems = finalExpenseItems.length;
  const maxRowsExpense = Math.max(Math.ceil(numItems / 2), 1);
  const rowHExpense = 9.0;
  const totalLegendH = maxRowsExpense * rowHExpense;
  const legendTopY = curY + (expenseCardH - totalLegendH) / 2;

  // Subtle thin vertical divider between the two expense legend columns
  if (numItems > maxRowsExpense) {
    const expenseDividerX = expenseLegendX + legendColWidth + legendColGap / 2;
    const expenseDividerStartY = legendTopY + 1.2;
    const expenseDividerEndY = legendTopY + totalLegendH - 1.2;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(expenseDividerX, expenseDividerStartY, expenseDividerX, expenseDividerEndY);
  }

  finalExpenseItems.forEach((item, idx) => {
    const col = Math.floor(idx / maxRowsExpense);
    const row = idx % maxRowsExpense;
    const columnX = expenseLegendX + col * (legendColWidth + legendColGap);

    const nameX = columnX;
    const amountX = columnX + nameColWidth;
    const percentageX = amountX + amountColWidth;

    const rowCenterY = legendTopY + row * rowHExpense + rowHExpense / 2;
    const textBaselineY = rowCenterY + 0.85;

    // Sub-column 1: Bullet Dot + Name
    const [r, g, b] = hexToRgb(item.color);
    doc.setFillColor(r, g, b);
    doc.circle(nameX + 1.2, rowCenterY, 1.05, 'F');

    // Name (Left-aligned at nameX + 3.8, measured with PDF font)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(
      item.name === 'OTHER EXPENSES' ? 71 : 15,
      item.name === 'OTHER EXPENSES' ? 85 : 23,
      item.name === 'OTHER EXPENSES' ? 105 : 42
    );

    const maxNameTextWidth = nameColWidth - 4.5;
    let displayName = item.name;
    if (doc.getTextWidth(displayName) > maxNameTextWidth) {
      while (displayName.length > 3 && doc.getTextWidth(displayName + '..') > maxNameTextWidth) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '..';
    }
    doc.text(displayName, nameX + 3.8, textBaselineY);

    // Sub-column 2: Amount (Right-aligned at amountX + amountColWidth)
    const amtStr = formatIndianNumber(item.amount);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    doc.text(amtStr, amountX + amountColWidth, textBaselineY, { align: 'right' });

    // Sub-column 3: Percentage (Right-aligned at percentageX + percentColWidth)
    const pctStr = `${item.percentage.toFixed(1)}%`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(r, g, b);
    doc.text(pctStr, percentageX + percentColWidth, textBaselineY, { align: 'right' });
  });

  curY += expenseCardH + 3.5;

  // Final Grouped Expense Table (Contains ONLY groups >= ₹10,000 + ONE OTHER EXPENSES row!)
  const expenseTableRows = finalExpenseItems.map((item, index) => [
    String(index + 1),
    item.name,
    formatIndianCurrency(item.amount, 'text'),
    `${item.percentage.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin, bottom: 12 },
    head: [['#', 'Expense Item (Grouped Description)', 'Total Amount (INR)', 'Share (%)']],
    body: expenseTableRows,
    foot: [['', 'Total Expenses', formatIndianCurrency(expenseResult.totalExpense, 'text'), '100.0%']],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [242, 201, 76],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.6,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.6,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    pageBreak: 'avoid',
  });

  // Strict 2-Page Guarantee: delete any extraneous overflow pages
  while (doc.getNumberOfPages() > 2) {
    doc.deletePage(doc.getNumberOfPages());
  }

  // ==========================================================================
  // FOOTER (BOTH PAGES)
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
    doc.text('MAGNIFIQUE 2.0 • RESTAURANT ANALYTICS REPORT', margin, pageHeight - 6.5);

    doc.text('CONFIDENTIAL FINANCIAL STATEMENT', pageWidth / 2, pageHeight - 6.5, { align: 'center' });

    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, { align: 'right' });
  }

  // Safe file name
  const safeStart = startDate ? startDate.replace(/[^0-9]/g, '') : '';
  const safeEnd = endDate ? endDate.replace(/[^0-9]/g, '') : '';
  const cleanLabel = (dateRangeLabel || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName =
    safeStart && safeEnd
      ? `Magnifique_Analytics_Report_${safeStart}_to_${safeEnd}.pdf`
      : `Magnifique_Analytics_Report_${cleanLabel}.pdf`;

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
