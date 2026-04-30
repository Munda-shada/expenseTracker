export const HINGLISH_SPEND_WORDS = [
  'kharch',
  'expense',
  'kharach',
  'diya',
  'diye',
  'paid',
  'liye',
  'liya',
  'pe',
  'par',
  'mein',
  'me',
  'ka',
  'ke',
  'ke liye',
]

export const HINGLISH_INCOME_WORDS = [
  'mila',
  'mile',
  'aaya',
  'aayi',
  'aya',
  'ayi',
  'salary aayi',
  'salary aya',
  'paise mile',
  'paise mila',
]

export const HINGLISH_YESTERDAY_WORDS = ['kal', 'yesterday']

export const HINGLISH_QUERY_STARTERS = [
  'kitna',
  'kitne',
  'dikhao',
  'dikhado',
  'batao',
  'btao',
  'kya',
  'kab',
  'kahan',
  'kaun',
  'is mahine',
  'iss mahine',
  'pichle mahine',
  'last month',
  'aaj',
  'kal',
]

export function normalizeHinglish(input: string) {
  return input.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function hasWord(input: string, word: string) {
  return new RegExp(`(^|\\s)${word.replace(/\s+/g, '\\s+')}(?=\\s|$)`, 'i').test(input)
}

export function includesAnyWord(input: string, words: string[]) {
  const normalized = normalizeHinglish(input)
  return words.some((word) => hasWord(normalized, word))
}

export function stripHinglishFiller(input: string) {
  return input
    .replace(/\b(expense|kharch|kharach|diya|diye|liye|liya|pe|par|mein|me|ka|ke liye|ke|aaj|kal)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksHinglish(input: string) {
  return includesAnyWord(input, [
    ...HINGLISH_SPEND_WORDS,
    ...HINGLISH_INCOME_WORDS,
    ...HINGLISH_QUERY_STARTERS,
    'hua',
    'gaya',
    'aaya',
    'aayi',
  ])
}
