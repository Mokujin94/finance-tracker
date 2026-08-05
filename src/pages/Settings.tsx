import { useState } from 'react';
import VacationCalendar from '../components/VacationCalendar';
import { Badge, Button, Card, Field, Input, Select } from '../components/ui';
import { cloudMode } from '../data';
import { fmtDay, fromLocalInput, nextPaymentDate, nowISO, toLocalInput, todayISO } from '../lib/dates';
import { days, money } from '../lib/format';
import { computeVacation } from '../logic/vacation';
import type { TxType } from '../types';
import { useData } from '../store/data';

export default function Settings() {
  const {
    snapshot,
    saveProfile,
    addVacation,
    deleteVacation,
    addCategory,
    updateCategory,
    deleteCategory,
    recategorize,
  } = useData();
  const [recategorized, setRecategorized] = useState<number | null>(null);
  const profile = snapshot.profile;

  const [form, setForm] = useState({
    advance_amount: String(profile?.advance_amount ?? 0),
    salary_amount: String(profile?.salary_amount ?? 0),
    advance_day: String(profile?.advance_day ?? 25),
    salary_day: String(profile?.salary_day ?? 10),
    advance_is_last_day: profile?.advance_is_last_day ?? false,
    salary_is_last_day: profile?.salary_is_last_day ?? false,
    shift_weekend_payouts: profile?.shift_weekend_payouts ?? true,
    employment_date: profile?.employment_date ?? '',
    vacation_used_days: String(profile?.vacation_used_days ?? 0),
    balance_start: String(profile?.balance_start ?? 0),
    balance_as_of: toLocalInput(profile?.balance_as_of ?? nowISO()),
  });
  const [saved, setSaved] = useState(false);

  const [newCategory, setNewCategory] = useState('');
  const [newKind, setNewKind] = useState<TxType>('expense');

  const vacation = computeVacation(
    form.employment_date || null,
    Number(form.vacation_used_days) || 0,
    snapshot.vacations,
  );

  const nextAdvance = nextPaymentDate({
    day: Number(form.advance_day) || 25,
    isLastDay: form.advance_is_last_day,
    shiftFromWeekend: form.shift_weekend_payouts,
  });
  const nextSalary = nextPaymentDate({
    day: Number(form.salary_day) || 10,
    isLastDay: form.salary_is_last_day,
    shiftFromWeekend: form.shift_weekend_payouts,
  });

  async function save() {
    await saveProfile({
      advance_amount: Number(form.advance_amount) || 0,
      salary_amount: Number(form.salary_amount) || 0,
      advance_day: Math.min(Math.max(Number(form.advance_day) || 25, 1), 31),
      salary_day: Math.min(Math.max(Number(form.salary_day) || 10, 1), 31),
      advance_is_last_day: form.advance_is_last_day,
      salary_is_last_day: form.salary_is_last_day,
      shift_weekend_payouts: form.shift_weekend_payouts,
      employment_date: form.employment_date || null,
      vacation_used_days: Number(form.vacation_used_days) || 0,
      balance_start: Number(form.balance_start) || 0,
      balance_as_of: fromLocalInput(form.balance_as_of),
      onboarded: true,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-sm text-slate-500">
          Здесь можно перепройти анкету, поправить категории и выгрузить данные.
        </p>
      </div>

      <Card title="Анкета" action={saved ? <Badge tone="green">сохранено</Badge> : null}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Аванс, ₽">
            <Input
              type="number"
              value={form.advance_amount}
              onChange={(e) => setForm({ ...form, advance_amount: e.target.value })}
            />
          </Field>
          <Field label="Число выплаты аванса">
            <Input
              type="number"
              min={1}
              max={31}
              value={form.advance_day}
              onChange={(e) => setForm({ ...form, advance_day: e.target.value })}
              disabled={form.advance_is_last_day}
            />
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={form.advance_is_last_day}
                onChange={(e) => setForm({ ...form, advance_is_last_day: e.target.checked })}
              />
              в последний день месяца
            </label>
          </Field>
          <Field label="Зарплата, ₽">
            <Input
              type="number"
              value={form.salary_amount}
              onChange={(e) => setForm({ ...form, salary_amount: e.target.value })}
            />
          </Field>
          <Field label="Число выплаты зарплаты">
            <Input
              type="number"
              min={1}
              max={31}
              value={form.salary_day}
              onChange={(e) => setForm({ ...form, salary_day: e.target.value })}
              disabled={form.salary_is_last_day}
            />
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={form.salary_is_last_day}
                onChange={(e) => setForm({ ...form, salary_is_last_day: e.target.checked })}
              />
              в последний день месяца
            </label>
          </Field>
          <Field label="Дата трудоустройства">
            <Input
              type="date"
              value={form.employment_date}
              onChange={(e) => setForm({ ...form, employment_date: e.target.value })}
            />
          </Field>
          <Field label="Использовано дней отпуска">
            <Input
              type="number"
              min={0}
              value={form.vacation_used_days}
              onChange={(e) => setForm({ ...form, vacation_used_days: e.target.value })}
            />
          </Field>
          <Field label="Остаток на счетах, ₽">
            <Input
              type="number"
              value={form.balance_start}
              onChange={(e) =>
                // Назвали новую сумму — значит, она актуальна на сейчас
                setForm({ ...form, balance_start: e.target.value, balance_as_of: toLocalInput(nowISO()) })
              }
            />
          </Field>
          <Field
            label="На какой момент"
            hint="Баланс меняют только операции после этого момента"
          >
            <Input
              type="datetime-local"
              value={form.balance_as_of}
              onChange={(e) => setForm({ ...form, balance_as_of: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Сверились с банком — впишите свежую сумму: момент подставится текущий, и импорт старых
          выписок баланс не тронет. Операции до этого момента считаются уже учтёнными в сумме.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.shift_weekend_payouts}
            onChange={(e) => setForm({ ...form, shift_weekend_payouts: e.target.checked })}
          />
          <span>
            Если день выплаты попадает на выходной — платят накануне
            <span className="block text-xs text-slate-400">
              По ТК РФ. Праздничные дни не учитываются.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()}>Сохранить</Button>
          <span className="text-sm text-slate-500">
            Доход в месяц:{' '}
            <b>{money((Number(form.advance_amount) || 0) + (Number(form.salary_amount) || 0))}</b> ·
            ближайшие выплаты: аванс {fmtDay(nextAdvance)}, зарплата {fmtDay(nextSalary)}
          </span>
        </div>
      </Card>

      <Card title="Отпуск">
        {form.employment_date ? (
          <div className="mb-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-3">
            <p>
              Отработано <b>{vacation.monthsWorked} мес.</b>
            </p>
            <p>
              Накоплено <b>{days(vacation.accruedDays)}</b>
            </p>
            <p>
              Доступно <b>{days(Math.max(vacation.availableDays, 0))}</b>
            </p>
            <p className="sm:col-span-3 text-xs text-slate-400">
              {vacation.hasRight
                ? `Право на отпуск с ${vacation.rightFromDate ? fmtDay(vacation.rightFromDate) : '—'}. Использовано ${days(vacation.usedDays)}, запланировано ${days(vacation.plannedDays)}.`
                : `Право на первый отпуск появится ${vacation.rightFromDate ? fmtDay(vacation.rightFromDate) : '—'} (через ${days(vacation.daysUntilRight)}).`}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm text-slate-500">
            Укажите дату трудоустройства в анкете — посчитаем накопленные дни.
          </p>
        )}
        <VacationCalendar
          plans={snapshot.vacations}
          availableDays={vacation.availableDays + vacation.plannedDays}
          onAdd={(from, to) => void addVacation(from, to)}
          onDelete={(id) => void deleteVacation(id)}
        />
      </Card>

      <Card title="Категории">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            className="max-w-[220px]"
            placeholder="Название категории"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <Select
            className="max-w-[160px]"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as TxType)}
          >
            <option value="expense">Расход</option>
            <option value="income">Доход</option>
          </Select>
          <Button
            onClick={() => {
              if (!newCategory.trim()) return;
              void addCategory(newCategory.trim(), newKind, '#94a3b8');
              setNewCategory('');
            }}
          >
            Добавить
          </Button>
        </div>

        <ul className="divide-y divide-slate-100">
          {snapshot.categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                type="color"
                value={category.color}
                onChange={(e) => void updateCategory(category.id, { color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-slate-200"
                title="Цвет категории"
              />
              <Input
                className="max-w-[180px] py-1 text-sm"
                value={category.name}
                onChange={(e) => void updateCategory(category.id, { name: e.target.value })}
              />
              <Badge tone={category.kind === 'income' ? 'green' : 'slate'}>
                {category.kind === 'income' ? 'доход' : 'расход'}
              </Badge>
              <Input
                className="min-w-[200px] flex-1 py-1 text-xs"
                placeholder="ключевые слова через запятую"
                defaultValue={category.keywords.join(', ')}
                onBlur={(e) =>
                  void updateCategory(category.id, {
                    keywords: e.target.value
                      .split(',')
                      .map((word) => word.trim().toLowerCase())
                      .filter(Boolean),
                  })
                }
              />
              <button
                onClick={() => void deleteCategory(category.id)}
                className="text-xs text-slate-300 hover:text-rose-600"
                title="Удалить категорию"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <Button
            variant="soft"
            onClick={async () => {
              setRecategorized(await recategorize());
            }}
          >
            Пересчитать категории
          </Button>
          {recategorized !== null && (
            <span className="text-sm text-slate-500">
              {recategorized > 0 ? `Обновлено операций: ${recategorized}` : 'Все категории и так на месте'}
            </span>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Ключевые слова используются при импорте: если описание операции содержит слово, ей
          присваивается эта категория. Вручную выбранная категория операции не перезаписывается.
          «Пересчитать категории» применяет текущие правила ко всем операциям, кроме тех, где
          категорию выставили руками.
        </p>
      </Card>

      <Card title="Данные">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="soft" onClick={exportJson}>
            Выгрузить резервную копию (JSON)
          </Button>
          <Badge tone={cloudMode ? 'indigo' : 'amber'}>
            {cloudMode ? 'Данные в Supabase' : 'Локальный режим: данные в этом браузере'}
          </Badge>
        </div>
        {!cloudMode && (
          <p className="mt-3 text-xs text-slate-500">
            Ключи Supabase не заданы, поэтому данные хранятся только в localStorage этого браузера.
            Как подключить облако — в README проекта.
          </p>
        )}
      </Card>
    </div>
  );
}
