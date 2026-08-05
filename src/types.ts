export type UUID = string;

/** Профиль пользователя — заполняется в онбординге. */
export interface Profile {
  id: UUID;
  /** Сумма аванса, ₽ */
  advance_amount: number;
  /** Сумма зарплаты, ₽ */
  salary_amount: number;
  /** День месяца, когда приходит аванс (1–31); игнорируется, если advance_is_last_day */
  advance_day: number;
  /** День месяца, когда приходит зарплата (1–31); игнорируется, если salary_is_last_day */
  salary_day: number;
  /** Аванс приходит в последний день месяца */
  advance_is_last_day: boolean;
  /** Зарплата приходит в последний день месяца */
  salary_is_last_day: boolean;
  /** Если выплата попадает на выходной — переносить на предшествующий рабочий день */
  shift_weekend_payouts: boolean;
  /** Дата трудоустройства (ISO, YYYY-MM-DD) */
  employment_date: string | null;
  /** Уже использовано дней отпуска */
  vacation_used_days: number;
  /** @deprecated Остаток переехал в accounts — поле осталось ради переноса старых данных */
  balance_start: number;
  /** @deprecated см. balance_start */
  balance_as_of: string;
  /** Онбординг пройден */
  onboarded: boolean;
  created_at: string;
}

export type AccountKind = 'card' | 'savings' | 'deposit' | 'cash' | 'credit';

/**
 * Счёт в банке (или наличные). Баланс считается по каждому счёту отдельно:
 * у каждого свой «остаток на момент», потому что выписки приходят из разных банков
 * и в разное время.
 */
export interface Account {
  id: UUID;
  user_id: UUID;
  /** Название: «Т-Банк, основная», «Сбер, зарплатная» */
  name: string;
  /** Банк — используется для автоподбора счёта при импорте выписки */
  bank: string;
  kind: AccountKind;
  balance_start: number;
  /** Момент, на который указан balance_start (ISO datetime) */
  balance_as_of: string;
  /** Счёт по умолчанию: на него подставляется импорт, если банк не определился */
  is_primary: boolean;
  archived: boolean;
  created_at: string;
}

export type TxType = 'income' | 'expense';

export interface Category {
  id: UUID;
  user_id: UUID;
  name: string;
  kind: TxType;
  color: string;
  /** Ключевые слова для автокатегоризации (нижний регистр) */
  keywords: string[];
  is_system: boolean;
}

export interface Transaction {
  id: UUID;
  user_id: UUID;
  /** Счёт, по которому прошла операция */
  account_id: UUID | null;
  /** Дата и время операции, ISO */
  occurred_at: string;
  /** Всегда положительное число, знак определяется полем type */
  amount: number;
  type: TxType;
  description: string;
  counterparty: string | null;
  mcc: string | null;
  /** Категория из выписки банка (как есть) */
  raw_category: string | null;
  /** Наша категория */
  category_id: UUID | null;
  /** true, если категорию поставил пользователь вручную (автокатегоризация её не трогает) */
  category_manual: boolean;
  /**
   * Перевод между своими счетами. Деньги не приходят и не уходят, поэтому такие операции
   * не влияют ни на баланс, ни на статистику доходов/расходов, ни на рейтинг.
   */
  is_transfer: boolean;
  import_id: UUID | null;
  /** Хэш для дедупликации повторных импортов */
  dedup_hash: string;
  created_at: string;
}

export interface ImportRun {
  id: UUID;
  user_id: UUID;
  /** Счёт, в который загружали выписку */
  account_id: UUID | null;
  filename: string;
  imported_at: string;
  rows_total: number;
  rows_new: number;
  rows_duplicate: number;
}

export interface Goal {
  id: UUID;
  user_id: UUID;
  title: string;
  target_amount: number;
  /** Отложено «своими» деньгами (сумма всех пополнений) */
  saved_amount: number;
  /** Дедлайн, ISO YYYY-MM-DD */
  deadline: string;
  archived: boolean;
  created_at: string;
}

export interface GoalContribution {
  id: UUID;
  user_id: UUID;
  goal_id: UUID;
  amount: number;
  occurred_on: string;
  note: string | null;
}

/** i_owe — я должен; owed_to_me — мне должны */
export type DebtDirection = 'i_owe' | 'owed_to_me';
export type DebtStatus = 'open' | 'partial' | 'closed';

export interface Debt {
  id: UUID;
  user_id: UUID;
  direction: DebtDirection;
  counterparty: string;
  amount: number;
  /** Дата возникновения долга, ISO */
  started_on: string;
  /** Срок возврата (может отсутствовать) */
  due_on: string | null;
  /** Долг может быть привязан к цели */
  goal_id: UUID | null;
  comment: string | null;
  created_at: string;
}

export interface DebtPayment {
  id: UUID;
  user_id: UUID;
  debt_id: UUID;
  amount: number;
  paid_on: string;
  note: string | null;
}

export interface VacationPlan {
  id: UUID;
  user_id: UUID;
  start_date: string;
  end_date: string;
  note: string | null;
}

/** Полный снимок данных пользователя, с которым работает UI. */
export interface Snapshot {
  profile: Profile | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  imports: ImportRun[];
  goals: Goal[];
  contributions: GoalContribution[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  vacations: VacationPlan[];
}
