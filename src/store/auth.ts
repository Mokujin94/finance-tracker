import { create } from 'zustand';
import { cloudMode } from '../data';
import { currentUserId } from '../data/localRepo';
import { supabase } from '../lib/supabase';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  error: string | null;
  busy: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

function translate(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Неверная почта или пароль',
    'User already registered': 'Пользователь с такой почтой уже зарегистрирован',
    'Password should be at least 6 characters':
      'Пароль должен быть не короче 6 символов',
    'Email not confirmed': 'Почта не подтверждена — проверьте письмо от Supabase',
  };
  return map[message] ?? message;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  error: null,
  busy: false,

  async init() {
    if (!cloudMode || !supabase) {
      // Локальный режим: единственный пользователь, вход не нужен
      set({ user: { id: currentUserId(), email: 'локальный режим' }, ready: true });
      return;
    }
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    set({
      user: session ? { id: session.user.id, email: session.user.email ?? '' } : null,
      ready: true,
    });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({
        user: nextSession
          ? { id: nextSession.user.id, email: nextSession.user.email ?? '' }
          : null,
      });
    });
  },

  async signIn(email, password) {
    if (!supabase) return;
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ busy: false, error: error ? translate(error.message) : null });
  },

  async signUp(email, password) {
    if (!supabase) return null;
    set({ busy: true, error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    set({ busy: false, error: error ? translate(error.message) : null });
    if (error) return null;
    return data.session
      ? null
      : 'Аккаунт создан. Подтвердите почту по ссылке из письма и войдите.';
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
