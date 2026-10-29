// Append-only notification writer. One doc per event in the top-level
// `notifications` collection; clients subscribe + flip `isRead` directly.
// Respects per-user opt-out at users/{uid}.notificationPrefs (absent = enabled).
// Each one is also pushed (FCM) to the user's phones at users/{uid}.fcmTokens, which the
// mobile app's push_service.dart maintains.

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

const db = getFirestore()
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // notifications kept ~30 days

// FCM errors meaning the token will never work again (app uninstalled, logged out, …).
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** Tokens whose send failed permanently; `responses` is sendEachForMulticast's, in token order. */
export const deadTokens = (tokens, responses) =>
  tokens.filter((_, i) => DEAD_TOKEN_CODES.has(responses[i]?.error?.code))

async function push(userRef, tokens, { title, message, type, zoneId }) {
  const { responses } = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body: message },
    data: { type, zoneId: zoneId ?? '' },
  })
  const dead = deadTokens(tokens, responses)
  if (dead.length) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...dead) })
}

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
    const userRef = db.collection('users').doc(userId)
    const user = (await userRef.get()).data() ?? {}
    const prefs = user.notificationPrefs ?? {}
    if (prefs[type] === false) return

    await db.collection('notifications').add({
      userId, zoneId, zoneName, type, severity, title, message,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + TTL_MS)),
    })

    // After the in-app write, so a push failure never costs the bell its notification. Not
    // awaited: callers (sensor handling, the nightly per-user loop) mustn't wait on FCM.
    // fcmTokens is client-written: keep only non-empty strings (FCM rejects the batch otherwise).
    const tokens = (Array.isArray(user.fcmTokens) ? user.fcmTokens : []).filter(t => typeof t === 'string' && t)
    if (tokens.length) {
      push(userRef, tokens, { title, message, type, zoneId })
        .catch(err => console.error('[notify] push failed:', err.message))
    }
  } catch (err) {
    console.error('[notify] failed:', err.message)
  }
}
