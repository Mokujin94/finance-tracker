import type { TxType } from '../types';

export interface ParsedRow {
  /** ISO-дата-время операции */
  occurredAt: string;
  /** Положительная сумма */
  amount: number;
  type: TxType;
  description: string;
  counterparty: string | null;
  mcc: string | null;
  rawCategory: string | null;
  dedupHash: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: number;
  warnings: string[];
  /** Заголовки, которые удалось распознать (для отладки формата) */
  detected: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Кодировка и разбор CSV                                              */
/* ------------------------------------------------------------------ */

/**
 * Т-Банк отдаёт CSV в windows-1251 с разделителем «;». Но встречаются и UTF-8 выгрузки,
 * поэтому кодировку определяем по содержимому: берём вариант с меньшим числом «битых»
 * символов и большей долей кириллицы.
 */
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  // Строгий UTF-8: если байты — валидный UTF-8, это UTF-8. Кириллица в windows-1251
  // почти всегда даёт невалидные UTF-8 последовательности, и декодер бросает исключение.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const counts: Array<[string, number]> = [
    [';', (line.match(/;/g) ?? []).length],
    ['\t', (line.match(/\t/g) ?? []).length],
    [',', (line.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/** Разбор CSV с поддержкой кавычек и переводов строк внутри полей. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/* ------------------------------------------------------------------ */
/* Нормализация значений                                               */
/* ------------------------------------------------------------------ */

function normalizeHeader(value: string): string {
  return value
    .replace(/﻿/g, '')
    .replace(/["']/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** «-1 234,56» → -1234.56 */
function parseAmount(value: string): number | null {
  if (typeof value === 'number') return value;
  if (!value) return null;
  const cleaned = String(value)
    .replace(/ |\s/g, '')
    .replace(/[^0-9,.\-+]/g, '')
    .replace(/,/g, '.');
  if (!cleaned || cleaned === '-' || cleaned === '+') return null;
  // если осталось несколько точек — считаем, что первые были разделителями тысяч
  const parts = cleaned.split('.');
  const normalized = parts.length > 2 ? parts.slice(0, -1).join('') + '.' + parts.at(-1) : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Поддерживает «05.08.2026 13:45:12», «05.08.2026», ISO и Date из xlsx. */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const str = String(value ?? '').trim();
  if (!str) return null;

  const ru = str.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ru) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = ru;
    return new Date(+y, +m - 1, +d, +hh, +mm, +ss);
  }
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = iso;
    return new Date(+y, +m - 1, +d, +hh, +mm, +ss);
  }
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** FNV-1a — короткий стабильный хэш для дедупликации. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let h2 = 0x1000193;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ */
/* Сопоставление колонок                                               */
/* ------------------------------------------------------------------ */

const COLUMN_SYNONYMS: Record<string, string[]> = {
  dateOperation: ['дата операции', 'дата и время операции', 'дата', 'date', 'operation date'],
  datePayment: ['дата платежа', 'дата обработки'],
  status: ['статус', 'status'],
  amountOperation: ['сумма операции', 'сумма в валюте операции', 'сумма'],
  currencyOperation: ['валюта операции', 'валюта'],
  amountPayment: ['сумма платежа', 'сумма в валюте счета', 'сумма в валюте счёта'],
  currencyPayment: ['валюта платежа', 'валюта счета', 'валюта счёта'],
  category: ['категория', 'category'],
  mcc: ['mcc', 'мсс', 'mcc-код', 'код мсс'],
  description: ['описание', 'назначение платежа', 'контрагент', 'описание операции', 'description'],
  cardNumber: ['номер карты'],
};

type ColumnMap = Partial<Record<keyof typeof COLUMN_SYNONYMS, number>>;

function mapColumns(header: string[]): { map: ColumnMap; detected: Record<string, string> } {
  const normalized = header.map(normalizeHeader);
  const map: ColumnMap = {};
  const detected: Record<string, string> = {};

  for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    let index = normalized.findIndex((h) => synonyms.includes(h));
    if (index < 0) index = normalized.findIndex((h) => synonyms.some((s) => h.startsWith(s)));
    if (index >= 0) {
      map[key as keyof typeof COLUMN_SYNONYMS] = index;
      detected[key] = header[index].trim();
    }
  }
  return { map, detected };
}

const FAILED_STATUSES = ['failed', 'отказ', 'отклонен', 'отклонён', 'отменен', 'отменён', 'cancel'];

/* ------------------------------------------------------------------ */
/* Публичный API                                                       */
/* ------------------------------------------------------------------ */

async function fileToMatrix(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);

  if (isExcel) {
    // xlsx весит около 400 КБ — грузим только когда действительно открывают Excel-файл
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
    return matrix.map((row) =>
      row.map((cell) => (cell instanceof Date ? cell.toISOString() : String(cell ?? ''))),
    );
  }

  const text = decodeText(buffer);
  return parseCsv(text, detectDelimiter(text));
}

/** Ищет строку заголовков (у части выгрузок сверху идут служебные строки). */
function findHeaderRow(matrix: string[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const normalized = matrix[i].map(normalizeHeader);
    const hasDate = normalized.some((h) => COLUMN_SYNONYMS.dateOperation.some((s) => h.startsWith(s)));
    const hasAmount = normalized.some((h) =>
      [...COLUMN_SYNONYMS.amountOperation, ...COLUMN_SYNONYMS.amountPayment].some((s) =>
        h.startsWith(s),
      ),
    );
    if (hasDate && hasAmount) return i;
  }
  return -1;
}

/**
 * Разбирает выписку Т-Банка (CSV в windows-1251/UTF-8 либо Excel).
 * PDF не поддерживается — в личном кабинете нужно выгружать CSV или Excel.
 */
export async function parseStatement(file: File): Promise<ParseResult> {
  const warnings: string[] = [];
  if (/\.pdf$/i.test(file.name)) {
    throw new Error(
      'PDF-выписка не поддерживается: в приложении Т-Банка выберите формат CSV или Excel.',
    );
  }

  const matrix = await fileToMatrix(file);
  if (matrix.length === 0) throw new Error('Файл пустой или не читается.');

  const headerIndex = findHeaderRow(matrix);
  if (headerIndex < 0) {
    throw new Error(
      'Не найдены колонки «Дата операции» и «Сумма операции» — похоже, это не выписка Т-Банка.',
    );
  }

  const { map, detected } = mapColumns(matrix[headerIndex]);
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    const cell = (key: keyof typeof COLUMN_SYNONYMS): string => {
      const index = map[key];
      return index === undefined ? '' : (raw[index] ?? '').toString().trim();
    };

    const status = cell('status').toLowerCase();
    if (status && FAILED_STATUSES.some((s) => status.includes(s))) {
      skipped++;
      continue;
    }

    const date = parseDate(cell('dateOperation') || cell('datePayment'));
    if (!date) {
      skipped++;
      continue;
    }

    // Приоритет — сумма в рублях (в выписке это «Сумма платежа»), иначе сумма операции.
    const currencyPayment = cell('currencyPayment').toUpperCase();
    const paymentAmount = parseAmount(cell('amountPayment'));
    const operationAmount = parseAmount(cell('amountOperation'));
    const amount =
      paymentAmount !== null && (currencyPayment === '' || currencyPayment.startsWith('RUB'))
        ? paymentAmount
        : (operationAmount ?? paymentAmount);

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    const description = cell('description') || cell('category') || 'Операция';
    const rawCategory = cell('category') || null;
    const mccValue = cell('mcc').replace(/\D/g, '');
    const type: TxType = amount < 0 ? 'expense' : 'income';
    const absolute = Math.abs(amount);

    const dedupHash = hashString(
      [
        date.toISOString().slice(0, 10),
        absolute.toFixed(2),
        type,
        description.toLowerCase().replace(/\s+/g, ' '),
      ].join('|'),
    );

    // Внутри одного файла одинаковые операции (одна дата, сумма, описание) — разные операции,
    // поэтому к повторам добавляем счётчик, чтобы они не схлопнулись при импорте.
    let uniqueHash = dedupHash;
    let counter = 1;
    while (seen.has(uniqueHash)) {
      uniqueHash = hashString(`${dedupHash}#${counter++}`);
    }
    seen.add(uniqueHash);

    rows.push({
      occurredAt: date.toISOString(),
      amount: absolute,
      type,
      description,
      counterparty: null,
      mcc: mccValue || null,
      rawCategory,
      dedupHash: uniqueHash,
    });
  }

  if (rows.length === 0) warnings.push('В файле не нашлось ни одной операции.');
  if (skipped > 0) warnings.push(`Пропущено строк без корректных данных или отклонённых: ${skipped}.`);

  return { rows, skipped, warnings, detected };
}
