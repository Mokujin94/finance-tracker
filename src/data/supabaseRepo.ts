import { supabase } from '../lib/supabase';
import type {
  Account,
  Category,
  Debt,
  DebtPayment,
  Goal,
  GoalContribution,
  ImportRun,
  Profile,
  Snapshot,
  Transaction,
  UUID,
  VacationPlan,
} from '../types';
import { emptySnapshot, sortTransactions, type Repo, type TableName } from './repo';

function client() {
  if (!supabase) throw new Error('Supabase не сконфигурирован');
  return supabase;
}

/** PostgREST отдаёт не больше 1000 строк за запрос, поэтому читаем страницами. */
const PAGE_SIZE = 1000;

async function selectAll<T>(table: string, userId: string, orderBy?: string): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; ; page++) {
    let query = client()
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (orderBy) query = query.order(orderBy, { ascending: false });
    // Вторичная сортировка по id: при одинаковом времени порядок иначе не гарантирован,
    // и строки могли бы перескакивать между страницами — часть пропала бы, часть задвоилась.
    query = query.order('id', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

/** Облачный режим: Postgres в Supabase, доступ ограничен RLS-политиками (user_id = auth.uid()). */
export class SupabaseRepo implements Repo {
  async getSnapshot(userId: UUID): Promise<Snapshot> {
    const db = client();
    const profileRes = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (profileRes.error) throw profileRes.error;

    const [
      accounts,
      categories,
      transactions,
      imports,
      goals,
      contributions,
      debts,
      debtPayments,
      vacations,
    ] = await Promise.all([
        selectAll<Account>('accounts', userId),
        selectAll<Category>('categories', userId),
        selectAll<Transaction>('transactions', userId, 'occurred_at'),
        selectAll<ImportRun>('imports', userId, 'imported_at'),
        selectAll<Goal>('goals', userId),
        selectAll<GoalContribution>('goal_contributions', userId),
        selectAll<Debt>('debts', userId),
        selectAll<DebtPayment>('debt_payments', userId),
        selectAll<VacationPlan>('vacation_plans', userId),
      ]);

    return {
      ...emptySnapshot(),
      profile: (profileRes.data as Profile | null) ?? null,
      accounts,
      categories,
      transactions: sortTransactions(transactions),
      imports,
      goals,
      contributions,
      debts,
      debtPayments,
      vacations,
    };
  }

  async saveProfile(profile: Profile): Promise<void> {
    const { error } = await client().from('profiles').upsert(profile, { onConflict: 'id' });
    if (error) throw error;
  }

  async insertRows<T extends { id: UUID }>(table: TableName, rows: T[]): Promise<void> {
    if (rows.length === 0) return;
    if (table === 'transactions') {
      // Дедупликация на уровне БД. Поля должны в точности совпадать с уникальным
      // индексом transactions_dedup_idx (user_id, account_id, dedup_hash), иначе
      // Postgres отвечает 42P10: «no unique constraint matching the ON CONFLICT».
      const { error } = await client()
        .from(table)
        .upsert(rows, { onConflict: 'user_id,account_id,dedup_hash', ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    const { error } = await client().from(table).insert(rows);
    if (error) throw error;
  }

  async updateRow(table: TableName, id: UUID, patch: Record<string, unknown>): Promise<void> {
    const { error } = await client().from(table).update(patch).eq('id', id);
    if (error) throw error;
  }

  async deleteRow(table: TableName, id: UUID): Promise<void> {
    const { error } = await client().from(table).delete().eq('id', id);
    if (error) throw error;
  }

  async deleteTransactionsByImport(userId: UUID, importId: UUID): Promise<void> {
    const { error } = await client()
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .eq('import_id', importId);
    if (error) throw error;
  }
}
