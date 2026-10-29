import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'
import StatusLabel from '../components/ui/StatusLabel'


function defaultAlertMessage(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('attention') || s.includes('needs')) return 'Sensor readings require your attention.'
  if (s.includes('healthy') || s.includes('stable')) return 'Conditions are within the healthy range.'
  return 'Review the latest sensor readings for this zone.'
}

function ZoneCard({ zone, onViewDetails }) {
  const deviceOffline = zone.deviceOnline === false
  const hasSensorData = !deviceOffline && (
    zone.latestTemp != null ||
    zone.latestHumid != null ||
    zone.latestLight != null ||
    zone.latestMoisture != null
  )

  const readings = [
    { label: 'Temp',     icon: 'thermostat',          value: zone.latestTemp,     unit: '°C' },
    { label: 'Humidity', icon: 'humidity_percentage', value: zone.latestHumid,    unit: '%' },
    { label: 'Light',    icon: 'light_mode',          value: zone.latestLight,    unit: '%' },
    { label: 'Moisture', icon: 'water_drop',          value: zone.latestMoisture, unit: '%' },
  ]

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-title-lg text-on-surface truncate">{zone.zoneName}</h3>
        <StatusLabel status={zone.status} />
      </div>

      {hasSensorData ? (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {readings.map(({ label, icon, value, unit }) => (
              <div key={label} className="bg-surface-container rounded-lg px-2 py-3 flex flex-col items-center gap-1">
                <Icon name={icon} size={20} className="text-primary" />
                <p className="text-title-md text-on-surface">{value != null ? `${Math.round(value)}${unit}` : '--'}</p>
                <p className="text-label-sm text-on-surface-variant">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-body-md text-on-surface-variant mb-4">
            {zone.alertSummary || defaultAlertMessage(zone.status)}
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 text-body-md text-on-surface-variant mb-4">
          <Icon name={deviceOffline ? 'cloud_off' : 'hourglass_empty'} size={20} />
          {deviceOffline ? 'Device is offline.' : 'No sensor data available yet.'}
        </p>
      )}

      <button onClick={onViewDetails} className="btn-tonal self-end mt-auto">
        View details
        <Icon name="arrow_forward" />
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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

  if (loading) {
    return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-headline-md text-on-surface">Dashboard</h1>
      <p className="text-body-lg text-on-surface-variant mt-1 mb-6">Here is today's plant performance overview.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-primary-container text-on-primary-container rounded-xl p-5 flex items-center gap-4">
          <Icon name="check_circle" filled size={40} />
          <div>
            <p className="text-label-lg">Healthy zones</p>
            <p className="text-headline-sm">
              {healthyZones} healthy zone{healthyZones !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="bg-warning-container text-on-warning-container rounded-xl p-5 flex items-center gap-4">
          <Icon name="warning" filled size={40} />
          <div>
            <p className="text-label-lg">Attention</p>
            <p className="text-headline-sm">
              {attentionZones} {attentionZones === 1 ? 'zone requires' : 'zones require'} attention
            </p>
          </div>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="card-outlined p-6 text-center">
          <Icon name="potted_plant" size={40} className="text-on-surface-variant" />
          <p className="text-body-md text-on-surface-variant mt-2">
            No zones found yet. Add a zone first, then the dashboard will show the latest sensor summaries and alerts.
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-title-lg text-on-surface mb-3">Zone overview</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {zones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                onViewDetails={() => navigate(`/zones/${zone.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
