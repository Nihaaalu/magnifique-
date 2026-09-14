import React, { useState } from 'react';

export interface DonutSlice {
  name: string;
  value: number;
  percentage: number;
  color: string;
  displayValue?: string;
}

interface AnalyticsDonutChartProps {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  size?: number;
  strokeWidth?: number;
}

export const AnalyticsDonutChart: React.FC<AnalyticsDonutChartProps> = ({
  slices,
  centerLabel,
  centerValue,
  size = 180,
  strokeWidth = 26,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0 || slices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#222222"
            strokeWidth={strokeWidth}
          />
        </svg>
        <span className="text-xs text-[#777777] font-semibold -mt-24">No Data</span>
      </div>
    );
  }

  let accumulatedPercent = 0;

  const activeSlice = hoveredIndex !== null ? slices[hoveredIndex] : null;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {slices.map((slice, index) => {
          const sliceFraction = slice.value / total;
          const strokeDasharray = `${sliceFraction * circumference} ${circumference}`;
          const strokeDashoffset = -accumulatedPercent * circumference;
          accumulatedPercent += sliceFraction;

          const isHovered = hoveredIndex === index;

          return (
            <circle
              key={`${slice.name}-${index}`}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onTouchStart={() => setHoveredIndex(index)}
            />
          );
        })}
      </svg>

      {/* Center Display */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4"
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] text-[#A0A0A0] font-bold uppercase tracking-wider line-clamp-1 max-w-[110px]">
          {activeSlice ? activeSlice.name : centerLabel}
        </span>
        <span className="text-sm sm:text-base font-black text-[#F5F5F5] tracking-tight line-clamp-1 max-w-[120px]">
          {activeSlice ? (activeSlice.displayValue || `${activeSlice.percentage.toFixed(1)}%`) : centerValue}
        </span>
        {activeSlice && (
          <span className="text-[10px] font-bold text-[#D4AF37]">
            {activeSlice.percentage.toFixed(1)}% of total
          </span>
        )}
      </div>
    </div>
  );
};
