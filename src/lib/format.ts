const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const rubPrecise = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: number, precise = false): string {
  if (!Number.isFinite(value)) return '—';
  return precise ? rubPrecise.format(value) : rub.format(Math.round(value));
}

export function num(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/** «5 дней», «1 день», «22 дня» */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${abs} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${abs} ${few}`;
  return `${abs} ${many}`;
}

export function days(n: number): string {
  // Дни отпуска накапливаются дробно (2,33 в месяц) — показываем десятые, если они есть
  if (!Number.isInteger(Math.round(n * 100) / 100)) return `${num(n, 1)} дн.`;
  return plural(n, 'день', 'дня', 'дней');
}

/** Первая буква заглавная — для названий месяцев из Intl (CSS capitalize ломает «г.»). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
