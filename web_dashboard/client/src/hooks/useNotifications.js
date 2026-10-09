import { useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, limit, onSnapshot,
  doc, updateDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

// Live feed of the current user's notifications (newest 50) + read helpers.
export function useNotifications() {
  const { user } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!user) { setItems([]); return }
    return onSnapshot(
      query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50),
      ),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('[notifications]', err.message),
    )
  }, [user])

  const unreadCount = items.filter(n => !n.isRead).length

  const markRead = (id) => updateDoc(doc(db, 'notifications', id), { isRead: true }).catch(() => {})

  const markAllRead = async () => {
    const unread = items.filter(n => !n.isRead)
    if (!unread.length) return
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { isRead: true }))
    await batch.commit().catch(() => {})
  }

  return { items, unreadCount, markRead, markAllRead }
}

// "3m ago" / "2h ago" / "5d ago" from a Firestore Timestamp (no date lib in the project)
export function formatRelative(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null
  if (!d) return ''
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}
