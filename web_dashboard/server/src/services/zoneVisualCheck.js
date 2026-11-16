// Coarse visual health check of a zone from each camera-node snapshot. Called (not awaited)
// from mqttBridge.js after the snapshot is stored; a failure leaves the snapshot as it was.
// The visual status is its own signal: it never touches zones.status or any actuator.

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { aiEnabled } from './aiClient.js'
import { checkZoneImage, worseZoneStatus } from './aiVision.js'
import { notifyZone } from './notifications.js'

const db = getFirestore()
// Default only: set it from the dev-set calibration table in the evaluation report.
const MIN_CONFIDENCE = parseFloat(process.env.VISION_NOTIFY_MIN_CONFIDENCE || '0.6')

// Pure: what one check result means for the snapshot doc, the zone doc, that hour's stats
// entry and the user. `zone` is the zone doc's data before the check.
export function applyZoneCheck({ zone, result, meta, minConfidence = MIN_CONFIDENCE }) {
  const { status, confidence, observations, summary } = result
  const name = zone.zoneName ?? 'A zone'
  // worseZoneStatus is false when there is no previous status: a first check never alerts.
  const worse = worseZoneStatus(status, zone.visualStatus)
  const alert = worse && confidence >= minConfidence
  // The zone keeps the last status a later check is compared against. 'unclear' (night, blur)
  // doesn't replace it, so dawn isn't compared against darkness; nor does a worse status below
  // the confidence threshold, or a confident one after it would find nothing worse to alert on.
  const zoneUpdate = status === 'unclear' || (worse && !alert) ? null : { visualStatus: status, visualSummary: summary }
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

// 3 writes per snapshot (snapshot, zone, statsDaily): 18 a day per camera zone. One read (the
// zone): `plants` is the zone's plant docs from the bridge's cache, queried here only when the
// cache hasn't loaded yet.
export async function checkZoneSnapshot(zoneId, bucketId, jpeg, plants) {
  if (!aiEnabled()) return
  try {
    const zoneRef = db.collection('zones').doc(zoneId)
    const [zoneSnap, zonePlants] = await Promise.all([
      zoneRef.get(),
      plants ?? db.collection('plants').where('zoneId', '==', zoneId).get().then(s => s.docs.map(d => d.data())),
    ])
    if (!zoneSnap.exists) return
    const zone = zoneSnap.data()

    const { result, meta } = await checkZoneImage({
      jpeg,
      context: {
        species: zonePlants.map(p => p.species || p.plantName).filter(Boolean),
        latest: {
          moisturePct: zone.latestMoisture ?? null, humidityPct: zone.latestHumid ?? null,
          temperatureC: zone.latestTemp ?? null, lightPct: zone.latestLight ?? null,
        },
      },
    })
    const out = applyZoneCheck({ zone, result, meta })
    const now = new Date().toISOString()

    // First and alone, as an update: if the zone or snapshot was deleted while the model was
    // thinking this throws, and nothing below recreates data under a deleted zone.
    await zoneRef.collection('snapshots').doc(bucketId)
      .update({ visual: { ...out.snapshotVisual, checkedAt: FieldValue.serverTimestamp() } })
    await Promise.all([
      out.zoneUpdate && zoneRef.update({ ...out.zoneUpdate, visualCheckedAt: FieldValue.serverTimestamp() }),
      zoneRef.collection('statsDaily').doc(now.slice(0, 10))
        .set({ hours: { [now.slice(11, 13)]: out.statsHour } }, { merge: true }),
    ])
    if (out.notification) await notifyZone(zone, { ...out.notification, zoneId })
    console.log(`[vision] zone ${zoneId} / ${bucketId}: ${result.status} (${result.confidence})`)
  } catch (e) {
    console.warn(`[vision] zone ${zoneId} check failed:`, e.message)
  }
}
