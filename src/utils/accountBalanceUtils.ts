import { IncomeRecord, ExpenseRecord, PartnerSettlement, AccountMonthRow } from '../types';

/**
 * Official Business Accounting Start Month: September 2026.
 * No accounting period or previous-month assignment is valid before this month.
 */
export const BUSINESS_START_ACCOUNTING_MONTH = '2026-09';

/**
 * Extracts the accounting month (YYYY-MM) for an expense record.
 * Falls back to the expense_date month if accountingMonth is not explicitly set.
 */
export function getExpenseAccountingMonth(record: {
  accountingMonth?: string | null;
  accounting_month?: string | null;
  date?: string | null;
  expense_date?: string | null;
}): string {
  if (record.accountingMonth && record.accountingMonth.length >= 7) {
    return record.accountingMonth.substring(0, 7);
  }
  if (record.accounting_month && record.accounting_month.length >= 7) {
    return record.accounting_month.substring(0, 7);
  }
  const d = record.date || record.expense_date;
  if (d && d.length >= 7) {
    return d.substring(0, 7);
  }
  return '';
}

/**
 * Computes the immediately previous month in 'YYYY-MM' format.
 * e.g. '2026-10' -> '2026-09', '2026-01' -> '2025-12'
 */
export function getPreviousMonthString(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return '';
  const [yStr, mStr] = monthStr.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  if (m === 1) {
    y -= 1;
    m = 12;
  } else {
    m -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Checks if a given month is officially closed in account_months.
 * Any month prior to BUSINESS_START_ACCOUNTING_MONTH is considered permanently closed/unavailable.
 */
export function isMonthClosed(monthStr: string, accountMonths: AccountMonthRow[] = []): boolean {
  if (!monthStr) return true;
  const prefix = monthStr.substring(0, 7);
  if (prefix < BUSINESS_START_ACCOUNTING_MONTH) {
    return true;
  }
  const found = accountMonths.find((m) => m.month_start && m.month_start.startsWith(prefix));
  return Boolean(found && found.is_closed);
}

/**
 * Checks if a given month exists in account_months or has actual accounting transaction data.
 * Any month prior to BUSINESS_START_ACCOUNTING_MONTH does not exist in business accounting.
 */
export function doesMonthExistInRecords(
  monthStr: string,
  accountMonths: AccountMonthRow[] = [],
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = []
): boolean {
  if (!monthStr || monthStr.length < 7) return false;
  const prefix = monthStr.substring(0, 7);
  if (prefix < BUSINESS_START_ACCOUNTING_MONTH) {
    return false;
  }

  // 1. Check if defined in account_months table
  const foundInAccountMonths = accountMonths.some(
    (m) => m.month_start && m.month_start.startsWith(prefix)
  );
  if (foundInAccountMonths) return true;

  // 2. Check if any actual income or expense records exist for this month
  const hasIncome = incomeRecords.some((r) => r.date && r.date.startsWith(prefix));
  const hasExpense = expenseRecords.some(
    (r) =>
      (r.date && r.date.startsWith(prefix)) ||
      (r.accountingMonth && r.accountingMonth.startsWith(prefix)) ||
      (r.accounting_month && r.accounting_month.startsWith(prefix))
  );

  return hasIncome || hasExpense;
}

/**
 * Checks if a previous month is eligible for an expense date.
 * A previous month is eligible ONLY IF:
 * 1. prevMonth >= BUSINESS_START_ACCOUNTING_MONTH ('2026-09')
 * 2. The previous month actually exists in the database (account_months or actual accounting data)
 * 3. The previous month is NOT closed (is_closed is false)
 * 4. The expense date's month is strictly the calendar month immediately following the previous month
 */
export function isPreviousMonthEligible(
  expenseDate: string,
  accountMonths: AccountMonthRow[] = [],
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = []
): boolean {
  if (!expenseDate || expenseDate.length < 7) return false;
  const expMonth = expenseDate.substring(0, 7);
  const prevMonth = getPreviousMonthString(expMonth);
  if (!prevMonth) return false;

  // 1. Business started September 2026: any month before '2026-09' is permanently ineligible
  if (prevMonth < BUSINESS_START_ACCOUNTING_MONTH) {
    return false;
  }

  // 2. Must exist in account_months (or actual database records)
  const exists = doesMonthExistInRecords(prevMonth, accountMonths, incomeRecords, expenseRecords);
  if (!exists) return false;

  // 3. Must NOT be closed
  const closed = isMonthClosed(prevMonth, accountMonths);
  if (closed) return false;

  return true;
}

export interface MonthBalanceSummary {
  month: string; // 'YYYY-MM'
  monthStart: string; // 'YYYY-MM-01'
  openingBalance: number;
  totalIncome: number; // total billed
  totalPaid: number; // actual cash collected (amount_received)
  totalBalance: number; // receivables (balance_amount)
  totalExpense: number; // expenses
  settlementToHotel: number; // partner money received by hotel
  settlementFromHotel: number; // partner money paid by hotel
  closingBalance: number; // opening + totalIncome - totalExpense
  isClosed: boolean;
  closedAt?: string | null;
  firstDate: string; // e.g. 2026-08-01
  lastDate: string; // e.g. 2026-08-31
}

export interface DayBalanceSummary {
  date: string; // 'YYYY-MM-DD'
  openingBalance: number;
  totalIncome: number;
  totalPaid: number;
  totalBalance: number;
  totalExpense: number;
  settlementToHotel: number;
  settlementFromHotel: number;
  closingBalance: number;
}

/**
 * Get all unique dates (YYYY-MM-DD) that have account data (at least 1 income or 1 expense entry),
 * sorted chronologically.
 */
export function getAllAvailableAccountDates(
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = []
): string[] {
  const dateSet = new Set<string>();

  incomeRecords.forEach((r) => {
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      dateSet.add(r.date);
    }
  });

  expenseRecords.forEach((r) => {
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      dateSet.add(r.date);
    }
  });

  return Array.from(dateSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Get all unique months (YYYY-MM) that have account data (at least 1 income or 1 expense entry),
 * sorted chronologically.
 */
export function getAllAvailableAccountMonths(
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: any[] = []
): string[] {
  const monthSet = new Set<string>();

  incomeRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      const m = r.date.substring(0, 7);
      if (m >= BUSINESS_START_ACCOUNTING_MONTH) {
        monthSet.add(m);
      }
    }
  });

  expenseRecords.forEach((r) => {
    const expM = getExpenseAccountingMonth(r);
    if (expM && expM >= BUSINESS_START_ACCOUNTING_MONTH) {
      monthSet.add(expM);
    }
  });

  accountMonths.forEach((m) => {
    if (
      m.month_start &&
      m.month_start.length >= 7 &&
      (m.is_closed || (m.total_income && m.total_income > 0) || (m.total_expense && m.total_expense > 0))
    ) {
      const mStr = m.month_start.substring(0, 7);
      if (mStr >= BUSINESS_START_ACCOUNTING_MONTH) {
        monthSet.add(mStr);
      }
    }
  });

  partnerSettlements.forEach((s) => {
    const sMonth = s.settlement_month || (s.date ? s.date.substring(0, 7) : '');
    if (sMonth && sMonth >= BUSINESS_START_ACCOUNTING_MONTH) {
      monthSet.add(sMonth.substring(0, 7));
    }
  });

  return Array.from(monthSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Get all unique months (YYYY-MM) present in records, account_months, or current date, sorted chronologically.
 */
export function getAllUniqueMonths(
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = []
): string[] {
  const monthSet = new Set<string>();

  const currentMonth = new Date().toISOString().substring(0, 7);
  if (currentMonth >= BUSINESS_START_ACCOUNTING_MONTH) {
    monthSet.add(currentMonth);
  } else {
    monthSet.add(BUSINESS_START_ACCOUNTING_MONTH);
  }

  incomeRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      const m = r.date.substring(0, 7);
      if (m >= BUSINESS_START_ACCOUNTING_MONTH) {
        monthSet.add(m);
      }
    }
  });

  expenseRecords.forEach((r) => {
    const expM = getExpenseAccountingMonth(r);
    if (expM && expM >= BUSINESS_START_ACCOUNTING_MONTH) {
      monthSet.add(expM);
    }
  });

  accountMonths.forEach((m) => {
    if (m.month_start && m.month_start.length >= 7) {
      const mStr = m.month_start.substring(0, 7);
      if (mStr >= BUSINESS_START_ACCOUNTING_MONTH) {
        monthSet.add(mStr);
      }
    }
  });

  partnerSettlements.forEach((s) => {
    if (s.date && s.date.length >= 7) {
      const mStr = s.date.substring(0, 7);
      if (mStr >= BUSINESS_START_ACCOUNTING_MONTH) {
        monthSet.add(mStr);
      }
    }
  });

  return Array.from(monthSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Calculate the running balances for all months chronologically using account_months as persistent state.
 * 
 * RULES:
 * 1. Opening balance must always be calculated from VALID EXISTING ACCOUNT DATA only.
 * 2. Deleted income or expense entries must have ZERO effect on balances or totals.
 * 3. For the first active month with no previous valid closed balance: Opening Balance = ₹0.
 * 4. For subsequent months: Opening Balance = previous month's VALID closing balance, only if that previous month was actually closed.
 * 5. If previous month was NOT officially closed: Opening Balance = ₹0.
 * 6. Closing balance formula: Closing Balance = Opening Balance + Total Income - Total Expense.
 * 7. Total Income means TOTAL BILLED amount (total_amount), including unpaid balance.
 * 8. Total Expense means all expenses whose accounting_month matches this month.
 */
export function calculateAllMonthsSummary(
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = []
): Record<string, MonthBalanceSummary> {
  const sortedMonths = getAllUniqueMonths(incomeRecords, expenseRecords, accountMonths, partnerSettlements);
  const result: Record<string, MonthBalanceSummary> = {};

  for (let i = 0; i < sortedMonths.length; i++) {
    const month = sortedMonths[i];
    const monthStartPrefix = month;
    const dbMonth = accountMonths.find((m) =>
      m.month_start && m.month_start.startsWith(monthStartPrefix)
    );

    const isClosed = dbMonth ? !!dbMonth.is_closed : false;
    const closedAt = dbMonth ? dbMonth.closed_at : null;

    // Filter records for this month: Income uses actual date; Expenses use accounting_month
    const mIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(month));
    const mExpense = expenseRecords.filter((r) => getExpenseAccountingMonth(r) === month);
    const mSettlements = partnerSettlements.filter((s) => s.date && s.date.startsWith(month));

    const totalIncome = mIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const totalPaid = mIncome.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
    const totalBalance = mIncome.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
    const totalExpense = mExpense.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const settlementToHotel = mSettlements.reduce((acc, s) => {
      if (s.type === 'balance_to_hotel') return acc + (Number(s.amount) || 0);
      return acc;
    }, 0);

    const settlementFromHotel = mSettlements.reduce((acc, s) => {
      if (s.type === 'expenses_by_them') return acc + (Number(s.amount) || 0);
      return acc;
    }, 0);

    // Opening balance rule:
    // Normal accounting cash balance starts from Rs. 0 unless explicitly configured in account_months.
    // Previous month's cash closing balance is NOT carried forward into the next month.
    let opening = 0;
    if (dbMonth && dbMonth.opening_balance !== null && dbMonth.opening_balance !== undefined) {
      opening = Number(dbMonth.opening_balance);
    }

    // Closing balance rule:
    // CLOSING BALANCE = OPENING BALANCE + TOTAL INCOME - TOTAL EXPENSE
    // Total Income = full billed amount (total_amount).
    // Total Balance / unpaid receivables is NOT subtracted.
    const closing = opening + totalIncome - totalExpense;

    const [yearStr, monthNumStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthNumStr, 10);
    const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
    const firstDate = `${month}-01`;
    const lastDate = `${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

    result[month] = {
      month,
      monthStart: `${month}-01`,
      openingBalance: opening,
      totalIncome,
      totalPaid,
      totalBalance,
      totalExpense,
      settlementToHotel,
      settlementFromHotel,
      closingBalance: closing,
      isClosed,
      closedAt,
      firstDate,
      lastDate,
    };
  }

  return result;
}

/**
 * Authoritative single calculation function for any accounting month summary.
 * Used identically across Monthly PDF, Closing Balance PDF, Closing Balance page, Analytics, and DB sync.
 *
 * FORMULA:
 * - TOTAL INCOME = SUM(income_entries.total_amount) for this accounting month
 * - TOTAL PAID = SUM(income_entries.amount_received) for this accounting month
 * - TOTAL BALANCE = SUM(income_entries.balance_amount) for this accounting month
 * - TOTAL EXPENSE = SUM(expense_entries.amount) for this accounting month
 * - CLOSING BALANCE = OPENING BALANCE + TOTAL INCOME - TOTAL EXPENSE
 */
export function calculateMonthSummary(
  monthStr: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = []
): MonthBalanceSummary {
  if (!monthStr) {
    return {
      month: '',
      monthStart: '',
      openingBalance: 0,
      totalIncome: 0,
      totalPaid: 0,
      totalBalance: 0,
      totalExpense: 0,
      settlementToHotel: 0,
      settlementFromHotel: 0,
      closingBalance: 0,
      isClosed: false,
      closedAt: null,
      firstDate: '',
      lastDate: '',
    };
  }

  const all = calculateAllMonthsSummary(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );

  if (all[monthStr]) {
    return all[monthStr];
  }

  // Fallback direct calculation if month was not in sorted unique months
  const mIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(monthStr));
  const mExpense = expenseRecords.filter((r) => getExpenseAccountingMonth(r) === monthStr);
  const mSettlements = partnerSettlements.filter((s) => s.date && s.date.startsWith(monthStr));

  const totalIncome = mIncome.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const totalPaid = mIncome.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
  const totalBalance = mIncome.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
  const totalExpense = mExpense.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const settlementToHotel = mSettlements.reduce((acc, s) => {
    if (s.type === 'balance_to_hotel') return acc + (Number(s.amount) || 0);
    return acc;
  }, 0);

  const settlementFromHotel = mSettlements.reduce((acc, s) => {
    if (s.type === 'expenses_by_them') return acc + (Number(s.amount) || 0);
    return acc;
  }, 0);

  const dbMonth = accountMonths.find((m) => m.month_start && m.month_start.startsWith(monthStr));
  const isClosed = dbMonth ? !!dbMonth.is_closed : false;
  const closedAt = dbMonth ? dbMonth.closed_at : null;

  let opening = 0;
  if (dbMonth && dbMonth.opening_balance !== null && dbMonth.opening_balance !== undefined) {
    opening = Number(dbMonth.opening_balance);
  }

  const closing = opening + totalIncome - totalExpense;

  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10) || 2026;
  const monthNum = parseInt(monthNumStr, 10) || 9;
  const lastDayOfMonth = new Date(year, monthNum, 0).getDate();

  return {
    month: monthStr,
    monthStart: `${monthStr}-01`,
    openingBalance: opening,
    totalIncome,
    totalPaid,
    totalBalance,
    totalExpense,
    settlementToHotel,
    settlementFromHotel,
    closingBalance: closing,
    isClosed,
    closedAt,
    firstDate: `${monthStr}-01`,
    lastDate: `${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`,
  };
}

/**
 * Calculate the day-by-day running balance for a specific day.
 * 
 * RULES:
 * 1. For Day 1 of the month: Opening balance = month's opening balance (previous closed month's balance or ₹0).
 * 2. For subsequent days: Opening balance = previous day's VALID closing balance.
 * 3. Daily closing balance = Day Opening Balance + Day Total Income (billed) - Day Total Expense.
 * 4. Current day's income NEVER affects its own opening balance.
 * 5. Calculated strictly from valid active records in memory / database.
 */
export function calculateDayBalanceSummary(
  targetDate: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = []
): DayBalanceSummary {
  const targetMonth = targetDate.substring(0, 7);
  const allMonths = calculateAllMonthsSummary(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );
  const monthSummary = allMonths[targetMonth];
  const monthOpeningBalance = monthSummary ? monthSummary.openingBalance : 0;

  // Find all unique days in this month that have account activity, plus targetDate
  const daysInMonthSet = new Set<string>();
  daysInMonthSet.add(targetDate);

  incomeRecords.forEach((r) => {
    if (r.date && r.date.startsWith(targetMonth)) {
      daysInMonthSet.add(r.date);
    }
  });

  expenseRecords.forEach((r) => {
    if (r.date && r.date.startsWith(targetMonth)) {
      daysInMonthSet.add(r.date);
    }
  });

  partnerSettlements.forEach((s) => {
    if (s.date && s.date.startsWith(targetMonth)) {
      daysInMonthSet.add(s.date);
    }
  });

  const sortedDays = Array.from(daysInMonthSet).sort((a, b) => a.localeCompare(b));

  let currentOpening = monthOpeningBalance;
  let targetDaySummary: DayBalanceSummary = {
    date: targetDate,
    openingBalance: monthOpeningBalance,
    totalIncome: 0,
    totalPaid: 0,
    totalBalance: 0,
    totalExpense: 0,
    settlementToHotel: 0,
    settlementFromHotel: 0,
    closingBalance: monthOpeningBalance,
  };

  for (const day of sortedDays) {
    const dayInc = incomeRecords.filter((r) => r.date === day);
    const dayExp = expenseRecords.filter((r) => r.date === day);
    const daySet = partnerSettlements.filter((s) => s.date === day);

    const totalIncome = dayInc.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const totalPaid = dayInc.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
    const totalBalance = dayInc.reduce((acc, r) => acc + (Number(r.balance) || 0), 0);
    const totalExpense = dayExp.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    const settlementToHotel = daySet.reduce((acc, s) => {
      if (s.type === 'balance_to_hotel') return acc + (Number(s.amount) || 0);
      return acc;
    }, 0);

    const settlementFromHotel = daySet.reduce((acc, s) => {
      if (s.type === 'expenses_by_them') return acc + (Number(s.amount) || 0);
      return acc;
    }, 0);

    // Daily Closing balance rule:
    // CLOSING BALANCE = OPENING BALANCE + TOTAL INCOME - TOTAL EXPENSE
    const closing = currentOpening + totalIncome - totalExpense;

    if (day === targetDate) {
      targetDaySummary = {
        date: targetDate,
        openingBalance: currentOpening,
        totalIncome,
        totalPaid,
        totalBalance,
        totalExpense,
        settlementToHotel,
        settlementFromHotel,
        closingBalance: closing,
      };
      break;
    }

    // Move to next day
    currentOpening = closing;
  }

  return targetDaySummary;
}

