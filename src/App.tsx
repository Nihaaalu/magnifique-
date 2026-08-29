import React, { useState, useEffect, useCallback } from 'react';
import {
  TabType,
  IncomeRecord,
  ExpenseRecord,
  Partner,
  PartnerCurrentBalance,
  PartnerSettlementRow,
  IncomeEntryRow,
  ExpenseEntryRow,
} from './types';
import {
  fetchPartners,
  fetchIncomeEntries,
  createIncomeEntry,
  updateIncomeEntry,
  deleteIncomeEntry,
  fetchExpenseEntries,
  createExpenseEntry,
  updateExpenseEntry,
  deleteExpenseEntry,
  fetchPartnerCurrentBalances,
  fetchPartnerSettlements,
  createPartnerSettlement,
} from './services/supabaseService';
import { Navbar } from './components/Navbar';
import { IncomeTab } from './components/IncomeTab';
import { ExpenseTab } from './components/ExpenseTab';
import { PartnerTab } from './components/PartnerTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('income');

  // Supabase State
  const [partners, setPartners] = useState<Partner[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [partnerBalances, setPartnerBalances] = useState<PartnerCurrentBalance[]>([]);
  const [partnerSettlements, setPartnerSettlements] = useState<PartnerSettlementRow[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load all initial data from Supabase PostgreSQL
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [
        partnersData,
        incomeData,
        expenseData,
        balancesData,
        settlementsData,
      ] = await Promise.all([
        fetchPartners(),
        fetchIncomeEntries(),
        fetchExpenseEntries(),
        fetchPartnerCurrentBalances(),
        fetchPartnerSettlements(),
      ]);

      setPartners(partnersData);
      setIncomeRecords(incomeData);
      setExpenseRecords(expenseData);
      setPartnerBalances(balancesData);
      setPartnerSettlements(settlementsData);
    } catch (err: any) {
      console.error('Failed to load data from Supabase:', err);
      setError(
        err.message ||
          'Failed to connect to the Supabase database. Please ensure credentials and tables are configured.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Income Operations
  const handleAddIncome = async (
    entry: Omit<IncomeEntryRow, 'id' | 'created_at' | 'updated_at'>
  ) => {
    await createIncomeEntry(entry);
    const [updatedIncome, updatedBalances] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);
  };

  const handleUpdateIncome = async (
    id: string,
    updates: Partial<IncomeRecord>
  ) => {
    // Map IncomeRecord back to row format if updating
    const rowUpdates: Partial<IncomeEntryRow> = {};
    if (updates.date !== undefined) rowUpdates.entry_date = updates.date;
    if (updates.mealType !== undefined) rowUpdates.meal_type = updates.mealType;
    if (updates.byWho !== undefined) rowUpdates.by_who = updates.byWho;
    if (updates.travels !== undefined) rowUpdates.travel_name = updates.travels || null;
    if (updates.membersCount !== undefined) rowUpdates.member_count = updates.membersCount;
    if (updates.pricePerMember !== undefined) rowUpdates.price_per_member = updates.pricePerMember;
    if (updates.total !== undefined) rowUpdates.total_amount = updates.total;
    if (updates.amountPaid !== undefined) rowUpdates.amount_received = updates.amountPaid;
    if (updates.balance !== undefined) rowUpdates.balance_amount = updates.balance;
    if (updates.paymentStatus !== undefined) {
      rowUpdates.payment_status = updates.paymentStatus === 'Paid Full' ? 'Paid Full' : 'Balance';
    }
    if (updates.balanceAccountPartnerId !== undefined) {
      rowUpdates.balance_account_partner_id = updates.balanceAccountPartnerId;
    }

    await updateIncomeEntry(id, rowUpdates);
    const [updatedIncome, updatedBalances] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);
  };

  const handleDeleteIncome = async (id: string) => {
    await deleteIncomeEntry(id);
    const [updatedIncome, updatedBalances] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);
  };

  // Expense Operations
  const handleAddExpense = async (
    entry: Omit<ExpenseEntryRow, 'id' | 'created_at' | 'updated_at'>
  ) => {
    await createExpenseEntry(entry);
    const [updatedExpenses, updatedBalances] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);
  };

  const handleUpdateExpense = async (
    id: string,
    updates: Partial<ExpenseRecord>
  ) => {
    const rowUpdates: Partial<ExpenseEntryRow> = {};
    if (updates.date !== undefined) rowUpdates.expense_date = updates.date;
    if (updates.category !== undefined) rowUpdates.category = updates.category;
    if (updates.name !== undefined) rowUpdates.description = updates.name || null;
    if (updates.amount !== undefined) rowUpdates.amount = updates.amount;
    if (updates.paidBy !== undefined) rowUpdates.paid_by = updates.paidBy;
    if (updates.paidByPartnerId !== undefined) {
      rowUpdates.paid_by_partner_id = updates.paidByPartnerId;
    }

    await updateExpenseEntry(id, rowUpdates);
    const [updatedExpenses, updatedBalances] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);
  };

  const handleDeleteExpense = async (id: string) => {
    await deleteExpenseEntry(id);
    const [updatedExpenses, updatedBalances] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);
  };

  // Partner Settlement Operations
  const handleAddSettlement = async (
    settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
  ) => {
    await createPartnerSettlement(settlement);
    const [updatedSettlements, updatedBalances] = await Promise.all([
      fetchPartnerSettlements(),
      fetchPartnerCurrentBalances(),
    ]);
    setPartnerSettlements(updatedSettlements);
    setPartnerBalances(updatedBalances);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex flex-col font-sans selection:bg-[#D4AF37] selection:text-[#0A0A0A]">
      {/* Mobile-First Header with 4-Tab Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-4 py-3.5 sm:py-5">
        {/* Error notification */}
        {error && (
          <div
            id="supabase-error-alert"
            className="mb-4 p-3.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-xl text-xs flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#f87171]" />
              <div>
                <strong className="block font-bold">Supabase Database Notice</strong>
                <span className="text-[#D0D0D0] text-[11px]">{error}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-2.5 py-1 bg-[#171717] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#F5F5F5] rounded text-xs flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Tab Routing */}
        {activeTab === 'income' && (
          <IncomeTab
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            partners={partners}
            onAddIncome={handleAddIncome}
            onDeleteIncome={handleDeleteIncome}
            onUpdateIncome={handleUpdateIncome}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'expense' && (
          <ExpenseTab
            expenseRecords={expenseRecords}
            incomeRecords={incomeRecords}
            partners={partners}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onUpdateExpense={handleUpdateExpense}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'partner' && (
          <PartnerTab
            partners={partners}
            partnerBalances={partnerBalances}
            partnerSettlements={partnerSettlements}
            onAddSettlement={handleAddSettlement}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
          />
        )}
      </main>

      {/* Compact Mobile Footer */}
      <footer className="border-t border-[#2A2A2A] bg-[#0A0A0A] py-3 mt-auto">
        <div className="max-w-3xl mx-auto px-3 text-center text-[10px] sm:text-xs text-[#777777] font-medium flex items-center justify-center gap-2">
          <span className="text-[#D4AF37] font-bold tracking-wider">MAGNIFIQUE 2.0</span>
          <span>•</span>
          <span>Supabase PostgreSQL Connected</span>
        </div>
      </footer>
    </div>
  );
}
