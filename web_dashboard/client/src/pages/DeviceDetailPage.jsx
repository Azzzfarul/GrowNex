import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import Icon from '../components/ui/Icon'

function formatLastSync(ts) {
  if (!ts) return 'Never'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const diffS = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffS < 60) return `${diffS}s ago`
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60) return `${diffM}m ago`
  const diffH = Math.floor(diffM / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

function isSensorAvailable(ts) {
  if (!ts) return false
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return Date.now() - date.getTime() <= 10 * 60 * 1000
}

export default function DeviceDetailPage() {
  const { deviceId } = useParams()
  const navigate = useNavigate()

  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  // Only the fields the user changed; the rest show (and save) the live device values, so a
  // change from another client isn't overwritten by a stale copy.
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveLabel, setSaveLabel] = useState('Save changes')
  const [zoneInfo, setZoneInfo] = useState({ zone: null, plantsUsed: 0, loaded: false })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setEdits({})  // edits belong to one device; never carry them over to another
    const unsub = onSnapshot(doc(db, 'devices', deviceId), (snap) => {
      if (!snap.exists()) {
        setDevice(null)
        setLoading(false)
        return
      }
      setDevice({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    return unsub
  }, [deviceId])

  useEffect(() => {
    if (!device) return
    if (!device.assignedZoneId) {
      setZoneInfo({ zone: null, plantsUsed: 0, loaded: true })
      return
    }
    const zoneId = device.assignedZoneId
    let zoneData = null
    let plantsCount = 0
    let zoneLoaded = false
    let plantsLoaded = false

    function maybeSettle() {
      if (zoneLoaded && plantsLoaded)
        setZoneInfo({ zone: zoneData, plantsUsed: plantsCount, loaded: true })
    }

    const unsubZone = onSnapshot(doc(db, 'zones', zoneId), (snap) => {
      zoneData = snap.exists() ? { id: snap.id, ...snap.data() } : null
      zoneLoaded = true
      maybeSettle()
    })

    const unsubPlants = onSnapshot(
      query(collection(db, 'plants'), where('zoneId', '==', zoneId)),
      (snap) => {
        plantsCount = snap.size
        plantsLoaded = true
        maybeSettle()
      }
    )

    return () => { unsubZone(); unsubPlants() }
  }, [device?.assignedZoneId])

  async function handleDelete() {
    setDeleting(true)
    try {
      if (device.assignedZoneId) {
        await updateDoc(doc(db, 'zones', device.assignedZoneId), device.deviceType === 'camera'
          ? { cameraDeviceId: null }
          : { deviceId: null, hasFertilizer: false, hasLight: false })
      }
      await deleteDoc(doc(db, 'devices', deviceId))
      navigate('/devices')
    } catch (e) {
      console.error('Failed to delete device:', e)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const form = device && {
    deviceName: device.deviceName || '',
    hasLightingModule: !!device.hasLightingModule,
    hasFertilizerModule: !!device.hasFertilizerModule,
    ...edits,
  }
  const edit = (field, value) => setEdits((e) => ({ ...e, [field]: value }))

  async function handleSave() {
    if (!device) return
    setSaving(true)
    const sent = { ...edits }
    try {
      const patch = { ...sent }
      if ('deviceName' in patch) patch.deviceName = patch.deviceName.trim()
      if (Object.keys(patch).length) await updateDoc(doc(db, 'devices', deviceId), patch)
      // Keep the zone's copied module flags in sync (OverviewTab copies them on assign)
      if (device.assignedZoneId && device.deviceType !== 'camera') {
        await updateDoc(doc(db, 'zones', device.assignedZoneId), {
          hasLight: form.hasLightingModule,
          hasFertilizer: form.hasFertilizerModule,
        })
      }
      // Keep anything typed while the save was in flight; it hasn't been saved yet.
      setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([k, v]) => v !== sent[k])))
      setSaveLabel('Saved!')
      setTimeout(() => setSaveLabel('Save changes'), 2000)
    } catch (e) {
      console.error('Failed to save device:', e)
      setSaveLabel('Save failed — retry')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  if (!device) return <p className="text-sm text-on-surface-variant mt-8 text-center">Device not found.</p>

  const totalSlots = device.totalSlots || 4
  const slotsLeft = Math.max(0, totalSlots - zoneInfo.plantsUsed)
  const sensorAvailable = isSensorAvailable(device.lastSync)
  const isCamera = device.deviceType === 'camera'

  return (
    <div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
          <div className="dialog w-full max-w-sm p-6">
            <h2 className="text-headline-sm text-on-surface mb-4">Delete device?</h2>
            <p className="text-sm text-on-surface-variant mb-5">
              This will permanently remove <span className="font-medium text-on-surface">"{device.deviceName}"</span>.
              {device.assignedZoneId && ' It will be unassigned from its zone first.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="btn-text"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-error"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/devices')} className="icon-btn text-on-surface" aria-label="Back">
          <Icon name="arrow_back" />
        </button>
        <h1 className="text-headline-sm text-on-surface flex-1">{device.deviceName}</h1>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="btn-text text-error shrink-0">
          <Icon name="delete" />
          Delete device
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* Device info */}
        <div className="card p-5">
          <h2 className="text-title-md text-on-surface mb-4">Device info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-label-lg text-on-surface-variant mb-1">Device name</label>
              <input
                className="field w-full"
                value={form.deviceName}
                onChange={(e) => edit('deviceName', e.target.value)}
              />
            </div>
            {isCamera ? (
              <p className="flex items-center gap-2 text-body-md text-on-surface-variant">
                <Icon name="photo_camera" size={20} /> Camera node — uploads a photo to its zone's Camera feed every 4 hours.
              </p>
            ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Icon name="light_mode" className="text-on-surface-variant" />
                <span className="flex-1 text-sm text-on-surface">Light module</span>
                <input
                  type="checkbox"
                  checked={form.hasLightingModule}
                  onChange={(e) => edit('hasLightingModule', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Icon name="science" className="text-on-surface-variant" />
                <span className="flex-1 text-sm text-on-surface">Fertilizer module</span>
                <input
                  type="checkbox"
                  checked={form.hasFertilizerModule}
                  onChange={(e) => edit('hasFertilizerModule', e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            </div>
            )}
          </div>
        </div>

        {/* Zone assignment */}
        <div className="card p-5">
          <h2 className="text-title-md text-on-surface mb-4">Zone assignment</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Assigned zone</span>
              <span className="text-sm font-medium text-on-surface">
                {!zoneInfo.loaded ? '…' : (zoneInfo.zone?.zoneName ?? 'Not assigned')}
              </span>
            </div>
            {!isCamera && (
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Plant slots</span>
                <span className="text-sm font-medium text-on-surface">
                  {!zoneInfo.loaded
                    ? '…'
                    : device.assignedZoneId
                    ? `${zoneInfo.plantsUsed} used · ${slotsLeft} left (of ${totalSlots})`
                    : `${totalSlots} total`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sensor / camera status */}
        <div className="card p-5">
          <h2 className="text-title-md text-on-surface mb-4">{isCamera ? 'Camera status' : 'Sensor status'}</h2>
          <div className="space-y-3">
            {isCamera ? (
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Connection</span>
                <span className={`text-sm font-medium ${device.status === 'online' ? 'text-primary' : 'text-error'}`}>
                  {device.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Availability</span>
                <span className={`text-sm font-medium ${sensorAvailable ? 'text-primary' : 'text-error'}`}>
                  {sensorAvailable ? 'Available' : 'Unavailable'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">{isCamera ? 'Last photo' : 'Last sync'}</span>
              <span className="text-sm font-medium text-on-surface">{formatLastSync(device.lastSync)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-filled w-full"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
