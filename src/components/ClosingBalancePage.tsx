import React, { useState, useMemo } from 'react';
import {
  IncomeRecord,
  ExpenseRecord,
  AccountMonthRow,
  PartnerSettlement,
  Partner,
} from '../types';
import {
  formatCurrency,
} from '../utils/formatters';
import {
  getAllAvailableAccountMonths,
} from '../utils/accountBalanceUtils';
import {
  calculateClosingProfitDistribution,
  ClosingPartnerProfitItem,
} from '../utils/partnerBalanceUtils';
import {
  generateClosingBalancePdf,
  formatPdfMonth,
} from '../services/pdfReportGenerator';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RotateCcw,
  Check,
} from 'lucide-react';

interface ClosingBalancePageProps {
  initialMonth: string; // e.g. '2026-09'
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  accountMonths: AccountMonthRow[];
  partnerSettlements: PartnerSettlement[];
  partners: Partner[];
  onBack: () => void;
  onCloseMonth?: (monthStr: string, closingBalance: number) => Promise<void>;
  onReopenMonth?: (monthStr: string) => Promise<void>;
}

export const ClosingBalancePage: React.FC<ClosingBalancePageProps> = ({
  initialMonth,
  incomeRecords,
  expenseRecords,
  accountMonths,
  partnerSettlements,
  partners,
  onBack,
  onCloseMonth,
  onReopenMonth,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || '2026-09');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Available accounting months
  const availableMonths = useMemo(() => {
    return getAllAvailableAccountMonths(incomeRecords, expenseRecords, accountMonths);
  }, [incomeRecords, expenseRecords, accountMonths]);

  // Authoritative Calculation from live transaction data
  const closingData = useMemo(() => {
    return calculateClosingProfitDistribution(
      selectedMonth,
      incomeRecords,
      expenseRecords,
      accountMonths,
      partnerSettlements,
      partners
    );
  }, [selectedMonth, incomeRecords, expenseRecords, accountMonths, partnerSettlements, partners]);

  const monthFormatted = useMemo(() => {
    return formatPdfMonth(selectedMonth);
  }, [selectedMonth]);

  // Handle final month close
  const handleConfirmClose = async () => {
    if (!onCloseMonth) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await onCloseMonth(selectedMonth, closingData.closingBalance);
      setIsConfirmModalOpen(false);
      setFeedbackMsg(`Month ${monthFormatted} closed successfully.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error closing month:', err);
      setErrorMsg(err.message || 'Failed to close month. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle reopen month
  const handleConfirmReopen = async () => {
    if (!onReopenMonth) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await onReopenMonth(selectedMonth);
      setIsReopenModalOpen(false);
      setFeedbackMsg(`Month ${monthFormatted} has been reopened.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error reopening month:', err);
      setErrorMsg(err.message || 'Failed to reopen month.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle PDF Export
  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    setErrorMsg(null);
    try {
      const doc = generateClosingBalancePdf(
        selectedMonth,
        incomeRecords,
        expenseRecords,
        accountMonths,
        partnerSettlements,
        partners
      );
      const fileName = `MAGNIFIQUE_2.0_Closing_Balance_${selectedMonth}.pdf`;
      doc.save(fileName);
      setFeedbackMsg(`Closing Balance PDF downloaded: ${fileName}`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error generating Closing Balance PDF:', err);
      setErrorMsg(err.message || 'Failed to download Closing Balance PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div id="closing-balance-page" className="max-w-xl mx-auto space-y-4 pb-12 animate-fadeIn px-2 sm:px-0">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-[#222222] pb-3">
        <button
          type="button"
          id="btn-back-to-analytics"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1F1F1F] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#D4AF37] rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-1.5">
          <select
            id="select-closing-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] text-xs font-bold px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[#D4AF37] cursor-pointer"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatPdfMonth(m)}
              </option>
            ))}
          </select>

          {closingData.isClosed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F87171] bg-[#201212] border border-[#3D1D1D] px-2 py-1.5 rounded-lg shadow-xs">
              <Lock className="w-3 h-3" />
              <span>Closed</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4ADE80] bg-[#122014] border border-[#1D3D24] px-2 py-1.5 rounded-lg shadow-xs">
              <Unlock className="w-3 h-3" />
              <span>Active</span>
            </span>
          )}

          <button
            type="button"
            id="btn-export-closing-pdf"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="p-1.5 bg-[#141414] hover:bg-[#1F1F1F] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#D4AF37] rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Download Closing Balance PDF"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Page Title & Month */}
      <div className="flex items-baseline justify-between pt-1">
        <div>
          <h1 className="text-base sm:text-lg font-black tracking-wide text-[#F5F5F5] uppercase">
            CLOSING BALANCE
          </h1>
          <p className="text-xs font-bold text-[#D4AF37]">
            {monthFormatted}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {feedbackMsg && (
        <div className="p-2.5 bg-[#141414] border border-[#D4AF37] text-[#D4AF37] rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#D4AF37]" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-[#201212] border border-[#F87171] text-[#F87171] rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#F87171]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ================================================== */}
      {/* 3 TOP METRIC CARDS */}
      {/* ================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Total Income Card */}
        <div className="bg-[#141414] border border-[#222222] rounded-xl p-3 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#22C55E]" />
          <span className="text-[11px] font-bold text-[#22C55E] tracking-wider uppercase block">
            TOTAL INCOME
          </span>
          <span className="text-base sm:text-lg font-black text-[#F5F5F5] block mt-1 tracking-tight">
            {formatCurrency(closingData.totalIncome)}
          </span>
        </div>

        {/* Total Expense Card */}
        <div className="bg-[#141414] border border-[#222222] rounded-xl p-3 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#EF4444]" />
          <span className="text-[11px] font-bold text-[#EF4444] tracking-wider uppercase block">
            TOTAL EXPENSE
          </span>
          <span className="text-base sm:text-lg font-black text-[#F5F5F5] block mt-1 tracking-tight">
            {formatCurrency(closingData.totalExpense)}
          </span>
        </div>

        {/* Closing Balance Card */}
        <div className="bg-[#141414] border border-[#D4AF37]/50 rounded-xl p-3 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#D4AF37]" />
          <span className="text-[11px] font-bold text-[#D4AF37] tracking-wider uppercase block">
            CLOSING BALANCE
          </span>
          <span className="text-base sm:text-lg font-black text-[#F5F5F5] block mt-1 tracking-tight">
            {formatCurrency(closingData.closingBalance)}
          </span>
        </div>
      </div>

      {/* ================================================== */}
      {/* PROFIT DISTRIBUTION SECTION */}
      {/* ================================================== */}
      <div className="space-y-2.5 pt-1">
        {/* Section Header Banner */}
        <div className="bg-[#141414] border border-[#222222] rounded-lg px-3 py-2 flex items-center justify-between relative overflow-hidden shadow-xs">
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D4AF37]" />
          <span className="text-xs font-black text-[#F5F5F5] tracking-wider uppercase pl-1">
            PROFIT DISTRIBUTION
          </span>
          <span className="text-[11px] font-bold text-[#D4AF37] tracking-wide">
            100% PROFIT ALLOCATION
          </span>
        </div>

        {/* Partner Cards Vertical Stack */}
        <div className="space-y-2.5">
          {closingData.partners.map((partner: ClosingPartnerProfitItem) => {
            const hasAdjustment = partner.netType !== 'NONE' && partner.netAdjustment > 0;

            if (partner.isIrshad) {
              return (
                <div
                  key={partner.partnerName}
                  className="bg-[#141414] border border-[#262626] rounded-xl p-3.5 relative overflow-hidden shadow-xs space-y-1.5"
                >
                  <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D4AF37]" />

                  {/* Line 1: IRSHAD — 12.5% — ₹baseProfit */}
                  <div className="text-xs sm:text-sm font-bold text-[#F5F5F5] flex items-baseline justify-between">
                    <span>
                      {partner.partnerName} — {partner.percentageStr}
                    </span>
                    <span className="font-black text-[#F5F5F5] text-sm">
                      {formatCurrency(partner.baseProfit)}
                    </span>
                  </div>

                  {/* Line 2: IRSHAD PROFIT — ₹baseProfit */}
                  <div className="text-xs font-semibold text-[#B8B8B8] pl-3 flex items-baseline justify-between border-t border-[#1F1F1F] pt-1.5">
                    <span className="text-[#D4AF37] font-bold">
                      {partner.partnerName} PROFIT
                    </span>
                    <span className="font-black text-[#F5F5F5] text-sm">
                      {formatCurrency(partner.partnerProfit)}
                    </span>
                  </div>

                  {/* Line 3: TOTAL OUTSTANDING — ₹irshadTotalOutstanding */}
                  <div className="text-xs font-semibold text-[#888888] pl-3 flex items-baseline justify-between border-t border-[#1F1F1F] pt-1.5">
                    <span className="text-[#999999] font-bold">
                      TOTAL OUTSTANDING
                    </span>
                    <span className="font-black text-[#F5F5F5] text-sm">
                      {formatCurrency(partner.irshadTotalOutstanding || 0)}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={partner.partnerName}
                className="bg-[#141414] border border-[#262626] rounded-xl p-3.5 relative overflow-hidden shadow-xs space-y-1.5"
              >
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#D4AF37]" />

                {/* Line 1: PARTNER — SHARE% — ₹baseProfit */}
                <div className="text-xs sm:text-sm font-bold text-[#F5F5F5] flex items-baseline justify-between">
                  <span>
                    {partner.partnerName} — {partner.percentageStr}
                  </span>
                  <span className="font-black text-[#F5F5F5] text-sm">
                    {formatCurrency(partner.baseProfit)}
                  </span>
                </div>

                {/* Line 2: EXPENSE/BALANCE — ₹netAdjustment (Indented) */}
                {hasAdjustment && (
                  <div className="text-xs font-semibold text-[#9E9E9E] pl-3 flex items-baseline justify-between border-t border-[#1F1F1F] pt-1.5">
                    <span className="font-medium">
                      {partner.netType === 'EXPENSE' ? 'EXPENSE' : 'BALANCE'}
                    </span>
                    <span className="font-black text-[#F5F5F5]">
                      {formatCurrency(partner.netAdjustment)}
                    </span>
                  </div>
                )}

                {/* Line 3: PARTNER PROFIT — ₹partnerProfit (Indented) */}
                <div className="text-xs font-semibold text-[#B8B8B8] pl-3 flex items-baseline justify-between border-t border-[#1F1F1F] pt-1.5">
                  <span className="text-[#D4AF37] font-bold">
                    {partner.partnerName} PROFIT
                  </span>
                  <span className="font-black text-[#F5F5F5] text-sm">
                    {formatCurrency(partner.partnerProfit)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================== */}
      {/* FINAL ACTION BUTTON AREA */}
      {/* ================================================== */}
      <div className="pt-3">
        {closingData.isClosed ? (
          <div className="space-y-2">
            <div className="p-3 bg-[#141414] border border-[#2A2A2A] rounded-xl text-center shadow-xs">
              <span className="text-xs font-bold text-[#A3A3A3] block">
                Month {monthFormatted} is officially closed.
              </span>
              <span className="text-[11px] text-[#737373] block mt-0.5">
                Closing Balance: {formatCurrency(closingData.closingBalance)}
              </span>
            </div>

            <div className="flex gap-2">
              {onReopenMonth && (
                <button
                  type="button"
                  id="btn-reopen-month"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="flex-1 py-3 bg-[#1A1A1A] hover:bg-[#242424] border border-[#333333] hover:border-[#D4AF37] text-[#D4AF37] font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen Month</span>
                </button>
              )}

              <button
                type="button"
                id="btn-download-pdf-closed"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#C5A028] text-[#0A0A0A] font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Download Official PDF</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            id="btn-confirm-and-close-balance"
            onClick={() => setIsConfirmModalOpen(true)}
            className="w-full py-3.5 bg-[#D4AF37] hover:bg-[#C5A028] text-[#0A0A0A] font-black text-xs sm:text-sm tracking-wide uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99]"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>CONFIRM & CLOSE BALANCE</span>
          </button>
        )}
      </div>

      {/* ================================================== */}
      {/* SIMPLE CONFIRMATION MODAL */}
      {/* ================================================== */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#141414] border border-[#2E2E2E] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#222222] pb-3">
              <h3 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
                Close {monthFormatted}?
              </h3>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-[#888888] hover:text-[#F5F5F5] p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl flex items-center justify-between">
                <span className="text-[#A3A3A3] font-bold">Closing Balance:</span>
                <span className="text-sm font-black text-[#D4AF37]">
                  {formatCurrency(closingData.closingBalance)}
                </span>
              </div>

              <p className="text-[#888888] text-[11px] leading-relaxed pt-1">
                Partner settlements will be finalized for {monthFormatted}.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#B8B8B8] font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                type="button"
                id="btn-modal-confirm-close"
                onClick={handleConfirmClose}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-[#D4AF37] hover:bg-[#C5A028] text-[#0A0A0A] font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>CONFIRM & CLOSE</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* SIMPLE REOPEN CONFIRMATION MODAL */}
      {/* ================================================== */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#141414] border border-[#2E2E2E] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#222222] pb-3">
              <h3 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
                Reopen {monthFormatted}?
              </h3>
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                className="text-[#888888] hover:text-[#F5F5F5] p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[#A3A3A3] text-xs leading-relaxed">
              This will re-open {monthFormatted} for active transaction editing.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#B8B8B8] font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                type="button"
                id="btn-modal-confirm-reopen"
                onClick={handleConfirmReopen}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-[#D4AF37] hover:bg-[#C5A028] text-[#0A0A0A] font-black text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>REOPEN MONTH</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
