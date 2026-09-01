import { IncomeRecord, ExpenseRecord, PartnerSettlement, AccountMonthRow } from '../types';

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
  accountMonths: AccountMonthRow[] = []
): string[] {
  const monthSet = new Set<string>();

  incomeRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      monthSet.add(r.date.substring(0, 7));
    }
  });

  expenseRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      monthSet.add(r.date.substring(0, 7));
    }
  });

  accountMonths.forEach((m) => {
    if (m.month_start && m.month_start.length >= 7 && (m.is_closed || (m.total_income && m.total_income > 0) || (m.total_expense && m.total_expense > 0))) {
      monthSet.add(m.month_start.substring(0, 7));
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
  monthSet.add(currentMonth);

  incomeRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      monthSet.add(r.date.substring(0, 7));
    }
  });

  expenseRecords.forEach((r) => {
    if (r.date && r.date.length >= 7) {
      monthSet.add(r.date.substring(0, 7));
    }
  });

  accountMonths.forEach((m) => {
    if (m.month_start && m.month_start.length >= 7) {
      monthSet.add(m.month_start.substring(0, 7));
    }
  });

  partnerSettlements.forEach((s) => {
    if (s.date && s.date.length >= 7) {
      monthSet.add(s.date.substring(0, 7));
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

    // Filter records for this month
    const mIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(month));
    const mExpense = expenseRecords.filter((r) => r.date && r.date.startsWith(month));
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
    // - For the first month (i === 0): Opening Balance = 0.
    // - For subsequent months: Opening Balance = previous month's closing balance ONLY IF previous month was officially closed.
    // - If previous month was NOT closed: Opening Balance = 0 (do not carry forward unclosed temporary/test balances).
    let opening = 0;
    if (i > 0) {
      const prevMonthKey = sortedMonths[i - 1];
      const prevSummary = result[prevMonthKey];
      if (prevSummary && prevSummary.isClosed) {
        opening = prevSummary.closingBalance;
      } else {
        opening = 0;
      }
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

