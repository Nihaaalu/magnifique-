import jsPDF from 'jspdf';
import {
  IncomeRecord,
  ExpenseRecord,
  AccountMonthRow,
  PartnerSettlement,
  Partner,
} from '../types';
import {
  generateClosingBalancePdf as generatePdf,
  formatInrPdf,
  formatPdfCurrencyExact,
  formatPdfMonth,
} from './pdfReportGenerator';

export { formatInrPdf, formatPdfCurrencyExact, formatPdfMonth };

export function formatInrPdfExact(amount: number): string {
  return formatPdfCurrencyExact(amount);
}

/**
 * Re-exports the unified generateClosingBalancePdf generator
 */
export function generateClosingBalancePdf(
  selectedMonth: string,
  incomeRecords: IncomeRecord[] = [],
  expenseRecords: ExpenseRecord[] = [],
  accountMonths: AccountMonthRow[] = [],
  partnerSettlements: PartnerSettlement[] = [],
  partners: Partner[] = []
): jsPDF {
  return generatePdf(
    selectedMonth,
    incomeRecords,
    expenseRecords,
    accountMonths,
    partnerSettlements,
    partners
  );
}
