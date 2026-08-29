import React, { useState } from 'react';
import {
  Partner,
  PartnerCurrentBalance,
  PartnerSettlementRow,
  SettlementType,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
  formatDateDisplay,
} from '../utils/formatters';
import { CheckCircle2, X } from 'lucide-react';

interface PartnerTabProps {
  partners: Partner[];
  partnerBalances: PartnerCurrentBalance[];
  partnerSettlements: PartnerSettlementRow[];
  onAddSettlement: (
    settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
  ) => Promise<void>;
  isLoading?: boolean;
}

export const PartnerTab: React.FC<PartnerTabProps> = ({
  partners,
  partnerBalances,
  partnerSettlements,
  onAddSettlement,
  isLoading,
}) => {
  const [activeModal, setActiveModal] = useState<{
    partnerId: string;
    partnerName: string;
    type: SettlementType;
    currentBalance: number;
  } | null>(null);

  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const getBalancesForPartner = (partnerId: string, partnerName: string) => {
    const found = partnerBalances.find(
      (b) =>
        b.partner_id === partnerId ||
        b.name?.toLowerCase() === partnerName.toLowerCase()
    );
    return {
      balanceToHotel: found ? Number(found.balance_to_hotel) || 0 : 0,
      expensesByThem: found ? Number(found.expenses_by_them) || 0 : 0,
    };
  };

  const handleOpenSettlement = (
    partner: Partner,
    type: SettlementType,
    currentBalance: number
  ) => {
    setActiveModal({
      partnerId: partner.id,
      partnerName: partner.name,
      type,
      currentBalance,
    });
    setSettlementAmount(currentBalance > 0 ? currentBalance.toString() : '');
    setSettlementDate(getTodayDateString());
    setSettlementNotes('');
    setValidationError(null);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setSettlementAmount('');
    setSettlementNotes('');
    setValidationError(null);
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal) return;

    const parsedAmount = parseFloat(settlementAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid settlement amount greater than 0.');
      return;
    }

    if (parsedAmount > activeModal.currentBalance) {
      setValidationError(
        `Amount cannot exceed the current balance of ${formatCurrency(
          activeModal.currentBalance
        )}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddSettlement({
        partner_id: activeModal.partnerId,
        settlement_date: settlementDate || getTodayDateString(),
        amount: parsedAmount,
        settlement_type: activeModal.type,
        notes: settlementNotes.trim() || null,
      });

      const typeLabel =
        activeModal.type === 'balance_to_hotel'
          ? 'Balance to Hotel'
          : 'Expenses by them';

      setFeedbackMsg(
        `Settled ${formatCurrency(parsedAmount)} for ${activeModal.partnerName} (${typeLabel}) in Supabase.`
      );

      handleCloseModal();

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
    } catch (err: any) {
      console.error('Error recording settlement:', err);
      setValidationError(err.message || 'Failed to record settlement in Supabase.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="partner-tab-container" className="space-y-4">
      {/* Section Heading with Warm Gold Accent */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
          <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
            PARTNER ACCOUNTS
          </h2>
        </div>
        <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2 py-0.5 rounded border border-[#2A2A2A]">
          {partners.length} Partners
        </span>
      </div>

      {/* Temporary Feedback Notification */}
      {feedbackMsg && (
        <div
          id="partner-feedback-msg"
          className="p-2.5 bg-[#171717] border border-[#D4AF37]/40 text-[#D4AF37] rounded-lg text-xs font-semibold flex items-center justify-between shadow-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-[#D4AF37] hover:text-[#F2C94C] cursor-pointer text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* List of Partners loaded dynamically from Supabase */}
      <div
        className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-md overflow-hidden"
        id="partner-list"
      >
        {partners.length === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium">
            {isLoading ? 'Loading partners from Supabase...' : 'No partners found.'}
          </div>
        ) : (
          partners.map((partner, index) => {
            const { balanceToHotel, expensesByThem } = getBalancesForPartner(
              partner.id,
              partner.name
            );
            const isNotLast = index < partners.length - 1;

            return (
              <React.Fragment key={partner.id}>
                <div
                  id={`partner-card-${partner.name.toLowerCase()}`}
                  className="p-3.5 sm:p-4.5 space-y-3 hover:bg-[#1D1D1D]/70 transition-colors"
                >
                  {/* Partner Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                      <span className="font-extrabold text-sm sm:text-base text-[#F5F5F5] tracking-wide uppercase">
                        {partner.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#D4AF37] font-bold bg-[#111111] px-2 py-0.5 rounded border border-[#2A2A2A] uppercase tracking-wider">
                      Partner
                    </span>
                  </div>

                  {/* 1. Balance to Hotel (Partner owes Hotel) */}
                  <div
                    id={`partner-${partner.name.toLowerCase()}-balance-to-hotel-box`}
                    className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#B8B8B8] block">
                        Balance to Hotel
                      </span>
                      <span className="text-sm sm:text-base font-black text-[#f87171] block mt-0.5">
                        {formatCurrency(balanceToHotel)}
                      </span>
                    </div>

                    <button
                      type="button"
                      id={`btn-settle-balance-${partner.name.toLowerCase()}`}
                      onClick={() =>
                        handleOpenSettlement(partner, 'balance_to_hotel', balanceToHotel)
                      }
                      disabled={balanceToHotel <= 0}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all shrink-0 min-h-[36px] flex items-center justify-center ${
                        balanceToHotel > 0
                          ? 'border border-[#D4AF37] bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] font-black shadow-xs cursor-pointer'
                          : 'border border-[#2A2A2A] bg-[#111111] text-[#777777] cursor-not-allowed opacity-50'
                      }`}
                    >
                      Settlement
                    </button>
                  </div>

                  {/* 2. Expenses by them (Hotel owes Partner) */}
                  <div
                    id={`partner-${partner.name.toLowerCase()}-expenses-by-them-box`}
                    className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-[#B8B8B8] block">
                        Expenses by them
                      </span>
                      <span className="text-sm sm:text-base font-black text-[#F5F5F5] block mt-0.5">
                        {formatCurrency(expensesByThem)}
                      </span>
                    </div>

                    <button
                      type="button"
                      id={`btn-settle-expense-${partner.name.toLowerCase()}`}
                      onClick={() =>
                        handleOpenSettlement(partner, 'expenses_by_them', expensesByThem)
                      }
                      disabled={expensesByThem <= 0}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all shrink-0 min-h-[36px] flex items-center justify-center ${
                        expensesByThem > 0
                          ? 'border border-[#2A2A2A] bg-[#1D1D1D] hover:bg-[#D4AF37] hover:text-[#0A0A0A] hover:border-[#D4AF37] text-[#F5F5F5] shadow-xs cursor-pointer'
                          : 'border border-[#2A2A2A] bg-[#111111] text-[#777777] cursor-not-allowed opacity-50'
                      }`}
                    >
                      Settlement
                    </button>
                  </div>
                </div>

                {/* Clear Divider After Every Partner */}
                {isNotLast && (
                  <div className="w-full border-t border-[#2A2A2A]" role="separator" />
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Settlements History Section */}
      {partnerSettlements.length > 0 && (
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
              Recent Settlements
            </h3>
            <span className="text-[10px] text-[#777777]">
              {partnerSettlements.length} Recorded
            </span>
          </div>

          <div className="divide-y divide-[#2A2A2A]">
            {partnerSettlements.slice(0, 10).map((settlement) => {
              const partner = partners.find((p) => p.id === settlement.partner_id);
              const partnerName = partner ? partner.name : 'Partner';

              return (
                <div
                  key={settlement.id}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#F5F5F5] uppercase">
                        {partnerName}
                      </span>
                      <span className="text-[#777777]">•</span>
                      <span className="text-[11px] text-[#D0D0D0]">
                        {settlement.settlement_type === 'balance_to_hotel'
                          ? 'Balance to Hotel'
                          : 'Expenses by them'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#777777] mt-0.5">
                      {formatDateDisplay(settlement.settlement_date)}
                      {settlement.notes && ` — ${settlement.notes}`}
                    </div>
                  </div>

                  <span className="font-black text-[#4ade80] text-xs sm:text-sm">
                    {formatCurrency(settlement.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================
          SETTLEMENT MODAL / FORM
          ================================================== */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/80 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settlement-modal-title"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 id="settlement-modal-title" className="text-sm font-bold text-[#F5F5F5]">
                  Settlement
                </h3>
                <p className="text-xs font-bold text-[#D4AF37] mt-0.5">
                  {activeModal.type === 'balance_to_hotel' ? 'Balance to Hotel' : 'Expenses by them'} • {activeModal.partnerName}
                </p>
                <p className="text-[11px] text-[#777777] mt-0.5">
                  {activeModal.type === 'balance_to_hotel'
                    ? 'Money owed by partner to hotel'
                    : 'Money owed by hotel to partner'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1 text-[#B8B8B8] hover:text-[#F5F5F5] rounded-md hover:bg-[#1D1D1D] cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-3.5" id="partner-settlement-form">
              {/* Current Amount / Balance Display */}
              <div className="p-3 bg-[#111111] border border-[#2A2A2A] rounded-lg flex items-center justify-between">
                <span className="text-xs text-[#B8B8B8] font-semibold">
                  {activeModal.type === 'balance_to_hotel' ? 'Current Balance:' : 'Current Amount:'}
                </span>
                <span className="text-sm sm:text-base font-black text-[#F2C94C]">
                  {formatCurrency(activeModal.currentBalance)}
                </span>
              </div>

              {/* Validation error if any */}
              {validationError && (
                <div
                  id="settlement-validation-error"
                  className="p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-md text-xs font-semibold"
                >
                  {validationError}
                </div>
              )}

              {/* Settlement Date */}
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Settlement Date
                </label>
                <input
                  type="date"
                  id="settlement-date-input"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  required
                />
              </div>

              {/* Settlement Amount Input */}
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Settlement Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#D4AF37]">
                    ₹
                  </span>
                  <input
                    type="number"
                    id="settlement-amount-input"
                    min="1"
                    max={activeModal.currentBalance}
                    step="any"
                    autoFocus
                    placeholder="Enter amount"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs font-bold text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Notes (Optional) */}
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Notes <span className="text-[#777777] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  id="settlement-notes-input"
                  placeholder="e.g. Cash settled, UPI transfer"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors"
                />
              </div>

              {/* Quick Preset: Full Amount */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setSettlementAmount(activeModal.currentBalance.toString())}
                  className="text-[11px] font-bold text-[#D4AF37] hover:text-[#F2C94C] cursor-pointer underline"
                >
                  Settle Full Amount ({formatCurrency(activeModal.currentBalance)})
                </button>
              </div>

              {/* Modal Actions: Cancel & Confirm */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="w-24 py-2 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-confirm-settlement"
                  disabled={isSubmitting}
                  className="flex-1 py-2 px-3 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer min-h-[40px] text-center disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
