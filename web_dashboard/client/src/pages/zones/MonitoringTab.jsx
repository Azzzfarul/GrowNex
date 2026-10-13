import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../../firebase'
import { uploadZoneSnapshot } from '../../lib/photoUpload'

function SensorRow({ label, value, min, max }) {
  const numVal   = parseFloat(value)
  const hasRange = min != null && max != null
  const inRange  = hasRange && !isNaN(numVal) && numVal >= min && numVal <= max
  const tooLow   = hasRange && !isNaN(numVal) && numVal < min
  const tooHigh  = hasRange && !isNaN(numVal) && numVal > max

  const valueColor = !hasRange || isNaN(numVal) ? 'text-gray-800'
    : inRange ? 'text-green-600'
    : tooLow  ? 'text-orange-500'
    : 'text-red-500'

  const icon = !hasRange || isNaN(numVal) ? null
    : inRange ? '✓'
    : tooLow  ? '↓'
    : '↑'

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-semibold flex items-center gap-1 ${valueColor}`}>
        {icon && <span>{icon}</span>}
        {value ?? '—'}
      </span>
    </div>
  )
}

function avg(values) {
  const valid = values.filter((v) => v != null)
  return valid.length ? valid.reduce((s, v) => s + Number(v), 0) / valid.length : null
}

function rangeStr(min, max, unit) {
  if (min == null && max == null) return '—'
  if (min != null && max != null) return `${Number(min).toFixed(1)} – ${Number(max).toFixed(1)}${unit}`
  if (min != null) return `≥ ${Number(min).toFixed(1)}${unit}`
  return `≤ ${Number(max).toFixed(1)}${unit}`
}

function dominantLight(plants) {
  const counts = {}
  plants.forEach((p) => {
    if (p.preferredLightCondition) counts[p.preferredLightCondition] = (counts[p.preferredLightCondition] || 0) + 1
  })
  const entries = Object.entries(counts)
  return entries.length ? entries.reduce((a, b) => (b[1] >= a[1] ? b : a))[0] : null
}

export default function MonitoringTab({ zone }) {
  const [device, setDevice] = useState(undefined) // undefined = loading
  const [plants, setPlants] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [viewerUrl, setViewerUrl] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!zone.deviceId) { setDevice(null); return }
    return onSnapshot(doc(db, 'devices', zone.deviceId), (snap) => {
      setDevice(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.deviceId])

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'plants'), where('zoneId', '==', zone.id)),
      (snap) => setPlants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    )
  }, [zone.id])

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'zones', zone.id, 'snapshots'), orderBy('capturedAt', 'desc'), limit(12)),
      (snap) => setSnapshots(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    )
  }, [zone.id])

  async function handleSnapshotFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const { error } = await uploadZoneSnapshot(zone.id, file)
    if (error) setUploadError(error)
    setUploading(false)
  }

  const lastUpdated = zone.latestTimestamp
    ? zone.latestTimestamp?.toDate
      ? zone.latestTimestamp.toDate().toLocaleString()
      : new Date(zone.latestTimestamp).toLocaleString()
    : null

  const isOnline = device?.status === 'online'

  const idealMoisture  = [avg(plants.map((p) => p.preferredMoistureMin)),    avg(plants.map((p) => p.preferredMoistureMax))]
  const idealHumidity  = [avg(plants.map((p) => p.preferredHumidityMin)),    avg(plants.map((p) => p.preferredHumidityMax))]
  const idealTemp      = [avg(plants.map((p) => p.preferredTemperatureMin)), avg(plants.map((p) => p.preferredTemperatureMax))]
  const idealLight     = dominantLight(plants)
  const hasIdeal       = plants.some(
    (p) => p.preferredMoistureMin != null || p.preferredHumidityMin != null ||
           p.preferredTemperatureMin != null || p.preferredLightCondition
  )

  return (
    <div className="space-y-4">
      {/* Device status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Device status</h3>
        {!zone.deviceId ? (
          <p className="text-sm text-gray-400">No device connected</p>
        ) : device === undefined ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : device === null ? (
          <p className="text-sm text-red-400">Device not found</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-800 mb-1.5">{device.deviceName}</p>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className={`text-sm font-medium ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Latest readings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Latest readings</h3>
        {device && !isOnline && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 mb-3">
            <span className="text-orange-400 text-sm flex-shrink-0">⚠</span>
            <p className="text-xs text-orange-600 font-medium">Device is offline — readings may be outdated.</p>
          </div>
        )}
        <SensorRow label="Temperature" value={zone.latestTemp     != null ? `${zone.latestTemp}°C`     : null} min={idealTemp[0]}     max={idealTemp[1]} />
        <SensorRow label="Humidity"    value={zone.latestHumid    != null ? `${zone.latestHumid}%`    : null} min={idealHumidity[0]} max={idealHumidity[1]} />
        <SensorRow label="Light"       value={zone.latestLight    != null ? `${zone.latestLight} lx`  : null} />
        <SensorRow label="Moisture"    value={zone.latestMoisture != null ? `${zone.latestMoisture}%` : null} min={idealMoisture[0]} max={idealMoisture[1]} />
        {lastUpdated && <p className="text-xs text-gray-400 mt-3">Last updated {lastUpdated}</p>}
      </div>

      {/* Ideal zone conditions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🌿</span>
          <h3 className="font-semibold text-gray-900">Ideal zone conditions</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          {plants.length === 0
            ? 'Add plants with preferred conditions to see computed ideals.'
            : `Averaged from ${plants.length} plant${plants.length === 1 ? '' : 's'} in this zone. Edit at the plant level.`}
        </p>
        {plants.length === 0 || !hasIdeal ? (
          <p className="text-sm text-gray-300">No preferred conditions set yet.</p>
        ) : (
          <div>
            <SensorRow label="Moisture"    value={rangeStr(idealMoisture[0], idealMoisture[1], '%')} />
            <SensorRow label="Humidity"    value={rangeStr(idealHumidity[0], idealHumidity[1], '%')} />
            <SensorRow label="Temperature" value={rangeStr(idealTemp[0],     idealTemp[1],     '°C')} />
            <SensorRow
              label="Light"
              value={idealLight ? idealLight.charAt(0).toUpperCase() + idealLight.slice(1) : '—'}
            />
          </div>
        )}
      </div>

      {/* Camera feed */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">Camera feed</h3>
            <p className="text-xs text-gray-400 mt-0.5">Last 48 hours · one photo per 4-hour window</p>
          </div>
          <label className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer transition-colors">
            {uploading ? 'Uploading…' : '+ Add photo'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSnapshotFile}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
        {uploadError && <p className="text-xs text-red-500 mb-3">{uploadError}</p>}
        {snapshots.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl text-gray-200">📷</span>
              <p className="text-sm text-gray-400 mt-2">No photos yet</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {snapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setViewerUrl(s.imageUrl)}
                className="shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-100"
              >
                <img src={s.imageUrl} alt="Zone snapshot" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      {viewerUrl && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}
        >
          <img src={viewerUrl} alt="Zone snapshot full size" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
