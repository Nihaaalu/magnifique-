import React, { useState } from 'react';
import { ExpenseRecord, IncomeRecord, Partner, ExpenseCategory } from '../types';
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

interface ExpenseLedgerProps {
  expenseRecords: ExpenseRecord[];
  incomeRecords: IncomeRecord[];
  partners?: Partner[];
  onDeleteExpense: (id: string) => void | Promise<void>;
  onUpdateExpense?: (id: string, updatedRecord: Partial<ExpenseRecord>) => void | Promise<void>;
}

export const ExpenseLedger: React.FC<ExpenseLedgerProps> = ({
  expenseRecords,
  incomeRecords,
  partners = [],
  onDeleteExpense,
  onUpdateExpense,
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
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('Groceries');
  const [editName, setEditName] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPaidBy, setEditPaidBy] = useState<string>('Hotel');
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
  let filteredExpenses: ExpenseRecord[] = [];
  let periodTotalExpense = 0;
  let periodTotalIncome = 0;

  if (periodMode === 'day') {
    currentRangeTitle = formatDayHeader(selectedDay);
    filteredExpenses = expenseRecords.filter((r) => r.date === selectedDay);
    periodTotalExpense = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);

    const dayIncome = incomeRecords.filter((r) => r.date === selectedDay);
    periodTotalIncome = dayIncome.reduce((sum, r) => sum + r.total, 0);
  } else if (periodMode === 'week') {
    const weekRange = getWeekRange(selectedWeekRef);
    currentRangeTitle = formatWeekHeader(weekRange.startDate, weekRange.endDate);
    filteredExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, weekRange.startDate, weekRange.endDate)
    );
    periodTotalExpense = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);

    const weekIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, weekRange.startDate, weekRange.endDate)
    );
    periodTotalIncome = weekIncome.reduce((sum, r) => sum + r.total, 0);
  } else if (periodMode === 'month') {
    const monthRange = getMonthRange(selectedMonth.year, selectedMonth.month);
    currentRangeTitle = formatMonthHeader(selectedMonth.year, selectedMonth.month);
    filteredExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, monthRange.startDate, monthRange.endDate)
    );
    periodTotalExpense = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);

    const monthIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, monthRange.startDate, monthRange.endDate)
    );
    periodTotalIncome = monthIncome.reduce((sum, r) => sum + r.total, 0);
  } else {
    currentRangeTitle = `${formatDateDisplay(appliedCustomRange.startDate)} → ${formatDateDisplay(
      appliedCustomRange.endDate
    )}`;
    filteredExpenses = expenseRecords.filter((r) =>
      isDateInRange(r.date, appliedCustomRange.startDate, appliedCustomRange.endDate)
    );
    periodTotalExpense = filteredExpenses.reduce((sum, r) => sum + r.amount, 0);

    const customIncome = incomeRecords.filter((r) =>
      isDateInRange(r.date, appliedCustomRange.startDate, appliedCustomRange.endDate)
    );
    periodTotalIncome = customIncome.reduce((sum, r) => sum + r.total, 0);
  }

  const sortedRecords = [...filteredExpenses].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return (b.time || '').localeCompare(a.time || '');
  });

  const groupedByDate = new Map<string, ExpenseRecord[]>();
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

  const handleOpenEdit = (record: ExpenseRecord) => {
    setEditingRecord(record);
    setEditDate(record.date);
    setEditCategory(record.category);
    setEditName(record.description || record.name || '');
    setEditAmount(String(record.amount));
    setEditPaidBy(record.paidBy);
    setEditError(null);
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingRecord || !onUpdateExpense) return;
    setEditSubmitting(true);
    setEditError(null);

    try {
      const parsedAmount = parseFloat(editAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setEditError('Please enter a valid expense amount.');
        setEditSubmitting(false);
        return;
      }

      const matchedPartner = partners.find(
        (p) => p.name.toLowerCase() === editPaidBy.toLowerCase()
      );

      await onUpdateExpense(editingRecord.id, {
        date: editDate,
        category: editCategory,
        description: editName.trim() || null,
        name: editName.trim() || undefined,
        amount: parsedAmount,
        paidBy: editPaidBy as any,
        paidByPartnerId: matchedPartner ? matchedPartner.id : null,
      });

      setEditingRecord(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update expense entry.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense entry from the database?')) {
      return;
    }
    setDeletingId(id);
    try {
      await onDeleteExpense(id);
    } catch (err) {
      console.error('Error deleting expense record:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const renderExpenseRow = (record: ExpenseRecord) => {
    const isDeleting = deletingId === record.id;
    const mainTitle = record.description || record.name || record.category;

    return (
      <div
        key={record.id}
        className={`py-3 px-3.5 hover:bg-[#1D1D1D]/70 transition-colors flex items-center justify-between gap-3 text-xs ${
          isDeleting ? 'opacity-40 pointer-events-none' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          {/* Top Line: Description or Category */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[#F5F5F5] text-xs truncate">
              {mainTitle}
            </span>
            {(record.description || record.name) && (
              <span className="font-semibold text-[#D4AF37] uppercase text-[10px] bg-[#1D1D1D] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                {record.category}
              </span>
            )}
          </div>

          {/* Bottom Line: Paid By & Time */}
          <div className="flex items-center gap-2 text-[11px] mt-1 text-[#B8B8B8] flex-wrap">
            <span>
              Paid by: <strong className="text-[#F5F5F5] font-bold bg-[#111111] px-1.5 py-0.5 rounded border border-[#2A2A2A]">{record.paidBy}</strong>
            </span>
            {record.time && (
              <>
                <span className="text-[#777777]">•</span>
                <span className="text-[#777777] font-medium">{record.time}</span>
              </>
            )}
          </div>
        </div>

        {/* Right side: Amount & Edit/Delete */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right font-black text-[#f87171] text-sm sm:text-base mr-1">
            {formatCurrency(record.amount)}
          </div>
          {onUpdateExpense && (
            <button
              type="button"
              onClick={() => handleOpenEdit(record)}
              className="p-1.5 text-[#777777] hover:text-[#D4AF37] transition-colors cursor-pointer rounded hover:bg-[#1D1D1D]"
              title="Edit expense"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDelete(record.id)}
            className="p-1.5 text-[#777777] hover:text-[#f87171] transition-colors cursor-pointer rounded hover:bg-[#201212]"
            title="Delete expense"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="bg-[#171717] rounded-xl border border-[#2A2A2A] overflow-hidden shadow-md"
      id="expense-ledger-container"
      {...swipeHandlers}
    >
      {/* Period Selection Controls */}
      <div className="p-3 sm:p-3.5 border-b border-[#2A2A2A] bg-[#111111] space-y-2.5">
        {/* Segmented Control */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0A0A0A] rounded-lg border border-[#2A2A2A]" id="expense-period-selector">
          {(
            [
              { id: 'day', label: 'Day' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'custom', label: 'Custom' },
            ] as { id: LedgerPeriodMode; label: string }[]
          ).map((mode) => {
            const isSelected = periodMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                id={`expense-period-${mode.id}`}
                onClick={() => setPeriodMode(mode.id)}
                className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer text-center min-h-[36px] uppercase tracking-wide ${
                  isSelected
                    ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                    : 'bg-transparent text-[#B8B8B8] hover:text-[#F5F5F5] hover:bg-[#171717]'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Navigation row with Outlined Navigation Buttons */}
        {periodMode !== 'custom' ? (
          <div className="flex items-center justify-between pt-0.5">
            <button
              type="button"
              id="expense-prev-btn"
              onClick={handlePrev}
              className="p-1.5 px-3 rounded-lg border border-[#2A2A2A] bg-[#171717] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] flex items-center justify-center transition-colors cursor-pointer min-h-[36px]"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-black text-[#F5F5F5] tracking-tight text-center px-2">
              {currentRangeTitle}
            </span>

            <button
              type="button"
              id="expense-next-btn"
              onClick={handleNext}
              className="p-1.5 px-3 rounded-lg border border-[#2A2A2A] bg-[#171717] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] flex items-center justify-center transition-colors cursor-pointer min-h-[36px]"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleApplyCustomRange}
            className="flex items-center justify-between gap-1.5 pt-0.5"
            id="expense-custom-range-form"
          >
            <input
              type="date"
              id="expense-custom-from-date"
              value={customRange.startDate}
              onChange={(e) =>
                setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] flex-1 min-w-0 focus:outline-none focus:border-[#D4AF37]"
              required
            />
            <span className="text-xs text-[#777777] font-bold">→</span>
            <input
              type="date"
              id="expense-custom-to-date"
              value={customRange.endDate}
              onChange={(e) =>
                setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] flex-1 min-w-0 focus:outline-none focus:border-[#D4AF37]"
              required
            />
            <button
              type="submit"
              id="expense-custom-apply-btn"
              className="px-3.5 py-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] font-black rounded-md text-xs shrink-0 cursor-pointer transition-all shadow-xs"
            >
              Apply
            </button>
          </form>
        )}
      </div>

      {/* Ledger Records List */}
      <div>
        {periodMode === 'day' ? (
          filteredExpenses.length === 0 ? (
            <div className="py-8 text-center text-[#777777] text-xs font-medium">
              No expenses recorded for this day.
            </div>
          ) : (
            <div className="divide-y divide-[#2A2A2A]">
              {filteredExpenses.map((record) => renderExpenseRow(record))}
            </div>
          )
        ) : (
          groupedByDate.size === 0 ? (
            <div className="py-8 text-center text-[#777777] text-xs font-medium">
              No expenses recorded for this period.
            </div>
          ) : (
            <div className="divide-y divide-[#2A2A2A]">
              {Array.from(groupedByDate.entries()).map(([dateStr, recordsForDate]) => (
                <div key={dateStr}>
                  <div className="bg-[#111111] px-3.5 py-1.5 text-[11px] font-bold text-[#B8B8B8] flex items-center justify-between border-y border-[#2A2A2A]">
                    <span>{formatDayHeader(dateStr)}</span>
                    <span className="text-[#f87171] font-black">
                      {formatCurrency(recordsForDate.reduce((sum, r) => sum + r.amount, 0))}
                    </span>
                  </div>
                  <div className="divide-y divide-[#2A2A2A]/70">
                    {recordsForDate.map((record) => renderExpenseRow(record))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Clean Bottom Summary: Income & Expense */}
      <div className="p-3 sm:p-3.5 bg-[#111111] border-t border-[#2A2A2A]">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between bg-[#171717] px-3 py-2 rounded-lg border border-[#2A2A2A]">
            <span className="text-[#B8B8B8] font-semibold">Total Income</span>
            <span className="font-black text-[#D4AF37] text-sm">{formatCurrency(periodTotalIncome)}</span>
          </div>
          <div className="flex items-center justify-between bg-[#171717] px-3 py-2 rounded-lg border border-[#2A2A2A]">
            <span className="text-[#B8B8B8] font-semibold">Total Expense</span>
            <span className="font-black text-[#f87171] text-sm">{formatCurrency(periodTotalExpense)}</span>
          </div>
        </div>
      </div>

      {/* Edit Expense Modal */}
      {editingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-md w-full p-4 sm:p-5 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2.5">
              <h3 className="text-sm font-bold text-[#F5F5F5]">
                Edit Expense Entry
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Category</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Staff', 'Groceries', 'Other'] as ExpenseCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategory(cat)}
                      className={`py-1.5 text-xs font-bold rounded ${
                        editCategory === cat
                          ? 'bg-[#D4AF37] text-[#0A0A0A]'
                          : 'bg-[#111111] text-[#B8B8B8] border border-[#2A2A2A]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

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
                  <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Amount (₹)</label>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#D0D0D0] mb-1 font-semibold">Paid By</label>
                <select
                  value={editPaidBy}
                  onChange={(e) => setEditPaidBy(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#111111] border border-[#2A2A2A] rounded text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="Hotel">Hotel</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-1.5 bg-[#111111] text-[#B8B8B8] hover:text-[#F5F5F5] rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdit()}
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
