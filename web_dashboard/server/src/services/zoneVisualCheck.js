// Coarse visual health check of a zone from each camera-node snapshot. Called (not awaited)
// from mqttBridge.js after the snapshot is stored; a failure leaves the snapshot as it was.
// The visual status is its own signal: it never touches zones.status or any actuator.

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { aiEnabled } from './aiClient.js'
import { checkZoneImage, worseZoneStatus } from './aiVision.js'
import { notify } from './notifications.js'

const db = getFirestore()
// Default only: set it from the dev-set calibration table in the evaluation report.
const MIN_CONFIDENCE = parseFloat(process.env.VISION_NOTIFY_MIN_CONFIDENCE || '0.6')

// Pure: what one check result means for the snapshot doc, the zone doc, that hour's stats
// entry and the user. `zone` is the zone doc's data before the check.
export function applyZoneCheck({ zone, result, meta, minConfidence = MIN_CONFIDENCE }) {
  const { status, confidence, observations, summary } = result
  const name = zone.zoneName ?? 'A zone'
  // 'unclear' (night, blur) keeps the last real status, so dawn isn't compared against darkness.
  const zoneUpdate = status === 'unclear' ? null : { visualStatus: status, visualSummary: summary }
  // worseZoneStatus is false when there is no previous status: a first check never alerts.
  const alert = worseZoneStatus(status, zone.visualStatus) && confidence >= minConfidence
  return {
    snapshotVisual: { status, confidence, observations, summary, model: meta.model, promptV: meta.promptV },
    zoneUpdate,
    // For eval/visionEval.js --task agreement: camera vs sensors, hour by hour.
    statsHour: { visualStatus: status, visualConfidence: confidence, sensorStatus: zone.status ?? 'unknown' },
    notification: alert ? {
      userId: zone.userId, zoneName: zone.zoneName ?? null,
      type: 'threshold', severity: 'warn',
      title: status === 'unhealthy' ? `${name}: plants look unhealthy` : `${name}: plants look stressed`,
      message: summary || 'The camera shows the plants looking worse than before.',
    } : null,
  }
}

// 3 writes per snapshot (snapshot, zone, statsDaily): 18 a day per camera zone.
export async function checkZoneSnapshot(zoneId, bucketId, jpeg) {
  if (!aiEnabled()) return
  try {
    const zoneRef = db.collection('zones').doc(zoneId)
    const [zoneSnap, plantsSnap] = await Promise.all([
      zoneRef.get(),
      db.collection('plants').where('zoneId', '==', zoneId).get(),
    ])
    if (!zoneSnap.exists) return
    const zone = zoneSnap.data()

    const { result, meta } = await checkZoneImage({
      jpeg,
      context: {
        species: plantsSnap.docs.map(p => p.data().species || p.data().plantName).filter(Boolean),
        latest: {
          moisturePct: zone.latestMoisture ?? null, humidityPct: zone.latestHumid ?? null,
          temperatureC: zone.latestTemp ?? null, lightPct: zone.latestLight ?? null,
        },
      },
    })
    const out = applyZoneCheck({ zone, result, meta })
    const now = new Date().toISOString()

    await Promise.all([
      // update, not set: if the snapshot or zone was deleted meanwhile, don't recreate it.
      zoneRef.collection('snapshots').doc(bucketId)
        .update({ visual: { ...out.snapshotVisual, checkedAt: FieldValue.serverTimestamp() } }),
      out.zoneUpdate && zoneRef.update({ ...out.zoneUpdate, visualCheckedAt: FieldValue.serverTimestamp() }),
      zoneRef.collection('statsDaily').doc(now.slice(0, 10))
        .set({ hours: { [now.slice(11, 13)]: out.statsHour } }, { merge: true }),
    ])
    if (out.notification) await notify({ ...out.notification, zoneId })
    console.log(`[vision] zone ${zoneId} / ${bucketId}: ${result.status} (${result.confidence})`)
  } catch (e) {
    console.warn(`[vision] zone ${zoneId} check failed:`, e.message)
  }
}
