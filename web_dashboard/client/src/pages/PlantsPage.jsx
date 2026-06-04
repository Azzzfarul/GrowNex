import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

const MAX_PLANTS = 4
const FILTERS = ['All', 'Indoor', 'Outdoor']

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
  const [zones,       setZones]       = useState([])
  const [plantCounts, setPlantCounts] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('All')

  // Subscribe to zones
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      (snap) => {
        setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
  }, [user])

  // Subscribe to plant counts per zone (single query, grouped client-side)
  const zoneIdsKey = zones.map((z) => z.id).sort().join(',')
  useEffect(() => {
    if (zones.length === 0) { setPlantCounts({}); return }
    const ids = zones.map((z) => z.id)
    return onSnapshot(
      query(collection(db, 'plants'), where('zoneId', 'in', ids.slice(0, 30))),
      (snap) => {
        const counts = {}
        snap.docs.forEach((d) => {
          const zid = d.data().zoneId
          counts[zid] = (counts[zid] || 0) + 1
        })
        setPlantCounts(counts)
      }
    )
  }, [zoneIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredZones = filter === 'All'
    ? zones
    : zones.filter((z) => z.zoneType?.toLowerCase() === filter.toLowerCase())

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Plant zones</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">Monitor each plant cluster and zone at a glance.</p>

      {/* Filter chips */}
      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filteredZones.length === 0 ? (
        <p className="text-sm text-gray-400">
          {zones.length === 0
            ? 'No zones found. Add zones in the mobile app.'
            : `No ${filter.toLowerCase()} zones found.`}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredZones.map((z) => {
            const plantCount = plantCounts[z.id] ?? 0
            const isFull     = plantCount >= MAX_PLANTS
            const connected  = !!z.deviceId

            return (
              <button
                key={z.id}
                onClick={() => navigate(`/zones/${z.id}`)}
                className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:border-brand-200 hover:shadow-md transition-all"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="font-bold text-gray-900 text-lg leading-tight">{z.zoneName}</h2>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {isFull && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        Full
                      </span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {connected ? 'Connected' : 'No device'}
                    </span>
                  </div>
                </div>

                {/* Subline */}
                <p className="text-sm text-gray-400 mb-1 capitalize">
                  {z.zoneType}
                </p>
                <p className={`text-xs font-medium mb-4 ${isFull ? 'text-orange-500' : 'text-gray-400'}`}>
                  Plants: {plantCount}/{MAX_PLANTS}
                </p>

                {/* Sensor pills */}
                <div className="flex gap-6">
                  <SensorPill label="Temp"     value={z.latestTemp     != null ? `${z.latestTemp}°C`     : null} />
                  <SensorPill label="Humidity" value={z.latestHumid    != null ? `${z.latestHumid}%`    : null} />
                  <SensorPill label="Moisture" value={z.latestMoisture != null ? `${z.latestMoisture}%` : null} />
                  <SensorPill label="Light"    value={z.latestLight    != null ? `${z.latestLight} lx`  : null} />
                </div>

                <p className="text-xs text-brand-500 font-medium mt-4">Tap to view zone →</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
