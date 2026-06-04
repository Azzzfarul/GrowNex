import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

router.get('/', verifyToken, async (req, res) => {
  try {
    const snap = await getFirestore()
      .collection('devices')
      .where('userId', '==', req.user.uid)
      .get()
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await getFirestore().collection('devices').doc(req.params.id).get()
    if (!doc.exists) return res.status(404).json({ error: 'Device not found' })
    if (doc.data().userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' })
    res.json({ id: doc.id, ...doc.data() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
