import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Card, Empty, ProgressBar, Select } from '../components/ui';
import { monthKey, monthLabel } from '../lib/dates';
import { money, num, percent } from '../lib/format';
import { categoryBreakdown, debtViews, forecastLabel, goalForecasts } from '../logic/analytics';
import { computeRating } from '../logic/rating';
import { useData } from '../store/data';

function ratingColor(score: number): string {
  if (score >= 4) return '#10b981';
  if (score >= 3) return '#84cc16';
  if (score >= 2) return '#f59e0b';
  return '#f43f5e';
}

export default function Analytics() {
  const { snapshot } = useData();
  const rating = useMemo(() => computeRating(snapshot), [snapshot]);
  const views = useMemo(
    () => debtViews(snapshot.debts, snapshot.debtPayments),
    [snapshot.debts, snapshot.debtPayments],
  );
  const forecasts = useMemo(() => goalForecasts(snapshot, views), [snapshot, views]);

  const months = useMemo(() => {
    const keys = new Set(snapshot.transactions.map((t) => monthKey(t.occurred_at)));
    return [...keys].sort().reverse();
  }, [snapshot.transactions]);
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const breakdown = useMemo(
    () => categoryBreakdown(snapshot.transactions, snapshot.categories, month),
    [snapshot.transactions, snapshot.categories, month],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Аналитика</h1>
        <p className="text-sm text-slate-500">Оценка ситуации, прогноз по целям и структура трат.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-3xl font-semibold text-white"
            style={{ background: rating.enoughData ? ratingColor(rating.score) : '#cbd5e1' }}
          >
            {rating.enoughData ? rating.score : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">Рейтинг финансовой ситуации</p>
            <p className="mt-1 text-lg font-medium">{rating.summary}</p>
            <p className="mt-1 text-xs text-slate-400">Оценка от 0 до 5 по пяти показателям</p>
          </div>
        </div>

        <ul className="mt-5 space-y-3">
          {rating.components.map((component) => (
            <li key={component.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {component.label}{' '}
                  <span className="text-xs text-slate-400">вес {percent(component.weight)}</span>
                </span>
                <span className={component.applicable ? 'font-semibold' : 'text-slate-400'}>
                  {component.applicable ? `${num(component.score * 5, 1)} / 5` : 'нет данных'}
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  value={component.applicable ? component.score : 0}
                  color={ratingColor(component.score * 5)}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{component.detail}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Что тянет вверх">
          {rating.strengths.length === 0 ? (
            <Empty title="Пока нет сильных сторон" />
          ) : (
            <ul className="space-y-2 text-sm">
              {rating.strengths.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-emerald-500">▲</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Что тянет вниз">
          {rating.weaknesses.length === 0 ? (
            <Empty title="Слабых мест не нашлось" />
          ) : (
            <ul className="space-y-2 text-sm">
              {rating.weaknesses.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-rose-500">▼</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Рекомендации">
        <ul className="space-y-2 text-sm">
          {rating.recommendations.map((tip) => (
            <li
              key={tip}
              className="rounded-xl bg-indigo-50/60 p-3 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-200"
            >
              {tip}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Успеваем ли по целям">
        {forecasts.length === 0 ? (
          <Empty title="Целей нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="py-1.5 pr-3">Цель</th>
                  <th className="py-1.5 pr-3">Нужно/мес</th>
                  <th className="py-1.5 pr-3">Факт/мес</th>
                  <th className="py-1.5 pr-3">Успеваем</th>
                  <th className="py-1.5">Прогноз</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map((forecast) => (
                  <tr key={forecast.goal.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 font-medium">{forecast.goal.title}</td>
                    <td className="py-2 pr-3">{money(forecast.requiredPerMonth)}</td>
                    <td className="py-2 pr-3">{money(forecast.projectedPerMonth)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={forecast.onTrack ? 'green' : 'red'}>
                        {forecast.onTrack ? 'да' : 'нет'}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-500">{forecastLabel(forecast)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Структура трат"
        action={
          <Select className="w-40 py-1 text-xs" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.length === 0 && <option value={month}>{monthLabel(month)}</option>}
            {months.map((key) => (
              <option key={key} value={key}>
                {monthLabel(key)}
              </option>
            ))}
          </Select>
        }
      >
        {breakdown.length === 0 ? (
          <Empty title="Нет трат за выбранный месяц" />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}к`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(value: number) => money(value)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {breakdown.map((slice) => (
                    <Cell key={slice.id} fill={slice.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
