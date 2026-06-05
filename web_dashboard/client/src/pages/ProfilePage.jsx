import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

function ThemeDialog({ currentTheme, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">App Theme</h2>
        <div className="space-y-2 mb-5">
          {[
            { value: 'light', label: 'Light Mode' },
            { value: 'dark',  label: 'Dark Mode'  },
          ].map(({ value, label }) => (
            <label
              key={value}
              onClick={() => { onSelect(value); onClose() }}
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                currentTheme === value
                  ? 'border-green-600'
                  : 'border-gray-300'
              }`}>
                {currentTheme === value && (
                  <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
                )}
              </span>
              <span className="text-sm font-medium text-gray-800">{label}</span>
            </label>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function EditProfileModal({ user, initialUsername, onClose, onSaved }) {
  const [username,    setUsername]    = useState(initialUsername)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [currentPw,   setCurrentPw]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const passwordChanging = newPassword.length > 0

  async function handleSave(e) {
    e.preventDefault()

    if (passwordChanging) {
      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      if (newPassword !== confirmPw) {
        setError('Passwords do not match.')
        return
      }
      if (!currentPw) {
        setError('Enter your current password to confirm the change.')
        return
      }
    }

    const usernameChanged = username.trim() !== initialUsername
    if (!usernameChanged && !passwordChanging) { onClose(); return }

    setSaving(true)
    setError('')
    try {
      if (usernameChanged) {
        await updateDoc(doc(db, 'users', user.uid), { username: username.trim() })
        await updateProfile(user, { displayName: username.trim() })
      }
      if (passwordChanging) {
        const cred = EmailAuthProvider.credential(user.email, currentPw)
        await reauthenticateWithCredential(user, cred)
        await updatePassword(user, newPassword)
      }
      onSaved(username.trim())
      onClose()
    } catch (err) {
      const code = err?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Current password is incorrect.')
      } else if (code === 'auth/requires-recent-login') {
        setError('Please log out and log back in, then try again.')
      } else {
        setError('An error occurred. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-5">Edit Profile</h2>
        <form onSubmit={handleSave} className="space-y-5">

          {/* Account Info */}
          <div>
            <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-3">Account Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Username</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Email</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                  value={user.email}
                  readOnly
                />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div>
            <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Change Password</p>
            <p className="text-xs text-gray-400 mb-3">Leave blank to keep your current password.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-500 mb-1">New password</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Confirm password</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
              </div>
              {passwordChanging && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Current password</label>
                  <input
                    type="password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">Required to confirm password change.</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const MENU_ITEMS = [
  {
    id: 'account',
    label: 'Account details',
    subtitle: 'Update your username and password',
    icon: '⚙️',
    active: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    subtitle: 'Manage alerts and reminders',
    icon: '🔔',
    active: false,
  },
  {
    id: 'theme',
    label: 'App theme',
    subtitle: 'Switch between light and dark mode',
    icon: '🎨',
    active: true,
  },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [username,    setUsername]    = useState(null)
  const [showEdit,    setShowEdit]    = useState(false)
  const [showTheme,   setShowTheme]   = useState(false)

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

  function handleMenuClick(id) {
    if (id === 'account') setShowEdit(true)
    if (id === 'theme')   setShowTheme(true)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Manage your account and app settings.</p>

      {/* Profile card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-green-700 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-bold text-gray-900 text-lg">{displayName}</p>
          <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Menu items */}
      <div className="space-y-3 mb-6">
        {MENU_ITEMS.map(({ id, label, subtitle, icon, active }) => (
          <div
            key={id}
            onClick={active ? () => handleMenuClick(id) : undefined}
            className={`bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 px-5 py-4 transition-colors ${
              active ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-default'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-lg flex-shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{label}</p>
              <p className="text-sm text-gray-400">{subtitle}</p>
            </div>
            {active && <span className="text-gray-300 flex-shrink-0">›</span>}
          </div>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full bg-green-700 hover:bg-green-800 text-white font-medium py-3 rounded-xl text-sm transition-colors"
      >
        Logout
      </button>

      {showEdit && (
        <EditProfileModal
          user={user}
          initialUsername={displayName}
          onClose={() => setShowEdit(false)}
          onSaved={(newName) => setUsername(newName)}
        />
      )}

      {showTheme && (
        <ThemeDialog
          currentTheme={theme}
          onSelect={setTheme}
          onClose={() => setShowTheme(false)}
        />
      )}
    </div>
  )
}
