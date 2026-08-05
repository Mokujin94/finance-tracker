import type { Profile, Snapshot, Transaction, UUID } from '../types';

export type TableName =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'imports'
  | 'goals'
  | 'goal_contributions'
  | 'debts'
  | 'debt_payments'
  | 'vacation_plans';

/**
 * Единый интерфейс доступа к данным. Реализуется двумя адаптерами:
 * SupabaseRepo (Postgres + RLS) и LocalRepo (localStorage, офлайн-режим).
 * Идентификаторы генерируются на клиенте, чтобы поведение адаптеров совпадало.
 */
export interface Repo {
  /** Загрузить все данные пользователя одним снимком. */
  getSnapshot(userId: UUID): Promise<Snapshot>;
  /** Создать или обновить профиль. */
  saveProfile(profile: Profile): Promise<void>;
  /** Вставить строки. Для транзакций дубликаты (user_id + dedup_hash) молча игнорируются. */
  insertRows<T extends { id: UUID }>(table: TableName, rows: T[]): Promise<void>;
  updateRow(table: TableName, id: UUID, patch: Record<string, unknown>): Promise<void>;
  deleteRow(table: TableName, id: UUID): Promise<void>;
  /** Удалить все транзакции конкретного импорта (откат импорта). */
  deleteTransactionsByImport(userId: UUID, importId: UUID): Promise<void>;
}

export function newId(): UUID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Фолбэк для старых браузеров
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function emptySnapshot(): Snapshot {
  return {
    profile: null,
    accounts: [],
    categories: [],
    transactions: [],
    imports: [],
    goals: [],
    contributions: [],
    debts: [],
    debtPayments: [],
    vacations: [],
  };
}

export function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}
