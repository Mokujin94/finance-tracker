import type { Profile, Snapshot, Transaction, UUID } from '../types';
import { emptySnapshot, sortTransactions, type Repo, type TableName } from './repo';

const KEY = (userId: string) => `finance:v1:${userId}`;

interface RawStore extends Snapshot {}

function read(userId: string): RawStore {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return emptySnapshot();
    return { ...emptySnapshot(), ...(JSON.parse(raw) as Partial<Snapshot>) };
  } catch {
    return emptySnapshot();
  }
}

function write(userId: string, data: RawStore): void {
  localStorage.setItem(KEY(userId), JSON.stringify(data));
}

const FIELD: Record<TableName, keyof Snapshot> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  imports: 'imports',
  goals: 'goals',
  goal_contributions: 'contributions',
  debts: 'debts',
  debt_payments: 'debtPayments',
  vacation_plans: 'vacations',
};

/** Локальный режим: всё хранится в localStorage браузера. */
export class LocalRepo implements Repo {
  async getSnapshot(userId: UUID): Promise<Snapshot> {
    const data = read(userId);
    return { ...data, transactions: sortTransactions(data.transactions) };
  }

  async saveProfile(profile: Profile): Promise<void> {
    const data = read(profile.id);
    data.profile = profile;
    write(profile.id, data);
  }

  async insertRows<T extends { id: UUID }>(table: TableName, rows: T[]): Promise<void> {
    if (rows.length === 0) return;
    const userId = (rows[0] as unknown as { user_id: string }).user_id;
    const data = read(userId);
    const field = FIELD[table];
    const list = data[field] as unknown as T[];

    if (table === 'transactions') {
      // Дедупликация в пределах счёта — как уникальный индекс в Supabase:
      // одинаковая покупка по картам разных банков это две разные операции.
      const key = (t: Transaction) => `${t.account_id ?? 'none'}|${t.dedup_hash}`;
      const seen = new Set((list as unknown as Transaction[]).map(key));
      for (const row of rows as unknown as Transaction[]) {
        if (seen.has(key(row))) continue;
        seen.add(key(row));
        (list as unknown as Transaction[]).push(row);
      }
    } else {
      list.push(...rows);
    }
    write(userId, data);
  }

  async updateRow(table: TableName, id: UUID, patch: Record<string, unknown>): Promise<void> {
    const userId = currentUserId();
    const data = read(userId);
    const list = data[FIELD[table]] as unknown as Array<Record<string, unknown>>;
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...patch };
    write(userId, data);
  }

  async deleteRow(table: TableName, id: UUID): Promise<void> {
    const userId = currentUserId();
    const data = read(userId);
    const field = FIELD[table];
    const list = data[field] as unknown as Array<{ id: string }>;
    const next = list.filter((r) => r.id !== id);
    (data[field] as unknown as Array<{ id: string }>) = next;
    write(userId, data);
  }

  async deleteTransactionsByImport(userId: UUID, importId: UUID): Promise<void> {
    const data = read(userId);
    data.transactions = data.transactions.filter((t) => t.import_id !== importId);
    write(userId, data);
  }
}

/**
 * В локальном режиме пользователь всегда один; его id хранится отдельно,
 * чтобы update/delete не требовали передачи user_id.
 */
const LOCAL_USER_KEY = 'finance:v1:current-user';

export function currentUserId(): string {
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = 'local-user';
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}
