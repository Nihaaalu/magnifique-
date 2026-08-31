import React, { useState, useRef, useEffect } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { verifyAppPin } from '../services/supabaseService';

interface AppLockScreenProps {
  onUnlock: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // References to the 4 input boxes
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs[0].current?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    setErrorMessage(null);

    // Filter only numeric characters
    const numericChar = value.replace(/\D/g, '');

    if (!numericChar) {
      const newDigits = [...pinDigits];
      newDigits[index] = '';
      setPinDigits(newDigits);
      return;
    }

    // If user pasted or typed multiple digits
    if (numericChar.length > 1) {
      const chars = numericChar.slice(0, 4).split('');
      const newDigits = [...pinDigits];
      chars.forEach((c, idx) => {
        if (index + idx < 4) {
          newDigits[index + idx] = c;
        }
      });
      setPinDigits(newDigits);
      const nextFocus = Math.min(index + chars.length, 3);
      inputRefs[nextFocus].current?.focus();

      // Check if all 4 filled
      if (newDigits.every((d) => d !== '')) {
        submitPin(newDigits.join(''));
      }
      return;
    }

    // Single digit entry
    const char = numericChar[numericChar.length - 1];
    const newDigits = [...pinDigits];
    newDigits[index] = char;
    setPinDigits(newDigits);

    // Auto-focus next input
    if (index < 3 && char) {
      inputRefs[index + 1].current?.focus();
    }

    // Auto-submit if all 4 digits entered
    if (index === 3 && char && newDigits.slice(0, 3).every((d) => d !== '')) {
      submitPin(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pinDigits[index] && index > 0) {
        // Move to previous input on backspace if current is empty
        const newDigits = [...pinDigits];
        newDigits[index - 1] = '';
        setPinDigits(newDigits);
        inputRefs[index - 1].current?.focus();
      } else {
        const newDigits = [...pinDigits];
        newDigits[index] = '';
        setPinDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1].current?.focus();
    } else if (e.key === 'Enter') {
      const fullPin = pinDigits.join('');
      if (fullPin.length === 4) {
        submitPin(fullPin);
      }
    }
  };

  const submitPin = async (pinToVerify: string) => {
    if (pinToVerify.length !== 4 || isVerifying) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const isValid = await verifyAppPin(pinToVerify);
      if (isValid) {
        onUnlock();
      } else {
        setErrorMessage('Incorrect PIN');
        setPinDigits(['', '', '', '']);
        // Focus first box
        setTimeout(() => {
          inputRefs[0].current?.focus();
        }, 50);
      }
    } catch (err: any) {
      console.error('Lock screen verification error:', err);
      setErrorMessage(err.message || 'Error verifying PIN. Please try again.');
      setPinDigits(['', '', '', '']);
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 50);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUnlockClick = (e: React.FormEvent) => {
    e.preventDefault();
    const fullPin = pinDigits.join('');
    if (fullPin.length === 4) {
      submitPin(fullPin);
    } else {
      setErrorMessage('Please enter a 4-digit PIN');
    }
  };

  return (
    <div
      id="app-lock-screen-container"
      className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex flex-col justify-center items-center px-4 py-8 selection:bg-[#D4AF37] selection:text-[#0A0A0A]"
    >
      <div className="w-full max-w-sm bg-[#171717] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        {/* Branding Header */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-widest uppercase">
            MAGNIFIQUE <span className="text-[#D4AF37]">2.0</span>
          </h1>
          <p className="text-xs text-[#B8B8B8] font-medium tracking-wide">
            Restaurant Accounts
          </p>
        </div>

        {/* Lock Icon & Title */}
        <div className="flex flex-col items-center justify-center space-y-2 pt-2">
          <div className="w-12 h-12 rounded-full bg-[#111111] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-inner">
            <Lock className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-[#F5F5F5] tracking-wide">
            Enter PIN
          </span>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div
            id="lock-error-message"
            className="p-3 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-shake"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-[#f87171]" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PIN Entry Form */}
        <form onSubmit={handleUnlockClick} className="space-y-6">
          {/* 4 Digit Boxes */}
          <div className="flex items-center justify-center gap-3">
            {pinDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={inputRefs[idx]}
                id={`pin-input-digit-${idx}`}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                autoComplete="off"
                disabled={isVerifying}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-12 h-14 sm:w-14 sm:h-14 text-center text-xl sm:text-2xl font-black rounded-xl bg-[#111111] border text-[#F5F5F5] focus:outline-none transition-all ${
                  errorMessage
                    ? 'border-[#f87171] focus:border-[#f87171]'
                    : digit
                    ? 'border-[#D4AF37] text-[#D4AF37] shadow-xs'
                    : 'border-[#2A2A2A] focus:border-[#D4AF37]'
                }`}
              />
            ))}
          </div>

          {/* Unlock Button */}
          <button
            type="submit"
            id="btn-app-unlock"
            disabled={isVerifying || pinDigits.join('').length !== 4}
            className={`w-full py-3.5 px-4 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-xl text-sm font-black tracking-wider uppercase transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 min-h-[48px] ${
              pinDigits.join('').length !== 4 || isVerifying
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:shadow-lg'
            }`}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>Unlock</span>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="pt-2 text-[10px] text-[#555555]">
          Protected by Supabase Authentication
        </div>
      </div>
    </div>
  );
};
