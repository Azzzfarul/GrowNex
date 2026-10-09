// Nightly per-user "evening summary" notification + notification pruning.
// Scheduled from mqttBridge.init() at DAILY_SUMMARY_CRON / DAILY_SUMMARY_TZ.

import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { notify } from './notifications.js'

const db = getFirestore()
const PRUNE_MS = 30 * 24 * 60 * 60 * 1000

// Deletes zones/{id}/sensorReadings docs whose expiresAt has passed (plain batch deletes —
// billed as normal deletes, unlike a Firestore TTL policy which needs billing enabled).
// Looped per zone so each query is collection-scoped (no composite index needed); capped at
// 20 batches/zone/night (10,000 docs) so a large backlog just continues over following nights.
async function pruneSensorReadings(zoneRefs) {
  const now = Timestamp.now()
  let totalDeleted = 0
  for (const zoneRef of zoneRefs) {
    for (let i = 0; i < 20; i++) {
      const staleSnap = await zoneRef.collection('sensorReadings')
        .where('expiresAt', '<', now)
        .limit(500)
        .get()
      if (staleSnap.empty) break
      const batch = db.batch()
      staleSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      totalDeleted += staleSnap.size
      if (staleSnap.size < 500) break
    }
  }
  return totalDeleted
}

export async function runDailySummary() {
  const zonesSnap = await db.collection('zones').get()

  const byUser = new Map()
  zonesSnap.forEach(d => {
    const z = { id: d.id, ...d.data() }
    if (!z.userId) return
    if (!byUser.has(z.userId)) byUser.set(z.userId, [])
    byUser.get(z.userId).push(z)
  })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  for (const [userId, zones] of byUser) {
    const healthy   = zones.filter(z => z.status === 'healthy').length
    const attention = zones.filter(z => z.status === 'attention' || z.status === 'critical')
    const offline   = zones.filter(z => z.deviceOnline === false).length

    // today's activity for this user (filter in memory — no second composite index)
    const notifSnap = await db.collection('notifications').where('userId', '==', userId).get()
    let actCount = 0, alertCount = 0
    notifSnap.forEach(d => {
      const n = d.data()
      const ts = n.createdAt?.toDate?.()
      if (!ts || ts < startOfToday) return
      if (n.type === 'actuator') actCount++
      else if (n.type === 'threshold') alertCount++
    })

    const parts = [`${healthy}/${zones.length} zones healthy`]
    if (attention.length) parts.push(`${attention.length} need${attention.length > 1 ? '' : 's'} attention (${attention.map(z => z.zoneName || 'unnamed').join(', ')})`)
    if (offline)          parts.push(`${offline} device${offline > 1 ? 's' : ''} offline`)
    if (actCount)         parts.push(`irrigation/lighting ran ${actCount}×`)
    if (alertCount)       parts.push(`${alertCount} alert${alertCount > 1 ? 's' : ''}`)

    await notify({
      userId,
      type: 'daily',
      severity: attention.length ? 'warn' : 'info',
      title: 'Evening summary',
      message: parts.join(' · ') + '.',
    })
  }

  // prune notifications older than 30 days (belt-and-suspenders vs. the expiresAt TTL policy)
  try {
    const cutoff = Timestamp.fromDate(new Date(Date.now() - PRUNE_MS))
    const old = await db.collection('notifications').where('createdAt', '<', cutoff).limit(400).get()
    if (!old.empty) {
      const batch = db.batch()
      old.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      console.log(`[daily summary] pruned ${old.size} old notification(s)`)
    }
  } catch (err) {
    console.warn('[daily summary] notification prune skipped:', err.message)
  }

  try {
    const deleted = await pruneSensorReadings(zonesSnap.docs.map(d => d.ref))
    if (deleted) console.log(`[daily summary] pruned ${deleted} stale sensorReadings doc(s)`)
  } catch (err) {
    console.warn('[daily summary] sensorReadings prune skipped:', err.message)
  }

  console.log(`[daily summary] sent to ${byUser.size} user(s)`)
}
