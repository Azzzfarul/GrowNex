import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

function useEscape(onClose, busy) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])
}

// Moves focus into the modal on open (unless a child already took it with autoFocus) and gives it
// back to whatever had it on close. The previous element is read during the first render: autoFocus
// runs before effects, so the effect would already see the autofocused input.
function useModalFocus() {
  const ref = useRef(null)
  const prev = useRef(document.activeElement)
  useEffect(() => {
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus()
    const target = prev.current
    return () => { if (target instanceof HTMLElement && target.isConnected) target.focus() }
  }, [])
  return ref
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-4xl' }

// M3 basic dialog: optional hero icon, headline, scrolling content, right-aligned actions.
// Clicking the scrim or pressing Escape closes it unless `busy`.
export default function Dialog({ title, icon, children, actions, onClose, size = 'sm', busy = false }) {
  useEscape(onClose, busy)
  const titleId = useId()
  const ref = useModalFocus()
  return createPortal(
    <div className="scrim grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`dialog w-full ${WIDTH[size]} max-h-[90vh] flex flex-col outline-none`}>
        <div className={`px-6 pt-6 pb-4 ${icon ? 'text-center' : ''}`}>
          {icon && <Icon name={icon} className="text-secondary mb-4" />}
          <h2 id={titleId} className="text-headline-sm text-on-surface">{title}</h2>
        </div>
        <div className="px-6 overflow-y-auto text-body-md text-on-surface-variant">{children}</div>
        {actions && <div className="flex justify-end gap-2 px-6 pt-6 pb-6">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

// M3 modal side sheet: slides in from the right, for detail views that keep the page in context.
export function Sheet({ title, onClose, headerActions, actions, children, busy = false }) {
  useEscape(onClose, busy)
  const titleId = useId()
  const ref = useModalFocus()
  return createPortal(
    <>
      <div className="scrim" onMouseDown={() => !busy && onClose?.()} />
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sheet outline-none">
        <div className="flex items-center gap-1 h-16 pl-6 pr-3 shrink-0">
          <h2 id={titleId} className="flex-1 text-title-lg text-on-surface truncate">{title}</h2>
          {headerActions}
          <button onClick={onClose} className="icon-btn" aria-label="Close" data-tip="Close"><Icon name="close" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {actions && <div className="flex justify-end gap-2 px-6 py-4 border-t border-outline-variant shrink-0">{actions}</div>}
      </aside>
    </>,
    document.body,
  )
}
