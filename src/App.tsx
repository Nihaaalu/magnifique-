import React, { useState, useEffect, useCallback } from 'react';
import {
  TabType,
  IncomeRecord,
  ExpenseRecord,
  Partner,
  PartnerCurrentBalance,
  PartnerSettlementRow,
  PartnerSettlement,
  IncomeEntryRow,
  ExpenseEntryRow,
  AccountMonthRow,
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
  createIncomePaymentSettlement,
  fetchAccountMonths,
  getOrCreateAccountMonth,
  closeAccountMonthInDb,
  reopenAccountMonthInDb,
} from './services/supabaseService';
import { getCurrentMonthString } from './utils/formatters';
import { calculateAllMonthsSummary } from './utils/accountBalanceUtils';
import { Navbar } from './components/Navbar';
import { IncomeTab } from './components/IncomeTab';
import { ExpenseTab } from './components/ExpenseTab';
import { PartnerTab } from './components/PartnerTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { AppLockScreen } from './components/AppLockScreen';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
const UNLOCKED_STORAGE_KEY = 'magnifique_app_unlocked';
const LAST_ACTIVITY_STORAGE_KEY = 'magnifique_last_activity';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('income');

  // Application Lock State (Browser-local with 30-minute inactivity timeout)
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [isCheckingLock, setIsCheckingLock] = useState<boolean>(true);

  // Supabase State
  const [partners, setPartners] = useState<Partner[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [partnerBalances, setPartnerBalances] = useState<PartnerCurrentBalance[]>([]);
  const [partnerSettlements, setPartnerSettlements] = useState<PartnerSettlement[]>([]);
  const [accountMonths, setAccountMonths] = useState<AccountMonthRow[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check initial app lock status on startup/reload from browser storage
  useEffect(() => {
    try {
      const isUnlocked = localStorage.getItem(UNLOCKED_STORAGE_KEY) === 'true';
      const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;
      const now = Date.now();

      // If unlocked and active within the last 30 minutes, keep unlocked across page refresh
      if (
        isUnlocked &&
        lastActivity > 0 &&
        now - lastActivity < INACTIVITY_TIMEOUT_MS &&
        now >= lastActivity
      ) {
        setIsLocked(false);
      } else {
        // Inactive for 30+ minutes or not unlocked
        localStorage.removeItem(UNLOCKED_STORAGE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
        setIsLocked(true);
      }
    } catch (err) {
      console.error('Failed to read lock state from localStorage:', err);
      setIsLocked(true);
    } finally {
      setIsCheckingLock(false);
    }
  }, []);

  // 30-minute Inactivity Detection & User Interaction Tracker
  useEffect(() => {
    if (isLocked) return;

    let lastWriteTime = Date.now();

    // Event listener: user interaction resets the 30-minute inactivity timer
    const recordUserActivity = () => {
      const now = Date.now();
      // Throttle localStorage updates to at most once every 2 seconds to optimize performance
      if (now - lastWriteTime >= 2000) {
        lastWriteTime = now;
        try {
          localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, now.toString());
        } catch (e) {
          console.error('Failed to update activity timestamp:', e);
        }
      }
    };

    // Ensure last activity and unlock flags are set on active session
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, Date.now().toString());
      localStorage.setItem(UNLOCKED_STORAGE_KEY, 'true');
    } catch {}

    // Valid user interactions across desktop and mobile devices:
    // mouse movement, click, keyboard input, touch, scrolling, form focus
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'click',
      'keydown',
      'keyup',
      'touchstart',
      'touchend',
      'scroll',
      'wheel',
      'focusin',
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, recordUserActivity, { passive: true });
    });

    // Periodic check every 5 seconds to lock if 30 minutes have elapsed with no activity
    const intervalId = setInterval(() => {
      try {
        const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
        const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;
        const now = Date.now();

        if (!lastActivity || now - lastActivity >= INACTIVITY_TIMEOUT_MS) {
          // 30 minutes expired: lock application
          localStorage.removeItem(UNLOCKED_STORAGE_KEY);
          localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
          setIsLocked(true);
        }
      } catch (e) {
        console.error('Inactivity check error:', e);
      }
    }, 5000);

    // Tab visibility change check (when returning to tab after being away)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try {
          const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
          const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : 0;
          const now = Date.now();

          if (!lastActivity || now - lastActivity >= INACTIVITY_TIMEOUT_MS) {
            localStorage.removeItem(UNLOCKED_STORAGE_KEY);
            localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
            setIsLocked(true);
          } else {
            recordUserActivity();
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordUserActivity);
      });
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLocked]);

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
        monthsData,
      ] = await Promise.all([
        fetchPartners(),
        fetchIncomeEntries(),
        fetchExpenseEntries(),
        fetchPartnerCurrentBalances(),
        fetchPartnerSettlements(),
        fetchAccountMonths(),
      ]);

      setPartners(partnersData);
      setIncomeRecords(incomeData);
      setExpenseRecords(expenseData);
      setPartnerBalances(balancesData);
      setPartnerSettlements(settlementsData);
      setAccountMonths(monthsData);

      // Ensure current month exists in account_months
      const curMonth = getCurrentMonthString();
      const exists = monthsData.some((m) => m.month_start && m.month_start.startsWith(curMonth));
      if (!exists) {
        // Calculate initial opening balance for current month based on previous months
        const calculatedSummaries = calculateAllMonthsSummary(
          incomeData,
          expenseData,
          monthsData,
          settlementsData
        );
        const curSummary = calculatedSummaries[curMonth];
        const initialOpening = curSummary ? curSummary.openingBalance : 0;
        getOrCreateAccountMonth(curMonth, initialOpening).then((newMonth) => {
          setAccountMonths((prev) => {
            if (prev.some((m) => m.month_start && m.month_start.startsWith(curMonth))) {
              return prev;
            }
            return [...prev, newMonth];
          });
        }).catch((e) => console.warn('Could not auto-create account_month in DB:', e));
      }
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
    if (updates.incomeType !== undefined) {
      rowUpdates.income_type = updates.incomeType === 'À La Carte' ? 'alacarte' : 'meal';
    }
    if (updates.mealPlan !== undefined) rowUpdates.meal_plan = updates.mealPlan;
    if (updates.mealCombination !== undefined) rowUpdates.meal_combination = updates.mealCombination;
    if (updates.breakfastPrice !== undefined) rowUpdates.breakfast_price = updates.breakfastPrice;
    if (updates.lunchPrice !== undefined) rowUpdates.lunch_price = updates.lunchPrice;
    if (updates.dinnerPrice !== undefined) rowUpdates.dinner_price = updates.dinnerPrice;
    if (updates.mealType !== undefined) rowUpdates.meal_type = updates.mealType;
    if (updates.byWho !== undefined) rowUpdates.by_who = updates.byWho;
    if (updates.travels !== undefined) rowUpdates.travel_name = updates.travels || null;
    if (updates.membersCount !== undefined) rowUpdates.member_count = updates.membersCount;
    if (updates.pricePerMember !== undefined) rowUpdates.price_per_member = updates.pricePerMember;
    if (updates.total !== undefined) rowUpdates.total_amount = updates.total;
    if (updates.amountPaid !== undefined) rowUpdates.amount_received = updates.amountPaid;
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

  const handleSettleIncome = async (
    incomeEntryId: string,
    paymentDate: string,
    amount: number
  ) => {
    await createIncomePaymentSettlement({
      income_entry_id: incomeEntryId,
      payment_date: paymentDate,
      amount,
    });
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
    if (updates.description !== undefined) {
      rowUpdates.description = updates.description || null;
    } else if (updates.name !== undefined) {
      rowUpdates.description = updates.name || null;
    }
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

  // Month Close / Reopen Operations
  const handleCloseMonth = async (monthStr: string, closingBalance: number) => {
    await closeAccountMonthInDb(monthStr, closingBalance);
    const updatedMonths = await fetchAccountMonths();
    setAccountMonths(updatedMonths);
  };

  const handleReopenMonth = async (monthStr: string) => {
    await reopenAccountMonthInDb(monthStr);
    const updatedMonths = await fetchAccountMonths();
    setAccountMonths(updatedMonths);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, Date.now().toString());
    } catch {}
    try {
      await loadData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUnlock = () => {
    try {
      const now = Date.now();
      localStorage.setItem(UNLOCKED_STORAGE_KEY, 'true');
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, now.toString());
    } catch (e) {
      console.error('Failed to save unlock state to localStorage:', e);
    }
    setIsLocked(false);
  };

  const handleLockApp = () => {
    try {
      localStorage.removeItem(UNLOCKED_STORAGE_KEY);
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear unlock state from localStorage:', e);
    }
    setIsLocked(true);
  };

  // If checking initial lock status, display clean dark splash loader
  if (isCheckingLock) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center space-y-3 text-[#F5F5F5]">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-black text-[#F5F5F5] tracking-widest uppercase">
            MAGNIFIQUE <span className="text-[#D4AF37]">2.0</span>
          </h1>
          <p className="text-xs text-[#777777] font-medium tracking-wide">
            Restaurant Accounts
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#D4AF37] pt-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // If locked, render the full application lock screen before showing the main application
  if (isLocked) {
    return <AppLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex flex-col font-sans selection:bg-[#D4AF37] selection:text-[#0A0A0A]">
      {/* Mobile-First Header with 4-Tab Navigation & Refresh Control */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

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
            onSettleIncome={handleSettleIncome}
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
            accountMonths={accountMonths}
            partnerSettlements={partnerSettlements}
            partners={partners}
            onCloseMonth={handleCloseMonth}
            onReopenMonth={handleReopenMonth}
            onLockApp={handleLockApp}
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

