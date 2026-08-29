import React, { useState } from 'react';
import {
  MealType,
  PaymentStatus,
  IncomeRecord,
  ExpenseRecord,
  Partner,
  IncomeEntryRow,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
} from '../utils/formatters';
import { IncomeLedger } from './IncomeLedger';

interface IncomeTabProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  partners: Partner[];
  onAddIncome: (record: Omit<IncomeEntryRow, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onDeleteIncome: (id: string) => Promise<void>;
  onUpdateIncome?: (id: string, updatedRecord: Partial<IncomeRecord>) => Promise<void>;
  isLoading?: boolean;
}

export const IncomeTab: React.FC<IncomeTabProps> = ({
  incomeRecords,
  expenseRecords,
  partners,
  onAddIncome,
  onDeleteIncome,
  onUpdateIncome,
  isLoading,
}) => {
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Breakfast');

  // Form State
  const defaultByWho = partners[0]?.name?.toUpperCase() || 'IRSHAD';
  const [byWhoOption, setByWhoOption] = useState<string>(defaultByWho);
  const [customByWho, setCustomByWho] = useState<string>('');
  const [travels, setTravels] = useState<string>('');
  const [membersCount, setMembersCount] = useState<string>('');
  const [pricePerMember, setPricePerMember] = useState<string>('');
  const [manualTotalAmount, setManualTotalAmount] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid Full');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [balanceAccountPartnerId, setBalanceAccountPartnerId] = useState<string>(partners[0]?.id || '');
  const [customBalanceAccount, setCustomBalanceAccount] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(getTodayDateString());

  // Feedback & Loading State
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dynamic Options from Supabase partners
  const partnerNamesUpper = partners.map((p) => p.name.toUpperCase());
  const byWhoOptions = [...partnerNamesUpper, 'À LA CARTE', 'Other'];

  // À LA CARTE Mode
  const isAlaCarte = byWhoOption === 'À LA CARTE';

  // Calculated values
  const countNum = Math.max(0, parseInt(membersCount, 10) || 0);
  const priceNum = Math.max(0, parseFloat(pricePerMember) || 0);
  const calculatedMealTotal = countNum * priceNum;
  const manualTotalNum = Math.max(0, parseFloat(manualTotalAmount) || 0);
  const totalCalculated = isAlaCarte ? manualTotalNum : calculatedMealTotal;

  // Amount Paid & Balance calculation
  let finalPaid = 0;
  let finalBalance = 0;

  if (paymentStatus === 'Paid Full') {
    finalPaid = totalCalculated;
    finalBalance = 0;
  } else if (paymentStatus === 'Balance') {
    finalPaid = 0;
    finalBalance = totalCalculated;
  } else {
    const paidInput = Math.max(0, parseFloat(amountPaid) || 0);
    finalPaid = Math.min(paidInput, totalCalculated);
    finalBalance = Math.max(0, totalCalculated - finalPaid);
  }

  const handleResetForm = () => {
    setByWhoOption(partners[0]?.name?.toUpperCase() || 'IRSHAD');
    setCustomByWho('');
    setTravels('');
    setMembersCount('');
    setPricePerMember('');
    setManualTotalAmount('');
    setPaymentStatus('Paid Full');
    setAmountPaid('');
    setBalanceAccountPartnerId(partners[0]?.id || '');
    setCustomBalanceAccount('');
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isAlaCarte) {
      const enteredTotal = parseFloat(manualTotalAmount);
      if (isNaN(enteredTotal) || enteredTotal <= 0) {
        setValidationError('Please enter a valid Total Amount greater than ₹0.');
        return;
      }
    } else {
      if (byWhoOption === 'Other' && !customByWho.trim()) {
        setValidationError('Please enter a name for By Who.');
        return;
      }

      if (countNum <= 0) {
        setValidationError('Members count must be greater than 0.');
        return;
      }

      if (priceNum <= 0) {
        setValidationError('Price per member must be greater than 0.');
        return;
      }
    }

    if (paymentStatus === 'Paid Partially') {
      const paidVal = parseFloat(amountPaid);
      if (isNaN(paidVal) || paidVal <= 0) {
        setValidationError('Please enter a valid amount paid.');
        return;
      }
      if (paidVal >= totalCalculated) {
        setValidationError('Amount paid cannot equal or exceed total for partial payment. Select "Paid Full".');
        return;
      }
    }

    const resolvedByWho = isAlaCarte
      ? 'À LA CARTE'
      : byWhoOption === 'Other'
      ? customByWho.trim().toUpperCase()
      : byWhoOption;

    let partnerIdForBalance: string | null = null;
    if (paymentStatus !== 'Paid Full') {
      partnerIdForBalance = balanceAccountPartnerId || partners[0]?.id || null;
    }

    const dbPaymentStatus: 'Paid Full' | 'Balance' =
      paymentStatus === 'Paid Full' ? 'Paid Full' : 'Balance';

    setIsSubmitting(true);
    try {
      await onAddIncome({
        entry_date: entryDate || getTodayDateString(),
        income_type: isAlaCarte ? 'À La Carte' : 'Meal',
        meal_type: isAlaCarte ? null : selectedMeal,
        travel_name: travels.trim() || null,
        member_count: isAlaCarte ? null : countNum,
        price_per_member: isAlaCarte ? null : priceNum,
        total_amount: totalCalculated,
        amount_received: finalPaid,
        balance_amount: finalBalance,
        payment_status: dbPaymentStatus,
        by_who: resolvedByWho,
        balance_account_partner_id: partnerIdForBalance,
      });

      const feedbackLabel = isAlaCarte ? 'À LA CARTE' : selectedMeal;
      setFeedbackMsg(`Saved ${feedbackLabel} income (${formatCurrency(totalCalculated)}) to Supabase`);
      handleResetForm();

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
    } catch (err: any) {
      console.error('Error saving income entry:', err);
      setValidationError(err.message || 'Failed to save income entry to Supabase database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="income-tab-container">
      {/* Feedback Messages */}
      {feedbackMsg && (
        <div
          id="income-success-feedback"
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
          SECTION A: INCOME ENTRY
          ================================================== */}
      <section id="section-income-entry" className="space-y-3">
        {/* Section Heading with Warm Gold Accent */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              INCOME ENTRY
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2 py-0.5 rounded border border-[#2A2A2A]">
            {isAlaCarte ? 'À LA CARTE' : selectedMeal}
          </span>
        </div>

        {/* Meal Selector: Breakfast / Lunch / Dinner */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#111111] rounded-lg border border-[#2A2A2A]" id="meal-selector-buttons">
          {(['Breakfast', 'Lunch', 'Dinner'] as MealType[]).map((meal) => {
            const isSelected = !isAlaCarte && selectedMeal === meal;
            return (
              <button
                key={meal}
                type="button"
                id={`meal-btn-${meal.toLowerCase()}`}
                onClick={() => {
                  setSelectedMeal(meal);
                  if (isAlaCarte) {
                    setByWhoOption(partners[0]?.name?.toUpperCase() || 'IRSHAD');
                  }
                }}
                className={`py-2 px-2 text-xs font-bold rounded-md transition-all cursor-pointer text-center min-h-[42px] uppercase tracking-wide ${
                  isSelected
                    ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                    : 'bg-[#171717] text-[#B8B8B8] hover:bg-[#1D1D1D] hover:text-[#F5F5F5] border border-[#2A2A2A] font-semibold'
                }`}
              >
                {meal}
              </button>
            );
          })}
        </div>

        {/* Form Container */}
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md">
          <form onSubmit={handleSubmit} className="space-y-3.5" id="income-entry-form">
            {validationError && (
              <div
                id="income-validation-error"
                className="p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-md text-xs font-semibold"
              >
                {validationError}
              </div>
            )}

            {/* Date & By Who */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  id="income-date-input"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  By Who
                </label>
                <select
                  id="income-by-who-select"
                  value={byWhoOption}
                  onChange={(e) => setByWhoOption(e.target.value)}
                  className="w-full px-2 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                >
                  {byWhoOptions.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#171717] text-[#F5F5F5]">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom By Who (if Other and not À LA CARTE) */}
            {!isAlaCarte && byWhoOption === 'Other' && (
              <div>
                <input
                  type="text"
                  id="income-custom-by-who"
                  placeholder="Enter person name"
                  value={customByWho}
                  onChange={(e) => setCustomByWho(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37]"
                  required
                />
              </div>
            )}

            {/* Travels (Optional) */}
            <div>
              <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                Travels <span className="text-[#777777] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                id="income-travels-input"
                placeholder="e.g. Royal Travels"
                value={travels}
                onChange={(e) => setTravels(e.target.value)}
                className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
              />
            </div>

            {/* Dynamic Fields: Either À LA CARTE Total Amount OR Normal Members & Price */}
            {isAlaCarte ? (
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Total Amount (₹)
                </label>
                <input
                  type="number"
                  id="income-total-amount-input"
                  min="1"
                  step="any"
                  placeholder="2500"
                  value={manualTotalAmount}
                  onChange={(e) => setManualTotalAmount(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F2C94C] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  required
                />
              </div>
            ) : (
              <>
                {/* Members Count & Price */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                      Members
                    </label>
                    <input
                      type="number"
                      id="income-members-count"
                      min="1"
                      step="1"
                      placeholder="150"
                      value={membersCount}
                      onChange={(e) => setMembersCount(e.target.value)}
                      className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                      Price / Member (₹)
                    </label>
                    <input
                      type="number"
                      id="income-price-per-member"
                      min="0"
                      step="any"
                      placeholder="90"
                      value={pricePerMember}
                      onChange={(e) => setPricePerMember(e.target.value)}
                      className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                      required
                    />
                  </div>
                </div>

                {/* Total Display for Normal Meal */}
                <div className="flex items-center justify-between p-3 bg-[#111111] border border-[#D4AF37]/40 rounded-lg">
                  <span className="text-xs font-bold text-[#B8B8B8]">TOTAL AMOUNT</span>
                  <span id="income-calculated-total" className="text-base sm:text-lg font-black text-[#F2C94C]">
                    {formatCurrency(totalCalculated)}
                  </span>
                </div>
              </>
            )}

            {/* Payment Status: Segmented Options with Clean Dark/Gold States */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-semibold text-[#D0D0D0]">
                Payment Status
              </label>
              <div className="grid grid-cols-3 gap-1.5" id="income-payment-status-group">
                {(['Paid Full', 'Paid Partially', 'Balance'] as PaymentStatus[]).map((status) => {
                  const isSelected = paymentStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      id={`status-btn-${status.toLowerCase().replace(' ', '-')}`}
                      onClick={() => setPaymentStatus(status)}
                      className={`py-2 px-1 rounded-md text-xs border transition-all cursor-pointer text-center min-h-[40px] ${
                        isSelected
                          ? 'bg-[#D4AF37] text-[#0A0A0A] font-black border-[#D4AF37] shadow-xs'
                          : 'bg-[#111111] text-[#B8B8B8] border-[#2A2A2A] font-medium hover:bg-[#1D1D1D] hover:text-[#F5F5F5]'
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>

              {/* Paid Partially Fields */}
              {paymentStatus === 'Paid Partially' && (
                <div className="p-3 bg-[#111111] border border-[#D4AF37]/30 rounded-lg space-y-2.5 mt-2">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                        Amount Paid (₹)
                      </label>
                      <input
                        type="number"
                        id="income-amount-received"
                        min="0"
                        max={totalCalculated}
                        step="any"
                        placeholder="Amount"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-xs font-semibold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                        Remaining Balance
                      </label>
                      <div className="px-2.5 py-1.5 bg-[#0A0A0A] border border-[#3d1d1d] rounded text-xs font-bold text-[#f87171]">
                        {formatCurrency(finalBalance)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                      Balance Account Partner
                    </label>
                    <select
                      id="income-partial-balance-account"
                      value={balanceAccountPartnerId}
                      onChange={(e) => setBalanceAccountPartnerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-xs font-semibold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    >
                      {partners.map((partner) => (
                        <option key={partner.id} value={partner.id} className="bg-[#171717] text-[#F5F5F5]">
                          {partner.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Balance Due Fields */}
              {paymentStatus === 'Balance' && (
                <div className="p-3 bg-[#111111] border border-[#3d1d1d] rounded-lg space-y-2.5 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#f87171] font-semibold">Balance Due:</span>
                    <span className="font-bold text-[#f87171] text-sm">{formatCurrency(totalCalculated)}</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                      Balance Account Partner
                    </label>
                    <select
                      id="income-full-balance-account"
                      value={balanceAccountPartnerId}
                      onChange={(e) => setBalanceAccountPartnerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#0A0A0A] border border-[#2A2A2A] rounded text-xs font-semibold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    >
                      {partners.map((partner) => (
                        <option key={partner.id} value={partner.id} className="bg-[#171717] text-[#F5F5F5]">
                          {partner.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Clear & Bold Gold Primary (Save) */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                id="income-cancel-btn"
                onClick={handleResetForm}
                disabled={isSubmitting}
                className="w-24 sm:w-28 py-2.5 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[44px] text-center"
              >
                Clear
              </button>
              <button
                type="submit"
                id="income-save-btn"
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs sm:text-sm font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer min-h-[44px] text-center disabled:opacity-50"
              >
                {isSubmitting
                  ? 'SAVING TO SUPABASE...'
                  : isAlaCarte
                  ? 'SAVE À LA CARTE'
                  : `SAVE ${selectedMeal}`}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ==================================================
          SECTION DIVIDER & NEW SECTION HEADER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━
          INCOME LEDGER
          Your income records
          ================================================== */}
      <div className="my-7 sm:my-8" role="separator">
        <div className="w-full border-t border-[#2A2A2A] mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              <h2 className="text-sm font-black text-[#F5F5F5] tracking-wide uppercase">
                INCOME LEDGER
              </h2>
            </div>
            <p className="text-xs text-[#777777] font-medium mt-0.5">
              Live records from Supabase database
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-1 rounded-full border border-[#2A2A2A]">
            {incomeRecords.length} Entries
          </span>
        </div>
      </div>

      {/* ==================================================
          SECTION B: INCOME LEDGER
          ================================================== */}
      <section id="section-income-ledger">
        <IncomeLedger
          incomeRecords={incomeRecords}
          expenseRecords={expenseRecords}
          partners={partners}
          onDeleteIncome={onDeleteIncome}
          onUpdateIncome={onUpdateIncome}
        />
      </section>
    </div>
  );
};
