import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth } from '../firebase'

const AuthContext = createContext(null)
const API = import.meta.env.VITE_API_URL || ''

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const register = async (username, email, password) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(credential.user, { displayName: username })
    const token = await credential.user.getIdToken()
    // Not fatal: the Auth account already exists, and profile writes use setDoc merge.
    await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, email }),
    }).catch((err) => console.warn('User profile setup failed:', err.message))
    return credential
  }

  const logout = () => signOut(auth)

  const resetPassword = (email) => sendPasswordResetEmail(auth, email)

  const deleteAccount = async (password) => {
    const cred = EmailAuthProvider.credential(user.email, password)
    await reauthenticateWithCredential(user, cred)
    const token = await user.getIdToken(true)
    const res = await fetch(`${API}/api/auth/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Account deletion failed (${res.status})`)
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, resetPassword, deleteAccount }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
