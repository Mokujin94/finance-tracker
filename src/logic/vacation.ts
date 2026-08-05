import { addMonths, differenceInCalendarDays } from 'date-fns';
import { toDate } from '../lib/dates';
import type { VacationPlan } from '../types';

/** Стандартный ежегодный оплачиваемый отпуск по ТК РФ — 28 календарных дней в год. */
export const DAYS_PER_YEAR = 28;
/** 28 / 12 = 2.33 дня за отработанный месяц. */
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;
/** Право на отпуск за первый рабочий год возникает через 6 месяцев непрерывной работы (ст. 122 ТК РФ). */
export const MONTHS_UNTIL_FIRST_LEAVE = 6;

export interface VacationState {
  /** Отработано полных месяцев (остаток ≥15 дней округляется до полного месяца) */
  monthsWorked: number;
  /** Всего накоплено дней за весь стаж */
  accruedDays: number;
  /** Использовано дней (из профиля) */
  usedDays: number;
  /** Запланировано дней (сумма будущих периодов) */
  plannedDays: number;
  /** Доступно сейчас = накоплено − использовано − запланировано */
  availableDays: number;
  /** Есть ли право на отпуск (прошло 6 месяцев) */
  hasRight: boolean;
  /** Дата возникновения права на первый отпуск */
  rightFromDate: Date | null;
  /** Сколько дней осталось до возникновения права (0, если право уже есть) */
  daysUntilRight: number;
}

/**
 * Считает отработанные месяцы по правилам исчисления стажа:
 * полные месяцы + остаток. Остаток ≥ 15 календарных дней округляется до полного месяца,
 * остаток < 15 дней отбрасывается (п. 35 Правил об очередных отпусках, применяется и сейчас).
 */
export function monthsWorked(employmentDate: Date, on: Date = new Date()): number {
  if (on < employmentDate) return 0;
  let months =
    (on.getFullYear() - employmentDate.getFullYear()) * 12 +
    (on.getMonth() - employmentDate.getMonth());
  const anniversary = addMonths(employmentDate, months);
  if (anniversary > on) {
    months -= 1;
  }
  if (months < 0) return 0;
  const leftoverDays = differenceInCalendarDays(on, addMonths(employmentDate, months));
  return leftoverDays >= 15 ? months + 1 : months;
}

function overlapDays(plan: VacationPlan, from: Date): number {
  const start = toDate(plan.start_date);
  const end = toDate(plan.end_date);
  const effectiveStart = start > from ? start : from;
  if (end < effectiveStart) return 0;
  return differenceInCalendarDays(end, effectiveStart) + 1;
}

export function vacationDays(plan: VacationPlan): number {
  return differenceInCalendarDays(toDate(plan.end_date), toDate(plan.start_date)) + 1;
}

export function computeVacation(
  employmentDate: string | null,
  usedDays: number,
  plans: VacationPlan[],
  on: Date = new Date(),
): VacationState {
  if (!employmentDate) {
    return {
      monthsWorked: 0,
      accruedDays: 0,
      usedDays,
      plannedDays: 0,
      availableDays: 0,
      hasRight: false,
      rightFromDate: null,
      daysUntilRight: 0,
    };
  }

  const start = toDate(employmentDate);
  const months = monthsWorked(start, on);
  const accrued = Math.round(months * DAYS_PER_MONTH * 100) / 100;
  const rightFromDate = addMonths(start, MONTHS_UNTIL_FIRST_LEAVE);
  const hasRight = on >= rightFromDate;
  const planned = plans.reduce((sum, plan) => sum + overlapDays(plan, on), 0);

  return {
    monthsWorked: months,
    accruedDays: accrued,
    usedDays,
    plannedDays: planned,
    availableDays: Math.round((accrued - usedDays - planned) * 100) / 100,
    hasRight,
    rightFromDate,
    daysUntilRight: hasRight ? 0 : differenceInCalendarDays(rightFromDate, on),
  };
}
