import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import AuthLayout from '../components/layout/AuthLayout'

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
    <AuthLayout title="Create your account" subtitle="Monitor plants, analytics and connected devices.">
      {authError && <p className="banner banner-error mb-6"><Icon name="error" />{authError}</p>}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Your username" error={errors.username} autoComplete="username" autoFocus />
        <TextField type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" error={errors.email} autoComplete="email" />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a password" error={errors.password} support="6+ characters" autoComplete="new-password" />
          <TextField type="password" label="Confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password" error={errors.confirm} autoComplete="new-password" />
        </div>
        <div className="flex items-center justify-between pt-4">
          <Link to="/login" className="btn-text -ml-3">Sign in instead</Link>
          <button type="submit" disabled={loading} className="btn-filled">{loading ? 'Creating account…' : 'Create account'}</button>
        </div>
      </form>
    </AuthLayout>
  )
}
