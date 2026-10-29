import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, formatRelative } from '../hooks/useNotifications'
import Icon from './ui/Icon'

// Leading icon per notification type, tinted by severity
const TYPE_ICON = { threshold: 'warning', actuator: 'water_drop', daily: 'bedtime' }
const SEVERITY = {
  info:     'bg-secondary-container text-on-secondary-container',
  warn:     'bg-warning-container text-on-warning-container',
  critical: 'bg-error-container text-on-error-container',
}

export default function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const openRow = (n) => {
    markRead(n.id)
    setOpen(false)
    if (n.zoneId) navigate(`/zones/${n.zoneId}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="icon-btn" aria-label="Notifications" aria-expanded={open}>
        <Icon name="notifications" filled={open} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-error text-on-error text-label-sm flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-96 max-w-[90vw] bg-surface-container rounded-xl shadow-elevation-2 z-50 overflow-hidden">
          <div className="flex items-center justify-between pl-4 pr-2 h-14">
            <p className="text-title-md text-on-surface">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="btn-text">Mark all as read</button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto pb-2">
            {items.length === 0 ? (
              <p className="text-body-md text-on-surface-variant text-center py-10">You’re all caught up.</p>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => openRow(n)}
                  className={`state-layer w-full text-left flex gap-4 px-4 py-3 ${n.isRead ? '' : 'bg-secondary-container/40'}`}
                >
                  <span className={`shrink-0 w-10 h-10 rounded-full grid place-items-center ${SEVERITY[n.severity] ?? SEVERITY.info}`}>
                    <Icon name={TYPE_ICON[n.type] ?? 'info'} size={20} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className={`flex-1 text-body-lg truncate ${n.isRead ? 'text-on-surface-variant' : 'text-on-surface font-medium'}`}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-label-sm text-on-surface-variant">{formatRelative(n.createdAt)}</span>
                    </span>
                    <span className="block text-body-md text-on-surface-variant line-clamp-2">{n.message}</span>
                  </span>
                  {!n.isRead && <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
