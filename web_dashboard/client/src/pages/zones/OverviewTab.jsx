import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import Icon from '../../components/ui/Icon'
import TextField from '../../components/ui/TextField'
import { uploadZonePhoto, removeZonePhoto } from '../../lib/photoUpload'

function ModuleChip({ icon, label }) {
  return <span className="tag bg-secondary-container text-on-secondary-container"><Icon name={icon} />{label}</span>
}

// The linked sensor node / camera as a list row, or its loading / missing state
function LinkedDevice({ dev, icon, missing, onRemove, busy, children }) {
  if (dev === undefined) return <p className="text-body-md text-on-surface-variant">Loading…</p>
  if (dev === null) return <p className="text-body-md text-error">{missing}</p>
  const online = dev.status === 'online'
  return (
    <div className="flex items-center gap-4">
      <span className={`list-icon ${online ? '' : 'bg-surface-container-highest text-on-surface-variant'}`}><Icon name={icon} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-body-lg text-on-surface truncate">{dev.deviceName}</p>
        <p className={`flex items-center gap-1.5 text-body-sm ${online ? 'text-primary' : 'text-error'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-primary' : 'bg-error'}`} />{online ? 'Online' : 'Offline'}
        </p>
        {children}
      </div>
      <button onClick={onRemove} disabled={busy} className="btn-text btn-sm text-error">
        <Icon name="link_off" />{busy ? 'Removing…' : 'Unassign'}
      </button>
    </div>
  )
}

// Device picker + Assign button on one row
function AssignRow({ label, options, value, onChange, onAssign, busy }) {
  return (
    <div className="flex items-start gap-2">
      <TextField as="select" label={label} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0">
        <option value="" disabled hidden />
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </TextField>
      <button onClick={onAssign} disabled={!value || busy} className="btn-tonal h-12 rounded-full">
        {busy ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  )
}

export default function OverviewTab({ zone }) {
  const { user } = useAuth()
  const [device, setDevice] = useState(undefined) // undefined=loading, null=not found, obj=found

  // Dropdown state
  const [availableDevices, setAvailableDevices]   = useState([])
  const [devicesLoading,   setDevicesLoading]     = useState(false)
  const [selectedDeviceId, setSelectedDeviceId]   = useState('')

  const [assigning, setAssigning] = useState(false)
  const [removing,  setRemoving]  = useState(false)
  const [devError,  setDevError]  = useState(null)

  const [zoneName,      setZoneName]      = useState(zone.zoneName ?? '')
  const [renameLoading, setRenameLoading] = useState(false)
  const [plantCount,    setPlantCount]    = useState(null)
  const [photoBusy,     setPhotoBusy]     = useState(false)
  const [photoError,    setPhotoError]    = useState(null)
  const [latestSnapshot, setLatestSnapshot] = useState(null)

  useEffect(() => { setZoneName(zone.zoneName ?? '') }, [zone.zoneName])

  // Newest camera-feed photo (ESP32-CAM or manual) — shown in the banner when there's no zone photo
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'zones', zone.id, 'snapshots'), orderBy('capturedAt', 'desc'), limit(1)),
      (snap) => setLatestSnapshot(snap.empty ? null : snap.docs[0].data())
    )
  }, [zone.id])

  async function handlePhotoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setPhotoError(null)
    const { error } = await uploadZonePhoto(zone.id, file)
    if (error) setPhotoError(error)
    setPhotoBusy(false)
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true)
    setPhotoError(null)
    const { error } = await removeZonePhoto(zone.id)
    if (error) setPhotoError(error)
    setPhotoBusy(false)
  }

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'plants'), where('zoneId', '==', zone.id)),
      (snap) => setPlantCount(snap.size)
    )
  }, [zone.id])

  // Subscribe to assigned device for live status
  useEffect(() => {
    if (!zone.deviceId) { setDevice(null); return }
    return onSnapshot(doc(db, 'devices', zone.deviceId), (snap) => {
      setDevice(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.deviceId])

  // Load available (unassigned) devices when no device is assigned
  useEffect(() => {
    if (zone.deviceId || !user) return
    setDevicesLoading(true)
    setSelectedDeviceId('')
    getDocs(query(collection(db, 'devices'), where('userId', '==', user.uid)))
      .then((snap) => {
        const available = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => !d.assignedZoneId && d.deviceType !== 'camera')
        setAvailableDevices(available)
      })
      .finally(() => setDevicesLoading(false))
  }, [zone.deviceId, user])

  async function assign() {
    const dev = availableDevices.find((d) => d.id === selectedDeviceId)
    if (!dev) return
    setAssigning(true)
    setDevError(null)
    try {
      await updateDoc(doc(db, 'zones', zone.id), {
        deviceId: dev.id,
        hasFertilizer: dev.hasFertilizerModule ?? false,
        hasLight: dev.hasLightingModule ?? false,
        totalPlantSlots: dev.totalSlots ?? 4,
      })
      await setDoc(doc(db, 'devices', dev.id), {
        assignedZoneId: zone.id,
        userId: user.uid,
      }, { merge: true })
      setSelectedDeviceId('')
    } catch {
      setDevError('Failed to assign device. Please try again.')
    } finally {
      setAssigning(false)
    }
  }

  async function remove() {
    if (!zone.deviceId) return
    setRemoving(true)
    setDevError(null)
    try {
      await updateDoc(doc(db, 'devices', zone.deviceId), { assignedZoneId: null })
      await updateDoc(doc(db, 'zones', zone.id), { deviceId: null, hasFertilizer: false, hasLight: false, totalPlantSlots: 0 })
    } catch {
      setDevError('Failed to remove device. Please try again.')
    } finally {
      setRemoving(false)
    }
  }

  async function renameZone() {
    const name = zoneName.trim()
    if (!name || name === zone.zoneName) return
    setRenameLoading(true)
    try {
      await updateDoc(doc(db, 'zones', zone.id), { zoneName: name })
    } catch { /* ignore */ } finally {
      setRenameLoading(false)
    }
  }

  const readings = [
    { label: 'Temperature', icon: 'thermostat',          value: zone.latestTemp,     unit: '°C' },
    { label: 'Humidity',    icon: 'humidity_percentage', value: zone.latestHumid,    unit: '%' },
    { label: 'Light',       icon: 'light_mode',          value: zone.latestLight,    unit: '%' },
    { label: 'Moisture',    icon: 'water_drop',          value: zone.latestMoisture, unit: '%' },
  ]
  const offline = zone.deviceOnline === false

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <div className="space-y-6 min-w-0">
        {/* Zone photo (falls back to the newest camera-feed photo) */}
        <div className="relative w-full aspect-[16/9] max-h-[420px] rounded-2xl bg-surface-container-high overflow-hidden grid place-items-center">
          {zone.zonePhotoUrl ? (
            <img src={zone.zonePhotoUrl} alt={zone.zoneName} className="absolute inset-0 w-full h-full object-cover" />
          ) : latestSnapshot?.imageUrl ? (
            <>
              <img src={latestSnapshot.imageUrl} alt={`${zone.zoneName} camera feed`} className="absolute inset-0 w-full h-full object-cover" />
              <span className="tag absolute bottom-3 left-3 h-7 px-3 bg-inverse-surface/80 text-inverse-on-surface">
                <Icon name="photo_camera" /> Latest camera photo
                {latestSnapshot.capturedAt?.toDate && ` · ${latestSnapshot.capturedAt.toDate().toLocaleString()}`}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-on-surface-variant">
              <Icon name="image" size={48} />
              <p className="text-body-md">No zone photo</p>
            </div>
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <label className="btn-tonal btn-sm cursor-pointer shadow-elevation-1">
              <Icon name="add_photo_alternate" />
              {photoBusy ? 'Working…' : zone.zonePhotoUrl ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} disabled={photoBusy} className="hidden" />
            </label>
            {zone.zonePhotoUrl && (
              <button type="button" onClick={handleRemovePhoto} disabled={photoBusy}
                className="icon-btn icon-btn-sm icon-btn-tonal shadow-elevation-1" aria-label="Remove photo" data-tip="Remove photo">
                <Icon name="delete" />
              </button>
            )}
          </div>
        </div>
        {photoError && <p className="banner banner-error"><Icon name="error" />{photoError}</p>}

        {/* Latest readings */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-title-md text-on-surface">Latest readings</h3>
            {offline && <span className="tag bg-error-container text-on-error-container"><Icon name="wifi_off" />Device offline</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {readings.map(({ label, icon, value, unit }) => (
              <div key={label} className="card-filled p-4">
                <p className="flex items-center gap-2 text-label-lg text-on-surface-variant"><Icon name={icon} size={20} className="text-primary" />{label}</p>
                <p className="text-headline-sm text-on-surface mt-2">{value != null && !offline ? `${value}${unit}` : '–'}</p>
              </div>
            ))}
          </div>
          {zone.alertSummary && (
            <p className={`banner mt-3 ${['attention', 'critical'].includes(zone.status) ? 'banner-warning' : 'banner-info'}`}>
              <Icon name={['attention', 'critical'].includes(zone.status) ? 'warning' : 'info'} />{zone.alertSummary}
            </p>
          )}
        </section>
      </div>

      <div className="space-y-4">
        {/* Details */}
        <section className="card p-5">
          <h3 className="card-title mb-4">Details</h3>
          <div className="flex items-start gap-2">
            <TextField label="Zone name" value={zoneName} onChange={(e) => setZoneName(e.target.value)} className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && renameZone()} />
            <button onClick={renameZone} disabled={renameLoading || zoneName.trim() === zone.zoneName || !zoneName.trim()} className="btn-tonal h-12">
              {renameLoading ? 'Saving…' : 'Save'}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg bg-surface-container p-3">
              <dt className="text-label-md text-on-surface-variant">Type</dt>
              <dd className="text-title-sm text-on-surface capitalize mt-0.5">{zone.zoneType}</dd>
            </div>
            <div className="rounded-lg bg-surface-container p-3">
              <dt className="text-label-md text-on-surface-variant">Plants</dt>
              <dd className="text-title-sm text-on-surface mt-0.5">{plantCount === null ? '…' : plantCount} of {zone.totalPlantSlots ?? 4}</dd>
            </div>
          </dl>
        </section>

        {/* Sensor node */}
        <section className="card p-5">
          <h3 className="card-title mb-1">Sensor node</h3>
          <p className="text-body-sm text-on-surface-variant mb-4">Reads the zone's sensors and drives its pumps and light.</p>
          {devError && <p className="banner banner-error mb-3"><Icon name="error" />{devError}</p>}
          {zone.deviceId ? (
            <LinkedDevice dev={device} icon="sensors" missing="Device not found." onRemove={remove} busy={removing}>
              {(zone.hasFertilizer || zone.hasLight) && (
                <div className="flex gap-1.5 mt-2">
                  {zone.hasFertilizer && <ModuleChip icon="compost" label="Fertilizer" />}
                  {zone.hasLight && <ModuleChip icon="light_mode" label="Light" />}
                </div>
              )}
            </LinkedDevice>
          ) : devicesLoading ? (
            <p className="text-body-md text-on-surface-variant">Loading devices…</p>
          ) : availableDevices.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No free sensor nodes. Add one on the Devices page first.</p>
          ) : (
            <AssignRow
              label="Select device"
              options={availableDevices.map((d) => [d.id, `${d.deviceName} (${d.deviceType === 'indoor' ? 'Indoor' : 'Outdoor'})`])}
              value={selectedDeviceId}
              onChange={setSelectedDeviceId}
              onAssign={assign}
              busy={assigning}
            />
          )}
        </section>

        <CameraCard zone={zone} user={user} />
      </div>
    </div>
  )
}

// ESP32-CAM node (firmware_cam/) that auto-uploads the zone's camera feed. Linked via
// zones.cameraDeviceId ⇄ devices.assignedZoneId — separate from the sensor node's zones.deviceId.
function CameraCard({ zone, user }) {
  const [camera,           setCamera]           = useState(undefined) // undefined=loading, null=not found
  const [availableCameras, setAvailableCameras] = useState([])
  const [camerasLoading,   setCamerasLoading]   = useState(false)
  const [selectedId,       setSelectedId]       = useState('')
  const [busy,             setBusy]             = useState(false)
  const [error,            setError]            = useState(null)

  useEffect(() => {
    if (!zone.cameraDeviceId) { setCamera(null); return }
    return onSnapshot(doc(db, 'devices', zone.cameraDeviceId), (snap) => {
      setCamera(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.cameraDeviceId])

  useEffect(() => {
    if (zone.cameraDeviceId || !user) return
    setCamerasLoading(true)
    setSelectedId('')
    getDocs(query(collection(db, 'devices'), where('userId', '==', user.uid)))
      .then((snap) => {
        setAvailableCameras(snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.deviceType === 'camera' && !d.assignedZoneId))
      })
      .finally(() => setCamerasLoading(false))
  }, [zone.cameraDeviceId, user])

  async function assign() {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'zones', zone.id), { cameraDeviceId: selectedId })
      await setDoc(doc(db, 'devices', selectedId), {
        assignedZoneId: zone.id,
        userId: user.uid,
      }, { merge: true })
      setSelectedId('')
    } catch {
      setError('Failed to assign camera. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!zone.cameraDeviceId) return
    setBusy(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'devices', zone.cameraDeviceId), { assignedZoneId: null })
      await updateDoc(doc(db, 'zones', zone.id), { cameraDeviceId: null })
    } catch {
      setError('Failed to remove camera. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <h3 className="card-title mb-1">Camera</h3>
      <p className="text-body-sm text-on-surface-variant mb-4">Uploads a photo to the Camera feed every 4 hours.</p>
      {error && <p className="banner banner-error mb-3"><Icon name="error" />{error}</p>}
      {zone.cameraDeviceId ? (
        <LinkedDevice dev={camera} icon="photo_camera" missing="Camera not found." onRemove={remove} busy={busy} />
      ) : camerasLoading ? (
        <p className="text-body-md text-on-surface-variant">Loading cameras…</p>
      ) : availableCameras.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
          No free cameras. Add your ESP32-CAM (ID starts with ESP32CAM-) on the Devices page.
        </p>
      ) : (
        <AssignRow
          label="Select camera"
          options={availableCameras.map((d) => [d.id, d.deviceName])}
          value={selectedId}
          onChange={setSelectedId}
          onAssign={assign}
          busy={busy}
        />
      )}
    </section>
  )
}
