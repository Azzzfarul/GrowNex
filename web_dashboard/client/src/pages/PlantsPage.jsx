import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

function statusColor(status) {
  switch (status?.toLowerCase()) {
    case 'healthy':         return 'bg-green-100 text-green-700'
    case 'needs attention': return 'bg-orange-100 text-orange-700'
    case 'stable':          return 'bg-teal-100 text-teal-700'
    default:                return 'bg-gray-100 text-gray-600'
  }
}

function SensorPill({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-700">{value ?? '—'}</p>
    </div>
  )
}

export default function PlantsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [zones,   setZones]   = useState([])
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

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Plant zones</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Monitor each plant cluster and zone at a glance.</p>

      {zones.length === 0 ? (
        <p className="text-sm text-gray-400">No zones found. Add zones in the mobile app.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {zones.map((z) => (
            <button
              key={z.id}
              onClick={() => navigate(`/zones/${z.id}`)}
              className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:border-brand-200 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-gray-900 text-lg">{z.zoneName}</h2>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg capitalize ${statusColor(z.status)}`}>
                  {z.status || 'Unknown'}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-4 capitalize">
                {z.zoneType} · {z.totalPlantSlots} slot{z.totalPlantSlots !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-6">
                <SensorPill label="Temp"     value={z.latestTemp     != null ? `${z.latestTemp}°C`     : null} />
                <SensorPill label="Humidity" value={z.latestHumid    != null ? `${z.latestHumid}%`    : null} />
                <SensorPill label="Moisture" value={z.latestMoisture != null ? `${z.latestMoisture}%` : null} />
                <SensorPill label="Light"    value={z.latestLight    != null ? `${z.latestLight} lx`  : null} />
              </div>
              <p className="text-xs text-brand-500 font-medium mt-4">Tap to view zone →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
