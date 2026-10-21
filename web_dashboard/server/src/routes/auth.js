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
    const delFile = (path) => bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {})

    const zonesSnap = await db.collection('zones').where('userId', '==', uid).get()
    for (const zoneDoc of zonesSnap.docs) {
      const zoneId = zoneDoc.id

      const plantsSnap = await db.collection('plants').where('zoneId', '==', zoneId).get()
      for (const p of plantsSnap.docs) {
        del(p.ref)
        await delFile(`plantPhotos/${p.id}.jpg`)
      }

      del(db.collection('automationConfig').doc(zoneId))
      await delFile(`zonePhotos/${zoneId}.jpg`)
      await bucket.deleteFiles({ prefix: `zoneSnapshots/${zoneId}/` }).catch(() => {})
      // Zone doc plus every subcollection (sensorReadings, stats, aiCache, snapshots)
      await db.recursiveDelete(zoneDoc.ref)
    }

    const devicesSnap = await db.collection('devices').where('userId', '==', uid).get()
    devicesSnap.docs.forEach(d => del(d.ref))

    const notifSnap = await db.collection('notifications').where('userId', '==', uid).get()
    notifSnap.docs.forEach(d => del(d.ref))

    await writer.close()
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
