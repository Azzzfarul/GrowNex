import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import verifyToken from '../middleware/verifyToken.js'
import { memberIdsOf } from '../services/zoneMembers.js'

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

// ── Members ──────────────────────────────────────────────────────────────────
// zones.memberIds = owner + members (what the apps query and the security rules check);
// zones.members = { uid: email } for display. Only these routes change them: the rules don't let
// the apps, and finding a user by email needs the Admin SDK.
const MAX_MEMBERS = 10  // besides the owner

// POST /api/zones/:zoneId/members { email } — the owner adds an existing GrowNex user.
router.post('/:zoneId/members', verifyToken, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !email.includes('@')) return res.status(400).json({ error: 'Enter an email address.' })
  try {
    const db = getFirestore()
    const ref = db.collection('zones').doc(req.params.zoneId)
    // Ownership first, so nobody else can use this to find out which emails have an account.
    const zone = await ref.get()
    if (!zone.exists || zone.data().userId !== req.user.uid) return res.status(403).json({ error: 'Only the zone owner can add members.' })

    const member = await getAuth().getUserByEmail(email).catch(e => {
      if (e.code === 'auth/user-not-found') return null
      throw e
    })
    if (!member) return res.status(404).json({ error: 'No GrowNex account uses that email.' })

    const error = await db.runTransaction(async tx => {
      const z = (await tx.get(ref)).data()
      if (!z || z.userId !== req.user.uid) return [403, 'Only the zone owner can add members.']
      const ids = memberIdsOf(z)
      if (ids.includes(member.uid)) return [409, member.uid === z.userId ? "That's you: you own this zone." : 'Already a member.']
      if (ids.length > MAX_MEMBERS) return [409, `A zone can have at most ${MAX_MEMBERS} members.`]
      tx.update(ref, {
        memberIds: [...ids, member.uid],
        // memberIds may predate members (zones from before sharing): fill in the owner too.
        members: { ...(z.members ?? {}), [z.userId]: z.members?.[z.userId] ?? req.user.email ?? '', [member.uid]: member.email },
      })
      return null
    })
    if (error) return res.status(error[0]).json({ error: error[1] })
    res.status(201).json({ uid: member.uid, email: member.email })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/zones/:zoneId/members/:uid — the owner removes a member, or a member leaves.
router.delete('/:zoneId/members/:uid', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const ref = db.collection('zones').doc(req.params.zoneId)
    const target = req.params.uid
    const error = await db.runTransaction(async tx => {
      const z = (await tx.get(ref)).data()
      const ids = z ? memberIdsOf(z) : []
      if (!z || !ids.includes(req.user.uid)) return [403, 'Forbidden']
      if (target === z.userId) return [409, "The owner can't leave their own zone. Delete it instead."]
      if (req.user.uid !== z.userId && req.user.uid !== target) return [403, 'Only the zone owner can remove members.']
      if (!ids.includes(target)) return null  // already gone: removing is idempotent
      const members = { ...(z.members ?? {}) }
      delete members[target]
      tx.update(ref, { memberIds: ids.filter(id => id !== target), members })
      return null
    })
    if (error) return res.status(error[0]).json({ error: error[1] })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
