// Pure-logic tests for src/lib (no browser, no Firebase): `npm test`.
// These modules are hand-ported to the mobile app — keep both sides passing the same cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flattenDailyStats, buildChartData, describeTrend, buildOverviewSummary, moistureBucketSeries, healthScoreForPlant, generateInsights, plantStatus } from '../src/lib/analytics.js'
import { plantHealth, plantHealthSummary, compliancePercent } from '../src/lib/plantHealth.js'
import { plantZoneFit, zoneFitHint } from '../src/lib/zoneFit.js'
import { scheduleList, upsertSchedule } from '../src/lib/schedules.js'

const HOUR = 3600000, DAY = 24 * HOUR
const reading = (ms, temperature) => ({ timestamp: new Date(ms), temperature })

// ── flattenDailyStats ────────────────────────────────────────────────────────

test('flattenDailyStats turns daily docs into hourly readings, oldest first, from the cutoff on', () => {
  const t0 = Date.UTC(2026, 0, 1, 22)
  const days = [
    { hours: { '00': reading(t0 + 2 * HOUR, 21), '23': reading(t0 + HOUR, 23) } },  // keys out of order
    { hours: { '22': reading(t0, 22), '21': reading(t0 - HOUR, 99) } },
    { hours: { '05': { temperature: 1 } } },  // no timestamp: skipped
    {},                                        // no hours at all
  ]
  assert.deepEqual(flattenDailyStats(days, t0).map(r => r.temperature), [22, 23, 21])
  assert.deepEqual(flattenDailyStats([], 0), [])
})

// ── buildChartData ───────────────────────────────────────────────────────────

test('24h chart: the hour from yesterday and the current hour are separate points, oldest first', () => {
  const now = Date.now()
  const chart = buildChartData([reading(now - 23.9 * HOUR, 10), reading(now - 12 * HOUR, 20), reading(now, 30)], 'today')
  assert.deepEqual(chart.map(p => p.temp), [10, 20, 30])
  assert.ok(chart.every(p => /^\d\d:00$/.test(p.label)))
})

test('7-day chart: last week’s weekday and today are separate points, oldest first', () => {
  // Fixed local middays exactly one calendar week apart, so the weekdays never depend on run time.
  const day = (d) => new Date(2026, 0, d, 12).getTime()
  const chart = buildChartData([reading(day(7), 10), reading(day(11), 20), reading(day(14), 30)], '7days')
  assert.deepEqual(chart.map(p => p.temp), [10, 20, 30])
  assert.equal(chart[0].label, chart[2].label)  // same weekday name, different points
})

test('chart buckets average within a bucket and sort across zones', () => {
  const t = new Date(); t.setMinutes(30, 0, 0)
  const zoneA = [reading(t.getTime() - HOUR, 20), reading(t.getTime(), 22)]
  const zoneB = [reading(t.getTime() - 2 * HOUR, 18), reading(t.getTime(), 24)]  // "All zones" concatenates
  assert.deepEqual(buildChartData([...zoneA, ...zoneB], 'today').map(p => p.temp), [18, 20, 23])
})

test('moisture series is the zone reading; old per-slot fields are not counted again', () => {
  assert.deepEqual(moistureBucketSeries([{ moisture: 40, soilMoisture1: 50 }, { moisture: null }]), [40, null])
})

// ── describeTrend / buildOverviewSummary (rule-based fallback text) ───────────

test('describeTrend reports in-range, drifting and out-of-range series', () => {
  const pref = { min: 20, max: 30 }
  const d = (series) => describeTrend({ series, pref, timeRange: 'today', label: 'temperature', kind: 'temperature' })
  assert.equal(d([25, 25, 25, 25]).level, 'ok')
  assert.equal(d([22, 24, 26, 28, 29, 29]).text, 'Temperature climbing toward the high end')
  assert.equal(d([25, 25, 25, 31]).text, 'Temperature mostly fine — briefly out of range for about an hour')
  assert.equal(d([32, 33, 34, 25]).text, 'Too hot — above 30°C for about 3 hours')
  assert.equal(d([35, 35]).text, 'Too hot — above 30°C for the whole period')
  assert.equal(d([25]).level, 'none')
  assert.equal(describeTrend({ series: [1, 2, 3], pref: { min: null, max: null }, timeRange: '7days', label: 'humidity', kind: 'humidity' }).level, 'none')
})

test('light gets a trend-only summary', () => {
  const l = (series) => describeTrend({ series, pref: { min: null, max: null }, timeRange: 'today', label: 'light', kind: 'light' })
  assert.equal(l([30, 30, 31, 30]).text, 'Averaging 30% and steady')
  assert.equal(l([10, 20, 40, 60, 70, 80]).text, 'Averaging 47% and rising')
  assert.equal(l([10, 90]).text, 'Averaging 50%')  // two points: no direction claimed
  assert.equal(l([30]).text, 'Not enough readings yet to summarise light.')
})

test('overview without enough readings blames the readings, not a missing device', () => {
  const none = { level: 'none', text: '' }
  const results = { temperature: none, humidity: none, moisture: none }
  const plants = [{ preferredMoistureMin: 40 }]
  assert.equal(buildOverviewSummary({ selectedZone: { deviceId: 'd' }, plants, results }).text, 'Not enough readings yet for a summary.')
  assert.match(buildOverviewSummary({ selectedZone: {}, plants, results }).text, /connect a device/)
})

test('plant status follows the live health score', () => {
  const p = { preferredMoistureMin: 40, preferredMoistureMax: 60, preferredTemperatureMin: 20, preferredTemperatureMax: 30 }
  assert.equal(plantStatus({ latestMoisture: 50, latestTemp: 25 }, p), 'healthy')
  assert.equal(plantStatus({ latestMoisture: 90, latestTemp: 25 }, p), 'needs attention')
  assert.equal(plantStatus({ latestMoisture: 90, latestTemp: 40 }, p), 'critical')
  // A zone doc from before the change still carries a stale slot value: ignored.
  assert.equal(plantStatus({ latestMoisture: 50, latestMoisture1: 90, latestTemp: 25 }, { ...p, slotNumber: 1 }), 'healthy')
  assert.equal(plantStatus({}, p), null)
})

test('overview summary leads with the worst metric', () => {
  const ok = { level: 'ok', text: 'fine' }
  const bad = { level: 'bad', text: 'Soil too dry' }
  const plants = [{ preferredMoistureMin: 40 }]
  assert.equal(buildOverviewSummary({ selectedZone: {}, plants, results: { temperature: ok, humidity: ok, moisture: bad } }).text, 'Soil too dry')
  assert.equal(buildOverviewSummary({ selectedZone: {}, plants, results: { temperature: ok, humidity: ok, moisture: ok } }).level, 'ok')
  assert.equal(buildOverviewSummary({ selectedZone: null, plants, results: {} }).level, 'none')
})

test('a range missing its max is skipped, not scored or crashed on', () => {
  const p = { preferredMoistureMin: 40, preferredMoistureMax: 60, preferredTemperatureMin: 20 }
  const z = { latestMoisture: 50, latestTemp: 25 }
  assert.equal(healthScoreForPlant(z, p), 100)
  assert.deepEqual(generateInsights(z, [p], []).map(i => i.ok), [true])
  // Only half ranges: nothing was checked, so it must not claim everything is fine.
  const half = { preferredMoistureMin: 40, preferredTemperatureMin: 20 }
  assert.deepEqual(generateInsights(z, [half], [{ temperature: 25, moisture: 50 }]).map(i => i.ok), [null])
})

// ── plantHealth ──────────────────────────────────────────────────────────────

const basil = {
  preferredMoistureMin: 40, preferredMoistureMax: 60,
  preferredTemperatureMin: 20, preferredTemperatureMax: 30,
  preferredHumidityMin: null, preferredHumidityMax: null,
}

test('compliancePercent counts readings inside the range', () => {
  const rs = [{ t: 25 }, { t: 35 }, { t: null }, { t: 20 }]
  assert.equal(compliancePercent(rs, 't', 20, 30), 67)
  assert.equal(compliancePercent(rs, 't', null, 30), null)
  assert.equal(compliancePercent([], 't', 20, 30), null)
})

test('plantHealth judges the plant against the zone reading and weights moisture double', () => {
  const zone = { latestMoisture: 50, latestTemp: 25 }
  const perfect = plantHealth(basil, zone, [{ moisture: 50, temperature: 25 }])
  assert.equal(perfect.score, 100)
  assert.equal(perfect.metrics.humidity.state, 'no-range')
  assert.equal(plantHealthSummary(perfect), 'All conditions in range.')

  const dry = plantHealth(basil, { ...zone, latestMoisture: 20 }, [{ moisture: 20, temperature: 25 }])
  assert.equal(dry.worst, 'moisture')
  assert.equal(dry.metrics.moisture.state, 'low')
  assert.equal(dry.score, 33)  // moisture 0 (×2) + temperature 100 (×1)
  assert.match(plantHealthSummary(dry), /^Soil moisture below range — 20% vs 40–60%/)
})

test('old slot fields on plants, zones and history are ignored', () => {
  const old = { ...basil, slotNumber: 2 }
  const h = plantHealth(old, { latestMoisture: 50, latestMoisture2: 90 },
    [{ moisture: 50, soilMoisture2: 90 }, { moisture: 10, soilMoisture2: 90 }])
  assert.equal(h.metrics.moisture.compliance, 50)
  assert.equal(h.metrics.moisture.latest, 50)
})

test('plantHealth with no readings says it is waiting', () => {
  const h = plantHealth(basil, {}, [])
  assert.equal(h.score, null)
  assert.equal(plantHealthSummary(h), 'Waiting for readings.')
})

// ── zoneFit ──────────────────────────────────────────────────────────────────

const tropical = { preferredTemperatureMin: 24, preferredTemperatureMax: 32, preferredMoistureMin: 50, preferredMoistureMax: 70, preferredLightCondition: 'high' }
const cactus   = { preferredTemperatureMin: 5,  preferredTemperatureMax: 15, preferredMoistureMin: 5,  preferredMoistureMax: 20, preferredLightCondition: 'high' }

test('plantZoneFit is 1 for an identical plant and null for an empty zone', () => {
  assert.equal(plantZoneFit(tropical, [tropical]).fit, 1)
  assert.equal(plantZoneFit(tropical, []), null)
})

test('zoneFitHint suggests a better zone, a new zone, or nothing', () => {
  const zones = {
    hot:  { zone: { id: 'hot',  zoneName: 'Hot'  }, plants: [tropical] },
    cold: { zone: { id: 'cold', zoneName: 'Cold' }, plants: [cactus] },
  }
  assert.equal(zoneFitHint(tropical, 'hot', zones), null)
  const move = zoneFitHint(tropical, 'cold', zones)
  assert.equal(move.kind, 'move')
  assert.equal(move.zone.id, 'hot')
  assert.equal(zoneFitHint(tropical, 'cold', { cold: zones.cold }).kind, 'new')
})

// ── plant diagnosis labels (mobile: utils/plant_diagnosis.dart) ──────────────

import { CONDITIONS, conditionLabel, conditionTone, diagnosisError } from '../src/lib/plantDiagnosis.js'

test('every diagnosis condition has a readable label', () => {
  assert.equal(CONDITIONS.length, 10)
  for (const c of CONDITIONS) assert.match(conditionLabel(c), /^[A-Z][a-z /]+$/, c)
  assert.equal(conditionLabel('fungal_disease'), 'Fungal disease')
  assert.equal(conditionLabel('light_heat_stress'), 'Light / heat stress')
  assert.equal(conditionLabel('something_new'), 'Unclear')
})

test('conditionTone maps a diagnosis onto the status colours', () => {
  assert.equal(conditionTone('healthy', 'none'), 'healthy')
  assert.equal(conditionTone('unclear', 'none'), 'unknown')
  assert.equal(conditionTone('not_plant', 'none'), 'unknown')
  assert.equal(conditionTone('pest_damage', 'mild'), 'attention')
  assert.equal(conditionTone('pest_damage', 'moderate'), 'attention')
  assert.equal(conditionTone('fungal_disease', 'severe'), 'critical')
  assert.equal(conditionTone('stressed'), 'attention')    // zone check statuses use the same colours
  assert.equal(conditionTone('unhealthy'), 'critical')
})

test('diagnosisError explains each way a diagnosis can fail', () => {
  assert.equal(diagnosisError('limit'), 'Daily diagnosis limit reached. Try again tomorrow.')
  assert.equal(diagnosisError('image'), 'Use a JPEG photo under 1.5 MB.')
  assert.equal(diagnosisError('disabled'), 'Diagnosis unavailable right now.')
  assert.equal(diagnosisError('error'), 'Diagnosis unavailable right now.')
  assert.equal(diagnosisError(undefined), 'Diagnosis unavailable right now.')
})

test('flattenDailyStats ignores the camera check fields the server adds to an hour', () => {
  const t0 = Date.UTC(2026, 0, 1, 22)
  const days = [{ hours: {
    '22': { ...reading(t0, 22), visualStatus: 'stressed', visualConfidence: 0.7, sensorStatus: 'healthy' },
    '23': { visualStatus: 'healthy', visualConfidence: 0.9, sensorStatus: 'healthy' },  // camera only: no reading
  } }]
  assert.deepEqual(flattenDailyStats(days, t0).map(r => r.temperature), [22])
})

// ── schedules ────────────────────────────────────────────────────────────────

test('scheduleList reads old single-string configs and new lists', () => {
  assert.deepEqual(scheduleList('07:00'), ['07:00'])
  assert.deepEqual(scheduleList(['07:00', '18:00']), ['07:00', '18:00'])
  assert.deepEqual(scheduleList(null), [])
  assert.deepEqual(scheduleList(undefined), [])
  assert.deepEqual(scheduleList(''), [])
})

test('upsertSchedule adds, normalizes and sorts entries', () => {
  assert.deepEqual(upsertSchedule(['18:00'], 'water', ' 7:30 '), { list: ['07:30', '18:00'] })
  assert.deepEqual(upsertSchedule([], 'light', '8:00 - 18:00'), { list: ['08:00–18:00'] })
  assert.deepEqual(upsertSchedule(['MON 06:00', 'SUN 06:00'], 'fert', 'wed  7:00'), { list: ['MON 06:00', 'WED 07:00', 'SUN 06:00'] })
})

test('upsertSchedule edits in place without flagging the entry as its own duplicate', () => {
  assert.deepEqual(upsertSchedule(['07:00', '18:00'], 'water', '07:00', 0), { list: ['07:00', '18:00'] })
  assert.deepEqual(upsertSchedule(['07:00', '18:00'], 'water', '20:00', 0), { list: ['18:00', '20:00'] })
  assert.match(upsertSchedule(['07:00', '18:00'], 'water', '18:00', 0).error, /already/)
})

test('upsertSchedule rejects bad formats and duplicates', () => {
  assert.match(upsertSchedule([], 'water', '7am').error, /07:00/)
  assert.match(upsertSchedule([], 'water', '24:00').error, /07:00/)
  assert.match(upsertSchedule([], 'light', '08:00').error, /08:00–18:00/)
  assert.match(upsertSchedule([], 'fert', 'monday 6').error, /MON 06:00/)
  assert.match(upsertSchedule(['07:00'], 'water', '7:00').error, /already/)
  assert.match(upsertSchedule(['7:00'], 'water', '07:00').error, /already/)   // old unpadded entry
})

test('upsertSchedule rejects light windows that overlap, touch or have no length', () => {
  assert.match(upsertSchedule([], 'light', '08:00–08:00').error, /different time/)
  assert.match(upsertSchedule(['08:00–12:00'], 'light', '11:00–14:00').error, /overlaps or touches 08:00–12:00/)
  assert.match(upsertSchedule(['22:00–02:00'], 'light', '01:00–03:00').error, /overlaps/)   // past midnight
  assert.match(upsertSchedule(['08:00-12:00'], 'light', '09:00–10:00').error, /overlaps/)   // old hyphen entry
  assert.match(upsertSchedule(['08:00–12:00'], 'light', '12:00–14:00').error, /touches/)
  assert.match(upsertSchedule(['22:00–02:00'], 'light', '02:00–06:00').error, /touches/)
  assert.match(upsertSchedule(['20:00–00:00'], 'light', '00:00–05:00').error, /touches/)   // at midnight
  assert.deepEqual(upsertSchedule(['08:00–12:00'], 'light', '12:01–14:00'), { list: ['08:00–12:00', '12:01–14:00'] })
  assert.deepEqual(upsertSchedule(['22:00–02:00'], 'light', '02:01–06:00'), { list: ['02:01–06:00', '22:00–02:00'] })
  assert.deepEqual(upsertSchedule(['20:00–00:00'], 'light', '06:00–10:00'), { list: ['06:00–10:00', '20:00–00:00'] })
  // editing a window may move it over its own old slot
  assert.deepEqual(upsertSchedule(['08:00–12:00'], 'light', '09:00–13:00', 0), { list: ['09:00–13:00'] })
})
