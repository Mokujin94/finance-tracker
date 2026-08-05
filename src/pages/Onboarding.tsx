import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VacationCalendar from '../components/VacationCalendar';
import { Button, Card, Field, Input } from '../components/ui';
import { fmtDay, fromLocalInput, nowISO, toLocalInput } from '../lib/dates';
import { days, money } from '../lib/format';
import { computeVacation } from '../logic/vacation';
import { useData } from '../store/data';

const STEPS = ['Доходы', 'Работа и отпуск', 'Текущий остаток'];

export default function Onboarding() {
  const { snapshot, saveProfile, addVacation, deleteVacation } = useData();
  const navigate = useNavigate();
  const profile = snapshot.profile;

  const [step, setStep] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(String(profile?.advance_amount ?? ''));
  const [salaryAmount, setSalaryAmount] = useState(String(profile?.salary_amount ?? ''));
  const [advanceDay, setAdvanceDay] = useState(String(profile?.advance_day ?? 25));
  const [salaryDay, setSalaryDay] = useState(String(profile?.salary_day ?? 10));
  const [employmentDate, setEmploymentDate] = useState(profile?.employment_date ?? '');
  const [vacationUsed, setVacationUsed] = useState(String(profile?.vacation_used_days ?? 0));
  const [balanceStart, setBalanceStart] = useState(String(profile?.balance_start ?? ''));
  const [balanceAsOf, setBalanceAsOf] = useState(toLocalInput(profile?.balance_as_of ?? nowISO()));
  const [saving, setSaving] = useState(false);

  const vacation = computeVacation(
    employmentDate || null,
    Number(vacationUsed) || 0,
    snapshot.vacations,
  );

  const monthlyIncome = (Number(advanceAmount) || 0) + (Number(salaryAmount) || 0);

  async function finish() {
    setSaving(true);
    await saveProfile({
      advance_amount: Number(advanceAmount) || 0,
      salary_amount: Number(salaryAmount) || 0,
      advance_day: Math.min(Math.max(Number(advanceDay) || 25, 1), 31),
      salary_day: Math.min(Math.max(Number(salaryDay) || 10, 1), 31),
      employment_date: employmentDate || null,
      vacation_used_days: Number(vacationUsed) || 0,
      balance_start: Number(balanceStart) || 0,
      balance_as_of: fromLocalInput(balanceAsOf),
      onboarded: true,
    });
    setSaving(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="mx-auto max-w-lg p-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Настроим приложение</h1>
      <p className="mt-1 text-sm text-slate-500">
        Три коротких шага. Всё это потом можно поменять в настройках.
      </p>

      <div className="mt-5 mb-4 flex gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${index <= step ? 'bg-indigo-600' : 'bg-slate-200'}`}
            />
            <p
              className={`mt-1.5 text-[11px] ${index === step ? 'text-indigo-600' : 'text-slate-400'}`}
            >
              {label}
            </p>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Аванс, ₽">
              <Input
                type="number"
                inputMode="decimal"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                placeholder="40000"
              />
            </Field>
            <Field label="Число выплаты аванса">
              <Input
                type="number"
                min={1}
                max={31}
                value={advanceDay}
                onChange={(e) => setAdvanceDay(e.target.value)}
              />
            </Field>
            <Field label="Зарплата, ₽">
              <Input
                type="number"
                inputMode="decimal"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                placeholder="60000"
              />
            </Field>
            <Field label="Число выплаты зарплаты">
              <Input
                type="number"
                min={1}
                max={31}
                value={salaryDay}
                onChange={(e) => setSalaryDay(e.target.value)}
              />
            </Field>
          </div>
          {monthlyIncome > 0 && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              Доход в месяц: <b>{money(monthlyIncome)}</b>
            </p>
          )}
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата трудоустройства">
                <Input
                  type="date"
                  value={employmentDate}
                  onChange={(e) => setEmploymentDate(e.target.value)}
                />
              </Field>
              <Field label="Уже использовано дней отпуска" hint="Если не помните — оставьте 0">
                <Input
                  type="number"
                  min={0}
                  value={vacationUsed}
                  onChange={(e) => setVacationUsed(e.target.value)}
                />
              </Field>
            </div>

            {employmentDate && (
              <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <p>
                  Отработано: <b>{vacation.monthsWorked} мес.</b> · накоплено{' '}
                  <b>{days(vacation.accruedDays)}</b> отпуска
                </p>
                <p>
                  {vacation.hasRight ? (
                    <>
                      Право на отпуск есть с{' '}
                      <b>{vacation.rightFromDate ? fmtDay(vacation.rightFromDate) : '—'}</b>
                    </>
                  ) : (
                    <>
                      Право на первый отпуск появится{' '}
                      <b>{vacation.rightFromDate ? fmtDay(vacation.rightFromDate) : '—'}</b> (через{' '}
                      {days(vacation.daysUntilRight)})
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  Расчёт по ТК РФ: 28 дней в год, 2,33 дня за отработанный месяц, право на отпуск —
                  через 6 месяцев работы.
                </p>
              </div>
            )}
          </Card>

          <Card title="Планирование отпуска">
            <VacationCalendar
              plans={snapshot.vacations}
              availableDays={vacation.availableDays + vacation.plannedDays}
              onAdd={(from, to) => void addVacation(from, to)}
              onDelete={(id) => void deleteVacation(id)}
            />
          </Card>
        </div>
      )}

      {step === 2 && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Сколько денег сейчас, ₽" hint="Остаток на всех счетах и картах">
              <Input
                type="number"
                inputMode="decimal"
                value={balanceStart}
                onChange={(e) => setBalanceStart(e.target.value)}
                placeholder="50000"
              />
            </Field>
            <Field label="На какой момент" hint="По умолчанию — прямо сейчас">
              <Input
                type="datetime-local"
                value={balanceAsOf}
                onChange={(e) => setBalanceAsOf(e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Это та сумма, которую вы видите в банке сейчас — в ней уже учтены все прошлые операции.
            Поэтому импорт выписки за прошлые периоды баланс <b>не меняет</b>: старые операции идут
            только в статистику и графики. Уменьшать или увеличивать баланс будут лишь операции,
            которые произойдут после указанного момента.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Дальше загрузите выписку Т-Банка на вкладке «Импорт» — категории и графики заполнятся
            автоматически.
          </p>
        </Card>
      )}

      <div className="mt-5 flex justify-between gap-3">
        <Button variant="soft" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
          Назад
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>Дальше</Button>
        ) : (
          <Button onClick={() => void finish()} disabled={saving}>
            {saving ? 'Сохраняем…' : 'Готово'}
          </Button>
        )}
      </div>
    </div>
  );
}
