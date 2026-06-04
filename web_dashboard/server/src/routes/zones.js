import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

router.get('/', verifyToken, async (req, res) => {
  try {
    const snap = await getFirestore()
      .collection('zones')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .get()
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:zoneId/plants', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const zone = await db.collection('zones').doc(req.params.zoneId).get()
    if (!zone.exists || zone.data().userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const snap = await db.collection('plants').where('zoneId', '==', req.params.zoneId).get()
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:zoneId/sensor-readings', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const zone = await db.collection('zones').doc(req.params.zoneId).get()
    if (!zone.exists || zone.data().userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const snap = await db.collection('zones').doc(req.params.zoneId)
      .collection('sensorReadings')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get()
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
