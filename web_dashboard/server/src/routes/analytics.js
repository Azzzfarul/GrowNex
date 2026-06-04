import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

// Sensor readings live in zones/{zoneId}/sensorReadings subcollections.
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const zonesSnap = await db.collection('zones').where('userId', '==', req.user.uid).get()
    if (zonesSnap.empty) return res.json({ readings: [] })

    const arrays = await Promise.all(
      zonesSnap.docs.map((zone) =>
        db.collection('zones').doc(zone.id).collection('sensorReadings')
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get()
          .then((s) => s.docs.map((d) => ({ id: d.id, zoneId: zone.id, ...d.data() })))
      )
    )

    const readings = arrays
      .flat()
      .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))
      .slice(0, 50)

    res.json({ readings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
