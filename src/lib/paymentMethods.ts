import { DEFAULT_PAYMENT_METHOD, PaymentMethod } from './types'

export function inferPaymentMethod(input: string): PaymentMethod | null {
  const text = input.toLowerCase()

  if (/\b(icici|amazon pay icici)\b/.test(text) && /\b(card|credit)\b/.test(text)) {
    return 'icici-credit-card'
  }
  if (/\b(sbi)\b/.test(text) && /\b(card|credit)\b/.test(text)) {
    return 'sbi-credit-card'
  }
  if (/\b(credit card|cc)\b/.test(text)) return 'sbi-credit-card'
  if (/\b(debit card|atm card)\b/.test(text)) return 'debit-card'
  if (/\b(cash|paise diye|cash diya)\b/.test(text)) return 'cash'
  if (/\b(upi|gpay|google pay|phonepe|paytm upi|bhim)\b/.test(text)) return 'upi'
  if (/\b(bank transfer|neft|imps|rtgs|transfer)\b/.test(text)) return 'bank-transfer'
  if (/\b(wallet|paytm wallet|amazon pay|mobikwik)\b/.test(text)) return 'wallet'

  return null
}

export function getEntryPaymentMethod(input: string, fallback: PaymentMethod = DEFAULT_PAYMENT_METHOD) {
  return inferPaymentMethod(input) ?? fallback
}
