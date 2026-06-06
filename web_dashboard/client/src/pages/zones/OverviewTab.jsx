import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'

function ModuleChip({ label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
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

  useEffect(() => { setZoneName(zone.zoneName ?? '') }, [zone.zoneName])

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
          .filter((d) => !d.assignedZoneId)
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
      <div className="w-full h-44 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
        {zone.zonePhotoUrl ? (
          <img src={zone.zonePhotoUrl} alt={zone.zoneName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl text-gray-300">🖼</span>
        )}
      </div>

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-3">{zone.zoneType}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Zone name</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
              />
              <button
                onClick={renameZone}
                disabled={renameLoading || zoneName.trim() === zone.zoneName || !zoneName.trim()}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40"
              >
                {renameLoading ? '…' : 'Save'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-700">
            Plants: <span className="font-semibold">{plantCount === null ? '…' : plantCount}</span>
            {' '}of <span className="font-semibold">{zone.totalPlantSlots ?? 4}</span>
          </p>
          {zone.alertSummary && (
            <p className="text-sm text-orange-500">{zone.alertSummary}</p>
          )}
        </div>
      </div>

      {/* Device card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Device</h3>

        {devError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{devError}</p>
        )}

        {zone.deviceId ? (
          /* ── Assigned device ── */
          device === undefined ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : device === null ? (
            <p className="text-sm text-red-400">Device not found.</p>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{device.deviceName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
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
                className="text-xs text-red-400 hover:text-red-600 font-medium border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )
        ) : (
          /* ── Dropdown assign ── */
          devicesLoading ? (
            <p className="text-sm text-gray-400">Loading devices…</p>
          ) : availableDevices.length === 0 ? (
            <p className="text-sm text-gray-400">
              No available devices. Register a device first from the Devices page.
            </p>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
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
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {assigning ? 'Assigning…' : 'Assign device'}
              </button>
            </div>
          )
        )}
      </div>

    </div>
  )
}
