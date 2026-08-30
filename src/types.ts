export type TabType = 'income' | 'expense' | 'partner' | 'analytics';

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';
export type IncomeType = 'Meal' | 'À La Carte';
export type MealPlan = '1_time' | '2_time' | '3_time' | 'alacarte';
export type MealCombination =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'breakfast_lunch'
  | 'breakfast_dinner'
  | 'lunch_dinner'
  | 'all'
  | null;

export type PaymentStatus = 'Paid Full' | 'Paid Partially' | 'Balance';

// Database Models
export interface Partner {
  id: string;
  name: string;
  active: boolean;
  display_order: number;
  created_at?: string;
}

export interface PartnerCurrentBalance {
  partner_id: string;
  name: string;
  balance_to_hotel: number;
  expenses_by_them: number;
}

export interface IncomeEntryRow {
  id: string;
  entry_date: string;
  income_type: 'meal' | 'alacarte' | IncomeType;
  meal_plan: MealPlan;
  meal_combination: MealCombination;
  breakfast_price: number | null;
  lunch_price: number | null;
  dinner_price: number | null;
  meal_type?: string | null;
  travel_name: string | null;
  member_count: number | null;
  price_per_member?: number | null;
  total_amount: number;
  amount_received: number;
  balance_amount: number;
  payment_status: 'paid_full' | 'paid_partial' | 'balance' | 'Paid Full' | 'Balance';
  by_who: string | null;
  balance_account_partner_id: string | number | null;
  created_at?: string;
  updated_at?: string;
}

export interface IncomeRecord {
  id: string;
  date: string; // entry_date YYYY-MM-DD
  time?: string;
  incomeType: IncomeType;
  mealPlan: MealPlan;
  mealCombination: MealCombination;
  breakfastPrice?: number | null;
  lunchPrice?: number | null;
  dinnerPrice?: number | null;
  mealType?: MealType | null;
  byWho: string;
  travels?: string;
  membersCount: number;
  pricePerMember: number;
  total: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  balance: number;
  balanceAccountPartnerId?: string | null;
  balanceAccountPartnerName?: string;
  created_at?: string;
}

export type ExpenseCategory = 'Staff' | 'Groceries' | 'Other';

export interface ExpenseEntryRow {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  paid_by: string;
  paid_by_partner_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseRecord {
  id: string;
  date: string; // expense_date YYYY-MM-DD
  time?: string;
  category: ExpenseCategory;
  name?: string; // description
  amount: number;
  paidBy: string;
  paidByPartnerId?: string | null;
  created_at?: string;
}

export type SettlementType = 'balance_to_hotel' | 'expenses_by_them';

export interface PartnerSettlementRow {
  id: string;
  partner_id: string;
  settlement_date: string;
  amount: number;
  settlement_type: string;
  notes: string | null;
  created_at?: string;
}

export interface PartnerSettlement {
  id: string;
  partnerId: string;
  partnerName: string;
  type: SettlementType;
  amount: number;
  date: string;
  notes?: string;
  created_at?: string;
}

export interface ProfitShareResult {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  ansariIrshadShare: number; // 25% combined
  mussaddiqShare: number; // 25%
  sathishShare: number; // 25%
  yogeshShare: number; // 25%
  generatedAt: string;
}
