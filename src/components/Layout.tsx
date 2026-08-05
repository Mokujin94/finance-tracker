import { NavLink, Outlet } from 'react-router-dom';
import { cloudMode } from '../data';
import { useAuth } from '../store/auth';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Дашборд', icon: '📊', end: true },
  { to: '/import', label: 'Импорт', icon: '📥' },
  { to: '/transactions', label: 'Операции', icon: '🧾' },
  { to: '/goals', label: 'Цели', icon: '🎯' },
  { to: '/debts', label: 'Долги', icon: '🤝' },
  { to: '/analytics', label: 'Аналитика', icon: '⭐' },
  { to: '/settings', label: 'Настройки', icon: '⚙️' },
];

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-full lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="mb-6 px-2">
          <p className="text-lg font-semibold tracking-tight">Финансы</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 flex items-center gap-2 px-1">
          <ThemeToggle />
          {cloudMode && (
            <button
              onClick={signOut}
              className="flex-1 rounded-xl px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Выйти
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
          <div className="flex items-center justify-between">
            <p className="font-semibold tracking-tight">Финансы</p>
            <div className="flex items-center gap-2">
              {cloudMode && (
                <button onClick={signOut} className="text-xs text-slate-400">
                  Выйти
                </button>
              )}
              <ThemeToggle className="h-8 w-8 border-0 bg-transparent shadow-none dark:bg-transparent" />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                }`
              }
            >
              <span className="text-base" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
