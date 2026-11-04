import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'
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

function MetricCard({ icon, label, value, sub }) {
  return (
    <div className="card-filled p-4">
      <p className="flex items-center gap-2 text-label-lg text-on-surface-variant"><Icon name={icon} size={20} className="text-primary" />{label}</p>
      <p className="text-headline-sm text-on-surface mt-2">{value ?? '–'}</p>
      {sub && <p className="text-body-sm text-on-surface-variant mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, caption, children }) {
  return (
    <section className="card p-5 min-w-0">
      <h3 className="card-title">{title}</h3>
      {caption && <div className="mt-1 mb-4">{caption}</div>}
      {children}
    </section>
  )
}

function SourceTag({ isAi }) {
  return (
    <span className={`tag h-5 ${isAi ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
      {isAi && <Icon name="auto_awesome" />}{isAi ? 'AI' : 'Auto'}
    </span>
  )
}

function SummaryLine({ text, isAi, variant }) {
  return (
    <div className={`flex items-start gap-2 text-on-surface-variant ${variant === 'card' ? 'text-body-lg' : 'text-body-sm'}`}>
      <SourceTag isAi={isAi} />
      <span>{text}</span>
    </div>
  )
}

function EmptyChart() {
  return <p className="h-[220px] grid place-items-center text-body-md text-on-surface-variant">No readings in this period.</p>
}

function ComplianceBar({ label, value }) {
  if (value == null) return null
  const bar = value >= 80 ? 'bg-primary' : value >= 60 ? 'bg-warning' : 'bg-error'
  return (
    <div>
      <div className="flex justify-between text-body-md mb-1.5">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-medium text-on-surface">{value}%</span>
      </div>
      <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

const Advice = ({ tone, icon, text }) => (
  <div className={`banner ${tone}`}><Icon name={icon} /><span>{text}</span></div>
)

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

  if (loadingZones) return <div><PageHeader title="Analytics" /><Loading /></div>

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

  const chart = (key, color) => (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={40} />
        <Tooltip {...TOOLTIP} />
        <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Growing conditions and plant health over time"
        actions={zones.length > 0 && <>
          <TextField as="select" label="Zone" value={selectedZoneId} onChange={e => setSelectedZoneId(e.target.value)} className="w-52">
            <option value="all">All zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
          </TextField>
          <div role="group" aria-label="Time range" className="segmented">
            {['today', '7days'].map((t) => (
              <button key={t} onClick={() => setTimeRange(t)} aria-pressed={timeRange === t}>
                {timeRange === t && <Icon name="check" />}
                {t === 'today' ? '24 hours' : '7 days'}
              </button>
            ))}
          </div>
        </>}
      />

      {zones.length === 0 ? (
        <EmptyState icon="monitoring" title="No data yet" body="Create a zone and assign a sensor node; charts fill in as readings arrive." />
      ) : (
      <div className="space-y-6">
        <div className={`progress-linear -mt-3 ${loadingReadings ? '' : 'invisible'}`} role="progressbar" aria-label="Loading readings" />

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <MetricCard icon="thermostat"          label="Avg temperature" value={avgTemp     != null ? `${avgTemp}°C` : null} />
          <MetricCard icon="humidity_percentage" label="Avg humidity"    value={avgHumid    != null ? `${avgHumid}%` : null} />
          <MetricCard icon="light_mode"          label="Avg light"       value={avgLight    != null ? `${avgLight}%` : null} />
          <MetricCard icon="water_drop"          label="Avg moisture"    value={avgMoisture != null ? `${avgMoisture}%` : null} />
          <MetricCard
            icon="local_florist"
            label="Plants healthy"
            value={plantScores.length > 0 ? `${healthyCount} / ${plantScores.length}` : null}
            sub={plantScores.length === 0 ? 'Set plant preferences first' : undefined}
          />
        </div>

        <div className={`grid grid-cols-1 gap-6 ${selectedZone ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          {/* Summary */}
          <section className="card p-5">
            <h3 className="card-title mb-3">Summary</h3>
            <SummaryLine variant="card" text={aiMap.overview ?? overviewRes.text} isAi={aiMap.overview != null} />
            {aiActive && aiAdvice.length > 0 ? (
              <div className="grid gap-2 mt-4 xl:grid-cols-2">
                {aiAdvice.map((a, i) => (
                  <Advice key={i} text={a.text}
                    tone={a.severity === 'critical' ? 'banner-error' : a.severity === 'warn' ? 'banner-warning' : 'bg-surface-container text-on-surface-variant'}
                    icon={a.severity === 'critical' ? 'error' : a.severity === 'warn' ? 'warning' : 'info'} />
                ))}
              </div>
            ) : selectedZone && insights.length > 0 ? (
              <div className="grid gap-2 mt-4 xl:grid-cols-2">
                {insights.map((ins, i) => (
                  <Advice key={i} text={ins.text}
                    tone={ins.ok === true ? 'bg-primary-container text-on-primary-container' : ins.ok === false ? 'banner-warning' : 'bg-surface-container text-on-surface-variant'}
                    icon={ins.ok === true ? 'check_circle' : ins.ok === false ? 'warning' : 'info'} />
                ))}
              </div>
            ) : null}
          </section>

          {/* Zone health score */}
          {selectedZone && (
            <section className="card p-5 flex flex-col">
              <h3 className="card-title mb-3">Zone health</h3>
              {score == null ? (
                <p className="text-body-md text-on-surface-variant">Add plants with preferred conditions to compute a health score.</p>
              ) : (
                <>
                  <div className="flex items-end gap-3">
                    <span className={`text-display-md ${scoreColor(score)}`}>{score}%</span>
                    <span className={`tag h-7 px-3 mb-2 ${scoreBadge(score)}`}>{scoreLabel(score)}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-2">Current readings against the plants' preferred conditions.</p>
                </>
              )}
            </section>
          )}
        </div>

        {/* Trend charts */}
        <div className={`grid grid-cols-1 gap-6 lg:grid-cols-2 transition-opacity ${loadingReadings ? 'opacity-50' : ''}`}>
          {[
            { title: 'Temperature (°C)', key: 'temp',     color: 'var(--chart-2)', kind: 'temperature' },
            { title: 'Humidity (%)',     key: 'humidity', color: 'var(--chart-3)', kind: 'humidity' },
            { title: 'Light (%)',        key: 'light',    color: 'var(--chart-4)', kind: 'light' },
          ].map(({ title, key, color, kind }) => (
            <ChartCard key={key} title={title} caption={<SummaryLine text={aiMap[kind] ?? graphRes[kind].text} isAi={aiMap[kind] != null} />}>
              {noReadings ? <EmptyChart /> : chart(key, color)}
            </ChartCard>
          ))}

          <ChartCard title="Soil moisture (%)" caption={<SummaryLine text={aiMap.moisture ?? moistRes.text} isAi={aiMap.moisture != null} />}>
            {noReadings ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="label" {...AXIS} minTickGap={24} />
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

        {/* Zone-specific sections */}
        {selectedZone && !loadingReadings && (compTemp != null || compMoist != null || compHumid != null || ranking.length > 0) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
            {(compTemp != null || compMoist != null || compHumid != null) && (
              <section className="card p-5">
                <h3 className="card-title">Time in range</h3>
                <p className="text-body-sm text-on-surface-variant mb-5">Share of readings inside the plants' averaged preferred range.</p>
                <div className="space-y-4">
                  <ComplianceBar label="Temperature"   value={compTemp} />
                  <ComplianceBar label="Humidity"      value={compHumid} />
                  <ComplianceBar label="Soil moisture" value={compMoist} />
                </div>
              </section>
            )}

            {ranking.length > 0 && (
              <section className="card overflow-hidden">
                <h3 className="card-title p-5 pb-2">Plant ranking</h3>
                <ol>
                  {ranking.map(({ plant, health }, i) => (
                    <li key={plant.id} className="list-row items-start border-t border-outline-variant first:border-t-0">
                      <span className="list-icon w-8 h-8 text-label-lg bg-surface-container-highest text-on-surface-variant">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-lg text-on-surface truncate">{plant.plantName}</p>
                        <p className="text-body-sm text-on-surface-variant">{plantHealthSummary(health)}</p>
                      </div>
                      <span className={`tag ${scoreBadge(health.score)}`}>{health.score}%</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
