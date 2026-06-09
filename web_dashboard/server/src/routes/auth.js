import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
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

    const zonesSnap = await db.collection('zones').where('userId', '==', uid).get()
    for (const zoneDoc of zonesSnap.docs) {
      const zoneId = zoneDoc.id

      const readingsSnap = await db.collection('zones').doc(zoneId).collection('sensorReadings').get()
      for (const r of readingsSnap.docs) await r.ref.delete()

      const plantsSnap = await db.collection('plants').where('zoneId', '==', zoneId).get()
      for (const p of plantsSnap.docs) await p.ref.delete()

      await db.collection('automationConfig').doc(zoneId).delete()
      await zoneDoc.ref.delete()
    }

    const devicesSnap = await db.collection('devices').where('userId', '==', uid).get()
    for (const d of devicesSnap.docs) await d.ref.delete()

    await db.collection('users').doc(uid).delete()
    await getAuth().deleteUser(uid)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
