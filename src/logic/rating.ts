import { money, num, percent } from '../lib/format';
import { monthKey } from '../lib/dates';
import type { Snapshot } from '../types';
import {
  averageMonthlyExpense,
  categoryBreakdown,
  currentBalance,
  debtTotals,
  debtViews,
  goalForecasts,
  monthlyStats,
} from './analytics';

export interface RatingComponent {
  key: string;
  label: string;
  /** Вес в итоговой оценке (сумма применимых весов нормируется к 1) */
  weight: number;
  /** 0..1 */
  score: number;
  /** Есть ли данные для расчёта */
  applicable: boolean;
  detail: string;
}

export interface Rating {
  /** Итоговая оценка 0..5 */
  score: number;
  /** Хватает ли данных, чтобы оценка что-то значила (нужна хотя бы половина весов) */
  enoughData: boolean;
  components: RatingComponent[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

/**
 * Веса подобраны так, чтобы решающими были две вещи, на которые пользователь влияет напрямую:
 * сколько он откладывает от дохода (0.30) и как идут цели (0.20). Долговая нагрузка (0.20)
 * важна не меньше целей, но она инерционна. Стабильность трат и подушка (по 0.15) —
 * «гигиена», они корректируют оценку, но не определяют её.
 */
const WEIGHTS = {
  savings: 0.3,
  goals: 0.2,
  debt: 0.2,
  stability: 0.15,
  cushion: 0.15,
};

export function computeRating(snapshot: Snapshot): Rating {
  const stats = monthlyStats(snapshot.transactions, 12).filter((s) => s.income > 0 || s.expense > 0);
  const recent = stats.slice(-3);
  const profile = snapshot.profile;
  const plannedIncome = profile ? profile.advance_amount + profile.salary_amount : 0;

  const factIncome = recent.length ? recent.reduce((s, m) => s + m.income, 0) / recent.length : 0;
  const income = factIncome > 0 ? factIncome : plannedIncome;
  const expense = averageMonthlyExpense(snapshot);
  const balance = currentBalance(profile, snapshot.transactions);
  const views = debtViews(snapshot.debts, snapshot.debtPayments);
  const totals = debtTotals(views);
  const forecasts = goalForecasts(snapshot, views);

  /* 1. Соотношение расходов к доходам */
  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const savings: RatingComponent = {
    key: 'savings',
    label: 'Расходы к доходам',
    weight: WEIGHTS.savings,
    // 25% сбережений от дохода — максимум; 0% и меньше — ноль баллов
    score: clamp(savingsRate / 0.25),
    applicable: income > 0 && expense > 0,
    detail:
      income > 0 && expense > 0
        ? `Тратится ${percent(expense / income)} дохода, остаётся ${money(income - expense)} в месяц.`
        : 'Недостаточно данных — загрузите выписку.',
  };

  /* 2. Прогресс по целям относительно дедлайнов */
  const goalScores = forecasts.map((f) => {
    if (f.remaining <= 0) return 1;
    if (f.overdue) return 0;
    if (f.requiredPerMonth <= 0) return 1;
    return clamp(f.projectedPerMonth / f.requiredPerMonth);
  });
  const goals: RatingComponent = {
    key: 'goals',
    label: 'Прогресс по целям',
    weight: WEIGHTS.goals,
    score: goalScores.length ? goalScores.reduce((a, b) => a + b, 0) / goalScores.length : 0,
    applicable: goalScores.length > 0,
    detail: goalScores.length
      ? `${forecasts.filter((f) => f.onTrack).length} из ${forecasts.length} целей идут по графику; ` +
        `текущий темп — ${percent(goalScores.reduce((a, b) => a + b, 0) / goalScores.length)} от нужного.`
      : 'Цели не заданы.',
  };

  /* 3. Долговая нагрузка */
  const debtRatio = income > 0 ? totals.iOwe / income : totals.iOwe > 0 ? 10 : 0;
  const overdueCount = views.filter((v) => v.overdue && v.debt.direction === 'i_owe').length;
  const debt: RatingComponent = {
    key: 'debt',
    label: 'Долговая нагрузка',
    weight: WEIGHTS.debt,
    // 0 долгов — 1 балл; долг в 6 месячных доходов и больше — 0 баллов; просрочки штрафуются
    score: clamp(1 - debtRatio / 6 - overdueCount * 0.25),
    applicable: true,
    detail:
      totals.iOwe > 0
        ? `Долгов на ${money(totals.iOwe)} — это ${num(debtRatio, 1)} месячных дохода${overdueCount ? `, просрочено: ${overdueCount}` : ''}.`
        : 'Активных долгов нет.',
  };

  /* 4. Стабильность трат */
  const expenseSeries = stats.filter((s) => s.expense > 0).map((s) => s.expense);
  const mean = expenseSeries.length
    ? expenseSeries.reduce((a, b) => a + b, 0) / expenseSeries.length
    : 0;
  const variance = expenseSeries.length
    ? expenseSeries.reduce((sum, v) => sum + (v - mean) ** 2, 0) / expenseSeries.length
    : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // Импульсивные покупки: разовые траты дороже 20% месячного дохода
  const impulseThreshold = income * 0.2;
  const impulse = snapshot.transactions.filter(
    (t) => t.type === 'expense' && impulseThreshold > 0 && t.amount > impulseThreshold,
  );
  const impulsePenalty = clamp(impulse.length * 0.1, 0, 0.4);

  const stability: RatingComponent = {
    key: 'stability',
    label: 'Стабильность трат',
    weight: WEIGHTS.stability,
    // разброс до 20% от среднего — норма, 60% и выше — ноль
    score: clamp(1 - (cv - 0.2) / 0.4 - impulsePenalty),
    applicable: expenseSeries.length >= 2,
    detail:
      expenseSeries.length >= 2
        ? `Разброс месячных трат ${percent(cv)} от среднего${impulse.length ? `, крупных разовых трат: ${impulse.length}` : ''}.`
        : 'Нужно минимум два месяца истории.',
  };

  /* 5. Финансовая подушка */
  const cushionMonths = expense > 0 ? balance / expense : balance > 0 ? 6 : 0;
  const cushion: RatingComponent = {
    key: 'cushion',
    label: 'Подушка безопасности',
    weight: WEIGHTS.cushion,
    // 3 месяца расходов — максимум
    score: clamp(cushionMonths / 3),
    // без данных о тратах «на сколько хватит остатка» посчитать нельзя
    applicable: expense > 0,
    detail:
      expense > 0
        ? `Остатка хватит на ${num(cushionMonths, 1)} мес. расходов (${money(balance)}).`
        : `Остаток ${money(balance)}, расходы ещё не посчитаны.`,
  };

  const components = [savings, goals, debt, stability, cushion];
  const applicable = components.filter((c) => c.applicable);
  const weightSum = applicable.reduce((s, c) => s + c.weight, 0);
  const score = weightSum > 0 ? applicable.reduce((s, c) => s + c.score * c.weight, 0) / weightSum : 0;
  const rating = Math.round(score * 5 * 10) / 10;
  const enoughData = weightSum >= 0.5;

  if (!enoughData) {
    return {
      score: rating,
      enoughData,
      components,
      summary:
        'Данных пока мало: загрузите выписку и добавьте цели — тогда оценка станет осмысленной.',
      strengths: [],
      weaknesses: [],
      recommendations: ['Импортируйте выписку Т-Банка — после этого появится анализ трат и рекомендации.'],
    };
  }

  /* Текстовое пояснение */
  const sorted = [...applicable].sort((a, b) => b.score - a.score);
  const strengths = sorted.filter((c) => c.score >= 0.6).map((c) => `${c.label}: ${c.detail}`);
  const weaknesses = sorted
    .filter((c) => c.score < 0.6)
    .reverse()
    .map((c) => `${c.label}: ${c.detail}`);

  const summary = buildSummary(rating, weaknesses, strengths);
  const recommendations = buildRecommendations(snapshot, {
    income,
    expense,
    balance,
    savingsRate,
    cushionMonths,
    forecasts,
    iOwe: totals.iOwe,
    overdueCount,
  });

  return { score: rating, enoughData, components, summary, strengths, weaknesses, recommendations };
}

function buildSummary(rating: number, weaknesses: string[], strengths: string[]): string {
  const head =
    rating >= 4.5
      ? 'Отличная финансовая ситуация.'
      : rating >= 3.5
        ? 'Ситуация хорошая, но есть куда расти.'
        : rating >= 2.5
          ? 'Ситуация средняя: базовые вещи в порядке, но часть показателей проседает.'
          : rating >= 1.5
            ? 'Ситуация напряжённая — деньги уходят быстрее, чем накапливаются.'
            : 'Ситуация тяжёлая: почти все показатели в красной зоне.';

  const down = weaknesses.length ? ` Вниз тянет: ${weaknesses[0].split(':')[0].toLowerCase()}.` : '';
  const up = strengths.length ? ` Держит оценку: ${strengths[0].split(':')[0].toLowerCase()}.` : '';
  return head + down + up;
}

function buildRecommendations(
  snapshot: Snapshot,
  ctx: {
    income: number;
    expense: number;
    balance: number;
    savingsRate: number;
    cushionMonths: number;
    forecasts: ReturnType<typeof goalForecasts>;
    iOwe: number;
    overdueCount: number;
  },
): string[] {
  const tips: string[] = [];
  const thisMonth = monthKey(new Date());
  const breakdown = categoryBreakdown(snapshot.transactions, snapshot.categories, thisMonth);
  const topCategory = breakdown[0];

  const behind = ctx.forecasts
    .filter((f) => !f.onTrack && f.remaining > 0)
    .sort((a, b) => b.requiredPerMonth - a.requiredPerMonth)[0];

  if (behind) {
    const gap = Math.max(behind.requiredPerMonth - behind.projectedPerMonth, 0);
    if (topCategory && gap > 0 && gap <= topCategory.value) {
      tips.push(
        `Цель «${behind.goal.title}» отстаёт: не хватает ${money(gap)} в месяц. ` +
          `Больше всего в этом месяце уходит на «${topCategory.name}» (${money(topCategory.value)}) — ` +
          `сокращение этой категории на ${percent(gap / topCategory.value)} закрывает разрыв.`,
      );
    } else if (topCategory && gap > 0) {
      // Разрыв больше самой крупной категории — считаем, скольких категорий он «стоит»
      let covered = 0;
      const needed: string[] = [];
      for (const slice of breakdown) {
        if (covered >= gap) break;
        covered += slice.value;
        needed.push(slice.name);
      }
      tips.push(
        `Цель «${behind.goal.title}» отстаёт: не хватает ${money(gap)} в месяц — это больше, ` +
          `чем вся категория «${topCategory.name}» (${money(topCategory.value)}). ` +
          (covered >= gap
            ? `Разрыв закроется, только если убрать траты по категориям: ${needed.join(', ')}. Реалистичнее сдвинуть дедлайн или уменьшить сумму цели.`
            : 'Текущих трат не хватит, чтобы закрыть разрыв даже полностью — стоит сдвинуть дедлайн или уменьшить сумму цели.'),
      );
    } else if (gap > 0) {
      tips.push(
        `Цель «${behind.goal.title}» отстаёт от графика: нужно откладывать на ${money(gap)} в месяц больше.`,
      );
    }
  }

  if (ctx.savingsRate < 0.1 && ctx.income > 0) {
    tips.push(
      `Откладывается меньше 10% дохода. Ориентир — ${money(ctx.income * 0.15)} в месяц (15%): ` +
        `это ${money((ctx.income * 0.15) / 2)} с каждой выплаты.`,
    );
  }

  if (ctx.cushionMonths < 1 && ctx.expense > 0) {
    tips.push(
      `Подушки меньше месяца расходов. Минимальная цель — ${money(ctx.expense * 3)} (3 месяца трат).`,
    );
  }

  if (ctx.overdueCount > 0) {
    tips.push(`Есть просроченные долги (${ctx.overdueCount}). Закройте их раньше пополнения целей.`);
  } else if (ctx.income > 0 && ctx.iOwe > ctx.income * 3) {
    tips.push(
      `Долги превышают три месячных дохода (${money(ctx.iOwe)}). Гасите их параллельно с накоплениями.`,
    );
  }

  if (breakdown.length >= 3 && topCategory && topCategory.share > 0.4) {
    tips.push(
      `На «${topCategory.name}» уходит ${percent(topCategory.share)} всех трат месяца — проверьте, нет ли там лишнего.`,
    );
  }

  if (tips.length === 0) tips.push('Всё в порядке: темп накоплений покрывает цели, критичных перекосов нет.');
  return tips;
}
