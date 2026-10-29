import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'
import Icon from '../../components/ui/Icon'
import { uploadZonePhoto, removeZonePhoto } from '../../lib/photoUpload'

function ModuleChip({ label }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-label-md bg-primary-container text-on-primary-container">
      {label}
    </span>
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

  const isOnline = device?.status === 'online'

  return (
    <div className="space-y-4">
      {/* Zone photo */}
      <div className="relative w-full h-44 rounded-xl bg-surface-container-high overflow-hidden flex items-center justify-center">
        {zone.zonePhotoUrl ? (
          <img src={zone.zonePhotoUrl} alt={zone.zoneName} className="w-full h-full object-contain" />
        ) : latestSnapshot?.imageUrl ? (
          <>
            <img src={latestSnapshot.imageUrl} alt={`${zone.zoneName} camera feed`} className="w-full h-full object-contain" />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-6 px-2.5 rounded-lg text-label-md bg-inverse-surface/80 text-inverse-on-surface">
              <Icon name="photo_camera" size={16} /> Latest camera photo
              {latestSnapshot.capturedAt?.toDate && ` · ${latestSnapshot.capturedAt.toDate().toLocaleString()}`}
            </span>
          </>
        ) : (
          <Icon name="image" size={48} className="text-on-surface-variant" />
        )}
      </div>
      <div className="flex items-center gap-3 -mt-2">
        <label className="btn-text btn-sm cursor-pointer">
          <Icon name="add_photo_alternate" />
          {photoBusy ? 'Working…' : zone.zonePhotoUrl ? 'Change photo' : 'Add photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoFile}
            disabled={photoBusy}
            className="hidden"
          />
        </label>
        {zone.zonePhotoUrl && (
          <button
            type="button"
            onClick={handleRemovePhoto}
            disabled={photoBusy}
            className="btn-text btn-sm text-error"
          >
            Remove
          </button>
        )}
      </div>
      {photoError && <p className="text-xs text-error">{photoError}</p>}

      {/* Info card */}
      <div className="card p-5">
        <p className="text-label-lg text-primary capitalize mb-3">{zone.zoneType}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Zone name</label>
            <div className="flex gap-2">
              <input
                className="field flex-1"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
              />
              <button
                onClick={renameZone}
                disabled={renameLoading || zoneName.trim() === zone.zoneName || !zoneName.trim()}
                className="btn-filled"
              >
                {renameLoading ? '…' : 'Save'}
              </button>
            </div>
          </div>
          <p className="text-sm text-on-surface-variant">
            Plants: <span className="font-medium">{plantCount === null ? '…' : plantCount}</span>
            {' '}of <span className="font-medium">{zone.totalPlantSlots ?? 4}</span>
          </p>
          {zone.alertSummary && (
            <p className="text-sm text-warning">{zone.alertSummary}</p>
          )}
        </div>
      </div>

      {/* Device card */}
      <div className="card p-5">
        <h3 className="text-title-md text-on-surface mb-3">Device</h3>

        {devError && (
          <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-3">{devError}</p>
        )}

        {zone.deviceId ? (
          /* ── Assigned device ── */
          device === undefined ? (
            <p className="text-sm text-on-surface-variant">Loading…</p>
          ) : device === null ? (
            <p className="text-sm text-error">Device not found.</p>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-on-surface">{device.deviceName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-error'}`} />
                  <span className={`text-xs font-medium ${isOnline ? 'text-primary' : 'text-error'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                {(zone.hasFertilizer || zone.hasLight) && (
                  <div className="flex gap-1.5 mt-2">
                    {zone.hasFertilizer && <ModuleChip label="Fertilizer" />}
                    {zone.hasLight      && <ModuleChip label="Light" />}
                  </div>
                )}
              </div>
              <button
                onClick={remove}
                disabled={removing}
                className="btn-outlined btn-sm text-error border-error shrink-0"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )
        ) : (
          /* ── Dropdown assign ── */
          devicesLoading ? (
            <p className="text-sm text-on-surface-variant">Loading devices…</p>
          ) : availableDevices.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No available devices. Register a device first from the Devices page.
            </p>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="field w-full"
              >
                <option value="">Select device</option>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deviceName} ({d.deviceType === 'indoor' ? 'Indoor' : 'Outdoor'})
                  </option>
                ))}
              </select>
              <button
                onClick={assign}
                disabled={!selectedDeviceId || assigning}
                className="btn-filled w-full"
              >
                {assigning ? 'Assigning…' : 'Assign device'}
              </button>
            </div>
          )
        )}
      </div>

      <CameraCard zone={zone} user={user} />
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

  const isOnline = camera?.status === 'online'

  return (
    <div className="card p-5">
      <h3 className="text-title-md text-on-surface mb-1">Camera</h3>
      <p className="text-xs text-on-surface-variant mb-3">Uploads a photo to the Camera feed every 4 hours.</p>

      {error && (
        <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      {zone.cameraDeviceId ? (
        camera === undefined ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : camera === null ? (
          <p className="text-sm text-error">Camera not found.</p>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-on-surface">{camera.deviceName}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-error'}`} />
                <span className={`text-xs font-medium ${isOnline ? 'text-primary' : 'text-error'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
            <button
              onClick={remove}
              disabled={busy}
              className="btn-outlined btn-sm text-error border-error shrink-0"
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        )
      ) : camerasLoading ? (
        <p className="text-sm text-on-surface-variant">Loading cameras…</p>
      ) : availableCameras.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No available cameras. Register your ESP32-CAM (ID starts with ESP32CAM-) from the Devices page.
        </p>
      ) : (
        <div className="space-y-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="field w-full"
          >
            <option value="">Select camera</option>
            {availableCameras.map((d) => (
              <option key={d.id} value={d.id}>{d.deviceName}</option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={!selectedId || busy}
            className="btn-filled w-full"
          >
            {busy ? 'Assigning…' : 'Assign camera'}
          </button>
        </div>
      )}
    </div>
  )
}
