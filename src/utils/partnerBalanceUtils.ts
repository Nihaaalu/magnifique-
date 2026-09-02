import {
  IncomeRecord,
  ExpenseRecord,
  Partner,
  PartnerSettlement,
  PartnerSettlementRow,
  PartnerCurrentBalance,
} from '../types';

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
  return matchPartner(normName, partnerId, exp.paidBy, exp.paidByPartnerId, idToNameMap);
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
export function calculatePartnerNetBalances(
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = [],
  options?: {
    cutoffDate?: string;
    startDate?: string;
  }
): PartnerNetBalance[] {
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

  // Collect all dates present in the system
  const dateSet = new Set<string>();
  incomeRecords.forEach((r) => {
    if (r.date) dateSet.add(r.date);
  });
  expenseRecords.forEach((r) => {
    if (r.date) dateSet.add(r.date);
  });
  partnerSettlements.forEach((s) => {
    const d = s.date || s.settlement_date;
    if (d) dateSet.add(d);
  });

  if (options?.cutoffDate) {
    dateSet.add(options.cutoffDate);
  }
  if (options?.startDate) {
    dateSet.add(options.startDate);
  }

  const allDates = Array.from(dateSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const cutoff = options?.cutoffDate || null;
  const start = options?.startDate || null;

  // Filter dates up to cutoffDate
  const relevantDates = cutoff ? allDates.filter((d) => d <= cutoff) : allDates;

  return effectivePartners.map((partner) => {
    let runningBalance = 0;
    let openingBalance = 0;
    let periodIncomeBalance = 0;
    let periodExpenses = 0;
    let periodSettlementsToHotel = 0;
    let periodSettlementsFromHotel = 0;

    for (const d of relevantDates) {
      const isBeforeStart = start ? d < start : false;

      // 1. New income balance assigned to that partner on date d
      const dayIncomeBalance = incomeRecords
        .filter((inc) => inc.date === d && isIncomeAssignedToPartner(inc, partner.name, partner.id, idToNameMap))
        .reduce((sum, inc) => {
          const bal = Number(inc.balance) || 0;
          return sum + (bal > 0 ? bal : 0);
        }, 0);

      // 2. Expenses paid by that partner on date d
      const dayExpenses = expenseRecords
        .filter((exp) => exp.date === d && isExpensePaidByPartner(exp, partner.name, partner.id, idToNameMap))
        .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

      // 3. Partner settlements on date d
      let daySettlementsToHotel = 0;
      let daySettlementsFromHotel = 0;

      partnerSettlements
        .filter((s) => {
          const sDate = s.date || s.settlement_date;
          return sDate === d && isSettlementForPartner(s, partner.name, partner.id, idToNameMap);
        })
        .forEach((s) => {
          const amt = Number(s.amount) || 0;
          if (getSettlementDirection(s) === 'from_hotel') {
            daySettlementsFromHotel += amt;
          } else {
            daySettlementsToHotel += amt;
          }
        });

      // Daily Net update:
      // + new income balance assigned to partner
      // - expenses paid by partner
      // - settlements paid to hotel
      // + settlements paid by hotel to partner
      runningBalance =
        runningBalance +
        dayIncomeBalance -
        dayExpenses -
        daySettlementsToHotel +
        daySettlementsFromHotel;

      // Track opening balance and period deltas
      if (isBeforeStart) {
        openingBalance = runningBalance;
      } else {
        periodIncomeBalance += dayIncomeBalance;
        periodExpenses += dayExpenses;
        periodSettlementsToHotel += daySettlementsToHotel;
        periodSettlementsFromHotel += daySettlementsFromHotel;
      }
    }

    const displayInfo = formatPartnerDisplay(partner.name, runningBalance);

    return {
      partnerId: partner.id || partner.name,
      partnerName: partner.name,
      netBalance: runningBalance,
      displayLabel: displayInfo.label,
      displayAmount: displayInfo.amount,
      isZero: displayInfo.isZero,
      direction: displayInfo.direction,
      openingBalance,
      incomeBalanceAdded: periodIncomeBalance,
      expensesPaid: periodExpenses,
      settlementsToHotel: periodSettlementsToHotel,
      settlementsFromHotel: periodSettlementsFromHotel,
    };
  });
}

/**
 * Calculates running partner net balances as of a specific calendar date (carrying forward from all history).
 */
export function calculatePartnerBalancesForDate(
  dateStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = []
): PartnerNetBalance[] {
  return calculatePartnerNetBalances(
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    partners,
    {
      cutoffDate: dateStr,
      startDate: dateStr,
    }
  );
}

/**
 * Calculates running partner net balances for a specific calendar month (YYYY-MM),
 * carrying forward continuously from previous months.
 */
export function calculatePartnerBalancesForMonth(
  monthStr: string,
  incomeRecords: IncomeRecord[],
  expenseRecords: ExpenseRecord[],
  partnerSettlements: any[] = [],
  partners: Partner[] = []
): PartnerNetBalance[] {
  return calculatePartnerNetBalances(
    incomeRecords,
    expenseRecords,
    partnerSettlements,
    partners,
    {
      cutoffDate: `${monthStr}-31`,
      startDate: `${monthStr}-01`,
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
