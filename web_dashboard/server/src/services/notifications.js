// Append-only notification writer. One doc per event in the top-level
// `notifications` collection; clients subscribe + flip `isRead` directly.
// Respects per-user opt-out at users/{uid}.notificationPrefs (absent = enabled).

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const db = getFirestore()
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // notifications kept ~30 days

/**
 * @param {object} n
 * @param {string} n.userId
 * @param {string|null} [n.zoneId]
 * @param {string|null} [n.zoneName]
 * @param {'threshold'|'actuator'|'daily'} n.type
 * @param {'info'|'warn'|'critical'} [n.severity]
 * @param {string} n.title
 * @param {string} n.message
 */
export async function notify({ userId, zoneId = null, zoneName = null, type, severity = 'info', title, message }) {
  if (!userId || !type) return
  try {
    const prefs = (await db.collection('users').doc(userId).get()).data()?.notificationPrefs ?? {}
    if (prefs[type] === false) return

    await db.collection('notifications').add({
      userId, zoneId, zoneName, type, severity, title, message,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + TTL_MS)),
    })
  } catch (err) {
    console.error('[notify] failed:', err.message)
  }
}
