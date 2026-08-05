import { useMemo, useState } from 'react';
import { Card, Empty, Input, Select } from '../components/ui';
import { fmtDay, monthKey, monthLabel } from '../lib/dates';
import { money } from '../lib/format';
import { useData } from '../store/data';

export default function Transactions() {
  const { snapshot, setTransactionCategory, setTransactionTransfer, deleteTransaction } = useData();
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [type, setType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [accountId, setAccountId] = useState<string>('all');

  const months = useMemo(() => {
    const keys = new Set(snapshot.transactions.map((t) => monthKey(t.occurred_at)));
    return [...keys].sort().reverse();
  }, [snapshot.transactions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.transactions.filter((tx) => {
      if (month !== 'all' && monthKey(tx.occurred_at) !== month) return false;
      if (accountId !== 'all' && (tx.account_id ?? 'none') !== accountId) return false;
      if (type === 'transfer' && !tx.is_transfer) return false;
      if (type !== 'all' && type !== 'transfer' && (tx.type !== type || tx.is_transfer)) return false;
      if (categoryId !== 'all' && (tx.category_id ?? 'none') !== categoryId) return false;
      if (needle && !`${tx.description} ${tx.raw_category ?? ''}`.toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [snapshot.transactions, month, type, categoryId, query, accountId]);

  // Переводы между своими счетами в итогах не участвуют
  const income = filtered
    .filter((t) => t.type === 'income' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0);
  const expense = filtered
    .filter((t) => t.type === 'expense' && !t.is_transfer)
    .reduce((s, t) => s + t.amount, 0);
  const transferCount = filtered.filter((t) => t.is_transfer).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Операции</h1>
        <p className="text-sm text-slate-500">
          Категорию можно поменять вручную — она сохранится и не перезапишется при импорте.
        </p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Все счета</option>
            {snapshot.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
            <option value="none">Без счёта</option>
          </Select>
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Все месяцы</option>
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="all">Все операции</option>
            <option value="expense">Только расходы</option>
            <option value="income">Только доходы</option>
            <option value="transfer">Переводы между счетами</option>
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
          {transferCount > 0 && <> · переводов между счетами {transferCount} (в итоги не входят)</>}
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
                    {(() => {
                      const account = snapshot.accounts.find((a) => a.id === tx.account_id);
                      return account ? ` · ${account.name}` : '';
                    })()}
                    {tx.raw_category ? ` · ${tx.raw_category}` : ''}
                    {tx.mcc ? ` · MCC ${tx.mcc}` : ''}
                  </p>
                </div>

                <Select
                  className="w-44 shrink-0 py-1 text-xs"
                  value={tx.is_transfer ? 'transfer' : (tx.category_id ?? '')}
                  onChange={(e) => {
                    if (e.target.value === 'transfer') void setTransactionTransfer(tx.id, true);
                    else void setTransactionCategory(tx.id, e.target.value || null);
                  }}
                >
                  <option value="">Без категории</option>
                  <option value="transfer">↔ Между своими счетами</option>
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
                    tx.is_transfer
                      ? 'text-slate-400 line-through'
                      : tx.type === 'income'
                        ? 'text-emerald-600'
                        : 'text-slate-900 dark:text-slate-100'
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
