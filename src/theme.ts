export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'finance-theme';
const THEME_EVENT = 'finance-theme-change';

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute('content', theme === 'dark' ? '#020617' : '#f8fafc');
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

export function subscribeToTheme(listener: (theme: Theme) => void) {
  const handleThemeChange = (event: Event) => listener((event as CustomEvent<Theme>).detail);
  window.addEventListener(THEME_EVENT, handleThemeChange);
  return () => window.removeEventListener(THEME_EVENT, handleThemeChange);
}
