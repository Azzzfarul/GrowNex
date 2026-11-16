// Pure-logic tests. No network, no emulators: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp } from 'firebase-admin/app'
import { validatePlan, fallbackPlan, validateSummary } from '../src/services/aiAnalytics.js'
import { validatePlantProfile } from '../src/services/aiPlant.js'
import { parsePlantNetResults, isPlantPhoto } from '../src/services/plantId.js'
import { memberIdsOf } from '../src/services/zoneMembers.js'

// ── Pl@ntNet answers are outside data ────────────────────────────────────────

test('parsePlantNetResults keeps the top matches, typed and capped', () => {
  const json = { results: [
    { score: 0.874, species: { scientificNameWithoutAuthor: ' Ocimum basilicum ', commonNames: ['', 'Basil', 'Sweet basil'] } },
    { score: 1.7, species: { scientificNameWithoutAuthor: 'Mentha spicata', commonNames: [] } },        // clamped
    { score: 0.3, species: { scientificNameWithoutAuthor: 'X'.repeat(200) } },                          // long name
    { score: 0.5, species: {} },                                                                         // past the top 3
  ] }
  assert.deepEqual(parsePlantNetResults(json), [
    { species: 'Ocimum basilicum', commonName: 'Basil', score: 0.87 },
    { species: 'Mentha spicata', commonName: null, score: 1 },
    { species: 'X'.repeat(80), commonName: null, score: 0.3 },
  ])
  // no name, no score, or a ~0% padding guess: dropped
  assert.deepEqual(parsePlantNetResults({ results: [{ score: 0.9, species: {} }, { score: 'high', species: { scientificNameWithoutAuthor: 'A' } },
    { score: 0.01, species: { scientificNameWithoutAuthor: 'B' } }] }), [])
  assert.deepEqual(parsePlantNetResults(null), [])
  assert.deepEqual(parsePlantNetResults({ results: 'nope' }), [])
})

test('isPlantPhoto accepts JPEG and PNG only', () => {
  assert.ok(isPlantPhoto(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0])))
  assert.ok(isPlantPhoto(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0])))
  assert.ok(!isPlantPhoto(Buffer.from('GIF89a....')))
  assert.ok(!isPlantPhoto({}))
})

test('memberIdsOf: owner + members, or the owner alone for zones from before sharing', () => {
  assert.deepEqual(memberIdsOf({ userId: 'a', memberIds: ['a', 'b', 'b', '', 3] }), ['a', 'b'])
  assert.deepEqual(memberIdsOf({ userId: 'a' }), ['a'])
  assert.deepEqual(memberIdsOf({ userId: 'a', memberIds: [] }), ['a'])
  assert.deepEqual(memberIdsOf(undefined), [])
})

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

// ── aiVision: image diagnosis output is untrusted ────────────────────────────

const {
  validateDiagnosis, validateZoneCheck, worseZoneStatus, isJpeg,
} = await import('../src/services/aiVision.js')

test('validateDiagnosis turns junk into a safe "unclear" result', () => {
  for (const junk of [{}, null, 'text', { condition: 'on fire' }]) {
    const d = validateDiagnosis(junk)
    assert.equal(d.condition, 'unclear')
    assert.equal(d.severity, 'none')
    assert.equal(d.confidence, 0)
    assert.deepEqual(d.observations, [])
    assert.deepEqual(d.advice, [])
  }
})

test('validateDiagnosis normalises near-miss condition labels', () => {
  assert.equal(validateDiagnosis({ condition: 'Fungal disease' }).condition, 'fungal_disease')
  assert.equal(validateDiagnosis({ condition: 'fungal' }).condition, 'fungal_disease')
  assert.equal(validateDiagnosis({ condition: ' PEST_DAMAGE ' }).condition, 'pest_damage')
  assert.equal(validateDiagnosis({ condition: 'water-stress' }).condition, 'water_stress')
})

test('validateDiagnosis clamps severity, confidence and list sizes', () => {
  assert.equal(validateDiagnosis({ condition: 'healthy', severity: 'severe' }).severity, 'none')
  assert.equal(validateDiagnosis({ condition: 'pest_damage', severity: 'severe' }).severity, 'severe')
  assert.equal(validateDiagnosis({ condition: 'pest_damage', severity: 'apocalyptic' }).severity, 'mild')
  assert.equal(validateDiagnosis({ confidence: 7 }).confidence, 1)
  assert.equal(validateDiagnosis({ confidence: '0.4' }).confidence, 0.4)
  assert.equal(validateDiagnosis({ confidence: NaN }).confidence, 0)
  const many = Array.from({ length: 9 }, (_, i) => `item ${i}`)
  const d = validateDiagnosis({ observations: [...many, 5, null], advice: many, summary: 'x'.repeat(500) })
  assert.equal(d.observations.length, 5)
  assert.equal(d.advice.length, 4)
  assert.equal(d.summary.length, 200)
  assert.deepEqual(validateDiagnosis({ observations: [5, null, ' spots '] }).observations, ['spots'])
})

test('validateZoneCheck clamps to the zone status list', () => {
  assert.equal(validateZoneCheck({ status: 'thriving' }).status, 'unclear')
  assert.equal(validateZoneCheck({ status: 'Stressed' }).status, 'stressed')
  assert.equal(validateZoneCheck({ observations: ['a', 'b', 'c', 'd', 'e', 'f'] }).observations.length, 4)
})

test('worseZoneStatus is true only for a real step down', () => {
  assert.equal(worseZoneStatus('unhealthy', 'stressed'), true)
  assert.equal(worseZoneStatus('stressed', 'healthy'), true)
  assert.equal(worseZoneStatus('stressed', 'stressed'), false)
  assert.equal(worseZoneStatus('healthy', 'unhealthy'), false)
  assert.equal(worseZoneStatus('stressed', undefined), false)
  assert.equal(worseZoneStatus('unclear', 'healthy'), false)
})

test('isJpeg checks the magic bytes', () => {
  assert.equal(isJpeg(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])), true)
  assert.equal(isJpeg(Buffer.from([0x89, 0x50, 0x4E, 0x47])), false)
  assert.equal(isJpeg(Buffer.alloc(0)), false)
})

// ── eval/metrics: the numbers that go in the report ──────────────────────────

const { scoreRows, calibration, cohenKappa } = await import('../eval/metrics.js')
const row = (label, predicted, confidence = 0.9) => ({ label, predicted, confidence })

test('scoreRows counts "unclear" on a labelled image as wrong', () => {
  const rows = [row('healthy', 'healthy'), row('healthy', 'healthy'), row('fungal_disease', 'fungal_disease'), row('fungal_disease', 'unclear')]
  const s = scoreRows(rows, ['healthy', 'fungal_disease'], { minSupport: 2 })
  assert.equal(s.n, 4)
  assert.equal(s.accuracy, 0.75)
  assert.equal(s.coverage, 0.75)
  assert.equal(s.answeredAccuracy, 1)
  assert.equal(s.confusion.fungal_disease.unclear, 1)
  const fungal = s.perClass.find(c => c.label === 'fungal_disease')
  assert.equal(fungal.recall, 0.5)
  assert.equal(fungal.precision, 1)
})

test('scoreRows does not report classes below the minimum support', () => {
  const rows = [row('healthy', 'healthy'), row('healthy', 'healthy'), row('healthy', 'healthy'), row('pest_damage', 'healthy')]
  const s = scoreRows(rows, ['healthy', 'pest_damage', 'viral_disease'], { minSupport: 3 })
  assert.equal(s.perClass.find(c => c.label === 'healthy').reported, true)
  assert.equal(s.perClass.find(c => c.label === 'pest_damage').reported, false)
  assert.equal(s.perClass.find(c => c.label === 'viral_disease').support, 0)
  // macro-F1 averages reported classes only: healthy P=3/4 R=1 → F1 = 6/7
  assert.ok(Math.abs(s.macroF1 - 6 / 7) < 1e-9)
})

test('scoreRows gives a Wilson interval for accuracy', () => {
  const rows = [...Array(8).fill(row('healthy', 'healthy')), ...Array(2).fill(row('healthy', 'pest_damage'))]
  const [lo, hi] = scoreRows(rows, ['healthy', 'pest_damage']).wilson
  assert.ok(Math.abs(lo - 0.490) < 0.005, `lo ${lo}`)
  assert.ok(Math.abs(hi - 0.943) < 0.005, `hi ${hi}`)
})

test('calibration bins by confidence, with 1.0 in the top bin', () => {
  const bins = calibration([row('a', 'a', 0.95), row('a', 'b', 1.0), row('a', 'a', 0.31)])
  assert.equal(bins.length, 2)
  assert.deepEqual({ ...bins[1], lo: +bins[1].lo.toFixed(1) }, { lo: 0.9, hi: 1, n: 2, accuracy: 0.5 })
  assert.equal(bins[0].n, 1)
})

test('cohenKappa is 1 for identical ratings and 0 for chance agreement', () => {
  assert.equal(cohenKappa([['a', 'a'], ['b', 'b']]).kappa, 1)
  const k = cohenKappa([['a', 'a'], ['a', 'b'], ['b', 'a'], ['b', 'b']])
  assert.equal(k.kappa, 0)
  assert.equal(k.agreement, 0.5)
  assert.equal(k.matrix.a.b, 1)
})

// ── zoneVisualCheck: what one camera check writes and whether it alerts ──────

const { applyZoneCheck } = await import('../src/services/zoneVisualCheck.js')
const check = (status, confidence = 0.9) => ({ status, confidence, observations: ['o'], summary: 's' })
const meta = { model: 'm', promptV: '1' }

test('an unclear camera check changes nothing on the zone and never alerts', () => {
  const r = applyZoneCheck({ zone: { visualStatus: 'healthy', status: 'healthy' }, result: check('unclear'), meta })
  assert.equal(r.zoneUpdate, null)
  assert.equal(r.notification, null)
  assert.equal(r.snapshotVisual.status, 'unclear')
})

test('the first camera check sets the status without alerting', () => {
  const r = applyZoneCheck({ zone: { status: 'healthy' }, result: check('unhealthy'), meta })
  assert.equal(r.zoneUpdate.visualStatus, 'unhealthy')
  assert.equal(r.zoneUpdate.visualSummary, 's')
  assert.equal(r.notification, null)
})

test('a worsening camera status alerts only at or above the confidence threshold', () => {
  const zone = { visualStatus: 'healthy', status: 'healthy', zoneName: 'Herbs', userId: 'u1' }
  const sure = applyZoneCheck({ zone, result: check('stressed', 0.7), meta, minConfidence: 0.6 })
  assert.equal(sure.notification.type, 'threshold')
  assert.equal(sure.notification.severity, 'warn')
  assert.equal(sure.notification.userId, 'u1')
  assert.match(sure.notification.title, /Herbs/)
  const unsure = applyZoneCheck({ zone, result: check('stressed', 0.5), meta, minConfidence: 0.6 })
  assert.equal(unsure.notification, null)
  assert.equal(unsure.zoneUpdate.visualStatus, 'stressed')
  const better = applyZoneCheck({ zone: { ...zone, visualStatus: 'stressed' }, result: check('healthy'), meta })
  assert.equal(better.notification, null)
})

test('every camera check records the visual and sensor status of that hour', () => {
  const r = applyZoneCheck({ zone: { status: 'attention' }, result: check('healthy', 0.8), meta })
  assert.deepEqual(r.statsHour, { visualStatus: 'healthy', visualConfidence: 0.8, sensorStatus: 'attention' })
  assert.deepEqual(applyZoneCheck({ zone: {}, result: check('unclear', 0.2), meta }).statsHour,
    { visualStatus: 'unclear', visualConfidence: 0.2, sensorStatus: 'unknown' })
})
