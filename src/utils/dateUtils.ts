export type LedgerPeriodMode = 'day' | 'week' | 'month' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
export const formatDateToISO = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse YYYY-MM-DD string to Date object
 */
export const parseISODate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/**
 * Day calculations
 */
export const getPrevDay = (dateStr: string): string => {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() - 1);
  return formatDateToISO(date);
};

export const getNextDay = (dateStr: string): string => {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() + 1);
  return formatDateToISO(date);
};

export const formatDayHeader = (dateStr: string): string => {
  const date = parseISODate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
};

/**
 * Week calculations (Monday to Sunday)
 */
export const getWeekRange = (dateStr: string): DateRange => {
  const date = parseISODate(dateStr);
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday, ...
  // Calculate difference to Monday (if Sunday (0), it's 6 days past Monday)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: formatDateToISO(monday),
    endDate: formatDateToISO(sunday),
  };
};

export const getPrevWeekDate = (dateStr: string): string => {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() - 7);
  return formatDateToISO(date);
};

export const getNextWeekDate = (dateStr: string): string => {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() + 7);
  return formatDateToISO(date);
};

export const formatWeekHeader = (startDateStr: string, endDateStr: string): string => {
  const start = parseISODate(startDateStr);
  const end = parseISODate(endDateStr);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${startYear}`;
  } else if (startYear === endYear) {
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${startYear}`;
  } else {
    return `${startMonth} ${start.getDate()}, ${startYear} - ${endMonth} ${end.getDate()}, ${endYear}`;
  }
};

/**
 * Month calculations
 */
export const getMonthRange = (year: number, month: number): DateRange => {
  // month is 1-12
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  return {
    startDate: formatDateToISO(start),
    endDate: formatDateToISO(end),
  };
};

export const getPrevMonth = (year: number, month: number): { year: number; month: number } => {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
};

export const getNextMonth = (year: number, month: number): { year: number; month: number } => {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
};

export const formatMonthHeader = (year: number, month: number): string => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  }).toUpperCase();
};

/**
 * Check if a date string is between startDate and endDate (inclusive)
 */
export const isDateInRange = (dateStr: string, startDate: string, endDate: string): boolean => {
  return dateStr >= startDate && dateStr <= endDate;
};

/**
 * Group records by Date in descending order (most recent first)
 */
export const groupRecordsByDate = <T extends { date: string }>(records: T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  // Sort records descending by date first
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  
  for (const record of sorted) {
    const existing = map.get(record.date) || [];
    existing.push(record);
    map.set(record.date, existing);
  }
  return map;
};
