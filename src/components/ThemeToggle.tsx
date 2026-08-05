import { useEffect, useState } from 'react';
import { applyTheme, getInitialTheme, subscribeToTheme, type Theme } from '../theme';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => subscribeToTheme(setTheme), []);

  function toggleTheme() {
    const nextTheme: Theme = isDark ? 'light' : 'dark';
    applyTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-base text-slate-600 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
    >
      <span aria-hidden>{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}
