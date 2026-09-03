import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { fetchAiSummary } from '../lib/aiSummary'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

// ── Pure helpers ──────────────────────────────────────────────────────────────

function avg(arr) {
  const v = arr.filter(x => x != null)
  return v.length ? Math.round(v.reduce((a, b) => a + b) / v.length * 10) / 10 : null
}

function avgPref(plants, minField, maxField) {
  const mins = plants.filter(p => p[minField] != null).map(p => p[minField])
  const maxs = plants.filter(p => p[maxField] != null).map(p => p[maxField])
  return {
    min: mins.length ? mins.reduce((a, b) => a + b) / mins.length : null,
    max: maxs.length ? maxs.reduce((a, b) => a + b) / maxs.length : null,
  }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildChartData(readings, timeRange) {
  const buckets = {}
  for (const r of readings) {
    const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
    const label = timeRange === 'today'
      ? `${String(ts.getHours()).padStart(2, '0')}:00`
      : DAY_LABELS[ts.getDay()]
    if (!buckets[label]) {
      buckets[label] = { temp: [], humidity: [], light: [], moisture: [], sm1: [], sm2: [], sm3: [], sm4: [] }
    }
    if (r.temperature   != null) buckets[label].temp.push(r.temperature)
    if (r.humidity      != null) buckets[label].humidity.push(r.humidity)
    if (r.lightLevel    != null) buckets[label].light.push(r.lightLevel)
    if (r.moisture      != null) buckets[label].moisture.push(r.moisture)
    if (r.soilMoisture1 != null) buckets[label].sm1.push(r.soilMoisture1)
    if (r.soilMoisture2 != null) buckets[label].sm2.push(r.soilMoisture2)
    if (r.soilMoisture3 != null) buckets[label].sm3.push(r.soilMoisture3)
    if (r.soilMoisture4 != null) buckets[label].sm4.push(r.soilMoisture4)
  }
  return Object.entries(buckets).map(([label, v]) => ({
    label,
    temp:          avg(v.temp),
    humidity:      avg(v.humidity),
    light:         avg(v.light),
    moisture:      avg(v.moisture),
    soilMoisture1: avg(v.sm1),
    soilMoisture2: avg(v.sm2),
    soilMoisture3: avg(v.sm3),
    soilMoisture4: avg(v.sm4),
  }))
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
function describeTrend({ series, pref, timeRange, label, kind }) {
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
function moistureBucketSeries(chartData) {
  return chartData.map(d => {
    const v = [d.moisture, d.soilMoisture1, d.soilMoisture2, d.soilMoisture3, d.soilMoisture4]
      .filter(x => x != null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null
  })
}

function buildOverviewSummary({ selectedZone, plants, results }) {
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

function getMoistureLines(plants, readings, isAllZones) {
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

function healthScoreForPlant(zone, plant) {
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

function zoneHealthScore(zone, plants) {
  const scores = plants.map(p => healthScoreForPlant(zone, p)).filter(s => s != null)
  return scores.length ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : null
}

function compliancePercent(readings, field, min, max) {
  if (min == null || max == null) return null
  const valid = readings.filter(r => r[field] != null)
  if (!valid.length) return null
  return Math.round(valid.filter(r => r[field] >= min && r[field] <= max).length / valid.length * 100)
}

function generateInsights(zone, plants, readings) {
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

function scoreColor(s) {
  if (s >= 80) return 'text-green-600'
  if (s >= 60) return 'text-yellow-500'
  if (s >= 40) return 'text-orange-500'
  return 'text-red-500'
}

function scoreBadge(s) {
  if (s >= 80) return 'bg-green-100 text-green-700'
  if (s >= 60) return 'bg-yellow-100 text-yellow-700'
  if (s >= 40) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function scoreLabel(s) {
  if (s >= 80) return 'Excellent'
  if (s >= 60) return 'Good'
  if (s >= 40) return 'Fair'
  return 'Poor'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, caption, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className={`font-semibold text-gray-800 ${caption ? 'mb-1' : 'mb-4'}`}>{title}</h3>
      {caption && <div className="mb-3">{caption}</div>}
      {children}
    </div>
  )
}

function SummaryLine({ text, isAi, variant }) {
  return (
    <div className={`flex items-start gap-2 ${variant === 'card' ? 'text-sm text-gray-600' : 'text-xs text-gray-500'}`}>
      <span
        className={`shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
          isAi ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {isAi ? 'AI' : 'Auto'}
      </span>
      <span>{text}</span>
    </div>
  )
}

function EmptyChart() {
  return <p className="text-sm text-gray-400 text-center py-8">No readings in this period.</p>
}

function ComplianceBar({ label, value }) {
  if (value == null) return null
  const bar = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [zones,           setZones]           = useState([])
  const [selectedZoneId,  setSelectedZoneId]  = useState('all')
  const [timeRange,       setTimeRange]       = useState('7days')
  const [readings,        setReadings]        = useState([])
  const [plants,          setPlants]          = useState([])
  const [loadingZones,    setLoadingZones]    = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(false)
  const [aiSummaries,     setAiSummaries]     = useState({})

  // Live zone subscription
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      snap => {
        setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoadingZones(false)
      }
    )
  }, [user])

  // Fetch readings + plants when zone selection or time range changes
  useEffect(() => {
    if (!zones.length) return
    setLoadingReadings(true)

    const cutoff = new Date()
    if (timeRange === 'today') cutoff.setHours(cutoff.getHours() - 24)
    else cutoff.setDate(cutoff.getDate() - 7)
    const cutoffTs = Timestamp.fromDate(cutoff)

    const targets = selectedZoneId === 'all' ? zones : zones.filter(z => z.id === selectedZoneId)

    Promise.all([
      Promise.all(
        targets.map(z =>
          getDocs(query(
            collection(db, 'zones', z.id, 'stats'),
            where('timestamp', '>=', cutoffTs),
            orderBy('timestamp', 'asc'),
          )).then(s => s.docs.map(d => d.data()))
        )
      ).then(arr => arr.flat()),

      Promise.all(
        targets.map(z =>
          getDocs(query(collection(db, 'plants'), where('zoneId', '==', z.id)))
            .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
        )
      ).then(arr => arr.flat()),
    ]).then(([r, p]) => {
      setReadings(r)
      setPlants(p)
      setLoadingReadings(false)
    })
  }, [zones, selectedZoneId, timeRange])

  // Fetch the AI analytics summary — one server call per zone/time-range; any
  // failure leaves aiSummaries empty and the UI shows the rule-based text.
  useEffect(() => {
    if (selectedZoneId === 'all' || !user) { setAiSummaries({}); return }
    const zone = zones.find(z => z.id === selectedZoneId)
    if (!zone) { setAiSummaries({}); return }

    let cancelled = false
    const cd    = buildChartData(readings, timeRange)
    const tPref = avgPref(plants, 'preferredTemperatureMin', 'preferredTemperatureMax')
    const hPref = avgPref(plants, 'preferredHumidityMin',    'preferredHumidityMax')
    const mPref = avgPref(plants, 'preferredMoistureMin',    'preferredMoistureMax')
    const tRes  = describeTrend({ series: cd.map(d => d.temp),      pref: tPref, timeRange, label: 'temperature',   kind: 'temperature' })
    const hRes  = describeTrend({ series: cd.map(d => d.humidity),  pref: hPref, timeRange, label: 'humidity',      kind: 'humidity' })
    const lRes  = describeTrend({ series: cd.map(d => d.light),     pref: { min: null, max: null }, timeRange, label: 'light', kind: 'light' })
    const mRes  = describeTrend({ series: moistureBucketSeries(cd), pref: mPref, timeRange, label: 'soil moisture', kind: 'moisture' })

    const payload = {
      zoneId: selectedZoneId,
      timeRange,
      labels: cd.map(d => d.label),
      series: {
        temperature: cd.map(d => d.temp),
        humidity:    cd.map(d => d.humidity),
        light:       cd.map(d => d.light),
        moisture:    moistureBucketSeries(cd),
      },
      prefs: { temperature: tPref, humidity: hPref, moisture: mPref },
      latest: {
        temp:     zone.latestTemp     ?? null,
        humid:    zone.latestHumid    ?? null,
        light:    zone.latestLight    ?? null,
        moisture: zone.latestMoisture ?? null,
      },
      plants: plants.map(p => ({ name: p.plantName, species: p.species ?? null, slotNumber: p.slotNumber ?? null })),
      ruleResults: {
        overview:    buildOverviewSummary({ selectedZone: zone, plants, results: { temperature: tRes, humidity: hRes, moisture: mRes } }).text,
        temperature: tRes.text,
        humidity:    hRes.text,
        light:       lRes.text,
        moisture:    mRes.text,
      },
    }

    user.getIdToken()
      .then(tok => fetchAiSummary(tok, payload))
      .then(r => { if (!cancelled) setAiSummaries(r) })
      .catch(() => { if (!cancelled) setAiSummaries({}) })

    return () => { cancelled = true }
  }, [zones, selectedZoneId, timeRange, readings, plants, user])

  if (loadingZones) return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>

  const isAllZones   = selectedZoneId === 'all'
  const selectedZone = isAllZones ? null : zones.find(z => z.id === selectedZoneId)
  const activeZones  = isAllZones ? zones : zones.filter(z => z.id === selectedZoneId)

  // Summary card values from live latestXxx fields
  const avgTemp     = avg(activeZones.map(z => z.latestTemp).filter(v => v != null))
  const avgHumid    = avg(activeZones.map(z => z.latestHumid).filter(v => v != null))
  const avgLight    = avg(activeZones.map(z => z.latestLight).filter(v => v != null))
  const avgMoisture = avg(activeZones.map(z => z.latestMoisture).filter(v => v != null))

  // Plants Healthy count
  const plantScores  = plants.map(p => {
    const zone = zones.find(z => z.id === p.zoneId)
    return zone ? healthScoreForPlant(zone, p) : null
  }).filter(s => s != null)
  const healthyCount = plantScores.filter(s => s >= 70).length

  // Chart data
  const chartData     = buildChartData(readings, timeRange)
  const moistureLines = getMoistureLines(plants, readings, isAllZones)
  const noReadings    = chartData.length === 0

  // Zone-specific computations (only when a specific zone is selected)
  const score     = selectedZone ? zoneHealthScore(selectedZone, plants) : null
  const moistPref = avgPref(plants, 'preferredMoistureMin',    'preferredMoistureMax')
  const tempPref  = avgPref(plants, 'preferredTemperatureMin', 'preferredTemperatureMax')
  const humidPref = avgPref(plants, 'preferredHumidityMin',    'preferredHumidityMax')
  const compTemp  = selectedZone ? compliancePercent(readings, 'temperature', tempPref.min, tempPref.max)  : null
  const compMoist = selectedZone ? compliancePercent(readings, 'moisture',    moistPref.min, moistPref.max) : null
  const compHumid = selectedZone ? compliancePercent(readings, 'humidity',    humidPref.min, humidPref.max) : null

  const ranking = selectedZone
    ? plants
        .map(p => ({ plant: p, score: healthScoreForPlant(selectedZone, p) }))
        .filter(x => x.score != null)
        .sort((a, b) => b.score - a.score)
    : []

  const insights = selectedZone ? generateInsights(selectedZone, plants, readings) : []

  // Per-graph + overview summaries (AI value preferred, rule-based fallback otherwise)
  const tempRes  = describeTrend({ series: chartData.map(d => d.temp),     pref: tempPref,  timeRange, label: 'temperature',   kind: 'temperature' })
  const humidRes = describeTrend({ series: chartData.map(d => d.humidity), pref: humidPref, timeRange, label: 'humidity',      kind: 'humidity' })
  const lightRes = describeTrend({ series: chartData.map(d => d.light),    pref: { min: null, max: null }, timeRange, label: 'light', kind: 'light' })
  const moistRes = describeTrend({ series: moistureBucketSeries(chartData), pref: moistPref, timeRange, label: 'soil moisture', kind: 'moisture' })
  const overviewRes = buildOverviewSummary({
    selectedZone, plants,
    results: { temperature: tempRes, humidity: humidRes, moisture: moistRes },
  })
  const graphRes = { temperature: tempRes, humidity: humidRes, light: lightRes, moisture: moistRes }

  // AI summary result ({} until loaded / for All Zones). Prefer AI text, fall back to rules.
  const aiMap    = aiSummaries.summaries || {}
  const aiAdvice = Array.isArray(aiSummaries.advice) ? aiSummaries.advice : []
  const aiActive = !!aiSummaries.source && aiSummaries.source !== 'fallback' && aiSummaries.source !== 'error'

  return (
    <div className="space-y-5">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track plant health and growing conditions.</p>
        </div>
        <select
          value={selectedZoneId}
          onChange={e => setSelectedZoneId(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="all">All Zones</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
        </select>
        <div className="flex border border-gray-200 rounded-xl overflow-hidden text-sm">
          {['today', '7days'].map(t => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-4 py-2 font-medium transition-colors ${timeRange === t ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t === 'today' ? 'Today' : '7 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Avg Temperature" value={avgTemp     != null ? `${avgTemp}°C`    : null} />
        <MetricCard label="Avg Humidity"    value={avgHumid    != null ? `${avgHumid}%`    : null} />
        <MetricCard label="Avg Light"       value={avgLight    != null ? `${avgLight} lx`  : null} />
        <MetricCard label="Avg Moisture"    value={avgMoisture != null ? `${avgMoisture}%` : null} />
        <MetricCard
          label="Plants Healthy"
          value={plantScores.length > 0 ? `${healthyCount} / ${plantScores.length}` : null}
          sub={plantScores.length === 0 ? 'Set plant preferences first' : undefined}
        />
      </div>

      {/* AI Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-800 mb-3">AI Summary</h3>
        <SummaryLine
          variant="card"
          text={aiMap.overview ?? overviewRes.text}
          isAi={aiMap.overview != null}
        />
        {aiActive && aiAdvice.length > 0 ? (
          <div className="space-y-2.5 mt-3">
            {aiAdvice.map((a, i) => (
              <div
                key={i}
                className={`flex gap-2.5 text-sm p-3 rounded-xl ${
                  a.severity === 'critical' ? 'bg-red-50 text-red-800'      :
                  a.severity === 'warn'     ? 'bg-orange-50 text-orange-800' :
                                              'bg-gray-50 text-gray-600'
                }`}
              >
                <span className="shrink-0">{a.severity === 'critical' ? '🚨' : a.severity === 'warn' ? '⚠️' : 'ℹ️'}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        ) : selectedZone && insights.length > 0 ? (
          <div className="space-y-2.5 mt-3">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`flex gap-2.5 text-sm p-3 rounded-xl ${
                  ins.ok === true  ? 'bg-green-50 text-green-800'   :
                  ins.ok === false ? 'bg-orange-50 text-orange-800' :
                                     'bg-gray-50 text-gray-600'
                }`}
              >
                <span className="shrink-0">{ins.ok === true ? '✅' : ins.ok === false ? '⚠️' : 'ℹ️'}</span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {loadingReadings && (
        <p className="text-sm text-gray-400 text-center py-4">Loading readings…</p>
      )}

      {/* Trend charts */}
      {!loadingReadings && (
        <div className="space-y-4">
          {[
            { title: 'Temperature (°C)', key: 'temp',     color: '#f97316', kind: 'temperature' },
            { title: 'Humidity (%)',     key: 'humidity', color: '#22c55e', kind: 'humidity' },
            { title: 'Light (lx)',       key: 'light',    color: '#eab308', kind: 'light' },
          ].map(({ title, key, color, kind }) => (
            <ChartCard
              key={key}
              title={title}
              caption={
                <SummaryLine
                  text={aiMap[kind] ?? graphRes[kind].text}
                  isAi={aiMap[kind] != null}
                />
              }
            >
              {noReadings ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip />
                    <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          ))}

          <ChartCard
            title="Soil Moisture (%)"
            caption={
              <SummaryLine
                text={aiMap.moisture ?? moistRes.text}
                isAi={aiMap.moisture != null}
              />
            }
          >
            {noReadings ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  {moistureLines.length > 1 && <Legend />}
                  {moistureLines.map(({ key, name, color }) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} name={name} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      {/* Zone-specific sections */}
      {selectedZone && !loadingReadings && (
        <div className="space-y-4">
          {/* Health Score */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Zone Health Score</h3>
            {score == null ? (
              <p className="text-sm text-gray-400">Add plants with preferred conditions to compute a health score.</p>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <span className={`text-5xl font-bold ${scoreColor(score)}`}>{score}%</span>
                <span className={`text-sm font-semibold px-3 py-1 rounded-full ${scoreBadge(score)}`}>
                  {scoreLabel(score)}
                </span>
                <p className="text-sm text-gray-400">Based on current readings vs plant preferred conditions.</p>
              </div>
            )}
          </div>

          {/* Compliance */}
          {(compTemp != null || compMoist != null || compHumid != null) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Compliance Analysis</h3>
              <p className="text-xs text-gray-400 mb-4">% of historical readings within the preferred range averaged across plants.</p>
              <div className="space-y-4">
                <ComplianceBar label="Temperature"   value={compTemp} />
                <ComplianceBar label="Humidity"      value={compHumid} />
                <ComplianceBar label="Soil Moisture" value={compMoist} />
              </div>
            </div>
          )}

          {/* Plant Ranking */}
          {ranking.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Plant Ranking</h3>
              <div className="space-y-3">
                {ranking.map(({ plant, score: s }, i) => (
                  <div key={plant.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 w-5 text-right">{i + 1}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800">{plant.plantName}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scoreBadge(s)}`}>{s}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
