import React, { useState, useMemo, useEffect } from 'react';
import {
  IncomeRecord,
  ExpenseRecord,
  PartnerSettlement,
  Partner,
  SettlementType,
  PartnerSettlementRow,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
  formatDateDisplay,
} from '../utils/formatters';
import {
  isIncomeAssignedToPartner,
  isExpensePaidByPartner,
  isSettlementForPartner,
  getSettlementDirection,
} from '../utils/partnerBalanceUtils';
import { formatPdfMonth } from '../services/pdfReportGenerator';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Loader2,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface IrshadDetailsPageProps {
  initialMonth?: string;
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  partnerSettlements: PartnerSettlement[];
  partners: Partner[];
  onBack: () => void;
  onAddSettlement: (
    settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
  ) => Promise<void>;
  onDeleteSettlement?: (id: string) => Promise<void>;
}

interface MonthData {
  monthKey: string; // e.g. '2026-09'
  monthLabel: string; // e.g. 'September 2026'
  totalBalance: number;
  totalExpense: number;
  irshadToHotel: number;
  settledThisMonth: number;
  remainingOutstanding: number;
  settlements: PartnerSettlement[];
}

export const IrshadDetailsPage: React.FC<IrshadDetailsPageProps> = ({
  initialMonth,
  incomeRecords,
  expenseRecords,
  partnerSettlements,
  partners,
  onBack,
  onAddSettlement,
  onDeleteSettlement,
}) => {
  // Find Irshad partner
  const irshadPartner = useMemo(() => {
    return (
      partners.find((p) => p.name.trim().toUpperCase() === 'IRSHAD') || {
        id: '2',
        name: 'IRSHAD',
        active: true,
        display_order: 2,
      }
    );
  }, [partners]);

  // Find all unique months that actually have relevant IRSHAD data
  const availableIrshadMonths = useMemo(() => {
    const monthSet = new Set<string>();

    incomeRecords.forEach((r) => {
      if (
        r.date &&
        r.date.length >= 7 &&
        isIncomeAssignedToPartner(r, 'IRSHAD', irshadPartner.id)
      ) {
        monthSet.add(r.date.substring(0, 7));
      }
    });

    expenseRecords.forEach((r) => {
      if (
        r.date &&
        r.date.length >= 7 &&
        isExpensePaidByPartner(r, 'IRSHAD', irshadPartner.id)
      ) {
        monthSet.add(r.date.substring(0, 7));
      }
    });

    partnerSettlements.forEach((s) => {
      if (isSettlementForPartner(s, 'IRSHAD', irshadPartner.id)) {
        if (s.settlementMonth && s.settlementMonth.length >= 7) {
          monthSet.add(s.settlementMonth.substring(0, 7));
        } else if (s.date && s.date.length >= 7) {
          monthSet.add(s.date.substring(0, 7));
        }
      }
    });

    return Array.from(monthSet).sort((a, b) => a.localeCompare(b));
  }, [incomeRecords, expenseRecords, partnerSettlements, irshadPartner.id]);

  // Selected Month State (defaults to initialMonth or latest available month)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (initialMonth && availableIrshadMonths.includes(initialMonth)) {
      return initialMonth;
    }
    return availableIrshadMonths.length > 0
      ? availableIrshadMonths[availableIrshadMonths.length - 1]
      : '2026-09';
  });

  // Automatically synchronize selectedMonth when availableIrshadMonths load
  useEffect(() => {
    if (availableIrshadMonths.length > 0 && !availableIrshadMonths.includes(selectedMonth)) {
      setSelectedMonth(availableIrshadMonths[availableIrshadMonths.length - 1]);
    }
  }, [availableIrshadMonths, selectedMonth]);

  // Calculate detailed data for each available month
  const monthlyDataMap = useMemo(() => {
    const map = new Map<string, MonthData>();

    availableIrshadMonths.forEach((m) => {
      const mIncome = incomeRecords.filter(
        (r) =>
          r.date &&
          r.date.startsWith(m) &&
          isIncomeAssignedToPartner(r, 'IRSHAD', irshadPartner.id)
      );

      const mExpense = expenseRecords.filter(
        (r) =>
          r.date &&
          r.date.startsWith(m) &&
          isExpensePaidByPartner(r, 'IRSHAD', irshadPartner.id)
      );

      const totalBalance = mIncome.reduce((sum, r) => {
        const bal = Number(r.balance) || 0;
        return sum + (bal > 0 ? bal : 0);
      }, 0);

      const totalExpense = mExpense.reduce((sum, r) => {
        return sum + (Number(r.amount) || 0);
      }, 0);

      const irshadToHotel = totalBalance - totalExpense;

      // Settlements explicitly assigned to this settlement_month or dated in this month
      const mSettlements = partnerSettlements.filter((s) => {
        if (!isSettlementForPartner(s, 'IRSHAD', irshadPartner.id)) return false;
        const sMonth = s.settlementMonth
          ? s.settlementMonth.substring(0, 7)
          : s.date
          ? s.date.substring(0, 7)
          : '';
        return sMonth === m;
      });

      const settledToHotel = mSettlements
        .filter((s) => getSettlementDirection(s) === 'to_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      const settledFromHotel = mSettlements
        .filter((s) => getSettlementDirection(s) === 'from_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      const settledThisMonth = settledToHotel - settledFromHotel;
      const remainingOutstanding = Math.max(0, irshadToHotel - settledThisMonth);

      map.set(m, {
        monthKey: m,
        monthLabel: formatPdfMonth(m),
        totalBalance,
        totalExpense,
        irshadToHotel,
        settledThisMonth,
        remainingOutstanding,
        settlements: mSettlements,
      });
    });

    return map;
  }, [availableIrshadMonths, incomeRecords, expenseRecords, partnerSettlements, irshadPartner.id]);

  // Total Outstanding across ALL available months
  const totalOutstandingAllMonths = useMemo(() => {
    let total = 0;
    monthlyDataMap.forEach((data) => {
      total += data.remainingOutstanding;
    });
    return total;
  }, [monthlyDataMap]);

  // Active month data
  const currentMonthData = useMemo(() => {
    return (
      monthlyDataMap.get(selectedMonth) || {
        monthKey: selectedMonth,
        monthLabel: formatPdfMonth(selectedMonth),
        totalBalance: 0,
        totalExpense: 0,
        irshadToHotel: 0,
        settledThisMonth: 0,
        remainingOutstanding: 0,
        settlements: [],
      }
    );
  }, [monthlyDataMap, selectedMonth]);

  // Settle Modal State (Starts strictly EMPTY)
  const [isSettleModalOpen, setIsSettleModalOpen] = useState<boolean>(false);
  const [modalTargetMonth, setModalTargetMonth] = useState<string>(selectedMonth);
  const [settlementAmount, setSettlementAmount] = useState<string>(''); // strictly empty initially
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Settlement Modal State
  const [deleteSettlementId, setDeleteSettlementId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Feedback Notification
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Open Settle Modal for a given month
  const handleOpenSettleModal = (monthKey: string) => {
    setModalTargetMonth(monthKey);
    setSettlementAmount(''); // STRICTLY EMPTY
    setSettlementDate(getTodayDateString());
    setSettlementNotes('');
    setValidationError(null);
    setIsSettleModalOpen(true);
  };

  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(settlementAmount);
    const targetData = monthlyDataMap.get(modalTargetMonth);
    const maxAllowed = targetData ? targetData.remainingOutstanding : 0;

    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      setValidationError('Please enter a valid settlement amount greater than 0.');
      return;
    }

    if (amountNum > maxAllowed) {
      setValidationError(
        `Amount cannot exceed the remaining outstanding of ${formatCurrency(maxAllowed)} for ${formatPdfMonth(modalTargetMonth)}.`
      );
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);
    try {
      await onAddSettlement({
        partner_id: irshadPartner.id || '2',
        settlement_date: settlementDate || getTodayDateString(),
        settlement_type: 'balance_to_hotel',
        amount: amountNum,
        notes: settlementNotes.trim().toUpperCase() || null,
        settlement_month: `${modalTargetMonth}-01`,
      });

      setFeedbackMsg(
        `Recorded settlement of ${formatCurrency(amountNum)} for ${formatPdfMonth(modalTargetMonth)}.`
      );
      setIsSettleModalOpen(false);
      setSettlementAmount('');
      setSettlementNotes('');
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error saving settlement:', err);
      setValidationError(err.message || 'Failed to save settlement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteSettlementId || !onDeleteSettlement) return;
    setIsDeleting(true);
    try {
      await onDeleteSettlement(deleteSettlementId);
      setFeedbackMsg('Settlement removed successfully.');
      setDeleteSettlementId(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error deleting settlement:', err);
      setFeedbackMsg(`Failed to delete settlement: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Month navigation helpers
  const currentMonthIndex = availableIrshadMonths.indexOf(selectedMonth);

  const handlePrevMonth = () => {
    if (currentMonthIndex > 0) {
      setSelectedMonth(availableIrshadMonths[currentMonthIndex - 1]);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIndex < availableIrshadMonths.length - 1) {
      setSelectedMonth(availableIrshadMonths[currentMonthIndex + 1]);
    }
  };

  return (
    <div id="irshad-details-page" className="space-y-5 pb-16 animate-fadeIn">
      {/* Top Bar with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2A2A2A] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="btn-back-to-partner"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#171717] hover:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
            <span>BACK TO PARTNER</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              <h1 className="text-base sm:text-lg font-black text-[#F5F5F5] tracking-wide uppercase">
                IRSHAD DETAILS
              </h1>
            </div>
            <p className="text-[11px] text-[#777777] font-medium">
              Monthly outstanding balance and settlement history
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-3 py-1 rounded-md border border-[#2A2A2A]">
            {availableIrshadMonths.length} Months with Data
          </span>
        </div>
      </div>

      {/* Temporary Feedback Notification */}
      {feedbackMsg && (
        <div className="p-3 bg-[#171717] border border-[#D4AF37]/60 text-[#D4AF37] rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* ==================================================
          SECTION 8: HORIZONTAL MONTH SCROLLER
          ================================================== */}
      {availableIrshadMonths.length === 0 ? (
        <div className="p-8 bg-[#171717] border border-[#2A2A2A] rounded-xl text-center text-xs text-[#777777]">
          No recorded accounts found for IRSHAD.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#777777] uppercase tracking-wider px-1">
            <span>Select Accounting Month</span>
            <span>
              {currentMonthIndex + 1} of {availableIrshadMonths.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={currentMonthIndex <= 0}
              className={`p-2 bg-[#171717] border border-[#2A2A2A] rounded-lg transition-colors cursor-pointer shrink-0 ${
                currentMonthIndex <= 0
                  ? 'opacity-25 cursor-not-allowed text-[#555555]'
                  : 'text-[#D4AF37] hover:bg-[#222222]'
              }`}
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Scrollable Month Pills */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1 no-scrollbar scroll-smooth">
              {availableIrshadMonths.map((m) => {
                const isActive = m === selectedMonth;
                const mData = monthlyDataMap.get(m);
                const hasOutstanding = mData && mData.remainingOutstanding > 0;

                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMonth(m)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer shrink-0 border flex items-center gap-2 ${
                      isActive
                        ? 'bg-[#D4AF37] text-[#0A0A0A] border-[#D4AF37] font-black shadow-md'
                        : 'bg-[#171717] hover:bg-[#202020] text-[#B8B8B8] hover:text-[#F5F5F5] border-[#2A2A2A]'
                    }`}
                  >
                    <span>{formatPdfMonth(m)}</span>
                    {hasOutstanding && (
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isActive ? 'bg-[#0A0A0A]' : 'bg-[#fb923c]'
                        }`}
                        title="Has outstanding balance"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={currentMonthIndex >= availableIrshadMonths.length - 1}
              className={`p-2 bg-[#171717] border border-[#2A2A2A] rounded-lg transition-colors cursor-pointer shrink-0 ${
                currentMonthIndex >= availableIrshadMonths.length - 1
                  ? 'opacity-25 cursor-not-allowed text-[#555555]'
                  : 'text-[#D4AF37] hover:bg-[#222222]'
              }`}
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================
          SECTION 7: ACTIVE MONTH IRSHAD CARD
          ================================================== */}
      {availableIrshadMonths.length > 0 && (
        <section className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-4 sm:p-5 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2A2A2A]">
            <div>
              <span className="text-[10px] text-[#D4AF37] font-black tracking-wider uppercase block">
                MONTHLY BREAKDOWN
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#F5F5F5] tracking-wide uppercase">
                IRSHAD {currentMonthData.monthLabel.toUpperCase()} OUTSTANDING
              </h2>
            </div>

            <button
              type="button"
              id="btn-settle-active-month"
              onClick={() => handleOpenSettleModal(currentMonthData.monthKey)}
              disabled={currentMonthData.remainingOutstanding <= 0}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0 ${
                currentMonthData.remainingOutstanding > 0
                  ? 'bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] cursor-pointer'
                  : 'bg-[#111111] text-[#555555] border border-[#2A2A2A] cursor-not-allowed opacity-50'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>SETTLE</span>
            </button>
          </div>

          {/* 5 Calculation Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            {/* 1. IRSHAD TOTAL BALANCE */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#fb923c] font-bold block uppercase tracking-wider">
                IRSHAD TOTAL BALANCE
              </span>
              <span className="text-sm sm:text-base font-black text-[#F5F5F5] block">
                {formatCurrency(currentMonthData.totalBalance)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Assigned receivables
              </span>
            </div>

            {/* 2. IRSHAD TOTAL EXPENSE */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#f87171] font-bold block uppercase tracking-wider">
                IRSHAD TOTAL EXPENSE
              </span>
              <span className="text-sm sm:text-base font-black text-[#f87171] block">
                {formatCurrency(currentMonthData.totalExpense)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Paid by Irshad
              </span>
            </div>

            {/* 3. IRSHAD TO HOTEL */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#B8B8B8] font-bold block uppercase tracking-wider">
                IRSHAD TO HOTEL
              </span>
              <span className="text-sm sm:text-base font-black text-[#F5F5F5] block">
                {formatCurrency(currentMonthData.irshadToHotel)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Balance − Expense
              </span>
            </div>

            {/* 4. SETTLED FOR THIS MONTH */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#38bdf8] font-bold block uppercase tracking-wider">
                SETTLED FOR THIS MONTH
              </span>
              <span className="text-sm sm:text-base font-black text-[#38bdf8] block">
                {formatCurrency(currentMonthData.settledThisMonth)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Recorded payments
              </span>
            </div>

            {/* 5. REMAINING OUTSTANDING */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#D4AF37]/50 space-y-1 shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[10px] text-[#D4AF37] font-bold block uppercase tracking-wider">
                REMAINING OUTSTANDING
              </span>
              <span className="text-sm sm:text-base font-black text-[#F2C94C] block">
                {formatCurrency(currentMonthData.remainingOutstanding)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Net remaining due
              </span>
            </div>
          </div>

          {/* ==================================================
              SECTION 12: SETTLEMENT HISTORY FOR THIS MONTH
              ================================================== */}
          <div className="space-y-2 pt-3 border-t border-[#2A2A2A]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#F5F5F5] uppercase tracking-wide">
                Settlement History for {currentMonthData.monthLabel}
              </span>
              <span className="text-[10px] text-[#777777]">
                {currentMonthData.settlements.length} payment(s) applied
              </span>
            </div>

            {currentMonthData.settlements.length === 0 ? (
              <div className="p-4 bg-[#111111] rounded-lg border border-[#2A2A2A] text-center text-xs text-[#777777]">
                No settlements recorded for {currentMonthData.monthLabel} yet. Click "SETTLE" above to apply a payment.
              </div>
            ) : (
              <div className="space-y-2">
                {currentMonthData.settlements.map((s) => {
                  const isToHotel = getSettlementDirection(s) === 'to_hotel';
                  return (
                    <div
                      key={s.id}
                      className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#D4AF37]/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-[#F5F5F5]">
                            {formatDateDisplay(s.date)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isToHotel
                                ? 'bg-[#1f2937] text-[#38bdf8] border border-[#374151]'
                                : 'bg-[#14231b] text-[#4ade80] border border-[#1b3b28]'
                            }`}
                          >
                            {isToHotel ? 'TO HOTEL' : 'FROM HOTEL'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#B8B8B8] font-medium">
                          {s.notes || <span className="text-[#555555] italic">No note provided</span>}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#222222]">
                        <span className="text-sm sm:text-base font-black text-[#F2C94C]">
                          {formatCurrency(s.amount)}
                        </span>
                        {onDeleteSettlement && (
                          <button
                            type="button"
                            onClick={() => setDeleteSettlementId(s.id)}
                            className="p-1.5 text-[#777777] hover:text-[#f87171] hover:bg-[#201212] rounded transition-colors cursor-pointer"
                            title="Delete this settlement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ==================================================
          SECTION 9: TOTAL OUTSTANDING (ACROSS ALL MONTHS)
          ================================================== */}
      <section
        id="section-total-outstanding"
        className="p-4 sm:p-5 bg-gradient-to-r from-[#171717] to-[#1e1710] rounded-xl border border-[#D4AF37]/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="space-y-1">
          <span className="text-[10px] font-black tracking-wider uppercase text-[#B8B8B8] block">
            CONSOLIDATED POSITION ACROSS ALL MONTHS
          </span>
          <h3 className="text-sm sm:text-base font-black text-[#F5F5F5] uppercase tracking-wide">
            TOTAL OUTSTANDING
          </h3>
          <p className="text-[11px] text-[#888888] font-medium">
            Sum of all remaining IRSHAD outstanding balances across all active accounting months
          </p>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <span className="text-xl sm:text-2xl font-black text-[#F2C94C] block tracking-wide">
            {formatCurrency(totalOutstandingAllMonths)}
          </span>
          <span className="text-[10px] text-[#777777] uppercase font-bold block">
            Across {availableIrshadMonths.length} accounting months
          </span>
        </div>
      </section>

      {/* ==================================================
          MODAL: SETTLE FOR MONTH (INPUT STARTS STRICTLY EMPTY)
          ================================================== */}
      {isSettleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-[#171717] border border-[#2A2A2A] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div>
                <h3 className="text-sm font-extrabold text-[#F5F5F5] tracking-wide">
                  Record Settlement for {formatPdfMonth(modalTargetMonth)}
                </h3>
                <span className="text-[11px] text-[#D4AF37]">
                  Remaining Outstanding:{' '}
                  {formatCurrency(
                    monthlyDataMap.get(modalTargetMonth)?.remainingOutstanding || 0
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSettleModalOpen(false)}
                className="p-1 text-[#777777] hover:text-[#F5F5F5] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {validationError && (
              <div className="p-2.5 bg-[#201212] border border-[#f87171]/50 text-[#f87171] rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSettle} className="space-y-3.5">
              {/* Settlement Amount - STRICTLY EMPTY INITIALLY */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Settlement Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-[#777777] font-bold">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Enter settlement amount"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    autoFocus
                  />
                </div>
                <span className="text-[10px] text-[#777777]">
                  Must be greater than 0 and less than or equal to{' '}
                  {formatCurrency(
                    monthlyDataMap.get(modalTargetMonth)?.remainingOutstanding || 0
                  )}
                </span>
              </div>

              {/* Target Accounting Month */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Accounting Month (Settles this month's balance) *
                </label>
                <select
                  value={modalTargetMonth}
                  onChange={(e) => setModalTargetMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#D4AF37] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                >
                  {availableIrshadMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatPdfMonth(m)} (Outstanding: {formatCurrency(monthlyDataMap.get(m)?.remainingOutstanding || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Settlement Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Payment / Settlement Date *
                </label>
                <input
                  type="date"
                  required
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Notes / Particulars (e.g. BHUVAN STORE, UPI, Cheque)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BHUVAN STORE & MD GPAY"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-medium text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] text-[10px] text-[#888888]">
                Applying to settlement month:{' '}
                <strong className="text-[#D4AF37]">
                  {formatPdfMonth(modalTargetMonth)}
                </strong>
                . This reduces {formatPdfMonth(modalTargetMonth)} outstanding without creating income/expense records.
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="px-3.5 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <span>Confirm Settlement</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          MODAL: CONFIRM DELETE SETTLEMENT
          ================================================== */}
      {deleteSettlementId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-[#171717] border border-[#2A2A2A] rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-[#f87171]">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-extrabold text-[#F5F5F5]">Delete Settlement?</h3>
            </div>
            <p className="text-xs text-[#B8B8B8]">
              Are you sure you want to remove this settlement entry? This will restore the monthly outstanding balance calculation.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setDeleteSettlementId(null)}
                className="px-3.5 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-[#201212] hover:bg-[#3d1d1d] border border-[#f87171]/50 text-[#f87171] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
