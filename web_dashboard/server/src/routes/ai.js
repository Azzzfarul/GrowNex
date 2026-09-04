import { Router } from 'express'
import { createHash } from 'crypto'
import { getFirestore } from 'firebase-admin/firestore'
import verifyToken from '../middleware/verifyToken.js'
import { aiEnabled, chatJson } from '../services/aiClient.js'
import {
  buildSummaryMessages, validateSummary,
  buildPlanMessages, validatePlan, fallbackPlan,
} from '../services/aiAnalytics.js'
import { buildPlantProfileMessages, validatePlantProfile } from '../services/aiPlant.js'

const router = Router()
const TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || '1800000')
const MODEL  = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

async function loadOwnedZone(db, zoneId, uid) {
  const snap = await db.collection('zones').doc(zoneId).get()
  if (!snap.exists || snap.data().userId !== uid) return null
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

export default router
