import { useRef, useState } from 'react';
import { Badge, Button, Card, Empty } from '../components/ui';
import { fmtDay, fmtDayTime } from '../lib/dates';
import { money } from '../lib/format';
import { parseStatement, type ParseResult } from '../logic/parseStatement';
import { useData } from '../store/data';

export default function ImportPage() {
  const { snapshot, importStatement, undoImport } = useData();
  const [parsed, setParsed] = useState<(ParseResult & { filename: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; duplicates: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const parseResult = await parseStatement(file);
      setParsed({ ...parseResult, filename: file.name });
    } catch (e) {
      setParsed(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!parsed) return;
    setBusy(true);
    const outcome = await importStatement(parsed.rows, parsed.filename);
    setResult(outcome);
    setParsed(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  const preview = parsed?.rows.slice(0, 12) ?? [];
  const income = parsed?.rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0;
  const expense = parsed?.rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Импорт выписки</h1>
        <p className="text-sm text-slate-500">
          Т-Банк → «Счета» → выписка за период → формат <b>CSV</b> или <b>Excel</b>. Файл
          обрабатывается прямо в браузере и никуда не отправляется.
        </p>
      </div>

      <Card>
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 px-4 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <span className="text-3xl" aria-hidden>
            📥
          </span>
          <span className="mt-2 text-sm font-medium">Перетащите файл или нажмите, чтобы выбрать</span>
          <span className="mt-1 text-xs text-slate-400">CSV (windows-1251 или UTF-8), XLSX</span>
        </label>

        {busy && <p className="mt-3 text-sm text-slate-500">Обрабатываем файл…</p>}
        {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {result && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            Импортировано операций: {result.added}. Дубликатов пропущено: {result.duplicates}.
          </p>
        )}
      </Card>

      {parsed && (
        <Card
          title={`Предпросмотр: ${parsed.filename}`}
          action={
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => setParsed(null)}>
                Отмена
              </Button>
              <Button onClick={() => void confirmImport()} disabled={busy || parsed.rows.length === 0}>
                Импортировать {parsed.rows.length}
              </Button>
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge tone="green">доходы {money(income)}</Badge>
            <Badge tone="red">расходы {money(expense)}</Badge>
            {parsed.warnings.map((warning) => (
              <Badge key={warning} tone="amber">
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
                {preview.map((row) => (
                  <tr key={row.dedupHash} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500">
                      {fmtDay(row.occurredAt)}
                    </td>
                    <td className="max-w-[220px] truncate py-1.5 pr-3">{row.description}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{row.rawCategory ?? '—'}</td>
                    <td
                      className={`py-1.5 text-right whitespace-nowrap font-medium ${
                        row.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {row.type === 'income' ? '+' : '−'}
                      {money(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > preview.length && (
            <p className="mt-2 text-xs text-slate-400">
              …и ещё {parsed.rows.length - preview.length} операций
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
