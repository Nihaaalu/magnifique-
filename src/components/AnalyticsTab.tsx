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
  generateClosingBalancePdf,
  formatPdfMonth,
} from '../services/pdfReportGenerator';
import {
  calculateAllMonthsSummary,
  getAllAvailableAccountDates,
  getAllAvailableAccountMonths,
  getExpenseAccountingMonth,
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
  ChevronDown,
  KeyRound,
  Shield,
} from 'lucide-react';
import { ChangePinModal } from './ChangePinModal';
import {
  calculateIncomeDistribution,
  calculateExpenseDistribution,
  calculateMealCounts,
} from '../utils/analyticsUtils';
import { generateAnalyticsPDF } from '../services/analyticsPdfGenerator';
import {
  generatePartnerAnalyticsPDF,
  PartnerReportType,
} from '../services/partnerAnalyticsPdfGenerator';
import { ClosingBalancePage } from './ClosingBalancePage';
import { PartnerSettlementRow } from '../types';

interface AnalyticsTabProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  accountMonths?: AccountMonthRow[];
  partnerSettlements?: PartnerSettlement[];
  partners?: Partner[];
  onCloseMonth?: (monthStr: string, closingBalance: number) => Promise<void>;
  onReopenMonth?: (monthStr: string) => Promise<void>;
  onLockApp?: () => void;
  onAddSettlement?: (settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>) => Promise<void>;
  onDeleteSettlement?: (id: string) => Promise<void>;
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
  onAddSettlement,
  onDeleteSettlement,
}) => {
  const [profitShare, setProfitShare] = useState<ProfitShareResult | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [isProcessingClose, setIsProcessingClose] = useState<boolean>(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState<boolean>(false);
  const [closingPageMonth, setClosingPageMonth] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const currentMonthStr = getCurrentMonthString();

  // Available dates with actual account data (at least 1 income or 1 expense)
  const availableDates = getAllAvailableAccountDates(incomeRecords, expenseRecords);
  
  // Available months with actual account data
  const availableMonths = getAllAvailableAccountMonths(
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements
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

  // Monthly Summary Collapsible state (collapsed by default)
  const [isMonthlySummaryExpanded, setIsMonthlySummaryExpanded] = useState<boolean>(false);

  // Partner Analytics state
  const [selectedAnalyticsPartner, setSelectedAnalyticsPartner] = useState<string>('IRSHAD');
  const [selectedPartnerMonth, setSelectedPartnerMonth] = useState<string>(() => {
    if (availableMonths.includes(currentMonthStr)) {
      return currentMonthStr;
    }
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthStr;
  });
  const [selectedReportType, setSelectedReportType] = useState<PartnerReportType>('EXPENSE');

  const analyticsPartners = ['IRSHAD', 'ANSARI', 'MUSADDIQ', 'SATHISH', 'YOGESH', 'HOTEL'];
  const reportTypes: PartnerReportType[] = ['EXPENSE', 'INCOME', 'INCOME + EXPENSE'];

  // Close / Re-open Target Month State & Dialogs
  const [selectedCloseMonth, setSelectedCloseMonth] = useState<string>(() => {
    if (availableMonths.includes(currentMonthStr)) {
      return currentMonthStr;
    }
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : currentMonthStr;
  });
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState<boolean>(false);
  const [isConfirmReopenOpen, setIsConfirmReopenOpen] = useState<boolean>(false);
  const [isProcessingReopen, setIsProcessingReopen] = useState<boolean>(false);

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

  // 2b. Download Closing Balance PDF (Official Month Closing Report)
  const handleDownloadClosingPdf = async (monthStr: string) => {
    if (generatingType || !monthStr) return;
    setGeneratingType(`closing-${monthStr}`);
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const doc = generateClosingBalancePdf(
        monthStr,
        incomeRecords,
        expenseRecords,
        accountMonths,
        partnerSettlements,
        partners
      );
      const fileName = `MAGNIFIQUE_2.0_Closing_Balance_${monthStr}.pdf`;
      doc.save(fileName);

      setDownloadMsg(`Closing Balance PDF downloaded successfully: ${fileName}`);
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to generate closing balance PDF:', err);
      setDownloadError(err.message || 'Failed to generate Closing Balance PDF. Please try again.');
    } finally {
      setGeneratingType(null);
    }
  };

  // 3. Download Restaurant Analytics PDF (using currently selected Analytics date range)
  const handleDownloadRestaurantAnalyticsPdf = async () => {
    const targetMonth = selectedMonth || selectedReportMonth;
    if (generatingType || !targetMonth) return;
    setGeneratingType('analytics');
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 60));

      const monthIncome = incomeRecords.filter(
        (r) => r.date && r.date.startsWith(targetMonth)
      );
      const monthExpense = expenseRecords.filter(
        (r) => getExpenseAccountingMonth(r) === targetMonth
      );

      const [year, month] = targetMonth.split('-');
      const daysInMonth = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-${daysInMonth.toString().padStart(2, '0')}`;
      const periodLabel = `${formatPdfMonth(targetMonth)} (${startDate} to ${endDate})`;

      // Unified calculation functions ensuring Analytics numbers match PDF numbers
      const incomeResult = calculateIncomeDistribution(monthIncome);
      const expenseResult = calculateExpenseDistribution(monthExpense);
      const mealResult = calculateMealCounts(monthIncome);

      await generateAnalyticsPDF({
        incomeRecords: monthIncome,
        expenseRecords: monthExpense,
        dateRangeLabel: periodLabel,
        startDate,
        endDate,
        incomeResult,
        expenseResult,
        mealResult,
      });

      const fileName = `Magnifique_Analytics_Report_${targetMonth}.pdf`;
      setDownloadMsg(`Restaurant Analytics PDF downloaded successfully: ${fileName}`);
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to generate restaurant analytics PDF:', err);
      setDownloadError(err.message || 'Failed to generate Restaurant Analytics PDF. Please try again.');
    } finally {
      setGeneratingType(null);
    }
  };

  // 4. Download Partner Analytics PDF (e.g. IRSHAD, ANSARI, etc.) for specified accounting month
  const handleDownloadPartnerAnalyticsPdf = async (
    partnerName: string,
    targetMonth: string,
    reportType: PartnerReportType = 'EXPENSE'
  ) => {
    if (generatingType || !targetMonth) return;
    setGeneratingType(`partner-${partnerName}-${targetMonth}-${reportType}`);
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 60));

      const [year, month] = targetMonth.split('-');
      const daysInMonth = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-${daysInMonth.toString().padStart(2, '0')}`;
      const periodLabel = `${formatPdfMonth(targetMonth)} (${startDate} to ${endDate})`;

      await generatePartnerAnalyticsPDF({
        partnerName,
        reportType,
        accountingMonth: targetMonth,
        dateRangeLabel: periodLabel,
        startDate,
        endDate,
        incomeRecords,
        expenseRecords,
        partners,
      });

      const typeLabel =
        reportType === 'INCOME'
          ? 'Income'
          : reportType === 'INCOME + EXPENSE'
          ? 'Income & Expense'
          : 'Expense';

      setDownloadMsg(
        `${partnerName} ${typeLabel} Analytics PDF for ${formatPdfMonth(targetMonth)} downloaded successfully.`
      );
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err: any) {
      console.error(`Failed to generate ${partnerName} analytics PDF:`, err);
      setDownloadError(
        err.message || `Failed to generate ${partnerName} Analytics PDF. Please try again.`
      );
    } finally {
      setGeneratingType(null);
    }
  };

  // Close / Reopen Month Execution Handlers
  const handleConfirmCloseMonth = async () => {
    if (!selectedCloseMonth) return;

    const summary = allMonthsSummary[selectedCloseMonth];
    if (summary) {
      setIsProcessingClose(true);
      try {
        if (onCloseMonth) {
          await onCloseMonth(selectedCloseMonth, summary.closingBalance);
        }
        setDownloadMsg(
          `Month ${formatPdfMonth(
            selectedCloseMonth
          )} has been closed. Final closing balance (${formatCurrency(summary.closingBalance)}) is set as next month's opening balance.`
        );
        setTimeout(() => setDownloadMsg(null), 4500);
      } catch (err: any) {
        console.error('Failed to close month in Supabase:', err);
        setDownloadError(err.message || 'Failed to close month in Supabase.');
      } finally {
        setIsProcessingClose(false);
        setIsConfirmCloseOpen(false);
      }
    }
  };

  const handleConfirmReopenMonth = async () => {
    if (!selectedCloseMonth) return;
    setIsProcessingReopen(true);
    try {
      if (onReopenMonth) {
        await onReopenMonth(selectedCloseMonth);
      }
      setDownloadMsg(`Month ${formatPdfMonth(selectedCloseMonth)} re-opened.`);
      setTimeout(() => setDownloadMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to re-open month:', err);
      setDownloadError(err.message || 'Failed to re-open month.');
    } finally {
      setIsProcessingReopen(false);
      setIsConfirmReopenOpen(false);
    }
  };

  // Generate Profit Sharing for Selected Month
  const handleGenerateProfitShare = () => {
    const monthInc = incomeRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
    const monthExp = expenseRecords.filter((r) => getExpenseAccountingMonth(r) === selectedMonth);

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

  if (closingPageMonth) {
    return (
      <ClosingBalancePage
        initialMonth={closingPageMonth}
        incomeRecords={incomeRecords}
        expenseRecords={expenseRecords}
        accountMonths={accountMonths}
        partnerSettlements={partnerSettlements}
        partners={partners}
        onBack={() => setClosingPageMonth(null)}
        onCloseMonth={onCloseMonth}
        onReopenMonth={onReopenMonth}
        onAddSettlement={onAddSettlement}
        onDeleteSettlement={onDeleteSettlement}
      />
    );
  }

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
                  onChange={(e) => {
                    setSelectedReportMonth(e.target.value);
                    setSelectedMonth(e.target.value);
                  }}
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
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#171717] hover:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#B8B8B8] hover:text-[#F5F5F5] px-4 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer min-h-[42px] shrink-0 ${
                  generatingType === selectedReportMonth ? 'opacity-80' : ''
                } ${availableMonths.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {generatingType === selectedReportMonth ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Download Monthly PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION B: MONTHLY SUMMARY & BALANCE SYSTEM (COLLAPSED BY DEFAULT)
          ================================================== */}
      <section id="section-monthly-summary" className="space-y-3">
        {/* Collapsible Header */}
        <button
          type="button"
          id="btn-toggle-monthly-summary"
          onClick={() => setIsMonthlySummaryExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between p-3.5 bg-[#171717] rounded-xl border border-[#2A2A2A] hover:bg-[#1D1D1D] transition-colors cursor-pointer text-left select-none shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              MONTHLY SUMMARY
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-black text-[#D4AF37] uppercase tracking-wide">
              {formatPdfMonth(selectedMonth)}
            </span>
            <span className="text-[#D4AF37]">
              {isMonthlySummaryExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          </div>
        </button>

        {isMonthlySummaryExpanded && (
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-4 animate-fadeIn">
            {/* Header with Month Selector & status badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <select
                  id="select-summary-month"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setSelectedReportMonth(e.target.value);
                  }}
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

            {/* TOP ACTION: DOWNLOAD RESTAURANT ANALYTICS PDF */}
            <button
              type="button"
              id="btn-download-restaurant-analytics-pdf"
              onClick={handleDownloadRestaurantAnalyticsPdf}
              disabled={generatingType !== null || availableMonths.length === 0 || !selectedMonth}
              className={`w-full flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-4.5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer min-h-[42px] ${
                generatingType === 'analytics' ? 'opacity-80' : ''
              } ${availableMonths.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {generatingType === 'analytics' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" />
                  <span>Generating Analytics PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#0A0A0A]" />
                  <span>DOWNLOAD RESTAURANT ANALYTICS PDF</span>
                </>
              )}
            </button>

            {/* Subtle divider before summary boxes */}
            <div className="border-t border-[#2A2A2A]" />

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
          </div>
        )}
      </section>

      {/* ==================================================
          SECTION: PARTNER ANALYTICS (UNIVERSAL FOR ALL PARTNERS)
          ================================================== */}
      <section id="section-partner-analytics" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs font-bold text-[#F5F5F5] tracking-wider uppercase">
              PARTNER ANALYTICS
            </h2>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-0.5 rounded border border-[#2A2A2A]">
            Individual Partner Audit
          </span>
        </div>

        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-4">
          <div className="p-3.5 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-3.5">
            {/* Partner Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#D0D0D0] uppercase tracking-wider mb-1.5">
                PARTNER
              </label>
              <select
                id="select-partner-analytics-name"
                value={selectedAnalyticsPartner}
                onChange={(e) => setSelectedAnalyticsPartner(e.target.value)}
                className="w-full px-3 py-2 bg-[#171717] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[42px] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                {analyticsPartners.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Accounting Month Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#D0D0D0] uppercase tracking-wider mb-1.5">
                ACCOUNTING MONTH
              </label>
              <select
                id="select-partner-analytics-month"
                value={selectedPartnerMonth}
                onChange={(e) => setSelectedPartnerMonth(e.target.value)}
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

            {/* Report Type Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#D0D0D0] uppercase tracking-wider mb-1.5">
                REPORT TYPE
              </label>
              <select
                id="select-partner-report-type"
                value={selectedReportType}
                onChange={(e) => setSelectedReportType(e.target.value as PartnerReportType)}
                className="w-full px-3 py-2 bg-[#171717] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[42px] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
              >
                {reportTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Download Button */}
            <button
              type="button"
              id="btn-download-partner-analytics-pdf"
              onClick={() =>
                handleDownloadPartnerAnalyticsPdf(
                  selectedAnalyticsPartner,
                  selectedPartnerMonth || selectedMonth,
                  selectedReportType
                )
              }
              disabled={
                generatingType !== null ||
                availableMonths.length === 0 ||
                (!selectedPartnerMonth && !selectedMonth)
              }
              className={`w-full flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-4.5 py-2.5 rounded-lg font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer min-h-[42px] ${
                generatingType?.startsWith('partner-') ? 'opacity-80' : ''
              } ${availableMonths.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {generatingType?.startsWith('partner-') ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" />
                  <span>
                    Generating{' '}
                    {selectedAnalyticsPartner === 'HOTEL'
                      ? `HOTEL ${
                          selectedReportType === 'INCOME'
                            ? 'Income'
                            : selectedReportType === 'INCOME + EXPENSE'
                            ? 'Income & Expense'
                            : 'Expense'
                        }`
                      : `${selectedAnalyticsPartner} Analytics`}{' '}
                    PDF...
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#0A0A0A]" />
                  <span>
                    {selectedAnalyticsPartner === 'HOTEL'
                      ? `DOWNLOAD HOTEL ${selectedReportType} PDF`
                      : `DOWNLOAD ${selectedAnalyticsPartner} ANALYTICS PDF`}
                  </span>
                </>
              )}
            </button>
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
          SECTION: ACCOUNTING MONTH & CLOSE / RE-OPEN ACTION
          ================================================== */}
      <section id="section-close-reopen-action" className="space-y-3">
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-3.5">
          {/* Accounting Month Selector */}
          <div>
            <label className="block text-[11px] font-bold text-[#D0D0D0] uppercase tracking-wider mb-1.5">
              ACCOUNTING MONTH
            </label>
            <select
              id="select-close-accounting-month"
              value={selectedCloseMonth}
              onChange={(e) => setSelectedCloseMonth(e.target.value)}
              disabled={availableMonths.length === 0}
              className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] min-h-[42px] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
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

          {/* Status Indicator */}
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-[#888888] font-medium">Status:</span>
            {!(allMonthsSummary[selectedCloseMonth]?.isClosed) ? (
              <span className="inline-flex items-center gap-1 font-bold text-[#4ade80] bg-[#122216] border border-[#1b3d22] px-2.5 py-0.5 rounded-md text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
                <span>ACTIVE (RUNNING)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-[#f87171] bg-[#201212] border border-[#3d1d1d] px-2.5 py-0.5 rounded-md text-[11px]">
                <Lock className="w-3 h-3 text-[#f87171]" />
                <span>CLOSED</span>
              </span>
            )}
          </div>

          {/* Action 1: Download Closing Balance PDF (Official Month Closing Report) */}
          <button
            type="button"
            id="btn-download-closing-balance-pdf"
            onClick={() => handleDownloadClosingPdf(selectedCloseMonth)}
            disabled={generatingType !== null || availableMonths.length === 0 || !selectedCloseMonth}
            className={`w-full px-4 py-3 bg-[#111111] hover:bg-[#1D1D1D] active:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#D4AF37] hover:text-[#F2C94C] rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer min-h-[46px] transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${
              generatingType === `closing-${selectedCloseMonth}` ? 'opacity-80' : ''
            }`}
          >
            {generatingType === `closing-${selectedCloseMonth}` ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Closing Balance PDF...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                <span>DOWNLOAD CLOSING BALANCE PDF</span>
              </>
            )}
          </button>

          {/* Action 2: CLOSE BALANCE FOR THIS MONTH or REOPEN THIS MONTH */}
          {!(allMonthsSummary[selectedCloseMonth]?.isClosed) ? (
            <button
              type="button"
              id="btn-close-month-action"
              onClick={() => setIsConfirmCloseOpen(true)}
              disabled={isProcessingClose || availableMonths.length === 0 || !selectedCloseMonth}
              className="w-full px-4 py-3 bg-[#201212] hover:bg-[#3d1d1d] active:bg-[#4a2222] border border-[#f87171]/50 hover:border-[#f87171] text-[#f87171] rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer min-h-[46px] transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4 text-[#f87171]" />
              <span>CLOSE BALANCE FOR THIS MONTH</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-reopen-month-action"
              onClick={() => setIsConfirmReopenOpen(true)}
              disabled={isProcessingReopen || availableMonths.length === 0 || !selectedCloseMonth}
              className="w-full px-4 py-3 bg-[#111111] hover:bg-[#1D1D1D] active:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#D4AF37] hover:text-[#F2C94C] rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer min-h-[46px] transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Unlock className="w-4 h-4 text-[#D4AF37]" />
              <span>REOPEN THIS MONTH</span>
            </button>
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
          CONFIRMATION MODAL FOR CLOSING SELECTED MONTH
          ================================================== */}
      {isConfirmCloseOpen && selectedCloseMonth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/85 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-[#f87171]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#F5F5F5]">
                CLOSE {formatPdfMonth(selectedCloseMonth).toUpperCase()}?
              </h3>
            </div>

            <div className="space-y-2 text-xs text-[#D0D0D0]">
              <p>
                Are you sure you want to close accounts for{' '}
                <strong className="text-[#F5F5F5] font-bold">
                  {formatPdfMonth(selectedCloseMonth)}
                </strong>
                ?
              </p>
              <div className="p-2.5 bg-[#111111] rounded border border-[#2A2A2A] space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[#777777]">Closing Balance:</span>
                  <span className="font-bold text-[#D4AF37] text-sm">
                    {formatCurrency(allMonthsSummary[selectedCloseMonth]?.closingBalance || 0)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#888888] pt-1">
                Once officially closed, this month's final closing balance will become the next month's{' '}
                <strong className="text-[#F5F5F5] font-bold">opening balance</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setIsConfirmCloseOpen(false)}
                disabled={isProcessingClose}
                className="flex-1 py-2 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleConfirmCloseMonth}
                disabled={isProcessingClose}
                className="flex-1 py-2 px-3 bg-[#f87171] hover:bg-[#ef4444] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] text-center flex items-center justify-center gap-1.5"
              >
                {isProcessingClose ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Closing...</span>
                  </>
                ) : (
                  <span>CONFIRM & CLOSE</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          CONFIRMATION MODAL FOR RE-OPENING SELECTED MONTH
          ================================================== */}
      {isConfirmReopenOpen && selectedCloseMonth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/85 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-[#D4AF37]">
              <Unlock className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-[#F5F5F5]">
                REOPEN {formatPdfMonth(selectedCloseMonth).toUpperCase()}?
              </h3>
            </div>

            <div className="space-y-2 text-xs text-[#D0D0D0]">
              <p>
                Are you sure you want to reopen the accounting records for{' '}
                <strong className="text-[#F5F5F5] font-bold">
                  {formatPdfMonth(selectedCloseMonth)}
                </strong>
                ?
              </p>
              <p className="text-[11px] text-[#888888] pt-1">
                This will unlock all records for this month so further modifications or settlements can be made.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setIsConfirmReopenOpen(false)}
                disabled={isProcessingReopen}
                className="flex-1 py-2 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handleConfirmReopenMonth}
                disabled={isProcessingReopen}
                className="flex-1 py-2 px-3 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] text-center flex items-center justify-center gap-1.5"
              >
                {isProcessingReopen ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reopening...</span>
                  </>
                ) : (
                  <span>REOPEN THIS MONTH</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
