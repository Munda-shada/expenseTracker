import { Category, ConfidenceLevel, EntryType, PaymentMethod } from './types'
import { getExplicitTags, inferEntryTags, refineCategoryIdsForInput } from './tagUtils'
import { getTodayString, getYesterdayString } from './utils'
import {
  HINGLISH_INCOME_WORDS,
  HINGLISH_YESTERDAY_WORDS,
  includesAnyWord,
  normalizeHinglish,
  stripHinglishFiller,
} from './hinglish'
import { getEntryPaymentMethod } from './paymentMethods'

export interface LocalParsedEntry {
  type: EntryType
  amount: number
  categoryIds: string[]
  paymentMethod: PaymentMethod
  date: string
  note: string
  tags: string[]
  confidence: ConfidenceLevel
}

const INCOME_WORDS = [
  'salary',
  'received',
  'income',
  'bonus',
  'freelance',
  'paid me',
  ...HINGLISH_INCOME_WORDS,
]

function normalize(value: string) {
  return normalizeHinglish(value)
}

function findCategory(input: string, categories: Category[]) {
  const lower = normalize(input)
  const direct = categories.find((category) =>
    !category.archived && lower.includes(category.name.toLowerCase())
  )
  if (direct) return direct.id

  const keywordMap: Record<string, string[]> = {
    'cat-food': ['chai', 'tea', 'coffee', 'lunch', 'dinner', 'breakfast', 'snack', 'food', 'nashta', 'khana', 'sabzi', 'kirana', 'groceries', 'grocery'],
    'cat-travel': ['auto', 'cab', 'uber', 'ola', 'petrol', 'fuel', 'bus', 'train', 'travel'],
    'cat-shopping': ['shopping', 'amazon', 'flipkart', 'clothes', 'shirt'],
    'cat-health': ['doctor', 'medicine', 'medical', 'pharmacy', 'health', 'dawai', 'dawa', 'dava'],
    'cat-entertainment': ['movie', 'netflix', 'game', 'entertainment'],
    'cat-bills': ['bill', 'electricity', 'bijli', 'wifi', 'rent', 'mobile', 'recharge', 'mobile recharge'],
    'cat-sports': ['badminton', 'gym', 'sports', 'cricket'],
    'cat-salary': ['salary', 'income', 'salary aayi', 'salary aya'],
    'cat-freelance': ['freelance', 'client', 'paise mile'],
  }

  for (const [categoryId, keywords] of Object.entries(keywordMap)) {
    if (categories.some((category) => category.id === categoryId) && keywords.some((word) => lower.includes(word))) {
      return categoryId
    }
  }

  return categories.find((category) => category.id === 'cat-other' && !category.archived)?.id
    ?? categories.find((category) => !category.archived)?.id
    ?? 'cat-other'
}

export function parseLocalEntry(rawInput: string, categories: Category[]): LocalParsedEntry | null {
  const input = rawInput.trim()
  if (!input) return null

  const amountMatch = input.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i)
  if (!amountMatch) return null

  const amount = Number(amountMatch[1])
  if (!Number.isFinite(amount) || amount <= 0) return null

  const lower = normalize(input)
  const type: EntryType = includesAnyWord(lower, INCOME_WORDS) ? 'income' : 'expense'
  const explicitTags = getExplicitTags(input)
  const note = input
    .replace(amountMatch[0], '')
    .replace(/spent|paid|for|on|rs\.?|₹/gi, '')
    .replace(/\b(salary aayi|salary aya|paise mile|paise mila|mila|mile|aaya|aayi|aya|ayi)\b/gi, '')
    .replace(/#([a-z0-9][a-z0-9-_]*)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const cleanedNote = stripHinglishFiller(note).slice(0, 100)

  const categoryIds = refineCategoryIdsForInput(input, categories, [findCategory(input, categories)])

  return {
    type,
    amount,
    categoryIds,
    paymentMethod: getEntryPaymentMethod(input),
    date: includesAnyWord(lower, HINGLISH_YESTERDAY_WORDS)
      ? getYesterdayString()
      : getTodayString(),
    note: cleanedNote || note || (type === 'income' ? 'Income' : 'Expense'),
    tags: inferEntryTags(input, categories, categoryIds, explicitTags),
    confidence: 'medium',
  }
}
