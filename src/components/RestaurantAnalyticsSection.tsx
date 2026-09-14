import React, { useState, useMemo } from 'react';
import { IncomeRecord, ExpenseRecord } from '../types';
import {
  calculateIncomeDistribution,
  calculateExpenseDistribution,
  calculateMealCounts,
  filterRecordsByDateRange,
  computeDateRange,
  DateRangePreset,
  formatReadableDate,
} from '../utils/analyticsUtils';
import {
  generateAnalyticsPDF,
  formatIndianCurrency,
  formatIndianNumber,
} from '../services/analyticsPdfGenerator';
import { AnalyticsDonutChart, DonutSlice } from './AnalyticsDonutChart';
import {
  Download,
  Calendar,
  Loader2,
  TrendingUp,
  TrendingDown,
  Scale,
  Utensils,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';

interface RestaurantAnalyticsSectionProps {
  incomeRecords: IncomeRecord[];
  expenseRecords: ExpenseRecord[];
  availableDates: string[];
}

export const RestaurantAnalyticsSection: React.FC<RestaurantAnalyticsSectionProps> = ({
  incomeRecords,
  expenseRecords,
  availableDates,
}) => {
  const [preset, setPreset] = useState<DateRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfSuccessMsg, setPdfSuccessMsg] = useState<string | null>(null);
  const [pdfErrorMsg, setPdfErrorMsg] = useState<string | null>(null);

  // Initialize custom dates if empty
  const defaultDates = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const earliest = availableDates.length > 0 ? availableDates[0] : today;
    const latest = availableDates.length > 0 ? availableDates[availableDates.length - 1] : today;
    return { earliest, latest, today };
  }, [availableDates]);

  // Compute active date range
  const dateRange = useMemo(() => {
    return computeDateRange(
      preset,
      customStartDate || defaultDates.earliest,
      customEndDate || defaultDates.latest,
      availableDates
    );
  }, [preset, customStartDate, customEndDate, availableDates, defaultDates]);

  // Filter records by date range
  const filteredIncome = useMemo(() => {
    return filterRecordsByDateRange(incomeRecords, dateRange.startDate, dateRange.endDate);
  }, [incomeRecords, dateRange.startDate, dateRange.endDate]);

  const filteredExpenses = useMemo(() => {
    return filterRecordsByDateRange(expenseRecords, dateRange.startDate, dateRange.endDate);
  }, [expenseRecords, dateRange.startDate, dateRange.endDate]);

  // Single source of truth calculation results
  const incomeResult = useMemo(() => {
    return calculateIncomeDistribution(filteredIncome);
  }, [filteredIncome]);

  const expenseResult = useMemo(() => {
    return calculateExpenseDistribution(filteredExpenses);
  }, [filteredExpenses]);

  const mealResult = useMemo(() => {
    return calculateMealCounts(filteredIncome);
  }, [filteredIncome]);

  const netBalance = incomeResult.totalIncome - expenseResult.totalExpense;

  // Handler for PDF download
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPdfSuccessMsg(null);
    setPdfErrorMsg(null);

    try {
      await generateAnalyticsPDF({
        dateRangeLabel: dateRange.label,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        incomeResult,
        expenseResult,
        mealResult,
      });
      setPdfSuccessMsg('Analytics PDF report downloaded successfully!');
      setTimeout(() => setPdfSuccessMsg(null), 4500);
    } catch (err: any) {
      console.error('Failed to generate Analytics PDF:', err);
      setPdfErrorMsg(err.message || 'Failed to generate Analytics PDF.');
      setTimeout(() => setPdfErrorMsg(null), 6000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Convert to slices for donut charts
  const incomeSlices: DonutSlice[] = useMemo(() => {
    return incomeResult.items.map((item) => ({
      name: item.name,
      value: item.amount,
      percentage: item.percentage,
      color: item.color,
      displayValue: formatIndianCurrency(item.amount, 'symbol'),
    }));
  }, [incomeResult]);

  const expenseSlices: DonutSlice[] = useMemo(() => {
    return expenseResult.chartItems.map((item) => ({
      name: item.name,
      value: item.amount,
      percentage: item.percentage,
      color: item.color,
      displayValue: formatIndianCurrency(item.amount, 'symbol'),
    }));
  }, [expenseResult]);

  const mealSlices: DonutSlice[] = useMemo(() => {
    return mealResult.items.map((item) => ({
      name: item.name,
      value: item.count,
      percentage: item.percentage,
      color: item.color,
      displayValue: `${formatIndianNumber(item.count)} meals`,
    }));
  }, [mealResult]);

  return (
    <section id="restaurant-analytics-section" className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse" />
          <div>
            <h2 className="text-sm font-black text-[#F5F5F5] tracking-wider uppercase flex items-center gap-2">
              <span>RESTAURANT ANALYTICS</span>
              <span className="text-[10px] font-bold text-[#D4AF37] bg-[#1E1E1E] px-2 py-0.5 rounded border border-[#333333]">
                Live Dynamic
              </span>
            </h2>
            <p className="text-[11px] text-[#888888] font-medium">
              Distribution insights, intelligent grouping, and operations summary
            </p>
          </div>
        </div>

        {/* Primary Top Download PDF Button */}
        <button
          type="button"
          id="btn-download-analytics-pdf"
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
          className="flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-4 py-2.5 rounded-lg font-black text-xs transition-all shadow-md cursor-pointer min-h-[42px] shrink-0"
        >
          {isGeneratingPdf ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" />
              <span>GENERATING PDF...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-[#0A0A0A]" />
              <span>DOWNLOAD PDF</span>
            </>
          )}
        </button>
      </div>

      {/* Feedback Alerts */}
      {pdfSuccessMsg && (
        <div
          id="analytics-pdf-success"
          className="p-3 bg-[#171717] border border-[#D4AF37]/60 text-[#D4AF37] rounded-xl text-xs font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>{pdfSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPdfSuccessMsg(null)}
            className="text-[#888888] hover:text-[#FFFFFF] text-xs cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {pdfErrorMsg && (
        <div
          id="analytics-pdf-error"
          className="p-3 bg-[#201212] border border-[#4a1d1d] text-[#f87171] rounded-xl text-xs font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0" />
            <span>{pdfErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPdfErrorMsg(null)}
            className="text-[#f87171] hover:text-[#ffffff] text-xs cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ================================================================
          DATE RANGE CONTROL BAR
          ================================================================ */}
      <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4 shadow-md space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5" id="date-range-presets">
            {(
              [
                { key: 'today', label: 'Today' },
                { key: 'this_week', label: 'This Week' },
                { key: 'this_month', label: 'This Month' },
                { key: 'all_time', label: 'All Time' },
                { key: 'custom', label: 'Custom Range' },
              ] as const
            ).map((item) => {
              const isActive = preset === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  id={`btn-preset-${item.key}`}
                  onClick={() => setPreset(item.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer min-h-[34px] ${
                    isActive
                      ? 'bg-[#D4AF37] text-[#0A0A0A] shadow-xs'
                      : 'bg-[#111111] text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#222222] border border-[#262626]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Active Date Range Tag */}
          <div className="flex items-center gap-2 bg-[#111111] border border-[#262626] px-3 py-1.5 rounded-lg text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span className="text-[#888888] font-medium">Period:</span>
            <span className="font-bold text-[#F5F5F5]">{dateRange.label}</span>
          </div>
        </div>

        {/* Custom Range Inputs (shown when Custom is selected) */}
        {preset === 'custom' && (
          <div className="pt-2 border-t border-[#222222] flex flex-col sm:flex-row items-center gap-3">
            <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
              <span className="text-xs text-[#888888] font-medium min-w-[35px]">From:</span>
              <input
                type="date"
                id="input-analytics-start-date"
                value={customStartDate || dateRange.startDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full bg-[#111111] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg px-3 py-1.5 text-xs text-[#F5F5F5] font-bold focus:outline-none"
              />
            </div>

            <div className="w-full sm:w-auto flex-1 flex items-center gap-2">
              <span className="text-xs text-[#888888] font-medium min-w-[35px]">To:</span>
              <input
                type="date"
                id="input-analytics-end-date"
                value={customEndDate || dateRange.endDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full bg-[#111111] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg px-3 py-1.5 text-xs text-[#F5F5F5] font-bold focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          EXECUTIVE SUMMARY METRIC CARDS
          ================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Total Income */}
        <div className="p-3 sm:p-3.5 bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4ade80] font-bold uppercase tracking-wider">
              Total Income
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-[#4ade80]" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#4ade80] tracking-tight truncate">
            {formatIndianCurrency(incomeResult.totalIncome, 'symbol')}
          </div>
          <div className="text-[10px] text-[#777777]">
            {filteredIncome.length} entries in period
          </div>
        </div>

        {/* Total Expense */}
        <div className="p-3 sm:p-3.5 bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#f87171] font-bold uppercase tracking-wider">
              Total Expenses
            </span>
            <TrendingDown className="w-3.5 h-3.5 text-[#f87171]" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#f87171] tracking-tight truncate">
            {formatIndianCurrency(expenseResult.totalExpense, 'symbol')}
          </div>
          <div className="text-[10px] text-[#777777]">
            {filteredExpenses.length} records grouped
          </div>
        </div>

        {/* Net Profit / Balance */}
        <div className="p-3 sm:p-3.5 bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                netBalance >= 0 ? 'text-[#D4AF37]' : 'text-[#f87171]'
              }`}
            >
              Net Balance
            </span>
            <Scale
              className={`w-3.5 h-3.5 ${
                netBalance >= 0 ? 'text-[#D4AF37]' : 'text-[#f87171]'
              }`}
            />
          </div>
          <div
            className={`text-base sm:text-lg font-black tracking-tight truncate ${
              netBalance >= 0 ? 'text-[#F2C94C]' : 'text-[#f87171]'
            }`}
          >
            {formatIndianCurrency(netBalance, 'symbol')}
          </div>
          <div className="text-[10px] text-[#777777]">
            Operating profit/difference
          </div>
        </div>

        {/* Total Meals */}
        <div className="p-3 sm:p-3.5 bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#818CF8] font-bold uppercase tracking-wider">
              Meals Served
            </span>
            <Utensils className="w-3.5 h-3.5 text-[#818CF8]" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#818CF8] tracking-tight truncate">
            {formatIndianNumber(mealResult.totalMeals)} <span className="text-xs font-bold text-[#A5B4FC]">Meals</span>
          </div>
          <div className="text-[10px] text-[#777777]">
            From guest member counts
          </div>
        </div>
      </div>

      {/* ================================================================
          SECTION A: INCOME DISTRIBUTION
          ================================================================ */}
      <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h3 className="text-xs font-black text-[#F5F5F5] uppercase tracking-wider">
              Income Distribution (by Person / Source)
            </h3>
          </div>
          <span className="text-xs font-bold text-[#4ade80]">
            Total Income: {formatIndianCurrency(incomeResult.totalIncome, 'symbol')}
          </span>
        </div>

        {incomeResult.items.length === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium bg-[#111111] rounded-lg border border-dashed border-[#262626]">
            No income records found in the selected date range.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* Donut Chart */}
            <div className="lg:col-span-4 flex justify-center py-2">
              <AnalyticsDonutChart
                slices={incomeSlices}
                centerLabel="Total Income"
                centerValue={formatIndianCurrency(incomeResult.totalIncome, 'symbol')}
                size={180}
              />
            </div>

            {/* Breakdown List / Table */}
            <div className="lg:col-span-8 space-y-2">
              <div className="grid grid-cols-12 text-[10px] font-bold text-[#777777] uppercase tracking-wider px-3 py-1 border-b border-[#222222]">
                <div className="col-span-6">Person / Source</div>
                <div className="col-span-4 text-right">Amount</div>
                <div className="col-span-2 text-right">Share</div>
              </div>

              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {incomeResult.items.map((item) => (
                  <div
                    key={item.name}
                    className="p-2.5 bg-[#111111] hover:bg-[#161616] rounded-lg border border-[#222222] transition-colors flex flex-col gap-1.5"
                  >
                    <div className="grid grid-cols-12 items-center text-xs">
                      {/* Name & Swatch */}
                      <div className="col-span-6 flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-bold text-[#F5F5F5] truncate">
                          {item.name}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="col-span-4 text-right font-black text-[#4ade80] text-xs sm:text-sm">
                        {formatIndianCurrency(item.amount, 'symbol')}
                      </div>

                      {/* Percentage */}
                      <div className="col-span-2 text-right font-black text-[#D4AF37] text-xs">
                        {item.percentage.toFixed(1)}%
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full bg-[#1E1E1E] rounded-full h-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(2, item.percentage))}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          SECTION B: EXPENSE DISTRIBUTION
          ================================================================ */}
      <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f87171]" />
            <h3 className="text-xs font-black text-[#F5F5F5] uppercase tracking-wider">
              Expense Distribution (Intelligent Description Grouping)
            </h3>
          </div>
          <span className="text-xs font-bold text-[#f87171]">
            Total Expenses: {formatIndianCurrency(expenseResult.totalExpense, 'symbol')}
          </span>
        </div>

        {expenseResult.items.length === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium bg-[#111111] rounded-lg border border-dashed border-[#262626]">
            No expense records found in the selected date range.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* Donut Chart */}
            <div className="lg:col-span-4 flex justify-center py-2">
              <AnalyticsDonutChart
                slices={expenseSlices}
                centerLabel="Total Expense"
                centerValue={formatIndianCurrency(expenseResult.totalExpense, 'symbol')}
                size={180}
              />
            </div>

            {/* Detailed List (with all actual grouped totals) */}
            <div className="lg:col-span-8 space-y-2">
              <div className="grid grid-cols-12 text-[10px] font-bold text-[#777777] uppercase tracking-wider px-3 py-1 border-b border-[#222222]">
                <div className="col-span-6">Expense Item (Grouped)</div>
                <div className="col-span-4 text-right">Amount</div>
                <div className="col-span-2 text-right">Share</div>
              </div>

              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {expenseResult.items.map((item) => (
                  <div
                    key={item.name}
                    className="p-2.5 bg-[#111111] hover:bg-[#161616] rounded-lg border border-[#222222] transition-colors flex flex-col gap-1.5"
                  >
                    <div className="grid grid-cols-12 items-center text-xs">
                      {/* Name & Swatch */}
                      <div className="col-span-6 flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-bold text-[#F5F5F5] truncate">
                          {item.name}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="col-span-4 text-right font-black text-[#f87171] text-xs sm:text-sm">
                        {formatIndianCurrency(item.amount, 'symbol')}
                      </div>

                      {/* Percentage */}
                      <div className="col-span-2 text-right font-black text-[#D4AF37] text-xs">
                        {item.percentage.toFixed(1)}%
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="w-full bg-[#1E1E1E] rounded-full h-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(2, item.percentage))}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          SECTION C: MEAL COUNT (NO MONETARY AMOUNTS)
          ================================================================ */}
      <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-4 sm:p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#818CF8]" />
            <h3 className="text-xs font-black text-[#F5F5F5] uppercase tracking-wider">
              Meal Count (Number of Meals Served)
            </h3>
          </div>
          <span className="text-xs font-bold text-[#818CF8]">
            Total Meals: {formatIndianNumber(mealResult.totalMeals)}
          </span>
        </div>

        {mealResult.totalMeals === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium bg-[#111111] rounded-lg border border-dashed border-[#262626]">
            No meal records found in the selected date range.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            {/* Donut Chart */}
            <div className="lg:col-span-4 flex justify-center py-2">
              <AnalyticsDonutChart
                slices={mealSlices}
                centerLabel="Total Meals"
                centerValue={`${formatIndianNumber(mealResult.totalMeals)}`}
                size={180}
              />
            </div>

            {/* Breakdown Cards */}
            <div className="lg:col-span-8 space-y-2">
              <div className="grid grid-cols-3 gap-2.5">
                {mealResult.items.map((item) => (
                  <div
                    key={item.name}
                    className="p-3 bg-[#111111] rounded-xl border border-[#262626] space-y-1 text-center"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[11px] font-bold text-[#A0A0A0] uppercase tracking-wider">
                        {item.name}
                      </span>
                    </div>

                    <div className="text-base sm:text-xl font-black text-[#F5F5F5] tracking-tight">
                      {formatIndianNumber(item.count)}
                    </div>

                    <div
                      className="text-xs font-extrabold"
                      style={{ color: item.color }}
                    >
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-[#777777] italic pt-1 px-1">
                * Meal counts accurately reflect guest counts across all meal combinations and 3-time meal plans. Monetary amounts are intentionally omitted.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Download PDF Button */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          id="btn-download-analytics-pdf-bottom"
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
          className="w-full sm:w-auto px-6 py-3 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
        >
          {isGeneratingPdf ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" />
              <span>GENERATING RESTAURANT ANALYTICS PDF...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-[#0A0A0A]" />
              <span>DOWNLOAD RESTAURANT ANALYTICS PDF</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
