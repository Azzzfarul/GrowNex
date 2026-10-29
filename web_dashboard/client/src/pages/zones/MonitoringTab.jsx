import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../../firebase'
import Icon from '../../components/ui/Icon'
import { uploadZoneSnapshot } from '../../lib/photoUpload'

// Current value coloured against the plants' averaged preferred range
function Current({ value, unit, min, max }) {
  if (value == null) return <span className="text-on-surface-variant">–</span>
  const n = Number(value)
  const hasRange = min != null && max != null
  const tone = !hasRange ? 'text-on-surface' : n < min ? 'text-warning' : n > max ? 'text-error' : 'text-primary'
  const icon = !hasRange ? null : n < min ? 'arrow_downward' : n > max ? 'arrow_upward' : 'check_circle'
  return (
    <span className={`inline-flex items-center gap-1 text-title-sm ${tone}`}>
      {icon && <Icon name={icon} size={18} />}{value}{unit}
    </span>
  )
}

function StatusRow({ icon, label, dev }) {
  const online = dev?.status === 'online'
  return (
    <div className="flex items-center gap-3">
      <span className={`list-icon ${dev && online ? '' : 'bg-surface-container-highest text-on-surface-variant'}`}><Icon name={icon} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-label-md text-on-surface-variant">{label}</p>
        <p className="text-body-lg text-on-surface truncate">{dev === undefined ? 'Loading…' : dev ? dev.deviceName : 'Not assigned'}</p>
      </div>
      {dev && (
        <span className={`tag ${online ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-on-error-container'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      )}
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
  const [camera, setCamera] = useState(null)
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
    if (!zone.cameraDeviceId) { setCamera(null); return }
    return onSnapshot(doc(db, 'devices', zone.cameraDeviceId), (snap) => {
      setCamera(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.cameraDeviceId])

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

  const rows = [
    { label: 'Temperature', icon: 'thermostat',          value: zone.latestTemp,     unit: '°C', range: idealTemp,     ideal: rangeStr(idealTemp[0], idealTemp[1], '°C') },
    { label: 'Humidity',    icon: 'humidity_percentage', value: zone.latestHumid,    unit: '%',  range: idealHumidity, ideal: rangeStr(idealHumidity[0], idealHumidity[1], '%') },
    { label: 'Light',       icon: 'light_mode',          value: zone.latestLight,    unit: '%',  range: [null, null],
      ideal: idealLight ? idealLight.charAt(0).toUpperCase() + idealLight.slice(1) : '—' },
    { label: 'Soil moisture', icon: 'water_drop',        value: zone.latestMoisture, unit: '%',  range: idealMoisture, ideal: rangeStr(idealMoisture[0], idealMoisture[1], '%') },
  ]
  const viewer = snapshots.find((s) => s.imageUrl === viewerUrl)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        {/* Readings vs ideal */}
        <section className="card overflow-hidden">
          <div className="flex items-start gap-3 p-5 pb-3">
            <div className="flex-1">
              <h3 className="card-title">Readings</h3>
              <p className="text-body-sm text-on-surface-variant">
                {plants.length === 0 || !hasIdeal
                  ? 'Set preferred conditions on this zone’s plants to see ideal ranges.'
                  : `Ideal ranges averaged from ${plants.length} plant${plants.length === 1 ? '' : 's'}. Edit them per plant.`}
              </p>
            </div>
          </div>
          {device && !isOnline && (
            <p className="banner banner-warning mx-5 mb-3"><Icon name="warning" />Device is offline — readings may be outdated.</p>
          )}
          <table className="table">
            <thead>
              <tr><th>Metric</th><th>Current</th><th>Ideal</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td><span className="flex items-center gap-3"><Icon name={r.icon} size={20} className="text-on-surface-variant" />{r.label}</span></td>
                  <td><Current value={r.value} unit={r.unit} min={r.range[0]} max={r.range[1]} /></td>
                  <td className="text-on-surface-variant">{hasIdeal ? r.ideal : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastUpdated && <p className="text-body-sm text-on-surface-variant px-5 py-3 border-t border-outline-variant">Last updated {lastUpdated}</p>}
        </section>

        {/* Connected devices */}
        <section className="card p-5 space-y-4">
          <h3 className="card-title">Devices</h3>
          <StatusRow icon="sensors" label="Sensor node" dev={zone.deviceId ? device : null} />
          <StatusRow icon="photo_camera" label="Camera" dev={camera} />
        </section>
      </div>

      {/* Camera feed */}
      <section className="card p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h3 className="card-title">Camera feed</h3>
            <p className="text-body-sm text-on-surface-variant">
              Last 48 hours · one photo per 4-hour window{camera && ` · auto-captured by ${camera.deviceName}`}
            </p>
          </div>
          <label className="btn-tonal cursor-pointer">
            <Icon name={uploading ? 'progress_activity' : 'add_a_photo'} className={uploading ? 'animate-spin' : ''} />
            {uploading ? 'Uploading…' : 'Add photo'}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleSnapshotFile} disabled={uploading} className="hidden" />
          </label>
        </div>
        {uploadError && <p className="banner banner-error mb-4"><Icon name="error" />{uploadError}</p>}
        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-on-surface-variant">
            <Icon name="photo_camera" size={40} />
            <p className="text-body-md">No photos yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {snapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setViewerUrl(s.imageUrl)}
                className="state-layer relative aspect-[4/3] rounded-lg overflow-hidden bg-surface-container-high"
              >
                <img src={s.imageUrl} alt="Zone snapshot" className="absolute inset-0 w-full h-full object-cover" />
                {s.capturedAt?.toDate && (
                  <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-left text-label-sm text-white bg-gradient-to-t from-black/70 to-transparent">
                    {s.capturedAt.toDate().toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {viewerUrl && (
        <div className="fixed inset-0 bg-scrim/80 z-50 flex flex-col items-center justify-center p-6 animate-fade-in" onClick={() => setViewerUrl(null)}>
          <button className="icon-btn absolute top-4 right-4 text-white" aria-label="Close"><Icon name="close" /></button>
          <img src={viewerUrl} alt="Zone snapshot full size" className="max-w-full max-h-[85vh] rounded-xl" />
          {viewer?.capturedAt?.toDate && <p className="mt-3 text-body-md text-white/90">{viewer.capturedAt.toDate().toLocaleString()}</p>}
        </div>
      )}
    </div>
  )
}
