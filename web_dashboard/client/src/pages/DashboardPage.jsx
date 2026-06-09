import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

function statusColor(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('healthy') || s.includes('stable')) return 'bg-green-100 text-green-700'
  if (s.includes('attention') || s.includes('needs') || s.includes('warning')) return 'bg-orange-100 text-orange-700'
  if (s.includes('critical') || s.includes('alert')) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-900">{zone.zoneName}</h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(zone.status)}`}>
          {zone.status || 'Unknown'}
        </span>
      </div>

      {hasSensorData ? (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Temp</p>
              <p className="font-bold text-sm text-gray-800">
                {zone.latestTemp != null ? `${Math.round(zone.latestTemp)}°C` : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Humidity</p>
              <p className="font-bold text-sm text-gray-800">
                {zone.latestHumid != null ? `${Math.round(zone.latestHumid)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Light</p>
              <p className="font-bold text-sm text-gray-800">
                {zone.latestLight != null ? `${Math.round(zone.latestLight)} lx` : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Moisture</p>
              <p className="font-bold text-sm text-gray-800">
                {zone.latestMoisture != null ? `${Math.round(zone.latestMoisture)}%` : '--'}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            {zone.alertSummary || defaultAlertMessage(zone.status)}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-400 mb-4">
          {deviceOffline ? 'Device is offline.' : 'No sensor data available yet.'}
        </p>
      )}

      <button
        onClick={onViewDetails}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
      >
        <span>View details</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  const username = user?.displayName || 'gardener'

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

  const activeZones = zones.filter((z) => z.status?.toLowerCase().includes('healthy')).length
  const attentionZones = zones.length - activeZones

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Good morning, {username}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Here is today's plant performance overview.</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-bold text-green-600 mb-3">Active zones</p>
          <p className="text-2xl font-bold text-gray-900">
            {activeZones} active zone{activeZones !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-bold text-orange-500 mb-3">Attention</p>
          <p className="text-2xl font-bold text-gray-900">
            {attentionZones} zone{attentionZones !== 1 ? 's' : ''} require attention
          </p>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-400">
            No zones found yet. Add a zone first, then the dashboard will show the latest sensor summaries and alerts.
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Zone overview</h2>
          <div className="flex flex-col gap-4">
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
