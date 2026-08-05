import { isSupabaseConfigured } from '../lib/supabase';
import { LocalRepo } from './localRepo';
import type { Repo } from './repo';
import { SupabaseRepo } from './supabaseRepo';

export const repo: Repo = isSupabaseConfigured ? new SupabaseRepo() : new LocalRepo();
export const cloudMode = isSupabaseConfigured;
export * from './repo';
