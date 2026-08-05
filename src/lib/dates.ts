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

export function nowISO(): string {
  return new Date().toISOString();
}

/** Значение для <input type="datetime-local"> из ISO-строки. */
export function toLocalInput(iso: string): string {
  const date = toDate(iso);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Обратное преобразование: значение datetime-local → ISO. */
export function fromLocalInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? nowISO() : date.toISOString();
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

export interface PayDayRule {
  /** День месяца 1–31; игнорируется, если isLastDay */
  day: number;
  /** Выплата в последний день месяца */
  isLastDay: boolean;
  /** Переносить выплату с выходного на предшествующий рабочий день */
  shiftFromWeekend: boolean;
}

function isWeekend(date: Date): boolean {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Дата выплаты в конкретном месяце.
 * Если в месяце нет такого дня (31 в феврале) — берётся последний день месяца.
 * По ТК РФ при совпадении дня выплаты с выходным зарплату выдают накануне,
 * поэтому дата сдвигается назад до ближайшего буднего дня.
 */
export function paymentDateInMonth(base: Date, rule: PayDayRule): Date {
  const lastDay = endOfMonth(base).getDate();
  const day = rule.isLastDay ? lastDay : Math.min(rule.day, lastDay);
  const date = new Date(base.getFullYear(), base.getMonth(), day);
  date.setHours(0, 0, 0, 0);

  if (rule.shiftFromWeekend) {
    while (isWeekend(date)) date.setDate(date.getDate() - 1);
  }
  return date;
}

/** Ближайшая предстоящая выплата (сегодняшняя считается предстоящей). */
export function nextPaymentDate(rule: PayDayRule, from: Date = new Date()): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisMonth = paymentDateInMonth(today, rule);
  if (thisMonth >= today) return thisMonth;
  return paymentDateInMonth(addMonths(today, 1), rule);
}
