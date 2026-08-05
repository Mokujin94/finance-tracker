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

/** Колонки, которые приложению нужны от выписки. */
export type ColumnKey =
  | 'date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'description'
  | 'category'
  | 'mcc'
  | 'status'
  | 'currency';

/** Ручное сопоставление: ключ → индекс колонки в файле. */
export type ColumnMapping = Partial<Record<ColumnKey, number>>;

export type BankFormat = 'tbank' | 'sber' | 'alfa' | 'vtb' | 'generic';

export const BANK_LABELS: Record<BankFormat, string> = {
  tbank: 'Т-Банк',
  sber: 'Сбер',
  alfa: 'Альфа-Банк',
  vtb: 'ВТБ',
  generic: 'Неизвестный формат',
};

export interface ParseResult {
  rows: ParsedRow[];
  skipped: number;
  warnings: string[];
  /** Распознанный формат выписки */
  bank: BankFormat;
  /** Заголовки таблицы — нужны для ручного сопоставления */
  headers: string[];
  /** Первые строки данных для предпросмотра при ручном сопоставлении */
  sample: string[][];
  /** Номер строки заголовков (0-based) */
  headerRow: number;
  /** Первые строки файла целиком — чтобы пользователь мог указать другую строку заголовков */
  rawRows: string[][];
  /** Какие колонки удалось определить автоматически */
  mapping: ColumnMapping;
  /** true — автоматически разобрать не вышло, нужно указать колонки руками */
  needsMapping: boolean;
}

/* ------------------------------------------------------------------ */
/* Кодировка и разбор CSV                                              */
/* ------------------------------------------------------------------ */

/**
 * Российские банки отдают CSV то в windows-1251, то в UTF-8.
 * Строгий UTF-8 декодер бросает исключение на кириллице в 1251 — этим и пользуемся.
 */
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
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
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/** «-1 234,56 ₽» → -1234.56 */
function parseAmount(value: string): number | null {
  if (typeof value === 'number') return value;
  if (!value) return null;
  const cleaned = String(value)
    .replace(/ |\s/g, '')
    .replace(/[^0-9,.\-+]/g, '')
    .replace(/,/g, '.');
  if (!cleaned || cleaned === '-' || cleaned === '+') return null;
  const parts = cleaned.split('.');
  const normalized = parts.length > 2 ? parts.slice(0, -1).join('') + '.' + parts.at(-1) : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Поддерживает «05.08.2026 13:45:12», «05.08.2026», «2026-08-05», Date из xlsx. */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const str = String(value ?? '').trim();
  if (!str) return null;

  const ru = str.match(/^(\d{2})\.(\d{2})\.(\d{2,4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ru) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = ru;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(year, +m - 1, +d, +hh, +mm, +ss);
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

/**
 * Синонимы заголовков разных банков. Заголовки нормализуются (нижний регистр, ё→е),
 * поэтому здесь всё пишется без «ё».
 *
 * Т-Банк:  Дата операции | Сумма операции | Сумма платежа | Категория | MCC | Описание
 * Сбер:    ДАТА ОПЕРАЦИИ | КАТЕГОРИЯ | СУММА В ВАЛЮТЕ СЧЕТА | ОПИСАНИЕ ОПЕРАЦИИ
 * Альфа:   Дата операции | Описание операции | Приход | Расход | Валюта
 * ВТБ:     Дата операции | Дата обработки | Описание | Сумма в валюте счета
 */
const COLUMN_SYNONYMS: Record<ColumnKey, string[]> = {
  date: [
    'дата операции',
    'дата и время операции',
    'дата проведения',
    'дата проводки',
    'дата обработки',
    'дата платежа',
    'дата',
    'date',
    'operation date',
    'transaction date',
  ],
  amount: [
    'сумма платежа',
    'сумма операции',
    'сумма в валюте счета',
    'сумма в валюте операции',
    'сумма в рублях',
    'сумма',
    'amount',
  ],
  debit: ['расход', 'списание', 'дебет', 'сумма списания', 'уменьшение', 'debit'],
  credit: ['приход', 'зачисление', 'кредит', 'сумма зачисления', 'поступление', 'credit'],
  description: [
    'описание операции',
    'описание',
    'назначение платежа',
    'наименование операции',
    'контрагент',
    'получатель',
    'место совершения операции',
    'комментарий',
    'операция',
    'description',
  ],
  category: ['категория', 'категория операции', 'category'],
  mcc: ['mcc', 'мсс', 'mcc-код', 'код мсс', 'mcc код'],
  status: ['статус', 'status'],
  currency: ['валюта платежа', 'валюта операции', 'валюта счета', 'валюта', 'currency'],
};

/** Приоритет важен: «сумма платежа» у Т-Банка — рублёвая, её и берём первой. */
function matchColumns(header: string[]): ColumnMapping {
  const normalized = header.map(normalizeHeader);
  const mapping: ColumnMapping = {};

  for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS) as Array<[ColumnKey, string[]]>) {
    for (const synonym of synonyms) {
      const exact = normalized.findIndex((h) => h === synonym);
      const index = exact >= 0 ? exact : normalized.findIndex((h) => h.startsWith(synonym));
      if (index >= 0 && !Object.values(mapping).includes(index)) {
        mapping[key] = index;
        break;
      }
    }
  }
  return mapping;
}

function detectBank(header: string[]): BankFormat {
  const joined = header.map(normalizeHeader).join('|');
  if (joined.includes('округление на инвесткопилку') || joined.includes('кэшбэк')) return 'tbank';
  if (joined.includes('сумма в валюте счета') && joined.includes('категория')) return 'sber';
  if (joined.includes('приход') && joined.includes('расход')) return 'alfa';
  if (joined.includes('дата обработки') || joined.includes('дата проводки')) return 'vtb';
  return 'generic';
}

const FAILED_STATUSES = ['failed', 'отказ', 'отклонен', 'отклонён', 'отменен', 'отменён', 'cancel'];

/* ------------------------------------------------------------------ */
/* Чтение файла                                                        */
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

/**
 * Ищет строку заголовков: у большинства выписок сверху идут служебные строки
 * («Выписка по счёту», ФИО, период и т.п.).
 */
function findHeaderRow(matrix: string[][]): number {
  let best = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const mapping = matchColumns(matrix[i]);
    const hasDate = mapping.date !== undefined;
    const hasMoney =
      mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined;
    if (!hasDate || !hasMoney) continue;

    const score = Object.keys(mapping).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Строка с наибольшим числом колонок среди первых строк файла — вероятный заголовок таблицы. */
function widestRow(matrix: string[][]): number {
  let index = 0;
  let width = 0;
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    const filled = matrix[i].filter((cell) => cell.trim().length > 0).length;
    if (filled > width) {
      width = filled;
      index = i;
    }
  }
  return index;
}

/* ------------------------------------------------------------------ */
/* Публичный API                                                       */
/* ------------------------------------------------------------------ */

export interface ParseOptions {
  /** Ручное сопоставление колонок — перекрывает автоматическое */
  mapping?: ColumnMapping;
  /** Номер строки заголовков (0-based), если автоопределение промахнулось */
  headerRow?: number;
}

/**
 * Разбирает выписку (CSV в windows-1251/UTF-8 либо Excel).
 * Если формат распознать не удалось, возвращает needsMapping: true вместе с заголовками
 * и примером строк — интерфейс покажет ручное сопоставление колонок.
 */
export async function parseStatement(file: File, options: ParseOptions = {}): Promise<ParseResult> {
  const warnings: string[] = [];
  if (/\.pdf$/i.test(file.name)) {
    throw new Error('PDF не поддерживается: выгрузите выписку в CSV или Excel.');
  }

  const matrix = await fileToMatrix(file);
  if (matrix.length === 0) throw new Error('Файл пустой или не читается.');

  const detectedRow = options.headerRow ?? findHeaderRow(matrix);
  // Если заголовки не опознаны, берём самую «широкую» строку из начала файла:
  // над таблицей обычно стоят служебные строки в одну-две ячейки.
  const fallbackRow = widestRow(matrix);
  const headerRow = detectedRow >= 0 ? detectedRow : fallbackRow;

  const headers = matrix[headerRow] ?? [];
  const sample = matrix.slice(headerRow + 1, headerRow + 6);
  const rawRows = matrix.slice(0, 12);
  const bank = detectedRow >= 0 ? detectBank(headers) : 'generic';

  const auto = matchColumns(headers);
  const mapping: ColumnMapping = { ...auto, ...options.mapping };

  const hasDate = mapping.date !== undefined;
  const hasMoney =
    mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined;

  if (!hasDate || !hasMoney) {
    return {
      rows: [],
      skipped: 0,
      warnings: ['Не удалось определить колонки автоматически — укажите их вручную.'],
      bank,
      headers,
      sample,
      headerRow,
      rawRows,
      mapping,
      needsMapping: true,
    };
  }

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let unsigned = 0;

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    const cell = (key: ColumnKey): string => {
      const index = mapping[key];
      return index === undefined ? '' : (raw[index] ?? '').toString().trim();
    };

    const status = cell('status').toLowerCase();
    if (status && FAILED_STATUSES.some((s) => status.includes(s))) {
      skipped++;
      continue;
    }

    const date = parseDate(cell('date'));
    if (!date) {
      skipped++;
      continue;
    }

    // 1) отдельные колонки прихода и расхода (Альфа-Банк и подобные)
    // 2) одна колонка суммы со знаком (Т-Банк, Сбер, ВТБ)
    const debit = parseAmount(cell('debit'));
    const credit = parseAmount(cell('credit'));
    let amount: number | null = null;

    if (debit || credit) {
      amount = credit ? Math.abs(credit) : -Math.abs(debit!);
    } else {
      amount = parseAmount(cell('amount'));
      if (amount !== null && amount > 0) unsigned++;
    }

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

    // Внутри одного файла одинаковые операции — разные операции, поэтому к повторам
    // добавляем счётчик. При повторном импорте того же файла порядок тот же,
    // и хэши совпадут — дедупликация продолжит работать.
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
  if (skipped > 0) warnings.push(`Пропущено строк без корректных данных: ${skipped}.`);
  if (rows.length > 0 && unsigned === rows.length) {
    warnings.push(
      'Все суммы в файле положительные — расходы не отличить от доходов. Укажите колонки «Приход» и «Расход» вручную.',
    );
  }

  return {
    rows,
    skipped,
    warnings,
    bank,
    headers,
    sample,
    headerRow,
    rawRows,
    mapping,
    needsMapping: false,
  };
}
