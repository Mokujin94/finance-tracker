import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, Select } from '../components/ui';
import { fmtDay, fmtDayTime } from '../lib/dates';
import { money } from '../lib/format';
import { isSelfTransfer } from '../logic/categorize';
import {
  BANK_LABELS,
  parseStatement,
  type BankFormat,
  type ColumnKey,
  type ColumnMapping,
  type ParsedRow,
  type ParseResult,
} from '../logic/parseStatement';
import { useData } from '../store/data';

interface ParsedFile extends Partial<ParseResult> {
  /** Исходный файл нужен для повторного разбора после ручного сопоставления */
  file: File;
  filename: string;
  rows: ParsedRow[];
  warnings: string[];
  accountId: string;
  error?: string;
}

/** Какие колонки можно назначить вручную и как они называются для пользователя. */
const MAPPABLE: Array<{ key: ColumnKey; label: string; hint?: string }> = [
  { key: 'date', label: 'Дата операции' },
  { key: 'amount', label: 'Сумма со знаком', hint: 'минус — расход' },
  { key: 'debit', label: 'Расход', hint: 'если приход и расход в разных колонках' },
  { key: 'credit', label: 'Приход' },
  { key: 'description', label: 'Описание' },
  { key: 'category', label: 'Категория банка' },
  { key: 'mcc', label: 'MCC' },
  { key: 'status', label: 'Статус' },
];

/** Подбирает счёт под распознанный банк выписки. */
function guessAccount(
  bank: BankFormat | undefined,
  accounts: Array<{ id: string; bank: string; is_primary: boolean }>,
): string {
  if (accounts.length === 0) return '';
  const byBank = bank && bank !== 'generic' ? accounts.find((a) => a.bank === bank) : undefined;
  return byBank?.id ?? accounts.find((a) => a.is_primary)?.id ?? accounts[0].id;
}

export default function ImportPage() {
  const { snapshot, importStatement, undoImport, detectCrossAccountTransfers } = useData();
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    added: number;
    duplicates: number;
    files: number;
    transfers: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accounts = snapshot.accounts.filter((a) => !a.archived);

  async function handleFiles(list: FileList) {
    setResult(null);
    setBusy(true);
    const parsed: ParsedFile[] = [];

    for (const file of Array.from(list)) {
      setProgress(`Читаем ${file.name}…`);
      try {
        const parseResult = await parseStatement(file);
        parsed.push({
          ...parseResult,
          file,
          filename: file.name,
          accountId: guessAccount(parseResult.bank, accounts),
        });
      } catch (e) {
        parsed.push({
          file,
          filename: file.name,
          rows: [],
          warnings: [],
          accountId: guessAccount(undefined, accounts),
          error: (e as Error).message,
        });
      }
    }

    dedupeAcross(parsed);
    setFiles((current) => [...current, ...parsed]);
    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  /** Выписки часто пересекаются по периодам — повторы внутри одного счёта убираем сразу. */
  function dedupeAcross(list: ParsedFile[]) {
    const seen = new Map<string, Set<string>>();
    for (const file of list) {
      const key = file.accountId || 'none';
      if (!seen.has(key)) seen.set(key, new Set());
      const hashes = seen.get(key)!;
      file.rows = file.rows.filter((row) => {
        if (hashes.has(row.dedupHash)) return false;
        hashes.add(row.dedupHash);
        return true;
      });
    }
  }

  /** Повторный разбор файла с колонками, которые указал пользователь. */
  async function remap(index: number, mapping: ColumnMapping, headerRow: number) {
    const target = files[index];
    setBusy(true);
    try {
      const parseResult = await parseStatement(target.file, { mapping, headerRow });
      setFiles((current) =>
        current.map((f, i) =>
          i === index ? { ...f, ...parseResult, error: undefined, accountId: f.accountId } : f,
        ),
      );
    } catch (e) {
      setFiles((current) =>
        current.map((f, i) => (i === index ? { ...f, error: (e as Error).message } : f)),
      );
    }
    setBusy(false);
  }

  async function confirmImport() {
    setBusy(true);
    let added = 0;
    let duplicates = 0;
    let imported = 0;

    for (const file of files) {
      if (file.error || file.rows.length === 0 || !file.accountId) continue;
      setProgress(`Импортируем ${file.filename}…`);
      const outcome = await importStatement(file.rows, file.filename, file.accountId);
      added += outcome.added;
      duplicates += outcome.duplicates;
      imported++;
    }

    setProgress('Ищем переводы между счетами…');
    const transfers = await detectCrossAccountTransfers();

    setResult({ added, duplicates, files: imported, transfers });
    setFiles([]);
    setProgress(null);
    setBusy(false);
  }

  const allRows = files.flatMap((f) => f.rows);
  const transferHashes = new Set(
    allRows.filter((row) => isSelfTransfer(row.description, row.rawCategory)).map((r) => r.dedupHash),
  );
  const income = allRows
    .filter((r) => r.type === 'income' && !transferHashes.has(r.dedupHash))
    .reduce((s, r) => s + r.amount, 0);
  const expense = allRows
    .filter((r) => r.type === 'expense' && !transferHashes.has(r.dedupHash))
    .reduce((s, r) => s + r.amount, 0);
  const preview = allRows
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 12);
  const ready = files.some((f) => !f.error && f.rows.length > 0 && f.accountId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Импорт выписки</h1>
        <p className="text-sm text-slate-500">
          Выписки из разных банков грузятся одной пачкой — для каждого файла укажите счёт.
          Поддерживаются CSV и Excel; всё обрабатывается в браузере и никуда не отправляется.
        </p>
      </div>

      {accounts.length === 0 && (
        <Card>
          <Empty
            title="Сначала заведите счёт"
            hint="Импорт привязывается к счёту, чтобы баланс по каждому банку считался отдельно"
          />
          <div className="mt-3 flex justify-center">
            <Link
              to="/settings"
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Перейти в настройки
            </Link>
          </div>
        </Card>
      )}

      <Card>
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-4 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
            }}
          />
          <span className="text-3xl" aria-hidden>
            📥
          </span>
          <span className="mt-2 text-sm font-medium">
            Перетащите файлы или нажмите, чтобы выбрать
          </span>
          <span className="mt-1 text-xs text-slate-400">
            Т-Банк, Сбер, Альфа-Банк, ВТБ · CSV и XLSX · можно несколько сразу
          </span>
        </label>

        {progress && <p className="mt-3 text-sm text-slate-500">{progress}</p>}
        {result && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Загружено файлов: {result.files}. Импортировано операций: {result.added}. Дубликатов
            пропущено: {result.duplicates}.
            {result.transfers > 0 &&
              ` Найдено переводов между счетами: ${result.transfers} — они исключены из доходов и расходов.`}
          </p>
        )}
      </Card>

      {files.length > 0 && (
        <Card
          title={`К импорту: ${files.length} ${files.length === 1 ? 'файл' : 'файла(ов)'}`}
          action={
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => setFiles([])} disabled={busy}>
                Очистить
              </Button>
              <Button onClick={() => void confirmImport()} disabled={busy || !ready}>
                Импортировать {allRows.length}
              </Button>
            </div>
          }
        >
          <ul className="mb-3 space-y-2">
            {files.map((file, index) => (
              <li
                key={`${file.filename}-${index}`}
                className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.filename}</span>
                  <div className="flex items-center gap-2">
                    {file.bank && <Badge tone="slate">{BANK_LABELS[file.bank]}</Badge>}
                    {file.error ? (
                      <Badge tone="red">{file.error}</Badge>
                    ) : file.needsMapping ? (
                      <Badge tone="amber">нужно указать колонки</Badge>
                    ) : (
                      <Badge tone="indigo">{file.rows.length} операций</Badge>
                    )}
                    <Select
                      className="w-44 py-1 text-xs"
                      value={file.accountId}
                      onChange={(e) =>
                        setFiles((current) =>
                          current.map((f, i) =>
                            i === index ? { ...f, accountId: e.target.value } : f,
                          ),
                        )
                      }
                    >
                      <option value="">Выберите счёт</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                      className="text-xs text-slate-400 hover:text-rose-600"
                      disabled={busy}
                    >
                      убрать
                    </button>
                  </div>
                </div>

                {file.needsMapping && file.headers && (
                  <ColumnMapper
                    headers={file.headers}
                    sample={file.sample ?? []}
                    rawRows={file.rawRows ?? []}
                    headerRow={file.headerRow ?? 0}
                    mapping={file.mapping ?? {}}
                    disabled={busy}
                    onApply={(mapping, headerRow) => void remap(index, mapping, headerRow)}
                  />
                )}
              </li>
            ))}
          </ul>

          {allRows.length > 0 && (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <Badge tone="green">доходы {money(income)}</Badge>
                <Badge tone="red">расходы {money(expense)}</Badge>
                {transferHashes.size > 0 && (
                  <Badge tone="slate">
                    переводов между счетами: {transferHashes.size} — вне статистики
                  </Badge>
                )}
                {files.flatMap((f) => f.warnings).map((warning, i) => (
                  <Badge key={`${warning}-${i}`} tone="amber">
                    {warning}
                  </Badge>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-400">
                    <tr>
                      <th className="py-1.5 pr-3">Дата</th>
                      <th className="py-1.5 pr-3">Описание</th>
                      <th className="py-1.5 pr-3">Категория банка</th>
                      <th className="py-1.5 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => {
                      const transfer = transferHashes.has(row.dedupHash);
                      return (
                        <tr key={row.dedupHash} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500">
                            {fmtDay(row.occurredAt)}
                          </td>
                          <td className="max-w-[220px] truncate py-1.5 pr-3">
                            {row.description}
                            {transfer && (
                              <span className="ml-1.5 text-xs text-slate-400">↔ перевод</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-400">{row.rawCategory ?? '—'}</td>
                          <td
                            className={`py-1.5 text-right whitespace-nowrap font-medium ${
                              transfer
                                ? 'text-slate-400'
                                : row.type === 'income'
                                  ? 'text-emerald-600'
                                  : ''
                            }`}
                          >
                            {row.type === 'income' ? '+' : '−'}
                            {money(row.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {allRows.length > preview.length && (
                <p className="mt-2 text-xs text-slate-400">
                  …и ещё {allRows.length - preview.length} операций
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <Card title="История импортов">
        {snapshot.imports.length === 0 ? (
          <Empty title="Импортов ещё не было" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {snapshot.imports.map((run) => {
              const account = snapshot.accounts.find((a) => a.id === run.account_id);
              return (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {run.filename}
                      {account && <span className="text-slate-400"> · {account.name}</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {fmtDayTime(run.imported_at)} · всего {run.rows_total}, добавлено{' '}
                      {run.rows_new}, дубликатов {run.rows_duplicate}
                    </p>
                  </div>
                  <Button variant="danger" onClick={() => void undoImport(run.id)}>
                    Откатить
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Ручное сопоставление колонок — спасательный круг для незнакомых форматов выписок. */
function ColumnMapper({
  headers,
  sample,
  rawRows,
  headerRow,
  mapping,
  disabled,
  onApply,
}: {
  headers: string[];
  sample: string[][];
  rawRows: string[][];
  headerRow: number;
  mapping: ColumnMapping;
  disabled: boolean;
  onApply: (mapping: ColumnMapping, headerRow: number) => void;
}) {
  const [draft, setDraft] = useState<ColumnMapping>(mapping);
  const [row, setRow] = useState(headerRow);
  const activeHeaders = rawRows[row] ?? headers;
  // Предпросмотр берём сразу после выбранной строки заголовков
  const previewRows = rawRows.length > 0 ? rawRows.slice(row + 1, row + 4) : sample.slice(0, 3);
  const canApply =
    draft.date !== undefined &&
    (draft.amount !== undefined || draft.debit !== undefined || draft.credit !== undefined);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 text-xs text-slate-500">
        Формат незнакомый — укажите, в каких колонках лежат дата и сумма. Остальное
        по желанию.
      </p>

      {rawRows.length > 1 && (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Строка заголовков</span>
          <Select
            className="py-1 text-xs"
            value={row}
            onChange={(e) => {
              setRow(Number(e.target.value));
              setDraft({});
            }}
          >
            {rawRows.map((raw, index) => (
              <option key={index} value={index}>
                {index + 1}: {raw.filter(Boolean).join(' | ').slice(0, 70) || '(пустая строка)'}
              </option>
            ))}
          </Select>
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MAPPABLE.map(({ key, label, hint }) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {label}
              {hint && <span className="text-slate-400"> · {hint}</span>}
            </span>
            <Select
              className="py-1 text-xs"
              value={draft[key] ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [key]: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            >
              <option value="">—</option>
              {activeHeaders.map((header, index) => (
                <option key={`${header}-${index}`} value={index}>
                  {header.trim() || `Колонка ${index + 1}`}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>

      {previewRows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-400">
              <tr>
                {activeHeaders.map((header, index) => (
                  <th key={index} className="py-1 pr-3 whitespace-nowrap">
                    {header.trim() || `Колонка ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((cells, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  {activeHeaders.map((_, index) => (
                    <td key={index} className="max-w-[160px] truncate py-1 pr-3 text-slate-500">
                      {cells[index] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button className="mt-3" disabled={disabled || !canApply} onClick={() => onApply(draft, row)}>
        Применить и разобрать
      </Button>
    </div>
  );
}
