import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'

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
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-sm p-6">
        <h2 className="text-headline-sm text-on-surface mb-4">Reset password</h2>
        <p className="text-sm text-on-surface-variant mb-5">
          Enter your email and we'll send you a link to reset your password.
        </p>
        {sent ? (
          <p className="text-sm text-on-secondary-container bg-secondary-container rounded-lg px-3 py-2 mb-4">
            Check your inbox — a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-label-lg text-on-surface-variant mb-1">Email</label>
              <input
                type="email"
                autoFocus
                className="field w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
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
                disabled={sending}
                className="btn-filled"
              >
                {sending ? 'Sending…' : 'Send link'}
              </button>
            </div>
          </form>
        )}
        {sent && (
          <div className="flex justify-end">
            <button onClick={onClose} className="btn-text">Close</button>
          </div>
        )}
      </div>
    </div>
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
        : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-8">
          <Icon name="eco" filled className="text-primary" size={32} />
          <span className="text-title-lg text-on-surface">GrowNex</span>
        </div>

        <h1 className="text-headline-sm text-on-surface mb-1">Sign in</h1>
        <p className="text-sm text-on-surface-variant mb-6">Manage your plants, devices, and analytics.</p>

        {authError && (
          <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4">{authError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field w-full"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-xs text-error mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full"
              placeholder="Enter your password"
            />
            {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-filled w-full"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Register
          </Link>
        </p>
      </div>

      {showForgot && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setShowForgot(false)}
        />
      )}
    </div>
  )
}
