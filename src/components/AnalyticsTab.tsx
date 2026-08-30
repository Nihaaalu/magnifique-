import React, { useState } from 'react';
import { IncomeRecord, ExpenseRecord, ProfitShareResult } from '../types';
import {
  formatCurrency,
  getTodayDateString,
  getCurrentMonthString,
} from '../utils/formatters';
import {
  generateDailyAccountsPdf,
  generateMonthlyAccountsPdf,
} from '../services/pdfReportGenerator';
import { Download, Calculator, Loader2 } from 'lucide-react';

interface AnalyticsTabProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  incomeRecords,
  expenseRecords,
}) => {
  const [profitShare, setProfitShare] = useState<ProfitShareResult | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<'today' | 'month' | null>(null);

  const todayStr = getTodayDateString();
  const currentMonthStr = getCurrentMonthString();

  // 1. Download Today's Accounts as PDF
  const handleDownloadToday = async () => {
    if (generatingType) return;
    setGeneratingType('today');
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      // Yield to let React render the "Generating PDF..." state
      await new Promise((resolve) => setTimeout(resolve, 50));

      const doc = generateDailyAccountsPdf(todayStr, incomeRecords, expenseRecords);
      const fileName = `MAGNIFIQUE_2.0_Daily_Accounts_${todayStr}.pdf`;
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

  // 2. Download This Month's Accounts as PDF
  const handleDownloadMonth = async () => {
    if (generatingType) return;
    setGeneratingType('month');
    setDownloadError(null);
    setDownloadMsg(null);

    try {
      // Yield to let React render the "Generating PDF..." state
      await new Promise((resolve) => setTimeout(resolve, 50));

      const doc = generateMonthlyAccountsPdf(currentMonthStr, incomeRecords, expenseRecords);
      const fileName = `MAGNIFIQUE_2.0_Monthly_Accounts_${currentMonthStr}.pdf`;
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

  // Profit Sharing Calculation
  const handleGenerateProfitShare = () => {
    const totalIncome = incomeRecords.reduce((acc, r) => acc + r.total, 0);
    const totalExpense = expenseRecords.reduce((acc, r) => acc + r.amount, 0);
    const profit = totalIncome - totalExpense;

    // Distribution:
    // Ansari + Irshad TOGETHER = 25%
    // Mussaddiq = 25%
    // Sathish = 25%
    // Yogesh = 25%
    const share25Percent = profit * 0.25;

    const result: ProfitShareResult = {
      totalIncome,
      totalExpense,
      profit,
      ansariIrshadShare: share25Percent,
      mussaddiqShare: share25Percent,
      sathishShare: share25Percent,
      yogeshShare: share25Percent,
      generatedAt: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setProfitShare(result);
  };

  return (
    <div id="analytics-tab-container">
      {/* Feedback Alert - Success */}
      {downloadMsg && (
        <div
          id="analytics-download-feedback"
          className="mb-4 p-2.5 bg-[#171717] border border-[#D4AF37]/50 text-[#D4AF37] rounded-md text-xs font-semibold flex items-center justify-between"
        >
          <span>{downloadMsg}</span>
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
          className="mb-4 p-2.5 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-md text-xs font-semibold flex items-center justify-between"
        >
          <span>{downloadError}</span>
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
        {/* Section Heading with Warm Gold Accent */}
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

        {/* Download Buttons */}
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-2.5">
          <button
            type="button"
            id="btn-download-today"
            onClick={handleDownloadToday}
            disabled={generatingType !== null}
            className={`w-full flex items-center justify-between p-3.5 rounded-lg border border-[#2A2A2A] bg-[#111111] hover:border-[#D4AF37]/50 hover:bg-[#1D1D1D] text-[#F5F5F5] transition-all cursor-pointer min-h-[48px] group ${
              generatingType === 'today' ? 'opacity-80' : ''
            }`}
          >
            <div className="text-left">
              <span className="text-xs font-bold block text-[#F5F5F5] group-hover:text-[#F2C94C] transition-colors">
                Today's Accounts
              </span>
              <span className="text-[11px] text-[#777777] font-medium">{todayStr}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] px-2.5 py-1.5 rounded-md font-black text-xs shadow-xs group-hover:bg-[#F2C94C] transition-all shrink-0">
              {generatingType === 'today' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </>
              )}
            </div>
          </button>

          <button
            type="button"
            id="btn-download-month"
            onClick={handleDownloadMonth}
            disabled={generatingType !== null}
            className={`w-full flex items-center justify-between p-3.5 rounded-lg border border-[#2A2A2A] bg-[#111111] hover:border-[#D4AF37]/50 hover:bg-[#1D1D1D] text-[#F5F5F5] transition-all cursor-pointer min-h-[48px] group ${
              generatingType === 'month' ? 'opacity-80' : ''
            }`}
          >
            <div className="text-left">
              <span className="text-xs font-bold block text-[#F5F5F5] group-hover:text-[#F2C94C] transition-colors">
                This Month's Accounts
              </span>
              <span className="text-[11px] text-[#777777] font-medium">Month: {currentMonthStr}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] px-2.5 py-1.5 rounded-md font-black text-xs shadow-xs group-hover:bg-[#F2C94C] transition-all shrink-0">
              {generatingType === 'month' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </>
              )}
            </div>
          </button>
        </div>
      </section>

      {/* ==================================================
          SECTION DIVIDER & NEW SECTION HEADER
          ━━━━━━━━━━━━━━━━━━━━━━━━━━
          PROFIT SHARING
          ================================================== */}
      <div className="my-7 sm:my-8" role="separator">
        <div className="w-full border-t border-[#2A2A2A] mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              <h2 className="text-sm font-black text-[#F5F5F5] tracking-wide uppercase">
                PROFIT SHARING
              </h2>
            </div>
            <p className="text-xs text-[#777777] font-medium mt-0.5">
              Net profit & partner distribution
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#D4AF37] bg-[#171717] px-2.5 py-1 rounded-full border border-[#2A2A2A]">
            4 Shares (25% each)
          </span>
        </div>
      </div>

      {/* ==================================================
          SECTION B: PROFIT SHARING
          ================================================== */}
      <section id="section-profit-sharing">
        <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4.5 shadow-md space-y-3.5">
          {/* Distinct Special Calculation Action Button */}
          <div className="flex justify-center pt-0.5">
            <button
              type="button"
              id="btn-generate-profit-share"
              onClick={handleGenerateProfitShare}
              className="w-full py-3 px-5 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs sm:text-sm font-black tracking-widest uppercase transition-all cursor-pointer min-h-[46px] shadow-xs flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              <span>GENERATE PROFIT SHARE</span>
            </button>
          </div>

          {/* Results strictly shown AFTER user presses the button */}
          {profitShare ? (
            <div className="space-y-3.5 pt-1" id="profit-share-results">
              {/* 3 Summary metrics */}
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
    </div>
  );
};
