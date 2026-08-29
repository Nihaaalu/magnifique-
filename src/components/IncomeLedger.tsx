import React, { useState } from 'react';
import { IncomeRecord, ExpenseRecord, Partner, MealType, PaymentStatus, IncomeType } from '../types';
import {
  LedgerPeriodMode,
  DateRange,
  formatDayHeader,
  formatWeekHeader,
  formatMonthHeader,
  getPrevDay,
  getNextDay,
  getWeekRange,
  getPrevWeekDate,
  getNextWeekDate,
  getMonthRange,
  getPrevMonth,
  getNextMonth,
  isDateInRange,
} from '../utils/dateUtils';
import {
  formatCurrency,
  formatDateDisplay,
  getTodayDateString,
} from '../utils/formatters';
import { useSwipeNavigation } from '../utils/useSwipeNavigation';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  X,
} from 'lucide-react';

interface IncomeLedgerProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  partners?: Partner[];
  onDeleteIncome: (id: string) => void | Promise<void>;
  onUpdateIncome?: (id: string, updatedRecord: Partial<IncomeRecord>) => void | Promise<void>;
}

export const IncomeLedger: React.FC<IncomeLedgerProps> = ({
  incomeRecords,
  expenseRecords,
  partners = [],
  onDeleteIncome,
  onUpdateIncome,
}) => {
  const [periodMode, setPeriodMode] = useState<LedgerPeriodMode>('day');
  const [selectedDay, setSelectedDay] = useState<string>(getTodayDateString());
  const [selectedWeekRef, setSelectedWeekRef] = useState<string>(getTodayDateString());

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: getTodayDateString(),
    endDate: getTodayDateString(),
  });
  const [appliedCustomRange, setAppliedCustomRange] = useState<DateRange>({
    startDate: getTodayDateString(),
    endDate: getTodayDateString(),
  });

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<IncomeRecord | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editMeal, setEditMeal] = useState<MealType | null>('Breakfast');
  const [editByWho, setEditByWho] = useState<string>('');
  const [editTravels, setEditTravels] = useState<string>('');
  const [editMembers, setEditMembers] = useState<string>('');
  const [editPrice, setEditPrice] = useState<string>('');
  const [editTotal, setEditTotal] = useState<string>('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatus>('Paid Full');
  const [editAmountPaid, setEditAmountPaid] = useState<string>('');
  const [editBalancePartnerId, setEditBalancePartnerId] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handlePrev = () => {
    if (periodMode === 'day') {
      setSelectedDay((prev) => getPrevDay(prev));
    } else if (periodMode === 'week') {
      setSelectedWeekRef((prev) => getPrevWeekDate(prev));
    } else if (periodMode === 'month') {
      setSelectedMonth((prev) => getPrevMonth(prev.year, prev.month));
    }
  };

  const handleNext = () => {
    if (periodMode === 'day') {
      setSelectedDay((prev) => getNextDay(prev));
    } else if (periodMode === 'week') {
      setSelectedWeekRef((prev) => getNextWeekDate(prev));
    } else if (periodMode === 'month') {
      setSelectedMonth((prev) => getNextMonth(prev.year, prev.month));
    }
  };

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    disabled: periodMode === 'custom',
  });

  let currentRangeTitle = '';
  let filteredIncome: IncomeRecord[] = [];
  let periodTotalIncome = 0;
  let periodTotalExpense = 0;

  if (periodMode === 'day') {
    currentRangeTitle = formatDayHeader(selectedDay);
    filteredIncome = incomeRecords.filter((r) => r.date === selectedDay);
    periodTotalIncome = filteredIncome.reduce((sum, r) => sum + r.total, 0);

    const dayExpenses = expenseRecords.filter((r) => r.date === selectedDay);
    periodTotalExpense = dayExpenses.reduce((sum, r) => sum + r.amount, 0);
  } else if (periodMode === 'week') {
    const weekRange = getWeekRange(selectedWeekRef);
    currentRangeTitle = formatWeekHeader(weekRange.startDate, weekRange.endDate);
    filteredIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, weekRange.startDate, weekRange.endDate)
    );
    periodTotalIncome = filteredIncome.reduce((sum, r) => sum + r.total, 0);

    const weekExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, weekRange.startDate, weekRange.endDate)
    );
    periodTotalExpense = weekExpenses.reduce((sum, r) => sum + r.amount, 0);
  } else if (periodMode === 'month') {
    const monthRange = getMonthRange(selectedMonth.year, selectedMonth.month);
    currentRangeTitle = formatMonthHeader(selectedMonth.year, selectedMonth.month);
    filteredIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, monthRange.startDate, monthRange.endDate)
    );
    periodTotalIncome = filteredIncome.reduce((sum, r) => sum + r.total, 0);

    const monthExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, monthRange.startDate, monthRange.endDate)
    );
    periodTotalExpense = monthExpenses.reduce((sum, r) => sum + r.amount, 0);
  } else {
    currentRangeTitle = `${formatDateDisplay(appliedCustomRange.startDate)} → ${formatDateDisplay(
      appliedCustomRange.endDate
    )}`;
    filteredIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, appliedCustomRange.startDate, appliedCustomRange.endDate)
    );
    periodTotalIncome = filteredIncome.reduce((sum, r) => sum + r.total, 0);

    const customExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, appliedCustomRange.startDate, appliedCustomRange.endDate)
    );
    periodTotalExpense = customExpenses.reduce((sum, r) => sum + r.amount, 0);
  }

  const sortedRecords = [...filteredIncome].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.time || '').localeCompare(a.time || '');
  });

  const groupedByDate = new Map<string, IncomeRecord[]>();
  for (const record of sortedRecords) {
    const existing = groupedByDate.get(record.date) || [];
    existing.push(record);
    groupedByDate.set(record.date, existing);
  }

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRange.startDate > customRange.endDate) {
      setAppliedCustomRange({
        startDate: customRange.endDate,
        endDate: customRange.startDate,
      });
    } else {
      setAppliedCustomRange(customRange);
    }
  };

  const handleOpenEdit = (record: IncomeRecord) => {
    setEditingRecord(record);
    setEditDate(record.date);
    setEditMeal(record.mealType || 'Breakfast');
    setEditByWho(record.byWho || '');
    setEditTravels(record.travels || '');
    setEditMembers(record.membersCount ? String(record.membersCount) : '');
    setEditPrice(record.pricePerMember ? String(record.pricePerMember) : '');
    setEditTotal(String(record.total));
    setEditPaymentStatus(record.paymentStatus);
    setEditAmountPaid(record.amountPaid ? String(record.amountPaid) : '');
    setEditBalancePartnerId(record.balanceAccountPartnerId || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !onUpdateIncome) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      const isAlaCarte = editingRecord.incomeType === 'À La Carte' || editByWho === 'À LA CARTE';
      let totalAmount = 0;
      let memberCount: number | null = null;
      let pricePerMember: number | null = null;

      if (isAlaCarte) {
        totalAmount = parseFloat(editTotal) || 0;
      } else {
        memberCount = parseInt(editMembers, 10) || 0;
        pricePerMember = parseFloat(editPrice) || 0;
        totalAmount = memberCount * pricePerMember;
      }

      let amountReceived = 0;
      let balanceAmount = 0;
      let finalStatus: PaymentStatus = editPaymentStatus;

      if (editPaymentStatus === 'Paid Full') {
        amountReceived = totalAmount;
        balanceAmount = 0;
      } else if (editPaymentStatus === 'Balance') {
        amountReceived = 0;
        balanceAmount = totalAmount;
      } else {
        amountReceived = Math.min(parseFloat(editAmountPaid) || 0, totalAmount);
        balanceAmount = Math.max(0, totalAmount - amountReceived);
      }

      await onUpdateIncome(editingRecord.id, {
        date: editDate,
        mealType: isAlaCarte ? null : editMeal,
        byWho: editByWho,
        travels: editTravels.trim() || undefined,
        membersCount: memberCount || 0,
        pricePerMember: pricePerMember || 0,
        total: totalAmount,
        paymentStatus: finalStatus,
        amountPaid: amountReceived,
        balance: balanceAmount,
        balanceAccountPartnerId: balanceAmount > 0 ? editBalancePartnerId || null : null,
      });

      setEditingRecord(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update income entry.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this income entry from the database?')) {
      return;
    }
    setDeletingId(id);
    try {
      await onDeleteIncome(id);
    } catch (err) {
      console.error('Error deleting income record:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const renderRecordRow = (record: IncomeRecord) => {
    const isAlaCarte = record.incomeType === 'À La Carte' || record.byWho === 'À LA CARTE';
    const isDeleting = deletingId === record.id;

    return (
      <div
        key={record.id}
        className={`py-3 px-3.5 hover:bg-[#1D1D1D]/70 transition-colors flex items-center justify-between gap-3 text-xs ${
          isDeleting ? 'opacity-40 pointer-events-none' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          {/* Top Line: Meal & By Who */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[#D4AF37] uppercase text-[11px] bg-[#1D1D1D] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
              {isAlaCarte ? 'À LA CARTE' : record.mealType || 'Meal'}
            </span>
            <span className="text-[#777777]">•</span>
            <span className="font-bold text-[#F5F5F5]">
              {record.byWho}
            </span>
            {!isAlaCarte && record.membersCount > 0 && (
              <span className="text-[#B8B8B8] font-medium">
                · {record.membersCount} PAX
              </span>
            )}
            {record.travels && (
              <span className="text-[#777777] truncate">
                · {record.travels}
              </span>
            )}
          </div>

          {/* Bottom Line: Payment breakdown */}
          <div className="flex items-center gap-2 text-[11px] mt-1 text-[#B8B8B8] flex-wrap">
            {record.paymentStatus === 'Paid Full' ? (
              <span className="text-[#4ade80] font-bold bg-[#142416] px-1.5 py-0.5 rounded border border-[#22543d]">
                Paid Full
              </span>
            ) : (
              <>
                {record.paymentStatus === 'Paid Partially' && (
                  <span className="text-[#D4AF37] font-semibold">
                    Received {formatCurrency(record.amountPaid)}
                  </span>
                )}
                <span className="text-[#f87171] font-bold bg-[#201212] px-1.5 py-0.5 rounded border border-[#3d1d1d]">
                  Balance {formatCurrency(record.balance)}
                </span>
                {(record.balanceAccountPartnerName || record.balanceAccountPartnerId) && (
                  <span className="text-[#777777] font-medium">
                    (Balance Account: <strong className="text-[#D0D0D0]">{record.balanceAccountPartnerName || 'Partner'}</strong>)
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right side: Amount and Edit/Delete Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right mr-1">
            <div className="font-black text-[#F2C94C] text-sm sm:text-base">
              {formatCurrency(record.total)}
            </div>
          </div>
          {onUpdateIncome && (
            <button
              type="button"
              onClick={() => handleOpenEdit(record)}
              className="p-1.5 text-[#777777] hover:text-[#D4AF37] transition-colors cursor-pointer rounded hover:bg-[#1D1D1D]"
              title="Edit entry"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDelete(record.id)}
            className="p-1.5 text-[#777777] hover:text-[#f87171] transition-colors cursor-pointer rounded hover:bg-[#201212]"
            title="Delete entry"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="bg-[#171717] rounded-xl border border-[#2A2A2A] overflow-hidden shadow-md"
      id="income-ledger-container"
      {...swipeHandlers}
    >
      {/* Period Selection Controls */}
      <div className="p-3 sm:p-3.5 border-b border-[#2A2A2A] bg-[#111111] space-y-2.5">
        {/* Segmented Control */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0A0A0A] rounded-lg border border-[#2A2A2A]" id="income-period-selector">
          {(
            [
              { id: 'day', label: 'Day' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'custom', label: 'Custom' },
            ] as { id: LedgerPeriodMode; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              id={`income-period-${item.id}`}
              onClick={() => setPeriodMode(item.id)}
              className={`py-1.5 text-xs rounded-md font-bold transition-all cursor-pointer text-center min-h-[34px] ${
                periodMode === item.id
                  ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                  : 'text-[#B8B8B8] hover:text-[#F5F5F5] hover:bg-[#171717]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Date Navigator Header (Day/Week/Month) */}
        {periodMode !== 'custom' && (
          <div className="flex items-center justify-between gap-2 pt-0.5" id="income-period-navigator">
            <button
              type="button"
              id="income-prev-btn"
              onClick={handlePrev}
              className="p-1.5 text-[#B8B8B8] hover:text-[#F5F5F5] hover:bg-[#1D1D1D] rounded-md transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-extrabold text-xs sm:text-sm text-[#F5F5F5] text-center tracking-wide">
              {currentRangeTitle}
            </span>

            <button
              type="button"
              id="income-next-btn"
              onClick={handleNext}
              className="p-1.5 text-[#B8B8B8] hover:text-[#F5F5F5] hover:bg-[#1D1D1D] rounded-md transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Custom Range Picker */}
        {periodMode === 'custom' && (
          <form
            onSubmit={handleApplyCustomRange}
            className="flex items-end gap-2 pt-1 flex-wrap"
            id="income-custom-range-form"
          >
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] text-[#777777] mb-1 font-semibold">
                Start Date
              </label>
              <input
                type="date"
                id="income-custom-start"
                value={customRange.startDate}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="w-full px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                required
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] text-[#777777] mb-1 font-semibold">
                End Date
              </label>
              <input
                type="date"
                id="income-custom-end"
                value={customRange.endDate}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="w-full px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                required
              />
            </div>
            <button
              type="submit"
              id="income-apply-custom-btn"
              className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] rounded text-xs font-black transition-colors cursor-pointer min-h-[34px]"
            >
              Apply
            </button>
          </form>
        )}
      </div>

      {/* Summary Stat Bar: High Contrast, Clean Minimal Structure */}
      <div className="p-3 bg-[#111111] border-b border-[#2A2A2A] grid grid-cols-3 gap-2 text-center text-xs" id="income-ledger-summary-bar">
        <div className="p-2 bg-[#171717] rounded-lg border border-[#2A2A2A]">
          <span className="text-[10px] text-[#777777] font-semibold block">Total Income</span>
          <span className="font-black text-[#4ade80] text-xs sm:text-sm">
            {formatCurrency(periodTotalIncome)}
          </span>
        </div>
        <div className="p-2 bg-[#171717] rounded-lg border border-[#2A2A2A]">
          <span className="text-[10px] text-[#777777] font-semibold block">Total Expense</span>
          <span className="font-black text-[#f87171] text-xs sm:text-sm">
            {formatCurrency(periodTotalExpense)}
          </span>
        </div>
        <div className="p-2 bg-[#171717] rounded-lg border border-[#2A2A2A]">
          <span className="text-[10px] text-[#777777] font-semibold block">Net Period</span>
          <span
            className={`font-black text-xs sm:text-sm ${
              periodTotalIncome - periodTotalExpense >= 0
                ? 'text-[#F2C94C]'
                : 'text-[#f87171]'
            }`}
          >
            {formatCurrency(periodTotalIncome - periodTotalExpense)}
          </span>
        </div>
      </div>

      {/* List of Entries */}
      <div className="divide-y divide-[#2A2A2A]" id="income-records-list">
        {sortedRecords.length === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium">
            No income records found for this period.
          </div>
        ) : (
          sortedRecords.map((record) => renderRecordRow(record))
        )}
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-md w-full p-4 sm:p-5 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <h3 className="text-sm font-bold text-[#F5F5F5]">
                Edit Income Entry
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1 text-[#777777] hover:text-[#F5F5F5] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">By Who</label>
                  <input
                    type="text"
                    value={editByWho}
                    onChange={(e) => setEditByWho(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    required
                  />
                </div>
              </div>

              {editingRecord.incomeType !== 'À La Carte' && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Meal</label>
                    <select
                      value={editMeal || 'Breakfast'}
                      onChange={(e) => setEditMeal(e.target.value as MealType)}
                      className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    >
                      <option value="Breakfast">Breakfast</option>
                      <option value="Lunch">Lunch</option>
                      <option value="Dinner">Dinner</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Members</label>
                    <input
                      type="number"
                      value={editMembers}
                      onChange={(e) => setEditMembers(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Price</label>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              {editingRecord.incomeType === 'À La Carte' && (
                <div>
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Total Amount (₹)</label>
                  <input
                    type="number"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Travels (Optional)</label>
                <input
                  type="text"
                  value={editTravels}
                  onChange={(e) => setEditTravels(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Payment Status</label>
                <select
                  value={editPaymentStatus}
                  onChange={(e) => setEditPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="Paid Full">Paid Full</option>
                  <option value="Paid Partially">Paid Partially</option>
                  <option value="Balance">Balance</option>
                </select>
              </div>

              {editPaymentStatus === 'Paid Partially' && (
                <div>
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Amount Received (₹)</label>
                  <input
                    type="number"
                    value={editAmountPaid}
                    onChange={(e) => setEditAmountPaid(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    required
                  />
                </div>
              )}

              {editPaymentStatus !== 'Paid Full' && partners.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Balance Account Partner</label>
                  <select
                    value={editBalancePartnerId}
                    onChange={(e) => setEditBalancePartnerId(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="">-- Select Partner --</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-1.5 bg-[#111111] text-[#B8B8B8] hover:text-[#F5F5F5] rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] rounded text-xs font-black"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
