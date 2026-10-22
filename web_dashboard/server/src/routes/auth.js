import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

router.post('/register', verifyToken, async (req, res) => {
  try {
    const { username, email } = req.body
    const ref = getFirestore().collection('users').doc(req.user.uid)
    await ref.set({
      uid: req.user.uid,
      username: username ?? '',
      email: email ?? req.user.email ?? '',
      createdAt: new Date().toISOString(),
    })
    res.status(201).json({ uid: req.user.uid })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', verifyToken, async (req, res) => {
  try {
    const doc = await getFirestore().collection('users').doc(req.user.uid).get()
    if (!doc.exists) return res.status(404).json({ error: 'User not found' })
    res.json(doc.data())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/me', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid
    const db = getFirestore()
    const bucket = getStorage().bucket()
    const writer = db.bulkWriter()
    // Each bulkWriter op returns its own promise; an unhandled rejection would crash the server.
    const failed = []
    const del = (ref) => writer.delete(ref).catch(e => failed.push(e))
    // Storage errors propagate: the route stops before deleting the login, so the user can retry.
    const delFile = (path) => bucket.file(path).delete({ ignoreNotFound: true })

    // Devices first: while a device doc still points at a zone, its next reading would recreate
    // sensorReadings/stats under the deleted zone, which nothing ever cleans up. Without the doc,
    // the bridge re-registers the device as unclaimed and writes nothing.
    const devicesSnap = await db.collection('devices').where('userId', '==', uid).get()
    const deviceDeletes = await Promise.allSettled(devicesSnap.docs.map(d => d.ref.delete()))
    if (deviceDeletes.some(r => r.status === 'rejected')) throw new Error('devices could not be deleted')

    // try/finally: if a Storage delete fails partway, the deletes already queued still finish
    // before the route responds.
    try {
      const zonesSnap = await db.collection('zones').where('userId', '==', uid).get()
      for (const zoneDoc of zonesSnap.docs) {
        const zoneId = zoneDoc.id

        const plantsSnap = await db.collection('plants').where('zoneId', '==', zoneId).get()
        for (const p of plantsSnap.docs) {
          await delFile(`plantPhotos/${p.id}.jpg`)  // before the doc, so a retry still finds the plant
          del(p.ref)
        }

        await delFile(`zonePhotos/${zoneId}.jpg`)
        await bucket.deleteFiles({ prefix: `zoneSnapshots/${zoneId}/` })
        del(db.collection('automationConfig').doc(zoneId))
        // Zone doc plus every subcollection (sensorReadings, stats, aiCache, snapshots)
        await db.recursiveDelete(zoneDoc.ref)
      }

      const notifSnap = await db.collection('notifications').where('userId', '==', uid).get()
      notifSnap.docs.forEach(d => del(d.ref))
    } finally {
      await writer.close()
    }
    // Keep the login so the user can retry; every step above is safe to repeat.
    if (failed.length) throw new Error(`${failed.length} document(s) could not be deleted`)
    await db.collection('users').doc(uid).delete()
    await getAuth().deleteUser(uid)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
