import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts';
import { Badge, Card, Empty, ProgressBar, Stat } from '../components/ui';
import { fmtDay, fmtDayTime, monthKey, monthLabel } from '../lib/dates';
import { days, money, percent } from '../lib/format';
import {
  categoryBreakdown,
  currentBalance,
  debtTotals,
  debtViews,
  goalForecasts,
  monthlyStats,
  payPeriod,
} from '../logic/analytics';
import { computeRating } from '../logic/rating';
import { computeVacation } from '../logic/vacation';
import { useData } from '../store/data';

export default function Dashboard() {
  const { snapshot } = useData();
  const profile = snapshot.profile;

  const balance = useMemo(
    () => currentBalance(profile, snapshot.transactions),
    [profile, snapshot.transactions],
  );
  const period = useMemo(() => payPeriod(profile, balance), [profile, balance]);
  const thisMonth = monthKey(new Date());
  const breakdown = useMemo(
    () => categoryBreakdown(snapshot.transactions, snapshot.categories, thisMonth),
    [snapshot.transactions, snapshot.categories, thisMonth],
  );
  const stats = useMemo(() => monthlyStats(snapshot.transactions, 12), [snapshot.transactions]);
  const views = useMemo(
    () => debtViews(snapshot.debts, snapshot.debtPayments),
    [snapshot.debts, snapshot.debtPayments],
  );
  const totals = debtTotals(views);
  const forecasts = useMemo(() => goalForecasts(snapshot, views), [snapshot, views]);
  const rating = useMemo(() => computeRating(snapshot), [snapshot]);
  const vacation = computeVacation(
    profile?.employment_date ?? null,
    profile?.vacation_used_days ?? 0,
    snapshot.vacations,
  );

  const monthStat = stats.find((s) => s.key === thisMonth);
  const chartData = stats.map((s) => ({
    month: monthLabel(s.key),
    Доходы: Math.round(s.income),
    Расходы: Math.round(s.expense),
    Остаток: Math.round(s.net),
  }));
  const topCategories = breakdown.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <Link
          to="/analytics"
          className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Рейтинг {rating.enoughData ? `${rating.score} / 5` : '— нет данных'} →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="Текущий баланс"
            value={money(balance)}
            tone={balance < 0 ? 'negative' : 'default'}
            hint={
              profile ? `остаток на ${fmtDayTime(profile.balance_as_of)} + операции после` : undefined
            }
          />
        </Card>
        <Card>
          <Stat
            label={period ? `До выплаты «${period.label}»` : 'До выплаты'}
            value={period ? days(period.daysLeft) : '—'}
            hint={
              period
                ? `${fmtDay(period.date)} · придёт ${money(period.amount)}`
                : 'Заполните профиль'
            }
          />
        </Card>
        <Card>
          <Stat
            label="Можно тратить в день"
            value={period ? money(period.perDay) : '—'}
            hint="Остаток, поделённый на дни до выплаты"
          />
        </Card>
        <Card>
          <Stat
            label="Этот месяц"
            value={monthStat ? money(monthStat.net) : '—'}
            tone={monthStat && monthStat.net < 0 ? 'negative' : 'positive'}
            hint={
              monthStat
                ? `доходы ${money(monthStat.income)} · расходы ${money(monthStat.expense)}`
                : 'Нет операций'
            }
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Топ категорий трат за месяц">
          {topCategories.length === 0 ? (
            <Empty title="Нет трат в этом месяце" hint="Загрузите выписку на вкладке «Импорт»" />
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topCategories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {topCategories.map((slice) => (
                        <Cell key={slice.id} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => money(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {topCategories.map((slice) => (
                  <li key={slice.id} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: slice.color }}
                    />
                    <span className="flex-1 truncate">{slice.name}</span>
                    <span className="text-slate-400">{percent(slice.share)}</span>
                    <span className="w-24 text-right font-medium">{money(slice.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Динамика по месяцам">
          {chartData.length === 0 ? (
            <Empty title="Пока нет данных" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ left: -18, right: 4, top: 8 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}к`}
                  />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Доходы" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Расходы" fill="#fb7185" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Остаток" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Цели: план и факт"
          action={
            <Link to="/goals" className="text-xs text-indigo-600 hover:underline">
              все цели →
            </Link>
          }
        >
          {forecasts.length === 0 ? (
            <Empty title="Целей пока нет" hint="Добавьте цель — посчитаем, сколько откладывать" />
          ) : (
            <ul className="space-y-3">
              {forecasts.slice(0, 4).map((forecast) => (
                <li key={forecast.goal.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{forecast.goal.title}</span>
                    <Badge tone={forecast.onTrack ? 'green' : 'red'}>
                      {forecast.onTrack ? 'успеваем' : 'отстаём'}
                    </Badge>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={forecast.progress} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {money(forecast.saved)} из {money(forecast.goal.target_amount)} · нужно{' '}
                    {money(forecast.requiredPerMonth)}/мес · факт{' '}
                    {money(forecast.projectedPerMonth)}/мес
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Долги"
            action={
              <Link to="/debts" className="text-xs text-indigo-600 hover:underline">
                подробнее →
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Я должен" value={money(totals.iOwe)} tone={totals.iOwe > 0 ? 'negative' : 'default'} />
              <Stat label="Мне должны" value={money(totals.owedToMe)} tone="positive" />
            </div>
            {views.some((v) => v.overdue) && (
              <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700">
                Есть просроченные долги — проверьте раздел «Долги».
              </p>
            )}
          </Card>

          {profile?.employment_date && (
            <Card title="Отпуск">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Накоплено" value={days(vacation.accruedDays)} />
                <Stat
                  label="Доступно"
                  value={days(Math.max(vacation.availableDays, 0))}
                  hint={
                    vacation.hasRight
                      ? `запланировано ${days(vacation.plannedDays)}`
                      : `право с ${vacation.rightFromDate ? fmtDay(vacation.rightFromDate) : '—'}`
                  }
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
