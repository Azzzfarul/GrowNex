import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { uploadZonePhoto } from '../lib/photoUpload'
import Icon from '../components/ui/Icon'

function AddZoneModal({ userId, onClose }) {
  const [zoneName, setZoneName] = useState('')
  const [zoneType, setZoneType] = useState('indoor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  function handlePhotoPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!zoneName.trim()) return
    setLoading(true)
    setError('')
    try {
      const zoneRef = doc(collection(db, 'zones'))
      await setDoc(zoneRef, {
        userId,
        zoneName: zoneName.trim(),
        zoneType,
        status: 'healthy',
        totalPlantSlots: 0,
        zonePhotoUrl: null,
        createdAt: serverTimestamp(),
      })
      if (photoFile) {
        const { error: photoErr } = await uploadZonePhoto(zoneRef.id, photoFile)
        if (photoErr) console.warn('Zone created, but photo upload failed:', photoErr)
      }
      onClose()
    } catch {
      setError('Failed to create zone. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-md p-6">
        <h2 className="text-headline-sm text-on-surface mb-5">Add Zone</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-surface-container-highest flex items-center justify-center overflow-hidden shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="Zone preview" className="w-full h-full object-cover" />
              ) : (
                <Icon name="add_photo_alternate" className="text-on-surface-variant" />
              )}
            </div>
            <label className="btn-text cursor-pointer">
              {photoFile ? 'Change photo' : 'Add photo'} <span className="text-on-surface-variant font-normal">(optional)</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoPick} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Zone name</label>
            <input
              className="field w-full"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="e.g. Tomato bed"
              required
            />
          </div>
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Zone type</label>
            <select
              className="field w-full"
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value)}
            >
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <p className="text-xs text-on-surface-variant">
            You can assign a device to this zone after creation from the zone's Overview tab.
          </p>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-filled"
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
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className="text-title-sm text-on-surface">{value ?? '—'}</p>
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
    return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-headline-sm text-on-surface">Plant zones</h1>
        <button onClick={() => setShowAdd(true)} className="btn-filled">
          <Icon name="add" />
          Add zone
        </button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-body-md text-on-surface-variant mr-1">Filter zones by type</span>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`chip ${filter === f ? 'chip-selected' : ''}`}
          >
            {filter === f && <Icon name="check" />}
            {f}
          </button>
        ))}
      </div>

      {filteredZones.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
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
                className="card state-layer text-left p-5"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-title-lg text-on-surface">{z.zoneName}</h2>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {isFull && (
                      <span className="inline-flex items-center h-6 px-2.5 rounded-lg text-label-md bg-warning-container text-on-warning-container">
                        Full
                      </span>
                    )}
                    <span className={`inline-flex items-center h-6 px-2.5 rounded-lg text-label-md ${
                      connected ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {connected ? 'Connected' : 'No device'}
                    </span>
                  </div>
                </div>

                {/* Subline */}
                <p className="text-body-md text-on-surface-variant mb-1 capitalize">
                  {z.zoneType}
                </p>
                <p className={`text-xs font-medium mb-4 ${isFull ? 'text-warning' : 'text-on-surface-variant'}`}>
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
                        <SensorPill label="Light"    value={!offline && z.latestLight    != null ? `${z.latestLight}%`  : null} />
                      </div>
                      <p className="text-xs text-on-surface-variant mt-3">
                        {offline ? 'Device is offline.' : (z.alertSummary ?? 'Summary unavailable')}
                      </p>
                    </>
                  )
                })()}

                <p className="flex items-center gap-1 text-label-lg text-primary mt-3">Tap to view zone <Icon name="arrow_forward" size={18} /></p>
              </button>
            )
          })}
        </div>
      )}

      {showAdd && <AddZoneModal userId={user.uid} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
