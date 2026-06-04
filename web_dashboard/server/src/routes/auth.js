import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
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

export default router
