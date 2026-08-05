import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './store/auth';
import { useData } from './store/data';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import Debts from './pages/Debts';
import Goals from './pages/Goals';
import ImportPage from './pages/ImportPage';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-slate-400">{text}</div>
  );
}

export default function App() {
  const { user, ready, init } = useAuth();
  const { load, reset, snapshot, loading, userId, error } = useData();
  const location = useLocation();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (user && user.id !== userId) void load(user.id);
    if (!user && userId) reset();
  }, [user, userId, load, reset]);

  if (!ready) return <Splash text="Загрузка…" />;
  if (!user) return <Login />;
  if (!error && (loading || userId === null)) return <Splash text="Загружаем данные…" />;

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
          Не удалось загрузить данные: {error}
        </p>
      </div>
    );
  }

  const onboarded = snapshot.profile?.onboarded ?? false;
  if (!onboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="goals" element={<Goals />} />
        <Route path="debts" element={<Debts />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
