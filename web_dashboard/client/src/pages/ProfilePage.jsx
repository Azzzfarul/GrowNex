import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const settings = [
  { label: 'Account details',  subtitle: 'Update your name, email, and password', icon: '⚙' },
  { label: 'Notifications',    subtitle: 'Manage alerts and reminders',            icon: '🔔' },
  { label: 'App theme',        subtitle: 'Green dashboard mode',                   icon: '🎨' },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState(null)

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setUsername(snap.data().username ?? null)
    })
  }, [user])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const displayName = username || user?.displayName || user?.email?.split('@')[0] || '—'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Manage your account and app settings.</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-bold text-gray-900 text-lg">{displayName}</p>
          <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {settings.map(({ label, subtitle, icon }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-lg flex-shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{label}</p>
              <p className="text-sm text-gray-400">{subtitle}</p>
            </div>
            <span className="text-gray-300 text-sm">›</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl text-sm transition-colors"
      >
        Logout
      </button>
    </div>
  )
}
