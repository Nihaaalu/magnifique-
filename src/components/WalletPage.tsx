import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import { formatPdfMonth } from '../services/pdfReportGenerator';
import { IrshadWalletEntry } from '../types';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface WalletPageProps {
  onBack: () => void;
  walletEntries: IrshadWalletEntry[];
  onSettleWallet: (monthStart: string, amount: number) => Promise<void>;
  isLoading?: boolean;
}

export const WalletPage: React.FC<WalletPageProps> = ({
  onBack,
  walletEntries = [],
  onSettleWallet,
  isLoading = false,
}) => {
  // Expand / collapse state for Total Outstanding breakdown
  const [isTotalExpanded, setIsTotalExpanded] = useState<boolean>(true);

  // Settlement inputs per closed month (keyed by month_start)
  const [monthSettleInputs, setMonthSettleInputs] = useState<Record<string, string>>({});
  const [submittingMonth, setSubmittingMonth] = useState<string | null>(null);

  // Previous Outstanding (UI local state per Requirement 12)
  const [previousOutstanding, setPreviousOutstanding] = useState<number>(0);
  const [previousSettleInput, setPreviousSettleInput] = useState<string>('');

  // Notifications & Validation errors
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read-only Total Outstanding = SUM of remaining_outstanding of all closed wallet entries
  const totalOutstanding = useMemo(() => {
    return walletEntries.reduce((sum, entry) => {
      const rem = Number(entry.remaining_outstanding);
      return sum + (isNaN(rem) ? 0 : Math.max(0, rem));
    }, 0);
  }, [walletEntries]);

  const showNotification = (msg: string) => {
    setFeedbackMsg(msg);
    setErrorMsg(null);
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  const handleMonthInputChange = (monthStart: string, value: string) => {
    setMonthSettleInputs((prev) => ({
      ...prev,
      [monthStart]: value,
    }));
    if (errorMsg) setErrorMsg(null);
  };

  const handleSettleMonth = async (entry: IrshadWalletEntry, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const inputVal = monthSettleInputs[entry.month_start] || '';
    const parsedAmount = parseFloat(inputVal);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid settlement amount greater than 0.');
      return;
    }

    const remaining = Number(entry.remaining_outstanding) || 0;
    if (parsedAmount > remaining) {
      setErrorMsg('Settlement amount cannot exceed outstanding amount.');
      return;
    }

    setErrorMsg(null);
    setSubmittingMonth(entry.month_start);

    try {
      await onSettleWallet(entry.month_start, parsedAmount);
      const monthLabel = formatPdfMonth(entry.month_start.substring(0, 7)).toUpperCase();
      showNotification(`Settled ${formatCurrency(parsedAmount)} for ${monthLabel}.`);
      setMonthSettleInputs((prev) => ({
        ...prev,
        [entry.month_start]: '',
      }));
    } catch (err: any) {
      console.error('Error settling wallet month:', err);
      setErrorMsg(err.message || 'Failed to settle wallet. Please try again.');
    } finally {
      setSubmittingMonth(null);
    }
  };

  const handleSettlePrevious = (e: React.FormEvent) => {
    e.preventDefault();
    const settleAmount = parseFloat(previousSettleInput);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      setErrorMsg('Please enter a valid settlement amount greater than 0.');
      return;
    }
    if (settleAmount > previousOutstanding) {
      setErrorMsg('Settlement amount cannot exceed outstanding amount.');
      return;
    }
    const newPrev = Math.max(0, previousOutstanding - settleAmount);
    setPreviousOutstanding(newPrev);
    setPreviousSettleInput('');
    showNotification(`Settled ${formatCurrency(settleAmount)} from Previous Outstanding.`);
  };

  return (
    <div id="wallet-page-container" className="max-w-xl mx-auto space-y-4 pb-12 animate-fadeIn px-1 sm:px-0">
      {/* Top Header Bar with Back Button */}
      <div className="flex items-center justify-between gap-2 border-b border-[#222222] pb-3">
        <button
          type="button"
          id="btn-back-to-partners"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1F1F1F] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#D4AF37] rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
      </div>

      {/* Page Title & Partner Label */}
      <div className="pt-1">
        <h1 className="text-base sm:text-lg font-black tracking-wide text-[#F5F5F5] uppercase">
          WALLET
        </h1>
        <p className="text-xs font-bold text-[#D4AF37] tracking-wider uppercase mt-0.5">
          IRSHAD
        </p>
      </div>

      {/* Notifications */}
      {feedbackMsg && (
        <div
          id="wallet-feedback-msg"
          className="p-3 bg-[#111A11] border border-[#1B3E1B] text-[#4ADE80] rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn shadow-xs"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#4ADE80]" />
          <span className="font-semibold">{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div
          id="wallet-error-msg"
          className="p-3 bg-[#201212] border border-[#3D1D1D] text-[#F87171] rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn shadow-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#F87171]" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      <div className="space-y-4 pt-1">
        {/* ==================================================
            1. TOTAL OUTSTANDING BALANCE (READ-ONLY, EXPANDABLE)
            ================================================== */}
        <div className="space-y-2.5">
          <div
            id="card-total-outstanding-balance"
            className="bg-[#141414] border border-[#262626] rounded-xl p-4 relative overflow-hidden shadow-xs"
          >
            <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D4AF37]" />

            {/* Header: Title + Expand/Collapse Button */}
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsTotalExpanded(!isTotalExpanded)}
            >
              <span className="text-xs font-bold text-[#A3A3A3] tracking-wider uppercase">
                TOTAL OUTSTANDING BALANCE
              </span>
              <button
                type="button"
                id="btn-toggle-expand-total"
                className="text-[#D4AF37] hover:text-[#F2C94C] p-1 rounded-md hover:bg-[#1C1C1C] transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                aria-label={isTotalExpanded ? 'Collapse monthly breakdown' : 'Expand monthly breakdown'}
              >
                {isTotalExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Total Outstanding Amount (Strictly Read-Only, No Edit Button) */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg sm:text-xl font-black text-[#F5F5F5] tracking-tight">
                {formatCurrency(totalOutstanding)}
              </span>
              <span className="text-[10px] text-[#888888] uppercase tracking-wider font-semibold">
                {walletEntries.length} {walletEntries.length === 1 ? 'Closed Month' : 'Closed Months'}
              </span>
            </div>

            {/* Expanded Monthly Breakdown (Dynamically Generated from Closed Months Only) */}
            {isTotalExpanded && (
              <div className="mt-3 pt-3 border-t border-[#222222] space-y-4 animate-fadeIn">
                {walletEntries.length === 0 ? (
                  <div className="text-center py-3 text-[#777777] text-xs">
                    {isLoading
                      ? 'Loading closed wallet months...'
                      : 'No closed months in wallet yet.'}
                  </div>
                ) : (
                  walletEntries.map((entry) => {
                    const monthKey = entry.month_start.substring(0, 7);
                    const monthFormatted = formatPdfMonth(monthKey).toUpperCase();
                    const remaining = Number(entry.remaining_outstanding) || 0;
                    const isSettling = submittingMonth === entry.month_start;
                    const inputValue = monthSettleInputs[entry.month_start] || '';

                    return (
                      <div
                        key={entry.month_start}
                        id={`wallet-month-${monthKey}`}
                        className="pl-3 border-l-2 border-[#D4AF37]/60 py-1 space-y-2"
                      >
                        {/* Month Header & Remaining Amount */}
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] font-bold text-[#A3A3A3] tracking-wider uppercase block">
                            {monthFormatted}
                          </span>
                          <span className="text-sm sm:text-base font-black text-[#F5F5F5]">
                            {formatCurrency(remaining)}
                          </span>
                        </div>

                        {/* Individual Settlement Input & Button */}
                        <form
                          onSubmit={(e) => handleSettleMonth(entry, e)}
                          className="flex items-center gap-2 pt-1"
                        >
                          <label
                            htmlFor={`input-settle-${monthKey}`}
                            className="text-[11px] font-bold text-[#D4AF37] tracking-wider uppercase shrink-0"
                          >
                            SETTLE:
                          </label>
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-[#D4AF37]">
                              ₹
                            </span>
                            <input
                              type="number"
                              id={`input-settle-${monthKey}`}
                              inputMode="decimal"
                              step="any"
                              placeholder="Enter amount"
                              disabled={isSettling || remaining <= 0}
                              value={inputValue}
                              onChange={(e) =>
                                handleMonthInputChange(entry.month_start, e.target.value)
                              }
                              className="w-full pl-6 pr-2.5 py-1.5 bg-[#0C0C0C] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[38px] focus:outline-none focus:border-[#D4AF37] transition-colors disabled:opacity-50"
                            />
                          </div>
                          <button
                            type="submit"
                            id={`btn-settle-${monthKey}`}
                            disabled={
                              isSettling ||
                              !inputValue ||
                              parseFloat(inputValue) <= 0 ||
                              remaining <= 0
                            }
                            className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#E5C158] active:bg-[#BFA030] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] font-black text-xs uppercase tracking-wider rounded-lg min-h-[38px] transition-all cursor-pointer shrink-0 shadow-xs flex items-center justify-center gap-1"
                          >
                            {isSettling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A0A0A]" />
                            ) : (
                              <span>SETTLE</span>
                            )}
                          </button>
                        </form>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* ==================================================
            2. PREVIOUS OUTSTANDING (UI LOCAL PER REQ 12)
            ================================================== */}
        <div className="space-y-2.5 pt-2">
          <div
            id="card-previous-outstanding"
            className="bg-[#141414] border border-[#262626] rounded-xl p-4 relative overflow-hidden shadow-xs"
          >
            <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D4AF37]" />
            <span className="text-xs font-bold text-[#A3A3A3] tracking-wider uppercase block">
              PREVIOUS OUTSTANDING
            </span>
            <span className="text-lg sm:text-xl font-black text-[#F5F5F5] block mt-1 tracking-tight">
              {formatCurrency(previousOutstanding)}
            </span>
          </div>

          {/* Settle input for Previous Outstanding */}
          <form onSubmit={handleSettlePrevious} className="flex items-center gap-2 px-0.5">
            <label
              htmlFor="input-settle-previous"
              className="text-xs font-bold text-[#D4AF37] tracking-wider uppercase shrink-0"
            >
              SETTLE:
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-[#D4AF37]">
                ₹
              </span>
              <input
                type="number"
                id="input-settle-previous"
                inputMode="decimal"
                step="any"
                placeholder="Enter amount"
                value={previousSettleInput}
                onChange={(e) => setPreviousSettleInput(e.target.value)}
                className="w-full pl-7 pr-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[42px] focus:outline-none focus:border-[#D4AF37] transition-colors"
              />
            </div>
            <button
              type="submit"
              id="btn-submit-settle-previous"
              disabled={!previousSettleInput || parseFloat(previousSettleInput) <= 0}
              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#E5C158] active:bg-[#BFA030] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] font-black text-xs uppercase tracking-wider rounded-lg min-h-[42px] transition-all cursor-pointer shrink-0 shadow-xs"
            >
              SETTLE
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
