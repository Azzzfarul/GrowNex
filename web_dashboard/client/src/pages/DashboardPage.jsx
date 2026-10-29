import { useState, useEffect } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications, formatRelative } from '../hooks/useNotifications'
import Icon from '../components/ui/Icon'
import StatusLabel from '../components/ui/StatusLabel'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'

const STATUS_ORDER = { critical: 0, attention: 1 }
const SEVERITY = {
  info:     'bg-secondary-container text-on-secondary-container',
  warn:     'bg-warning-container text-on-warning-container',
  critical: 'bg-error-container text-on-error-container',
}
const TYPE_ICON = { threshold: 'warning', actuator: 'water_drop', daily: 'bedtime' }

function defaultAlertMessage(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('attention') || s.includes('needs')) return 'Sensor readings require your attention.'
  if (s.includes('healthy') || s.includes('stable')) return 'Conditions are within the healthy range.'
  return 'Review the latest sensor readings for this zone.'
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function StatTile({ icon, label, value, tone }) {
  return (
    <div className={`rounded-xl p-4 flex items-center gap-4 ${tone}`}>
      <span className="grid place-items-center w-12 h-12 rounded-full bg-surface/40"><Icon name={icon} filled /></span>
      <div>
        <p className="text-headline-md leading-none">{value}</p>
        <p className="text-label-lg mt-1 opacity-90">{label}</p>
      </div>
    </div>
  )
}

function ZoneCard({ zone }) {
  const navigate = useNavigate()
  const deviceOffline = zone.deviceOnline === false
  const hasSensorData = !deviceOffline && (
    zone.latestTemp != null || zone.latestHumid != null || zone.latestLight != null || zone.latestMoisture != null
  )
  const readings = [
    { label: 'Temp',     icon: 'thermostat',          value: zone.latestTemp,     unit: '°C' },
    { label: 'Humidity', icon: 'humidity_percentage', value: zone.latestHumid,    unit: '%' },
    { label: 'Light',    icon: 'light_mode',          value: zone.latestLight,    unit: '%' },
    { label: 'Moisture', icon: 'water_drop',          value: zone.latestMoisture, unit: '%' },
  ]

  return (
    <button onClick={() => navigate(`/zones/${zone.id}`)} className="card card-link p-4 flex flex-col gap-4">
      <div className="flex items-start gap-3 w-full">
        <div className="w-11 h-11 rounded-lg bg-surface-container-highest overflow-hidden grid place-items-center shrink-0">
          {zone.zonePhotoUrl
            ? <img src={zone.zonePhotoUrl} alt="" className="w-full h-full object-cover" />
            : <Icon name={zone.zoneType === 'outdoor' ? 'park' : 'home'} className="text-on-surface-variant" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-title-md text-on-surface truncate">{zone.zoneName}</h3>
          <p className="text-body-sm text-on-surface-variant capitalize">{zone.zoneType}</p>
        </div>
        <StatusLabel status={zone.status} />
      </div>

      {hasSensorData ? (
        <div className="grid grid-cols-4 gap-1 w-full">
          {readings.map(({ label, icon, value, unit }) => (
            <div key={label} className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-surface-container">
              <Icon name={icon} size={18} className="text-primary" />
              <p className="text-title-sm text-on-surface">{value != null ? `${Math.round(value)}${unit}` : '–'}</p>
              <p className="text-label-sm text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 h-[68px] px-3 rounded-lg bg-surface-container text-body-md text-on-surface-variant w-full">
          <Icon name={deviceOffline ? 'cloud_off' : 'hourglass_empty'} size={20} />
          {deviceOffline ? 'Device is offline.' : zone.deviceId ? 'Waiting for the first reading.' : 'No device assigned.'}
        </p>
      )}

      {hasSensorData && (
        <p className="text-body-sm text-on-surface-variant line-clamp-2 w-full">
          {zone.alertSummary || defaultAlertMessage(zone.status)}
        </p>
      )}
    </button>
  )
}

function RecentActivity() {
  const { items, markRead } = useNotifications()
  const navigate = useNavigate()
  const recent = items.slice(0, 8)
  return (
    <section className="card-outlined self-start">
      <h2 className="card-title px-4 pt-4 pb-2">Recent activity</h2>
      {recent.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-body-md text-on-surface-variant">Nothing yet. Alerts and automation runs show up here.</p>
      ) : (
        <ul className="pb-2">
          {recent.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => { markRead(n.id); if (n.zoneId) navigate(`/zones/${n.zoneId}`) }}
                className="state-layer list-row w-full items-start"
              >
                <span className={`list-icon w-9 h-9 ${SEVERITY[n.severity] ?? SEVERITY.info}`}>
                  <Icon name={TYPE_ICON[n.type] ?? 'info'} size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-body-md truncate ${n.isRead ? 'text-on-surface-variant' : 'text-on-surface font-medium'}`}>{n.title}</span>
                  <span className="block text-body-sm text-on-surface-variant line-clamp-2">{n.message}</span>
                </span>
                <span className="text-label-sm text-on-surface-variant shrink-0 pt-0.5">{formatRelative(n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { openAddZone } = useOutletContext()
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      (snap) => {
        setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  const healthyZones = zones.filter((z) => z.status?.toLowerCase().includes('healthy')).length
  const attentionZones = zones.filter((z) => ['attention', 'critical'].includes(z.status)).length
  const offlineZones = zones.filter((z) => z.deviceId && z.deviceOnline === false).length
  const sorted = [...zones].sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2))
  const name = user?.displayName?.split(' ')[0]

  return (
    <div>
      <PageHeader
        title={`${greeting()}${name ? `, ${name}` : ''}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      {loading ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <StatTile icon="potted_plant" label="Zones" value={zones.length} tone="bg-surface-container-high text-on-surface" />
            <StatTile icon="check_circle" label="Healthy" value={healthyZones} tone="bg-primary-container text-on-primary-container" />
            <StatTile icon="warning" label="Need attention" value={attentionZones}
              tone={attentionZones ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface'} />
            <StatTile icon="cloud_off" label="Devices offline" value={offlineZones}
              tone={offlineZones ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high text-on-surface'} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-title-lg text-on-surface">Zones</h2>
                {zones.length > 0 && <Link to="/plants" className="btn-text btn-sm">Manage zones<Icon name="arrow_forward" /></Link>}
              </div>
              {zones.length === 0 ? (
                <EmptyState
                  icon="potted_plant"
                  title="No zones yet"
                  body="Create a zone, then assign a sensor node to see live readings and alerts here."
                  action={<button onClick={openAddZone} className="btn-filled"><Icon name="add" />New zone</button>}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {sorted.map((zone) => <ZoneCard key={zone.id} zone={zone} />)}
                </div>
              )}
            </section>
            <RecentActivity />
          </div>
        </>
      )}
    </div>
  )
}
