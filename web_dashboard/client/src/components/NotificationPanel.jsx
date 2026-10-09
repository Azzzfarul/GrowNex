import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, formatRelative } from '../hooks/useNotifications'

const DOT = {
  info:     'bg-gray-400',
  warn:     'bg-amber-500',
  critical: 'bg-red-500',
}

const TYPE_ICON = { threshold: '⚠️', actuator: '💧', daily: '🌙' }

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
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700">
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">You’re all caught up.</p>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => openRow(n)}
                  className={`w-full text-left flex gap-2.5 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    n.isRead ? '' : 'bg-brand-50/40 dark:bg-brand-900/10'
                  }`}
                >
                  <span className="shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? 'ℹ️'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${DOT[n.severity] ?? DOT.info}`} />
                      <span className={`text-sm truncate ${n.isRead ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                        {n.title}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
