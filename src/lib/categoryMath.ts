import { Entry, Settings } from './types'

export function getCategoryAmountForMode(
  entry: Entry,
  categoryId: string,
  mode: Settings['multiCategoryMode']
): number {
  if (!entry.categoryIds.includes(categoryId)) return 0
  if (mode === 'split' && entry.categoryIds.length > 0) {
    return entry.amount / entry.categoryIds.length
  }
  return entry.amount
}
