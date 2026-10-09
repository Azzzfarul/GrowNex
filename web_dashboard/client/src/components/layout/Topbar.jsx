import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../NotificationPanel'

export default function Topbar() {
  const { user } = useAuth()

  return (
    <header className="h-14 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between px-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Welcome back,{' '}
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {user?.displayName || user?.email}
        </span>
      </p>
      <NotificationBell />
    </header>
  )
}
