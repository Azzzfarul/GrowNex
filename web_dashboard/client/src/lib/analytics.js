import { compliancePercent } from './plantHealth.js'

// Pure helpers for pages/AnalyticsPage.jsx. Hand-ported to mobile screens/analytics/analytics_screen.dart.

export function avg(arr) {
  const v = arr.filter(x => x != null)
  return v.length ? Math.round(v.reduce((a, b) => a + b) / v.length * 10) / 10 : null
}

export function avgPref(plants, minField, maxField) {
  const mins = plants.filter(p => p[minField] != null).map(p => p[minField])
  const maxs = plants.filter(p => p[maxField] != null).map(p => p[maxField])
  return {
    min: mins.length ? mins.reduce((a, b) => a + b) / mins.length : null,
    max: maxs.length ? maxs.reduce((a, b) => a + b) / maxs.length : null,
  }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Buckets by local calendar hour ('today' = last 24h) or calendar day ('7days'), oldest first.
// Keyed by the full date, not just "14:00"/"Wed": the window spans 25 hours / 8 days, so a label-only
// key merged the oldest partial bucket with the newest one and plotted today's data first.
export function buildChartData(readings, timeRange) {
  const pad = n => String(n).padStart(2, '0')
  const buckets = {}
  for (const r of readings) {
    const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
    const day = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`
    const key = timeRange === 'today' ? `${day}T${pad(ts.getHours())}` : day
    if (!buckets[key]) {
      buckets[key] = {
        label: timeRange === 'today' ? `${pad(ts.getHours())}:00` : DAY_LABELS[ts.getDay()],
        temp: [], humidity: [], light: [], moisture: [], sm1: [], sm2: [], sm3: [], sm4: [],
      }
    }
    const b = buckets[key]
    if (r.temperature   != null) b.temp.push(r.temperature)
    if (r.humidity      != null) b.humidity.push(r.humidity)
    if (r.lightLevel    != null) b.light.push(r.lightLevel)
    if (r.moisture      != null) b.moisture.push(r.moisture)
    if (r.soilMoisture1 != null) b.sm1.push(r.soilMoisture1)
    if (r.soilMoisture2 != null) b.sm2.push(r.soilMoisture2)
    if (r.soilMoisture3 != null) b.sm3.push(r.soilMoisture3)
    if (r.soilMoisture4 != null) b.sm4.push(r.soilMoisture4)
  }
  // Sorted by key: "All zones" concatenates several zones' readings, so insertion order isn't time order.
  return Object.keys(buckets).sort().map((key) => {
    const v = buckets[key]
    return {
      label:         v.label,
      temp:          avg(v.temp),
      humidity:      avg(v.humidity),
      light:         avg(v.light),
      moisture:      avg(v.moisture),
      soilMoisture1: avg(v.sm1),
      soilMoisture2: avg(v.sm2),
      soilMoisture3: avg(v.sm3),
      soilMoisture4: avg(v.sm4),
    }
  })
}

// ── AI summary fallback (rule-based, trend-aware) ─────────────────────────────

function formatOutOfRangeDuration(n, timeRange, totalBuckets) {
  if (totalBuckets != null && n >= totalBuckets) return 'the whole period'
  if (timeRange === 'today') return n <= 1 ? 'about an hour' : `about ${n} hours`
  return n <= 1 ? 'about a day' : `about ${n} days`
}

function meanOf(arr) {
  const v = arr.filter(x => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function seriesDirection(series, pref) {
  const v = series.filter(x => x != null)
  if (v.length < 3) return 'flat'
  const third = Math.max(1, Math.floor(v.length / 3))
  const firstMean = meanOf(v.slice(0, third))
  const lastMean  = meanOf(v.slice(-third))
  if (firstMean == null || lastMean == null) return 'flat'
  const span = (pref.min != null && pref.max != null) ? pref.max - pref.min : Math.abs(firstMean) || 1
  const eps = Math.max(0.3, span * 0.02)
  const delta = lastMean - firstMean
  if (delta >  eps) return 'rising'
  if (delta < -eps) return 'falling'
  return 'flat'
}

const TREND_TEXT = {
  temperature: {
    badHigh:  (max, dur) => `Too hot — above ${max}°C for ${dur}`,
    badLow:   (min, dur) => `Too cold — below ${min}°C for ${dur}`,
    warnFall: 'Temperature drifting down, near the low end',
    warnRise: 'Temperature climbing toward the high end',
    warnBrief: dur => `Temperature mostly fine — briefly out of range for ${dur}`,
    ok: 'Stable and within the ideal range',
  },
  humidity: {
    badHigh:  (max, dur) => `Too humid — above ${max}% for ${dur}`,
    badLow:   (min, dur) => `Air too dry — below ${min}% for ${dur}`,
    warnFall: 'Humidity drifting down, near the low end',
    warnRise: 'Humidity climbing toward the high end',
    warnBrief: dur => `Humidity mostly fine — briefly out of range for ${dur}`,
    ok: 'Stable and within the ideal range',
  },
  moisture: {
    badHigh:  (max, dur) => `Soil too wet — above ${max}% for ${dur}`,
    badLow:   (min, dur) => `Soil too dry — below ${min}% for ${dur}`,
    warnFall: 'Soil drying out, near the low end',
    warnRise: 'Soil getting wet, near the high end',
    warnBrief: dur => `Soil moisture mostly fine — briefly out of range for ${dur}`,
    ok: 'Stable and within the ideal range',
  },
}

// series: ordered (number|null)[] of bucketed averages; pref: {min,max} (nullable)
// timeRange: 'today' (1 bucket = 1h) | '7days' (1 bucket = 1 day)
export function describeTrend({ series, pref, timeRange, label, kind }) {
  if (kind === 'light')
    return { level: 'none', text: "Light sensor data isn't available yet." }

  const nonNull = series.filter(x => x != null)
  if (nonNull.length < 2)
    return { level: 'none', text: `Not enough readings yet to summarise ${label}.` }
  if (pref.min == null || pref.max == null)
    return { level: 'none', text: `Set plant preferred ${label} range to get a summary.` }

  const t     = TREND_TEXT[kind]
  const above = nonNull.filter(v => v > pref.max).length
  const below = nonNull.filter(v => v < pref.min).length
  const out   = above + below
  const total = nonNull.length
  const dir   = seriesDirection(series, pref)

  if (out === 0) {
    if (dir === 'falling') return { level: 'warn', text: t.warnFall }
    if (dir === 'rising')  return { level: 'warn', text: t.warnRise }
    return { level: 'ok', text: t.ok }
  }
  if (out < total / 2)
    return { level: 'warn', text: t.warnBrief(formatOutOfRangeDuration(out, timeRange, total)) }

  const highSide = above >= below
  const count = highSide ? above : below
  const dur = formatOutOfRangeDuration(count, timeRange, total)
  return highSide
    ? { level: 'bad', text: t.badHigh(Math.round(pref.max), dur) }
    : { level: 'bad', text: t.badLow(Math.round(pref.min), dur) }
}

// Combined moisture series: per bucket, mean of moisture + soilMoisture1..4
export function moistureBucketSeries(chartData) {
  return chartData.map(d => {
    const v = [d.moisture, d.soilMoisture1, d.soilMoisture2, d.soilMoisture3, d.soilMoisture4]
      .filter(x => x != null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null
  })
}

export function buildOverviewSummary({ selectedZone, plants, results }) {
  if (!selectedZone)
    return { level: 'none', text: 'Showing all zones. Pick a single zone for a detailed summary.' }
  if (!plants.length)
    return { level: 'none', text: 'Add plants with preferred conditions to see insights.' }

  const rank = { bad: 3, warn: 2, ok: 1, none: 0 }
  const ranked = [results.temperature, results.humidity, results.moisture]
    .filter(r => r && r.level !== 'none')
    .sort((a, b) => rank[b.level] - rank[a.level])

  if (!ranked.length) {
    const hasPrefs = plants.some(p =>
      p.preferredTemperatureMin != null || p.preferredHumidityMin != null || p.preferredMoistureMin != null)
    return hasPrefs
      ? { level: 'none', text: 'No sensor readings for this zone yet — connect a device to start monitoring.' }
      : { level: 'none', text: 'Add plants with preferred conditions to see insights.' }
  }
  if (ranked[0].level === 'ok')
    return { level: 'ok', text: 'Stable and within the ideal range across temperature, humidity and soil moisture.' }
  return { level: ranked[0].level, text: ranked[0].text }
}

export function getMoistureLines(plants, readings, isAllZones) {
  if (isAllZones) return [{ key: 'moisture', name: 'Avg Moisture', color: '#3b82f6' }]
  const colors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7']
  const lines = []
  for (let slot = 1; slot <= 4; slot++) {
    const key = `soilMoisture${slot}`
    if (!readings.some(r => r[key] != null)) continue
    const plant = plants.find(p => p.slotNumber === slot)
    lines.push({ key, name: plant ? plant.plantName : `Slot ${slot}`, color: colors[slot - 1] })
  }
  return lines.length ? lines : [{ key: 'moisture', name: 'Moisture', color: '#3b82f6' }]
}

export function healthScoreForPlant(zone, plant) {
  const scores = []
  const moisture = zone[`latestMoisture${plant.slotNumber}`] ?? zone.latestMoisture
  if (plant.preferredMoistureMin != null && moisture != null)
    scores.push(moisture >= plant.preferredMoistureMin && moisture <= plant.preferredMoistureMax ? 1 : 0)
  if (plant.preferredTemperatureMin != null && zone.latestTemp != null)
    scores.push(zone.latestTemp >= plant.preferredTemperatureMin && zone.latestTemp <= plant.preferredTemperatureMax ? 1 : 0)
  if (plant.preferredHumidityMin != null && zone.latestHumid != null)
    scores.push(zone.latestHumid >= plant.preferredHumidityMin && zone.latestHumid <= plant.preferredHumidityMax ? 1 : 0)
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b) / scores.length * 100)
}

export function zoneHealthScore(zone, plants) {
  const scores = plants.map(p => healthScoreForPlant(zone, p)).filter(s => s != null)
  return scores.length ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : null
}


export function generateInsights(zone, plants, readings) {
  if (!plants.length)
    return [{ ok: null, text: 'Add plants with preferred conditions to see insights.' }]

  // Nothing to evaluate yet — no live values on the zone and no history.
  const hasLatest = zone.latestTemp != null || zone.latestHumid != null || zone.latestMoisture != null
  if (!hasLatest && !readings.length)
    return [{ ok: null, text: 'No sensor readings for this zone yet. Connect a device to start monitoring.' }]

  const moist = avgPref(plants, 'preferredMoistureMin', 'preferredMoistureMax')
  const temp  = avgPref(plants, 'preferredTemperatureMin', 'preferredTemperatureMax')
  const humid = avgPref(plants, 'preferredHumidityMin', 'preferredHumidityMax')
  const insights = []

  if (moist.min != null && zone.latestMoisture != null) {
    if (zone.latestMoisture < moist.min)
      insights.push({ ok: false, text: `Soil moisture (${zone.latestMoisture}%) is below the preferred minimum of ${moist.min.toFixed(0)}%. Consider increasing watering frequency.` })
    else if (zone.latestMoisture > moist.max)
      insights.push({ ok: false, text: `Soil moisture (${zone.latestMoisture}%) exceeds the preferred maximum of ${moist.max.toFixed(0)}%. Reduce watering frequency.` })
  }
  if (temp.min != null && zone.latestTemp != null) {
    if (zone.latestTemp < temp.min || zone.latestTemp > temp.max)
      insights.push({ ok: false, text: `Temperature (${zone.latestTemp}°C) is outside the preferred range of ${temp.min.toFixed(0)}–${temp.max.toFixed(0)}°C.` })
  }
  if (humid.min != null && zone.latestHumid != null) {
    if (zone.latestHumid < humid.min || zone.latestHumid > humid.max)
      insights.push({ ok: false, text: `Humidity (${zone.latestHumid}%) is outside the preferred range of ${humid.min.toFixed(0)}–${humid.max.toFixed(0)}%.` })
  }

  const tempComp  = compliancePercent(readings, 'temperature', temp.min, temp.max)
  const moistComp = compliancePercent(readings, 'moisture', moist.min, moist.max)
  const humidComp = compliancePercent(readings, 'humidity', humid.min, humid.max)

  if (tempComp  != null && tempComp  < 70) insights.push({ ok: false, text: `Temperature was outside the preferred range ${100 - tempComp}% of the time in the selected period.` })
  if (moistComp != null && moistComp < 70) insights.push({ ok: false, text: `Soil moisture was outside the preferred range ${100 - moistComp}% of the time.` })
  if (humidComp != null && humidComp < 70) insights.push({ ok: false, text: `Humidity was outside the preferred range ${100 - humidComp}% of the time.` })

  if (!insights.length)
    insights.push({ ok: true, text: 'All conditions are within preferred ranges. Your plants are doing well.' })

  return insights
}

export function scoreColor(s) {
  if (s >= 80) return 'text-green-600'
  if (s >= 60) return 'text-yellow-500'
  if (s >= 40) return 'text-orange-500'
  return 'text-red-500'
}

export function scoreBadge(s) {
  if (s >= 80) return 'bg-green-100 text-green-700'
  if (s >= 60) return 'bg-yellow-100 text-yellow-700'
  if (s >= 40) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

export function scoreLabel(s) {
  if (s >= 80) return 'Excellent'
  if (s >= 60) return 'Good'
  if (s >= 40) return 'Fair'
  return 'Poor'
}
