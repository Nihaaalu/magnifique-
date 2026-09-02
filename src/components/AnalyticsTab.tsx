import React, { useState } from 'react';
import {
  IncomeRecord,
  ExpenseRecord,
  ProfitShareResult,
  AccountMonthRow,
  PartnerSettlement,
  Partner,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
  getCurrentMonthString,
} from '../utils/formatters';
import {
  generateDailyAccountsPdf,
  generateMonthlyAccountsPdf,
  formatPdfMonth,
} from '../services/pdfReportGenerator';
import {
  calculateAllMonthsSummary,
  getAllAvailableAccountDates,
  getAllAvailableAccountMonths,
  MonthBalanceSummary,
} from '../utils/accountBalanceUtils';
import {
  calculatePartnerBalancesForDate,
  calculatePartnerBalancesForMonth,
} from '../utils/partnerBalanceUtils';
import {
  Download,
  Calculator,
  Loader2,
  Lock,
  Unlock,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Shield,
} from 'lucide-react';
import { ChangePinModal } from './ChangePinModal';

interface AnalyticsTabProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  accountMonths?: AccountMonthRow[];
  partnerSettlements?: PartnerSettlement[];
  partners?: Partner[];
  onCloseMonth?: (monthStr: string, closingBalance: number) => Promise<void>;
  onReopenMonth?: (monthStr: string) => Promise<void>;
  onLockApp?: () => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  incomeRecords,
  expenseRecords,
  accountMonths = [],
  partnerSettlements = [],
  partners = [],
  onCloseMonth,
  onReopenMonth,
  onLockApp,
}) => {
  const [profitShare, setProfitShare] = useState<ProfitShareResult | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [isProcessingClose, setIsProcessingClose] = useState<boolean>(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState<boolean>(false);

  const todayStr = getTodayDateString();
  const currentMonthStr = getCurrentMonthString();

  // Available dates with actual account data (at least 1 income or 1 expense)
  const availableDates = getAllAvailableAccountDates(incomeRecords, expenseRecords);
  
  // Available months with actual account data
  const availableMonths = getAllAvailableAccountMonths(
    incomeRecords,
    expenseRecords,
    accountMonths
  );

  // Selected Daily Date state for date navigator
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(() => {
    return availableDates.length > 0 ? availableDates[availableDates.length - 1] : todayStr;
  });

  // Selected Month for Monthly Summary & Monthly Report
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (availableMonths.includes(currentMonthStr)) {
      return currentMonthStr;
    }
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthStr;
  });

  const [selectedReportMonth, setSelectedReportMonth] = useState<string>(() => {
    if (availableMonths.includes(currentMonthStr)) {
      return currentMonthStr;
    }
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthStr;
  });

  // Close Month Dialog State
  const [closeStep, setCloseStep] = useState<1 | 2 | null>(null);
  const [monthToClose, setMonthToClose] = useState<string | null>(null);

  // Compute all months summary using persistent account_months and partnerSettlements
  const allMonthsSummary = calculateAllMonthsSummary(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
  );

  // Active Daily Date in availableDates
  const dateIdx = availableDates.indexOf(selectedDailyDate);
  const activeDate = dateIdx !== -1 ? selectedDailyDate : (availableDates[availableDates.length - 1] || todayStr);
  const activeIndex = availableDates.indexOf(activeDate);

  const handlePrevDate = () => {
    if (activeIndex > 0) {
      setSelectedDailyDate(availableDates[activeIndex - 1]);
    }
  };

  const handleNextDate = () => {
    if (activeIndex < availableDates.length - 1 && activeIndex !== -1) {
      setSelectedDailyDate(availableDates[activeIndex + 1]);
    }
  };

  // Helper to format date for horizontal navigator: e.g. "30 AUG 2026"
  const formatNavigatorDate = (d: string): string => {
    if (!d) return 'NO DATA';
    try {
      const [year, month, day] = d.split('-');
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const mName = monthNames[parseInt(month, 10) - 1] || month;
      return `${parseInt(day, 10)} ${mName} ${year}`;
    } catch {
      return d;
    }
  };

  const currentSummary: MonthBalanceSummary = allMonthsSummary[selectedMonth] || {
    month: selectedMonth,
    monthStart: `${selectedMonth}-01`,
    openingBalance: 0,
    totalIncome: 0,
    totalPaid: 0,
    totalBalance: 0,
    totalExpense: 0,
    settlementToHotel: 0,
    settlementFromHotel: 0,
    closingBalance: 0,
    isClosed: false,
    closedAt: null,
    firstDate: `${selectedMonth}-01`,
    lastDate: `${selectedMonth}-30`,
  };

  // Partner running balances for active date and selected report month
  const dailyPartnerBalances = React.useMemo(() => {
    if (!activeDate) return [];
    return calculatePartnerBalancesForDate(
      activeDate,
      incomeRecords,
      expenseRecords,
      partnerSettlements,
      partners
    ).filter((pb) => !pb.isZero);
  }, [activeDate, incomeRecords, expenseRecords, partnerSettlements, partners]);

  const monthlyPartnerBalances = React.useMemo(() => {
    if (!selectedReportMonth) return [];
    return calculatePartnerBalancesForMonth(
      selectedReportMonth,
      incomeRecords,
      expenseRecords,
      partnerSettlements,
      partners
    ).filter((pb) => !pb.isZero);
  }, [selectedReportMonth, incomeRecords, expenseRecords, partnerSettlements, partners]);

  // 1. Download Selected Daily Date Accounts as PDF
  const handleDownloadDaily = async () => {
    if (generatingType || !activeDate) return;
    setGeneratingType(activeDate);
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const doc = generateDailyAccountsPdf(
        activeDate,
        incomeRecords,
        expenseRecords,
        accountMonths,
        partnerSettlements,
        partners
      );
      const fileName = `MAGNIFIQUE_2.0_Daily_Accounts_${activeDate}.pdf`;
      doc.save(fileName);

      setDownloadMsg(`PDF downloaded successfully: ${fileName}`);
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to generate daily accounts PDF:', err);
      setDownloadError(err.message || 'Failed to generate PDF report. Please try again.');
    } finally {
      setGeneratingType(null);
    }
  };

  // 2. Download Selected Month's Accounts as PDF
  const handleDownloadMonth = async (monthStr: string) => {
    if (generatingType) return;
    setGeneratingType(monthStr);
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const doc = generateMonthlyAccountsPdf(
        monthStr,
        incomeRecords,
        expenseRecords,
        accountMonths,
        partnerSettlements,
        partners
      );
      const fileName = `MAGNIFIQUE_2.0_Monthly_Accounts_${monthStr}.pdf`;
      doc.save(fileName);

      setDownloadMsg(`PDF downloaded successfully: ${fileName}`);
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to generate monthly accounts PDF:', err);
      setDownloadError(err.message || 'Failed to generate PDF report. Please try again.');
    } finally {
      setGeneratingType(null);
    }
  };

  // Close Month Workflows (Two-step confirmation)
  const handleInitiateClose = (monthStr: string) => {
    setMonthToClose(monthStr);
    setCloseStep(1);
  };

  const handleConfirmStep1 = () => {
    setCloseStep(2);
  };

  const handleConfirmStep2 = async () => {
    if (!monthToClose) return;

    const summary = allMonthsSummary[monthToClose];
    if (summary) {
      setIsProcessingClose(true);
      try {
        if (onCloseMonth) {
          await onCloseMonth(monthToClose, summary.closingBalance);
        }
        setDownloadMsg(
          `Month ${formatPdfMonth(
            monthToClose
          )} has been closed. Final closing balance (${formatCurrency(summary.closingBalance)}) is set as next month's opening balance.`
        );
      } catch (err: any) {
        console.error('Failed to close month in Supabase:', err);
        setDownloadError(err.message || 'Failed to close month in Supabase.');
      } finally {
        setIsProcessingClose(false);
      }
    }

    setCloseStep(null);
    setMonthToClose(null);
    setTimeout(() => setDownloadMsg(null), 4500);
  };

  const handleCancelClose = () => {
    setCloseStep(null);
    setMonthToClose(null);
  };

  const handleReopenMonth = async (monthStr: string) => {
    try {
      if (onReopenMonth) {
        await onReopenMonth(monthStr);
      }
      setDownloadMsg(`Month ${formatPdfMonth(monthStr)} re-opened.`);
      setTimeout(() => setDownloadMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to re-open month:', err);
      setDownloadError(err.message || 'Failed to re-open month.');
    }
  };

  // Generate Profit Sharing for Selected Month
  const handleGenerateProfitShare = () => {
    const monthInc = incomeRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
    const monthExp = expenseRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));

    const totalInc = monthInc.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const totalExp = monthExp.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const profit = Math.max(0, totalInc - totalExp);

    const share25 = Math.round((profit * 0.25) * 100) / 100;

    setProfitShare({
      totalIncome: totalInc,
      totalExpense: totalExp,
      profit: profit,
      ansariIrshadShare: share25,
      mussaddiqShare: share25,
      sathishShare: share25,
      yogeshShare: share25,
    });
  };

  return (
    <div id="analytics-tab-container" className="space-y-6">
      {/* Feedback Alert - Success */}
      {downloadMsg && (
        <div
          id="analytics-download-success"
          className="p-3 bg-[#171717] border border-[#D4AF37]/50 text-[#D4AF37] rounded-xl text-xs font-semibold flex items-center justify-between shadow-md animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{downloadMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadMsg(null)}
            className="text-[#B8B8B8] hover:text-[#F5F5F5] text-xs cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Feedback Alert - Error */}
      {downloadError && (
        <div
          id="analytics-download-error"
          className="p-3 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-xl text-xs font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0" />
            <span>{downloadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-[#f87171] hover:text-[#ffffff] text-xs cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================
          SECTION A: DOWNLOAD REPORTS
          ================================================== */}
      <section id="section-download-reports" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              DOWNLOAD REPORTS
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2 py-0.5 rounded border border-[#2A2A2A]">
            PDF Export
          </span>
        </div>

        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-3.5">
          {/* 1. Daily Accounts Horizontal Date Navigator */}
          <div className="p-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">
                Daily Account Report
              </span>
              <span className="text-[10px] text-[#777777] font-medium">
                {availableDates.length > 0 ? `${activeIndex + 1} of ${availableDates.length} available dates` : 'No account data'}
              </span>
            </div>

            {/* Horizontal Navigator Bar: <   30 AUG 2026   > + Download Button */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="flex items-center justify-between w-full sm:flex-1 bg-[#171717] border border-[#2A2A2A] rounded-lg p-1">
                <button
                  type="button"
                  id="btn-daily-prev-date"
                  onClick={handlePrevDate}
                  disabled={activeIndex <= 0 || availableDates.length === 0}
                  className={`p-2 px-3 rounded-md text-[#F5F5F5] transition-colors flex items-center justify-center cursor-pointer min-h-[38px] ${
                    activeIndex <= 0 || availableDates.length === 0
                      ? 'opacity-25 cursor-not-allowed text-[#555555]'
                      : 'hover:bg-[#252525] text-[#D4AF37] hover:text-[#F2C94C]'
                  }`}
                  title="Previous available date"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="text-center px-3 py-1 min-w-[150px]">
                  <span className="text-xs sm:text-sm font-black text-[#F5F5F5] tracking-wider block">
                    {availableDates.length > 0 ? formatNavigatorDate(activeDate) : 'NO ACCOUNTS'}
                  </span>
                  {availableDates.length > 0 && (
                    <span className="text-[10px] text-[#777777] font-medium block">
                      {activeDate}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  id="btn-daily-next-date"
                  onClick={handleNextDate}
                  disabled={activeIndex >= availableDates.length - 1 || activeIndex === -1 || availableDates.length === 0}
                  className={`p-2 px-3 rounded-md text-[#F5F5F5] transition-colors flex items-center justify-center cursor-pointer min-h-[38px] ${
                    activeIndex >= availableDates.length - 1 || activeIndex === -1 || availableDates.length === 0
                      ? 'opacity-25 cursor-not-allowed text-[#555555]'
                      : 'hover:bg-[#252525] text-[#D4AF37] hover:text-[#F2C94C]'
                  }`}
                  title="Next available date"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                id="btn-download-daily-pdf"
                onClick={handleDownloadDaily}
                disabled={generatingType !== null || availableDates.length === 0}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-4 py-2.5 rounded-lg font-black text-xs transition-all shadow-xs cursor-pointer min-h-[42px] shrink-0 ${
                  generatingType === activeDate ? 'opacity-80' : ''
                } ${availableDates.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {generatingType === activeDate ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Daily PDF</span>
                  </>
                )}
              </button>
            </div>

            {/* Daily Partner Running Balances (shown only if non-zero) */}
            {dailyPartnerBalances.length > 0 && (
              <div
                id="daily-report-partner-balances"
                className="pt-2 border-t border-[#222222] flex flex-wrap items-center gap-1.5"
              >
                <span className="text-[10px] text-[#777777] font-bold uppercase tracking-wider mr-1">
                  Partner Balance:
                </span>
                {dailyPartnerBalances.map((pb) => (
                  <span
                    key={pb.partnerName}
                    className="text-[11px] font-black px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor:
                        pb.direction === 'to_hotel'
                          ? 'rgba(212, 175, 55, 0.1)'
                          : 'rgba(74, 222, 128, 0.1)',
                      borderColor: pb.direction === 'to_hotel' ? '#D4AF37' : '#4ade80',
                      color: pb.direction === 'to_hotel' ? '#F2C94C' : '#4ade80',
                    }}
                  >
                    {pb.displayLabel}: {formatCurrency(pb.displayAmount)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 2. Monthly Accounts Selector */}
          <div className="p-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">
                Monthly Account Report
              </span>
              <span className="text-[10px] text-[#777777] font-medium">
                {availableMonths.length} {availableMonths.length === 1 ? 'month' : 'months'} with data
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <div className="w-full sm:flex-1">
                <select
                  id="select-download-month"
                  value={selectedReportMonth}
                  onChange={(e) => setSelectedReportMonth(e.target.value)}
                  disabled={availableMonths.length === 0}
                  className="w-full px-3 py-2 bg-[#171717] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[42px] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                >
                  {availableMonths.length === 0 ? (
                    <option value="">No months with data</option>
                  ) : (
                    availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {formatPdfMonth(m)} {allMonthsSummary[m]?.isClosed ? '(Closed)' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button
                type="button"
                id="btn-download-monthly-pdf"
                onClick={() => handleDownloadMonth(selectedReportMonth)}
                disabled={generatingType !== null || availableMonths.length === 0 || !selectedReportMonth}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-4 py-2.5 rounded-lg font-black text-xs transition-all shadow-xs cursor-pointer min-h-[42px] shrink-0 ${
                  generatingType === selectedReportMonth ? 'opacity-80' : ''
                } ${availableMonths.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {generatingType === selectedReportMonth ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Monthly PDF</span>
                  </>
                )}
              </button>
            </div>

            {/* Monthly Partner Running Balances (shown only if non-zero) */}
            {monthlyPartnerBalances.length > 0 && (
              <div
                id="monthly-report-partner-balances"
                className="pt-2 border-t border-[#222222] flex flex-wrap items-center gap-1.5"
              >
                <span className="text-[10px] text-[#777777] font-bold uppercase tracking-wider mr-1">
                  Partner Balance:
                </span>
                {monthlyPartnerBalances.map((pb) => (
                  <span
                    key={pb.partnerName}
                    className="text-[11px] font-black px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor:
                        pb.direction === 'to_hotel'
                          ? 'rgba(212, 175, 55, 0.1)'
                          : 'rgba(74, 222, 128, 0.1)',
                      borderColor: pb.direction === 'to_hotel' ? '#D4AF37' : '#4ade80',
                      color: pb.direction === 'to_hotel' ? '#F2C94C' : '#4ade80',
                    }}
                  >
                    {pb.displayLabel}: {formatCurrency(pb.displayAmount)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION B: MONTHLY SUMMARY & BALANCE SYSTEM
          ================================================== */}
      <section id="section-monthly-summary" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              MONTHLY SUMMARY
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Month Selector Dropdown (Only months with data) */}
            <select
              id="select-summary-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={availableMonths.length === 0}
              className="bg-[#111111] border border-[#2A2A2A] text-[#F5F5F5] text-xs font-bold px-2.5 py-1.5 rounded-md focus:outline-none focus:border-[#D4AF37] cursor-pointer"
            >
              {availableMonths.length === 0 ? (
                <option value="">No months with data</option>
              ) : (
                availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatPdfMonth(m)} {allMonthsSummary[m]?.isClosed ? '(Closed)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-4">
          {/* Header with status badge */}
          <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
            <div>
              <span className="text-sm sm:text-base font-extrabold text-[#F5F5F5] block">
                {formatPdfMonth(selectedMonth)}
              </span>
              <span className="text-[11px] text-[#777777]">
                Running balance (Opening + Income - Expense)
              </span>
            </div>
            <div>
              {currentSummary.isClosed ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#f87171] bg-[#201212] border border-[#3d1d1d] px-2.5 py-1 rounded-md">
                  <Lock className="w-3 h-3" />
                  <span>Closed & Locked</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4ade80] bg-[#122014] border border-[#1d3d24] px-2.5 py-1 rounded-md">
                  <Unlock className="w-3 h-3" />
                  <span>Active (Running)</span>
                </span>
              )}
            </div>
          </div>

          {/* 6 Metric Cards for Monthly Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {/* 1. Opening Balance */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#B8B8B8] font-bold block uppercase tracking-wider">
                Opening Balance
              </span>
              <span className="text-sm sm:text-base font-black text-[#F5F5F5] block">
                {formatCurrency(currentSummary.openingBalance)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                {currentSummary.firstDate}
              </span>
            </div>

            {/* 2. Total Income (Billed) */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#4ade80] font-bold block uppercase tracking-wider">
                Total Income
              </span>
              <span className="text-sm sm:text-base font-black text-[#4ade80] block">
                {formatCurrency(currentSummary.totalIncome)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Total billed amount
              </span>
            </div>

            {/* 3. Received (Renamed from Total Paid) */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#38bdf8] font-bold block uppercase tracking-wider">
                Received
              </span>
              <span className="text-sm sm:text-base font-black text-[#38bdf8] block">
                {formatCurrency(currentSummary.totalPaid)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Actual cash received
              </span>
            </div>

            {/* 4. Total Balance (Unpaid) */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#fb923c] font-bold block uppercase tracking-wider">
                Total Balance
              </span>
              <span className="text-sm sm:text-base font-black text-[#fb923c] block">
                {formatCurrency(currentSummary.totalBalance)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Unpaid / Receivables
              </span>
            </div>

            {/* 5. Total Expense */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-1">
              <span className="text-[10px] text-[#f87171] font-bold block uppercase tracking-wider">
                Total Expense
              </span>
              <span className="text-sm sm:text-base font-black text-[#f87171] block">
                {formatCurrency(currentSummary.totalExpense)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                All categories
              </span>
            </div>

            {/* 6. Closing Balance */}
            <div className="p-3 bg-[#111111] rounded-lg border border-[#D4AF37]/30 space-y-1">
              <span className="text-[10px] text-[#D4AF37] font-bold block uppercase tracking-wider">
                Closing Balance
              </span>
              <span className="text-sm sm:text-base font-black text-[#F2C94C] block">
                {formatCurrency(currentSummary.closingBalance)}
              </span>
              <span className="text-[9px] text-[#777777] block">
                Opening + Income - Exp
              </span>
            </div>
          </div>

          {/* Action Row: CLOSE BALANCE FOR THIS MONTH or Reopen */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleDownloadMonth(selectedMonth)}
              disabled={generatingType !== null || !selectedMonth}
              className="w-full sm:w-auto px-4 py-2 bg-[#111111] hover:bg-[#1D1D1D] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#F5F5F5] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Download {formatPdfMonth(selectedMonth)} PDF</span>
            </button>

            {!currentSummary.isClosed ? (
              <button
                type="button"
                id="btn-close-month"
                onClick={() => handleInitiateClose(selectedMonth)}
                className="w-full sm:w-auto px-4 py-2 bg-[#201212] hover:bg-[#3d1d1d] border border-[#f87171]/40 text-[#f87171] rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>CLOSE BALANCE FOR THIS MONTH</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleReopenMonth(selectedMonth)}
                className="w-full sm:w-auto px-3 py-1.5 bg-[#111111] hover:bg-[#1D1D1D] border border-[#2A2A2A] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Unlock className="w-3 h-3 text-[#D4AF37]" />
                <span>Re-open Month</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION C: PROFIT SHARING
          ================================================== */}
      <section id="section-profit-sharing" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              PROFIT SHARING
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-0.5 rounded border border-[#2A2A2A]">
            4 Shares (25% each)
          </span>
        </div>

        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-3.5">
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              id="btn-generate-profit-share"
              onClick={handleGenerateProfitShare}
              className="w-full py-3 px-5 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs sm:text-sm font-black tracking-widest uppercase transition-all cursor-pointer min-h-[46px] shadow-xs flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              <span>GENERATE PROFIT SHARE FOR {formatPdfMonth(selectedMonth).toUpperCase()}</span>
            </button>
          </div>

          {/* Results strictly shown AFTER user presses the button */}
          {profitShare ? (
            <div className="space-y-3.5 pt-1" id="profit-share-results">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] text-center">
                  <span className="text-[10px] text-[#4ade80] font-semibold block">Total Income</span>
                  <span className="font-black text-[#4ade80] text-xs sm:text-sm">
                    {formatCurrency(profitShare.totalIncome)}
                  </span>
                </div>

                <div className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] text-center">
                  <span className="text-[10px] text-[#f87171] font-semibold block">Total Expenses</span>
                  <span className="font-black text-[#f87171] text-xs sm:text-sm">
                    {formatCurrency(profitShare.totalExpense)}
                  </span>
                </div>

                <div className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] text-center">
                  <span className="text-[10px] text-[#D4AF37] font-semibold block">Net Profit</span>
                  <span className="font-black text-[#F2C94C] text-xs sm:text-sm">
                    {formatCurrency(profitShare.profit)}
                  </span>
                </div>
              </div>

              {/* 4 Shares */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-bold text-[#B8B8B8] block uppercase tracking-wider">
                  Distribution Breakdown (25% per share)
                </span>

                <div className="space-y-1.5 text-xs">
                  {/* Ansari + Irshad */}
                  <div className="flex items-center justify-between py-2.5 px-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A]">
                    <div>
                      <span className="font-bold text-[#F5F5F5] block">ANSARI + IRSHAD</span>
                      <span className="text-[10px] text-[#777777] font-medium">One combined 25% share</span>
                    </div>
                    <span className="font-black text-[#D4AF37] text-sm sm:text-base">
                      {formatCurrency(profitShare.ansariIrshadShare)}
                    </span>
                  </div>

                  {/* Mussaddiq */}
                  <div className="flex items-center justify-between py-2.5 px-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A]">
                    <div>
                      <span className="font-bold text-[#F5F5F5] block">MUSSADDIQ</span>
                      <span className="text-[10px] text-[#777777] font-medium">25% share</span>
                    </div>
                    <span className="font-black text-[#D4AF37] text-sm sm:text-base">
                      {formatCurrency(profitShare.mussaddiqShare)}
                    </span>
                  </div>

                  {/* Sathish */}
                  <div className="flex items-center justify-between py-2.5 px-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A]">
                    <div>
                      <span className="font-bold text-[#F5F5F5] block">SATHISH</span>
                      <span className="text-[10px] text-[#777777] font-medium">25% share</span>
                    </div>
                    <span className="font-black text-[#D4AF37] text-sm sm:text-base">
                      {formatCurrency(profitShare.sathishShare)}
                    </span>
                  </div>

                  {/* Yogesh */}
                  <div className="flex items-center justify-between py-2.5 px-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A]">
                    <div>
                      <span className="font-bold text-[#F5F5F5] block">YOGESH</span>
                      <span className="text-[10px] text-[#777777] font-medium">25% share</span>
                    </div>
                    <span className="font-black text-[#D4AF37] text-sm sm:text-base">
                      {formatCurrency(profitShare.yogeshShare)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-[#777777] text-xs font-medium bg-[#111111] rounded-lg border border-dashed border-[#2A2A2A]">
              Profit sharing has not been calculated.
            </div>
          )}
        </div>
      </section>

      {/* ==================================================
          SECTION D: SETTINGS & SECURITY (LOCK APP / CHANGE PIN)
          ================================================== */}
      <section id="section-settings-security" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              SETTINGS & SECURITY
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-0.5 rounded border border-[#2A2A2A] flex items-center gap-1">
            <Shield className="w-3 h-3 text-[#D4AF37]" />
            <span>PIN Protected</span>
          </span>
        </div>

        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Change PIN Button */}
            <div className="p-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">
                    Change PIN
                  </span>
                </div>
                <p className="text-[11px] text-[#777777]">
                  Update your 4-digit master PIN stored securely in Supabase.
                </p>
              </div>
              <button
                type="button"
                id="btn-open-change-pin-modal"
                onClick={() => setIsChangePinOpen(true)}
                className="w-full py-2 px-3 bg-[#171717] hover:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#F5F5F5] rounded-lg text-xs font-bold transition-all cursor-pointer min-h-[38px] flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Change PIN</span>
              </button>
            </div>

            {/* Lock App Button */}
            <div className="p-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A] flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4 text-[#fb923c]" />
                  <span className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wide">
                    Lock App
                  </span>
                </div>
                <p className="text-[11px] text-[#777777]">
                  Instantly lock the application and return to the PIN screen.
                </p>
              </div>
              <button
                type="button"
                id="btn-lock-app"
                onClick={onLockApp}
                className="w-full py-2 px-3 bg-[#201512] hover:bg-[#321c16] border border-[#fb923c]/40 text-[#fb923c] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[38px] flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock App</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Change PIN Modal */}
      <ChangePinModal
        isOpen={isChangePinOpen}
        onClose={() => setIsChangePinOpen(false)}
      />

      {/* ==================================================
          TWO-STEP CONFIRMATION MODAL FOR CLOSING MONTH
          ================================================== */}
      {closeStep !== null && monthToClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/85 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-[#f87171]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#F5F5F5]">
                {closeStep === 1 ? 'Close Month Balance?' : 'Final Confirmation'}
              </h3>
            </div>

            {closeStep === 1 ? (
              <div className="space-y-2 text-xs text-[#D0D0D0]">
                <p>
                  Are you sure you want to close this month's balance for{' '}
                  <strong className="text-[#F5F5F5] font-bold">
                    {formatPdfMonth(monthToClose)}
                  </strong>
                  ?
                </p>
                <div className="p-2.5 bg-[#111111] rounded border border-[#2A2A2A] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#777777]">Closing Balance:</span>
                    <span className="font-bold text-[#D4AF37]">
                      {formatCurrency(allMonthsSummary[monthToClose]?.closingBalance || 0)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-[#D0D0D0]">
                <p className="text-[#f87171] font-semibold">
                  Close this month's accounts?
                </p>
                <p>
                  Once officially closed, this month's final closing balance will become the next month's{' '}
                  <strong className="text-[#F5F5F5] font-bold">opening balance</strong>.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={handleCancelClose}
                disabled={isProcessingClose}
                className="flex-1 py-2 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
              >
                Cancel
              </button>

              {closeStep === 1 ? (
                <button
                  type="button"
                  onClick={handleConfirmStep1}
                  className="flex-1 py-2 px-3 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] text-center"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmStep2}
                  disabled={isProcessingClose}
                  className="flex-1 py-2 px-3 bg-[#f87171] hover:bg-[#ef4444] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] text-center flex items-center justify-center gap-1"
                >
                  {isProcessingClose ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Closing...</span>
                    </>
                  ) : (
                    <span>Close Month</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
