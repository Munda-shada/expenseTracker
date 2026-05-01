'use client'

import { PAYMENT_METHOD_OPTIONS, PaymentMethod } from '@/lib/types'

interface Props {
  value: PaymentMethod | null
  onChange: (method: PaymentMethod) => void
  compact?: boolean
}

export default function PaymentMethodInput({ value, onChange, compact = false }: Props) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Payment Method
      </p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {PAYMENT_METHOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${
              value === option.value
                ? 'bg-indigo-500 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
