import { create } from 'zustand';
import { emptySnapshot, newId, repo, sortTransactions } from '../data';
import { todayISO } from '../lib/dates';
import { buildDefaultCategories, guessCategoryId } from '../logic/categorize';
import type { ParsedRow } from '../logic/parseStatement';
import type {
  Category,
  Debt,
  DebtPayment,
  Goal,
  GoalContribution,
  ImportRun,
  Profile,
  Snapshot,
  Transaction,
  TxType,
  UUID,
  VacationPlan,
} from '../types';

interface DataState {
  userId: UUID | null;
  snapshot: Snapshot;
  loading: boolean;
  error: string | null;

  load: (userId: UUID) => Promise<void>;
  reset: () => void;

  saveProfile: (patch: Partial<Profile>) => Promise<void>;

  importStatement: (
    rows: ParsedRow[],
    filename: string,
  ) => Promise<{ added: number; duplicates: number }>;
  undoImport: (importId: UUID) => Promise<void>;
  setTransactionCategory: (txId: UUID, categoryId: UUID | null) => Promise<void>;
  deleteTransaction: (txId: UUID) => Promise<void>;
  /** Пересчитать категории у операций, которым их не выставляли вручную. Возвращает число изменённых. */
  recategorize: () => Promise<number>;

  addCategory: (name: string, kind: TxType, color: string) => Promise<void>;
  updateCategory: (id: UUID, patch: Partial<Category>) => Promise<void>;
  deleteCategory: (id: UUID) => Promise<void>;

  addGoal: (input: Pick<Goal, 'title' | 'target_amount' | 'deadline'> & { saved?: number }) => Promise<void>;
  updateGoal: (id: UUID, patch: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: UUID) => Promise<void>;
  addContribution: (goalId: UUID, amount: number, occurredOn: string, note?: string) => Promise<void>;
  deleteContribution: (id: UUID) => Promise<void>;

  addDebt: (
    input: Pick<Debt, 'direction' | 'counterparty' | 'amount' | 'started_on' | 'due_on' | 'goal_id' | 'comment'>,
  ) => Promise<void>;
  updateDebt: (id: UUID, patch: Partial<Debt>) => Promise<void>;
  deleteDebt: (id: UUID) => Promise<void>;
  addDebtPayment: (debtId: UUID, amount: number, paidOn: string, note?: string) => Promise<void>;
  deleteDebtPayment: (id: UUID) => Promise<void>;

  addVacation: (startDate: string, endDate: string, note?: string) => Promise<void>;
  deleteVacation: (id: UUID) => Promise<void>;
}

function defaultProfile(userId: UUID): Profile {
  return {
    id: userId,
    advance_amount: 0,
    salary_amount: 0,
    advance_day: 25,
    salary_day: 10,
    employment_date: null,
    vacation_used_days: 0,
    balance_start: 0,
    balance_as_of: todayISO(),
    onboarded: false,
    created_at: new Date().toISOString(),
  };
}

export const useData = create<DataState>((set, get) => ({
  userId: null,
  snapshot: emptySnapshot(),
  loading: false,
  error: null,

  async load(userId) {
    set({ loading: true, error: null, userId });
    try {
      const snapshot = await repo.getSnapshot(userId);

      // При первом входе создаём базовый набор категорий
      if (snapshot.categories.length === 0) {
        const categories = buildDefaultCategories(userId);
        await repo.insertRows('categories', categories);
        snapshot.categories = categories;
      }
      set({ snapshot, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  reset: () => set({ snapshot: emptySnapshot(), userId: null, error: null }),

  async saveProfile(patch) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const profile: Profile = { ...(snapshot.profile ?? defaultProfile(userId)), ...patch, id: userId };
    await repo.saveProfile(profile);
    set({ snapshot: { ...snapshot, profile } });
  },

  async importStatement(rows, filename) {
    const { userId, snapshot } = get();
    if (!userId) return { added: 0, duplicates: 0 };

    const existing = new Set(snapshot.transactions.map((t) => t.dedup_hash));
    const fresh = rows.filter((row) => !existing.has(row.dedupHash));
    const duplicates = rows.length - fresh.length;

    const run: ImportRun = {
      id: newId(),
      user_id: userId,
      filename,
      imported_at: new Date().toISOString(),
      rows_total: rows.length,
      rows_new: fresh.length,
      rows_duplicate: duplicates,
    };

    const transactions: Transaction[] = fresh.map((row) => ({
      id: newId(),
      user_id: userId,
      occurred_at: row.occurredAt,
      amount: row.amount,
      type: row.type,
      description: row.description,
      counterparty: row.counterparty,
      mcc: row.mcc,
      raw_category: row.rawCategory,
      category_id: guessCategoryId(snapshot.categories, {
        type: row.type,
        description: row.description,
        rawCategory: row.rawCategory,
        mcc: row.mcc,
      }),
      category_manual: false,
      import_id: run.id,
      dedup_hash: row.dedupHash,
      created_at: new Date().toISOString(),
    }));

    await repo.insertRows('imports', [run]);
    if (transactions.length > 0) await repo.insertRows('transactions', transactions);

    set({
      snapshot: {
        ...snapshot,
        imports: [run, ...snapshot.imports],
        transactions: sortTransactions([...snapshot.transactions, ...transactions]),
      },
    });
    return { added: transactions.length, duplicates };
  },

  async undoImport(importId) {
    const { userId, snapshot } = get();
    if (!userId) return;
    await repo.deleteTransactionsByImport(userId, importId);
    await repo.deleteRow('imports', importId);
    set({
      snapshot: {
        ...snapshot,
        transactions: snapshot.transactions.filter((t) => t.import_id !== importId),
        imports: snapshot.imports.filter((i) => i.id !== importId),
      },
    });
  },

  async setTransactionCategory(txId, categoryId) {
    const { snapshot } = get();
    await repo.updateRow('transactions', txId, {
      category_id: categoryId,
      category_manual: true,
    });
    set({
      snapshot: {
        ...snapshot,
        transactions: snapshot.transactions.map((t) =>
          t.id === txId ? { ...t, category_id: categoryId, category_manual: true } : t,
        ),
      },
    });
  },

  async deleteTransaction(txId) {
    const { snapshot } = get();
    await repo.deleteRow('transactions', txId);
    set({
      snapshot: { ...snapshot, transactions: snapshot.transactions.filter((t) => t.id !== txId) },
    });
  },

  async recategorize() {
    const { snapshot } = get();
    const updates = new Map<UUID, UUID | null>();

    for (const tx of snapshot.transactions) {
      if (tx.category_manual) continue;
      const next = guessCategoryId(snapshot.categories, {
        type: tx.type,
        description: tx.description,
        rawCategory: tx.raw_category,
        mcc: tx.mcc,
      });
      if (next !== tx.category_id) updates.set(tx.id, next);
    }

    for (const [id, categoryId] of updates) {
      await repo.updateRow('transactions', id, { category_id: categoryId });
    }

    set({
      snapshot: {
        ...snapshot,
        transactions: snapshot.transactions.map((tx) =>
          updates.has(tx.id) ? { ...tx, category_id: updates.get(tx.id)! } : tx,
        ),
      },
    });
    return updates.size;
  },

  async addCategory(name, kind, color) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const category: Category = {
      id: newId(),
      user_id: userId,
      name,
      kind,
      color,
      keywords: [],
      is_system: false,
    };
    await repo.insertRows('categories', [category]);
    set({ snapshot: { ...snapshot, categories: [...snapshot.categories, category] } });
  },

  async updateCategory(id, patch) {
    const { snapshot } = get();
    await repo.updateRow('categories', id, patch);
    set({
      snapshot: {
        ...snapshot,
        categories: snapshot.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    });
  },

  async deleteCategory(id) {
    const { snapshot } = get();
    // Операции этой категории остаются без категории
    for (const tx of snapshot.transactions.filter((t) => t.category_id === id)) {
      await repo.updateRow('transactions', tx.id, { category_id: null });
    }
    await repo.deleteRow('categories', id);
    set({
      snapshot: {
        ...snapshot,
        categories: snapshot.categories.filter((c) => c.id !== id),
        transactions: snapshot.transactions.map((t) =>
          t.category_id === id ? { ...t, category_id: null } : t,
        ),
      },
    });
  },

  async addGoal(input) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const goal: Goal = {
      id: newId(),
      user_id: userId,
      title: input.title,
      target_amount: input.target_amount,
      saved_amount: input.saved ?? 0,
      deadline: input.deadline,
      archived: false,
      created_at: new Date().toISOString(),
    };
    await repo.insertRows('goals', [goal]);
    set({ snapshot: { ...snapshot, goals: [...snapshot.goals, goal] } });
  },

  async updateGoal(id, patch) {
    const { snapshot } = get();
    await repo.updateRow('goals', id, patch);
    set({
      snapshot: {
        ...snapshot,
        goals: snapshot.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      },
    });
  },

  async deleteGoal(id) {
    const { snapshot } = get();
    for (const contribution of snapshot.contributions.filter((c) => c.goal_id === id)) {
      await repo.deleteRow('goal_contributions', contribution.id);
    }
    // Долги, привязанные к цели, остаются, но отвязываются
    for (const debt of snapshot.debts.filter((d) => d.goal_id === id)) {
      await repo.updateRow('debts', debt.id, { goal_id: null });
    }
    await repo.deleteRow('goals', id);
    set({
      snapshot: {
        ...snapshot,
        goals: snapshot.goals.filter((g) => g.id !== id),
        contributions: snapshot.contributions.filter((c) => c.goal_id !== id),
        debts: snapshot.debts.map((d) => (d.goal_id === id ? { ...d, goal_id: null } : d)),
      },
    });
  },

  async addContribution(goalId, amount, occurredOn, note) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const goal = snapshot.goals.find((g) => g.id === goalId);
    if (!goal) return;

    const contribution: GoalContribution = {
      id: newId(),
      user_id: userId,
      goal_id: goalId,
      amount,
      occurred_on: occurredOn,
      note: note ?? null,
    };
    const savedAmount = Math.max(goal.saved_amount + amount, 0);

    await repo.insertRows('goal_contributions', [contribution]);
    await repo.updateRow('goals', goalId, { saved_amount: savedAmount });

    set({
      snapshot: {
        ...snapshot,
        contributions: [...snapshot.contributions, contribution],
        goals: snapshot.goals.map((g) =>
          g.id === goalId ? { ...g, saved_amount: savedAmount } : g,
        ),
      },
    });
  },

  async deleteContribution(id) {
    const { snapshot } = get();
    const contribution = snapshot.contributions.find((c) => c.id === id);
    if (!contribution) return;
    const goal = snapshot.goals.find((g) => g.id === contribution.goal_id);
    const savedAmount = goal ? Math.max(goal.saved_amount - contribution.amount, 0) : 0;

    await repo.deleteRow('goal_contributions', id);
    if (goal) await repo.updateRow('goals', goal.id, { saved_amount: savedAmount });

    set({
      snapshot: {
        ...snapshot,
        contributions: snapshot.contributions.filter((c) => c.id !== id),
        goals: snapshot.goals.map((g) => (g.id === goal?.id ? { ...g, saved_amount: savedAmount } : g)),
      },
    });
  },

  async addDebt(input) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const debt: Debt = {
      id: newId(),
      user_id: userId,
      created_at: new Date().toISOString(),
      ...input,
    };
    await repo.insertRows('debts', [debt]);
    set({ snapshot: { ...snapshot, debts: [...snapshot.debts, debt] } });
  },

  async updateDebt(id, patch) {
    const { snapshot } = get();
    await repo.updateRow('debts', id, patch);
    set({
      snapshot: {
        ...snapshot,
        debts: snapshot.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      },
    });
  },

  async deleteDebt(id) {
    const { snapshot } = get();
    for (const payment of snapshot.debtPayments.filter((p) => p.debt_id === id)) {
      await repo.deleteRow('debt_payments', payment.id);
    }
    await repo.deleteRow('debts', id);
    set({
      snapshot: {
        ...snapshot,
        debts: snapshot.debts.filter((d) => d.id !== id),
        debtPayments: snapshot.debtPayments.filter((p) => p.debt_id !== id),
      },
    });
  },

  async addDebtPayment(debtId, amount, paidOn, note) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const payment: DebtPayment = {
      id: newId(),
      user_id: userId,
      debt_id: debtId,
      amount,
      paid_on: paidOn,
      note: note ?? null,
    };
    await repo.insertRows('debt_payments', [payment]);
    set({ snapshot: { ...snapshot, debtPayments: [...snapshot.debtPayments, payment] } });
  },

  async deleteDebtPayment(id) {
    const { snapshot } = get();
    await repo.deleteRow('debt_payments', id);
    set({
      snapshot: { ...snapshot, debtPayments: snapshot.debtPayments.filter((p) => p.id !== id) },
    });
  },

  async addVacation(startDate, endDate, note) {
    const { userId, snapshot } = get();
    if (!userId) return;
    const plan: VacationPlan = {
      id: newId(),
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      note: note ?? null,
    };
    await repo.insertRows('vacation_plans', [plan]);
    set({ snapshot: { ...snapshot, vacations: [...snapshot.vacations, plan] } });
  },

  async deleteVacation(id) {
    const { snapshot } = get();
    await repo.deleteRow('vacation_plans', id);
    set({ snapshot: { ...snapshot, vacations: snapshot.vacations.filter((v) => v.id !== id) } });
  },
}));
