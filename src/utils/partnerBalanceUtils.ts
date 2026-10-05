import {
  IncomeRecord,
  ExpenseRecord,
  Partner,
  PartnerSettlement,
  PartnerSettlementRow,
  PartnerCurrentBalance,
  AccountMonthRow,
} from '../types';
import {
  calculateMonthSummary,
  getExpenseAccountingMonth,
} from './accountBalanceUtils';

export const OFFICIAL_PARTNER_NAMES = [
  'IRSHAD',
  'ANSARI',
  'MUSADDIQ',
  'SATHISH',
  'YOGESH',
] as const;

export interface PartnerNetBalance {
  partnerId: string;
  partnerName: string;
  netBalance: number; // Positive: Partner owes Hotel. Negative: Hotel owes Partner.
  displayLabel: string; // e.g. "IRSHAD TO HOTEL" or "HOTEL TO IRSHAD"
  displayAmount: number; // Absolute value: Math.abs(netBalance)
  isZero: boolean; // netBalance === 0
  direction: 'to_hotel' | 'to_partner' | 'zero';
  // Breakdown
  openingBalance: number; // Carried forward from previous accounting period
  incomeBalanceAdded: number; // New income balance assigned to this partner in this period
  expensesPaid: number; // Expenses paid by this partner in this period
  settlementsToHotel: number; // Partner settlements paid to hotel in this period
  settlementsFromHotel: number; // Settlements paid by hotel to partner in this period
}

/**
 * Normalizes partner name: trims, converts to uppercase, and handles alternate spellings.
 */
export function normalizePartnerName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim().toUpperCase();
  if (trimmed === 'MUSSADDIQ') return 'MUSADDIQ';
  return trimmed;
}

/**
 * Robust matching for partner records across ID and name.
 */
export function matchPartner(
  targetPartnerName: string,
  targetPartnerId: string | undefined,
  candidateName: string | null | undefined,
  candidateId: string | number | null | undefined,
  idToNameMap?: Map<string, string>
): boolean {
  const normTargetName = normalizePartnerName(targetPartnerName);
  if (!normTargetName) return false;

  // 1. Direct ID comparison if both available
  if (targetPartnerId && candidateId) {
    const tId = String(targetPartnerId).trim().toUpperCase();
    const cId = String(candidateId).trim().toUpperCase();
    if (tId && cId && tId === cId) return true;
  }

  // 2. Direct Name comparison
  if (candidateName) {
    const normCandName = normalizePartnerName(candidateName);
    if (normCandName && normCandName === normTargetName) return true;
  }

  // 3. ID to Name lookup via map
  if (candidateId && idToNameMap) {
    const cId = String(candidateId).trim().toUpperCase();
    const mappedName = idToNameMap.get(cId);
    if (mappedName && normalizePartnerName(mappedName) === normTargetName) return true;
  }

  // 4. In some legacy rows, candidateId contains the partner's name string
  if (candidateId) {
    const normCandId = normalizePartnerName(String(candidateId));
    if (normCandId && normCandId === normTargetName) return true;
  }

  return false;
}

/**
 * Checks if an income entry is assigned to the specified partner.
 */
export function isIncomeAssignedToPartner(
  inc: IncomeRecord,
  partnerName: string,
  partnerId?: string,
  idToNameMap?: Map<string, string>
): boolean {
  const normName = normalizePartnerName(partnerName);
  // Check balanceAccountPartnerName and balanceAccountPartnerId first
  if (inc.balanceAccountPartnerName || inc.balanceAccountPartnerId) {
    return matchPartner(
      normName,
      partnerId,
      inc.balanceAccountPartnerName,
      inc.balanceAccountPartnerId,
      idToNameMap
    );
  }
  // Fallback to byWho
  if (inc.byWho) {
    return matchPartner(normName, partnerId, inc.byWho, null, idToNameMap);
  }
  return false;
}

/**
 * Checks if an expense entry was paid by the specified partner.
 */
export function isExpensePaidByPartner(
  exp: ExpenseRecord,
  partnerName: string,
  partnerId?: string,
  idToNameMap?: Map<string, string>
): boolean {
  const normName = normalizePartnerName(partnerName);
  const paidByName =
    exp.paidBy ||
    (exp as any).paid_by ||
    (normName === 'HOTEL' && !exp.paidByPartnerId && !(exp as any).paid_by_partner_id
      ? 'HOTEL'
      : undefined);
  const paidById = exp.paidByPartnerId || (exp as any).paid_by_partner_id;
  return matchPartner(normName, partnerId, paidByName, paidById, idToNameMap);
}

/**
 * Checks if a settlement belongs to the specified partner.
 */
export function isSettlementForPartner(
  s: any,
  partnerName: string,
  partnerId?: string,
  idToNameMap?: Map<string, string>
): boolean {
  const normName = normalizePartnerName(partnerName);
  const sName = s.partnerName || s.partner_name || s.name || s.partner;
  const sId = s.partnerId || s.partner_id;
  return matchPartner(normName, partnerId, sName, sId, idToNameMap);
}

/**
 * Extracts authoritative accounting month (YYYY-MM) from a settlement record.
 * Prioritizes settlement_month over settlement_date / date.
 */
export function getSettlementMonthKey(s: any): string {
  if (!s) return '';
  const m = s.settlementMonth || s.settlement_month;
  if (m && String(m).length >= 7) {
    return String(m).substring(0, 7);
  }
  const d = s.date || s.settlement_date;
  if (d && String(d).length >= 7) {
    return String(d).substring(0, 7);
  }
  return '';
}

/**
 * Helper to determine settlement direction:
 * 'to_hotel' = Partner paid hotel (reduces what partner owes)
 * 'from_hotel' = Hotel paid partner (reduces what hotel owes, increases partner balance)
 */
export function getSettlementDirection(s: any): 'to_hotel' | 'from_hotel' {
  const typeStr = String(s.settlement_type || s.type || '').toLowerCase();
  if (typeStr === 'from_hotel' || typeStr === 'expenses_by_them') {
    return 'from_hotel';
  }
  return 'to_hotel';
}

/**
 * Formats partner display according to the strict accounting rules:
 * - If partner net balance > 0: `[PARTNER] TO HOTEL: ₹X`
 * - If partner net balance < 0: `HOTEL TO [PARTNER]: ₹X`
 * - If partner net balance = 0: isZero is true (do not display that partner's balance block)
 */
export function formatPartnerDisplay(
  partnerName: string,
  netBalance: number
): {
  label: string;
  amount: number;
  direction: 'to_hotel' | 'to_partner' | 'zero';
  isZero: boolean;
} {
  const normName = normalizePartnerName(partnerName);
  const roundedNet = Math.round((netBalance + Number.EPSILON) * 100) / 100;

  if (roundedNet > 0) {
    return {
      label: `${normName} TO HOTEL`,
      amount: roundedNet,
      direction: 'to_hotel',
      isZero: false,
    };
  } else if (roundedNet < 0) {
    return {
      label: `HOTEL TO ${normName}`,
      amount: Math.abs(roundedNet),
      direction: 'to_partner',
      isZero: false,
    };
  } else {
    return {
      label: `${normName} BALANCED`,
      amount: 0,
      direction: 'zero',
      isZero: true,
    };
  }
}

/**
 * Gathers all distinct partners from the database, official list, and transaction entries.
 */
export function getEffectivePartners(
  partners: Partner[] = [],
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  partnerSettlements: any[] = []
): { id?: string; name: string }[] {
  const map = new Map<string, { id?: string; name: string }>();

  // 1. Seed strictly with the 5 official partners
  OFFICIAL_PARTNER_NAMES.forEach((name) => {
    map.set(name, { name });
  });

  // 2. Incorporate existing database partners
  partners.forEach((p) => {
    const norm = normalizePartnerName(p.name);
    if (map.has(norm)) {
      map.set(norm, { id: p.id ? String(p.id) : undefined, name: norm });
    }
  });

  // 3. Scan income entries for extra partners if missing IDs
  incomeRecords.forEach((inc) => {
    const pName = normalizePartnerName(inc.balanceAccountPartnerName);
    if (pName && map.has(pName) && inc.balanceAccountPartnerId) {
      const existing = map.get(pName)!;
      if (!existing.id) {
        existing.id = String(inc.balanceAccountPartnerId);
      }
    }
  });

  // 4. Scan expense entries for extra partners if missing IDs
  expenseRecords.forEach((exp) => {
    const pName = normalizePartnerName(exp.paidBy);
    if (pName && map.has(pName) && exp.paidByPartnerId) {
      const existing = map.get(pName)!;
      if (!existing.id) {
        existing.id = String(exp.paidByPartnerId);
      }
    }
  });

  // 5. Scan settlements for extra partners if missing IDs
  partnerSettlements.forEach((s) => {
    const sName = normalizePartnerName(s.partnerName || s.partner_name || s.partner);
    const sId = s.partnerId || s.partner_id;
    if (sName && map.has(sName) && sId) {
      const existing = map.get(sName)!;
      if (!existing.id) {
        existing.id = String(sId);
      }
    }
  });

  return OFFICIAL_PARTNER_NAMES.map((name) => map.get(name)!);
}

/**
 * SINGLE UNIFIED SOURCE OF TRUTH for partner balances throughout the entire application.
 *
 * For every partner independently, calculates:
 *   current partner net balance =
 *     previous day's partner net balance
 *     + new income balance assigned to that partner
 *     - expenses paid by that partner
 *     - partner settlements paid to the hotel
 *     + settlements paid by hotel to that partner
 *
 * Carries forward across all accounting dates and across months.
 *
 * @param incomeRecords All income entries
 * @param expenseRecords All expense entries
 * @param partnerSettlements All partner settlements
 * @param partners List of partner objects (from DB)
 * @param options Optional configuration:
 *   - cutoffDate: Calculate balances up to this date inclusive (YYYY-MM-DD). If omitted, calculates up to the latest date.
 *   - startDate: When calculating for a specific period/month, specify start date to separate opening balance from period activity.
 */
/**
 * SINGLE UNIFIED SOURCE OF TRUTH for partner balances throughout the entire application.
 * 
 * STRICT ACCOUNTING MONTH ISOLATION:
 * For every partner independently within a specific accounting month, calculates:
 *   month partner net balance =
 *     income balance assigned to that partner in this month
 *     - expenses paid by that partner in this month
 *     - partner settlements paid to hotel for this month
 *     + settlements paid by hotel to partner for this month
 * 
 * Closed months are archived (with IRSHAD closed net stored in irshad_wallet_entries).
 * No previous-month partner balance leaks into a new accounting month.
 */
export function calculatePartnerNetBalances(
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = [],
  options?: {
    cutoffDate?: string;
    startDate?: string;
    monthStr?: string;
    accountMonths?: AccountMonthRow[];
  }
): PartnerNetBalance[] {
  const targetMonth =
    options?.monthStr ||
    (options?.startDate ? options.startDate.substring(0, 7) : '') ||
    (options?.cutoffDate ? options.cutoffDate.substring(0, 7) : '') ||
    new Date().toISOString().substring(0, 7);

  const effectivePartners = getEffectivePartners(
    partners,
    incomeRecords,
    expenseRecords,
    partnerSettlements
  );

  // Build ID to Name map for fast, reliable matching
  const idToNameMap = new Map<string, string>();
  effectivePartners.forEach((p) => {
    if (p.id) {
      idToNameMap.set(String(p.id).trim().toUpperCase(), p.name);
    }
  });

  const cutoff = options?.cutoffDate || null;

  // Strict month-isolated filtering
  const monthIncome = incomeRecords.filter((r) => {
    if (!r.date || !r.date.startsWith(targetMonth)) return false;
    if (cutoff && r.date > cutoff) return false;
    return true;
  });

  const monthExpenses = expenseRecords.filter((r) => {
    const accM = getExpenseAccountingMonth(r);
    if (accM !== targetMonth) return false;
    if (cutoff && r.date && r.date > cutoff) return false;
    return true;
  });

  const monthSettlements = partnerSettlements.filter((s: any) => {
    const sMonth = getSettlementMonthKey(s);
    if (sMonth !== targetMonth) return false;
    const rawMonth = s.settlementMonth || s.settlement_month;
    if (cutoff && !rawMonth) {
      const sDate = s.date || s.settlement_date;
      if (sDate && sDate > cutoff) return false;
    }
    return true;
  });

  return effectivePartners.map((partner) => {
    // 1. Income Balance assigned to this partner in this month
    const incomeBalance = monthIncome
      .filter((inc) => isIncomeAssignedToPartner(inc, partner.name, partner.id, idToNameMap))
      .reduce((sum, inc) => {
        const bal = Number(inc.balance) || 0;
        return sum + (bal > 0 ? bal : 0);
      }, 0);

    // 2. Expenses paid by this partner in this month
    const expensesPaid = monthExpenses
      .filter((exp) => isExpensePaidByPartner(exp, partner.name, partner.id, idToNameMap))
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    // 3. Partner settlements for this month
    let settlementsToHotel = 0;
    let settlementsFromHotel = 0;

    monthSettlements
      .filter((s) => isSettlementForPartner(s, partner.name, partner.id, idToNameMap))
      .forEach((s) => {
        const amt = Number(s.amount) || 0;
        if (getSettlementDirection(s) === 'from_hotel') {
          settlementsFromHotel += amt;
        } else {
          settlementsToHotel += amt;
        }
      });

    const netBalance = incomeBalance - expensesPaid - settlementsToHotel + settlementsFromHotel;
    const displayInfo = formatPartnerDisplay(partner.name, netBalance);

    return {
      partnerId: partner.id || partner.name,
      partnerName: partner.name,
      netBalance,
      displayLabel: displayInfo.label,
      displayAmount: displayInfo.amount,
      isZero: displayInfo.isZero,
      direction: displayInfo.direction,
      openingBalance: 0,
      incomeBalanceAdded: incomeBalance,
      expensesPaid,
      settlementsToHotel,
      settlementsFromHotel,
    };
  });
}

/**
 * Calculates running partner net balances as of a specific calendar date (strictly within dateStr's accounting month).
 */
export function calculatePartnerBalancesForDate(
  dateStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = [],
  accountMonths: AccountMonthRow[] = []
): PartnerNetBalance[] {
  const monthStr = dateStr.substring(0, 7);
  return calculatePartnerNetBalances(
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    partners,
    {
      cutoffDate: dateStr,
      startDate: `${monthStr}-01`,
      monthStr,
      accountMonths,
    }
  );
}

/**
 * Calculates running partner net balances for a specific calendar month (YYYY-MM),
 * strictly isolated to that accounting month.
 */
export function calculatePartnerBalancesForMonth(
  monthStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = [],
  accountMonths: AccountMonthRow[] = []
): PartnerNetBalance[] {
  return calculatePartnerNetBalances(
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    partners,
    {
      cutoffDate: `${monthStr}-31`,
      startDate: `${monthStr}-01`,
      monthStr,
      accountMonths,
    }
  );
}

/**
 * Converts PartnerNetBalance array to PartnerCurrentBalance interface format for components.
 */
export function toPartnerCurrentBalances(
  netBalances: PartnerNetBalance[]
): PartnerCurrentBalance[] {
  return netBalances.map((b) => ({
    partner_id: b.partnerId,
    name: b.partnerName,
    net_balance: b.netBalance,
    // Provide backwards-compatible separated fields for legacy callers
    balance_to_hotel: b.netBalance > 0 ? b.netBalance : 0,
    expenses_by_them: b.netBalance < 0 ? Math.abs(b.netBalance) : 0,
  }));
}

export interface ClosingPartnerProfitItem {
  partnerName: string;
  sharePercent: number;
  percentageStr: string;
  baseProfit: number;
  incomeBalance: number;
  balanceToHotel: number;
  expensesByThem: number;
  settledToHotel: number;
  settledFromHotel: number;
  settledNet: number;
  netType: 'EXPENSE' | 'BALANCE' | 'NONE';
  netAdjustment: number;
  partnerProfit: number;
  isIrshad: boolean;
  irshadTotalOutstanding?: number;
}

export interface ClosingProfitDistributionResult {
  monthStr: string;
  totalIncome: number;
  totalExpense: number;
  openingBalance: number;
  closingBalance: number;
  isClosed: boolean;
  closedAt: string | null;
  partners: ClosingPartnerProfitItem[];
}

/**
 * AUTHORITATIVE CALCULATION FOR CLOSING BALANCE & PROFIT DISTRIBUTION
 * 
 * Used identically across:
 * - Closing Balance Screen
 * - Closing Balance PDF
 * - Month Closing confirmation & settlement
 * 
 * Rules:
 * 1. 5 Official Partners:
 *    - MUSADDIQ (25%)
 *    - SATHISH (25%)
 *    - YOGESH (25%)
 *    - ANSARI (12.5%)
 *    - IRSHAD (12.5%)
 * 2. Net Partner Adjustment for MUSADDIQ, SATHISH, YOGESH, ANSARI:
 *    - Compare balance_to_hotel vs expenses_by_them
 *    - If EXPENSE > BALANCE: netDifference = expense - balance, netType = 'EXPENSE', profit = baseProfit + netDifference
 *    - If BALANCE > EXPENSE: netDifference = balance - expense, netType = 'BALANCE', profit = baseProfit - netDifference
 *    - If equal: netDifference = 0, netType = 'NONE', profit = baseProfit
 * 3. IRSHAD Exception:
 *    - Profit = baseProfit (12.5% allocation)
 *    - Total Outstanding = balance_to_hotel (incomeBalance) - expenses_by_them - settled amount
 */
export function calculateClosingProfitDistribution(
  monthStr: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = [],
  partners: Partner[] = []
): ClosingProfitDistributionResult {
  const monthSummary = calculateMonthSummary(
    monthStr,
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );

  const monthIncome = incomeRecords.filter((r) => r.date && r.date.startsWith(monthStr));
  const monthExpenses = expenseRecords.filter((r) => getExpenseAccountingMonth(r) === monthStr);

  const totalIncome = monthSummary.totalIncome;
  const totalExpense = monthSummary.totalExpense;
  const openingBalance = monthSummary.openingBalance;
  const closingBalance = monthSummary.closingBalance;
  const isClosed = monthSummary.isClosed;
  const closedAt = monthSummary.closedAt || null;

  const partnerConfigs: { name: string; sharePercent: number; percentageStr: string; isIrshad: boolean }[] = [
    { name: 'MUSADDIQ', sharePercent: 0.25, percentageStr: '25%', isIrshad: false },
    { name: 'SATHISH', sharePercent: 0.25, percentageStr: '25%', isIrshad: false },
    { name: 'YOGESH', sharePercent: 0.25, percentageStr: '25%', isIrshad: false },
    { name: 'ANSARI', sharePercent: 0.125, percentageStr: '12.5%', isIrshad: false },
    { name: 'IRSHAD', sharePercent: 0.125, percentageStr: '12.5%', isIrshad: true },
  ];

  const calculatedPartners: ClosingPartnerProfitItem[] = partnerConfigs.map((cfg) => {
    const normName = normalizePartnerName(cfg.name);
    const pObj = (partners || []).find((p) => normalizePartnerName(p.name) === normName);
    const pId = pObj?.id ? String(pObj.id) : '';

    // 1. Income Balance assigned to this partner in this month
    const incomeBalance = monthIncome
      .filter((inc) => isIncomeAssignedToPartner(inc, normName, pId))
      .reduce((sum, inc) => sum + (Number(inc.balance) > 0 ? Number(inc.balance) : 0), 0);

    // 2. Expenses paid by this partner in this month
    const expensesByThem = monthExpenses
      .filter((exp) => isExpensePaidByPartner(exp, normName, pId))
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    // 3. Partner settlements for this month
    const settlements = (partnerSettlements || []).filter((s) => {
      if (!isSettlementForPartner(s, normName, pId)) return false;
      return getSettlementMonthKey(s) === monthStr;
    });

    const settledToHotel = settlements
      .filter((s) => getSettlementDirection(s) === 'to_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const settledFromHotel = settlements
      .filter((s) => getSettlementDirection(s) === 'from_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const netBalOwed = incomeBalance - settledToHotel + settledFromHotel;
    const balanceToHotel = netBalOwed > 0 ? netBalOwed : 0;
    const settledNet = settledToHotel - settledFromHotel;

    const baseProfit = closingBalance * cfg.sharePercent;

    if (cfg.isIrshad) {
      const irshadTotalOutstanding = incomeBalance - expensesByThem - settledNet;
      return {
        partnerName: cfg.name,
        sharePercent: cfg.sharePercent,
        percentageStr: cfg.percentageStr,
        baseProfit,
        incomeBalance,
        balanceToHotel,
        expensesByThem,
        settledToHotel,
        settledFromHotel,
        settledNet,
        netType: 'NONE',
        netAdjustment: 0,
        partnerProfit: baseProfit,
        isIrshad: true,
        irshadTotalOutstanding,
      };
    }

    let netType: 'EXPENSE' | 'BALANCE' | 'NONE' = 'NONE';
    let netAdjustment = 0;
    let partnerProfit = baseProfit;

    if (expensesByThem > balanceToHotel) {
      netType = 'EXPENSE';
      netAdjustment = expensesByThem - balanceToHotel;
      partnerProfit = baseProfit + netAdjustment;
    } else if (balanceToHotel > expensesByThem) {
      netType = 'BALANCE';
      netAdjustment = balanceToHotel - expensesByThem;
      partnerProfit = baseProfit - netAdjustment;
    } else {
      netType = 'NONE';
      netAdjustment = 0;
      partnerProfit = baseProfit;
    }

    return {
      partnerName: cfg.name,
      sharePercent: cfg.sharePercent,
      percentageStr: cfg.percentageStr,
      baseProfit,
      incomeBalance,
      balanceToHotel,
      expensesByThem,
      settledToHotel,
      settledFromHotel,
      settledNet,
      netType,
      netAdjustment,
      partnerProfit,
      isIrshad: false,
    };
  });

  return {
    monthStr,
    totalIncome,
    totalExpense,
    openingBalance,
    closingBalance,
    isClosed,
    closedAt,
    partners: calculatedPartners,
  };
}
