// Client for the AI endpoints on the Express server. Both functions degrade
// gracefully: on any network/HTTP error they resolve a "fallback"/"error" shape
// so callers keep showing the local rule-based text (describeTrend /
// buildOverviewSummary in AnalyticsPage.jsx).

import { downscaleToJpeg } from './photoUpload.js'

export const AI_SUMMARY_KINDS = ['overview', 'temperature', 'humidity', 'light', 'moisture']

const API = import.meta.env.VITE_API_URL || ''

async function postJson(path, idToken, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

/**
 * @param {string} idToken  Firebase ID token (user.getIdToken())
 * @param {object} payload  { zoneId, timeRange, labels, series, prefs, latest, plants, ruleResults }
 * @returns {Promise<{ source: string, summaries: object|null, advice: Array }>}
 */
export async function fetchAiSummary(idToken, payload) {
  try {
    const data = await postJson('/api/ai/analytics-summary', idToken, payload)
    return {
      source: data.source ?? 'fallback',
      summaries: data.summaries ?? null,
      advice: Array.isArray(data.advice) ? data.advice : [],
    }
  } catch {
    return { source: 'fallback', summaries: null, advice: [] }
  }
}

/**
 * @param {string} idToken  Firebase ID token
 * @param {object} payload  { zoneId }
 * @returns {Promise<{ source: string, plan: object|null, rationale: Array }>}
 */
export async function fetchAutomationPlan(idToken, payload) {
  try {
    const data = await postJson('/api/ai/automation-plan', idToken, payload)
    return {
      source: data.source ?? 'fallback',
      plan: data.plan ?? null,
      rationale: Array.isArray(data.rationale) ? data.rationale : [],
    }
  } catch {
    return { source: 'error', plan: null, rationale: [] }
  }
}

/**
 * @param {string} idToken
 * @param {object} payload  { species, zoneType }
 * @returns {Promise<{ source: string, profile: object|null }>}
 */
export async function fetchPlantProfile(idToken, payload) {
  try {
    const data = await postJson('/api/ai/plant-profile', idToken, payload)
    return { source: data.source ?? 'fallback', profile: data.profile ?? null }
  } catch {
    return { source: 'error', profile: null }
  }
}

// Pl@ntNet species guesses for a plant photo (server: POST /api/ai/identify-plant, which holds the
// key). Resolves { results: [{ species, commonName, score }] } (best first; [] = no match) or { error }.
export async function identifyPlant(idToken, file) {
  try {
    const res = await fetch(`${API}/api/ai/identify-plant`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${idToken}` },
      body: await downscaleToJpeg(file),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error ?? `Identification failed (${res.status})` }
    if (data.source === 'unavailable') return { error: "Plant identification isn't set up on the server." }
    return { results: Array.isArray(data.results) ? data.results : [] }
  } catch {
    return { error: "Couldn't identify the photo. Check that the server is running." }
  }
}
