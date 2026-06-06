import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
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

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
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

      {loadingReadings && (
        <p className="text-sm text-gray-400 text-center py-4">Loading readings…</p>
      )}

      {/* Trend charts */}
      {!loadingReadings && (
        <div className="space-y-4">
          {[
            { title: 'Temperature (°C)', key: 'temp',     color: '#f97316' },
            { title: 'Humidity (%)',     key: 'humidity', color: '#22c55e' },
            { title: 'Light (lx)',       key: 'light',    color: '#eab308' },
          ].map(({ title, key, color }) => (
            <ChartCard key={key} title={title}>
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

          <ChartCard title="Soil Moisture (%)">
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

          {/* Insights */}
          {insights.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Insights & Recommendations</h3>
              <div className="space-y-2.5">
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
