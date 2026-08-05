import { addDays, addMonths, differenceInCalendarDays } from 'date-fns';
import { isPaymentToday, monthKey, monthRange, nextPaymentDate, toDate } from '../lib/dates';
import type {
  Account,
  Category,
  Debt,
  DebtPayment,
  DebtStatus,
  Goal,
  Profile,
  Snapshot,
  Transaction,
} from '../types';

/* ------------------------------- Баланс -------------------------------- */

/**
 * Переводы между своими счетами исключаются из всех расчётов: деньги остаются у пользователя,
 * а в выписке такая операция видна дважды (списание с одного счёта и зачисление на другой).
 */
export function realTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((tx) => !tx.is_transfer);
}

export interface AccountBalance {
  account: Account;
  /** Остаток, названный пользователем */
  start: number;
  /** Изменение с момента, на который назван остаток */
  delta: number;
  balance: number;
  /** Сколько операций привязано к счёту */
  operations: number;
}

/**
 * Баланс одного счёта = остаток, названный пользователем, плюс операции этого счёта
 * строго ПОСЛЕ момента, на который остаток назван. Операции до этого момента банк уже
 * учёл в названной сумме — если считать их снова, импорт старой выписки «съест» баланс.
 */
export function accountBalance(account: Account, transactions: Transaction[]): AccountBalance {
  const since = toDate(account.balance_as_of).getTime();
  let delta = 0;
  let operations = 0;

  for (const tx of transactions) {
    if (tx.account_id !== account.id) continue;
    operations++;
    if (toDate(tx.occurred_at).getTime() <= since) continue;
    // Переводы между счетами исключаются из статистики доходов и расходов,
    // но баланс конкретного счёта они меняют: деньги реально ушли с карты на другой счёт.
    delta += tx.type === 'income' ? tx.amount : -tx.amount;
  }

  return { account, start: account.balance_start, delta, balance: account.balance_start + delta, operations };
}

export function accountBalances(accounts: Account[], transactions: Transaction[]): AccountBalance[] {
  return accounts
    .filter((account) => !account.archived)
    .map((account) => accountBalance(account, transactions));
}

/** Суммарный баланс по всем активным счетам. */
export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return accountBalances(accounts, transactions).reduce((sum, item) => sum + item.balance, 0);
}

/* ------------------------- Помесячная статистика ------------------------ */

export interface MonthStat {
  key: string;
  income: number;
  expense: number;
  net: number;
}

export function monthlyStats(all: Transaction[], limit = 12): MonthStat[] {
  const transactions = realTransactions(all);
  if (transactions.length === 0) return [];
  const dates = transactions.map((t) => toDate(t.occurred_at));
  const from = new Date(Math.min(...dates.map((d) => d.getTime())));
  const keys = monthRange(from, new Date(), limit);
  const map = new Map<string, MonthStat>(
    keys.map((key) => [key, { key, income: 0, expense: 0, net: 0 }]),
  );

  for (const tx of transactions) {
    const stat = map.get(monthKey(tx.occurred_at));
    if (!stat) continue;
    if (tx.type === 'income') stat.income += tx.amount;
    else stat.expense += tx.amount;
  }
  for (const stat of map.values()) stat.net = stat.income - stat.expense;
  return keys.map((key) => map.get(key)!);
}

export interface CategorySlice {
  id: string;
  name: string;
  color: string;
  value: number;
  share: number;
}

export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month: string | null,
  type: 'expense' | 'income' = 'expense',
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();

  for (const tx of realTransactions(transactions)) {
    if (tx.type !== type) continue;
    if (month && monthKey(tx.occurred_at) !== month) continue;
    const key = tx.category_id ?? 'none';
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }

  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([id, value]) => ({
      id,
      name: byId.get(id)?.name ?? 'Без категории',
      color: byId.get(id)?.color ?? '#cbd5e1',
      value,
      share: sum > 0 ? value / sum : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/* --------------------------- До зарплаты/аванса ------------------------- */

export interface PayPeriod {
  /** Ближайшая будущая выплата */
  date: Date;
  label: 'Аванс' | 'Зарплата';
  amount: number;
  daysLeft: number;
  /** Сколько денег на руках на этот период */
  onHand: number;
  /** Сколько можно тратить в день, чтобы дожить до выплаты */
  perDay: number;
  /** Сегодня день выплаты — деньги считаются пришедшими с 00:00 */
  paidToday: 'Аванс' | 'Зарплата' | null;
}

export function payPeriod(profile: Profile | null, balance: number): PayPeriod | null {
  if (!profile) return null;
  const now = new Date();
  const advanceRule = {
    day: profile.advance_day,
    isLastDay: profile.advance_is_last_day,
    shiftFromWeekend: profile.shift_weekend_payouts,
  };
  const salaryRule = {
    day: profile.salary_day,
    isLastDay: profile.salary_is_last_day,
    shiftFromWeekend: profile.shift_weekend_payouts,
  };

  const advance = nextPaymentDate(advanceRule, now);
  const salary = nextPaymentDate(salaryRule, now);
  const isAdvance = advance <= salary;
  const date = isAdvance ? advance : salary;
  const daysLeft = Math.max(differenceInCalendarDays(date, now), 0);

  return {
    date,
    label: isAdvance ? 'Аванс' : 'Зарплата',
    amount: isAdvance ? profile.advance_amount : profile.salary_amount,
    daysLeft,
    onHand: balance,
    perDay: balance > 0 ? balance / Math.max(daysLeft, 1) : 0,
    paidToday: isPaymentToday(advanceRule, now)
      ? 'Аванс'
      : isPaymentToday(salaryRule, now)
        ? 'Зарплата'
        : null,
  };
}

/* -------------------------------- Долги -------------------------------- */

export interface DebtView {
  debt: Debt;
  paid: number;
  remaining: number;
  status: DebtStatus;
  overdue: boolean;
}

export function debtViews(debts: Debt[], payments: DebtPayment[]): DebtView[] {
  const paidByDebt = new Map<string, number>();
  for (const payment of payments) {
    paidByDebt.set(payment.debt_id, (paidByDebt.get(payment.debt_id) ?? 0) + payment.amount);
  }
  const today = new Date();

  return debts.map((debt) => {
    const paid = Math.min(paidByDebt.get(debt.id) ?? 0, debt.amount);
    const remaining = Math.max(debt.amount - paid, 0);
    const status: DebtStatus = remaining <= 0.01 ? 'closed' : paid > 0 ? 'partial' : 'open';
    return {
      debt,
      paid,
      remaining,
      status,
      overdue: Boolean(debt.due_on) && status !== 'closed' && toDate(debt.due_on!) < today,
    };
  });
}

export function debtTotals(views: DebtView[]) {
  const iOwe = views
    .filter((v) => v.debt.direction === 'i_owe' && v.status !== 'closed')
    .reduce((s, v) => s + v.remaining, 0);
  const owedToMe = views
    .filter((v) => v.debt.direction === 'owed_to_me' && v.status !== 'closed')
    .reduce((s, v) => s + v.remaining, 0);
  return { iOwe, owedToMe, net: owedToMe - iOwe };
}

/* -------------------------------- Цели --------------------------------- */

export interface GoalForecast {
  goal: Goal;
  /** Сколько уже отложено (с учётом ручных пополнений) */
  saved: number;
  /** Сколько из отложенного закрыто заёмными деньгами (долги, привязанные к цели) */
  borrowed: number;
  remaining: number;
  progress: number;
  monthsLeft: number;
  /** Нужно откладывать в месяц, чтобы успеть к дедлайну */
  requiredPerMonth: number;
  /** Нужно откладывать с каждой выплаты (аванс + зарплата = 2 выплаты в месяц) */
  requiredPerPaycheck: number;
  /** Сколько по факту получается откладывать на эту цель в месяц */
  projectedPerMonth: number;
  onTrack: boolean;
  /** Прогноз даты, когда сумма реально накопится (null — при текущем темпе не накопится) */
  projectedDate: Date | null;
  overdue: boolean;
}

/**
 * Отбрасывает текущий (незаконченный) месяц: зарплата обычно приходит в середине и в конце,
 * а траты идут с первого числа, поэтому неполный месяц всегда выглядит убыточным и тянет
 * все средние вниз. Если других месяцев нет, оставляем как есть — лучше так, чем ничего.
 */
export function completedMonths(stats: MonthStat[]): MonthStat[] {
  const current = monthKey(new Date());
  const finished = stats.filter((s) => s.key !== current);
  return finished.length > 0 ? finished : stats;
}

/**
 * Среднемесячный «свободный остаток»: доходы минус расходы за последние `months`
 * ЗАВЕРШЁННЫХ месяцев. Если данных нет — берём план из профиля (аванс + зарплата).
 */
export function averageMonthlyNet(snapshot: Snapshot, months = 3): number {
  const stats = completedMonths(
    monthlyStats(snapshot.transactions, 13).filter((s) => s.income > 0 || s.expense > 0),
  );
  const recent = stats.slice(-months);
  if (recent.length > 0) {
    return recent.reduce((sum, s) => sum + s.net, 0) / recent.length;
  }
  const profile = snapshot.profile;
  return profile ? profile.advance_amount + profile.salary_amount : 0;
}

export function averageMonthlyExpense(snapshot: Snapshot, months = 3): number {
  const stats = completedMonths(
    monthlyStats(snapshot.transactions, 13).filter((s) => s.expense > 0),
  );
  const recent = stats.slice(-months);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, s) => sum + s.expense, 0) / recent.length;
}

function monthsBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from) / 30.44;
}

export function goalForecasts(snapshot: Snapshot, debts?: DebtView[]): GoalForecast[] {
  const today = new Date();
  const active = snapshot.goals.filter((g) => !g.archived);
  const monthlyNet = Math.max(averageMonthlyNet(snapshot), 0);
  const views = debts ?? debtViews(snapshot.debts, snapshot.debtPayments);

  // Свободные деньги распределяем между целями пропорционально тому,
  // сколько каждой цели нужно откладывать в месяц.
  const needs = active.map((goal) => {
    const remaining = Math.max(goal.target_amount - goal.saved_amount, 0);
    const monthsLeft = Math.max(monthsBetween(today, toDate(goal.deadline)), 0);
    return monthsLeft > 0 ? remaining / monthsLeft : remaining;
  });
  const needsSum = needs.reduce((a, b) => a + b, 0);

  return active.map((goal, index) => {
    const borrowed = views
      .filter((v) => v.debt.goal_id === goal.id && v.debt.direction === 'i_owe')
      .reduce((s, v) => s + v.debt.amount, 0);
    const saved = goal.saved_amount;
    const remaining = Math.max(goal.target_amount - saved, 0);
    const monthsLeft = Math.max(monthsBetween(today, toDate(goal.deadline)), 0);
    const requiredPerMonth = monthsLeft > 0 ? remaining / monthsLeft : remaining;
    const share = needsSum > 0 ? needs[index] / needsSum : 0;
    const projectedPerMonth = monthlyNet * share;

    let projectedDate: Date | null = null;
    if (remaining <= 0) {
      projectedDate = today;
    } else if (projectedPerMonth > 0) {
      projectedDate = addDays(today, Math.ceil((remaining / projectedPerMonth) * 30.44));
    }

    return {
      goal,
      saved,
      borrowed,
      remaining,
      progress: goal.target_amount > 0 ? Math.min(saved / goal.target_amount, 1) : 0,
      monthsLeft,
      requiredPerMonth,
      requiredPerPaycheck: requiredPerMonth / 2,
      projectedPerMonth,
      onTrack: remaining <= 0 || (projectedPerMonth >= requiredPerMonth && monthsLeft > 0),
      projectedDate,
      overdue: remaining > 0 && toDate(goal.deadline) < today,
    };
  });
}

/** Ближайшая дата, к которой цель будет закрыта при текущем темпе (для текста рекомендаций). */
export function forecastLabel(forecast: GoalForecast): string {
  if (forecast.remaining <= 0) return 'Цель уже собрана';
  if (!forecast.projectedDate) return 'При текущем темпе накоплений цель не закроется';
  return `При текущем темпе — примерно к ${forecast.projectedDate.toLocaleDateString('ru-RU')}`;
}

export { addMonths };
