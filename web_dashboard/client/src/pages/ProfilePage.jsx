import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth'
import { db } from '../firebase'
import Icon from '../components/ui/Icon'
import Switch from '../components/ui/Switch'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

function ThemeDialog({ currentTheme, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-xs p-6">
        <h2 className="text-headline-sm text-on-surface mb-4">App Theme</h2>
        <div className="space-y-2 mb-5">
          {[
            { value: 'light', label: 'Light Mode' },
            { value: 'dark',  label: 'Dark Mode'  },
          ].map(({ value, label }) => (
            <label
              key={value}
              onClick={() => { onSelect(value); onClose() }}
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer state-layer"
            >
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                currentTheme === value
                  ? 'border-primary'
                  : 'border-outline'
              }`}>
                {currentTheme === value && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                )}
              </span>
              <span className="text-body-lg text-on-surface">{label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-text">Cancel</button>
        </div>
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
        await setDoc(doc(db, 'users', user.uid), { username: username.trim() }, { merge: true })
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
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-headline-sm text-on-surface mb-4">Edit Profile</h2>
        <form onSubmit={handleSave} className="space-y-5">

          {/* Account Info */}
          <div>
            <p className="text-xs font-medium text-primary uppercase tracking-wide mb-3">Account Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">Username</label>
                <input
                  className="field w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">Email</label>
                <input
                  className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-sm bg-surface-container text-on-surface-variant cursor-not-allowed"
                  value={user.email}
                  readOnly
                />
                <p className="text-xs text-on-surface-variant mt-1">Email cannot be changed.</p>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div>
            <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">Change Password</p>
            <p className="text-xs text-on-surface-variant mb-3">Leave blank to keep your current password.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">New password</label>
                <input
                  type="password"
                  className="field w-full"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">Confirm password</label>
                <input
                  type="password"
                  className="field w-full"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
              </div>
              {passwordChanging && (
                <div>
                  <label className="block text-label-lg text-on-surface-variant mb-1">Current password</label>
                  <input
                    type="password"
                    className="field w-full"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Required to confirm password change.</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-filled"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteAccountModal({ onClose }) {
  const { deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError]     = useState('')

  async function handleDelete(e) {
    e.preventDefault()
    if (!password) { setError('Enter your password to confirm.'); return }
    setDeleting(true)
    setError('')
    try {
      await deleteAccount(password)
      navigate('/login', { replace: true })
    } catch (err) {
      const code = err?.code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Incorrect password.')
      } else if (code === 'auth/requires-recent-login') {
        setError('Please log out and log back in, then try again.')
      } else {
        setError('An error occurred. Please try again.')
      }
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-sm p-6">
        <h2 className="text-headline-sm text-on-surface mb-4">Delete account</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          This action is permanent and cannot be undone. All your data will be deleted.
        </p>
        <form onSubmit={handleDelete} className="space-y-4">
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Your password</label>
            <input
              type="password"
              autoFocus
              className="field w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="btn-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting}
              className="btn-error"
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const NOTIF_TYPES = [
  { key: 'threshold', label: 'Zone alerts',      hint: 'When a zone’s conditions go out of range' },
  { key: 'actuator',  label: 'Actuator activity', hint: 'When automation waters, lights or feeds a zone' },
  { key: 'daily',     label: 'Daily summary',     hint: 'An evening recap of every zone' },
]

function NotificationSettingsDialog({ user, onClose }) {
  const [prefs, setPrefs] = useState(null)

  useEffect(() => {
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      setPrefs(snap.exists() ? (snap.data().notificationPrefs ?? {}) : {})
    })
  }, [user])

  const toggle = async (key) => {
    const enabled = prefs[key] !== false          // absent = enabled
    const next = { ...prefs, [key]: !enabled }
    setPrefs(next)
    await setDoc(doc(db, 'users', user.uid), { notificationPrefs: next }, { merge: true }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-sm p-6">
        <h2 className="text-headline-sm text-on-surface mb-4">Notifications</h2>
        <p className="text-sm text-on-surface-variant mb-5">Choose what you get notified about.</p>

        {prefs == null ? (
          <p className="text-sm text-on-surface-variant py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-3 mb-5">
            {NOTIF_TYPES.map(({ key, label, hint }) => {
              const on = prefs[key] !== false
              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-lg text-on-surface">{label}</p>
                    <p className="text-body-md text-on-surface-variant">{hint}</p>
                  </div>
                  <Switch checked={on} onChange={() => toggle(key)} label={label} />
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end">

          <button onClick={onClose} className="btn-text">Done</button>

        </div>
      </div>
    </div>
  )
}

const MENU_ITEMS = [
  {
    id: 'account',
    label: 'Account details',
    subtitle: 'Update your username and password',
    icon: 'manage_accounts',
    active: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    subtitle: 'Manage alerts and reminders',
    icon: 'notifications',
    active: true,
  },
  {
    id: 'theme',
    label: 'App theme',
    subtitle: 'Switch between light and dark mode',
    icon: 'palette',
    active: true,
  },
]

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [username,       setUsername]       = useState(null)
  const [showEdit,       setShowEdit]       = useState(false)
  const [showTheme,      setShowTheme]      = useState(false)
  const [showNotif,      setShowNotif]      = useState(false)
  const [showDeleteAcct, setShowDeleteAcct] = useState(false)

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
    if (id === 'account')       setShowEdit(true)
    if (id === 'notifications') setShowNotif(true)
    if (id === 'theme')         setShowTheme(true)
  }

  return (
    <div>
      <h1 className="text-headline-sm text-on-surface">Profile</h1>
      <p className="text-body-lg text-on-surface-variant mt-1 mb-6">Manage your account and app settings.</p>

      {/* Profile card */}
      <div className="card p-6 flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-title-lg flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-on-surface text-title-md">{displayName}</p>
          <p className="text-body-md text-on-surface-variant">{user?.email}</p>
        </div>
      </div>

      {/* Menu items */}
      <div className="card py-2 mb-6">
        {MENU_ITEMS.map(({ id, label, subtitle, icon, active }) => (
          <button
            key={id}
            type="button"
            disabled={!active}
            onClick={() => handleMenuClick(id)}
            className="state-layer w-full text-left flex items-center gap-4 px-4 py-3 disabled:opacity-50"
          >
            <span className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
              <Icon name={icon} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-body-lg text-on-surface">{label}</span>
              <span className="block text-body-md text-on-surface-variant">{subtitle}</span>
            </span>
            {active && <Icon name="chevron_right" className="text-on-surface-variant" />}
          </button>
        ))}
      </div>

      <button onClick={handleLogout} className="btn-tonal w-full">
        <Icon name="logout" />
        Logout
      </button>

      <div className="mt-8">
        <p className="text-title-sm text-error mb-3">Danger zone</p>
        <button
          onClick={() => setShowDeleteAcct(true)}
          className="btn-outlined w-full text-error border-error"
        >
          <Icon name="delete_forever" />
          Delete account
        </button>
      </div>

      {showEdit && (
        <EditProfileModal
          user={user}
          initialUsername={displayName}
          onClose={() => setShowEdit(false)}
          onSaved={(newName) => setUsername(newName)}
        />
      )}

      {showNotif && (
        <NotificationSettingsDialog user={user} onClose={() => setShowNotif(false)} />
      )}

      {showTheme && (
        <ThemeDialog
          currentTheme={theme}
          onSelect={setTheme}
          onClose={() => setShowTheme(false)}
        />
      )}

      {showDeleteAcct && (
        <DeleteAccountModal onClose={() => setShowDeleteAcct(false)} />
      )}
    </div>
  )
}
