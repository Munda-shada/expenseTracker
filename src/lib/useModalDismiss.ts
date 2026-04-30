import { MouseEvent, useCallback, useEffect, useRef } from 'react'

interface Options {
  isOpen?: boolean
  isDirty?: boolean
  onClose: () => void
}

export function useModalDismiss({ isOpen = true, isDirty = false, onClose }: Options) {
  const pushedModalStateRef = useRef(false)
  const closingRef = useRef(false)

  const closeModal = useCallback((fromPopState: boolean) => {
    if (closingRef.current) return

    if (isDirty && !window.confirm('Changes discard karne hain?')) {
      if (fromPopState) {
        window.history.pushState({ modal: true }, '')
        pushedModalStateRef.current = true
      }
      return
    }

    closingRef.current = true
    onClose()

    if (!fromPopState && pushedModalStateRef.current && window.history.state?.modal) {
      pushedModalStateRef.current = false
      window.history.back()
    }
  }, [isDirty, onClose])

  const requestClose = useCallback(() => closeModal(false), [closeModal])

  useEffect(() => {
    if (!isOpen) return

    window.history.pushState({ modal: true }, '')
    pushedModalStateRef.current = true
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    const handlePopState = () => closeModal(true)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [closeModal, isOpen, requestClose])

  return {
    requestClose,
    backdropProps: {
      onClick: (event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) requestClose()
      },
    },
  }
}
