import React, { useState } from 'react';
import {
  Partner,
  PartnerCurrentBalance,
  PartnerSettlementRow,
  PartnerSettlement,
  SettlementType,
} from '../types';
import {
  formatCurrency,
  getTodayDateString,
  formatDateDisplay,
} from '../utils/formatters';
import {
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface PartnerTabProps {
  partners: Partner[];
  partnerBalances: PartnerCurrentBalance[];
  partnerSettlements: (PartnerSettlement | PartnerSettlementRow)[];
  onAddSettlement: (
    settlement: Omit<PartnerSettlementRow, 'id' | 'created_at'>
  ) => Promise<void>;
  onUpdateSettlement: (
    id: string,
    settlement: Partial<Omit<PartnerSettlementRow, 'id' | 'created_at'>>
  ) => Promise<void>;
  onDeleteSettlement: (id: string) => Promise<void>;
  isLoading?: boolean;
}

interface SettlementModalState {
  mode: 'create' | 'edit';
  settlementId?: string;
  partnerId: string;
  partnerName: string;
  currentBalance: number;
}

interface DeleteModalState {
  id: string;
  partnerName: string;
  typeLabel: string;
  amount: number;
  date: string;
  notes?: string;
}

export const PartnerTab: React.FC<PartnerTabProps> = ({
  partners,
  partnerBalances,
  partnerSettlements,
  onAddSettlement,
  onUpdateSettlement,
  onDeleteSettlement,
  isLoading,
}) => {
  const [activeModal, setActiveModal] = useState<SettlementModalState | null>(null);

  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDateString());
  const [settlementType, setSettlementType] = useState<SettlementType>('balance_to_hotel');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  const getBalancesForPartner = (partnerId: string, partnerName: string) => {
    const found = partnerBalances.find(
      (b) =>
        b.partner_id === partnerId ||
        b.name?.toLowerCase() === partnerName.toLowerCase()
    );
    const netBal = found ? Number(found.net_balance) || 0 : 0;
    return {
      balanceToHotel: found ? Number(found.balance_to_hotel) || 0 : 0,
      expensesByThem: found ? Number(found.expenses_by_them) || 0 : 0,
      netBalance: netBal,
    };
  };

  // Only official partners (IRSHAD, ANSARI, MUSADDIQ, SATHISH, YOGESH)
  const officialNames = ['IRSHAD', 'ANSARI', 'MUSADDIQ', 'SATHISH', 'YOGESH'];
  const validPartners = partners.filter((p) =>
    officialNames.includes(p.name.trim().toUpperCase())
  );

  const getPartnerSettlements = (partner: Partner) => {
    return partnerSettlements.filter((s: any) => {
      const sPartnerId = String(s.partnerId || s.partner_id || '');
      const sPartnerName = String(s.partnerName || s.partner_name || '').trim().toUpperCase();
      return (
        sPartnerId === String(partner.id) ||
        (sPartnerName && sPartnerName === partner.name.trim().toUpperCase())
      );
    }).sort((a: any, b: any) => {
      const dateA = a.date || a.settlement_date || '';
      const dateB = b.date || b.settlement_date || '';
      return dateB.localeCompare(dateA) || ((b.created_at || '') > (a.created_at || '') ? 1 : -1);
    });
  };

  // Display partners who have an active balance, expenses, or any settlement history
  const displayedPartners = validPartners.filter((partner) => {
    const { netBalance, balanceToHotel, expensesByThem } = getBalancesForPartner(
      partner.id,
      partner.name
    );
    const history = getPartnerSettlements(partner);
    return (
      Math.round(netBalance) !== 0 ||
      balanceToHotel > 0 ||
      expensesByThem > 0 ||
      history.length > 0
    );
  });

  const handleOpenCreateSettlement = (
    partner: Partner,
    type: SettlementType,
    currentBalance: number
  ) => {
    setActiveModal({
      mode: 'create',
      partnerId: partner.id,
      partnerName: partner.name,
      currentBalance,
    });
    setSettlementType(type);
    setSettlementAmount(currentBalance > 0 ? currentBalance.toString() : '');
    setSettlementDate(getTodayDateString());
    setSettlementNotes('');
    setValidationError(null);
  };

  const handleOpenEditSettlement = (
    partner: Partner,
    settlement: any
  ) => {
    const sType: SettlementType =
      settlement.type === 'balance_to_hotel' || settlement.settlement_type === 'to_hotel'
        ? 'balance_to_hotel'
        : 'expenses_by_them';

    const { balanceToHotel, expensesByThem } = getBalancesForPartner(
      partner.id,
      partner.name
    );
    const relevantBalance = sType === 'balance_to_hotel' ? balanceToHotel : expensesByThem;

    setActiveModal({
      mode: 'edit',
      settlementId: String(settlement.id),
      partnerId: partner.id,
      partnerName: partner.name,
      currentBalance: relevantBalance,
    });
    setSettlementType(sType);
    setSettlementAmount(String(settlement.amount));
    setSettlementDate(
      settlement.date || settlement.settlement_date || getTodayDateString()
    );
    setSettlementNotes(settlement.notes || '');
    setValidationError(null);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setSettlementAmount('');
    setSettlementNotes('');
    setValidationError(null);
  };

  const handleOpenDeleteConfirm = (
    partner: Partner,
    settlement: any
  ) => {
    const isToHotel =
      settlement.type === 'balance_to_hotel' || settlement.settlement_type === 'to_hotel';
    setDeleteModal({
      id: String(settlement.id),
      partnerName: partner.name,
      typeLabel: isToHotel ? 'To Hotel' : 'From Hotel',
      amount: Number(settlement.amount) || 0,
      date: settlement.date || settlement.settlement_date || '',
      notes: settlement.notes || undefined,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;
    setIsSubmitting(true);
    try {
      await onDeleteSettlement(deleteModal.id);
      setFeedbackMsg(
        `Deleted settlement of ${formatCurrency(deleteModal.amount)} for ${deleteModal.partnerName}.`
      );
      setDeleteModal(null);
      setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
    } catch (err: any) {
      console.error('Error deleting settlement:', err);
      setFeedbackMsg(`Failed to delete settlement: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal) return;

    const parsedAmount = parseFloat(settlementAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid settlement amount greater than 0.');
      return;
    }

    if (!settlementDate || !settlementDate.trim()) {
      setValidationError('Please select a valid settlement date.');
      return;
    }

    if (settlementType !== 'balance_to_hotel' && settlementType !== 'expenses_by_them') {
      setValidationError('Please select a valid settlement type.');
      return;
    }

    // When creating, validate against current balance if positive
    if (
      activeModal.mode === 'create' &&
      activeModal.currentBalance > 0 &&
      parsedAmount > activeModal.currentBalance
    ) {
      setValidationError(
        `Amount cannot exceed the current balance of ${formatCurrency(
          activeModal.currentBalance
        )}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeModal.mode === 'create') {
        await onAddSettlement({
          partner_id: activeModal.partnerId,
          settlement_date: settlementDate || getTodayDateString(),
          amount: parsedAmount,
          settlement_type: settlementType,
          notes: settlementNotes.trim().toUpperCase() || null,
        });

        const typeLabel =
          settlementType === 'balance_to_hotel' ? 'To Hotel' : 'From Hotel';

        setFeedbackMsg(
          `Settled ${formatCurrency(parsedAmount)} for ${activeModal.partnerName} (${typeLabel}).`
        );
      } else {
        // Edit mode - updates only the selected partner_settlement row
        await onUpdateSettlement(activeModal.settlementId!, {
          settlement_date: settlementDate || getTodayDateString(),
          amount: parsedAmount,
          settlement_type: settlementType,
          notes: settlementNotes.trim().toUpperCase() || null,
        });

        const typeLabel =
          settlementType === 'balance_to_hotel' ? 'To Hotel' : 'From Hotel';

        setFeedbackMsg(
          `Updated settlement of ${formatCurrency(parsedAmount)} for ${activeModal.partnerName} (${typeLabel}).`
        );
      }

      handleCloseModal();

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 3500);
    } catch (err: any) {
      console.error('Error recording settlement:', err);
      setValidationError(err.message || 'Failed to save settlement in Supabase.');
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
          {displayedPartners.length} Active Partners
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

      {/* List of Active Partners */}
      <div
        className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-md overflow-hidden"
        id="partner-list"
      >
        {displayedPartners.length === 0 ? (
          <div className="py-8 text-center text-[#777777] text-xs font-medium">
            {isLoading
              ? 'Loading partners from Supabase...'
              : 'No active partner balances or expenses to display.'}
          </div>
        ) : (
          displayedPartners.map((partner, index) => {
            const { netBalance, balanceToHotel, expensesByThem } = getBalancesForPartner(
              partner.id,
              partner.name
            );
            const history = getPartnerSettlements(partner);
            const isNotLast = index < displayedPartners.length - 1;

            return (
              <React.Fragment key={partner.id}>
                <div
                  id={`partner-card-${partner.name.toLowerCase()}`}
                  className="p-3.5 sm:p-4.5 space-y-3.5 hover:bg-[#1D1D1D]/60 transition-colors"
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

                  {/* Net Running Balance Badge */}
                  {Math.round(netBalance) !== 0 && (
                    <div
                      id={`partner-${partner.name.toLowerCase()}-net-status-banner`}
                      className={`p-2.5 rounded-lg border text-xs font-black flex items-center justify-between ${
                        netBalance > 0
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#F2C94C]'
                          : 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      }`}
                    >
                      <span className="tracking-wide uppercase">
                        {netBalance > 0
                          ? `${partner.name.toUpperCase()} TO HOTEL`
                          : `HOTEL TO ${partner.name.toUpperCase()}`}
                      </span>
                      <span className="text-sm font-extrabold">
                        {formatCurrency(Math.abs(netBalance))}
                      </span>
                    </div>
                  )}

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
                        handleOpenCreateSettlement(partner, 'balance_to_hotel', balanceToHotel)
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
                        handleOpenCreateSettlement(partner, 'expenses_by_them', expensesByThem)
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

                  {/* 3. Settlement History Section inside each partner card */}
                  <div className="pt-2 border-t border-[#242424] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#D0D0D0] uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Settlement History
                      </span>
                      {history.length > 0 && (
                        <span className="text-[10px] text-[#888888] bg-[#111111] px-2 py-0.5 rounded border border-[#2A2A2A]">
                          {history.length} {history.length === 1 ? 'record' : 'records'}
                        </span>
                      )}
                    </div>

                    {history.length === 0 ? (
                      <div className="text-[11px] text-[#777777] italic py-1">
                        No settlements yet
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {history.map((s: any) => {
                          const sDate = s.date || s.settlement_date || '';
                          const isToHotel =
                            s.type === 'balance_to_hotel' ||
                            s.settlement_type === 'to_hotel';
                          const typeLabel = isToHotel ? 'To Hotel' : 'From Hotel';

                          return (
                            <div
                              key={s.id}
                              id={`settlement-row-${s.id}`}
                              className="p-2.5 bg-[#111111] rounded-lg border border-[#242424] flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-[#333333] transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center flex-wrap gap-2 text-xs">
                                  <span className="font-semibold text-[#E0E0E0]">
                                    {formatDateDisplay(sDate)}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                                      isToHotel
                                        ? 'bg-[#D4AF37]/15 text-[#F2C94C] border border-[#D4AF37]/30'
                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                  >
                                    {typeLabel}
                                  </span>
                                  <span className="font-black text-[#F5F5F5] sm:hidden ml-auto text-xs">
                                    {formatCurrency(s.amount)}
                                  </span>
                                </div>
                                {s.notes && (
                                  <div className="text-[11px] text-[#888888] mt-1 break-words">
                                    <span className="text-[#666666]">Note:</span> {s.notes}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 pt-1.5 sm:pt-0 border-t border-[#1C1C1C] sm:border-t-0">
                                <span className="hidden sm:inline-block font-black text-[#F5F5F5] text-xs sm:text-sm">
                                  {formatCurrency(s.amount)}
                                </span>
                                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                                  <button
                                    type="button"
                                    id={`btn-edit-settlement-${s.id}`}
                                    onClick={() => handleOpenEditSettlement(partner, s)}
                                    className="px-2.5 py-1 rounded bg-[#1A1A1A] hover:bg-[#262626] text-[#D4AF37] hover:text-[#F2C94C] border border-[#333333] text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 min-h-[30px]"
                                    title="Edit Settlement"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    id={`btn-delete-settlement-${s.id}`}
                                    onClick={() => handleOpenDeleteConfirm(partner, s)}
                                    className="px-2.5 py-1 rounded bg-[#1A1A1A] hover:bg-[#2C1515] text-[#f87171] hover:text-[#ef4444] border border-[#333333] hover:border-[#5a2222] text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 min-h-[30px]"
                                    title="Delete Settlement"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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

      {/* ==================================================
          SETTLEMENT MODAL / FORM (CREATE & EDIT)
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
                  {activeModal.mode === 'edit' ? 'Edit Settlement' : 'New Settlement'}
                </h3>
                <p className="text-xs font-bold text-[#D4AF37] mt-0.5">
                  {activeModal.partnerName}
                </p>
                <p className="text-[11px] text-[#777777] mt-0.5">
                  {settlementType === 'balance_to_hotel'
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
              {/* Partner Name Display (Read-Only) */}
              <div className="p-2.5 bg-[#111111] border border-[#2A2A2A] rounded-lg flex items-center justify-between">
                <span className="text-xs text-[#888888] font-semibold">
                  Partner:
                </span>
                <span className="text-xs font-extrabold text-[#F5F5F5] uppercase tracking-wider">
                  {activeModal.partnerName}
                </span>
              </div>

              {/* Settlement Type Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-[#D0D0D0] mb-1">
                  Settlement Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    id="settlement-type-to-hotel"
                    onClick={() => setSettlementType('balance_to_hotel')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center border ${
                      settlementType === 'balance_to_hotel'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#F2C94C]'
                        : 'bg-[#111111] border-[#2A2A2A] text-[#888888] hover:text-[#D0D0D0]'
                    }`}
                  >
                    To Hotel
                  </button>
                  <button
                    type="button"
                    id="settlement-type-from-hotel"
                    onClick={() => setSettlementType('expenses_by_them')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center border ${
                      settlementType === 'expenses_by_them'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-[#111111] border-[#2A2A2A] text-[#888888] hover:text-[#D0D0D0]'
                    }`}
                  >
                    From Hotel
                  </button>
                </div>
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
                  placeholder="e.g. Cash settled, Bank transfer"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-[#111111] border border-[#2A2A2A] rounded-md text-xs text-[#F5F5F5] min-h-[40px] focus:outline-none focus:border-[#D4AF37] transition-colors uppercase"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              {/* Quick Preset: Full Amount (if creating and balance > 0) */}
              {activeModal.mode === 'create' && activeModal.currentBalance > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSettlementAmount(activeModal.currentBalance.toString())}
                    className="text-[11px] font-bold text-[#D4AF37] hover:text-[#F2C94C] cursor-pointer underline"
                  >
                    Settle Full Amount ({formatCurrency(activeModal.currentBalance)})
                  </button>
                </div>
              )}

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
                  {isSubmitting
                    ? activeModal.mode === 'edit'
                      ? 'Updating...'
                      : 'Saving...'
                    : activeModal.mode === 'edit'
                    ? 'Update Settlement'
                    : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================
          DELETE CONFIRMATION DIALOG (MODAL)
          ================================================== */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/85 backdrop-blur-xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-settlement-title"
        >
          <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <h3 id="delete-settlement-title" className="text-sm font-bold text-[#F5F5F5]">
                Delete Settlement?
              </h3>
            </div>

            <div className="p-3 bg-[#111111] rounded-lg border border-[#2A2A2A] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#888888]">Partner</span>
                <span className="font-extrabold text-[#F5F5F5] uppercase tracking-wide">
                  {deleteModal.partnerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888888]">Type</span>
                <span className="font-bold text-[#D0D0D0]">
                  {deleteModal.typeLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888888]">Amount</span>
                <span className="text-sm font-black text-[#F2C94C]">
                  {formatCurrency(deleteModal.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#888888]">Date</span>
                <span className="font-semibold text-[#D0D0D0]">
                  {formatDateDisplay(deleteModal.date)}
                </span>
              </div>
              {deleteModal.notes && (
                <div className="pt-1.5 border-t border-[#1F1F1F] text-[11px] text-[#888888]">
                  <span className="text-[#666666]">Note:</span> {deleteModal.notes}
                </div>
              )}
            </div>

            <p className="text-xs text-[#f87171]/90 font-medium">
              This action cannot be undone.
            </p>

            <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                disabled={isSubmitting}
                className="w-24 py-2 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-settlement"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg text-xs font-black tracking-wider uppercase transition-all shadow-xs cursor-pointer min-h-[40px] text-center disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
