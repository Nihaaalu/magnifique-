import { IncomeRecord, ExpenseRecord } from '../types';

export interface IncomeDistributionItem {
  name: string;
  amount: number;
  percentage: number; // 0 to 100
  color: string;
}

export interface IncomeDistributionResult {
  items: IncomeDistributionItem[];
  totalIncome: number;
}

export interface ExpenseDistributionItem {
  name: string;
  amount: number;
  percentage: number; // 0 to 100
  color: string;
  isOther?: boolean;
}

export interface ExpenseDistributionResult {
  items: ExpenseDistributionItem[]; // Detailed list with all actual grouped totals
  chartItems: ExpenseDistributionItem[]; // Clean list for chart (top items + "Other Expenses")
  totalExpense: number;
}

export interface MealCountItem {
  name: 'Breakfast' | 'Lunch' | 'Dinner';
  count: number;
  percentage: number;
  color: string;
}

export interface MealCountResult {
  breakfast: number;
  lunch: number;
  dinner: number;
  totalMeals: number;
  items: MealCountItem[];
}

export type DateRangePreset = 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom';

export interface DateRangeState {
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
}

// Sophisticated color palettes matching Magnifique 2.0 Dark & Gold theme
export const CHART_COLORS = [
  '#D4AF37', // Metallic Gold
  '#F2C94C', // Bright Warm Gold
  '#10B981', // Emerald
  '#38BDF8', // Sky Blue
  '#F43F5E', // Rose / Coral
  '#818CF8', // Indigo
  '#FB923C', // Amber / Orange
  '#2DD4BF', // Teal
  '#A855F7', // Purple
  '#EAB308', // Yellow
  '#EC4899', // Pink
  '#94A3B8', // Slate Gray
];

export const MEAL_COLORS = {
  Breakfast: '#F59E0B', // Warm Amber Sunrise
  Lunch: '#10B981', // Fresh Emerald
  Dinner: '#6366F1', // Royal Indigo Evening
};

// ============================================================================
// 1. INCOME DISTRIBUTION
// ============================================================================
export function calculateIncomeDistribution(
  records: IncomeRecord[]
): IncomeDistributionResult {
  const byWhoMap = new Map<string, number>();
  let totalIncome = 0;

  for (const record of records) {
    const amount = Number(record.total) || 0;
    if (amount <= 0 && (!record.total || record.total === 0)) {
      // Continue even if 0, but totalIncome adds 0
    }
    totalIncome += amount;

    // Determine normalized person name
    let person = (record.byWho || '').trim();
    if (!person || person.toUpperCase() === 'NULL' || person.toUpperCase() === 'UNDEFINED') {
      person = 'Unknown / Not Specified';
    } else {
      person = person.toUpperCase();
    }

    const current = byWhoMap.get(person) || 0;
    byWhoMap.set(person, current + amount);
  }

  // Sort descending by amount
  const sortedEntries = Array.from(byWhoMap.entries()).sort((a, b) => b[1] - a[1]);

  const items: IncomeDistributionItem[] = sortedEntries.map(([name, amount], index) => {
    const percentage = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return {
      name,
      amount,
      percentage: Math.round(percentage * 10) / 10,
      color,
    };
  });

  return {
    items,
    totalIncome,
  };
}

// ============================================================================
// 2. EXPENSE DISTRIBUTION (NORMALIZATION + FUZZY SIMILARITY GROUPING)
// ============================================================================

/**
 * Normalizes text by:
 * - Converting to uppercase
 * - Removing parenthetical numbering e.g. "(1)", "(2)", "(A)", "[1]"
 * - Removing trailing indices/numbers e.g. "- 1", "#1", " 1", " 2"
 * - Stripping punctuation
 * - Collapsing multiple whitespace
 */
export function cleanExpenseDescription(raw: string | null | undefined): string {
  if (!raw) return 'UNSPECIFIED';
  let str = raw.trim().toUpperCase();

  // Remove parentheses with numbers/letters e.g. (1), (2), (A), (1ST)
  str = str.replace(/\s*\([0-9a-z\s#_-]+\)\s*/gi, ' ');
  str = str.replace(/\s*\[[0-9a-z\s#_-]+\]\s*/gi, ' ');

  // Remove trailing numbering e.g. " 1", " - 1", " #1", " NO. 1"
  str = str.replace(/[\s\-_#]+(?:NO\.?\s*)?[0-9]+$/gi, '');

  // Replace punctuation characters with space
  str = str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, ' ');

  // Collapse multiple spaces to single space
  str = str.replace(/\s+/g, ' ').trim();

  return str || 'UNSPECIFIED';
}

/**
 * Simple English stemmer for food/groceries/expenses:
 * - handles singular/plural (e.g. VEGETABLES -> VEGETABLE, TOMATOES -> TOMATO, EGGS -> EGG)
 * - preserves short words and words ending with SS (e.g. GAS, GLASS)
 */
function stemWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('IES') && word.length > 4) {
    return word.slice(0, -3) + 'Y'; // BERRIES -> BERRY
  }
  if (word.endsWith('OES') && word.length > 4) {
    return word.slice(0, -2); // TOMATOES -> TOMATO, POTATOES -> POTATO
  }
  if (word.endsWith('ES') && word.length > 4 && !['GAS', 'GLASS', 'DISHES'].includes(word)) {
    return word.slice(0, -1); // VEGETABLES -> VEGETABLE
  }
  if (
    word.endsWith('S') &&
    !word.endsWith('SS') &&
    !word.endsWith('US') &&
    !word.endsWith('IS') &&
    word.length > 3
  ) {
    return word.slice(0, -1); // EGGS -> EGG, ONIONS -> ONION
  }
  return word;
}

/**
 * Returns canonical comparison key for an expense description
 */
export function getExpenseBaseKey(raw: string | null | undefined): string {
  const cleaned = cleanExpenseDescription(raw);
  const words = cleaned.split(' ').filter(Boolean).map(stemWord);
  return words.join(' ');
}

/**
 * Standard Levenshtein distance calculation
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Character similarity between two strings (0.0 to 1.0)
 */
function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

interface ExpenseGroupInternal {
  baseKey: string;
  cleanName: string;
  totalAmount: number;
  sampleDescriptions: string[];
}

export function calculateExpenseDistribution(
  records: ExpenseRecord[]
): ExpenseDistributionResult {
  let totalExpense = 0;
  const groups: ExpenseGroupInternal[] = [];

  for (const record of records) {
    const amount = Number(record.amount) || 0;
    totalExpense += amount;

    const rawDesc = record.description || record.name || 'Unspecified';
    const cleaned = cleanExpenseDescription(rawDesc);
    const baseKey = getExpenseBaseKey(rawDesc);

    // Find if this description matches any existing group
    let matchedGroup: ExpenseGroupInternal | null = null;

    for (const group of groups) {
      // 1. Exact base key match (e.g. VEGETABLES vs VEGETABLE (1) -> both VEGETABLE)
      if (group.baseKey === baseKey) {
        matchedGroup = group;
        break;
      }

      // 2. Fuzzy similarity check
      // RULE: Do NOT merge if token counts differ (e.g. CHICKEN vs CHICKEN AUTO)
      const groupTokens = group.baseKey.split(' ');
      const currentTokens = baseKey.split(' ');

      if (groupTokens.length === currentTokens.length) {
        const similarity = calculateSimilarity(group.baseKey, baseKey);
        // ~90% character similarity threshold for spelling variations (e.g. VEGITABLE vs VEGETABLE)
        if (similarity >= 0.88) {
          matchedGroup = group;
          break;
        }
      }
    }

    if (matchedGroup) {
      matchedGroup.totalAmount += amount;
      matchedGroup.sampleDescriptions.push(rawDesc);
      // Prefer a clean, unnumbered representative name
      if (
        cleaned.length > matchedGroup.cleanName.length &&
        !/\([0-9]+\)/.test(rawDesc)
      ) {
        matchedGroup.cleanName = cleaned;
      }
    } else {
      groups.push({
        baseKey,
        cleanName: cleaned,
        totalAmount: amount,
        sampleDescriptions: [rawDesc],
      });
    }
  }

  // Sort groups descending by total amount
  groups.sort((a, b) => b.totalAmount - a.totalAmount);

  // Build the detailed list with all actual grouped totals
  const items: ExpenseDistributionItem[] = groups.map((g, index) => {
    const percentage = totalExpense > 0 ? (g.totalAmount / totalExpense) * 100 : 0;
    return {
      name: g.cleanName,
      amount: g.totalAmount,
      percentage: Math.round(percentage * 10) / 10,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  // Build clean chartItems: Top 7 individual slices + "OTHER EXPENSES" for everything else
  const chartItems: ExpenseDistributionItem[] = [];
  const maxChartSlices = 7;

  if (items.length <= maxChartSlices) {
    chartItems.push(...items.map((it) => ({ ...it })));
  } else {
    // Exactly Top 7
    for (let i = 0; i < maxChartSlices; i++) {
      chartItems.push({ ...items[i] });
    }
    // All items below top 7 combined into OTHER EXPENSES
    const remainingItems = items.slice(maxChartSlices);
    const otherAmount = remainingItems.reduce((sum, it) => sum + it.amount, 0);
    if (otherAmount > 0) {
      const otherPct = totalExpense > 0 ? (otherAmount / totalExpense) * 100 : 0;
      chartItems.push({
        name: 'OTHER EXPENSES',
        amount: otherAmount,
        percentage: Math.round(otherPct * 10) / 10,
        color: '#64748B', // Neutral Slate
        isOther: true,
      });
    }
  }

  return {
    items,
    chartItems: chartItems.length > 0 ? chartItems : items,
    totalExpense,
  };
}

// ============================================================================
// 3. MEAL COUNT CALCULATION
// ============================================================================
export function calculateMealCounts(
  records: IncomeRecord[]
): MealCountResult {
  let breakfast = 0;
  let lunch = 0;
  let dinner = 0;

  for (const record of records) {
    // À La Carte records do not count towards meals
    if (
      record.incomeType === 'À La Carte' ||
      record.mealPlan === 'alacarte' ||
      record.byWho === 'À LA CARTE'
    ) {
      continue;
    }

    const memberCount = Number(record.membersCount) || 0;
    if (memberCount <= 0) continue;

    const mealPlan = record.mealPlan;
    const combination = (record.mealCombination || '').toLowerCase();
    const legacyMealType = (record.mealType || '').toLowerCase();

    // 1. 3-time booking or 'all' combination contributes to all 3 meals
    if (mealPlan === '3_time' || combination === 'all') {
      breakfast += memberCount;
      lunch += memberCount;
      dinner += memberCount;
    }
    // 2. 2-time combinations
    else if (combination === 'breakfast_lunch') {
      breakfast += memberCount;
      lunch += memberCount;
    } else if (combination === 'lunch_dinner') {
      lunch += memberCount;
      dinner += memberCount;
    } else if (combination === 'breakfast_dinner') {
      breakfast += memberCount;
      dinner += memberCount;
    }
    // 3. Single meal combinations
    else if (combination === 'breakfast') {
      breakfast += memberCount;
    } else if (combination === 'lunch') {
      lunch += memberCount;
    } else if (combination === 'dinner') {
      dinner += memberCount;
    }
    // 4. Fallback to legacy meal_type if combination was not specified
    else if (legacyMealType === 'breakfast') {
      breakfast += memberCount;
    } else if (legacyMealType === 'lunch') {
      lunch += memberCount;
    } else if (legacyMealType === 'dinner') {
      dinner += memberCount;
    }
    // 5. Fallback based on prices if 1_time
    else if (mealPlan === '1_time') {
      if ((record.breakfastPrice || 0) > 0) breakfast += memberCount;
      else if ((record.lunchPrice || 0) > 0) lunch += memberCount;
      else if ((record.dinnerPrice || 0) > 0) dinner += memberCount;
      else breakfast += memberCount; // default single meal
    } else {
      breakfast += memberCount;
    }
  }

  const totalMeals = breakfast + lunch + dinner;

  const items: MealCountItem[] = [
    {
      name: 'Breakfast',
      count: breakfast,
      percentage: totalMeals > 0 ? Math.round(((breakfast / totalMeals) * 100) * 10) / 10 : 0,
      color: MEAL_COLORS.Breakfast,
    },
    {
      name: 'Lunch',
      count: lunch,
      percentage: totalMeals > 0 ? Math.round(((lunch / totalMeals) * 100) * 10) / 10 : 0,
      color: MEAL_COLORS.Lunch,
    },
    {
      name: 'Dinner',
      count: dinner,
      percentage: totalMeals > 0 ? Math.round(((dinner / totalMeals) * 100) * 10) / 10 : 0,
      color: MEAL_COLORS.Dinner,
    },
  ];

  return {
    breakfast,
    lunch,
    dinner,
    totalMeals,
    items,
  };
}

// ============================================================================
// 4. DATE RANGE HELPERS
// ============================================================================

export function filterRecordsByDateRange<T extends { date?: string }>(
  records: T[],
  startDate: string,
  endDate: string
): T[] {
  if (!startDate && !endDate) return records;
  return records.filter((r) => {
    if (!r.date) return false;
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return true;
  });
}

/**
 * Computes start & end dates and a display label for presets
 */
export function computeDateRange(
  preset: DateRangePreset,
  customStart: string,
  customEnd: string,
  availableDates: string[]
): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  if (preset === 'today') {
    return {
      startDate: todayStr,
      endDate: todayStr,
      label: `Today (${formatReadableDate(todayStr)})`,
    };
  }

  if (preset === 'this_week') {
    // Current Monday to Sunday
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day; // day 0 is Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const monStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
      monday.getDate()
    ).padStart(2, '0')}`;

    return {
      startDate: monStr,
      endDate: todayStr,
      label: `This Week (${formatReadableDate(monStr)} - ${formatReadableDate(todayStr)})`,
    };
  }

  if (preset === 'this_month') {
    const monthStart = `${yyyy}-${mm}-01`;
    return {
      startDate: monthStart,
      endDate: todayStr,
      label: `This Month (${formatReadableDate(monthStart)} - ${formatReadableDate(todayStr)})`,
    };
  }

  if (preset === 'all_time') {
    const earliest = availableDates.length > 0 ? availableDates[0] : todayStr;
    const latest = availableDates.length > 0 ? availableDates[availableDates.length - 1] : todayStr;
    return {
      startDate: earliest,
      endDate: latest,
      label: `All Time (${formatReadableDate(earliest)} - ${formatReadableDate(latest)})`,
    };
  }

  // Custom
  const start = customStart || todayStr;
  const end = customEnd || todayStr;
  return {
    startDate: start <= end ? start : end,
    endDate: start <= end ? end : start,
    label: `${formatReadableDate(start)} - ${formatReadableDate(end)}`,
  };
}

export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
