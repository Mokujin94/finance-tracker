import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../store/auth';

export default function Login() {
  const { signIn, signUp, busy, error, clearError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (mode === 'signin') {
      await signIn(email.trim(), password);
    } else {
      const message = await signUp(email.trim(), password);
      if (message) setNotice(message);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center p-4">
      <ThemeToggle className="absolute top-4 right-4" />
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-xl font-semibold tracking-tight">Финансовый трекер</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'signin' ? 'Вход в аккаунт' : 'Регистрация нового аккаунта'}
        </p>

        <div className="mt-5 space-y-3">
          <Field label="Почта">
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                clearError();
                setEmail(e.target.value);
              }}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Пароль" hint={mode === 'signup' ? 'Минимум 6 символов' : undefined}>
            <Input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
            />
          </Field>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {notice}
          </p>
        )}

        <Button type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? 'Секунду…' : mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
        </Button>

        <button
          type="button"
          onClick={() => {
            clearError();
            setNotice(null);
            setMode(mode === 'signin' ? 'signup' : 'signin');
          }}
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {mode === 'signin' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  );
}
