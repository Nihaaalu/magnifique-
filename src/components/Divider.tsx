import React from 'react';

interface DividerProps {
  className?: string;
  spacing?: 'default' | 'compact' | 'relaxed';
  title?: string;
  variant?: 'strong' | 'subtle' | 'gold';
}

export const Divider: React.FC<DividerProps> = ({
  className = '',
  spacing = 'default',
  title,
  variant = 'gold',
}) => {
  const spacingClass =
    spacing === 'compact'
      ? 'my-3 sm:my-4'
      : spacing === 'relaxed'
      ? 'my-6 sm:my-8'
      : 'my-4 sm:my-6';

  if (title) {
    return (
      <div className={`w-full ${spacingClass} ${className}`} role="separator">
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-[#2A2A2A]" />
          <span className="absolute bg-[#0A0A0A] px-3.5 text-[10px] sm:text-xs font-black tracking-widest text-[#D4AF37] uppercase border border-[#2A2A2A] rounded-full shadow-xs">
            {title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role="separator"
      className={`w-full ${
        variant === 'gold'
          ? 'border-t border-[#D4AF37]/30'
          : variant === 'strong'
          ? 'border-t border-[#2A2A2A]'
          : 'border-t border-[#2A2A2A]/60'
      } ${spacingClass} ${className}`}
    />
  );
};

