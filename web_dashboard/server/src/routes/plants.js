import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

// Plants belong to zones; find user's zones first, then return their plants.
router.get('/', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const zonesSnap = await db.collection('zones').where('userId', '==', req.user.uid).get()
    const zoneIds = zonesSnap.docs.map((d) => d.id)
    if (zoneIds.length === 0) return res.json([])

    // Firestore 'in' supports up to 10 values; slice is fine for typical use
    const plantsSnap = await db.collection('plants')
      .where('zoneId', 'in', zoneIds.slice(0, 10))
      .get()
    res.json(plantsSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const doc = await db.collection('plants').doc(req.params.id).get()
    if (!doc.exists) return res.status(404).json({ error: 'Plant not found' })

    const plant = doc.data()
    const zone = await db.collection('zones').doc(plant.zoneId).get()
    if (!zone.exists || zone.data().userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    res.json({ id: doc.id, ...plant })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
