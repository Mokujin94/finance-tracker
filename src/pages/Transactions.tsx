import { useMemo, useState } from 'react';
import { Card, Empty, Input, Select } from '../components/ui';
import { fmtDay, monthKey, monthLabel } from '../lib/dates';
import { money } from '../lib/format';
import { useData } from '../store/data';

export default function Transactions() {
  const { snapshot, setTransactionCategory, deleteTransaction } = useData();
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [type, setType] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');

  const months = useMemo(() => {
    const keys = new Set(snapshot.transactions.map((t) => monthKey(t.occurred_at)));
    return [...keys].sort().reverse();
  }, [snapshot.transactions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.transactions.filter((tx) => {
      if (month !== 'all' && monthKey(tx.occurred_at) !== month) return false;
      if (type !== 'all' && tx.type !== type) return false;
      if (categoryId !== 'all' && (tx.category_id ?? 'none') !== categoryId) return false;
      if (needle && !`${tx.description} ${tx.raw_category ?? ''}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [snapshot.transactions, month, type, categoryId, query]);

  const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Операции</h1>
        <p className="text-sm text-slate-500">
          Категорию можно поменять вручную — она сохранится и не перезапишется при импорте.
        </p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Все месяцы</option>
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">Доходы и расходы</option>
            <option value="expense">Только расходы</option>
            <option value="income">Только доходы</option>
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">Все категории</option>
            <option value="none">Без категории</option>
            {snapshot.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Поиск по описанию"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <p className="mt-3 text-sm text-slate-500">
          Найдено {filtered.length}: доходы <b className="text-emerald-600">{money(income)}</b>,
          расходы <b className="text-rose-600">{money(expense)}</b>
        </p>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <Empty title="Операций не найдено" hint="Измените фильтры или загрузите выписку" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.slice(0, 300).map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.description}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDay(tx.occurred_at)}
                    {tx.raw_category ? ` · ${tx.raw_category}` : ''}
                    {tx.mcc ? ` · MCC ${tx.mcc}` : ''}
                  </p>
                </div>

                <Select
                  className="w-40 shrink-0 py-1 text-xs"
                  value={tx.category_id ?? ''}
                  onChange={(e) => void setTransactionCategory(tx.id, e.target.value || null)}
                >
                  <option value="">Без категории</option>
                  {snapshot.categories
                    .filter((c) => c.kind === tx.type)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </Select>

                <span
                  className={`w-28 shrink-0 text-right text-sm font-semibold ${
                    tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '−'}
                  {money(tx.amount)}
                </span>

                <button
                  onClick={() => void deleteTransaction(tx.id)}
                  className="shrink-0 text-xs text-slate-300 hover:text-rose-600"
                  title="Удалить операцию"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > 300 && (
          <p className="mt-3 text-xs text-slate-400">Показаны первые 300 операций — уточните фильтр.</p>
        )}
      </Card>
    </div>
  );
}
