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
import TextField from '../components/ui/TextField'
import Dialog from '../components/ui/Dialog'
import PageHeader from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

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
    <Dialog
      title="Edit account"
      size="md"
      onClose={onClose}
      busy={saving}
      actions={<>
        <button type="button" onClick={onClose} className="btn-text">Cancel</button>
        <button type="submit" form="edit-profile-form" disabled={saving} className="btn-filled">{saving ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
      <form id="edit-profile-form" onSubmit={handleSave} className="space-y-4 pt-1">
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <TextField label="Email" value={user.email} readOnly disabled support="Email can't be changed." />

        <div className="pt-2">
          <p className="text-title-sm text-on-surface">Change password</p>
          <p className="text-body-sm text-on-surface-variant mb-4">Leave blank to keep your current password.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField type="password" label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <TextField type="password" label="Confirm password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </div>
          {passwordChanging && (
            <TextField type="password" label="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              support="Required to confirm the change." className="mt-4" autoComplete="current-password" />
          )}
        </div>

        {error && <p className="banner banner-error"><Icon name="error" />{error}</p>}
      </form>
    </Dialog>
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
    <Dialog
      icon="warning"
      title="Delete account?"
      onClose={onClose}
      busy={deleting}
      actions={<>
        <button type="button" onClick={onClose} disabled={deleting} className="btn-text">Cancel</button>
        <button type="submit" form="delete-account-form" disabled={deleting} className="btn-error">{deleting ? 'Deleting…' : 'Delete account'}</button>
      </>}
    >
      <p className="mb-5">Your zones, plants, readings, photos and notifications are deleted for good. This can't be undone.</p>
      <form id="delete-account-form" onSubmit={handleDelete}>
        <TextField type="password" label="Your password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={error || undefined} />
      </form>
    </Dialog>
  )
}

const NOTIF_TYPES = [
  { key: 'threshold', label: 'Zone alerts',      hint: 'When a zone’s conditions go out of range' },
  { key: 'actuator',  label: 'Actuator activity', hint: 'When automation waters, lights or feeds a zone' },
  { key: 'daily',     label: 'Daily summary',     hint: 'An evening recap of every zone' },
]

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-4 px-4 pt-3 pb-2">
      <span className="list-icon"><Icon name={icon} /></span>
      <div>
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="text-body-sm text-on-surface-variant">{subtitle}</p>}
      </div>
    </div>
  )
}

function NotificationSettings({ user }) {
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
    <section className="card py-2">
      <SectionTitle icon="notifications" title="Notifications" subtitle="Shown in the app and pushed to your phone" />
      {NOTIF_TYPES.map(({ key, label, hint }) => (
        <div key={key} className="list-row">
          <div className="flex-1 min-w-0">
            <p className="text-body-lg text-on-surface">{label}</p>
            <p className="text-body-md text-on-surface-variant">{hint}</p>
          </div>
          <Switch checked={prefs ? prefs[key] !== false : false} disabled={!prefs} onChange={() => toggle(key)} label={label} />
        </div>
      ))}
    </section>
  )
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [username,       setUsername]       = useState(null)
  const [showEdit,       setShowEdit]       = useState(false)
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

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account and app settings" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Account summary */}
        <section className="card p-6 flex flex-col items-center text-center lg:sticky lg:top-6">
          <div className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container grid place-items-center text-headline-lg">
            {initials}
          </div>
          <p className="text-title-lg text-on-surface mt-4">{displayName}</p>
          <p className="text-body-md text-on-surface-variant break-all">{user?.email}</p>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setShowEdit(true)} className="btn-tonal"><Icon name="edit" />Edit</button>
            <button onClick={handleLogout} className="btn-outlined"><Icon name="logout" />Log out</button>
          </div>
        </section>

        <div className="space-y-6 min-w-0">
          <section className="card py-2">
            <SectionTitle icon="manage_accounts" title="Account" />
            {[
              ['Username', displayName, true],
              ['Email', user?.email, false],
              ['Password', '••••••••', true],
            ].map(([label, value, editable]) => (
              <button key={label} onClick={() => setShowEdit(true)} disabled={!editable}
                className="state-layer list-row w-full disabled:cursor-default">
                <span className="w-32 shrink-0 text-body-md text-on-surface-variant">{label}</span>
                <span className="flex-1 min-w-0 text-body-lg text-on-surface truncate">{value}</span>
                {editable && <Icon name="chevron_right" className="text-on-surface-variant" />}
              </button>
            ))}
          </section>

          <NotificationSettings user={user} />

          <section className="card py-2">
            <SectionTitle icon="palette" title="Appearance" />
            <div className="list-row">
              <p className="flex-1 text-body-lg text-on-surface">Theme</p>
              <div role="group" aria-label="Theme" className="segmented">
                {[['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode']].map(([v, l, ic]) => (
                  <button key={v} onClick={() => setTheme(v)} aria-pressed={theme === v}>
                    <Icon name={theme === v ? 'check' : ic} />{l}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-error/40 p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[16rem]">
              <h2 className="text-title-md text-error">Delete account</h2>
              <p className="text-body-md text-on-surface-variant">Permanently remove your account and all of its data.</p>
            </div>
            <button onClick={() => setShowDeleteAcct(true)} className="btn-outlined btn-danger"><Icon name="delete_forever" />Delete account</button>
          </section>
        </div>
      </div>

      {showEdit && (
        <EditProfileModal
          user={user}
          initialUsername={displayName}
          onClose={() => setShowEdit(false)}
          onSaved={(newName) => setUsername(newName)}
        />
      )}

      {showDeleteAcct && <DeleteAccountModal onClose={() => setShowDeleteAcct(false)} />}
    </div>
  )
}
