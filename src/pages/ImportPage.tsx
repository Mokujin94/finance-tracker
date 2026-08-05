import { useRef, useState } from 'react';
import { Badge, Button, Card, Empty } from '../components/ui';
import { fmtDay, fmtDayTime } from '../lib/dates';
import { money } from '../lib/format';
import { isSelfTransfer } from '../logic/categorize';
import { parseStatement, type ParsedRow } from '../logic/parseStatement';
import { useData } from '../store/data';

interface ParsedFile {
  filename: string;
  rows: ParsedRow[];
  warnings: string[];
  error?: string;
}

export default function ImportPage() {
  const { snapshot, importStatement, undoImport } = useData();
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; duplicates: number; files: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList) {
    setResult(null);
    setBusy(true);
    const parsed: ParsedFile[] = [];

    for (const file of Array.from(list)) {
      setProgress(`Читаем ${file.name}…`);
      try {
        const parseResult = await parseStatement(file);
        parsed.push({
          filename: file.name,
          rows: parseResult.rows,
          warnings: parseResult.warnings,
        });
      } catch (e) {
        parsed.push({ filename: file.name, rows: [], warnings: [], error: (e as Error).message });
      }
    }

    // Выписки часто пересекаются по периодам — дубликаты между файлами убираем сразу
    const seen = new Set<string>();
    for (const file of parsed) {
      file.rows = file.rows.filter((row) => {
        if (seen.has(row.dedupHash)) return false;
        seen.add(row.dedupHash);
        return true;
      });
    }

    setFiles((current) => [...current, ...parsed]);
    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function confirmImport() {
    setBusy(true);
    let added = 0;
    let duplicates = 0;
    let imported = 0;

    for (const file of files) {
      if (file.error || file.rows.length === 0) continue;
      setProgress(`Импортируем ${file.filename}…`);
      const outcome = await importStatement(file.rows, file.filename);
      added += outcome.added;
      duplicates += outcome.duplicates;
      imported++;
    }

    setResult({ added, duplicates, files: imported });
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Импорт выписки</h1>
        <p className="text-sm text-slate-500">
          Т-Банк → «Счета» → выписка за период → формат <b>CSV</b> или <b>Excel</b>. Можно выбрать
          сразу несколько файлов. Всё обрабатывается в браузере и никуда не отправляется.
        </p>
      </div>

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
            CSV (windows-1251 или UTF-8), XLSX · можно несколько сразу
          </span>
        </label>

        {progress && <p className="mt-3 text-sm text-slate-500">{progress}</p>}
        {result && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Загружено файлов: {result.files}. Импортировано операций: {result.added}. Дубликатов
            пропущено: {result.duplicates}.
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
              <Button onClick={() => void confirmImport()} disabled={busy || allRows.length === 0}>
                Импортировать {allRows.length}
              </Button>
            </div>
          }
        >
          <ul className="mb-3 space-y-1.5">
            {files.map((file, index) => (
              <li
                key={`${file.filename}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/70"
              >
                <span className="truncate font-medium">{file.filename}</span>
                <span className="flex items-center gap-2">
                  {file.error ? (
                    <Badge tone="red">{file.error}</Badge>
                  ) : (
                    <Badge tone="indigo">{file.rows.length} операций</Badge>
                  )}
                  <button
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    className="text-xs text-slate-400 hover:text-rose-600"
                    disabled={busy}
                  >
                    убрать
                  </button>
                </span>
              </li>
            ))}
          </ul>

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
                        {transfer && <span className="ml-1.5 text-xs text-slate-400">↔ перевод</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400">{row.rawCategory ?? '—'}</td>
                      <td
                        className={`py-1.5 text-right whitespace-nowrap font-medium ${
                          transfer
                            ? 'text-slate-400'
                            : row.type === 'income'
                              ? 'text-emerald-600'
                              : 'text-slate-900 dark:text-slate-100'
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
        </Card>
      )}

      <Card title="История импортов">
        {snapshot.imports.length === 0 ? (
          <Empty title="Импортов ещё не было" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {snapshot.imports.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{run.filename}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDayTime(run.imported_at)} · всего {run.rows_total}, добавлено {run.rows_new},
                    дубликатов {run.rows_duplicate}
                  </p>
                </div>
                <Button variant="danger" onClick={() => void undoImport(run.id)}>
                  Откатить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
