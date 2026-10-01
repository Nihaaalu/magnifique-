import { IncomeRecord, ExpenseRecord, Partner, PartnerSettlement } from '../types';
import {
  isIncomeAssignedToPartner,
  isExpensePaidByPartner,
  isSettlementForPartner,
  getSettlementDirection,
  normalizePartnerName,
} from './partnerBalanceUtils';
import { formatPdfMonth } from '../services/pdfReportGenerator';

export interface ReconciledPartnerPosition {
  partnerId: string;
  partnerName: string;
  // Raw underlying activity
  rawIncomeBalance: number;
  rawExpenses: number;
  settlementsToHotel: number;
  settlementsFromHotel: number;
  // Outstanding position after applying settlement rules
  netPosition: number; // positive: owes hotel, negative: hotel owes partner
  direction: 'to_hotel' | 'to_partner' | 'zero';
  directionLabel: string; // e.g. "HOTEL TO YOGESH", "IRSHAD TO HOTEL"
  displayAmount: number; // Math.abs(netPosition)
  isZero: boolean;
  // Reconciled separated sides (Single Source of Truth)
  // NET PARTNER POSITION = balanceToHotel - expensesByPartner
  balanceToHotel: number; // > 0 only when netPosition > 0
  expensesByPartner: number; // > 0 only when netPosition < 0
  canSettleBalance: boolean; // true only when balanceToHotel > 0
  canSettleExpense: boolean; // true only when expensesByPartner > 0
}

export interface ReconciledMonthItem {
  month: string;
  monthName: string;
  amount: number;
  direction: 'to_hotel' | 'to_partner';
  directionLabel: string;
  netPosition: number;
  balanceToHotel: number;
  expensesByPartner: number;
}

export interface ReconciledPartnerHistory {
  partnerId: string;
  partnerName: string;
  months: ReconciledMonthItem[];
  totalNet: number;
  totalAmount: number;
  totalDirection: 'to_hotel' | 'to_partner' | 'zero';
  totalLabel: string;
  showTotal: boolean; // only when months.length >= 2
  hasData: boolean;
}

export interface PartnerIntegrityReport {
  isValid: boolean;
  issues: string[];
  partnerSummaries: {
    partnerName: string;
    balanceToHotel: number;
    expensesByPartner: number;
    netPosition: number;
    directionLabel: string;
    isConsistent: boolean;
  }[];
}

/**
 * Reconciles the financial position of a single partner according to strict accounting rules.
 *
 * NET PARTNER POSITION = BALANCE_TO_HOTEL - EXPENSES_BY_PARTNER
 *
 * - IF NET > 0: Partner owes Hotel (PARTNER TO HOTEL, balanceToHotel = net, expensesByPartner = 0)
 * - IF NET < 0: Hotel owes Partner (HOTEL TO PARTNER, balanceToHotel = 0, expensesByPartner = |net|)
 * - IF NET = 0: Balanced (isZero = true, no outstanding position)
 */
export function reconcilePartnerPosition(
  partnerName: string,
  partnerId: string | undefined,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: any[] = [],
  options?: {
    month?: string; // YYYY-MM (calculates strictly for this accounting month)
    cutoffMonth?: string; // YYYY-MM (calculates accumulated up to this month inclusive)
    cutoffDate?: string; // YYYY-MM-DD (calculates accumulated up to this date inclusive)
  }
): ReconciledPartnerPosition {
  const normName = normalizePartnerName(partnerName);
  const targetId = partnerId ? String(partnerId) : undefined;

  // Filter incomes
  const filteredIncomes = incomeRecords.filter((r) => {
    if (!r.date) return false;
    if (options?.month && !r.date.startsWith(options.month)) return false;
    if (options?.cutoffMonth && r.date.substring(0, 7) > options.cutoffMonth) return false;
    if (options?.cutoffDate && r.date > options.cutoffDate) return false;
    return isIncomeAssignedToPartner(r, normName, targetId);
  });

  // Filter expenses
  const filteredExpenses = expenseRecords.filter((r) => {
    if (!r.date) return false;
    if (options?.month && !r.date.startsWith(options.month)) return false;
    if (options?.cutoffMonth && r.date.substring(0, 7) > options.cutoffMonth) return false;
    if (options?.cutoffDate && r.date > options.cutoffDate) return false;
    return isExpensePaidByPartner(r, normName, targetId);
  });

  // Filter settlements (respecting settlement_month first, then settlement_date)
  const filteredSettlements = partnerSettlements.filter((s) => {
    const sMonth = s.settlementMonth
      ? s.settlementMonth.substring(0, 7)
      : s.date
      ? s.date.substring(0, 7)
      : s.settlement_date
      ? s.settlement_date.substring(0, 7)
      : '';
    const sDate = s.settlement_date || s.date || '';

    if (options?.month && sMonth !== options.month) return false;
    if (options?.cutoffMonth && sMonth > options.cutoffMonth) return false;
    if (options?.cutoffDate && sDate > options.cutoffDate) return false;

    return isSettlementForPartner(s, normName, targetId);
  });

  // Raw sums
  const rawIncomeBalance = filteredIncomes.reduce(
    (sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0),
    0
  );

  const rawExpenses = filteredExpenses.reduce(
    (sum, r) => sum + (Number(r.amount) || 0),
    0
  );

  const settlementsToHotel = filteredSettlements
    .filter((s) => getSettlementDirection(s) === 'to_hotel')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const settlementsFromHotel = filteredSettlements
    .filter((s) => getSettlementDirection(s) === 'from_hotel')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  // Remaining activity on each side:
  // - Owed to hotel = Income Balance - Settlements paid to hotel
  // - Owed by hotel = Expenses paid - Settlements reimbursed by hotel
  const rawBalanceToHotel = rawIncomeBalance - settlementsToHotel;
  const rawExpensesByPartner = rawExpenses - settlementsFromHotel;

  // NET PARTNER POSITION = BALANCE_TO_HOTEL - EXPENSES_BY_PARTNER
  const netPosition = Math.round(rawBalanceToHotel - rawExpensesByPartner);

  let direction: 'to_hotel' | 'to_partner' | 'zero' = 'zero';
  let directionLabel = '';
  let balanceToHotel = 0;
  let expensesByPartner = 0;

  if (netPosition > 0) {
    direction = 'to_hotel';
    directionLabel = `${normName} TO HOTEL`;
    balanceToHotel = netPosition;
    expensesByPartner = 0;
  } else if (netPosition < 0) {
    direction = 'to_partner';
    directionLabel = `HOTEL TO ${normName}`;
    balanceToHotel = 0;
    expensesByPartner = Math.abs(netPosition);
  } else {
    direction = 'zero';
    directionLabel = '';
    balanceToHotel = 0;
    expensesByPartner = 0;
  }

  return {
    partnerId: targetId || normName,
    partnerName: normName,
    rawIncomeBalance,
    rawExpenses,
    settlementsToHotel,
    settlementsFromHotel,
    netPosition,
    direction,
    directionLabel,
    displayAmount: Math.abs(netPosition),
    isZero: netPosition === 0,
    balanceToHotel,
    expensesByPartner,
    canSettleBalance: balanceToHotel > 0,
    canSettleExpense: expensesByPartner > 0,
  };
}

/**
 * Reconciles all target partners (IRSHAD, ANSARI, SATHISH, YOGESH) for a given month or overall.
 */
export function reconcileAllPartners(
  targetPartnerNames: string[] = ['IRSHAD', 'ANSARI', 'SATHISH', 'YOGESH'],
  partners: Partner[] = [],
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: any[] = [],
  options?: {
    month?: string;
    cutoffMonth?: string;
    cutoffDate?: string;
  }
): ReconciledPartnerPosition[] {
  return targetPartnerNames.map((name) => {
    const p = partners.find(
      (pt) => normalizePartnerName(pt.name) === normalizePartnerName(name)
    );
    const pid = p?.id ? String(p.id) : name === 'IRSHAD' ? '2' : undefined;
    return reconcilePartnerPosition(
      name,
      pid,
      incomeRecords,
      expenseRecords,
      partnerSettlements,
      options
    );
  });
}

/**
 * Calculates historical monthly breakdown and cumulative total for a partner up to selectedMonth.
 */
export function reconcilePartnerHistory(
  partnerName: string,
  partnerId: string | undefined,
  selectedMonth: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: any[] = []
): ReconciledPartnerHistory {
  const normName = normalizePartnerName(partnerName);

  // Collect all months up to selectedMonth that have records
  const monthsSet = new Set<string>();
  incomeRecords.forEach((r) => r.date && monthsSet.add(r.date.substring(0, 7)));
  expenseRecords.forEach((r) => r.date && monthsSet.add(r.date.substring(0, 7)));
  partnerSettlements.forEach((s) => {
    const m = s.settlementMonth
      ? s.settlementMonth.substring(0, 7)
      : s.date
      ? s.date.substring(0, 7)
      : s.settlement_date
      ? s.settlement_date.substring(0, 7)
      : '';
    if (m) monthsSet.add(m);
  });
  if (selectedMonth) monthsSet.add(selectedMonth);

  const sortedMonths = Array.from(monthsSet)
    .filter((m) => m <= selectedMonth)
    .sort();

  const months: ReconciledMonthItem[] = [];

  for (const m of sortedMonths) {
    const pos = reconcilePartnerPosition(
      normName,
      partnerId,
      incomeRecords,
      expenseRecords,
      partnerSettlements,
      { month: m }
    );

    // Only include months that have a non-zero outstanding position
    if (!pos.isZero) {
      months.push({
        month: m,
        monthName: formatPdfMonth(m).split(' ')[0],
        amount: pos.displayAmount,
        direction: pos.direction === 'to_hotel' ? 'to_hotel' : 'to_partner',
        directionLabel: pos.directionLabel,
        netPosition: pos.netPosition,
        balanceToHotel: pos.balanceToHotel,
        expensesByPartner: pos.expensesByPartner,
      });
    }
  }

  // Calculate cumulative total across all months <= selectedMonth
  const totalPos = reconcilePartnerPosition(
    normName,
    partnerId,
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    { cutoffMonth: selectedMonth }
  );

  const totalNet = totalPos.netPosition;
  let totalDirection: 'to_hotel' | 'to_partner' | 'zero' = 'zero';
  let totalLabel = '';

  if (totalNet > 0) {
    totalDirection = 'to_hotel';
    totalLabel = `${normName} TO HOTEL (TOTAL)`;
  } else if (totalNet < 0) {
    totalDirection = 'to_partner';
    totalLabel = `HOTEL TO ${normName} (TOTAL)`;
  }

  return {
    partnerId: partnerId || normName,
    partnerName: normName,
    months,
    totalNet,
    totalAmount: Math.abs(totalNet),
    totalDirection,
    totalLabel,
    showTotal: months.length >= 2,
    hasData: months.length > 0 || totalNet !== 0,
  };
}

/**
 * Runs a mathematical and accounting integrity audit across all target partners.
 * Verifies that:
 * 1. NET POSITION = balanceToHotel - expensesByPartner
 * 2. Only ONE direction is non-zero
 * 3. Never shows positive as Hotel owes or negative as Partner owes
 */
export function validatePartnerIntegrity(
  partners: Partner[] = [],
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: any[] = [],
  month?: string
): PartnerIntegrityReport {
  const targetPartners = ['IRSHAD', 'ANSARI', 'SATHISH', 'YOGESH'];
  const issues: string[] = [];

  const partnerSummaries = targetPartners.map((name) => {
    const p = partners.find(
      (pt) => normalizePartnerName(pt.name) === normalizePartnerName(name)
    );
    const pid = p?.id ? String(p.id) : undefined;
    const pos = reconcilePartnerPosition(
      name,
      pid,
      incomeRecords,
      expenseRecords,
      partnerSettlements,
      month ? { month } : undefined
    );

    let isConsistent = true;

    // Check 1: NET PARTNER POSITION formula
    const expectedNet = pos.balanceToHotel - pos.expensesByPartner;
    if (expectedNet !== pos.netPosition) {
      isConsistent = false;
      issues.push(
        `${name}: Net position mismatch. Expected ${expectedNet}, got ${pos.netPosition}`
      );
    }

    // Check 2: Direction matching
    if (pos.netPosition > 0 && pos.direction !== 'to_hotel') {
      isConsistent = false;
      issues.push(`${name}: Net is positive (${pos.netPosition}), but direction is not 'to_hotel'`);
    }
    if (pos.netPosition < 0 && pos.direction !== 'to_partner') {
      isConsistent = false;
      issues.push(`${name}: Net is negative (${pos.netPosition}), but direction is not 'to_partner'`);
    }

    // Check 3: Mutually exclusive sides
    if (pos.balanceToHotel > 0 && pos.expensesByPartner > 0) {
      isConsistent = false;
      issues.push(`${name}: Both balanceToHotel and expensesByPartner are positive`);
    }

    return {
      partnerName: name,
      balanceToHotel: pos.balanceToHotel,
      expensesByPartner: pos.expensesByPartner,
      netPosition: pos.netPosition,
      directionLabel: pos.directionLabel,
      isConsistent,
    };
  });

  return {
    isValid: issues.length === 0,
    issues,
    partnerSummaries,
  };
}
