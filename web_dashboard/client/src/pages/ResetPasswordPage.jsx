import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from 'firebase/auth'
import { auth } from '../firebase'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import AuthLayout from '../components/layout/AuthLayout'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const oobCode = searchParams.get('oobCode')

  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors,          setErrors]          = useState({})
  const [loading,         setLoading]         = useState(false)
  const [done,            setDone]            = useState(false)
  const [authError,       setAuthError]       = useState('')

  if (!oobCode) {
    return (
      <AuthLayout title="Link not valid">
        <p className="banner banner-error mb-6"><Icon name="link_off" />This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
        <Link to="/login" className="btn-filled">Back to sign in</Link>
      </AuthLayout>
    )
  }

  function validate() {
    const e = {}
    if (!newPassword) e.newPassword = 'Enter a new password'
    else if (newPassword.length < 6) e.newPassword = 'Password must be at least 6 characters'
    if (!confirmPassword) e.confirmPassword = 'Confirm your new password'
    else if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match'
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
      await confirmPasswordReset(auth, oobCode, newPassword)
      setDone(true)
    } catch (err) {
      const code = err?.code
      if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code') {
        setAuthError('This link has expired or already been used. Please request a new one.')
      } else {
        setAuthError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password.">
        <Link to="/login" className="btn-filled">Back to sign in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a new password for your account.">
      {authError && <p className="banner banner-error mb-6"><Icon name="error" />{authError}</p>}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <TextField type="password" label="New password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 6 characters" error={errors.newPassword} autoComplete="new-password" />
        <TextField type="password" label="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password" error={errors.confirmPassword} autoComplete="new-password" />
        <div className="flex items-center justify-between pt-4">
          <Link to="/login" className="btn-text -ml-3">Back to sign in</Link>
          <button type="submit" disabled={loading} className="btn-filled">{loading ? 'Updating…' : 'Update password'}</button>
        </div>
      </form>
    </AuthLayout>
  )
}
