import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lock, Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { verifyAppPin } from '../services/supabaseService';

interface AppLockScreenProps {
  onUnlock: () => void;
}

interface PinLockData {
  failedAttempts: number;
  lockedUntil: number | null;
}

const STORAGE_KEY = 'magnifique_pin_lock';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

function getStoredLockData(): PinLockData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { failedAttempts: 0, lockedUntil: null };
    }
    const parsed = JSON.parse(raw);
    const failedAttempts = typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0;
    const lockedUntil = typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null;

    if (lockedUntil && lockedUntil <= Date.now()) {
      // Lockout expired, clean up
      localStorage.removeItem(STORAGE_KEY);
      return { failedAttempts: 0, lockedUntil: null };
    }

    return { failedAttempts, lockedUntil };
  } catch (e) {
    console.error('Invalid lock data in localStorage, resetting:', e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return { failedAttempts: 0, lockedUntil: null };
  }
}

function saveLockData(data: PinLockData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save lock data to localStorage:', e);
  }
}

function clearLockData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear lock data from localStorage:', e);
  }
}

function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0h 00m';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lockout state from localStorage
  const [lockData, setLockData] = useState<PinLockData>(() => getStoredLockData());
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const data = getStoredLockData();
    return data.lockedUntil ? Math.max(0, data.lockedUntil - Date.now()) : 0;
  });

  const isLockedOut = Boolean(lockData.lockedUntil && lockData.lockedUntil > Date.now());

  // References to the 4 input boxes
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Timer effect for countdown when locked out
  useEffect(() => {
    if (!isLockedOut || !lockData.lockedUntil) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = lockData.lockedUntil ? lockData.lockedUntil - now : 0;

      if (diff <= 0) {
        // Lockout expired automatically
        clearLockData();
        setLockData({ failedAttempts: 0, lockedUntil: null });
        setRemainingMs(0);
        setErrorMessage(null);
        setTimeout(() => {
          inputRefs[0].current?.focus();
        }, 50);
      } else {
        setRemainingMs(diff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isLockedOut, lockData.lockedUntil]);

  // Auto-focus first input on mount if not locked out
  useEffect(() => {
    if (!isLockedOut) {
      inputRefs[0].current?.focus();
    }
  }, [isLockedOut]);

  const handleDigitChange = (index: number, value: string) => {
    if (isLockedOut || isVerifying) return;
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
    if (isLockedOut || isVerifying) return;

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

  const submitPin = useCallback(
    async (pinToVerify: string) => {
      if (pinToVerify.length !== 4 || isVerifying || isLockedOut) return;

      setIsVerifying(true);
      setErrorMessage(null);

      try {
        const isValid = await verifyAppPin(pinToVerify);

        if (isValid) {
          // Reset failed attempts on correct PIN
          clearLockData();
          setLockData({ failedAttempts: 0, lockedUntil: null });
          onUnlock();
        } else {
          // Increment failed attempts
          const currentAttempts = lockData.failedAttempts || 0;
          const updatedAttempts = currentAttempts + 1;

          if (updatedAttempts >= MAX_ATTEMPTS) {
            // Lock out for 3 hours
            const lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
            const newLockData: PinLockData = {
              failedAttempts: MAX_ATTEMPTS,
              lockedUntil,
            };
            saveLockData(newLockData);
            setLockData(newLockData);
            setRemainingMs(LOCKOUT_DURATION_MS);
            setErrorMessage(null);
          } else {
            // Under max attempts
            const newLockData: PinLockData = {
              failedAttempts: updatedAttempts,
              lockedUntil: null,
            };
            saveLockData(newLockData);
            setLockData(newLockData);
            setErrorMessage('Incorrect PIN');
          }

          setPinDigits(['', '', '', '']);
          if (updatedAttempts < MAX_ATTEMPTS) {
            setTimeout(() => {
              inputRefs[0].current?.focus();
            }, 50);
          }
        }
      } catch (err: any) {
        console.error('Lock screen verification error:', err);
        // Network / Supabase error: do NOT increment failed attempts
        setErrorMessage('Unable to verify PIN. Check your connection and try again.');
        setPinDigits(['', '', '', '']);
        setTimeout(() => {
          inputRefs[0].current?.focus();
        }, 50);
      } finally {
        setIsVerifying(false);
      }
    },
    [isVerifying, isLockedOut, lockData.failedAttempts, onUnlock]
  );

  const handleUnlockClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || isVerifying) return;
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

        {/* Lockout Banner or Normal Lock Header */}
        {isLockedOut ? (
          <div
            id="lockout-alert-box"
            className="p-4 bg-[#201212] border border-[#3d1d1d] rounded-xl space-y-2 text-center shadow-lg animate-fadeIn"
          >
            <div className="w-10 h-10 mx-auto rounded-full bg-[#2a1414] border border-[#f87171]/40 flex items-center justify-center text-[#f87171]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-black text-[#f87171] uppercase tracking-wider block">
                TOO MANY ATTEMPTS
              </span>
              <p className="text-xs text-[#E5E5E5] font-medium">
                Too many incorrect attempts.
              </p>
              <p className="text-[11px] text-[#A3A3A3]">
                Try again in 3 hours.
              </p>
            </div>
            <div className="pt-1.5 border-t border-[#3d1d1d]/80">
              <span className="text-[10px] text-[#B8B8B8] uppercase font-bold tracking-wider block">
                Locked for:
              </span>
              <span
                id="lockout-countdown"
                className="text-base font-black text-[#D4AF37] tracking-wider block"
              >
                {formatRemainingTime(remainingMs)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 pt-2">
            <div className="w-12 h-12 rounded-full bg-[#111111] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-inner">
              <Lock className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-[#F5F5F5] tracking-wide">
              Enter PIN
            </span>
          </div>
        )}

        {/* Error Notification with Attempt Count */}
        {!isLockedOut && errorMessage && (
          <div
            id="lock-error-message"
            className="p-3 bg-[#201212] border border-[#3d1d1d] text-[#f87171] rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1 shadow-md animate-shake"
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#f87171]" />
              <span>{errorMessage}</span>
            </div>
            {lockData.failedAttempts > 0 && lockData.failedAttempts < MAX_ATTEMPTS && (
              <span className="text-[10px] text-[#fca5a5] font-medium">
                Attempt {lockData.failedAttempts} of {MAX_ATTEMPTS}
              </span>
            )}
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
                disabled={isVerifying || isLockedOut}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-12 h-14 sm:w-14 sm:h-14 text-center text-xl sm:text-2xl font-black rounded-xl bg-[#111111] border text-[#F5F5F5] focus:outline-none transition-all ${
                  isLockedOut
                    ? 'border-[#2A2A2A] text-[#555555] opacity-40 cursor-not-allowed'
                    : errorMessage
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
            disabled={isVerifying || isLockedOut || pinDigits.join('').length !== 4}
            className={`w-full py-3.5 px-4 bg-[#D4AF37] hover:bg-[#F2C94C] active:bg-[#9A7B16] text-[#0A0A0A] rounded-xl text-sm font-black tracking-wider uppercase transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 min-h-[48px] ${
              isLockedOut || pinDigits.join('').length !== 4 || isVerifying
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:shadow-lg'
            }`}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : isLockedOut ? (
              <span>Locked</span>
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

