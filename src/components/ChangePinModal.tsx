import React, { useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { changeAppPin } from '../services/supabaseService';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({ isOpen, onClose }) => {
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCurrentPinChange = (val: string) => {
    setErrorMsg(null);
    setCurrentPin(val.replace(/\D/g, '').slice(0, 4));
  };

  const handleNewPinChange = (val: string) => {
    setErrorMsg(null);
    setNewPin(val.replace(/\D/g, '').slice(0, 4));
  };

  const handleConfirmPinChange = (val: string) => {
    setErrorMsg(null);
    setConfirmPin(val.replace(/\D/g, '').slice(0, 4));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (currentPin.length !== 4) {
      setErrorMsg('Current PIN must be exactly 4 digits.');
      return;
    }

    if (newPin.length !== 4) {
      setErrorMsg('New PIN must be exactly 4 digits.');
      return;
    }

    if (confirmPin.length !== 4) {
      setErrorMsg('Please confirm the 4-digit new PIN.');
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMsg('New PIN and Confirm New PIN do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const isSuccess = await changeAppPin(currentPin, newPin);
      if (isSuccess) {
        setSuccessMsg('PIN changed successfully.');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setTimeout(() => {
          onClose();
          setSuccessMsg(null);
        }, 1500);
      } else {
        setErrorMsg('Current PIN is incorrect.');
      }
    } catch (err: any) {
      console.error('Failed to change PIN:', err);
      if (err.message && err.message.toLowerCase().includes('incorrect')) {
        setErrorMsg('Current PIN is incorrect.');
      } else {
        setErrorMsg(err.message || 'Current PIN is incorrect.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  return (
    <div
      id="change-pin-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 bg-black/85 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#171717] rounded-xl border border-[#2A2A2A] shadow-2xl max-w-sm w-full p-4 sm:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="text-sm font-bold text-[#F5F5F5] uppercase tracking-wide">
              Change PIN
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-[#777777] hover:text-[#F5F5F5] transition-colors p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div
            id="change-pin-success"
            className="p-3 bg-[#122014] border border-[#1d3d24] text-[#4ade80] rounded-lg text-xs font-semibold flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#4ade80]" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div
            id="change-pin-error"
            className="p-3 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-lg text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-[#f87171]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Change PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Current PIN */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#B8B8B8] uppercase tracking-wider">
              Current PIN
            </label>
            <input
              id="input-current-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              onChange={(e) => handleCurrentPinChange(e.target.value)}
              placeholder="••••"
              disabled={isSubmitting}
              autoComplete="off"
              className="w-full px-3 py-2.5 bg-[#111111] border border-[#2A2A2A] rounded-lg text-sm text-[#F5F5F5] tracking-widest text-center focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* New PIN */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#B8B8B8] uppercase tracking-wider">
              New PIN
            </label>
            <input
              id="input-new-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => handleNewPinChange(e.target.value)}
              placeholder="••••"
              disabled={isSubmitting}
              autoComplete="off"
              className="w-full px-3 py-2.5 bg-[#111111] border border-[#2A2A2A] rounded-lg text-sm text-[#F5F5F5] tracking-widest text-center focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Confirm New PIN */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#B8B8B8] uppercase tracking-wider">
              Confirm New PIN
            </label>
            <input
              id="input-confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => handleConfirmPinChange(e.target.value)}
              placeholder="••••"
              disabled={isSubmitting}
              autoComplete="off"
              className="w-full px-3 py-2.5 bg-[#111111] border border-[#2A2A2A] rounded-lg text-sm text-[#F5F5F5] tracking-widest text-center focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-[#2A2A2A]">
            <button
              type="button"
              id="btn-cancel-change-pin"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 border border-[#2A2A2A] bg-[#111111] hover:bg-[#1D1D1D] text-[#B8B8B8] hover:text-[#F5F5F5] rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-change-pin"
              disabled={
                isSubmitting ||
                currentPin.length !== 4 ||
                newPin.length !== 4 ||
                confirmPin.length !== 4
              }
              className={`flex-1 py-2.5 px-3 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer min-h-[40px] text-center flex items-center justify-center gap-1 ${
                currentPin.length !== 4 ||
                newPin.length !== 4 ||
                confirmPin.length !== 4 ||
                isSubmitting
                  ? 'opacity-40 cursor-not-allowed'
                  : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Change PIN</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
