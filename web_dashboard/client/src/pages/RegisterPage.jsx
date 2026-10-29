import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    const e = {}
    if (!username) e.username = 'Enter a username'
    if (!email) e.email = 'Enter your email'
    else if (!email.includes('@')) e.email = 'Enter a valid email'
    if (!password) e.password = 'Enter a password'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    if (!confirm) e.confirm = 'Confirm your password'
    else if (confirm !== password) e.confirm = 'Passwords do not match'
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
      await register(username, email, password)
      navigate('/dashboard')
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists.')
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Enter a valid email address.')
      } else if (err.code === 'auth/network-request-failed') {
        setAuthError("Can't reach the server. Check your connection and try again.")
      } else {
        setAuthError('Failed to create account. Please try again.')
      }
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

        <h1 className="text-headline-sm text-on-surface mb-1">Create account</h1>
        <p className="text-sm text-on-surface-variant mb-6">Register to monitor plants, analytics, and connected devices.</p>

        {authError && (
          <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4">{authError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field w-full"
              placeholder="Your username"
            />
            {errors.username && <p className="text-xs text-error mt-1">{errors.username}</p>}
          </div>
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
              placeholder="Choose a password"
            />
            {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="field w-full"
              placeholder="Repeat your password"
            />
            {errors.confirm && <p className="text-xs text-error mt-1">{errors.confirm}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-filled w-full"
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
