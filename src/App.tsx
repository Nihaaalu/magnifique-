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
  IrshadWalletEntry,
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
  updatePartnerSettlement,
  deletePartnerSettlement,
  createIncomePaymentSettlement,
  fetchAccountMonths,
  getOrCreateAccountMonth,
  closeAccountMonthInDb,
  reopenAccountMonthInDb,
  syncAccountMonthWithLiveTransactions,
  fetchIrshadWalletEntries,
  settleIrshadWallet,
} from './services/supabaseService';
import { getCurrentMonthString } from './utils/formatters';
import {
  calculateAllMonthsSummary,
  getExpenseAccountingMonth,
  getAllUniqueMonths,
  isMonthClosed,
} from './utils/accountBalanceUtils';
import { formatPdfMonth } from './services/pdfReportGenerator';
import { Navbar } from './components/Navbar';
import { IncomeTab } from './components/IncomeTab';
import { ExpenseTab } from './components/ExpenseTab';
import { PartnerTab } from './components/PartnerTab';
import { AnalyticsTab } from './components/AnalyticsTab';
import { AppLockScreen } from './components/AppLockScreen';
import { AlertCircle, RefreshCw } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
const UNLOCKED_STORAGE_KEY = 'magnifique_app_unlocked';
const LAST_ACTIVITY_STORAGE_KEY = 'magnifique_last_activity';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('income');

  // Application Lock State: strictly locked on startup and full browser page reload
  const [isLocked, setIsLocked] = useState<boolean>(true);

  // Supabase State
  const [partners, setPartners] = useState<Partner[]>([]);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [partnerBalances, setPartnerBalances] = useState<PartnerCurrentBalance[]>([]);
  const [partnerSettlements, setPartnerSettlements] = useState<PartnerSettlement[]>([]);
  const [accountMonths, setAccountMonths] = useState<AccountMonthRow[]>([]);
  const [walletEntries, setWalletEntries] = useState<IrshadWalletEntry[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure any persistent unlock token is cleared on full browser reload or page unload
  useEffect(() => {
    try {
      localStorage.removeItem(UNLOCKED_STORAGE_KEY);
      sessionStorage.removeItem(UNLOCKED_STORAGE_KEY);
    } catch {}

    const handleBeforeUnload = () => {
      try {
        localStorage.removeItem(UNLOCKED_STORAGE_KEY);
        sessionStorage.removeItem(UNLOCKED_STORAGE_KEY);
      } catch {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
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

    // Ensure last activity timestamp is set on active session
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, Date.now().toString());
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

  // Helper to sync account months with transaction data in background
  const syncMonthsWithTransactions = useCallback(
    async (
      incomeData: IncomeRecord[],
      expenseData: ExpenseRecord[],
      rawMonths: AccountMonthRow[],
      settlementsData: PartnerSettlement[]
    ) => {
      const summaries = calculateAllMonthsSummary(
        incomeData,
        expenseData,
        rawMonths,
        settlementsData
      );

      // Unique active months
      const uniqueMonths = getAllUniqueMonths(
        incomeData,
        expenseData,
        rawMonths,
        settlementsData
      );

      // Check and reconcile DB rows in the background
      uniqueMonths.forEach((mStr) => {
        const summary = summaries[mStr];
        const existingRow = rawMonths.find(
          (m) => m.month_start && m.month_start.startsWith(mStr)
        );

        if (summary) {
          // If row exists and has mismatch, or if row does not exist, sync to DB
          if (
            !existingRow ||
            existingRow.total_income !== summary.totalIncome ||
            existingRow.total_paid !== summary.totalPaid ||
            existingRow.total_balance !== summary.totalBalance ||
            existingRow.total_expense !== summary.totalExpense ||
            existingRow.closing_balance !== summary.closingBalance
          ) {
            syncAccountMonthWithLiveTransactions(mStr).catch((e) =>
              console.warn(`Could not sync account_months for ${mStr}:`, e)
            );
          }
        }
      });
    },
    []
  );

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
        walletData,
      ] = await Promise.all([
        fetchPartners(),
        fetchIncomeEntries(),
        fetchExpenseEntries(),
        fetchPartnerCurrentBalances(),
        fetchPartnerSettlements(),
        fetchAccountMonths(),
        fetchIrshadWalletEntries(),
      ]);

      setPartners(partnersData);
      setIncomeRecords(incomeData);
      setExpenseRecords(expenseData);
      setPartnerBalances(balancesData);
      setPartnerSettlements(settlementsData);
      setWalletEntries(walletData);

      // Recalculate account_months dynamically from transaction records as SINGLE SOURCE OF TRUTH
      const calculatedSummaries = calculateAllMonthsSummary(
        incomeData,
        expenseData,
        monthsData,
        settlementsData
      );

      // Map accountMonths state to transaction-derived totals
      const reconciledMonths: AccountMonthRow[] = monthsData.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        if (sum) {
          return {
            ...m,
            total_income: sum.totalIncome,
            total_paid: sum.totalPaid,
            total_balance: sum.totalBalance,
            total_expense: sum.totalExpense,
            closing_balance: sum.closingBalance,
          };
        }
        return m;
      });

      setAccountMonths(reconciledMonths);

      // Background DB synchronization of any stale account_months aggregate columns
      syncMonthsWithTransactions(incomeData, expenseData, monthsData, settlementsData);

      // Ensure current month exists in account_months
      const curMonth = getCurrentMonthString();
      const exists = monthsData.some((m) => m.month_start && m.month_start.startsWith(curMonth));
      if (!exists) {
        const curSummary = calculatedSummaries[curMonth];
        const initialOpening = curSummary ? curSummary.openingBalance : 0;
        getOrCreateAccountMonth(curMonth, initialOpening)
          .then((newMonth) => {
            setAccountMonths((prev) => {
              if (prev.some((m) => m.month_start && m.month_start.startsWith(curMonth))) {
                return prev;
              }
              return [...prev, newMonth];
            });
          })
          .catch((e) => console.warn('Could not auto-create account_month in DB:', e));
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
  }, [syncMonthsWithTransactions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Income Operations
  const handleAddIncome = async (
    entry: Omit<IncomeEntryRow, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const incMonth = entry.entry_date ? entry.entry_date.substring(0, 7) : '';
    if (incMonth && isMonthClosed(incMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(incMonth)} is closed. Reopen the month before making changes.`);
    }

    await createIncomeEntry(entry);
    const [updatedIncome, updatedBalances, updatedMonths] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);

    // Sync affected month from database transaction records
    if (incMonth) {
      syncAccountMonthWithLiveTransactions(incMonth).catch(() => {});
    }

    const calculatedSummaries = calculateAllMonthsSummary(
      updatedIncome,
      expenseRecords,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  const handleUpdateIncome = async (
    id: string,
    updates: Partial<IncomeRecord>
  ) => {
    // Identify old month before update
    const oldEntry = incomeRecords.find((r) => r.id === id);
    const oldMonth = oldEntry?.date ? oldEntry.date.substring(0, 7) : '';
    const newMonth = updates.date ? updates.date.substring(0, 7) : oldMonth;

    if (oldMonth && isMonthClosed(oldMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(oldMonth)} is closed. Reopen the month before making changes.`);
    }
    if (newMonth && newMonth !== oldMonth && isMonthClosed(newMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(newMonth)} is closed. Reopen the month before making changes.`);
    }

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
    if (updates.mealType !== undefined) {
      rowUpdates.meal_type = updates.mealType ? String(updates.mealType).trim().toUpperCase() : null;
    }
    if (updates.byWho !== undefined) rowUpdates.by_who = updates.byWho;
    if (updates.travels !== undefined) rowUpdates.travel_name = updates.travels || null;
    if (updates.membersCount !== undefined) rowUpdates.member_count = updates.membersCount;
    if (updates.pricePerMember !== undefined) rowUpdates.price_per_member = updates.pricePerMember;
    if (updates.total !== undefined) rowUpdates.total_amount = updates.total;
    if (updates.amountPaid !== undefined) rowUpdates.amount_received = updates.amountPaid;
    if (updates.paymentStatus !== undefined) {
      rowUpdates.payment_status =
        updates.paymentStatus === 'Paid Full'
          ? 'Paid Full'
          : updates.paymentStatus === 'Paid Partially'
          ? 'paid_partial'
          : 'Balance';
    }
    if (updates.balanceAccountPartnerId !== undefined) {
      rowUpdates.balance_account_partner_id = updates.balanceAccountPartnerId;
    }

    await updateIncomeEntry(id, rowUpdates);
    const [updatedIncome, updatedBalances, updatedMonths] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);

    // Sync affected month(s) from database transaction records
    if (oldMonth) syncAccountMonthWithLiveTransactions(oldMonth).catch(() => {});
    if (newMonth && newMonth !== oldMonth) syncAccountMonthWithLiveTransactions(newMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      updatedIncome,
      expenseRecords,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  const handleDeleteIncome = async (id: string) => {
    const oldEntry = incomeRecords.find((r) => r.id === id);
    const oldMonth = oldEntry?.date ? oldEntry.date.substring(0, 7) : '';
    if (oldMonth && isMonthClosed(oldMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(oldMonth)} is closed. Reopen the month before making changes.`);
    }

    await deleteIncomeEntry(id);
    const [updatedIncome, updatedBalances, updatedMonths] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);

    if (oldMonth) syncAccountMonthWithLiveTransactions(oldMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      updatedIncome,
      expenseRecords,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  const handleSettleIncome = async (
    incomeEntryId: string,
    paymentDate: string,
    amount: number
  ) => {
    const oldEntry = incomeRecords.find((r) => r.id === incomeEntryId);
    const oldMonth = oldEntry?.date ? oldEntry.date.substring(0, 7) : '';
    const payMonth = paymentDate ? paymentDate.substring(0, 7) : '';

    if (oldMonth && isMonthClosed(oldMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(oldMonth)} is closed. Reopen the month before making changes.`);
    }
    if (payMonth && payMonth !== oldMonth && isMonthClosed(payMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(payMonth)} is closed. Reopen the month before making changes.`);
    }

    await createIncomePaymentSettlement({
      income_entry_id: incomeEntryId,
      payment_date: paymentDate,
      amount,
    });
    const [updatedIncome, updatedBalances, updatedMonths] = await Promise.all([
      fetchIncomeEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setIncomeRecords(updatedIncome);
    setPartnerBalances(updatedBalances);

    if (payMonth) syncAccountMonthWithLiveTransactions(payMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      updatedIncome,
      expenseRecords,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  // Expense Operations
  const handleAddExpense = async (
    entry: Omit<ExpenseEntryRow, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const expAccMonth = entry.accounting_month
      ? entry.accounting_month.substring(0, 7)
      : entry.expense_date
      ? entry.expense_date.substring(0, 7)
      : '';
    if (expAccMonth && isMonthClosed(expAccMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(expAccMonth)} is closed. Reopen the month before making changes.`);
    }

    await createExpenseEntry(entry);
    const [updatedExpenses, updatedBalances, updatedMonths] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);

    if (expAccMonth) syncAccountMonthWithLiveTransactions(expAccMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      incomeRecords,
      updatedExpenses,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  const handleUpdateExpense = async (
    id: string,
    updates: Partial<ExpenseRecord>
  ) => {
    const oldEntry = expenseRecords.find((r) => r.id === id);
    const oldMonth = oldEntry ? getExpenseAccountingMonth(oldEntry) : '';
    const newEntryMonth = updates.accountingMonth
      ? updates.accountingMonth.substring(0, 7)
      : updates.date
      ? updates.date.substring(0, 7)
      : oldMonth;

    if (oldMonth && isMonthClosed(oldMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(oldMonth)} is closed. Reopen the month before making changes.`);
    }
    if (newEntryMonth && newEntryMonth !== oldMonth && isMonthClosed(newEntryMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(newEntryMonth)} is closed. Reopen the month before making changes.`);
    }

    const rowUpdates: Partial<ExpenseEntryRow> = {};
    if (updates.date !== undefined) rowUpdates.expense_date = updates.date;
    if (updates.accountingMonth !== undefined) rowUpdates.accounting_month = updates.accountingMonth;
    if (updates.accounting_month !== undefined) rowUpdates.accounting_month = updates.accounting_month;
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
    const [updatedExpenses, updatedBalances, updatedMonths] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);

    // Sync both old month and new month if changed
    const newEntry = updatedExpenses.find((r) => r.id === id);
    const newMonth = newEntry ? getExpenseAccountingMonth(newEntry) : oldMonth;
    if (oldMonth) syncAccountMonthWithLiveTransactions(oldMonth).catch(() => {});
    if (newMonth && newMonth !== oldMonth) syncAccountMonthWithLiveTransactions(newMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      incomeRecords,
      updatedExpenses,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  const handleDeleteExpense = async (id: string) => {
    const oldEntry = expenseRecords.find((r) => r.id === id);
    const oldMonth = oldEntry ? getExpenseAccountingMonth(oldEntry) : '';
    if (oldMonth && isMonthClosed(oldMonth, accountMonths)) {
      throw new Error(`${formatPdfMonth(oldMonth)} is closed. Reopen the month before making changes.`);
    }

    await deleteExpenseEntry(id);
    const [updatedExpenses, updatedBalances, updatedMonths] = await Promise.all([
      fetchExpenseEntries(),
      fetchPartnerCurrentBalances(),
      fetchAccountMonths(),
    ]);
    setExpenseRecords(updatedExpenses);
    setPartnerBalances(updatedBalances);

    if (oldMonth) syncAccountMonthWithLiveTransactions(oldMonth).catch(() => {});

    const calculatedSummaries = calculateAllMonthsSummary(
      incomeRecords,
      updatedExpenses,
      updatedMonths,
      partnerSettlements
    );
    setAccountMonths(
      updatedMonths.map((m) => {
        const mKey = m.month_start.substring(0, 7);
        const sum = calculatedSummaries[mKey];
        return sum
          ? {
              ...m,
              total_income: sum.totalIncome,
              total_paid: sum.totalPaid,
              total_balance: sum.totalBalance,
              total_expense: sum.totalExpense,
              closing_balance: sum.closingBalance,
            }
          : m;
      })
    );
  };

  // Partner Settlement & Wallet Operations
  const refreshPartnerData = async () => {
    const [updatedSettlements, updatedBalances, updatedWallet, updatedMonths] = await Promise.all([
      fetchPartnerSettlements(),
      fetchPartnerCurrentBalances(),
      fetchIrshadWalletEntries(),
      fetchAccountMonths(),
    ]);
    setPartnerSettlements(updatedSettlements);
    setPartnerBalances(updatedBalances);
    setWalletEntries(updatedWallet);
    setAccountMonths(updatedMonths);
  };

  const handleAddSettlement = async (
    settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
  ) => {
    await createPartnerSettlement(settlement);
    await refreshPartnerData();
  };

  const handleUpdateSettlement = async (
    id: string,
    settlement: Partial<Omit<PartnerSettlementRow, 'id' | 'created_at'>>
  ) => {
    await updatePartnerSettlement(id, settlement);
    await refreshPartnerData();
  };

  const handleDeleteSettlement = async (id: string) => {
    await deletePartnerSettlement(id);
    await refreshPartnerData();
  };

  const handleSettleWallet = async (monthStart: string, amount: number) => {
    await settleIrshadWallet(monthStart, amount);
    await refreshPartnerData();
  };

  // Month Close / Reopen Operations
  const handleCloseMonth = async (monthStr: string, closingBalance: number) => {
    await closeAccountMonthInDb(monthStr, closingBalance);
    await loadData();
  };

  const handleReopenMonth = async (monthStr: string) => {
    await reopenAccountMonthInDb(monthStr);
    await loadData();
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
      localStorage.removeItem(UNLOCKED_STORAGE_KEY);
      sessionStorage.removeItem(UNLOCKED_STORAGE_KEY);
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, now.toString());
    } catch (e) {
      console.error('Failed to update activity timestamp:', e);
    }
    setIsLocked(false);
  };

  const handleLockApp = () => {
    try {
      localStorage.removeItem(UNLOCKED_STORAGE_KEY);
      sessionStorage.removeItem(UNLOCKED_STORAGE_KEY);
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear unlock state from localStorage:', e);
    }
    setIsLocked(true);
  };

  // If locked (including on any full browser reload/refresh), render the full application lock screen
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
            accountMonths={accountMonths}
            partnerSettlements={partnerSettlements}
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
            accountMonths={accountMonths}
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
            incomeRecords={incomeRecords}
            expenseRecords={expenseRecords}
            accountMonths={accountMonths}
            walletEntries={walletEntries}
            onAddSettlement={handleAddSettlement}
            onUpdateSettlement={handleUpdateSettlement}
            onDeleteSettlement={handleDeleteSettlement}
            onSettleWallet={handleSettleWallet}
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
            onAddSettlement={handleAddSettlement}
            onDeleteSettlement={handleDeleteSettlement}
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

