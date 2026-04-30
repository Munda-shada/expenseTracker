'use client'

import { useModalDismiss } from '@/lib/useModalDismiss'

interface Props {
  input: string
  onLog: () => void
  onQuery: () => void
  onCancel: () => void
}

export default function DisambiguationModal({
  input,
  onLog,
  onQuery,
  onCancel,
}: Props) {
  const { requestClose, backdropProps } = useModalDismiss({ onClose: onCancel })

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" {...backdropProps}>
      <div className="bg-white w-full max-w-120 rounded-t-2xl pb-6">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-4 pt-3 pb-4">
          {/* Close */}
          <div className="flex justify-end mb-2">
            <button onClick={requestClose} className="text-gray-400 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Input preview */}
          <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4">
            <p className="text-xs text-gray-400 mb-0.5">Your input</p>
            <p className="text-sm text-gray-700 font-medium">"{input}"</p>
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
            Did you mean:
          </p>

          <div className="space-y-2">
            <button
              onClick={onLog}
              className="w-full flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
            >
              <span className="text-2xl">📝</span>
              <div>
                <p className="text-sm font-semibold text-indigo-700">Log an expense</p>
                <p className="text-xs text-indigo-400 mt-0.5">
                  Record this as a new entry
                </p>
              </div>
            </button>

            <button
              onClick={onQuery}
              className="w-full flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
            >
              <span className="text-2xl">💬</span>
              <div>
                <p className="text-sm font-semibold text-purple-700">
                  Query my spending
                </p>
                <p className="text-xs text-purple-400 mt-0.5">
                  Show stats or find entries
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
