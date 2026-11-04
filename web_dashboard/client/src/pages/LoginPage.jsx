import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import Dialog from '../components/ui/Dialog'
import AuthLayout from '../components/layout/AuthLayout'

function ForgotPasswordModal({ initialEmail, onClose }) {
  const { resetPassword } = useAuth()
  const [email,   setEmail]   = useState(initialEmail)
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !email.includes('@')) { setError('Enter a valid email address.'); return }
    setSending(true)
    setError('')
    try {
      await resetPassword(email)
      setSent(true)
    } catch {
      setError('Could not send reset email. Check the address and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      title="Reset password"
      onClose={onClose}
      busy={sending}
      actions={sent
        ? <button onClick={onClose} className="btn-text">Close</button>
        : <>
            <button type="button" onClick={onClose} className="btn-text">Cancel</button>
            <button type="submit" form="reset-form" disabled={sending} className="btn-filled">{sending ? 'Sending…' : 'Send link'}</button>
          </>}
    >
      {sent ? (
        <p className="banner banner-info"><Icon name="mark_email_read" />Check your inbox — a reset link is on its way.</p>
      ) : (
        <form id="reset-form" onSubmit={handleSubmit}>
          <p className="mb-5">Enter your email and we'll send you a link to reset your password.</p>
          <TextField type="email" label="Email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} error={error || undefined} />
        </form>
      )}
    </Dialog>
  )
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [showForgot, setShowForgot] = useState(false)

  function validate() {
    const e = {}
    if (!email) e.email = 'Enter your email'
    else if (!email.includes('@')) e.email = 'Enter a valid email'
    if (!password) e.password = 'Enter your password'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length) { setErrors(e2); return }
    setErrors({})
    setAuthError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setAuthError(
        err.code === 'auth/network-request-failed' ? "Can't reach the server. Check your connection and try again."
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Wait a moment and try again.'
        : err.code === 'auth/user-disabled' ? 'This account has been disabled.'
        : ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code)
          ? 'Invalid email or password.'
          : 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Manage your plants, devices and analytics.">
      {authError && <p className="banner banner-error mb-6"><Icon name="error" />{authError}</p>}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <TextField type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" error={errors.email} autoComplete="email" autoFocus />
        <div>
          <TextField type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password" error={errors.password} autoComplete="current-password" />
          <button type="button" onClick={() => setShowForgot(true)} className="btn-text btn-sm -ml-2 mt-1">Forgot password?</button>
        </div>
        <div className="flex items-center justify-between pt-4">
          <Link to="/register" className="btn-text -ml-3">Create account</Link>
          <button type="submit" disabled={loading} className="btn-filled">{loading ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>

      {showForgot && <ForgotPasswordModal initialEmail={email} onClose={() => setShowForgot(false)} />}
    </AuthLayout>
  )
}
