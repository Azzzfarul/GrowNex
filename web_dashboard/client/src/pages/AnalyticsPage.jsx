import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { fetchAiSummary } from '../lib/aiSummary'
import { compliancePercent, plantHealth, plantHealthSummary } from '../lib/plantHealth'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

import {
  avg, avgPref, buildChartData, describeTrend, moistureBucketSeries, buildOverviewSummary,
  getMoistureLines, healthScoreForPlant, zoneHealthScore, generateInsights,
  scoreColor, scoreBadge, scoreLabel,
} from '../lib/analytics'

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
  const [loadedFor,       setLoadedFor]       = useState(null)  // { zoneId, timeRange } of readings/plants

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

  // Fetch readings + plants when zone selection or time range changes. Keyed on zone IDs, not
  // `zones`: the bridge rewrites every zone doc each minute, which would refetch (and re-call AI).
  const zoneIdsKey = zones.map(z => z.id).join(',')
  useEffect(() => {
    if (!zones.length) return
    let cancelled = false
    setLoadingReadings(true)
    setAiSummaries({})  // don't show the previous zone's AI text while loading

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
      if (cancelled) return
      setReadings(r)
      setPlants(p)
      setLoadedFor({ zoneId: selectedZoneId, timeRange })
    }).catch(err => {
      console.error('Failed to load analytics:', err)
      if (!cancelled) { setReadings([]); setPlants([]) }  // don't leave the previous zone's charts up
    }).finally(() => {
      if (!cancelled) setLoadingReadings(false)
    })
    return () => { cancelled = true }
  }, [zoneIdsKey, selectedZoneId, timeRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the AI analytics summary — one server call per loaded zone/time-range; any
  // failure leaves aiSummaries empty and the UI shows the rule-based text.
  // Runs off `loadedFor` so the payload never mixes one zone's ID with another's readings.
  useEffect(() => {
    if (!loadedFor || loadedFor.zoneId === 'all' || !user) { setAiSummaries({}); return }
    const { zoneId: selectedZoneId, timeRange } = loadedFor
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
  }, [loadedFor, user]) // eslint-disable-line react-hooks/exhaustive-deps

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
        .map(p => ({ plant: p, health: plantHealth(p, selectedZone, readings) }))
        .filter(x => x.health.score != null)
        .sort((a, b) => b.health.score - a.health.score)
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
                {ranking.map(({ plant, health }, i) => (
                  <div key={plant.id} className="flex items-start gap-3">
                    <span className="text-sm text-gray-400 w-5 text-right pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{plant.plantName}</span>
                        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${scoreBadge(health.score)}`}>{health.score}%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{plantHealthSummary(health)}</p>
                    </div>
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
