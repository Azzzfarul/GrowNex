import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Reset password</h2>
        <p className="text-sm text-gray-500 mb-5">
          Enter your email and we'll send you a link to reset your password.
        </p>
        {sent ? (
          <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">
            Check your inbox — a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Email</label>
              <input
                type="email"
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send link'}
              </button>
            </div>
          </form>
        )}
        {sent && (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
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
    } catch {
      setAuthError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-3xl">🌱</span>
          <span className="text-xl font-bold text-brand-700">GrowNex</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to manage your plants, devices, and analytics.</p>

        {authError && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-4">{authError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Enter your password"
            />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-brand-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 hover:underline font-medium">
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
