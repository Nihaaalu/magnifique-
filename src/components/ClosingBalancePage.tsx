import React, { useState, useMemo } from 'react';
import {
  IncomeRecord,
  ExpenseRecord,
  AccountMonthRow,
  PartnerSettlement,
  Partner,
  SettlementType,
  PartnerSettlementRow,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
  formatDateDisplay,
} from '../utils/formatters';
import {
  calculateAllMonthsSummary,
  getAllAvailableAccountMonths,
} from '../utils/accountBalanceUtils';
import {
  isIncomeAssignedToPartner,
  isExpensePaidByPartner,
  isSettlementForPartner,
  getSettlementDirection,
} from '../utils/partnerBalanceUtils';
import {
  generateClosingBalancePdf,
  formatPdfMonth,
} from '../services/pdfReportGenerator';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FileText,
  Loader2,
  X,
  CreditCard,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  Check,
  Edit2,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface PendingSettlementItem {
  partnerId: string;
  partnerName: string;
  type: 'balance_to_hotel' | 'expenses_by_them';
  originalAmount: number;
  settledAmount: number;
  notes?: string;
}

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
  onAddSettlement?: (settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>) => Promise<void>;
  onDeleteSettlement?: (id: string) => Promise<void>;
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
  onAddSettlement,
  onDeleteSettlement,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [isProcessingClose, setIsProcessingClose] = useState<boolean>(false);
  const [isAddSettlementModalOpen, setIsAddSettlementModalOpen] = useState<boolean>(false);
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [settlementType, setSettlementType] = useState<SettlementType>('balance_to_hotel');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [isSavingSettlement, setIsSavingSettlement] = useState<boolean>(false);
  const [selectedPartnerForSettlement, setSelectedPartnerForSettlement] = useState<{ id: string; name: string } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // 3-Step Closing Flow State: null | 1 | 2 | 3
  const [closingStep, setClosingStep] = useState<null | 1 | 2 | 3>(null);
  const [pendingSettlements, setPendingSettlements] = useState<Record<string, PendingSettlementItem>>({});

  // Active settlement modal in Step 2:
  const [activeStep2Modal, setActiveStep2Modal] = useState<{
    partnerId: string;
    partnerName: string;
    type: 'balance_to_hotel' | 'expenses_by_them';
    currentAmount: number;
  } | null>(null);

  const [step2InputAmount, setStep2InputAmount] = useState<string>(''); // STARTS EMPTY!
  const [step2InputNotes, setStep2InputNotes] = useState<string>('');

  // Available months
  const availableMonths = useMemo(() => {
    return getAllAvailableAccountMonths(incomeRecords, expenseRecords, accountMonths);
  }, [incomeRecords, expenseRecords, accountMonths]);

  // Monthly Summaries
  const allMonthsSummary = useMemo(() => {
    return calculateAllMonthsSummary(
      incomeRecords,
      expenseRecords,
      accountMonths,
      partnerSettlements
    );
  }, [incomeRecords, expenseRecords, accountMonths, partnerSettlements]);

  const currentSummary = useMemo(() => {
    return (
      allMonthsSummary[selectedMonth] || {
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
        firstDate: `${selectedMonth}-01`,
        lastDate: `${selectedMonth}-28`,
      }
    );
  }, [allMonthsSummary, selectedMonth]);

  // Find Irshad partner
  const irshadPartner = useMemo(() => {
    return partners.find((p) => p.name.trim().toUpperCase() === 'IRSHAD') || {
      id: '2',
      name: 'IRSHAD',
      active: true,
      display_order: 2,
    };
  }, [partners]);

  // Filter income and expense records for selected month
  const monthIncome = useMemo(() => {
    return incomeRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
  }, [incomeRecords, selectedMonth]);

  const monthExpense = useMemo(() => {
    return expenseRecords.filter((r) => r.date && r.date.startsWith(selectedMonth));
  }, [expenseRecords, selectedMonth]);

  // IRSHAD Monthly Calculations
  const irshadIncomeBalance = useMemo(() => {
    return monthIncome
      .filter((r) => isIncomeAssignedToPartner(r, 'IRSHAD', irshadPartner.id))
      .reduce((sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0), 0);
  }, [monthIncome, irshadPartner.id]);

  const irshadExpenses = useMemo(() => {
    return monthExpense
      .filter((r) => isExpensePaidByPartner(r, 'IRSHAD', irshadPartner.id))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [monthExpense, irshadPartner.id]);

  const irshadNetBeforeSettlements = useMemo(() => {
    return irshadIncomeBalance - irshadExpenses;
  }, [irshadIncomeBalance, irshadExpenses]);

  // Monthly settlements belonging to IRSHAD for this month (strictly by settlement_month)
  const irshadMonthlySettlements = useMemo(() => {
    return partnerSettlements.filter((s) => {
      const isIrshad = isSettlementForPartner(s, 'IRSHAD', irshadPartner.id);
      if (!isIrshad) return false;
      const sMonth = s.settlementMonth
        ? s.settlementMonth.substring(0, 7)
        : s.date
        ? s.date.substring(0, 7)
        : '';
      return sMonth === selectedMonth;
    });
  }, [partnerSettlements, irshadPartner.id, selectedMonth]);

  const irshadSettlementsToHotel = useMemo(() => {
    return irshadMonthlySettlements
      .filter((s) => getSettlementDirection(s) === 'to_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [irshadMonthlySettlements]);

  const irshadSettlementsFromHotel = useMemo(() => {
    return irshadMonthlySettlements
      .filter((s) => getSettlementDirection(s) === 'from_hotel')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [irshadMonthlySettlements]);

  const irshadFinalOutstanding = useMemo(() => {
    return irshadNetBeforeSettlements - irshadSettlementsToHotel + irshadSettlementsFromHotel;
  }, [irshadNetBeforeSettlements, irshadSettlementsToHotel, irshadSettlementsFromHotel]);

  // Monthly calculations for all target partners for the 3-step closing review
  const partnerMonthStats = useMemo(() => {
    const targetPartners = ['IRSHAD', 'ANSARI', 'SATHISH', 'YOGESH'];
    return targetPartners.map((name) => {
      const p = partners.find((pt) => pt.name.trim().toUpperCase() === name) || {
        id: name === 'IRSHAD' ? '2' : undefined,
        name,
        active: true,
        display_order: 1,
      };
      const pid = p.id;

      const mInc = monthIncome
        .filter((r) => isIncomeAssignedToPartner(r, name, pid))
        .reduce((sum, r) => sum + (Number(r.balance) > 0 ? Number(r.balance) : 0), 0);

      const mExp = monthExpense
        .filter((r) => isExpensePaidByPartner(r, name, pid))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      const mSettled = partnerSettlements.filter((s) => {
        if (!isSettlementForPartner(s, name, pid)) return false;
        const sM = s.settlementMonth
          ? s.settlementMonth.substring(0, 7)
          : s.date
          ? s.date.substring(0, 7)
          : '';
        return sM === selectedMonth;
      });

      const settledToHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'to_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const settledFromHotel = mSettled
        .filter((s) => getSettlementDirection(s) === 'from_hotel')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      const netBalance = Math.round(mInc - mExp - settledToHotel + settledFromHotel);
      const balanceToHotel = netBalance > 0 ? netBalance : 0;
      const hotelToPartner = netBalance < 0 ? Math.abs(netBalance) : 0;

      return {
        partnerId: pid || name,
        partnerName: name,
        incomeBalance: mInc,
        expenses: mExp,
        settledToHotel,
        settledFromHotel,
        netBalance,
        balanceToHotel,
        hotelToPartner,
        hasData: balanceToHotel > 0 || hotelToPartner > 0 || mExp > 0,
      };
    });
  }, [partners, monthIncome, monthExpense, partnerSettlements, selectedMonth]);

  // Handlers
  const handleFinalConfirmAndSettle = async () => {
    if (!onCloseMonth) return;
    setIsProcessingClose(true);
    setErrorMsg(null);
    try {
      // 1. Commit all entered settlements to partner_settlements in DB
      const settlementList = Object.values(pendingSettlements) as PendingSettlementItem[];
      if (onAddSettlement && settlementList.length > 0) {
        for (const item of settlementList) {
          if (item.settledAmount > 0) {
            await onAddSettlement({
              partner_id: item.partnerId,
              settlement_date: getTodayDateString(),
              settlement_type: item.type,
              amount: item.settledAmount,
              notes: item.notes || `Month-close settlement for ${formatPdfMonth(selectedMonth)}`,
              settlement_month: `${selectedMonth}-01`,
            });
          }
        }
      }

      // 2. Mark month as closed in account_months
      await onCloseMonth(selectedMonth, currentSummary.closingBalance);

      setFeedbackMsg(
        `Month ${formatPdfMonth(selectedMonth)} closed successfully! Partner balances preserved.`
      );
      setClosingStep(null);
      setPendingSettlements({});
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      console.error('Error during final month closing:', err);
      setErrorMsg(err.message || 'Failed to complete month closing. Please try again.');
    } finally {
      setIsProcessingClose(false);
    }
  };

  const handleReopen = async () => {
    if (!onReopenMonth) return;
    setErrorMsg(null);
    try {
      await onReopenMonth(selectedMonth);
      setFeedbackMsg(`Month ${formatPdfMonth(selectedMonth)} has been re-opened.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error re-opening month:', err);
      setErrorMsg(err.message || 'Failed to re-open month.');
    }
  };

  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(settlementAmount);
    if (!amountNum || amountNum <= 0) {
      setErrorMsg('Please enter a valid positive settlement amount.');
      return;
    }
    if (!onAddSettlement) return;

    setIsSavingSettlement(true);
    setErrorMsg(null);
    const targetP = selectedPartnerForSettlement || irshadPartner;
    try {
      await onAddSettlement({
        partner_id: targetP.id || '2',
        settlement_date: settlementDate,
        settlement_type: settlementType,
        amount: amountNum,
        notes: settlementNotes.trim() || null,
        settlement_month: `${selectedMonth}-01`,
      });
      setFeedbackMsg(`Settlement of ${formatCurrency(amountNum)} added for ${targetP.name}.`);
      setIsAddSettlementModalOpen(false);
      setSettlementAmount('');
      setSettlementNotes('');
      setSelectedPartnerForSettlement(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Error creating settlement:', err);
      setErrorMsg(err.message || 'Failed to record settlement.');
    } finally {
      setIsSavingSettlement(false);
    }
  };

  const handleDownloadClosingPdf = () => {
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
    <div id="closing-balance-page" className="space-y-4 pb-10 animate-fadeIn">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#2A2A2A] pb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            id="btn-back-to-analytics"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#171717] hover:bg-[#222222] border border-[#2A2A2A] hover:border-[#D4AF37] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Back to Analytics</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] shrink-0" />
            <h1 className="text-sm sm:text-base font-black text-[#F5F5F5] tracking-wide uppercase">
              CLOSING BALANCE
            </h1>
          </div>
        </div>

        {/* Month Selector & Status Badge */}
        <div className="flex items-center gap-2">
          <select
            id="select-closing-page-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[#111111] border border-[#2A2A2A] text-[#F5F5F5] text-xs font-bold px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-[#D4AF37] cursor-pointer"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatPdfMonth(m)} {allMonthsSummary[m]?.isClosed ? '(Closed)' : ''}
              </option>
            ))}
          </select>

          {currentSummary.isClosed ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#f87171] bg-[#201212] border border-[#3d1d1d] px-2.5 py-1.5 rounded-lg shadow-xs shrink-0">
              <Lock className="w-3 h-3" />
              <span>Closed</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4ade80] bg-[#122014] border border-[#1d3d24] px-2.5 py-1.5 rounded-lg shadow-xs shrink-0">
              <Unlock className="w-3 h-3" />
              <span>Active</span>
            </span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {feedbackMsg && (
        <div className="p-2.5 bg-[#171717] border border-[#D4AF37]/60 text-[#D4AF37] rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-[#201212] border border-[#f87171]/50 text-[#f87171] rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ==================================================
          SECTION 1: MONTHLY SUMMARY (4 CARDS + PROFIT SPLIT)
          ================================================== */}
      <section className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
          <h2 className="text-xs sm:text-sm font-extrabold text-[#F5F5F5] uppercase tracking-wide">
            {formatPdfMonth(selectedMonth).toUpperCase()}
          </h2>

          <button
            type="button"
            id="btn-download-closing-balance-pdf"
            onClick={handleDownloadClosingPdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] hover:border-[#D4AF37] text-xs font-bold text-[#D4AF37] rounded-lg transition-all cursor-pointer shadow-xs"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            <span>DOWNLOAD CLOSING BALANCE PDF</span>
          </button>
        </div>

        {/* 2x2 Grid of Main Numbers */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 text-xs">
          {/* 1. Opening Balance */}
          <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#B8B8B8] font-bold block uppercase tracking-wider">
              OPENING BALANCE
            </span>
            <span className="text-base sm:text-lg font-black text-[#F5F5F5] block">
              {formatCurrency(currentSummary.openingBalance)}
            </span>
          </div>

          {/* 2. Total Income */}
          <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#4ade80] font-bold block uppercase tracking-wider">
              TOTAL INCOME
            </span>
            <span className="text-base sm:text-lg font-black text-[#4ade80] block">
              {formatCurrency(currentSummary.totalIncome)}
            </span>
          </div>

          {/* 3. Total Expense */}
          <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#f87171] font-bold block uppercase tracking-wider">
              TOTAL EXPENSE
            </span>
            <span className="text-base sm:text-lg font-black text-[#f87171] block">
              {formatCurrency(currentSummary.totalExpense)}
            </span>
          </div>

          {/* 4. Closing Balance */}
          <div className="p-3 bg-[#111111] rounded-lg border border-[#D4AF37]/50 space-y-0.5 shadow-xs">
            <span className="text-[10px] text-[#D4AF37] font-bold block uppercase tracking-wider">
              CLOSING BALANCE
            </span>
            <span className="text-base sm:text-lg font-black text-[#F2C94C] block">
              {formatCurrency(currentSummary.closingBalance)}
            </span>
          </div>
        </div>

        {/* Profit Split (Compact side-by-side) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-2 border-t border-[#2A2A2A]/70 text-xs">
          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider">
              <span>MAGNIFIQUE</span>
              <span className="text-[#D4AF37]">75%</span>
            </div>
            <span className="text-sm sm:text-base font-black text-[#D4AF37] block">
              {formatCurrency(Math.round(Math.max(0, currentSummary.totalIncome - currentSummary.totalExpense) * 0.75))}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider">
              <span>IRSHAD + ANSARI</span>
              <span className="text-[#4ade80]">25%</span>
            </div>
            <span className="text-sm sm:text-base font-black text-[#F5F5F5] block">
              {formatCurrency(Math.round(Math.max(0, currentSummary.totalIncome - currentSummary.totalExpense) * 0.25))}
            </span>
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION 2: IRSHAD OUTSTANDING
          ================================================== */}
      <section className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#2A2A2A]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <h2 className="text-xs sm:text-sm font-extrabold text-[#F5F5F5] uppercase tracking-wide">
              IRSHAD OUTSTANDING
            </h2>
          </div>

          <button
            type="button"
            id="btn-add-irshad-settlement"
            onClick={() => {
              setSettlementAmount('');
              setIsAddSettlementModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>SETTLE IRSHAD</span>
          </button>
        </div>

        {/* Prominent Card: IRSHAD OUTSTANDING */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border shadow-xs ${
            irshadFinalOutstanding > 0
              ? 'bg-[#1a140b] border-[#D4AF37]/50'
              : irshadFinalOutstanding < 0
              ? 'bg-[#0f1b11] border-[#4ade80]/50'
              : 'bg-[#111111] border-[#2A2A2A]'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B8B8B8] block">
            {irshadFinalOutstanding < 0 ? 'HOTEL TO IRSHAD' : 'IRSHAD OUTSTANDING'}
          </span>
          <span
            className={`text-xl sm:text-2xl font-black block tracking-wide my-0.5 ${
              irshadFinalOutstanding > 0
                ? 'text-[#F2C94C]'
                : irshadFinalOutstanding < 0
                ? 'text-[#4ade80]'
                : 'text-[#F5F5F5]'
            }`}
          >
            {formatCurrency(Math.abs(irshadFinalOutstanding))}
          </span>
          <span className="text-[11px] text-[#777777] font-medium block">
            {formatPdfMonth(selectedMonth)}
          </span>
        </div>

        {/* 4 Compact Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#B8B8B8] font-bold block uppercase tracking-wider">
              INCOME BALANCE
            </span>
            <span className="text-sm sm:text-base font-black text-[#F5F5F5] block">
              {formatCurrency(irshadIncomeBalance)}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#f87171] font-bold block uppercase tracking-wider">
              EXPENSE
            </span>
            <span className="text-sm sm:text-base font-black text-[#f87171] block">
              {formatCurrency(irshadExpenses)}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-0.5">
            <span className="text-[10px] text-[#38bdf8] font-bold block uppercase tracking-wider">
              SETTLED
            </span>
            <span className="text-sm sm:text-base font-black text-[#38bdf8] block">
              {formatCurrency(irshadSettlementsToHotel)}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 bg-[#111111] rounded-lg border border-[#D4AF37]/40 space-y-0.5">
            <span className="text-[10px] text-[#D4AF37] font-bold block uppercase tracking-wider">
              OUTSTANDING
            </span>
            <span className="text-sm sm:text-base font-black text-[#F2C94C] block">
              {formatCurrency(irshadFinalOutstanding)}
            </span>
          </div>
        </div>

        {/* Other Partners Cards (ANSARI, SATHISH, YOGESH) */}
        <div className="pt-2 border-t border-[#2A2A2A]/70 space-y-2">
          <span className="text-[10px] text-[#B8B8B8] font-bold uppercase tracking-wider block">
            OTHER PARTNERS ({formatPdfMonth(selectedMonth)})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {partnerMonthStats.filter(p => p.partnerName !== 'IRSHAD').map((p) => (
              <div
                key={p.partnerName}
                className="p-3 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-[#222222] pb-1.5 mb-1.5">
                    <span className="text-xs font-black text-[#F5F5F5]">{p.partnerName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPartnerForSettlement({ id: p.partnerId, name: p.partnerName });
                        setSettlementAmount('');
                        setIsAddSettlementModalOpen(true);
                      }}
                      className="px-2 py-0.5 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/40 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Settle
                    </button>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {p.balanceToHotel > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[#B8B8B8]">To Hotel:</span>
                        <span className="font-black text-[#F2C94C]">{formatCurrency(p.balanceToHotel)}</span>
                      </div>
                    ) : p.hotelToPartner > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[#B8B8B8]">Hotel owes:</span>
                        <span className="font-black text-[#4ade80]">{formatCurrency(p.hotelToPartner)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[#555555]">
                        <span>Balance:</span>
                        <span>Balanced (Rs. 0)</span>
                      </div>
                    )}
                    {p.expenses > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#f87171]">Expense:</span>
                        <span className="font-black text-[#f87171]">{formatCurrency(p.expenses)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================
          SECTION 3: CLOSE MONTH
          ================================================== */}
      <section className="bg-[#171717] rounded-xl border border-[#2A2A2A] p-3.5 sm:p-4 shadow-md space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-[#2A2A2A]">
          <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
          <h2 className="text-xs sm:text-sm font-extrabold text-[#F5F5F5] uppercase tracking-wide">
            CLOSE MONTH
          </h2>
        </div>

        {!currentSummary.isClosed ? (
          <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[#F5F5F5] block">
                {formatPdfMonth(selectedMonth)}
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[11px] text-[#777777] font-semibold">Closing Balance</span>
                <span className="text-sm sm:text-base font-black text-[#F2C94C]">
                  {formatCurrency(currentSummary.closingBalance)}
                </span>
              </div>
            </div>

            <button
              type="button"
              id="btn-confirm-open-close-modal"
              onClick={() => setClosingStep(1)}
              className="px-4 py-2 bg-[#201212] hover:bg-[#3d1d1d] border border-[#f87171]/50 text-[#f87171] hover:text-[#ff8585] rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>CLOSE {formatPdfMonth(selectedMonth).toUpperCase()}</span>
            </button>
          </div>
        ) : (
          <div className="p-3 bg-[#122014] rounded-lg border border-[#1d3d24] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#4ade80]" />
                <span className="text-xs font-bold text-[#4ade80]">
                  {formatPdfMonth(selectedMonth)} (Closed)
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[11px] text-[#86efac]/80 font-semibold">Closing Balance</span>
                <span className="text-sm sm:text-base font-black text-[#F5F5F5]">
                  {formatCurrency(currentSummary.closingBalance)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReopen}
              className="px-3.5 py-1.5 bg-[#171717] hover:bg-[#222222] border border-[#2A2A2A] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0"
            >
              <Unlock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Re-open Month</span>
            </button>
          </div>
        )}
      </section>

      {/* ==================================================
          MODAL: ADD IRSHAD SETTLEMENT
          ================================================== */}
      {isAddSettlementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-[#171717] border border-[#2A2A2A] rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div>
                <h3 className="text-sm font-extrabold text-[#F5F5F5] tracking-wide">
                  Record {(selectedPartnerForSettlement || irshadPartner).name} Settlement
                </h3>
                <span className="text-[11px] text-[#777777]">
                  For month: {formatPdfMonth(selectedMonth)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSettlementModalOpen(false)}
                className="p-1 text-[#777777] hover:text-[#F5F5F5] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSettlement} className="space-y-3.5">
              {/* Amount */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Amount (INR) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-[#777777] font-bold">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 50000"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* Settlement Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Settlement Type *
                </label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as SettlementType)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                >
                  <option value="balance_to_hotel">
                    Paid to Hotel ({(selectedPartnerForSettlement || irshadPartner).name} paid money into Hotel account)
                  </option>
                  <option value="expenses_by_them">
                    Paid to {(selectedPartnerForSettlement || irshadPartner).name} (Hotel reimbursed {(selectedPartnerForSettlement || irshadPartner).name})
                  </option>
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Settlement Date *
                </label>
                <input
                  type="date"
                  required
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Notes / Particulars (Store, UPI, Voucher)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BHUVAN STORE & MD GPAY"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-medium text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setIsAddSettlementModalOpen(false)}
                  className="px-3.5 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettlement}
                  className="px-4 py-2 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  {isSavingSettlement ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Settlement</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          THREE-STEP MONTH CLOSING WORKFLOW
          ================================================== */}

      {/* STEP 1: CLOSING DETAILS REVIEW */}
      {closingStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-[#171717] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl p-5 sm:p-6 space-y-5 shadow-2xl my-auto">
            {/* Stepper Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-black uppercase tracking-wider mb-1">
                  <span>STEP 1 OF 3</span>
                  <span>•</span>
                  <span>CLOSING DETAILS REVIEW</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                  Review {formatPdfMonth(selectedMonth)} Closing Accounts
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClosingStep(null)}
                className="p-1.5 text-[#777777] hover:text-[#F5F5F5] hover:bg-[#222222] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3 Main Numbers */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-0.5">
                <span className="text-[10px] text-[#4ade80] font-bold block uppercase tracking-wider">
                  TOTAL INCOME
                </span>
                <span className="text-sm sm:text-base font-black text-[#4ade80] block">
                  {formatCurrency(currentSummary.totalIncome)}
                </span>
              </div>

              <div className="p-3 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-0.5">
                <span className="text-[10px] text-[#f87171] font-bold block uppercase tracking-wider">
                  TOTAL EXPENSE
                </span>
                <span className="text-sm sm:text-base font-black text-[#f87171] block">
                  {formatCurrency(currentSummary.totalExpense)}
                </span>
              </div>

              <div className="p-3 bg-[#111111] rounded-xl border border-[#D4AF37]/50 space-y-0.5 shadow-xs">
                <span className="text-[10px] text-[#D4AF37] font-bold block uppercase tracking-wider">
                  CLOSING BALANCE
                </span>
                <span className="text-sm sm:text-base font-black text-[#F2C94C] block">
                  {formatCurrency(currentSummary.closingBalance)}
                </span>
              </div>
            </div>

            {/* Profit Distribution */}
            <div className="p-3.5 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-2">
              <span className="text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider block">
                PROFIT DISTRIBUTION
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-[#171717] rounded-lg border border-[#2A2A2A] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#B8B8B8] font-bold block">MAGNIFIQUE (75%)</span>
                    <span className="text-sm font-black text-[#D4AF37]">
                      {formatCurrency(Math.round(Math.max(0, currentSummary.closingBalance) * 0.75))}
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-[#171717] rounded-lg border border-[#2A2A2A] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#B8B8B8] font-bold block">IRSHAD + ANSARI (25%)</span>
                    <span className="text-sm font-black text-[#F5F5F5]">
                      {formatCurrency(Math.round(Math.max(0, currentSummary.closingBalance) * 0.25))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner Outstanding & Expenses Review */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider">
                  PARTNER OUTSTANDING & EXPENSES ({formatPdfMonth(selectedMonth).toUpperCase()})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {partnerMonthStats.map((p) => (
                  <div
                    key={p.partnerName}
                    className="p-3 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-1.5"
                  >
                    <div className="flex items-center justify-between border-b border-[#222222] pb-1.5">
                      <span className="text-xs font-black text-[#F5F5F5]">{p.partnerName}</span>
                      <span className="text-[10px] text-[#777777]">Accounting Month</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      {p.balanceToHotel > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[#B8B8B8]">Balance to Hotel:</span>
                          <span className="font-black text-[#F2C94C]">
                            {formatCurrency(p.balanceToHotel)}
                          </span>
                        </div>
                      ) : p.hotelToPartner > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[#B8B8B8]">Hotel owes Partner:</span>
                          <span className="font-black text-[#4ade80]">
                            {formatCurrency(p.hotelToPartner)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[#555555]">
                          <span>Balance:</span>
                          <span>Balanced / None</span>
                        </div>
                      )}
                      {p.expenses > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[#B8B8B8]">Expenses by Them:</span>
                          <span className="font-black text-[#f87171]">
                            {formatCurrency(p.expenses)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[#555555]">
                          <span>Expenses:</span>
                          <span>None</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] text-[11px] text-[#888888] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Step 1 of 3: Verify the figures above. No database changes occur until Step 3 final confirmation.</span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setClosingStep(null)}
                className="px-4 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-step1-continue"
                onClick={() => setClosingStep(2)}
                className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-md"
              >
                <span>REVIEW PARTNER SETTLEMENTS</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PARTNER SETTLEMENT REVIEW */}
      {closingStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-[#171717] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl p-5 sm:p-6 space-y-5 shadow-2xl my-auto">
            {/* Stepper Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-black uppercase tracking-wider mb-1">
                  <span>STEP 2 OF 3</span>
                  <span>•</span>
                  <span>PARTNER SETTLEMENT REVIEW</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                  PARTNER SETTLEMENT REVIEW — {formatPdfMonth(selectedMonth).toUpperCase()}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClosingStep(1)}
                className="p-1.5 text-[#777777] hover:text-[#F5F5F5] hover:bg-[#222222] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#888888]">
              Review each partner with outstanding amounts. You can record payments now before closing the month. Inputs start empty and only what you enter will be settled.
            </p>

            {/* Partner Cards */}
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {partnerMonthStats.filter(p => p.hasData).map((p) => {
                const balKey = `${p.partnerName}_balance_to_hotel`;
                const balSettled = pendingSettlements[balKey];
                const expKey = `${p.partnerName}_expenses_by_them`;
                const expSettled = pendingSettlements[expKey];

                return (
                  <div
                    key={p.partnerName}
                    className="p-3.5 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-[#222222] pb-2">
                      <span className="text-sm font-black text-[#F5F5F5]">{p.partnerName}</span>
                      <span className="text-[10px] text-[#777777] uppercase font-bold">Partner Account</span>
                    </div>

                    {/* Balance to Hotel Block */}
                    {p.balanceToHotel > 0 && (
                      <div className="p-3 bg-[#171717] rounded-lg border border-[#2A2A2A] space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider block">
                              BALANCE TO HOTEL (Partner owes Hotel)
                            </span>
                            <span className="text-xs text-[#888888]">
                              Current Outstanding: <strong className="text-[#F5F5F5]">{formatCurrency(p.balanceToHotel)}</strong>
                            </span>
                          </div>

                          {!balSettled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveStep2Modal({
                                  partnerId: p.partnerId,
                                  partnerName: p.partnerName,
                                  type: 'balance_to_hotel',
                                  currentAmount: p.balanceToHotel,
                                });
                                setStep2InputAmount('');
                                setStep2InputNotes('');
                              }}
                              className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
                            >
                              SETTLE
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveStep2Modal({
                                    partnerId: p.partnerId,
                                    partnerName: p.partnerName,
                                    type: 'balance_to_hotel',
                                    currentAmount: p.balanceToHotel,
                                  });
                                  setStep2InputAmount(balSettled.settledAmount.toString());
                                  setStep2InputNotes(balSettled.notes || '');
                                }}
                                className="px-2.5 py-1 bg-[#222222] hover:bg-[#2a2a2a] text-[#B8B8B8] hover:text-[#F5F5F5] border border-[#333333] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingSettlements(prev => {
                                    const next = { ...prev };
                                    delete next[balKey];
                                    return next;
                                  });
                                }}
                                className="px-2 py-1 text-[#f87171] hover:bg-[#201212] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>

                        {balSettled && (
                          <div className="grid grid-cols-3 gap-2 p-2 bg-[#111111] rounded-lg border border-[#333333] text-center text-xs">
                            <div>
                              <span className="text-[9px] text-[#777777] uppercase font-bold block">ORIGINAL</span>
                              <span className="font-bold text-[#B8B8B8]">{formatCurrency(balSettled.originalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#4ade80] uppercase font-bold block">SETTLED</span>
                              <span className="font-black text-[#4ade80]">{formatCurrency(balSettled.settledAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#F2C94C] uppercase font-bold block">REMAINING</span>
                              <span className="font-black text-[#F2C94C]">
                                {formatCurrency(Math.max(0, balSettled.originalAmount - balSettled.settledAmount))}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hotel to Partner Block */}
                    {p.hotelToPartner > 0 && (
                      <div className="p-3 bg-[#171717] rounded-lg border border-[#2A2A2A] space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-[#4ade80] font-bold uppercase tracking-wider block">
                              HOTEL TO {p.partnerName} (Hotel owes Partner)
                            </span>
                            <span className="text-xs text-[#888888]">
                              Current Outstanding: <strong className="text-[#F5F5F5]">{formatCurrency(p.hotelToPartner)}</strong>
                            </span>
                          </div>

                          {!pendingSettlements[`${p.partnerName}_expenses_by_them`] ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveStep2Modal({
                                  partnerId: p.partnerId,
                                  partnerName: p.partnerName,
                                  type: 'expenses_by_them',
                                  currentAmount: p.hotelToPartner,
                                });
                                setStep2InputAmount('');
                                setStep2InputNotes('');
                              }}
                              className="px-3 py-1.5 bg-[#4ade80] hover:bg-[#86efac] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
                            >
                              SETTLE
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = pendingSettlements[`${p.partnerName}_expenses_by_them`];
                                  setActiveStep2Modal({
                                    partnerId: p.partnerId,
                                    partnerName: p.partnerName,
                                    type: 'expenses_by_them',
                                    currentAmount: p.hotelToPartner,
                                  });
                                  setStep2InputAmount(cur?.settledAmount?.toString() || '');
                                  setStep2InputNotes(cur?.notes || '');
                                }}
                                className="px-2.5 py-1 bg-[#222222] hover:bg-[#2a2a2a] text-[#B8B8B8] hover:text-[#F5F5F5] border border-[#333333] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingSettlements(prev => {
                                    const next = { ...prev };
                                    delete next[`${p.partnerName}_expenses_by_them`];
                                    return next;
                                  });
                                }}
                                className="px-2 py-1 text-[#f87171] hover:bg-[#201212] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>

                        {pendingSettlements[`${p.partnerName}_expenses_by_them`] && (
                          <div className="grid grid-cols-3 gap-2 p-2 bg-[#111111] rounded-lg border border-[#333333] text-center text-xs">
                            <div>
                              <span className="text-[9px] text-[#777777] uppercase font-bold block">ORIGINAL</span>
                              <span className="font-bold text-[#B8B8B8]">{formatCurrency(pendingSettlements[`${p.partnerName}_expenses_by_them`].originalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#4ade80] uppercase font-bold block">SETTLED</span>
                              <span className="font-black text-[#4ade80]">{formatCurrency(pendingSettlements[`${p.partnerName}_expenses_by_them`].settledAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#F2C94C] uppercase font-bold block">REMAINING</span>
                              <span className="font-black text-[#F2C94C]">
                                {formatCurrency(Math.max(0, pendingSettlements[`${p.partnerName}_expenses_by_them`].originalAmount - pendingSettlements[`${p.partnerName}_expenses_by_them`].settledAmount))}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expense by Partner Block */}
                    {p.expenses > 0 && (
                      <div className="p-3 bg-[#171717] rounded-lg border border-[#2A2A2A] space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-[#f87171] font-bold uppercase tracking-wider block">
                              EXPENSE BY {p.partnerName} (Hotel reimburses Partner)
                            </span>
                            <span className="text-xs text-[#888888]">
                              Current Expense: <strong className="text-[#F5F5F5]">{formatCurrency(p.expenses)}</strong>
                            </span>
                          </div>

                          {!expSettled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveStep2Modal({
                                  partnerId: p.partnerId,
                                  partnerName: p.partnerName,
                                  type: 'expenses_by_them',
                                  currentAmount: p.expenses,
                                });
                                setStep2InputAmount('');
                                setStep2InputNotes('');
                              }}
                              className="px-3 py-1.5 bg-[#f87171] hover:bg-[#ff8585] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
                            >
                              SETTLE
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveStep2Modal({
                                    partnerId: p.partnerId,
                                    partnerName: p.partnerName,
                                    type: 'expenses_by_them',
                                    currentAmount: p.expenses,
                                  });
                                  setStep2InputAmount(expSettled.settledAmount.toString());
                                  setStep2InputNotes(expSettled.notes || '');
                                }}
                                className="px-2.5 py-1 bg-[#222222] hover:bg-[#2a2a2a] text-[#B8B8B8] hover:text-[#F5F5F5] border border-[#333333] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingSettlements(prev => {
                                    const next = { ...prev };
                                    delete next[expKey];
                                    return next;
                                  });
                                }}
                                className="px-2 py-1 text-[#f87171] hover:bg-[#201212] rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>

                        {expSettled && (
                          <div className="grid grid-cols-3 gap-2 p-2 bg-[#111111] rounded-lg border border-[#333333] text-center text-xs">
                            <div>
                              <span className="text-[9px] text-[#777777] uppercase font-bold block">ORIGINAL</span>
                              <span className="font-bold text-[#B8B8B8]">{formatCurrency(expSettled.originalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#4ade80] uppercase font-bold block">SETTLED</span>
                              <span className="font-black text-[#4ade80]">{formatCurrency(expSettled.settledAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-[#f87171] uppercase font-bold block">REMAINING</span>
                              <span className="font-black text-[#f87171]">
                                {formatCurrency(Math.max(0, expSettled.originalAmount - expSettled.settledAmount))}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setClosingStep(1)}
                className="px-4 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
              >
                ← Back to Step 1
              </button>
              <button
                type="button"
                id="btn-step2-continue"
                onClick={() => setClosingStep(3)}
                className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-md"
              >
                <span>CONTINUE TO FINAL CONFIRMATION</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 MODAL: ENTER SETTLEMENT AMOUNT */}
      {activeStep2Modal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-[#171717] border border-[#D4AF37]/50 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
              <div>
                <h4 className="text-sm font-extrabold text-[#F5F5F5] uppercase">
                  {activeStep2Modal.partnerName} {activeStep2Modal.type === 'balance_to_hotel' ? 'BALANCE TO HOTEL' : 'EXPENSE'}
                </h4>
                <span className="text-[11px] text-[#777777]">
                  Current Amount: <strong className="text-[#D4AF37]">{formatCurrency(activeStep2Modal.currentAmount)}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep2Modal(null)}
                className="p-1 text-[#777777] hover:text-[#F5F5F5] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = parseFloat(step2InputAmount);
                if (!amt || amt <= 0) {
                  setErrorMsg('Please enter a valid positive settlement amount.');
                  return;
                }
                const key = `${activeStep2Modal.partnerName}_${activeStep2Modal.type}`;
                setPendingSettlements(prev => ({
                  ...prev,
                  [key]: {
                    partnerId: activeStep2Modal.partnerId,
                    partnerName: activeStep2Modal.partnerName,
                    type: activeStep2Modal.type,
                    originalAmount: activeStep2Modal.currentAmount,
                    settledAmount: amt,
                    notes: step2InputNotes.trim() || undefined,
                  }
                }));
                setActiveStep2Modal(null);
              }}
              className="space-y-3.5"
            >
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Settlement Amount (INR) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-[#777777] font-bold">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Enter amount..."
                    value={step2InputAmount}
                    onChange={(e) => setStep2InputAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs font-bold text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                    autoFocus
                  />
                </div>
                <span className="text-[10px] text-[#777777] block">
                  Remaining after this: {formatCurrency(Math.max(0, activeStep2Modal.currentAmount - (parseFloat(step2InputAmount) || 0)))}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#B8B8B8] uppercase">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI, Cheque, Voucher..."
                  value={step2InputNotes}
                  onChange={(e) => setStep2InputNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg text-xs text-[#F5F5F5] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  onClick={() => setActiveStep2Modal(null)}
                  className="px-3.5 py-1.5 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#D4AF37] hover:bg-[#F2C94C] text-[#0A0A0A] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP 3: FINAL MONTH CLOSING CONFIRMATION */}
      {closingStep === 3 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-[#171717] border border-[#f87171]/50 rounded-2xl w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl my-auto">
            {/* Stepper Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#f87171]/15 border border-[#f87171]/30 text-[#f87171] text-[10px] font-black uppercase tracking-wider mb-1">
                  <span>STEP 3 OF 3</span>
                  <span>•</span>
                  <span>FINAL CONFIRM & SETTLE</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                  FINAL MONTH CLOSING — {formatPdfMonth(selectedMonth).toUpperCase()}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClosingStep(2)}
                className="p-1.5 text-[#777777] hover:text-[#F5F5F5] hover:bg-[#222222] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Settlements to commit */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider block">
                PARTNER SETTLEMENTS TO BE RECORDED
              </span>
              {Object.keys(pendingSettlements).length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {(Object.values(pendingSettlements) as PendingSettlementItem[]).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#111111] rounded-lg border border-[#2A2A2A] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#F5F5F5]">{item.partnerName}</span>
                        <span className="text-[10px] text-[#777777] block">
                          {item.type === 'balance_to_hotel' ? 'Paid to Hotel' : 'Reimbursed by Hotel'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#4ade80] block">
                          Settling: {formatCurrency(item.settledAmount)}
                        </span>
                        <span className="text-[10px] text-[#D4AF37]">
                          Remaining: {formatCurrency(Math.max(0, item.originalAmount - item.settledAmount))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] text-xs text-[#888888]">
                  No partner settlements entered for this month. All existing partner outstanding balances will be preserved across months.
                </div>
              )}
            </div>

            {/* Closing details summary */}
            <div className="p-3.5 bg-[#111111] rounded-xl border border-[#2A2A2A] space-y-2 text-xs">
              <span className="text-[10px] font-bold text-[#B8B8B8] uppercase tracking-wider block">
                CLOSING SUMMARY & SAFEGUARDS
              </span>
              <div className="space-y-1.5 text-[11px] text-[#B8B8B8]">
                <div className="flex items-center justify-between">
                  <span>Selected Month:</span>
                  <span className="font-bold text-[#F5F5F5]">{formatPdfMonth(selectedMonth)} (will be locked as CLOSED)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Final Closing Balance:</span>
                  <span className="font-black text-[#F2C94C]">{formatCurrency(currentSummary.closingBalance)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Next Month Opening Balance:</span>
                  <span className="font-bold text-[#4ade80]">Rs. 0 (Fresh monthly ledger)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Remaining Partner Balances:</span>
                  <span className="font-bold text-[#D4AF37]">Preserved continuously across months</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#201212]/50 border border-[#f87171]/40 rounded-lg text-[11px] text-[#fca5a5]">
              This is the 3rd and final confirmation. Pressing the button below will permanently record entered settlements and mark {formatPdfMonth(selectedMonth)} as CLOSED.
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setClosingStep(2)}
                className="px-4 py-2 bg-[#111111] hover:bg-[#202020] border border-[#2A2A2A] text-xs font-bold text-[#B8B8B8] rounded-lg transition-colors cursor-pointer"
              >
                ← Back to Step 2
              </button>
              <button
                type="button"
                id="btn-final-confirm-settle"
                disabled={isProcessingClose}
                onClick={handleFinalConfirmAndSettle}
                className="px-5 py-2.5 bg-[#201212] hover:bg-[#3d1d1d] border border-[#f87171]/60 text-[#f87171] hover:text-[#ff8585] text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-md"
              >
                {isProcessingClose ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>CLOSING & LOCKING MONTH...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>FINAL CONFIRM & SETTLE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
