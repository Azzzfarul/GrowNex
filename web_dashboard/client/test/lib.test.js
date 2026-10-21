// Pure-logic tests for src/lib (no browser, no Firebase): `npm test`.
// These modules are hand-ported to the mobile app — keep both sides passing the same cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChartData, describeTrend, buildOverviewSummary, moistureBucketSeries } from '../src/lib/analytics.js'
import { plantHealth, plantHealthSummary, compliancePercent } from '../src/lib/plantHealth.js'
import { plantZoneFit, zoneFitHint } from '../src/lib/zoneFit.js'

const HOUR = 3600000, DAY = 24 * HOUR
const reading = (ms, temperature) => ({ timestamp: new Date(ms), temperature })

// ── buildChartData ───────────────────────────────────────────────────────────

test('24h chart: the hour from yesterday and the current hour are separate points, oldest first', () => {
  const now = Date.now()
  const chart = buildChartData([reading(now - 23.9 * HOUR, 10), reading(now - 12 * HOUR, 20), reading(now, 30)], 'today')
  assert.deepEqual(chart.map(p => p.temp), [10, 20, 30])
  assert.ok(chart.every(p => /^\d\d:00$/.test(p.label)))
})

test('7-day chart: last week’s weekday and today are separate points, oldest first', () => {
  const now = Date.now()
  const chart = buildChartData([reading(now - 6.9 * DAY, 10), reading(now - 3 * DAY, 20), reading(now, 30)], '7days')
  assert.deepEqual(chart.map(p => p.temp), [10, 20, 30])
  assert.equal(chart[0].label, chart[2].label)  // same weekday name, different points
})

test('chart buckets average within a bucket and sort across zones', () => {
  const t = new Date(); t.setMinutes(30, 0, 0)
  const zoneA = [reading(t.getTime() - HOUR, 20), reading(t.getTime(), 22)]
  const zoneB = [reading(t.getTime() - 2 * HOUR, 18), reading(t.getTime(), 24)]  // "All zones" concatenates
  assert.deepEqual(buildChartData([...zoneA, ...zoneB], 'today').map(p => p.temp), [18, 20, 23])
})

test('moisture series averages the zone value with every slot', () => {
  assert.deepEqual(moistureBucketSeries([{ moisture: 40, soilMoisture1: 50 }, { moisture: null }]), [45, null])
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

test('overview summary leads with the worst metric', () => {
  const ok = { level: 'ok', text: 'fine' }
  const bad = { level: 'bad', text: 'Soil too dry' }
  const plants = [{ preferredMoistureMin: 40 }]
  assert.equal(buildOverviewSummary({ selectedZone: {}, plants, results: { temperature: ok, humidity: ok, moisture: bad } }).text, 'Soil too dry')
  assert.equal(buildOverviewSummary({ selectedZone: {}, plants, results: { temperature: ok, humidity: ok, moisture: ok } }).level, 'ok')
  assert.equal(buildOverviewSummary({ selectedZone: null, plants, results: {} }).level, 'none')
})

// ── plantHealth ──────────────────────────────────────────────────────────────

const basil = {
  slotNumber: 1,
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

test('plantHealth uses the plant’s own slot and weights moisture double', () => {
  const zone = { latestMoisture1: 50, latestMoisture: 10, latestTemp: 25 }
  const perfect = plantHealth(basil, zone, [{ soilMoisture1: 50, temperature: 25 }])
  assert.equal(perfect.score, 100)
  assert.equal(perfect.metrics.humidity.state, 'no-range')
  assert.equal(plantHealthSummary(perfect), 'All conditions in range.')

  const dry = plantHealth(basil, { ...zone, latestMoisture1: 20 }, [{ soilMoisture1: 20, temperature: 25 }])
  assert.equal(dry.worst, 'moisture')
  assert.equal(dry.metrics.moisture.state, 'low')
  assert.equal(dry.score, 33)  // moisture 0 (×2) + temperature 100 (×1)
  assert.match(plantHealthSummary(dry), /^Soil moisture below range — 20% vs 40–60%/)
})

test('a slot without its own probe falls back to the zone average', () => {
  const slot2 = { ...basil, slotNumber: 2 }
  const h = plantHealth(slot2, { latestMoisture: 50 }, [{ moisture: 50 }, { moisture: 10 }])
  assert.equal(h.metrics.moisture.compliance, 50)
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
