import React, { useState } from 'react';
import {
  ExpenseCategory,
  ExpenseRecord,
  IncomeRecord,
  Partner,
  ExpenseEntryRow,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
} from '../utils/formatters';
import { ExpenseLedger } from './ExpenseLedger';

interface ExpenseTabProps {
  expenseRecords: ExpenseRecord[];
  incomeRecords: IncomeRecord[];
  partners: Partner[];
  onAddExpense: (record: Omit<ExpenseEntryRow, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  onUpdateExpense?: (id: string, updatedRecord: Partial<ExpenseRecord>) => Promise<void>;
  isLoading?: boolean;
}

export const ExpenseTab: React.FC<ExpenseTabProps> = ({
  expenseRecords,
  incomeRecords,
  partners,
  onAddExpense,
  onDeleteExpense,
  onUpdateExpense,
  isLoading,
}) => {
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paidBy, setPaidBy] = useState<string>('Hotel');
  const [expenseDate, setExpenseDate] = useState<string>(getTodayDateString());

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const paidByOptions = ['Hotel', ...partners.map((p) => p.name)];

  const getPlaceholderForCategory = (cat: ExpenseCategory): string => {
    switch (cat) {
      case 'Staff':
        return 'e.g. Wages, Cook salary';
      case 'Groceries':
        return 'e.g. Rice, Oil, Vegetables';
      case 'Other':
        return 'e.g. Gas, Electricity, Maintenance';
      default:
        return 'Description';
    }
  };

  const handleResetForm = () => {
    setCategory('Groceries');
    setDescription('');
    setAmount('');
    setPaidBy('Hotel');
    setValidationError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setValidationError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid expense amount.');
      return;
    }

    const matchedPartner = partners.find(
      (p) => p.name.toLowerCase() === paidBy.toLowerCase()
    );

    setIsSubmitting(true);
    try {
      await onAddExpense({
        expense_date: expenseDate || getTodayDateString(),
        category,
        description: description.trim() || null,
        amount: parsedAmount,
        paid_by: paidBy,
        paid_by_partner_id: matchedPartner ? matchedPartner.id : null,
      });

      setFeedbackMsg(`Saved ${category} expense (${formatCurrency(parsedAmount)}) to Supabase`);
      handleResetForm();

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
    } catch (err: any) {
      console.error('Error saving expense:', err);
      setValidationError(err.message || 'Failed to save expense to Supabase database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="expense-tab-container">
      {/* Feedback Alert */}
      {feedbackMsg && (
        <div
          id="expense-success-feedback"
          className="mb-4 p-2.5 bg-[#171717] border border-[#D4AF37]/40 text-[#D4AF37] rounded-lg text-xs font-semibold flex items-center justify-between shadow-xs"
        >
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-[#D4AF37] hover:text-[#F2C94C] cursor-pointer text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================
          SECTION A: EXPENSE ENTRY
          ================================================== */}
      <section id="section-expense-entry" className="space-y-3">
        {/* Section Heading with Warm Gold Accent */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              EXPENSE ENTRY
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2 py-0.5 rounded border border-[#2A2A2A]">
            {category}
          </span>
        </div>

        {/* Expense Form Card */}
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }}
            className="space-y-3.5"
            id="expense-entry-form"
          >
            {validationError && (
              <div
                id="expense-validation-error"
                className="p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-md text-xs font-semibold"
              >
                {validationError}
              </div>
            )}

            {/* Category Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                Category
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#111111] rounded-lg border border-[#2A2A2A]" id="expense-category-options">
                {(['Staff', 'Groceries', 'Other'] as ExpenseCategory[]).map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      id={`cat-btn-${cat.toLowerCase()}`}
                      onClick={() => setCategory(cat)}
                      className={`py-2 px-1 rounded-md text-xs font-bold transition-all cursor-pointer text-center min-h-[42px] uppercase tracking-wide ${
                        isSelected
                          ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                          : 'bg-[#171717] text-[#B8B8B8] hover:bg-[#1D1D1D] hover:text-[#F5F5F5] border border-[#2A2A2A] font-semibold'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date & Amount */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  id="expense-date-input"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  id="expense-amount-input"
                  min="1"
                  step="any"
                  placeholder="2500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#f87171] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                Description <span className="text-[#777777] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                id="expense-description-input"
                placeholder={getPlaceholderForCategory(category)}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
              />
            </div>

            {/* Paid By */}
            <div>
              <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                Paid By
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" id="expense-paid-by-options">
                {paidByOptions.map((payer) => {
                  const isSelected = paidBy === payer;
                  return (
                    <button
                      key={payer}
                      type="button"
                      id={`paid-by-${payer.toLowerCase()}`}
                      onClick={() => setPaidBy(payer)}
                      className={`py-2 px-1 rounded-md text-xs border transition-all cursor-pointer text-center min-h-[40px] truncate ${
                        isSelected
                          ? 'bg-[#D4AF37] text-[#0A0A0A] font-black border-[#D4AF37] shadow-xs'
                          : 'bg-[#111111] text-[#B8B8B8] border-[#2A2A2A] font-medium hover:bg-[#1D1D1D] hover:text-[#F5F5F5]'
                      }`}
                    >
                      {payer}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions: Secondary (Clear) & Gold Primary (Save Expense) */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                id="expense-clear-btn"
                onClick={handleResetForm}
                disabled={isSubmitting}
                className="w-24 sm:w-28 py-2.5 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] text-center"
              >
                Clear
              </button>
              <button
                type="button"
                id="expense-save-btn"
                onClick={() => handleSubmit()}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs sm:text-sm font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer min-h-[44px] text-center disabled:opacity-50"
              >
                {isSubmitting ? 'SAVING TO SUPABASE...' : 'SAVE EXPENSE'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ==================================================
          SECTION DIVIDER & NEW SECTION HEADER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━
          EXPENSE LEDGER
          Your expense records
          ================================================== */}
      <div className="my-7 sm:my-8" role="separator">
        <div className="w-full border-t border-[#2A2A2A] mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              <h2 className="text-sm font-black text-[#F5F5F5] tracking-wide uppercase">
                EXPENSE LEDGER
              </h2>
            </div>
            <p className="text-xs text-[#777777] font-medium mt-0.5">
              Live records from Supabase database
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-1 rounded-full border border-[#2A2A2A]">
            {expenseRecords.length} Entries
          </span>
        </div>
      </div>

      {/* ==================================================
          SECTION B: EXPENSE LEDGER
          ================================================== */}
      <section id="section-expense-ledger">
        <ExpenseLedger
          expenseRecords={expenseRecords}
          incomeRecords={incomeRecords}
          partners={partners}
          onDeleteExpense={onDeleteExpense}
          onUpdateExpense={onUpdateExpense}
        />
      </section>
    </div>
  );
};
