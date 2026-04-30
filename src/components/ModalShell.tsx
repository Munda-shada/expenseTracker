'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  backdropProps?: HTMLAttributes<HTMLDivElement>
  children: ReactNode
  footer?: ReactNode
  headerEnd?: ReactNode
  bodyClassName?: string
}

export default function ModalShell({
  title,
  onClose,
  backdropProps,
  children,
  footer,
  headerEnd,
  bodyClassName = 'px-4 py-4 space-y-4',
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 pt-4"
      {...backdropProps}
    >
      <div className="flex max-h-[calc(100dvh-0.75rem)] min-h-0 w-full max-w-120 flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-1 text-gray-400"
              aria-label={`Close ${title}`}
            >
              <X className="h-5 w-5" />
            </button>
            <p className="font-semibold text-gray-800">{title}</p>
            <div className="flex min-w-7 justify-end">{headerEnd}</div>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
