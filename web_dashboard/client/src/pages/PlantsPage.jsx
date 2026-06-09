import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

function AddZoneModal({ userId, onClose }) {
  const [zoneName, setZoneName] = useState('')
  const [zoneType, setZoneType] = useState('indoor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!zoneName.trim()) return
    setLoading(true)
    setError('')
    try {
      await addDoc(collection(db, 'zones'), {
        userId,
        zoneName: zoneName.trim(),
        zoneType,
        status: 'healthy',
        totalPlantSlots: 0,
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch {
      setError('Failed to create zone. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-5">Add Zone</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Zone name</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="e.g. Tomato bed"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Zone type</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value)}
            >
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">
            You can assign a device to this zone after creation from the zone's Overview tab.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Creating…' : 'Create zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
  const [showAdd,     setShowAdd]     = useState(false)

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Plant zones</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>Add zone</span>
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-400 mr-1">Filter zones by type</span>
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
            ? 'No zones found yet. Add a zone to get started.'
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
                {(() => {
                  const offline = z.deviceOnline === false
                  return (
                    <>
                      <div className="flex gap-6">
                        <SensorPill label="Temp"     value={!offline && z.latestTemp     != null ? `${z.latestTemp}°C`     : null} />
                        <SensorPill label="Humidity" value={!offline && z.latestHumid    != null ? `${z.latestHumid}%`    : null} />
                        <SensorPill label="Moisture" value={!offline && z.latestMoisture != null ? `${z.latestMoisture}%` : null} />
                        <SensorPill label="Light"    value={!offline && z.latestLight    != null ? `${z.latestLight} lx`  : null} />
                      </div>
                      <p className="text-xs text-gray-400 mt-3">
                        {offline ? 'Device is offline.' : (z.alertSummary ?? 'Summary unavailable')}
                      </p>
                    </>
                  )
                })()}

                <p className="text-xs text-brand-500 font-medium mt-2">Tap to view zone →</p>
              </button>
            )
          })}
        </div>
      )}

      {showAdd && <AddZoneModal userId={user.uid} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
