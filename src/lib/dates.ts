import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns';

export const ISO_DAY = 'yyyy-MM-dd';

export function todayISO(): string {
  return format(new Date(), ISO_DAY);
}

export function toDate(iso: string | Date): Date {
  return iso instanceof Date ? iso : parseISO(iso);
}

export function fmtDay(iso: string | Date): string {
  return format(toDate(iso), 'dd.MM.yyyy');
}

export function fmtDayTime(iso: string | Date): string {
  return format(toDate(iso), 'dd.MM.yyyy HH:mm');
}

export function monthKey(iso: string | Date): string {
  return format(toDate(iso), 'yyyy-MM');
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const names = [
    'янв',
    'фев',
    'мар',
    'апр',
    'май',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return differenceInCalendarDays(toDate(b), toDate(a));
}

/** Список ключей месяцев от самого раннего до текущего (включительно), максимум `limit`. */
export function monthRange(from: Date, to: Date, limit = 12): string[] {
  const keys: string[] = [];
  let cursor = startOfMonth(from);
  const end = startOfMonth(to);
  while (cursor <= end) {
    keys.push(format(cursor, 'yyyy-MM'));
    cursor = addMonths(cursor, 1);
  }
  return keys.slice(-limit);
}

/**
 * Ближайшая дата выплаты для указанного дня месяца.
 * Если в месяце нет такого дня (например, 31 в феврале) — берётся последний день месяца.
 */
export function nextPaymentDate(dayOfMonth: number, from: Date = new Date()): Date {
  const clampToMonth = (base: Date): Date => {
    const last = endOfMonth(base).getDate();
    const d = new Date(base.getFullYear(), base.getMonth(), Math.min(dayOfMonth, last));
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisMonth = clampToMonth(start);
  if (thisMonth >= start) return thisMonth;
  return clampToMonth(addMonths(start, 1));
}
