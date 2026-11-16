import express, { Router } from 'express'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import verifyToken from '../middleware/verifyToken.js'
import { aiEnabled, chatJson } from '../services/aiClient.js'
import {
  buildSummaryMessages, validateSummary,
  buildPlanMessages, validatePlan, fallbackPlan,
} from '../services/aiAnalytics.js'
import { buildPlantProfileMessages, validatePlantProfile } from '../services/aiPlant.js'
import { diagnosePlantImage, isJpeg, MAX_IMAGE_BYTES } from '../services/aiVision.js'
import { isMember } from '../services/zoneMembers.js'
import { identifyPlant, isPlantPhoto } from '../services/plantId.js'

const router = Router()
const TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || '1800000')
const MODEL  = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

// The zone, if `uid` is its owner or a member; else null.
async function loadOwnedZone(db, zoneId, uid) {
  const snap = await db.collection('zones').doc(zoneId).get()
  if (!snap.exists || !isMember(snap.data(), uid)) return null
  return snap
}

function round1(arr) {
  return Array.isArray(arr)
    ? arr.map(v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null))
    : []
}

// ── POST /api/ai/analytics-summary ──────────────────────────────────────────
// Body: { zoneId, timeRange, labels, series, prefs, latest, plants, ruleResults }
// Returns: { source: 'ai'|'cache'|'fallback', summaries: {...}|null, advice: [] }
router.post('/analytics-summary', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const body = req.body || {}
    const { zoneId, timeRange } = body
    if (!zoneId || !['today', '7days'].includes(timeRange)) {
      return res.status(400).json({ error: 'zoneId and a valid timeRange are required' })
    }

    const zone = await loadOwnedZone(db, zoneId, req.user.uid)
    if (!zone) return res.status(403).json({ error: 'Forbidden' })

    const series = {
      temperature: round1(body.series?.temperature),
      humidity:    round1(body.series?.humidity),
      light:       round1(body.series?.light),
      moisture:    round1(body.series?.moisture),
    }

    // No history and no live readings → nothing to summarise. Skip the model call.
    const hasSeries = Object.values(series).some(arr => arr.some(v => v != null))
    const hasLatest = body.latest && Object.values(body.latest).some(v => v != null)
    if (!hasSeries && !hasLatest) {
      return res.json({ source: 'fallback', summaries: null, advice: [] })
    }

    const inputHash = createHash('sha256')
      .update(JSON.stringify({ series, prefs: body.prefs ?? null, latest: body.latest ?? null, timeRange, model: MODEL }))
      .digest('hex')

    const cacheRef = db.collection('zones').doc(zoneId).collection('aiCache').doc(timeRange)
    const cached = await cacheRef.get()
    if (cached.exists) {
      const c = cached.data()
      if (c.inputHash === inputHash && Date.now() - c.generatedAt < TTL_MS && c.payload) {
        return res.json({ source: 'cache', ...c.payload })
      }
    }

    if (!aiEnabled()) {
      return res.json({ source: 'fallback', summaries: null, advice: [] })
    }

    try {
      const { system, user } = buildSummaryMessages({ ...body, series, zoneName: zone.data().zoneName })
      const payload = validateSummary(await chatJson({ system, user, maxTokens: 700 }))
      await cacheRef.set({ inputHash, generatedAt: Date.now(), payload })
      return res.json({ source: 'ai', ...payload })
    } catch (aiErr) {
      console.warn('[ai] analytics-summary fallback:', aiErr.message)
      return res.json({ source: 'fallback', summaries: null, advice: [] })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/automation-plan ────────────────────────────────────────────
// Body: { zoneId }  (plants / device / current config are re-read server-side)
// Returns: { source: 'ai'|'fallback', plan: {...}, rationale: [{ field, text }] }
// Does NOT write Firestore — the client applies the plan after user confirmation.
router.post('/automation-plan', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const { zoneId } = req.body || {}
    if (!zoneId) return res.status(400).json({ error: 'zoneId is required' })

    const zone = await loadOwnedZone(db, zoneId, req.user.uid)
    if (!zone) return res.status(403).json({ error: 'Forbidden' })

    const plantsSnap = await db.collection('plants').where('zoneId', '==', zoneId).get()
    const plants = plantsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    let device = { hasLightingModule: false, hasFertilizerModule: false }
    const deviceId = zone.data().deviceId
    if (deviceId) {
      const dev = await db.collection('devices').doc(deviceId).get()
      if (dev.exists) device = dev.data()
    }
    const hasLight = !!device.hasLightingModule
    const hasFert  = !!device.hasFertilizerModule

    const cfgSnap = await db.collection('automationConfig').doc(zoneId).get()
    const current = cfgSnap.exists ? cfgSnap.data() : null
    const latest = {
      latestTemp: zone.data().latestTemp ?? null,
      latestHumid: zone.data().latestHumid ?? null,
      latestMoisture: zone.data().latestMoisture ?? null,
    }

    if (!aiEnabled()) {
      return res.json({ source: 'fallback', plan: fallbackPlan(plants, { hasLight, hasFert }), rationale: [] })
    }

    try {
      const { system, user } = buildPlanMessages({ plants, device, latest, current })
      const { plan, rationale } = validatePlan(await chatJson({ system, user, maxTokens: 700 }), { hasLight, hasFert, plants })
      return res.json({ source: 'ai', plan, rationale })
    } catch (aiErr) {
      console.warn('[ai] automation-plan fallback:', aiErr.message)
      return res.json({ source: 'fallback', plan: fallbackPlan(plants, { hasLight, hasFert }), rationale: [] })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/plant-profile ─────────────────────────────────────────────
// Body: { species, zoneType }  →  { source: 'ai'|'cache'|'fallback', profile: {...}|null }
// Cache is GLOBAL per species+zoneType (aiPlantProfiles/{slug}) — plant biology
// doesn't change, so every user benefits and cost is near-zero after warm-up.
router.post('/plant-profile', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const species = String(req.body?.species ?? '').trim()
    const zoneType = req.body?.zoneType === 'outdoor' ? 'outdoor' : 'indoor'
    if (species.length < 2) return res.status(400).json({ error: 'species is required' })

    const PROFILE_V = 3  // bump to invalidate cached profiles after a shape/prompt change
    const slug = `${species}-${zoneType}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200)
    const cacheRef = db.collection('aiPlantProfiles').doc(slug)
    const cached = await cacheRef.get()
    if (cached.exists && cached.data().model === MODEL && cached.data().v === PROFILE_V) {
      return res.json({ source: 'cache', profile: cached.data().profile })
    }

    if (!aiEnabled()) return res.json({ source: 'fallback', profile: null })

    try {
      const { system, user } = buildPlantProfileMessages({ species, zoneType })
      const { profile } = validatePlantProfile(await chatJson({ system, user, maxTokens: 800 }), { species })
      await cacheRef.set({ v: PROFILE_V, model: MODEL, generatedAt: Date.now(), species, zoneType, profile })
      return res.json({ source: 'ai', profile })
    } catch (aiErr) {
      console.warn('[ai] plant-profile fallback:', aiErr.message)
      return res.json({ source: 'fallback', profile: null })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/plant-diagnosis ────────────────────────────────────────────
// Body: { plantId, diagnosisId }. The client has already uploaded the close-up to
// plantDiagnoses/{uid}/{diagnosisId}.jpg; the path is built here from IDs, so the server never
// fetches a URL a client supplied.
// Returns: { source: 'ai', diagnosis } | { source: 'fallback', reason: 'disabled'|'limit'|'error' }
// The server writes plantDiagnoses/{diagnosisId} (clients can only read and delete it). Whenever
// no diagnosis is saved, the uploaded image is deleted again.
const KEEP_PER_PLANT = 20
const MAX_PER_DAY = 30   // per user, UTC day: caps what one account can spend on the model

router.post('/plant-diagnosis', verifyToken, async (req, res) => {
  try {
    const db = getFirestore()
    const bucket = getStorage().bucket()
    const uid = req.user.uid
    const plantId = String(req.body?.plantId ?? '')
    const diagnosisId = String(req.body?.diagnosisId ?? '')
    if (!plantId || plantId.includes('/') || !/^[A-Za-z0-9]{10,40}$/.test(diagnosisId)) {
      return res.status(400).json({ error: 'plantId and diagnosisId are required' })
    }

    const plantRef = db.collection('plants').doc(plantId)
    const plantSnap = await plantRef.get()
    const zoneSnap = plantSnap.exists ? await loadOwnedZone(db, plantSnap.data().zoneId, uid) : null
    if (!zoneSnap) return res.status(403).json({ error: 'Forbidden' })

    const storagePath = `plantDiagnoses/${uid}/${diagnosisId}.jpg`
    const file = bucket.file(storagePath)
    const discard = () => file.delete({ ignoreNotFound: true }).catch(() => {})

    let jpeg = null
    try {
      const [meta] = await file.getMetadata()
      if (Number(meta.size) <= MAX_IMAGE_BYTES) [jpeg] = await file.download()
    } catch { /* not uploaded */ }
    if (!isJpeg(jpeg)) {
      await discard()
      return res.status(400).json({ error: 'Use a JPEG photo under 1.5 MB' })
    }

    if (!aiEnabled()) {
      await discard()
      return res.json({ source: 'fallback', reason: 'disabled' })
    }

    const userRef = db.collection('users').doc(uid)
    const today = new Date().toISOString().slice(0, 10)
    const quota = (await userRef.get()).data()?.diagnosisQuota
    const usedToday = quota?.day === today ? quota.count : 0
    if (usedToday >= MAX_PER_DAY) {
      await discard()
      return res.json({ source: 'fallback', reason: 'limit' })
    }

    try {
      const plant = plantSnap.data(), zone = zoneSnap.data()
      const { result, meta } = await diagnosePlantImage({
        jpeg,
        context: {
          species: plant.species || plant.plantName || null,
          preferred: {
            moisture: [plant.preferredMoistureMin ?? null, plant.preferredMoistureMax ?? null],
            humidity: [plant.preferredHumidityMin ?? null, plant.preferredHumidityMax ?? null],
            temperature: [plant.preferredTemperatureMin ?? null, plant.preferredTemperatureMax ?? null],
            light: plant.preferredLightCondition ?? null,
          },
          latest: {
            moisturePct: zone.latestMoisture ?? null, humidityPct: zone.latestHumid ?? null,
            temperatureC: zone.latestTemp ?? null, lightPct: zone.latestLight ?? null,
          },
        },
      })

      // The plant may have been deleted while the model was thinking; don't leave an orphan.
      if (!(await plantRef.get()).exists) throw new Error('plant was deleted')

      // Same token-URL trick as cameraSnapshots.js, so both apps can show the image directly.
      const token = randomUUID()
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } })
      const doc = {
        userId: uid, plantId, zoneId: zoneSnap.id, storagePath,
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
        model: meta.model, promptV: meta.promptV,
        ...result,
      }
      const ref = db.collection('plantDiagnoses').doc(diagnosisId)
      await ref.create({ ...doc, createdAt: FieldValue.serverTimestamp() })  // create: never overwrite another doc
      await userRef.set({ diagnosisQuota: { day: today, count: usedToday + 1 } }, { merge: true })

      // Keep the newest KEEP_PER_PLANT; best effort, a failure here doesn't fail the diagnosis.
      try {
        const all = await db.collection('plantDiagnoses').where('plantId', '==', plantId).get()
        const old = all.docs
          .sort((a, b) => (b.data().createdAt?.toMillis() ?? 0) - (a.data().createdAt?.toMillis() ?? 0))
          .slice(KEEP_PER_PLANT)
        for (const d of old) {
          if (d.data().storagePath) await bucket.file(d.data().storagePath).delete({ ignoreNotFound: true })
          await d.ref.delete()
        }
      } catch (e) {
        console.warn('[ai] plant-diagnosis prune failed:', e.message)
      }

      return res.json({ source: 'ai', diagnosis: { id: diagnosisId, ...doc, createdAt: new Date().toISOString() } })
    } catch (aiErr) {
      console.warn('[ai] plant-diagnosis fallback:', aiErr.message)
      await discard()
      return res.json({ source: 'fallback', reason: 'error' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/identify-plant ────────────────────────────────────────────
// Body: the photo itself (Content-Type image/jpeg or image/png, ≤ 4 MB).
// → { source: 'plantnet', results: [{ species, commonName, score }] } (best first, [] = no match),
//   or { source: 'unavailable', results: [] } without PLANTNET_API_KEY.
// shortcut: no per-user limit, so one user can spend the shared 500/day; add one if that happens.
router.post('/identify-plant', verifyToken, express.raw({ type: ['image/jpeg', 'image/png'], limit: '4mb' }), async (req, res) => {
  if (!isPlantPhoto(req.body)) return res.status(400).json({ error: 'Send a JPEG or PNG photo.' })
  const key = process.env.PLANTNET_API_KEY
  if (!key) return res.json({ source: 'unavailable', results: [] })
  try {
    res.json({ source: 'plantnet', results: await identifyPlant(key, req.body, req.headers['content-type']) })
  } catch (err) {
    console.warn('[ai] identify-plant failed:', err.message)
    res.status(502).json({ error: 'Plant identification failed. Try again later.' })
  }
})

export default router
