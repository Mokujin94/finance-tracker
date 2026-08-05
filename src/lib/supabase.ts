import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Приложение работает в двух режимах:
 *  - «облако»: заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY → авторизация и данные в Supabase;
 *  - «локально»: переменных нет → данные лежат в localStorage браузера (демо/офлайн-режим).
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
