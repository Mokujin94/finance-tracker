import { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Field, Input, Modal, ProgressBar, Select, Stat } from '../components/ui';
import { fmtDay, todayISO } from '../lib/dates';
import { money } from '../lib/format';
import { debtTotals, debtViews } from '../logic/analytics';
import type { DebtDirection } from '../types';
import { useData } from '../store/data';

const STATUS_LABEL = {
  open: 'не погашен',
  partial: 'частично погашен',
  closed: 'погашен',
} as const;

export default function Debts() {
  const { snapshot, addDebt, deleteDebt, addDebtPayment, deleteDebtPayment } = useData();
  const [addOpen, setAddOpen] = useState(false);
  const [payDebt, setPayDebt] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const [direction, setDirection] = useState<DebtDirection>('i_owe');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [startedOn, setStartedOn] = useState(todayISO());
  const [dueOn, setDueOn] = useState('');
  const [goalId, setGoalId] = useState('');
  const [comment, setComment] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentNote, setPaymentNote] = useState('');

  const views = useMemo(
    () => debtViews(snapshot.debts, snapshot.debtPayments),
    [snapshot.debts, snapshot.debtPayments],
  );
  const totals = debtTotals(views);
  const visible = views
    .filter((view) => showClosed || view.status !== 'closed')
    .sort((a, b) => {
      if (a.status === 'closed' && b.status !== 'closed') return 1;
      if (b.status === 'closed' && a.status !== 'closed') return -1;
      return (a.debt.due_on ?? '9999') < (b.debt.due_on ?? '9999') ? -1 : 1;
    });

  async function submitDebt() {
    if (!counterparty.trim() || !Number(amount)) return;
    await addDebt({
      direction,
      counterparty: counterparty.trim(),
      amount: Number(amount),
      started_on: startedOn,
      due_on: dueOn || null,
      goal_id: goalId || null,
      comment: comment.trim() || null,
    });
    setCounterparty('');
    setAmount('');
    setDueOn('');
    setGoalId('');
    setComment('');
    setAddOpen(false);
  }

  async function submitPayment() {
    if (!payDebt || !Number(paymentAmount)) return;
    await addDebtPayment(payDebt, Number(paymentAmount), paymentDate, paymentNote.trim() || undefined);
    setPaymentAmount('');
    setPaymentNote('');
    setPayDebt(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Задолженности</h1>
          <p className="text-sm text-slate-500">Кому должны вы и кто должен вам.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Добавить долг</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat label="Я должен" value={money(totals.iOwe)} tone={totals.iOwe > 0 ? 'negative' : 'default'} />
        </Card>
        <Card>
          <Stat label="Мне должны" value={money(totals.owedToMe)} tone="positive" />
        </Card>
        <Card>
          <Stat
            label="Итого"
            value={money(totals.net)}
            tone={totals.net < 0 ? 'negative' : 'positive'}
            hint="мне должны минус я должен"
          />
        </Card>
      </div>

      <Card
        title="Список долгов"
        action={
          <button
            onClick={() => setShowClosed((value) => !value)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {showClosed ? 'скрыть погашенные' : 'показать погашенные'}
          </button>
        }
      >
        {visible.length === 0 ? (
          <Empty title="Долгов нет" hint="И это хорошо" />
        ) : (
          <ul className="space-y-3">
            {visible.map((view) => {
              const goal = snapshot.goals.find((g) => g.id === view.debt.goal_id);
              const payments = snapshot.debtPayments.filter((p) => p.debt_id === view.debt.id);
              return (
                <li key={view.debt.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {view.debt.direction === 'i_owe' ? 'Я должен: ' : 'Мне должен: '}
                        {view.debt.counterparty}
                      </p>
                      <p className="text-xs text-slate-400">
                        с {fmtDay(view.debt.started_on)}
                        {view.debt.due_on ? ` · вернуть до ${fmtDay(view.debt.due_on)}` : ''}
                        {view.debt.comment ? ` · ${view.debt.comment}` : ''}
                      </p>
                      {goal && (
                        <p className="mt-1 text-xs text-amber-700">
                          привязан к цели «{goal.title}» — часть суммы цели закрыта заёмными деньгами
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-lg font-semibold">{money(view.remaining)}</span>
                      <div className="flex gap-1.5">
                        {view.overdue && <Badge tone="red">просрочен</Badge>}
                        <Badge
                          tone={
                            view.status === 'closed' ? 'green' : view.status === 'partial' ? 'amber' : 'slate'
                          }
                        >
                          {STATUS_LABEL[view.status]}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ProgressBar
                      value={view.debt.amount > 0 ? view.paid / view.debt.amount : 0}
                      color={view.status === 'closed' ? '#10b981' : '#f59e0b'}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      погашено {money(view.paid)} из {money(view.debt.amount)}
                    </p>
                  </div>

                  {payments.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-400">
                        Платежи ({payments.length})
                      </summary>
                      <ul className="mt-1.5 space-y-1 text-xs text-slate-500">
                        {payments
                          .sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1))
                          .map((payment) => (
                            <li key={payment.id} className="flex items-center justify-between gap-2">
                              <span>
                                {fmtDay(payment.paid_on)}
                                {payment.note ? ` · ${payment.note}` : ''}
                              </span>
                              <span className="flex items-center gap-2">
                                <b className="text-slate-700">{money(payment.amount)}</b>
                                <button
                                  onClick={() => void deleteDebtPayment(payment.id)}
                                  className="text-slate-300 hover:text-rose-600"
                                >
                                  ✕
                                </button>
                              </span>
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}

                  <div className="mt-3 flex gap-2">
                    {view.status !== 'closed' && (
                      <Button variant="soft" onClick={() => setPayDebt(view.debt.id)}>
                        Внести платёж
                      </Button>
                    )}
                    <Button variant="danger" onClick={() => void deleteDebt(view.debt.id)}>
                      Удалить
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal open={addOpen} title="Новый долг" onClose={() => setAddOpen(false)}>
        <div className="space-y-3">
          <Field label="Направление">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as DebtDirection)}>
              <option value="i_owe">Я должен</option>
              <option value="owed_to_me">Мне должны</option>
            </Select>
          </Field>
          <Field label={direction === 'i_owe' ? 'Кому должен' : 'Кто должен'}>
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Например, Андрей"
            />
          </Field>
          <Field label="Сумма, ₽">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата">
              <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
            </Field>
            <Field label="Срок возврата" hint="необязательно">
              <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          </div>
          <Field label="Привязать к цели" hint="Видно, какая часть цели закрыта заёмными деньгами">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">Без привязки</option>
              {snapshot.goals
                .filter((g) => !g.archived)
                .map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Комментарий">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={() => void submitDebt()}>
            Добавить
          </Button>
        </div>
      </Modal>

      <Modal open={payDebt !== null} title="Платёж по долгу" onClose={() => setPayDebt(null)}>
        <div className="space-y-3">
          <Field label="Сумма, ₽">
            <Input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </Field>
          <Field label="Дата">
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
          <Field label="Комментарий">
            <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={() => void submitPayment()}>
            Сохранить платёж
          </Button>
        </div>
      </Modal>
    </div>
  );
}
