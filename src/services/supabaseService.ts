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
  MealType,
  PaymentStatus,
  ExpenseCategory,
  SettlementType,
} from '../types';

/**
 * Supabase Data Access Layer
 * Provides clean typed operations matching the Supabase PostgreSQL database schema.
 */

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

    // Map meal_type from db lowercase to capitalized UI
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
      incomeType: row.income_type === 'alacarte' ? 'À La Carte' : 'Meal',
      mealType: mappedMealType,
      byWho: row.by_who || (row.income_type === 'alacarte' ? 'À LA CARTE' : 'IRSHAD'),
      travels: row.travel_name || undefined,
      membersCount: Number(row.member_count) || 0,
      pricePerMember: Number(row.price_per_member) || 0,
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
  const isAlaCarte = entry.income_type === 'À La Carte' || String(entry.income_type).toLowerCase() === 'alacarte';
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

  // DB meal_type check constraint: 'breakfast' | 'lunch' | 'dinner'
  let dbMealType: 'breakfast' | 'lunch' | 'dinner' = 'breakfast';
  if (entry.meal_type) {
    const mt = String(entry.meal_type).toLowerCase();
    if (mt === 'lunch') dbMealType = 'lunch';
    else if (mt === 'dinner') dbMealType = 'dinner';
    else dbMealType = 'breakfast';
  }

  const insertPayload: Record<string, any> = {
    entry_date: entry.entry_date,
    income_type: isAlaCarte ? 'alacarte' : 'meal',
    meal_type: dbMealType,
    total_amount: totalAmount,
    amount_received: amountReceived,
    payment_status: dbPaymentStatus,
    by_who: entry.by_who || (isAlaCarte ? 'À LA CARTE' : 'IRSHAD'),
    travel_name: entry.travel_name || null,
    member_count: isAlaCarte ? null : (Number(entry.member_count) || null),
    price_per_member: isAlaCarte ? null : (Number(entry.price_per_member) || null),
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
  if (entry.by_who !== undefined) updatePayload.by_who = entry.by_who;

  if (entry.income_type !== undefined) {
    const isAlaCarte = entry.income_type === 'À La Carte' || String(entry.income_type).toLowerCase() === 'alacarte';
    updatePayload.income_type = isAlaCarte ? 'alacarte' : 'meal';
  }

  if (entry.meal_type !== undefined && entry.meal_type !== null) {
    const mt = String(entry.meal_type).toLowerCase();
    if (mt === 'lunch') updatePayload.meal_type = 'lunch';
    else if (mt === 'dinner') updatePayload.meal_type = 'dinner';
    else updatePayload.meal_type = 'breakfast';
  }

  if (entry.member_count !== undefined) {
    updatePayload.member_count = entry.member_count ? Number(entry.member_count) : null;
  }
  if (entry.price_per_member !== undefined) {
    updatePayload.price_per_member = entry.price_per_member ? Number(entry.price_per_member) : null;
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
  const { data, error } = await supabase
    .from('partner_current_balances')
    .select('partner_id, name, balance_to_hotel, expenses_by_them');

  if (error) {
    console.warn('Could not query partner_current_balances view directly:', error);
    throw new Error(`Failed to load partner current balances: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    partner_id: String(row.partner_id),
    name: row.name,
    balance_to_hotel: Number(row.balance_to_hotel) || 0,
    expenses_by_them: Number(row.expenses_by_them) || 0,
  }));
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
