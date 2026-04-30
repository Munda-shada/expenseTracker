import { Category } from './types'
import { normalizeHinglish } from './hinglish'

const TRANSPORT_KEYWORDS = [
  'auto',
  'rickshaw',
  'cab',
  'uber',
  'ola',
  'taxi',
  'bus',
  'train',
  'metro',
  'petrol',
  'fuel',
]

const CONTEXT_TAG_KEYWORDS: Record<string, string[]> = {
  badminton: ['badminton', 'shuttle'],
  cricket: ['cricket'],
  gym: ['gym', 'workout'],
  sports: ['sports'],
  movie: ['movie', 'cinema'],
  netflix: ['netflix'],
  chai: ['chai'],
  coffee: ['coffee'],
  nashta: ['nashta'],
  khana: ['khana'],
  kirana: ['kirana'],
  sabzi: ['sabzi'],
  dawai: ['dawai', 'dawa', 'dava'],
}

export function normalizeTag(raw: string): string | null {
  const normalized = raw
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (normalized.length < 2 || normalized.length > 30) return null
  return normalized
}

export function getExplicitTags(input: string): string[] {
  return Array.from(input.matchAll(/#([a-z0-9][a-z0-9-_]*)/gi))
    .map((match) => normalizeTag(match[1]))
    .filter((tag): tag is string => Boolean(tag))
}

export function hasTransportContext(input: string): boolean {
  const lower = input.toLowerCase()
  return TRANSPORT_KEYWORDS.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower))
}

export function refineCategoryIdsForInput(
  rawInput: string,
  categories: Category[],
  categoryIds: string[]
): string[] {
  const activeIds = new Set(categories.filter((category) => !category.archived).map((category) => category.id))
  const travel = categories.find((category) => category.id === 'cat-travel' && !category.archived)
  if (!travel || !hasTransportContext(rawInput)) {
    return categoryIds.filter((id) => activeIds.has(id))
  }

  const nextIds = categoryIds.filter((id) => activeIds.has(id) && id !== 'cat-sports')
  if (!nextIds.includes(travel.id)) nextIds.unshift(travel.id)
  return nextIds.length > 0 ? nextIds : [travel.id]
}

export function inferEntryTags(
  rawInput: string,
  categories: Category[],
  categoryIds: string[],
  existingTags: string[] = []
): string[] {
  const lower = normalizeHinglish(rawInput)
  const tags = new Set<string>()

  for (const tag of [...existingTags, ...getExplicitTags(rawInput)]) {
    const normalized = normalizeTag(tag)
    if (normalized) tags.add(normalized)
  }

  for (const categoryId of categoryIds) {
    const category = categories.find((item) => item.id === categoryId && !item.archived)
    const normalized = category ? normalizeTag(category.name) : null
    if (normalized) tags.add(normalized)
  }

  for (const [tag, keywords] of Object.entries(CONTEXT_TAG_KEYWORDS)) {
    if (keywords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower))) {
      tags.add(tag)
    }
  }

  if (hasTransportContext(rawInput)) tags.add('travel')

  return Array.from(tags).slice(0, 8)
}
