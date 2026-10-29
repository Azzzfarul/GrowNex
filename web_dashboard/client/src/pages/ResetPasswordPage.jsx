import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from 'firebase/auth'
import { auth } from '../firebase'
import Icon from '../components/ui/Icon'

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
      <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
        <div className="card w-full max-w-sm p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Icon name="eco" filled className="text-primary" size={32} />
            <span className="text-title-lg text-on-surface">GrowNex</span>
          </div>
          <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4">
            Invalid or expired reset link. Please request a new one.
          </p>
          <Link to="/login" className="text-sm text-primary hover:underline font-medium">
            Back to login
          </Link>
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-8">
          <Icon name="eco" filled className="text-primary" size={32} />
          <span className="text-title-lg text-on-surface">GrowNex</span>
        </div>

        {done ? (
          <div className="text-center">
            <h1 className="text-headline-sm text-on-surface mb-2">Password updated!</h1>
            <p className="text-sm text-on-surface-variant mb-6">You can now sign in with your new password.</p>
            <Link
              to="/login"
              className="btn-filled w-full text-center"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-headline-sm text-on-surface mb-1">Set new password</h1>
            <p className="text-sm text-on-surface-variant mb-6">Choose a new password for your account.</p>

            {authError && (
              <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4">{authError}</p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">New password</label>
                <input
                  type="password"
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="field w-full"
                  placeholder="At least 6 characters"
                />
                {errors.newPassword && (
                  <p className="text-xs text-error mt-1">{errors.newPassword}</p>
                )}
              </div>
              <div>
                <label className="block text-label-lg text-on-surface-variant mb-1">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="field w-full"
                  placeholder="Re-enter your password"
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-error mt-1">{errors.confirmPassword}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-filled w-full"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-on-surface-variant">
              <Link to="/login" className="text-primary hover:underline font-medium">
                Back to login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
