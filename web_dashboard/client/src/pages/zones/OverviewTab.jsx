import { useState, useEffect } from 'react'
import { doc, onSnapshot, getDocs, collection, query, where, updateDoc } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext'
import { db } from '../../firebase'

function SensorRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
  )
}

export default function OverviewTab({ zone }) {
  const { user } = useAuth()
  const [device,           setDevice]           = useState(undefined)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [removing,  setRemoving]  = useState(false)
  const [devError,  setDevError]  = useState(null)

  // Subscribe to assigned device for live status
  useEffect(() => {
    if (!zone.deviceId) { setDevice(null); return }
    return onSnapshot(doc(db, 'devices', zone.deviceId), (snap) => {
      setDevice(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.deviceId])

  // Load unassigned devices when no device is assigned
  useEffect(() => {
    if (zone.deviceId || !user) return
    setSelectedDeviceId('')
    getDocs(query(collection(db, 'devices'), where('userId', '==', user.uid))).then((snap) => {
      setAvailableDevices(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => !d.assignedZoneId)
      )
    })
  }, [zone.deviceId, user])

  async function assign() {
    if (!selectedDeviceId) return
    setAssigning(true)
    setDevError(null)
    try {
      await updateDoc(doc(db, 'zones', zone.id),          { deviceId: selectedDeviceId })
      await updateDoc(doc(db, 'devices', selectedDeviceId), { assignedZoneId: zone.id })
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
      await updateDoc(doc(db, 'zones', zone.id),         { deviceId: null })
    } catch {
      setDevError('Failed to remove device. Please try again.')
    } finally {
      setRemoving(false)
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
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            Total plant slots: <span className="font-semibold">{zone.totalPlantSlots ?? 4}</span>
          </p>
          {zone.alertSummary && (
            <p className="text-sm text-orange-500 mt-2">{zone.alertSummary}</p>
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
          /* Assigned device */
          device === undefined ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : device === null ? (
            <p className="text-sm text-red-400">Device not found</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">{device.deviceName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              <button
                onClick={remove}
                disabled={removing}
                className="text-xs text-red-400 hover:text-red-600 font-medium border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )
        ) : (
          /* No device — assign UI */
          availableDevices.length === 0 ? (
            <p className="text-sm text-gray-400">
              No unassigned devices available. Register a device first.
            </p>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              >
                <option value="">Select a device…</option>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.deviceName}</option>
                ))}
              </select>
              <button
                onClick={assign}
                disabled={!selectedDeviceId || assigning}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {assigning ? 'Assigning…' : 'Assign device'}
              </button>
            </div>
          )
        )}
      </div>

      {/* Sensor card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Latest sensor readings</h3>
        <SensorRow label="Temperature" value={zone.latestTemp     != null ? `${zone.latestTemp}°C`     : null} />
        <SensorRow label="Humidity"    value={zone.latestHumid    != null ? `${zone.latestHumid}%`    : null} />
        <SensorRow label="Light"       value={zone.latestLight    != null ? `${zone.latestLight} lx`  : null} />
        <SensorRow label="Moisture"    value={zone.latestMoisture != null ? `${zone.latestMoisture}%` : null} />
        {zone.latestTimestamp && (
          <p className="text-xs text-gray-400 mt-3">
            Last updated{' '}
            {zone.latestTimestamp?.toDate
              ? zone.latestTimestamp.toDate().toLocaleString()
              : new Date(zone.latestTimestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
