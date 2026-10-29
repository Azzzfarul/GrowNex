import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import Dialog from '../components/ui/Dialog'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'

function Fact({ label, children, tone = 'text-on-surface' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-outline-variant last:border-0">
      <span className="text-body-md text-on-surface-variant">{label}</span>
      <span className={`text-title-sm text-right ${tone}`}>{children}</span>
    </div>
  )
}

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

  if (loading) return <Loading />
  if (!device) {
    return (
      <div>
        <PageHeader title="Device not found" back="/devices" />
        <EmptyState icon="search_off" title="This device doesn't exist" body="It may have been removed from your account." />
      </div>
    )
  }

  const totalSlots = device.totalSlots || 4
  const slotsLeft = Math.max(0, totalSlots - zoneInfo.plantsUsed)
  const sensorAvailable = isSensorAvailable(device.lastSync)
  const isCamera = device.deviceType === 'camera'
  const online = device.status === 'online'
  const dirty = Object.keys(edits).length > 0

  return (
    <div>
      {showDeleteConfirm && (
        <Dialog
          icon="delete"
          title="Remove device?"
          onClose={() => setShowDeleteConfirm(false)}
          busy={deleting}
          actions={<>
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="btn-text">Cancel</button>
            <button onClick={handleDelete} disabled={deleting} className="btn-error">{deleting ? 'Deleting…' : 'Delete'}</button>
          </>}
        >
          <span className="font-medium text-on-surface">“{device.deviceName}”</span> will be removed from your account.
          {device.assignedZoneId && ' It will be unassigned from its zone first.'}
        </Dialog>
      )}

      <PageHeader
        back="/devices"
        title={device.deviceName}
        subtitle={device.deviceName !== device.id && <span className="font-mono">{device.id}</span>}
        actions={<button onClick={() => setShowDeleteConfirm(true)} className="btn-outlined btn-danger"><Icon name="delete" />Delete device</button>}
      >
        <span className={`tag ${online ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
          <Icon name={online ? 'wifi' : 'wifi_off'} />{online ? 'Online' : 'Offline'}
        </span>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* Settings */}
        <section className="card p-5">
          <h2 className="card-title mb-5">Settings</h2>
          <TextField label="Device name" value={form.deviceName} onChange={(e) => edit('deviceName', e.target.value)} className="max-w-md" />
          {isCamera ? (
            <p className="flex items-center gap-2 text-body-md text-on-surface-variant mt-5">
              <Icon name="photo_camera" size={20} /> Camera node — uploads a photo to its zone's Camera feed every 4 hours.
            </p>
          ) : (
            <div className="mt-5">
              <p className="text-title-sm text-on-surface mb-1">Installed modules</p>
              <p className="text-body-sm text-on-surface-variant mb-2">Controls which automations its zone offers.</p>
              {[
                ['light_mode', 'Light module', 'hasLightingModule'],
                ['science', 'Fertilizer module', 'hasFertilizerModule'],
              ].map(([icon, label, key]) => (
                <label key={key} className="state-layer flex items-center gap-4 h-14 px-3 -mx-3 rounded-lg cursor-pointer max-w-md">
                  <Icon name={icon} className="text-on-surface-variant" />
                  <span className="flex-1 text-body-lg text-on-surface">{label}</span>
                  <input type="checkbox" checked={form[key]} onChange={(e) => edit(key, e.target.checked)} className="checkbox" />
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
            {saveLabel !== 'Save changes' && !saving && (
              <span className={`text-body-md ${saveLabel === 'Saved!' ? 'text-primary' : 'text-error'}`}>
                {saveLabel === 'Saved!' ? 'Saved' : "Couldn't save. Try again."}
              </span>
            )}
            {dirty && <button onClick={() => setEdits({})} disabled={saving} className="btn-text">Discard</button>}
            <button onClick={handleSave} disabled={saving} className="btn-filled">{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </section>

        <div className="space-y-4">
          {/* Status */}
          <section className="card p-5">
            <h2 className="card-title mb-1">{isCamera ? 'Camera status' : 'Sensor status'}</h2>
            {isCamera
              ? <Fact label="Connection" tone={online ? 'text-primary' : 'text-error'}>{online ? 'Online' : 'Offline'}</Fact>
              : <Fact label="Availability" tone={sensorAvailable ? 'text-primary' : 'text-error'}>{sensorAvailable ? 'Available' : 'Unavailable'}</Fact>}
            <Fact label={isCamera ? 'Last photo' : 'Last sync'}>{formatLastSync(device.lastSync)}</Fact>
            <Fact label="Type"><span className="capitalize">{device.deviceType ?? '—'}</span></Fact>
          </section>

          {/* Zone */}
          <section className="card p-5">
            <h2 className="card-title mb-1">Zone</h2>
            <Fact label="Assigned to">
              {!zoneInfo.loaded ? '…' : zoneInfo.zone
                ? <Link to={`/zones/${zoneInfo.zone.id}`} className="text-primary hover:underline">{zoneInfo.zone.zoneName}</Link>
                : 'Not assigned'}
            </Fact>
            {!isCamera && (
              <Fact label="Plant slots">
                {!zoneInfo.loaded ? '…' : device.assignedZoneId
                  ? `${zoneInfo.plantsUsed} used · ${slotsLeft} free`
                  : `${totalSlots} total`}
              </Fact>
            )}
            {!device.assignedZoneId && (
              <p className="text-body-sm text-on-surface-variant mt-2">Assign it from a zone's Overview tab.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
