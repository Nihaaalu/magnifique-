import { reconcilePartnerPosition, reconcileAllPartners, validatePartnerIntegrity } from './src/utils/partnerReconciliation';
import { fetchIncomeEntries, fetchExpenseEntries, fetchPartners, fetchPartnerSettlements } from './src/services/supabaseService';

async function runTests() {
  console.log('--- RUNNING USER PROMPT INTEGRITY TESTS ---');

  // Test 1: Balance = 10,000, Expense = 0 => PARTNER TO HOTEL ₹10,000
  const t1 = reconcilePartnerPosition('TEST1', undefined, [
    { id: '1', date: '2026-09-01', balance: 10000, byWho: 'TEST1', total: 10000 } as any
  ], [], []);
  console.log('TEST 1:', t1.directionLabel === 'TEST1 TO HOTEL' && t1.displayAmount === 10000 && t1.balanceToHotel === 10000 && t1.expensesByPartner === 0 ? 'PASSED' : 'FAILED', t1);

  // Test 2: Balance = 0, Expense = 10,000 => HOTEL TO PARTNER ₹10,000
  const t2 = reconcilePartnerPosition('TEST2', undefined, [], [
    { id: '1', date: '2026-09-01', amount: 10000, paidBy: 'TEST2' } as any
  ], []);
  console.log('TEST 2:', t2.directionLabel === 'HOTEL TO TEST2' && t2.displayAmount === 10000 && t2.balanceToHotel === 0 && t2.expensesByPartner === 10000 ? 'PASSED' : 'FAILED', t2);

  // Test 3: Balance = 20,000, Expense = 5,000 => PARTNER TO HOTEL ₹15,000
  const t3 = reconcilePartnerPosition('TEST3', undefined, [
    { id: '1', date: '2026-09-01', balance: 20000, byWho: 'TEST3', total: 20000 } as any
  ], [
    { id: '1', date: '2026-09-01', amount: 5000, paidBy: 'TEST3' } as any
  ], []);
  console.log('TEST 3:', t3.directionLabel === 'TEST3 TO HOTEL' && t3.displayAmount === 15000 && t3.balanceToHotel === 15000 && t3.expensesByPartner === 0 ? 'PASSED' : 'FAILED', t3);

  // Test 4: Balance = 5,000, Expense = 20,000 => HOTEL TO PARTNER ₹15,000
  const t4 = reconcilePartnerPosition('TEST4', undefined, [
    { id: '1', date: '2026-09-01', balance: 5000, byWho: 'TEST4', total: 5000 } as any
  ], [
    { id: '1', date: '2026-09-01', amount: 20000, paidBy: 'TEST4' } as any
  ], []);
  console.log('TEST 4:', t4.directionLabel === 'HOTEL TO TEST4' && t4.displayAmount === 15000 && t4.balanceToHotel === 0 && t4.expensesByPartner === 15000 ? 'PASSED' : 'FAILED', t4);

  // Test 5: Balance = 10,000, Expense = 10,000 => No outstanding position
  const t5 = reconcilePartnerPosition('TEST5', undefined, [
    { id: '1', date: '2026-09-01', balance: 10000, byWho: 'TEST5', total: 10000 } as any
  ], [
    { id: '1', date: '2026-09-01', amount: 10000, paidBy: 'TEST5' } as any
  ], []);
  console.log('TEST 5:', t5.isZero === true && t5.balanceToHotel === 0 && t5.expensesByPartner === 0 ? 'PASSED' : 'FAILED', t5);

  // Test 6 & 7: Real Database Values
  const [incomes, expenses, partners, settlements] = await Promise.all([
    fetchIncomeEntries(),
    fetchExpenseEntries(),
    fetchPartners(),
    fetchPartnerSettlements(),
  ]);

  const yogesh = partners.find(p => p.name.trim().toUpperCase() === 'YOGESH');
  const yogeshPos = reconcilePartnerPosition('YOGESH', yogesh?.id, incomes, expenses, settlements);
  console.log('TEST 6 (YOGESH CURRENT STATE):');
  console.log('  directionLabel:', yogeshPos.directionLabel, '(Expected: HOTEL TO YOGESH)');
  console.log('  displayAmount:', yogeshPos.displayAmount, '(Expected: 184570)');
  console.log('  balanceToHotel:', yogeshPos.balanceToHotel, '(Expected: 0)');
  console.log('  expensesByPartner:', yogeshPos.expensesByPartner, '(Expected: 184570)');
  console.log('  canSettleBalance:', yogeshPos.canSettleBalance, '(Expected: false)');
  console.log('  canSettleExpense:', yogeshPos.canSettleExpense, '(Expected: true)');
  console.log('  TEST 6 RESULT:', yogeshPos.directionLabel === 'HOTEL TO YOGESH' && yogeshPos.displayAmount === 184570 && yogeshPos.balanceToHotel === 0 && yogeshPos.expensesByPartner === 184570 ? 'PASSED' : 'FAILED');

  // Test 7: Partial settlement on Yogesh of 50,000
  const yogeshWithSettlement = reconcilePartnerPosition('YOGESH', yogesh?.id, incomes, expenses, [
    ...settlements,
    { partner_id: yogesh?.id, amount: 50000, settlement_type: 'expenses_by_them', settlement_date: '2026-09-30' }
  ]);
  console.log('TEST 7 (YOGESH PARTIAL SETTLEMENT 50,000):');
  console.log('  directionLabel:', yogeshWithSettlement.directionLabel, '(Expected: HOTEL TO YOGESH)');
  console.log('  displayAmount:', yogeshWithSettlement.displayAmount, '(Expected: 134570)');
  console.log('  expensesByPartner:', yogeshWithSettlement.expensesByPartner, '(Expected: 134570)');
  console.log('  TEST 7 RESULT:', yogeshWithSettlement.directionLabel === 'HOTEL TO YOGESH' && yogeshWithSettlement.displayAmount === 134570 && yogeshWithSettlement.expensesByPartner === 134570 ? 'PASSED' : 'FAILED');

  // Audit all 4 partners
  const allAudit = validatePartnerIntegrity(partners, incomes, expenses, settlements);
  console.log('AUDIT INTEGRITY REPORT:', allAudit);
}
runTests();
