import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../NotificationPanel'

// M3 small top app bar
export default function Topbar() {
  const { user } = useAuth()

  return (
    <header className="h-16 shrink-0 bg-surface flex items-center justify-between gap-4 px-4 sm:px-6">
      <p className="text-body-lg text-on-surface-variant truncate">
        Welcome back,{' '}
        <span className="text-on-surface font-medium">{user?.displayName || user?.email}</span>
      </p>
      <NotificationBell />
    </header>
  )
}
