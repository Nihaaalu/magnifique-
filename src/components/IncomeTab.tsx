import React, { useState, useEffect } from 'react';
import {
  MealPlan,
  MealCombination,
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
  onSettleIncome?: (incomeEntryId: string, paymentDate: string, amount: number) => Promise<void>;
  isLoading?: boolean;
}

type OneTimeMeal = 'breakfast' | 'lunch' | 'dinner';
type TwoTimeCombo = 'breakfast_lunch' | 'breakfast_dinner' | 'lunch_dinner';

export const IncomeTab: React.FC<IncomeTabProps> = ({
  incomeRecords,
  expenseRecords,
  partners,
  onAddIncome,
  onDeleteIncome,
  onUpdateIncome,
  onSettleIncome,
}) => {
  // Primary Selection: 1 TIME | 2 TIME | 3 TIME | À LA CARTE
  const [selectedPlan, setSelectedPlan] = useState<MealPlan>('1_time');

  // Secondary Selection for 1 TIME: 'breakfast' | 'lunch' | 'dinner'
  const [oneTimeMeal, setOneTimeMeal] = useState<OneTimeMeal>('breakfast');

  // Secondary Selection for 2 TIME: 'breakfast_lunch' | 'breakfast_dinner' | 'lunch_dinner'
  const [twoTimeCombo, setTwoTimeCombo] = useState<TwoTimeCombo>('breakfast_lunch');

  // Form State
  const defaultPartner = partners.find((p) => p.name.toUpperCase() === 'IRSHAD') || partners[0];
  const [byWhoOption, setByWhoOption] = useState<string>(defaultPartner?.name?.toUpperCase() || 'IRSHAD');
  const [customByWho, setCustomByWho] = useState<string>('');
  const [travels, setTravels] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(getTodayDateString());

  // Meal inputs
  const [membersCount, setMembersCount] = useState<string>('');
  const [breakfastPrice, setBreakfastPrice] = useState<string>('');
  const [lunchPrice, setLunchPrice] = useState<string>('');
  const [dinnerPrice, setDinnerPrice] = useState<string>('');

  // Editable Total Amount state (Meal bookings and À La Carte)
  const [totalAmountInput, setTotalAmountInput] = useState<string>('');
  const [isTotalManuallyEdited, setIsTotalManuallyEdited] = useState<boolean>(false);

  // À LA CARTE manual total
  const [manualTotalAmount, setManualTotalAmount] = useState<string>('');

  // Payment Status
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Paid Full');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [balanceAccountPartnerId, setBalanceAccountPartnerId] = useState<string>(defaultPartner?.id || '');

  // Synchronize default balance partner on initial partners load if not set
  useEffect(() => {
    if (partners.length > 0 && !balanceAccountPartnerId) {
      const irshad = partners.find((p) => p.name.toUpperCase() === 'IRSHAD') || partners[0];
      if (irshad) {
        setBalanceAccountPartnerId(irshad.id);
      }
    }
  }, [partners, balanceAccountPartnerId]);

  // Handle By Who change and update default Balance Account Partner
  const handleByWhoChange = (newByWho: string) => {
    setByWhoOption(newByWho);
    if (newByWho === 'Other') {
      const irshad = partners.find((p) => p.name.toUpperCase() === 'IRSHAD') || partners[0];
      if (irshad) {
        setBalanceAccountPartnerId(irshad.id);
      }
    } else {
      const matched = partners.find((p) => p.name.toUpperCase() === newByWho.toUpperCase());
      if (matched) {
        setBalanceAccountPartnerId(matched.id);
      }
    }
  };

  // Feedback & Loading State
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dynamic Options from Supabase partners
  const partnerNamesUpper = partners.map((p) => p.name.toUpperCase());
  const byWhoOptions = [...partnerNamesUpper, 'Other'];

  const isAlaCarte = selectedPlan === 'alacarte';

  const handlePlanChange = (plan: MealPlan) => {
    setSelectedPlan(plan);
    setIsTotalManuallyEdited(false);
    setValidationError(null);
    if (plan === 'alacarte') {
      const irshad = partners.find((p) => p.name.toUpperCase() === 'IRSHAD') || partners[0];
      if (irshad) {
        setBalanceAccountPartnerId(irshad.id);
      }
    }
  };

  // Numerical values
  const countNum = Math.max(0, parseInt(membersCount, 10) || 0);
  const bPriceNum = Math.max(0, parseFloat(breakfastPrice) || 0);
  const lPriceNum = Math.max(0, parseFloat(lunchPrice) || 0);
  const dPriceNum = Math.max(0, parseFloat(dinnerPrice) || 0);
  const manualTotalNum = Math.max(0, parseFloat(manualTotalAmount) || 0);

  // Calculate live suggested total based on plan & combination
  let suggestedTotal = 0;
  if (isAlaCarte) {
    suggestedTotal = manualTotalNum;
  } else if (selectedPlan === '1_time') {
    if (oneTimeMeal === 'breakfast') {
      suggestedTotal = countNum * bPriceNum;
    } else if (oneTimeMeal === 'lunch') {
      suggestedTotal = countNum * lPriceNum;
    } else {
      suggestedTotal = countNum * dPriceNum;
    }
  } else if (selectedPlan === '2_time') {
    if (twoTimeCombo === 'breakfast_lunch') {
      suggestedTotal = countNum * (bPriceNum + lPriceNum);
    } else if (twoTimeCombo === 'breakfast_dinner') {
      suggestedTotal = countNum * (bPriceNum + dPriceNum);
    } else {
      suggestedTotal = countNum * (lPriceNum + dPriceNum);
    }
  } else if (selectedPlan === '3_time') {
    suggestedTotal = countNum * (bPriceNum + lPriceNum + dPriceNum);
  }

  // Update totalAmountInput automatically when inputs change unless user manually edited it
  useEffect(() => {
    if (isAlaCarte) return;
    if (!isTotalManuallyEdited) {
      setTotalAmountInput(suggestedTotal > 0 ? String(suggestedTotal) : '');
    }
  }, [
    isAlaCarte,
    isTotalManuallyEdited,
    suggestedTotal,
  ]);

  // Authoritative Total Amount
  const authoritativeTotal = isAlaCarte
    ? manualTotalNum
    : (isTotalManuallyEdited ? (parseFloat(totalAmountInput) || 0) : (suggestedTotal || parseFloat(totalAmountInput) || 0));

  // Amount Paid & Balance calculation using authoritative total
  let finalPaid = 0;
  let finalBalance = 0;

  if (paymentStatus === 'Paid Full') {
    finalPaid = authoritativeTotal;
    finalBalance = 0;
  } else if (paymentStatus === 'Balance') {
    finalPaid = 0;
    finalBalance = authoritativeTotal;
  } else {
    const paidInput = Math.max(0, parseFloat(amountPaid) || 0);
    finalPaid = Math.min(paidInput, authoritativeTotal);
    finalBalance = Math.max(0, authoritativeTotal - finalPaid);
  }

  const handleResetForm = () => {
    const irshad = partners.find((p) => p.name.toUpperCase() === 'IRSHAD') || partners[0];
    setByWhoOption(irshad?.name?.toUpperCase() || 'IRSHAD');
    setCustomByWho('');
    setTravels('');
    setMembersCount('');
    setBreakfastPrice('');
    setLunchPrice('');
    setDinnerPrice('');
    setManualTotalAmount('');
    setTotalAmountInput('');
    setIsTotalManuallyEdited(false);
    setPaymentStatus('Paid Full');
    setAmountPaid('');
    setBalanceAccountPartnerId(irshad?.id || '');
    setValidationError(null);
  };

  const getPlanBadgeLabel = () => {
    if (isAlaCarte) return 'À LA CARTE';
    if (selectedPlan === '1_time') {
      return `1 TIME • ${oneTimeMeal.toUpperCase()}`;
    }
    if (selectedPlan === '2_time') {
      if (twoTimeCombo === 'breakfast_lunch') return '2 TIME • B + L';
      if (twoTimeCombo === 'breakfast_dinner') return '2 TIME • B + D';
      return '2 TIME • L + D';
    }
    return '3 TIME • B + L + D';
  };

  const getSaveButtonLabel = () => {
    if (isSubmitting) return 'SAVING TO SUPABASE...';
    if (isAlaCarte) return 'SAVE À LA CARTE';
    if (selectedPlan === '1_time') {
      return `SAVE 1 TIME (${oneTimeMeal.toUpperCase()})`;
    }
    if (selectedPlan === '2_time') {
      if (twoTimeCombo === 'breakfast_lunch') return 'SAVE 2 TIME (BREAKFAST + LUNCH)';
      if (twoTimeCombo === 'breakfast_dinner') return 'SAVE 2 TIME (BREAKFAST + DINNER)';
      return 'SAVE 2 TIME (LUNCH + DINNER)';
    }
    return 'SAVE 3 TIME (BREAKFAST + LUNCH + DINNER)';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

      if (selectedPlan === '1_time') {
        if (oneTimeMeal === 'breakfast' && bPriceNum <= 0) {
          setValidationError('Please enter a valid Breakfast price per member.');
          return;
        }
        if (oneTimeMeal === 'lunch' && lPriceNum <= 0) {
          setValidationError('Please enter a valid Lunch price per member.');
          return;
        }
        if (oneTimeMeal === 'dinner' && dPriceNum <= 0) {
          setValidationError('Please enter a valid Dinner price per member.');
          return;
        }
      } else if (selectedPlan === '2_time') {
        if (twoTimeCombo === 'breakfast_lunch') {
          if (bPriceNum <= 0 || lPriceNum <= 0) {
            setValidationError('Please enter valid prices for both Breakfast and Lunch.');
            return;
          }
        } else if (twoTimeCombo === 'breakfast_dinner') {
          if (bPriceNum <= 0 || dPriceNum <= 0) {
            setValidationError('Please enter valid prices for both Breakfast and Dinner.');
            return;
          }
        } else if (twoTimeCombo === 'lunch_dinner') {
          if (lPriceNum <= 0 || dPriceNum <= 0) {
            setValidationError('Please enter valid prices for both Lunch and Dinner.');
            return;
          }
        }
      } else if (selectedPlan === '3_time') {
        if (bPriceNum <= 0 || lPriceNum <= 0 || dPriceNum <= 0) {
          setValidationError('Please enter valid prices for Breakfast, Lunch, and Dinner.');
          return;
        }
      }
    }

    if (paymentStatus === 'Paid Partially') {
      const paidVal = parseFloat(amountPaid);
      if (isNaN(paidVal) || paidVal <= 0) {
        setValidationError('Please enter a valid amount paid.');
        return;
      }
      if (paidVal >= authoritativeTotal) {
        setValidationError('Amount paid cannot equal or exceed total for partial payment. Select "Paid Full".');
        return;
      }
    }

    const resolvedByWho = isAlaCarte
      ? null
      : byWhoOption === 'Other'
      ? customByWho.trim().toUpperCase()
      : byWhoOption;

    let partnerIdForBalance: string | null = null;
    if (paymentStatus !== 'Paid Full') {
      partnerIdForBalance = balanceAccountPartnerId || partners[0]?.id || null;
    }

    // Determine meal_combination and prices to store
    let mealComboToStore: MealCombination = null;
    let bPriceToStore: number | null = null;
    let lPriceToStore: number | null = null;
    let dPriceToStore: number | null = null;

    if (!isAlaCarte) {
      if (selectedPlan === '1_time') {
        mealComboToStore = oneTimeMeal;
        if (oneTimeMeal === 'breakfast') bPriceToStore = bPriceNum;
        if (oneTimeMeal === 'lunch') lPriceToStore = lPriceNum;
        if (oneTimeMeal === 'dinner') dPriceToStore = dPriceNum;
      } else if (selectedPlan === '2_time') {
        mealComboToStore = twoTimeCombo;
        if (twoTimeCombo === 'breakfast_lunch') {
          bPriceToStore = bPriceNum;
          lPriceToStore = lPriceNum;
        } else if (twoTimeCombo === 'breakfast_dinner') {
          bPriceToStore = bPriceNum;
          dPriceToStore = dPriceNum;
        } else if (twoTimeCombo === 'lunch_dinner') {
          lPriceToStore = lPriceNum;
          dPriceToStore = dPriceNum;
        }
      } else if (selectedPlan === '3_time') {
        mealComboToStore = 'all';
        bPriceToStore = bPriceNum;
        lPriceToStore = lPriceNum;
        dPriceToStore = dPriceNum;
      }
    }

    const dbPaymentStatus = paymentStatus === 'Paid Full' ? 'paid_full' : paymentStatus === 'Paid Partially' ? 'paid_partial' : 'balance';

    setIsSubmitting(true);
    try {
      await onAddIncome({
        entry_date: entryDate || getTodayDateString(),
        income_type: isAlaCarte ? 'alacarte' : 'meal',
        meal_plan: selectedPlan,
        meal_combination: mealComboToStore,
        breakfast_price: bPriceToStore,
        lunch_price: lPriceToStore,
        dinner_price: dPriceToStore,
        travel_name: travels.trim() || null,
        member_count: isAlaCarte ? null : countNum,
        total_amount: authoritativeTotal,
        amount_received: finalPaid,
        payment_status: dbPaymentStatus,
        by_who: resolvedByWho,
        balance_account_partner_id: partnerIdForBalance,
      });

      setFeedbackMsg(`Saved ${getPlanBadgeLabel()} (${formatCurrency(authoritativeTotal)}) to Supabase`);
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
            {getPlanBadgeLabel()}
          </span>
        </div>

        {/* PRIMARY INCOME TYPE CHOICES: 1 TIME | 2 TIME | 3 TIME | À LA CARTE */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#111111] rounded-lg border border-[#2A2A2A]" id="meal-plan-primary-selector">
          {(
            [
              { id: '1_time', label: '1 TIME' },
              { id: '2_time', label: '2 TIME' },
              { id: '3_time', label: '3 TIME' },
              { id: 'alacarte', label: 'À LA CARTE' },
            ] as { id: MealPlan; label: string }[]
          ).map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                id={`plan-btn-${plan.id}`}
                onClick={() => handlePlanChange(plan.id)}
                className={`py-2 px-1 text-xs font-bold rounded-md transition-all cursor-pointer text-center min-h-[42px] tracking-wide uppercase ${
                  isSelected
                    ? 'bg-[#D4AF37] text-[#0A0A0A] font-black shadow-xs'
                    : 'bg-[#171717] text-[#B8B8B8] hover:bg-[#1D1D1D] hover:text-[#F5F5F5] border border-[#2A2A2A]'
                }`}
              >
                {plan.label}
              </button>
            );
          })}
        </div>

        {/* SECONDARY SELECTIONS */}
        {/* 1 TIME SECONDARY SELECTION: [ Breakfast ] [ Lunch ] [ Dinner ] */}
        {selectedPlan === '1_time' && (
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-[#D4AF37]">
              Select Meal
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#111111] rounded-lg border border-[#2A2A2A]" id="one-time-subselector">
              {(
                [
                  { id: 'breakfast', label: 'Breakfast' },
                  { id: 'lunch', label: 'Lunch' },
                  { id: 'dinner', label: 'Dinner' },
                ] as { id: OneTimeMeal; label: string }[]
              ).map((meal) => {
                const isSelected = oneTimeMeal === meal.id;
                return (
                  <button
                    key={meal.id}
                    type="button"
                    id={`one-time-btn-${meal.id}`}
                    onClick={() => setOneTimeMeal(meal.id)}
                    className={`py-2 px-1 text-xs font-bold rounded-md transition-all cursor-pointer text-center min-h-[38px] uppercase tracking-wide ${
                      isSelected
                        ? 'bg-[#F2C94C] text-[#0A0A0A] font-black shadow-xs'
                        : 'bg-[#171717] text-[#B8B8B8] hover:bg-[#1D1D1D] hover:text-[#F5F5F5] border border-[#2A2A2A]'
                    }`}
                  >
                    {meal.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 2 TIME SECONDARY SELECTION: [ Breakfast + Lunch ] [ Breakfast + Dinner ] [ Lunch + Dinner ] */}
        {selectedPlan === '2_time' && (
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-[#D4AF37]">
              Select Meal Combination
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-[#111111] rounded-lg border border-[#2A2A2A]" id="two-time-subselector">
              {(
                [
                  { id: 'breakfast_lunch', label: 'Breakfast + Lunch' },
                  { id: 'breakfast_dinner', label: 'Breakfast + Dinner' },
                  { id: 'lunch_dinner', label: 'Lunch + Dinner' },
                ] as { id: TwoTimeCombo; label: string }[]
              ).map((combo) => {
                const isSelected = twoTimeCombo === combo.id;
                return (
                  <button
                    key={combo.id}
                    type="button"
                    id={`two-time-btn-${combo.id}`}
                    onClick={() => setTwoTimeCombo(combo.id)}
                    className={`py-2 px-2 text-xs font-bold rounded-md transition-all cursor-pointer text-center min-h-[38px] tracking-wide ${
                      isSelected
                        ? 'bg-[#F2C94C] text-[#0A0A0A] font-black shadow-xs'
                        : 'bg-[#171717] text-[#B8B8B8] hover:bg-[#1D1D1D] hover:text-[#F5F5F5] border border-[#2A2A2A]'
                    }`}
                  >
                    {combo.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3 TIME CONFIRMATION BADGE */}
        {selectedPlan === '3_time' && (
          <div className="p-2 bg-[#111111] border border-[#D4AF37]/30 rounded-lg flex items-center justify-between text-xs" id="three-time-confirmation">
            <span className="text-[#D0D0D0] font-medium">Included Meals:</span>
            <span className="font-bold text-[#D4AF37] tracking-wide">
              Breakfast + Lunch + Dinner (All 3 Meals)
            </span>
          </div>
        )}

        {/* Form Container */}
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
            id="income-entry-form"
          >
            {validationError && (
              <div
                id="income-validation-error"
                className="p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-md text-xs font-semibold"
              >
                {validationError}
              </div>
            )}

            {/* ==================================================
                À LA CARTE FORM (COMPLETELY CHANGED: NO BY WHO, NO MEMBERS, NO MEAL PRICES)
                ================================================== */}
            {isAlaCarte ? (
              <div className="space-y-3.5" id="alacarte-form-fields">
                {/* Date & Travels */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                      Travels / Description <span className="text-[#777777] font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      id="income-travels-input"
                      placeholder="e.g. À La Carte Table 4 / Party"
                      value={travels}
                      onChange={(e) => setTravels(e.target.value)}
                      className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    />
                  </div>
                </div>

                {/* Total Amount (Entered directly by user) */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                    TOTAL AMOUNT (₹)
                  </label>
                  <input
                    type="number"
                    id="income-total-amount-input"
                    min="1"
                    step="any"
                    placeholder="Enter total amount (e.g. 2500)"
                    value={manualTotalAmount}
                    onChange={(e) => setManualTotalAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#111111] border border-[#D4AF37]/50 rounded-md text-sm font-bold text-[#F2C94C] placeholder-[#777777] min-h-[42px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    required
                  />
                </div>
              </div>
            ) : (
              /* ==================================================
                 1 TIME / 2 TIME / 3 TIME FORM
                 ================================================== */
              <div className="space-y-3.5" id="meal-plan-form-fields">
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
                      onChange={(e) => handleByWhoChange(e.target.value)}
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

                {/* Custom By Who (if Other) */}
                {byWhoOption === 'Other' && (
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

                {/* Members Count Input */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                    Members Count (PAX)
                  </label>
                  <input
                    type="number"
                    id="income-members-count"
                    min="1"
                    step="1"
                    placeholder="e.g. 150"
                    value={membersCount}
                    onChange={(e) => setMembersCount(e.target.value)}
                    className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    required
                  />
                </div>

                {/* DYNAMIC MEAL PRICE INPUTS ACCORDING TO SELECTED PLAN & COMBO */}
                {/* 1 TIME PRICE INPUT */}
                {selectedPlan === '1_time' && (
                  <div>
                    {oneTimeMeal === 'breakfast' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                          Breakfast Price / Member (₹)
                        </label>
                        <input
                          type="number"
                          id="income-breakfast-price"
                          min="0"
                          step="any"
                          placeholder="e.g. 90"
                          value={breakfastPrice}
                          onChange={(e) => setBreakfastPrice(e.target.value)}
                          className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                          required
                        />
                      </div>
                    )}
                    {oneTimeMeal === 'lunch' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                          Lunch Price / Member (₹)
                        </label>
                        <input
                          type="number"
                          id="income-lunch-price"
                          min="0"
                          step="any"
                          placeholder="e.g. 120"
                          value={lunchPrice}
                          onChange={(e) => setLunchPrice(e.target.value)}
                          className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                          required
                        />
                      </div>
                    )}
                    {oneTimeMeal === 'dinner' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                          Dinner Price / Member (₹)
                        </label>
                        <input
                          type="number"
                          id="income-dinner-price"
                          min="0"
                          step="any"
                          placeholder="e.g. 100"
                          value={dinnerPrice}
                          onChange={(e) => setDinnerPrice(e.target.value)}
                          className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 2 TIME PRICE INPUTS: ONLY THE TWO REQUIRED MEAL PRICES */}
                {selectedPlan === '2_time' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {twoTimeCombo === 'breakfast_lunch' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Breakfast Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-breakfast-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 90"
                            value={breakfastPrice}
                            onChange={(e) => setBreakfastPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Lunch Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-lunch-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 120"
                            value={lunchPrice}
                            onChange={(e) => setLunchPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                      </>
                    )}

                    {twoTimeCombo === 'breakfast_dinner' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Breakfast Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-breakfast-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 90"
                            value={breakfastPrice}
                            onChange={(e) => setBreakfastPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Dinner Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-dinner-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 100"
                            value={dinnerPrice}
                            onChange={(e) => setDinnerPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                      </>
                    )}

                    {twoTimeCombo === 'lunch_dinner' && (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Lunch Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-lunch-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 120"
                            value={lunchPrice}
                            onChange={(e) => setLunchPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                            Dinner Price (₹)
                          </label>
                          <input
                            type="number"
                            id="income-dinner-price"
                            min="0"
                            step="any"
                            placeholder="e.g. 100"
                            value={dinnerPrice}
                            onChange={(e) => setDinnerPrice(e.target.value)}
                            className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                            required
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 3 TIME PRICE INPUTS: ALL 3 MEALS */}
                {selectedPlan === '3_time' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                        Breakfast Price (₹)
                      </label>
                      <input
                        type="number"
                        id="income-breakfast-price"
                        min="0"
                        step="any"
                        placeholder="e.g. 90"
                        value={breakfastPrice}
                        onChange={(e) => setBreakfastPrice(e.target.value)}
                        className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                        Lunch Price (₹)
                      </label>
                      <input
                        type="number"
                        id="income-lunch-price"
                        min="0"
                        step="any"
                        placeholder="e.g. 120"
                        value={lunchPrice}
                        onChange={(e) => setLunchPrice(e.target.value)}
                        className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#D4AF37] mb-1">
                        Dinner Price (₹)
                      </label>
                      <input
                        type="number"
                        id="income-dinner-price"
                        min="0"
                        step="any"
                        placeholder="e.g. 100"
                        value={dinnerPrice}
                        onChange={(e) => setDinnerPrice(e.target.value)}
                        className="w-full px-2.5 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-semibold text-[#F5F5F5] placeholder-[#777777] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Authoritative Total Amount Section (Editable with live calculated reference) */}
                <div className="p-3 bg-[#111111] border border-[#D4AF37]/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-black text-[#F2C94C] tracking-wide">
                        TOTAL AMOUNT (₹)
                      </label>
                      <span className="text-[10px] text-[#888888]">
                        Suggested: {countNum} PAX × ₹{(
                          selectedPlan === '1_time'
                            ? (oneTimeMeal === 'breakfast' ? bPriceNum : oneTimeMeal === 'lunch' ? lPriceNum : dPriceNum)
                            : selectedPlan === '2_time'
                            ? (twoTimeCombo === 'breakfast_lunch' ? bPriceNum + lPriceNum : twoTimeCombo === 'breakfast_dinner' ? bPriceNum + dPriceNum : lPriceNum + dPriceNum)
                            : bPriceNum + lPriceNum + dPriceNum
                        ).toFixed(0)} = {formatCurrency(suggestedTotal)}
                      </span>
                    </div>
                    {isTotalManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsTotalManuallyEdited(false);
                          setTotalAmountInput(suggestedTotal > 0 ? String(suggestedTotal) : '');
                        }}
                        className="text-[10px] text-[#D4AF37] hover:text-[#F2C94C] underline cursor-pointer font-bold"
                      >
                        Reset to calculated ({formatCurrency(suggestedTotal)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    id="income-total-amount-input"
                    min="0"
                    step="any"
                    placeholder="Enter total amount"
                    value={totalAmountInput}
                    onChange={(e) => {
                      setTotalAmountInput(e.target.value);
                      setIsTotalManuallyEdited(true);
                    }}
                    className="w-full px-3 py-2 bg-[#171717] border border-[#D4AF37] rounded-md text-sm font-black text-[#F2C94C] placeholder-[#777777] min-h-[42px] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    required
                  />
                </div>
              </div>
            )}

            {/* ==================================================
                PAYMENT STATUS (Common for all plans)
                ================================================== */}
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
                        max={authoritativeTotal}
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
                    <span className="font-bold text-[#f87171] text-sm">{formatCurrency(authoritativeTotal)}</span>
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
                type="button"
                id="income-save-btn"
                onClick={() => handleSubmit()}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs sm:text-sm font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer min-h-[44px] text-center disabled:opacity-50"
              >
                {getSaveButtonLabel()}
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
          onSettleIncome={onSettleIncome}
        />
      </section>
    </div>
  );
};
