import { addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { ISO_DAY, fmtDay, toDate } from '../lib/dates';
import { capitalize, days } from '../lib/format';
import { vacationDays } from '../logic/vacation';
import type { VacationPlan } from '../types';
import { Badge, Button, Empty } from './ui';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7; // понедельник — первый
}

interface Props {
  plans: VacationPlan[];
  onAdd: (start: string, end: string) => void;
  onDelete: (id: string) => void;
  /** Сколько дней доступно — для подсказки о перерасходе */
  availableDays?: number;
}

/** Календарь планирования отпуска: первый клик — начало периода, второй — конец. */
export default function VacationCalendar({ plans, onAdd, onDelete, availableDays }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [hovered, setHovered] = useState<Date | null>(null);

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const leading = weekdayIndex(first);
    const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
    cells.push(...eachDayOfInterval({ start: first, end: last }));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const planned = useMemo(() => {
    const set = new Set<string>();
    for (const plan of plans) {
      for (const day of eachDayOfInterval({
        start: toDate(plan.start_date),
        end: toDate(plan.end_date),
      })) {
        set.add(format(day, ISO_DAY));
      }
    }
    return set;
  }, [plans]);

  const previewRange = useMemo(() => {
    if (!pendingStart || !hovered) return null;
    const [from, to] = pendingStart <= hovered ? [pendingStart, hovered] : [hovered, pendingStart];
    return new Set(eachDayOfInterval({ start: from, end: to }).map((d) => format(d, ISO_DAY)));
  }, [pendingStart, hovered]);

  function handleClick(day: Date) {
    if (!pendingStart) {
      setPendingStart(day);
      return;
    }
    const [from, to] = pendingStart <= day ? [pendingStart, day] : [day, pendingStart];
    onAdd(format(from, ISO_DAY), format(to, ISO_DAY));
    setPendingStart(null);
    setHovered(null);
  }

  const totalPlanned = plans.reduce((sum, plan) => sum + vacationDays(plan), 0);
  const over = availableDays !== undefined && totalPlanned > availableDays + 0.01;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="soft" type="button" onClick={() => setCursor(addMonths(cursor, -1))}>
          ←
        </Button>
        <p className="text-sm font-medium">
          {capitalize(cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }))}
        </p>
        <Button variant="soft" type="button" onClick={() => setCursor(addMonths(cursor, 1))}>
          →
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const iso = format(day, ISO_DAY);
          const isPlanned = planned.has(iso);
          const isPreview = previewRange?.has(iso) ?? false;
          const isStart = pendingStart && format(pendingStart, ISO_DAY) === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => handleClick(day)}
              onMouseEnter={() => setHovered(day)}
              className={`aspect-square rounded-lg text-sm transition ${
                isPlanned
                  ? 'bg-indigo-600 text-white'
                  : isStart
                    ? 'bg-indigo-500 text-white'
                    : isPreview
                      ? 'bg-indigo-100 text-indigo-700'
                      : isSameMonth(day, cursor)
                        ? 'hover:bg-slate-100'
                        : 'text-slate-300'
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {pendingStart
          ? `Начало ${fmtDay(pendingStart)} — выберите последний день отпуска`
          : 'Кликните первый и последний день предполагаемого отпуска'}
      </p>

      <div className="mt-4 space-y-2">
        {plans.length === 0 ? (
          <Empty title="Отпуск пока не запланирован" />
        ) : (
          plans
            .slice()
            .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
            .map((plan) => (
              <div
                key={plan.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span>
                  {fmtDay(plan.start_date)} — {fmtDay(plan.end_date)}{' '}
                  <span className="text-slate-400">({days(vacationDays(plan))})</span>
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(plan.id)}
                  className="text-xs text-slate-400 hover:text-rose-600"
                >
                  удалить
                </button>
              </div>
            ))
        )}
      </div>

      {plans.length > 0 && (
        <p className="mt-3 text-xs">
          Всего запланировано: {days(totalPlanned)}{' '}
          {over && <Badge tone="amber">больше, чем накоплено</Badge>}
        </p>
      )}
    </div>
  );
}
