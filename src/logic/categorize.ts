import { newId } from '../data/repo';
import type { Category, TxType, UUID } from '../types';

interface CategorySeed {
  name: string;
  kind: TxType;
  color: string;
  keywords: string[];
  /** Диапазоны MCC-кодов, [от, до] включительно */
  mcc?: Array<[number, number]>;
}

/**
 * Базовый набор категорий. Ключевые слова подобраны под описания операций Т-Банка
 * (поля «Описание» и «Категория» из выписки), MCC — под стандартные диапазоны.
 */
export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: 'Продукты',
    kind: 'expense',
    color: '#22c55e',
    keywords: [
      'супермаркет',
      'продукт',
      'пятероч',
      'магнит',
      'лента',
      'перекрест',
      'ашан',
      'вкусвилл',
      'дикси',
      'верный',
      'окей',
      'metro',
      'спар',
      'самокат',
      'купер',
      'сбермаркет',
      'ярче',
      'красное и белое',
      'бристоль',
      'фикс прайс',
    ],
    mcc: [
      [5411, 5411],
      [5422, 5451],
      [5462, 5499],
    ],
  },
  {
    name: 'Кафе и рестораны',
    kind: 'expense',
    color: '#f97316',
    keywords: [
      'ресторан',
      'кафе',
      'фастфуд',
      'кофе',
      'coffee',
      'starbucks',
      'шоколадниц',
      'вкусно и точка',
      'kfc',
      'burger',
      'додо',
      'пицц',
      'суши',
      'бар ',
      'столов',
      'delivery club',
      'яндекс.еда',
      'яндекс еда',
      'фуд',
    ],
    mcc: [[5811, 5814]],
  },
  {
    name: 'Транспорт',
    kind: 'expense',
    color: '#3b82f6',
    keywords: [
      'такси',
      'taxi',
      'яндекс go',
      'яндекс.go',
      'ситимобил',
      'метро',
      'тройка',
      'подорожник',
      'мосгортранс',
      'ржд',
      'аэрофлот',
      'победа',
      's7',
      'каршеринг',
      'делимобиль',
      'belka',
      'самокат аренда',
      'whoosh',
      'юрент',
      'парковк',
      'азс',
      'лукойл',
      'газпромнефть',
      'роснефть',
      'татнефть',
      'shell',
      'заправ',
      'топлив',
    ],
    mcc: [
      [4111, 4131],
      [4121, 4121],
      [4511, 4511],
      [5541, 5542],
      [7523, 7523],
    ],
  },
  {
    name: 'Подписки и сервисы',
    kind: 'expense',
    color: '#a855f7',
    keywords: [
      'подписк',
      'яндекс плюс',
      'яндекс.плюс',
      'кинопоиск',
      'spotify',
      'netflix',
      'youtube',
      'apple.com',
      'itunes',
      'google',
      'icloud',
      'vk музыка',
      'ivi',
      'okko',
      'wink',
      'megogo',
      'литрес',
      'telegram premium',
      'chatgpt',
      'openai',
      'notion',
      'figma',
      'jetbrains',
      'github',
    ],
    mcc: [
      [5815, 5818],
      [7372, 7372],
    ],
  },
  {
    name: 'Развлечения',
    kind: 'expense',
    color: '#ec4899',
    keywords: [
      'кино',
      'театр',
      'концерт',
      'музей',
      'клуб',
      'боулинг',
      'квест',
      'парк развлеч',
      'аттракцион',
      'steam',
      'playstation',
      'xbox',
      'игр',
      'букмекер',
      'развлеч',
    ],
    mcc: [
      [7832, 7841],
      [7911, 7996],
      [7997, 7999],
    ],
  },
  {
    name: 'Здоровье',
    kind: 'expense',
    color: '#14b8a6',
    keywords: [
      'аптек',
      'клиник',
      'больниц',
      'поликлин',
      'стоматол',
      'анализ',
      'инвитро',
      'гемотест',
      'здоровь',
      'медиц',
      'оптик',
      'доктор',
    ],
    mcc: [
      [4119, 4119],
      [5912, 5912],
      [5975, 5976],
      [8011, 8099],
    ],
  },
  {
    name: 'Одежда и красота',
    kind: 'expense',
    color: '#f43f5e',
    keywords: [
      'одежд',
      'обувь',
      'zara',
      'uniqlo',
      'спортмастер',
      'декатлон',
      'lamoda',
      'wildberries',
      'ozon',
      'золото',
      'ювелир',
      'парикмахер',
      'барбер',
      'салон красоты',
      'маникюр',
      'летуаль',
      'рив гош',
      'магнит косметик',
      'подружка',
      'косметик',
    ],
    mcc: [
      [5611, 5699],
      [5940, 5949],
      [5977, 5977],
      [7230, 7298],
    ],
  },
  {
    name: 'Связь и интернет',
    kind: 'expense',
    color: '#0ea5e9',
    keywords: [
      'мтс',
      'билайн',
      'мегафон',
      'tele2',
      'теле2',
      'yota',
      'ростелеком',
      'связь',
      'интернет',
      'моб. связь',
      'мобильная связь',
    ],
    mcc: [[4812, 4816]],
  },
  {
    name: 'ЖКХ и дом',
    kind: 'expense',
    color: '#84cc16',
    keywords: [
      'жкх',
      'коммунал',
      'квартплат',
      'электроэнерг',
      'энергосбыт',
      'водоканал',
      'газпром межрегион',
      'управляющая компания',
      'капремонт',
      'аренда кварт',
      'найм',
      'леруа',
      'оби',
      'касторама',
      'петрович',
      'икеа',
      'ikea',
      'хозтовар',
      'мебель',
    ],
    mcc: [
      [4900, 4900],
      [5200, 5271],
      [5712, 5719],
    ],
  },
  {
    name: 'Образование',
    kind: 'expense',
    color: '#6366f1',
    keywords: [
      'образован',
      'обучен',
      'курс',
      'школ',
      'универс',
      'институт',
      'колледж',
      'skillbox',
      'нетолог',
      'яндекс практикум',
      'geekbrains',
      'coursera',
      'udemy',
      'репетитор',
      'учеб',
    ],
    mcc: [[8211, 8299]],
  },
  {
    name: 'Путешествия',
    kind: 'expense',
    color: '#06b6d4',
    keywords: [
      'отель',
      'hotel',
      'booking',
      'островок',
      'ostrovok',
      'авиабилет',
      'тур',
      'хостел',
      'аэропорт',
      'туту',
      'tutu',
      'aviasales',
    ],
    mcc: [
      [3000, 3999],
      [4722, 4722],
      [7011, 7011],
    ],
  },
  {
    name: 'Переводы',
    kind: 'expense',
    color: '#94a3b8',
    keywords: [
      'перевод',
      'сбп',
      'p2p',
      'card2card',
      'на карту',
      'пополнение другого',
      'частному лицу',
    ],
    mcc: [
      [4829, 4829],
      [6012, 6012],
      [6051, 6051],
      [6536, 6540],
    ],
  },
  {
    name: 'Наличные',
    kind: 'expense',
    color: '#64748b',
    keywords: ['снятие', 'банкомат', 'atm', 'выдача наличных'],
    mcc: [[6010, 6011]],
  },
  {
    name: 'Комиссии и проценты',
    kind: 'expense',
    color: '#78716c',
    keywords: ['комисс', 'обслуживание счета', 'обслуживание карты', 'штраф', 'пени', 'процент по кредит'],
  },
  { name: 'Другое', kind: 'expense', color: '#cbd5e1', keywords: [] },

  {
    name: 'Зарплата',
    kind: 'income',
    color: '#16a34a',
    keywords: ['зарплат', 'аванс', 'заработная плата', 'оклад', 'премия', 'отпускные'],
  },
  {
    name: 'Кэшбэк и проценты',
    kind: 'income',
    color: '#10b981',
    keywords: ['кэшбэк', 'кешбэк', 'cashback', 'процент на остаток', 'бонус'],
  },
  {
    name: 'Переводы входящие',
    kind: 'income',
    color: '#34d399',
    keywords: ['перевод', 'сбп', 'пополнение', 'от '],
  },
  { name: 'Прочие доходы', kind: 'income', color: '#a7f3d0', keywords: [] },
];

export function buildDefaultCategories(userId: UUID): Category[] {
  return CATEGORY_SEEDS.map((seed) => ({
    id: newId(),
    user_id: userId,
    name: seed.name,
    kind: seed.kind,
    color: seed.color,
    keywords: seed.keywords,
    is_system: true,
  }));
}

const FALLBACK: Record<TxType, string> = { expense: 'Другое', income: 'Прочие доходы' };

function mccMatches(mcc: string | null, name: string): boolean {
  if (!mcc) return false;
  const code = Number(mcc);
  if (!Number.isFinite(code)) return false;
  const seed = CATEGORY_SEEDS.find((s) => s.name === name);
  return (seed?.mcc ?? []).some(([from, to]) => code >= from && code <= to);
}

/**
 * Подбирает категорию для операции.
 * Приоритет: MCC-код → ключевые слова в описании/категории банка → фолбэк.
 */
export function guessCategoryId(
  categories: Category[],
  input: { type: TxType; description: string; rawCategory: string | null; mcc: string | null },
): UUID | null {
  const pool = categories.filter((c) => c.kind === input.type);
  if (pool.length === 0) return null;

  const byMcc = pool.find((c) => mccMatches(input.mcc, c.name));
  if (byMcc) return byMcc.id;

  const haystack = `${input.rawCategory ?? ''} ${input.description}`.toLowerCase();
  let best: { id: UUID; weight: number } | null = null;
  for (const category of pool) {
    for (const keyword of category.keywords) {
      const kw = keyword.toLowerCase().trim();
      if (kw.length < 3) continue;
      if (haystack.includes(kw) && (!best || kw.length > best.weight)) {
        best = { id: category.id, weight: kw.length };
      }
    }
  }
  if (best) return best.id;

  return pool.find((c) => c.name === FALLBACK[input.type])?.id ?? pool[pool.length - 1].id;
}
