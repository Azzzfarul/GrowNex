// Stores a camera-node photo exactly like a manual "camera feed" upload (client
// lib/photoUpload.js uploadZoneSnapshot / mobile photo_service.dart): same Storage path,
// same zones/{id}/snapshots/{4h bucket} doc, so both clients' Camera feed and the 48h
// prune in dailySummary.js work unchanged. Called from mqttBridge.js (grownex/+/camera).

import { randomUUID } from 'node:crypto'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const db = getFirestore()
const bucket = getStorage().bucket()

// Same bucketing as the clients' fourHourBucketId — UTC 00/04/08/12/16/20, e.g. "2026-01-15T12".
function fourHourBucketId(date = new Date()) {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(Math.floor(d.getUTCHours() / 4) * 4)
  return d.toISOString().slice(0, 13)
}

export async function saveZoneSnapshot(zoneId, jpeg, deviceId) {
  const bucketId = fourHourBucketId()
  const storagePath = `zoneSnapshots/${zoneId}/${bucketId}.jpg`

  // Admin uploads get no download token by default; set one so the stored URL works the
  // same as a client getDownloadURL() (token URLs bypass Storage rules).
  const token = randomUUID()
  await bucket.file(storagePath).save(jpeg, {
    resumable: false,
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(storagePath)}?alt=media&token=${token}`

  await db.collection('zones').doc(zoneId).collection('snapshots').doc(bucketId).set({
    imageUrl,
    storagePath,
    capturedAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
    source: 'camera',
    deviceId,
  })
  return { bucketId, imageUrl }
}
