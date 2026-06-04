import { useAuth } from '../../context/AuthContext'

export default function Topbar() {
  const { user } = useAuth()

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6">
      <p className="text-sm text-gray-500">
        Welcome back, <span className="font-medium text-gray-900">{user?.displayName || user?.email}</span>
      </p>
    </header>
  )
}
