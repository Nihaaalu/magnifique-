import { supabase } from '../lib/supabase';
import {
  Partner,
  PartnerCurrentBalance,
  IncomeEntryRow,
  IncomeRecord,
  ExpenseEntryRow,
  ExpenseRecord,
  PartnerSettlementRow,
  PartnerSettlement,
  AccountMonthRow,
  MealType,
  MealPlan,
  MealCombination,
  PaymentStatus,
  ExpenseCategory,
  SettlementType,
} from '../types';

/**
 * Supabase Data Access Layer
 * Provides clean typed operations matching the Supabase PostgreSQL database schema.
 */

// EXACT 5 Official Partners (Never use LOKESH)
export const OFFICIAL_PARTNER_NAMES = ['ANSARI', 'IRSHAD', 'MUSADDIQ', 'SATHISH', 'YOGESH'] as const;

export function normalizePartnerName(name: string): string {
  const upper = (name || '').trim().toUpperCase();
  if (upper === 'MUSSADDIQ' || upper === 'MUSADDIQ') return 'MUSADDIQ';
  return upper;
}


// ==========================================
// 1. PARTNERS
// ==========================================
export async function fetchPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('id, name, active, display_order, created_at')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching partners from Supabase:', error);
    throw new Error(`Failed to load partners: ${error.message}`);
  }

  return (data || []).map((p) => ({
    id: String(p.id),
    name: p.name,
    active: p.active ?? true,
    display_order: p.display_order ?? 0,
    created_at: p.created_at,
  }));
}

// ==========================================
// 2. INCOME ENTRIES
// ==========================================
export async function fetchIncomeEntries(): Promise<IncomeRecord[]> {
  const { data, error } = await supabase
    .from('income_entries')
    .select(
      `
      id,
      entry_date,
      income_type,
      meal_plan,
      meal_combination,
      breakfast_price,
      lunch_price,
      dinner_price,
      meal_type,
      travel_name,
      member_count,
      price_per_member,
      total_amount,
      amount_received,
      balance_amount,
      payment_status,
      by_who,
      balance_account_partner_id,
      created_at,
      updated_at,
      partners:balance_account_partner_id ( id, name )
    `
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching income entries from Supabase:', error);
    throw new Error(`Failed to load income entries: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    let paymentStatus: PaymentStatus = 'Paid Full';
    const amountReceived = Number(row.amount_received) || 0;
    const totalAmount = Number(row.total_amount) || 0;
    const balanceAmount = Number(row.balance_amount ?? (totalAmount - amountReceived)) || 0;

    if (row.payment_status === 'paid_full' || balanceAmount <= 0) {
      paymentStatus = 'Paid Full';
    } else if (row.payment_status === 'paid_partial' || (amountReceived > 0 && balanceAmount > 0)) {
      paymentStatus = 'Paid Partially';
    } else {
      paymentStatus = 'Balance';
    }

    const partnerRelation = row.partners;
    const partnerName = Array.isArray(partnerRelation)
      ? partnerRelation[0]?.name
      : partnerRelation?.name;

    // Extract time from created_at
    let timeStr = '';
    if (row.created_at) {
      try {
        const d = new Date(row.created_at);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        timeStr = '';
      }
    }

    const isAlaCarte =
      row.meal_plan === 'alacarte' ||
      row.income_type === 'alacarte' ||
      row.by_who === 'À LA CARTE';

    let mealPlan: MealPlan = '1_time';
    let mealCombination: MealCombination = 'breakfast';
    let bPrice = row.breakfast_price != null ? Number(row.breakfast_price) : null;
    let lPrice = row.lunch_price != null ? Number(row.lunch_price) : null;
    let dPrice = row.dinner_price != null ? Number(row.dinner_price) : null;

    if (row.meal_plan) {
      mealPlan = row.meal_plan as MealPlan;
      mealCombination = (row.meal_combination as MealCombination) ?? null;
    } else if (isAlaCarte) {
      mealPlan = 'alacarte';
      mealCombination = null;
    } else {
      // Legacy records mapping
      mealPlan = '1_time';
      const mt = String(row.meal_type || 'breakfast').toLowerCase();
      if (mt === 'lunch') {
        mealCombination = 'lunch';
        lPrice = Number(row.price_per_member) || 0;
      } else if (mt === 'dinner') {
        mealCombination = 'dinner';
        dPrice = Number(row.price_per_member) || 0;
      } else {
        mealCombination = 'breakfast';
        bPrice = Number(row.price_per_member) || 0;
      }
    }

    // Calculated total price per member
    let pricePerMember = 0;
    if (!isAlaCarte) {
      if (mealPlan === '1_time') {
        pricePerMember = bPrice || lPrice || dPrice || Number(row.price_per_member) || 0;
      } else {
        pricePerMember = (bPrice || 0) + (lPrice || 0) + (dPrice || 0);
        if (pricePerMember === 0 && row.price_per_member) {
          pricePerMember = Number(row.price_per_member);
        }
      }
    }

    // Legacy meal_type for backward compatibility
    let mappedMealType: MealType | null = null;
    if (row.meal_type) {
      const mt = String(row.meal_type).toLowerCase();
      if (mt === 'breakfast') mappedMealType = 'Breakfast';
      else if (mt === 'lunch') mappedMealType = 'Lunch';
      else if (mt === 'dinner') mappedMealType = 'Dinner';
    }

    return {
      id: String(row.id),
      date: row.entry_date,
      time: timeStr,
      incomeType: isAlaCarte ? 'À La Carte' : 'Meal',
      mealPlan,
      mealCombination,
      breakfastPrice: bPrice,
      lunchPrice: lPrice,
      dinnerPrice: dPrice,
      mealType: mappedMealType,
      byWho: isAlaCarte ? 'À LA CARTE' : (row.by_who || 'IRSHAD'),
      travels: row.travel_name || undefined,
      membersCount: isAlaCarte ? 0 : (Number(row.member_count) || 0),
      pricePerMember,
      total: totalAmount,
      paymentStatus,
      amountPaid: amountReceived,
      balance: balanceAmount,
      balanceAccountPartnerId: row.balance_account_partner_id ? String(row.balance_account_partner_id) : null,
      balanceAccountPartnerName: partnerName || undefined,
      created_at: row.created_at,
    };
  });
}

export async function createIncomeEntry(
  entry: Omit<IncomeEntryRow, 'id' | 'created_at' | 'updated_at'>
): Promise<any> {
  const isAlaCarte = entry.meal_plan === 'alacarte' || entry.income_type === 'À La Carte' || String(entry.income_type).toLowerCase() === 'alacarte';
  const totalAmount = Number(entry.total_amount) || 0;
  const amountReceived = Number(entry.amount_received) || 0;

  // DB payment_status check constraint: 'paid_full' | 'paid_partial' | 'balance'
  let dbPaymentStatus: 'paid_full' | 'paid_partial' | 'balance' = 'paid_full';
  if (amountReceived >= totalAmount) {
    dbPaymentStatus = 'paid_full';
  } else if (amountReceived > 0) {
    dbPaymentStatus = 'paid_partial';
  } else {
    dbPaymentStatus = 'balance';
  }

  // Calculate sum of meal prices
  const bPrice = entry.breakfast_price != null ? Number(entry.breakfast_price) : null;
  const lPrice = entry.lunch_price != null ? Number(entry.lunch_price) : null;
  const dPrice = entry.dinner_price != null ? Number(entry.dinner_price) : null;
  const sumPrices = (bPrice || 0) + (lPrice || 0) + (dPrice || 0);

  // DB meal_type check constraint: 'breakfast' | 'lunch' | 'dinner' (or null for alacarte)
  let dbMealType: 'breakfast' | 'lunch' | 'dinner' | null = null;
  if (!isAlaCarte) {
    if (entry.meal_combination === 'lunch') dbMealType = 'lunch';
    else if (entry.meal_combination === 'dinner') dbMealType = 'dinner';
    else if (entry.meal_combination === 'lunch_dinner') dbMealType = 'lunch';
    else dbMealType = 'breakfast';
  }

  const insertPayload: Record<string, any> = {
    entry_date: entry.entry_date,
    income_type: isAlaCarte ? 'alacarte' : 'meal',
    meal_plan: entry.meal_plan,
    meal_combination: isAlaCarte ? null : entry.meal_combination,
    breakfast_price: isAlaCarte ? null : bPrice,
    lunch_price: isAlaCarte ? null : lPrice,
    dinner_price: isAlaCarte ? null : dPrice,
    meal_type: dbMealType,
    total_amount: totalAmount,
    amount_received: amountReceived,
    payment_status: dbPaymentStatus,
    by_who: isAlaCarte ? null : (entry.by_who || 'IRSHAD'),
    travel_name: entry.travel_name || null,
    member_count: isAlaCarte ? null : (Number(entry.member_count) || null),
    price_per_member: isAlaCarte ? null : (sumPrices || null),
    balance_account_partner_id:
      dbPaymentStatus !== 'paid_full' && entry.balance_account_partner_id
        ? Number(entry.balance_account_partner_id) || entry.balance_account_partner_id
        : null,
  };

  const { data, error } = await supabase
    .from('income_entries')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Error inserting income entry to Supabase:', error);
    throw new Error(`Failed to create income entry: ${error.message}`);
  }

  return data;
}

export async function updateIncomeEntry(
  id: string,
  entry: Partial<IncomeEntryRow>
): Promise<any> {
  // If amounts are partially updated, fetch current row to maintain database check constraint integrity
  let currentRecord: any = null;
  if (
    (entry.total_amount !== undefined && entry.amount_received === undefined) ||
    (entry.amount_received !== undefined && entry.total_amount === undefined)
  ) {
    const { data } = await supabase.from('income_entries').select('*').eq('id', id).single();
    currentRecord = data;
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (entry.entry_date !== undefined) updatePayload.entry_date = entry.entry_date;
  if (entry.travel_name !== undefined) updatePayload.travel_name = entry.travel_name;

  if (entry.meal_plan !== undefined) {
    updatePayload.meal_plan = entry.meal_plan;
  }
  if (entry.meal_combination !== undefined) {
    updatePayload.meal_combination = entry.meal_combination;
  }
  if (entry.breakfast_price !== undefined) {
    updatePayload.breakfast_price = entry.breakfast_price != null ? Number(entry.breakfast_price) : null;
  }
  if (entry.lunch_price !== undefined) {
    updatePayload.lunch_price = entry.lunch_price != null ? Number(entry.lunch_price) : null;
  }
  if (entry.dinner_price !== undefined) {
    updatePayload.dinner_price = entry.dinner_price != null ? Number(entry.dinner_price) : null;
  }

  const isAlaCarte =
    entry.meal_plan === 'alacarte' ||
    entry.income_type === 'À La Carte' ||
    String(entry.income_type).toLowerCase() === 'alacarte';

  if (entry.income_type !== undefined || entry.meal_plan !== undefined) {
    updatePayload.income_type = isAlaCarte ? 'alacarte' : 'meal';
  }

  if (entry.by_who !== undefined) {
    updatePayload.by_who = isAlaCarte ? null : entry.by_who;
  }

  if (entry.meal_type !== undefined || entry.meal_combination !== undefined) {
    if (isAlaCarte) {
      updatePayload.meal_type = null;
    } else if (entry.meal_combination === 'lunch') {
      updatePayload.meal_type = 'lunch';
    } else if (entry.meal_combination === 'dinner') {
      updatePayload.meal_type = 'dinner';
    } else if (entry.meal_combination === 'lunch_dinner') {
      updatePayload.meal_type = 'lunch';
    } else {
      updatePayload.meal_type = 'breakfast';
    }
  }

  if (entry.member_count !== undefined) {
    updatePayload.member_count = isAlaCarte ? null : (entry.member_count ? Number(entry.member_count) : null);
  }
  if (entry.price_per_member !== undefined) {
    updatePayload.price_per_member = isAlaCarte ? null : (entry.price_per_member ? Number(entry.price_per_member) : null);
  }

  const newTotal =
    entry.total_amount !== undefined
      ? Number(entry.total_amount)
      : currentRecord
      ? Number(currentRecord.total_amount)
      : undefined;

  const newReceived =
    entry.amount_received !== undefined
      ? Number(entry.amount_received)
      : currentRecord
      ? Number(currentRecord.amount_received)
      : undefined;

  if (newTotal !== undefined) updatePayload.total_amount = newTotal;
  if (newReceived !== undefined) updatePayload.amount_received = newReceived;

  if (newTotal !== undefined && newReceived !== undefined) {
    if (newReceived >= newTotal) {
      updatePayload.payment_status = 'paid_full';
      updatePayload.balance_account_partner_id = null;
    } else if (newReceived > 0) {
      updatePayload.payment_status = 'paid_partial';
    } else {
      updatePayload.payment_status = 'balance';
    }
  }

  if (entry.balance_account_partner_id !== undefined) {
    updatePayload.balance_account_partner_id = entry.balance_account_partner_id
      ? Number(entry.balance_account_partner_id) || entry.balance_account_partner_id
      : null;
  }

  const { data, error } = await supabase
    .from('income_entries')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating income entry in Supabase:', error);
    throw new Error(`Failed to update income entry: ${error.message}`);
  }

  return data;
}

export async function deleteIncomeEntry(id: string): Promise<void> {
  const { error } = await supabase.from('income_entries').delete().eq('id', id);

  if (error) {
    console.error('Error deleting income entry from Supabase:', error);
    throw new Error(`Failed to delete income entry: ${error.message}`);
  }
}

// ==========================================
// 3. EXPENSE ENTRIES
// ==========================================
export async function fetchExpenseEntries(): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from('expense_entries')
    .select(
      `
      id,
      expense_date,
      category,
      description,
      amount,
      paid_by,
      paid_by_partner_id,
      created_at,
      updated_at
    `
    )
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expense entries from Supabase:', error);
    throw new Error(`Failed to load expense entries: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    let timeStr = '';
    if (row.created_at) {
      try {
        const d = new Date(row.created_at);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        timeStr = '';
      }
    }

    // Map category
    let mappedCategory: ExpenseCategory = 'Other';
    const cat = String(row.category).toLowerCase();
    if (cat === 'staff') mappedCategory = 'Staff';
    else if (cat === 'groceries') mappedCategory = 'Groceries';
    else mappedCategory = 'Other';

    // Map paid_by
    const rawPaidBy = String(row.paid_by || '').toUpperCase();
    const isHotel = rawPaidBy === 'HOTEL' || !row.paid_by_partner_id;

    return {
      id: String(row.id),
      date: row.expense_date,
      time: timeStr,
      category: mappedCategory,
      name: row.description || undefined,
      amount: Number(row.amount) || 0,
      paidBy: isHotel ? 'Hotel' : (row.paid_by || 'Hotel'),
      paidByPartnerId: row.paid_by_partner_id ? String(row.paid_by_partner_id) : null,
      created_at: row.created_at,
    };
  });
}

export async function createExpenseEntry(
  expense: Omit<ExpenseEntryRow, 'id' | 'created_at' | 'updated_at'>
): Promise<any> {
  const cat = String(expense.category).toLowerCase();
  let dbCategory: 'staff' | 'groceries' | 'other' = 'other';
  if (cat === 'staff') dbCategory = 'staff';
  else if (cat === 'groceries') dbCategory = 'groceries';
  else dbCategory = 'other';

  const isHotel = !expense.paid_by || expense.paid_by.toUpperCase() === 'HOTEL' || !expense.paid_by_partner_id;

  const insertPayload = {
    expense_date: expense.expense_date,
    category: dbCategory,
    description: expense.description || null,
    amount: Number(expense.amount) || 0,
    paid_by: isHotel ? 'HOTEL' : expense.paid_by.toUpperCase(),
    paid_by_partner_id: isHotel ? null : (Number(expense.paid_by_partner_id) || expense.paid_by_partner_id),
  };

  const { data, error } = await supabase
    .from('expense_entries')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Error creating expense entry in Supabase:', error);
    throw new Error(`Failed to create expense entry: ${error.message}`);
  }

  return data;
}

export async function updateExpenseEntry(
  id: string,
  expense: Partial<ExpenseEntryRow>
): Promise<any> {
  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (expense.expense_date !== undefined) updatePayload.expense_date = expense.expense_date;
  if (expense.description !== undefined) updatePayload.description = expense.description;
  if (expense.amount !== undefined) updatePayload.amount = Number(expense.amount);

  if (expense.category !== undefined) {
    const cat = String(expense.category).toLowerCase();
    if (cat === 'staff') updatePayload.category = 'staff';
    else if (cat === 'groceries') updatePayload.category = 'groceries';
    else updatePayload.category = 'other';
  }

  if (expense.paid_by !== undefined) {
    const isHotel = !expense.paid_by || expense.paid_by.toUpperCase() === 'HOTEL';
    updatePayload.paid_by = isHotel ? 'HOTEL' : expense.paid_by.toUpperCase();
    updatePayload.paid_by_partner_id = isHotel ? null : (Number(expense.paid_by_partner_id) || expense.paid_by_partner_id);
  }

  const { data, error } = await supabase
    .from('expense_entries')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating expense entry in Supabase:', error);
    throw new Error(`Failed to update expense entry: ${error.message}`);
  }

  return data;
}

export async function deleteExpenseEntry(id: string): Promise<void> {
  const { error } = await supabase.from('expense_entries').delete().eq('id', id);

  if (error) {
    console.error('Error deleting expense entry from Supabase:', error);
    throw new Error(`Failed to delete expense entry: ${error.message}`);
  }
}

// ==========================================
// 4. PARTNER BALANCES (VIEW) & SETTLEMENTS
// ==========================================
export async function fetchPartnerCurrentBalances(): Promise<PartnerCurrentBalance[]> {
  // Query partners, view data, and settlements independently to guarantee accuracy
  const [partnersRes, viewRes, settlementsRes, incomeRes, expenseRes] = await Promise.all([
    supabase.from('partners').select('id, name').order('name'),
    supabase.from('partner_current_balances').select('*'),
    supabase.from('partner_settlements').select('*'),
    supabase.from('income_entries').select('balance_amount, balance_account_partner_id, by_who, payment_status'),
    supabase.from('expense_entries').select('amount, paid_by, paid_by_partner_id'),
  ]);

  const rawPartners = partnersRes.data || [];
  const rawViewBalances = viewRes.data || [];
  const rawSettlements = settlementsRes.data || [];
  const rawIncome = incomeRes.data || [];
  const rawExpense = expenseRes.data || [];

  // Filter out any partner named LOKESH and focus strictly on the 5 official partners
  const result: PartnerCurrentBalance[] = OFFICIAL_PARTNER_NAMES.map((officialName) => {
    // Find matching partner record from 'partners' table (match ANSARI, IRSHAD, MUSADDIQ/MUSSADDIQ, SATHISH, YOGESH)
    const matchingPartner = rawPartners.find(
      (p) => normalizePartnerName(p.name) === officialName
    );
    const partnerId = matchingPartner ? String(matchingPartner.id) : officialName;
    const partnerName = officialName;

    // 1. Initial / view balances for this partner
    const viewRow = rawViewBalances.find(
      (v: any) =>
        (matchingPartner && String(v.partner_id) === String(matchingPartner.id)) ||
        normalizePartnerName(v.name) === officialName
    );

    let baseBalanceToHotel = viewRow ? Number(viewRow.balance_to_hotel) || 0 : 0;
    let baseExpensesByThem = viewRow ? Number(viewRow.expenses_by_them) || 0 : 0;

    // Also sum from income entries if not represented in view
    const incomeBalanceSum = rawIncome.reduce((acc: number, inc: any) => {
      const bal = Number(inc.balance_amount) || 0;
      if (bal <= 0) return acc;
      const isMatchId = matchingPartner && String(inc.balance_account_partner_id) === String(matchingPartner.id);
      const isMatchName = normalizePartnerName(inc.by_who || '') === officialName;
      if (isMatchId || isMatchName) {
        return acc + bal;
      }
      return acc;
    }, 0);

    const expensePaidSum = rawExpense.reduce((acc: number, exp: any) => {
      const amt = Number(exp.amount) || 0;
      if (amt <= 0) return acc;
      const isMatchId = matchingPartner && String(exp.paid_by_partner_id) === String(matchingPartner.id);
      const isMatchName = normalizePartnerName(exp.paid_by || '') === officialName;
      if (isMatchId || isMatchName) {
        return acc + amt;
      }
      return acc;
    }, 0);

    // Use highest of view or direct entry sum
    const totalBalanceToHotel = Math.max(baseBalanceToHotel, incomeBalanceSum);
    const totalExpensesByThem = Math.max(baseExpensesByThem, expensePaidSum);

    // 2. Sum settlements for this partner
    const partnerSettlements = rawSettlements.filter((s: any) => {
      if (matchingPartner && String(s.partner_id) === String(matchingPartner.id)) return true;
      return false;
    });

    const settlementsToHotel = partnerSettlements.reduce((sum: number, s: any) => {
      const type = String(s.settlement_type).toLowerCase();
      if (type === 'to_hotel' || type === 'balance_to_hotel') {
        return sum + (Number(s.amount) || 0);
      }
      return sum;
    }, 0);

    const settlementsFromHotel = partnerSettlements.reduce((sum: number, s: any) => {
      const type = String(s.settlement_type).toLowerCase();
      if (type === 'from_hotel' || type === 'expenses_by_them') {
        return sum + (Number(s.amount) || 0);
      }
      return sum;
    }, 0);

    // 3. Current net balances (never negative)
    const netBalanceToHotel = Math.max(0, totalBalanceToHotel - settlementsToHotel);
    const netExpensesByThem = Math.max(0, totalExpensesByThem - settlementsFromHotel);

    return {
      partner_id: partnerId,
      name: partnerName,
      balance_to_hotel: netBalanceToHotel,
      expenses_by_them: netExpensesByThem,
    };
  });

  return result;
}

export async function fetchPartnerSettlements(): Promise<PartnerSettlement[]> {
  const { data, error } = await supabase
    .from('partner_settlements')
    .select(
      `
      id,
      partner_id,
      settlement_date,
      amount,
      settlement_type,
      notes,
      created_at,
      partners:partner_id ( id, name )
    `
    )
    .order('settlement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching partner settlements from Supabase:', error);
    throw new Error(`Failed to load partner settlements: ${error.message}`);
  }

  return (data || []).map((row: any) => {
    const partnerRelation = row.partners;
    const partnerName = Array.isArray(partnerRelation)
      ? partnerRelation[0]?.name
      : partnerRelation?.name;

    const dbType = String(row.settlement_type).toLowerCase();
    const mappedType: SettlementType =
      dbType === 'to_hotel' ? 'balance_to_hotel' : 'expenses_by_them';

    return {
      id: String(row.id),
      partnerId: String(row.partner_id),
      partnerName: partnerName || 'Partner',
      type: mappedType,
      amount: Number(row.amount) || 0,
      date: row.settlement_date,
      notes: row.notes || undefined,
      created_at: row.created_at,
    };
  });
}

export async function createPartnerSettlement(
  settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
): Promise<any> {
  const isToHotel =
    settlement.settlement_type === 'balance_to_hotel' ||
    settlement.settlement_type === 'to_hotel';

  const insertPayload = {
    partner_id: Number(settlement.partner_id) || settlement.partner_id,
    settlement_date: settlement.settlement_date,
    amount: Number(settlement.amount) || 0,
    settlement_type: isToHotel ? 'to_hotel' : 'from_hotel',
    notes: settlement.notes || null,
  };

  const { data, error } = await supabase
    .from('partner_settlements')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Error inserting partner settlement in Supabase:', error);
    throw new Error(`Failed to create settlement: ${error.message}`);
  }

  return data;
}

// ==========================================
// 5. ACCOUNT MONTHS (Persistent Monthly Accounting)
// ==========================================
export async function fetchAccountMonths(): Promise<AccountMonthRow[]> {
  const { data, error } = await supabase
    .from('account_months')
    .select('*')
    .order('month_start', { ascending: true });

  if (error) {
    console.warn('Error querying account_months table from Supabase:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id ? String(row.id) : undefined,
    month_start: String(row.month_start),
    opening_balance: Number(row.opening_balance) || 0,
    total_income: Number(row.total_income) || 0,
    total_paid: Number(row.total_paid) || 0,
    total_balance: Number(row.total_balance) || 0,
    total_expense: Number(row.total_expense) || 0,
    settlement_to_hotel: Number(row.settlement_to_hotel) || 0,
    settlement_from_hotel: Number(row.settlement_from_hotel) || 0,
    closing_balance: Number(row.closing_balance) || 0,
    is_closed: !!row.is_closed,
    closed_at: row.closed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Standardize month string to YYYY-MM-01 format for database queries
 */
export function formatMonthStartDb(monthStr: string): string {
  if (!monthStr) return '2026-08-01';
  if (monthStr.length === 7) return `${monthStr}-01`;
  if (monthStr.length >= 10) return `${monthStr.substring(0, 7)}-01`;
  return monthStr;
}

/**
 * Get or create an account month record in Supabase without overwriting existing opening_balance.
 */
export async function getOrCreateAccountMonth(
  monthKey: string, // e.g. '2026-08' or '2026-08-01'
  calculatedOpeningBalance: number
): Promise<AccountMonthRow> {
  const dbMonthStart = formatMonthStartDb(monthKey);
  const monthPrefix = monthKey.substring(0, 7);

  // Check if row already exists
  const { data: existingRows, error: fetchErr } = await supabase
    .from('account_months')
    .select('*');

  if (!fetchErr && existingRows && existingRows.length > 0) {
    const found = existingRows.find(
      (r: any) => String(r.month_start).startsWith(monthPrefix) || String(r.month_start) === dbMonthStart
    );
    if (found) {
      return {
        id: found.id ? String(found.id) : undefined,
        month_start: String(found.month_start),
        opening_balance: Number(found.opening_balance) || 0,
        total_income: Number(found.total_income) || 0,
        total_paid: Number(found.total_paid) || 0,
        total_balance: Number(found.total_balance) || 0,
        total_expense: Number(found.total_expense) || 0,
        settlement_to_hotel: Number(found.settlement_to_hotel) || 0,
        settlement_from_hotel: Number(found.settlement_from_hotel) || 0,
        closing_balance: Number(found.closing_balance) || 0,
        is_closed: !!found.is_closed,
        closed_at: found.closed_at || null,
        created_at: found.created_at,
        updated_at: found.updated_at,
      };
    }
  }

  // Row does not exist -> Create new row with initial opening balance
  const insertPayload = {
    month_start: dbMonthStart,
    opening_balance: Number(calculatedOpeningBalance) || 0,
    total_income: 0,
    total_paid: 0,
    total_balance: 0,
    total_expense: 0,
    settlement_to_hotel: 0,
    settlement_from_hotel: 0,
    closing_balance: Number(calculatedOpeningBalance) || 0,
    is_closed: false,
  };

  const { data, error } = await supabase
    .from('account_months')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Error inserting new account_month into Supabase:', error);
    // Return fallback object if insert failed
    return {
      month_start: dbMonthStart,
      opening_balance: calculatedOpeningBalance,
      total_income: 0,
      total_paid: 0,
      total_balance: 0,
      total_expense: 0,
      settlement_to_hotel: 0,
      settlement_from_hotel: 0,
      closing_balance: calculatedOpeningBalance,
      is_closed: false,
    };
  }

  return {
    id: data.id ? String(data.id) : undefined,
    month_start: String(data.month_start),
    opening_balance: Number(data.opening_balance) || 0,
    total_income: Number(data.total_income) || 0,
    total_paid: Number(data.total_paid) || 0,
    total_balance: Number(data.total_balance) || 0,
    total_expense: Number(data.total_expense) || 0,
    settlement_to_hotel: Number(data.settlement_to_hotel) || 0,
    settlement_from_hotel: Number(data.settlement_from_hotel) || 0,
    closing_balance: Number(data.closing_balance) || 0,
    is_closed: !!data.is_closed,
    closed_at: data.closed_at || null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Update monthly totals in account_months table
 */
export async function updateAccountMonthTotals(
  monthKey: string,
  totals: {
    total_income: number;
    total_paid: number;
    total_balance: number;
    total_expense: number;
    settlement_to_hotel: number;
    settlement_from_hotel: number;
    closing_balance: number;
    opening_balance?: number;
  }
): Promise<void> {
  const dbMonthStart = formatMonthStartDb(monthKey);
  const monthPrefix = monthKey.substring(0, 7);

  const updatePayload: Record<string, any> = {
    total_income: totals.total_income,
    total_paid: totals.total_paid,
    total_balance: totals.total_balance,
    total_expense: totals.total_expense,
    settlement_to_hotel: totals.settlement_to_hotel,
    settlement_from_hotel: totals.settlement_from_hotel,
    closing_balance: totals.closing_balance,
    updated_at: new Date().toISOString(),
  };

  if (totals.opening_balance !== undefined) {
    updatePayload.opening_balance = totals.opening_balance;
  }

  const { error } = await supabase
    .from('account_months')
    .update(updatePayload)
    .or(`month_start.eq.${dbMonthStart},month_start.like.${monthPrefix}%`);

  if (error) {
    console.warn('Error updating account_months totals in Supabase:', error);
  }
}

/**
 * Explicitly close a month in account_months
 */
export async function closeAccountMonthInDb(
  monthKey: string,
  closingBalance: number
): Promise<void> {
  const dbMonthStart = formatMonthStartDb(monthKey);
  const monthPrefix = monthKey.substring(0, 7);

  const updatePayload = {
    is_closed: true,
    closing_balance: Number(closingBalance) || 0,
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('account_months')
    .update(updatePayload)
    .or(`month_start.eq.${dbMonthStart},month_start.like.${monthPrefix}%`);

  if (error) {
    console.error('Error closing account month in Supabase:', error);
    throw new Error(`Failed to close month: ${error.message}`);
  }
}

/**
 * Re-open a month in account_months
 */
export async function reopenAccountMonthInDb(monthKey: string): Promise<void> {
  const dbMonthStart = formatMonthStartDb(monthKey);
  const monthPrefix = monthKey.substring(0, 7);

  const updatePayload = {
    is_closed: false,
    closed_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('account_months')
    .update(updatePayload)
    .or(`month_start.eq.${dbMonthStart},month_start.like.${monthPrefix}%`);

  if (error) {
    console.error('Error reopening account month in Supabase:', error);
    throw new Error(`Failed to reopen month: ${error.message}`);
  }
}

// ==========================================
// 8. APPLICATION LOCK (SUPABASE RPC)
// ==========================================

/**
 * Check if the application lock is enabled in Supabase
 */
export async function getAppLockStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_app_lock_status');

  if (error) {
    console.error('Error fetching app lock status from Supabase:', error);
    // Default to true if error occurs to maintain security
    return true;
  }

  return Boolean(data);
}

/**
 * Securely verify PIN using Supabase RPC
 */
export async function verifyAppPin(inputPin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_app_pin', {
    input_pin: inputPin,
  });

  if (error) {
    console.error('Error verifying app PIN:', error);
    throw new Error(error.message || 'Failed to verify PIN');
  }

  return Boolean(data);
}

/**
 * Change PIN securely using Supabase RPC
 */
export async function changeAppPin(
  currentPin: string,
  newPin: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('change_app_pin', {
    current_pin: currentPin,
    new_pin: newPin,
  });

  if (error) {
    console.error('Error changing app PIN:', error);
    throw new Error(error.message || 'Failed to change PIN');
  }

  return Boolean(data);
}

