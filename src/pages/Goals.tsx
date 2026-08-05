import { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Field, Input, Modal, ProgressBar } from '../components/ui';
import { fmtDay, todayISO } from '../lib/dates';
import { money, num, percent } from '../lib/format';
import { debtViews, forecastLabel, goalForecasts } from '../logic/analytics';
import { useData } from '../store/data';

export default function Goals() {
  const { snapshot, addGoal, updateGoal, deleteGoal, addContribution } = useData();
  const [addOpen, setAddOpen] = useState(false);
  const [topUpGoal, setTopUpGoal] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');

  const [amount, setAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(todayISO());
  const [note, setNote] = useState('');

  const views = useMemo(
    () => debtViews(snapshot.debts, snapshot.debtPayments),
    [snapshot.debts, snapshot.debtPayments],
  );
  const forecasts = useMemo(() => goalForecasts(snapshot, views), [snapshot, views]);

  async function submitGoal() {
    if (!title.trim() || !Number(target) || !deadline) return;
    await addGoal({
      title: title.trim(),
      target_amount: Number(target),
      deadline,
      saved: Number(saved) || 0,
    });
    setTitle('');
    setTarget('');
    setSaved('');
    setDeadline('');
    setAddOpen(false);
  }

  async function submitContribution() {
    if (!topUpGoal || !Number(amount)) return;
    await addContribution(topUpGoal, Number(amount), contributionDate, note.trim() || undefined);
    setAmount('');
    setNote('');
    setTopUpGoal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Цели</h1>
          <p className="text-sm text-slate-500">
            Считаем, сколько нужно откладывать, и успеваете ли вы к дедлайну.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Добавить цель</Button>
      </div>

      {forecasts.length === 0 ? (
        <Card>
          <Empty
            title="Целей пока нет"
            hint="Например: «Отпуск», 120 000 ₽, к 1 июня — посчитаем платёж в месяц"
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {forecasts.map((forecast) => (
            <Card key={forecast.goal.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{forecast.goal.title}</h2>
                  <p className="text-xs text-slate-400">
                    дедлайн {fmtDay(forecast.goal.deadline)} ·{' '}
                    {forecast.monthsLeft > 0
                      ? `осталось ${num(forecast.monthsLeft, 1)} мес.`
                      : 'срок вышел'}
                  </p>
                </div>
                <Badge tone={forecast.remaining <= 0 ? 'indigo' : forecast.onTrack ? 'green' : 'red'}>
                  {forecast.remaining <= 0 ? 'собрана' : forecast.onTrack ? 'успеваем' : 'отстаём'}
                </Badge>
              </div>

              <div className="mt-3">
                <ProgressBar value={forecast.progress} />
                <p className="mt-1.5 text-sm">
                  <b>{money(forecast.saved)}</b> из {money(forecast.goal.target_amount)}{' '}
                  <span className="text-slate-400">({percent(forecast.progress)})</span>
                </p>
                {forecast.borrowed > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    из них {money(forecast.borrowed)} — заёмные деньги (долг привязан к цели)
                  </p>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Нужно в месяц</dt>
                  <dd className="font-semibold">{money(forecast.requiredPerMonth)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">С каждой выплаты</dt>
                  <dd className="font-semibold">{money(forecast.requiredPerPaycheck)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Получается в месяц</dt>
                  <dd className="font-semibold">{money(forecast.projectedPerMonth)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Осталось собрать</dt>
                  <dd className="font-semibold">{money(forecast.remaining)}</dd>
                </div>
              </dl>

              <p className="mt-2 text-xs text-slate-500">{forecastLabel(forecast)}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="soft" onClick={() => setTopUpGoal(forecast.goal.id)}>
                  Пополнить
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void updateGoal(forecast.goal.id, { archived: true })}
                >
                  В архив
                </Button>
                <Button variant="danger" onClick={() => void deleteGoal(forecast.goal.id)}>
                  Удалить
                </Button>
              </div>

              {snapshot.contributions.filter((c) => c.goal_id === forecast.goal.id).length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-400">
                    История пополнений
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-500">
                    {snapshot.contributions
                      .filter((c) => c.goal_id === forecast.goal.id)
                      .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1))
                      .map((contribution) => (
                        <li key={contribution.id} className="flex justify-between gap-2">
                          <span>
                            {fmtDay(contribution.occurred_on)}
                            {contribution.note ? ` · ${contribution.note}` : ''}
                          </span>
                          <span className="font-medium text-slate-700">
                            {money(contribution.amount)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}

      {snapshot.goals.some((g) => g.archived) && (
        <Card title="Архив">
          <ul className="space-y-2 text-sm">
            {snapshot.goals
              .filter((g) => g.archived)
              .map((goal) => (
                <li key={goal.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">
                    {goal.title} · {money(goal.saved_amount)} из {money(goal.target_amount)}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => void updateGoal(goal.id, { archived: false })}>
                      Вернуть
                    </Button>
                    <Button variant="danger" onClick={() => void deleteGoal(goal.id)}>
                      Удалить
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <Modal open={addOpen} title="Новая цель" onClose={() => setAddOpen(false)}>
        <div className="space-y-3">
          <Field label="На что копим">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Отпуск" />
          </Field>
          <Field label="Нужная сумма, ₽">
            <Input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="120000"
            />
          </Field>
          <Field label="Уже отложено, ₽">
            <Input type="number" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Дедлайн">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={() => void submitGoal()}>
            Создать цель
          </Button>
        </div>
      </Modal>

      <Modal open={topUpGoal !== null} title="Пополнить цель" onClose={() => setTopUpGoal(null)}>
        <div className="space-y-3">
          <Field label="Сумма, ₽" hint="Отрицательное число — если снимаете деньги с цели">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Дата">
            <Input
              type="date"
              value={contributionDate}
              onChange={(e) => setContributionDate(e.target.value)}
            />
          </Field>
          <Field label="Комментарий">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="с зарплаты" />
          </Field>
          <Button className="w-full" onClick={() => void submitContribution()}>
            Сохранить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
