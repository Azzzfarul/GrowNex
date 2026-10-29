// Pure-logic tests. No network, no emulators: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { validatePlan, fallbackPlan, validateSummary } from '../src/services/aiAnalytics.js'
import { validatePlantProfile } from '../src/services/aiPlant.js'

// mqttBridge.js calls getFirestore()/getStorage() at import time; nothing connects until used.
initializeApp({ projectId: 'demo-unit', storageBucket: 'demo-unit.appspot.com' })
const { dailyCron, lightCron, weeklyCron, computeZoneStatus } = await import('../src/services/mqttBridge.js')
const { deadTokens } = await import('../src/services/notifications.js')

// ── deadTokens: which FCM tokens notify() prunes ─────────────────────────────

test('deadTokens keeps only tokens FCM says will never work again', () => {
  const tokens = ['ok', 'gone', 'bad', 'transient']
  const responses = [
    { success: true },
    { success: false, error: { code: 'messaging/registration-token-not-registered' } },
    { success: false, error: { code: 'messaging/invalid-registration-token' } },
    { success: false, error: { code: 'messaging/internal-error' } },  // retryable: keep
  ]
  assert.deepEqual(deadTokens(tokens, responses), ['gone', 'bad'])
  assert.deepEqual(deadTokens(['a'], []), [])
})

const plants = [
  { preferredMoistureMin: 40, preferredMoistureMax: 70, preferredLightCondition: 'high' },
  { preferredMoistureMin: 50, preferredMoistureMax: 80, preferredLightCondition: 'high' },
]

// ── validatePlan: model output is untrusted ──────────────────────────────────

test('validatePlan rejects output without a plan object', () => {
  assert.throws(() => validatePlan({}, { hasLight: true, hasFert: true, plants }))
  assert.throws(() => validatePlan({ plan: 'water a lot' }, { hasLight: true, hasFert: true, plants }))
})

test('validatePlan clamps threshold and durations to safe bounds', () => {
  const ctx = { hasLight: true, hasFert: true, plants }
  // avg min 45 → floor 35; avg max 75 → ceiling 72
  assert.equal(validatePlan({ plan: { wateringThreshold: 2 } }, ctx).plan.wateringThreshold, 35)
  assert.equal(validatePlan({ plan: { wateringThreshold: 99 } }, ctx).plan.wateringThreshold, 72)
  const { plan } = validatePlan({ plan: { wateringDuration: 5, fertilizingDuration: 99999 } }, ctx)
  assert.equal(plan.wateringDuration, 60)
  assert.equal(plan.fertilizingDuration, 1800)
})

test('validatePlan drops malformed schedules and normalises the light dash', () => {
  const ctx = { hasLight: true, hasFert: true, plants }
  const { plan } = validatePlan({ plan: {
    wateringSchedule: '7am', lightingSchedule: '08:00 - 18:00', fertilizingSchedule: 'monday 6',
  } }, ctx)
  assert.equal(plan.wateringSchedule, null)
  assert.equal(plan.lightingSchedule, '08:00–18:00')
  assert.equal(plan.fertilizingSchedule, 'MON 06:00')  // safe default when the module exists
})

test('validatePlan never enables a module the device lacks', () => {
  const { plan } = validatePlan({ plan: {
    autoLightingEnabled: true, lightingSchedule: '06:00–20:00',
    autoFertilizingEnabled: true, fertilizingSchedule: 'MON 06:00',
  } }, { hasLight: false, hasFert: false, plants })
  assert.equal(plan.autoLightingEnabled, false)
  assert.equal(plan.lightingSchedule, null)
  assert.equal(plan.autoFertilizingEnabled, false)
  assert.equal(plan.fertilizingSchedule, null)
  assert.equal(plan.fertilizingDuration, null)
})

test('validatePlan only enables watering with a usable threshold', () => {
  const ctx = { hasLight: false, hasFert: false, plants }
  assert.equal(validatePlan({ plan: { autoWateringEnabled: true } }, ctx).plan.autoWateringEnabled, false)
  assert.equal(validatePlan({ plan: { autoWateringEnabled: true, wateringThreshold: 40 } }, ctx).plan.autoWateringEnabled, true)
})

test('fallbackPlan is valid with and without plant data', () => {
  const p = fallbackPlan(plants, { hasLight: true, hasFert: false })
  assert.equal(p.wateringThreshold, 40)          // avg min 45 − 5
  assert.equal(p.lightingSchedule, '06:00–20:00') // dominant 'high'
  assert.equal(p.autoFertilizingEnabled, false)
  assert.equal(fallbackPlan([], { hasLight: false, hasFert: false }).wateringThreshold, 35)
  // A fallback plan must survive validatePlan unchanged in its schedules
  const v = validatePlan({ plan: p }, { hasLight: true, hasFert: false, plants }).plan
  assert.equal(v.lightingSchedule, p.lightingSchedule)
  assert.equal(v.wateringSchedule, p.wateringSchedule)
})

// ── validateSummary / validatePlantProfile ───────────────────────────────────

test('validateSummary requires every field and caps advice', () => {
  const full = { overview: 'ok', temperature: 't', humidity: 'h', light: 'l', moisture: 'm' }
  assert.throws(() => validateSummary({ ...full, moisture: '  ' }))
  const r = validateSummary({
    ...full,
    overview: 'x'.repeat(500),
    advice: [
      { severity: 'panic', text: 'a' }, { severity: 'warn', text: 'b' }, { text: '' },
      { text: 'c' }, { text: 'd' }, { text: 'e' },
    ],
  })
  assert.equal(r.summaries.overview.length, 240)
  assert.deepEqual(r.advice.map(a => a.text), ['a', 'b', 'c'])  // first 4, empties dropped
  assert.equal(r.advice[0].severity, 'info')
})

test('validatePlantProfile clamps ranges and rejects unusable output', () => {
  assert.throws(() => validatePlantProfile({ commonName: 'x' }))
  const { profile } = validatePlantProfile({
    preferredMoistureMin: 80, preferredMoistureMax: 20,          // inverted → dropped
    preferredHumidityMin: -10, preferredHumidityMax: 150,        // clamped
    preferredTemperatureMin: 18.25, preferredTemperatureMax: 30,
    preferredLightCondition: 'blinding',
  }, { species: 'sweet basil' })
  assert.equal(profile.preferredMoistureMin, null)
  assert.equal(profile.preferredHumidityMin, 0)
  assert.equal(profile.preferredHumidityMax, 100)
  assert.equal(profile.preferredTemperatureMin, 18.3)
  assert.equal(profile.preferredLightCondition, 'medium')
  assert.equal(profile.commonName, 'Sweet Basil')
})

// ── Bridge schedule parsers: the string formats are a contract with both clients ──

test('schedule strings become the right cron expressions', () => {
  assert.equal(dailyCron('07:00'), '0 7 * * *')
  assert.equal(dailyCron('7:05'), '5 7 * * *')
  assert.deepEqual(lightCron('08:00–18:30'), { onCron: '0 8 * * *', offCron: '30 18 * * *' })
  assert.deepEqual(lightCron('08:00-18:00'), { onCron: '0 8 * * *', offCron: '0 18 * * *' })
  assert.equal(weeklyCron('MON 06:00'), '0 6 * * 1')
  assert.equal(weeklyCron('sun 21:15'), '15 21 * * 0')
})

// ── Zone status (drives zone badges and threshold notifications) ─────────────

test('computeZoneStatus grades against the averaged plant ranges', () => {
  const zonePlants = [
    { preferredMoistureMin: 40, preferredMoistureMax: 60, preferredTemperatureMin: 20, preferredTemperatureMax: 30 },
    { preferredMoistureMin: 50, preferredMoistureMax: 70, preferredTemperatureMin: 18, preferredTemperatureMax: 28 },
  ]  // averaged: moisture 45–65, temperature 19–29
  assert.equal(computeZoneStatus({ moisture: 50 }, []).status, 'unknown')
  assert.equal(computeZoneStatus({ temperature: 25, moisture: 50 }, zonePlants).status, 'healthy')

  const one = computeZoneStatus({ temperature: 25, moisture: 41.666666 }, zonePlants)
  assert.equal(one.status, 'attention')
  assert.equal(one.alertSummary, 'Moisture too low (41.7%, ideal ≥ 45.0%)')

  assert.equal(computeZoneStatus({ temperature: 35, moisture: 80 }, zonePlants).status, 'critical')
  // A metric with no reading isn't counted as a problem, but the summary says it's missing
  assert.deepEqual(computeZoneStatus({ temperature: null, moisture: 50 }, zonePlants),
    { status: 'healthy', alertSummary: 'No temperature reading. The other conditions are within preferred range.' })

  // ...and an incomplete reading can't improve on the previous status (a failed DHT11 read)
  assert.deepEqual(computeZoneStatus({ temperature: null, moisture: 50 }, zonePlants, 'attention'),
    { status: 'attention', alertSummary: 'No temperature reading, so the last status is kept. The other conditions are within preferred range.' })
  assert.deepEqual(computeZoneStatus({ temperature: null, moisture: 30 }, zonePlants, 'healthy'),  // can still worsen
    { status: 'attention', alertSummary: 'No temperature reading. Moisture too low (30%, ideal ≥ 45.0%).' })
  assert.equal(computeZoneStatus({ temperature: 25, moisture: 50 }, zonePlants, 'critical').status, 'healthy')     // a full reading recovers
  assert.equal(computeZoneStatus({ humidity: null, temperature: 25, moisture: 50 }, zonePlants, 'attention').status, 'healthy')  // no humidity range set
})
