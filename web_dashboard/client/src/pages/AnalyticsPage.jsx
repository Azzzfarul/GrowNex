import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import Icon from '../components/ui/Icon'
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

// Recharts styling from the M3 tokens, so charts follow light/dark mode
const GRID = { strokeDasharray: '3 3', stroke: 'rgb(var(--md-outline-variant))', vertical: false }
const AXIS = { tick: { fontSize: 11, fill: 'rgb(var(--md-on-surface-variant))' }, stroke: 'rgb(var(--md-outline-variant))' }
const TIP_TEXT = { color: 'rgb(var(--md-inverse-on-surface))' }
const TOOLTIP = {
  contentStyle: { background: 'rgb(var(--md-inverse-surface))', border: 'none', borderRadius: 4, fontSize: 12 },
  labelStyle: TIP_TEXT,
  itemStyle: TIP_TEXT,
}
const legendText = (v) => <span className="text-body-sm text-on-surface-variant">{v}</span>

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-label-md text-on-surface-variant mb-1">{label}</p>
      <p className="text-headline-sm text-on-surface">{value ?? '—'}</p>
      {sub && <p className="text-body-sm text-on-surface-variant mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, caption, children }) {
  return (
    <div className="card p-5">
      <h3 className={`text-title-md text-on-surface ${caption ? 'mb-1' : 'mb-4'}`}>{title}</h3>
      {caption && <div className="mb-3">{caption}</div>}
      {children}
    </div>
  )
}

function SummaryLine({ text, isAi, variant }) {
  return (
    <div className={`flex items-start gap-2 ${variant === 'card' ? 'text-sm text-on-surface-variant' : 'text-xs text-on-surface-variant'}`}>
      <span
        className={`shrink-0 text-label-sm px-1.5 rounded ${
          isAi ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'
        }`}
      >
        {isAi ? 'AI' : 'Auto'}
      </span>
      <span>{text}</span>
    </div>
  )
}

function EmptyChart() {
  return <p className="text-sm text-on-surface-variant text-center py-8">No readings in this period.</p>
}

function ComplianceBar({ label, value }) {
  if (value == null) return null
  const bar = value >= 80 ? 'bg-primary' : value >= 60 ? 'bg-warning' : 'bg-error'
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-medium text-on-surface">{value}%</span>
      </div>
      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
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
  // Bumped on every new selection; an AI answer for an older one is dropped (mobile: _fetchSeq).
  const loadSeq = useRef(0)

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
    loadSeq.current++
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
    const seq = loadSeq.current
    const stale = () => cancelled || seq !== loadSeq.current
    setAiSummaries({})
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
      .then(r => { if (!stale()) setAiSummaries(r) })
      .catch(() => { if (!stale()) setAiSummaries({}) })

    return () => { cancelled = true }
  }, [loadedFor, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadingZones) return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>

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
          <h1 className="text-headline-sm text-on-surface">Analytics</h1>
          <p className="text-body-md text-on-surface-variant mt-0.5">Track plant health and growing conditions.</p>
        </div>
        <select
          value={selectedZoneId}
          onChange={e => setSelectedZoneId(e.target.value)}
          className="field w-auto h-10"
        >
          <option value="all">All Zones</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
        </select>
        {/* M3 segmented button */}
        <div role="group" aria-label="Time range" className="inline-flex h-10 rounded-full border border-outline overflow-hidden">
          {['today', '7days'].map((t, i) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              aria-pressed={timeRange === t}
              className={`state-layer flex items-center gap-2 px-4 text-label-lg ${i ? 'border-l border-outline' : ''} ${
                timeRange === t ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface'
              }`}
            >
              {timeRange === t && <Icon name="check" size={18} />}
              {t === 'today' ? 'Today' : '7 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Avg Temperature" value={avgTemp     != null ? `${avgTemp}°C`    : null} />
        <MetricCard label="Avg Humidity"    value={avgHumid    != null ? `${avgHumid}%`    : null} />
        <MetricCard label="Avg Light"       value={avgLight    != null ? `${avgLight}%`  : null} />
        <MetricCard label="Avg Moisture"    value={avgMoisture != null ? `${avgMoisture}%` : null} />
        <MetricCard
          label="Plants Healthy"
          value={plantScores.length > 0 ? `${healthyCount} / ${plantScores.length}` : null}
          sub={plantScores.length === 0 ? 'Set plant preferences first' : undefined}
        />
      </div>

      {/* AI Summary */}
      <div className="card p-5">
        <h3 className="text-title-md text-on-surface mb-3">AI Summary</h3>
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
                className={`flex gap-3 text-body-md p-3 rounded-lg ${
                  a.severity === 'critical' ? 'bg-error-container text-on-error-container' :
                  a.severity === 'warn' ? 'bg-warning-container text-on-warning-container' :
                                              'bg-surface-container text-on-surface-variant'
                }`}
              >
                <Icon name={a.severity === 'critical' ? 'error' : a.severity === 'warn' ? 'warning' : 'info'} size={20} />
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        ) : selectedZone && insights.length > 0 ? (
          <div className="space-y-2.5 mt-3">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`flex gap-3 text-body-md p-3 rounded-lg ${
                  ins.ok === true ? 'bg-primary-container text-on-primary-container' :
                  ins.ok === false ? 'bg-warning-container text-on-warning-container' :
                                     'bg-surface-container text-on-surface-variant'
                }`}
              >
                <Icon name={ins.ok === true ? 'check_circle' : ins.ok === false ? 'warning' : 'info'} size={20} />
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {loadingReadings && (
        <p className="text-sm text-on-surface-variant text-center py-4">Loading readings…</p>
      )}

      {/* Trend charts */}
      {!loadingReadings && (
        <div className="space-y-4">
          {[
            { title: 'Temperature (°C)', key: 'temp',     color: 'var(--chart-2)', kind: 'temperature' },
            { title: 'Humidity (%)',     key: 'humidity', color: 'var(--chart-3)', kind: 'humidity' },
            { title: 'Light (%)',       key: 'light',    color: 'var(--chart-4)', kind: 'light' },
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
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis {...AXIS} width={40} />
                    <Tooltip {...TOOLTIP} />
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
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis {...AXIS} width={40} />
                  <Tooltip {...TOOLTIP} />
                  {moistureLines.length > 1 && <Legend formatter={legendText} />}
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
          <div className="card p-5">
            <h3 className="text-title-md text-on-surface mb-3">Zone Health Score</h3>
            {score == null ? (
              <p className="text-sm text-on-surface-variant">Add plants with preferred conditions to compute a health score.</p>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                <span className={`text-5xl ${scoreColor(score)}`}>{score}%</span>
                <span className={`inline-flex items-center h-8 px-3 rounded-lg text-label-lg ${scoreBadge(score)}`}>
                  {scoreLabel(score)}
                </span>
                <p className="text-sm text-on-surface-variant">Based on current readings vs plant preferred conditions.</p>
              </div>
            )}
          </div>

          {/* Compliance */}
          {(compTemp != null || compMoist != null || compHumid != null) && (
            <div className="card p-5">
              <h3 className="text-title-md text-on-surface mb-1">Compliance Analysis</h3>
              <p className="text-xs text-on-surface-variant mb-4">% of historical readings within the preferred range averaged across plants.</p>
              <div className="space-y-4">
                <ComplianceBar label="Temperature"   value={compTemp} />
                <ComplianceBar label="Humidity"      value={compHumid} />
                <ComplianceBar label="Soil Moisture" value={compMoist} />
              </div>
            </div>
          )}

          {/* Plant Ranking */}
          {ranking.length > 0 && (
            <div className="card p-5">
              <h3 className="text-title-md text-on-surface mb-4">Plant Ranking</h3>
              <div className="space-y-3">
                {ranking.map(({ plant, health }, i) => (
                  <div key={plant.id} className="flex items-start gap-3">
                    <span className="text-sm text-on-surface-variant w-5 text-right pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-on-surface truncate">{plant.plantName}</span>
                        <span className={`shrink-0 inline-flex items-center h-6 px-2.5 rounded-lg text-label-md ${scoreBadge(health.score)}`}>{health.score}%</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">{plantHealthSummary(health)}</p>
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
