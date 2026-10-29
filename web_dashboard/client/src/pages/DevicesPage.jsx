import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'

function AddDeviceModal({ user, onClose }) {
  const [searchId,           setSearchId]           = useState('')
  const [foundDevice,        setFoundDevice]        = useState(null)
  const [searching,          setSearching]          = useState(false)
  const [searchError,        setSearchError]        = useState(null)
  const [claiming,           setClaiming]           = useState(false)
  const [claimError,         setClaimError]         = useState(null)
  const [hasLightingModule,  setHasLightingModule]  = useState(false)
  const [hasFertilizerModule,setHasFertilizerModule]= useState(false)
  const [nearbyDevices,      setNearbyDevices]      = useState(null) // null = still loading
  const [discoverError,      setDiscoverError]      = useState(null)
  const [showManual,         setShowManual]         = useState(false)

  // Discovery: the bridge auto-creates a devices/{id} doc with userId '' on a device's first MQTT
  // message, so unclaimed devices are already listed here. Only online ones are shown (status is
  // retained + LWT) so stale/test docs don't clutter the list; anything else uses the ID fallback.
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', '')),
      (snap) => {
        setNearbyDevices(snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.status === 'online')
          .sort((a, b) => (b.lastSync?.toMillis?.() ?? 0) - (a.lastSync?.toMillis?.() ?? 0)))
      },
      (err) => {
        console.error('Device discovery failed:', err)
        setDiscoverError("Couldn't search for devices. Enter the device ID instead.")
        setShowManual(true)
      }
    )
  }, [])

  function selectDevice(d) {
    setFoundDevice(d)
    setHasLightingModule(!!d.hasLightingModule)
    setHasFertilizerModule(!!d.hasFertilizerModule)
    setSearchError(null)
    setClaimError(null)
  }

  async function search() {
    const id = searchId.trim()
    if (!id) return
    setSearching(true)
    setSearchError(null)
    setFoundDevice(null)
    try {
      const snap = await getDoc(doc(db, 'devices', id))
      if (!snap.exists()) {
        setSearchError('Device not found. Check the ID and try again.')
      } else {
        const d = { id: snap.id, ...snap.data() }
        if (d.userId && d.userId !== user.uid) {
          setSearchError('This device is already registered to another account.')
        } else {
          selectDevice(d)
        }
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function claim() {
    if (!foundDevice) return
    setClaiming(true)
    setClaimError(null)
    try {
      // Transaction so two users claiming the same listed device can't both win.
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'devices', foundDevice.id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('This device no longer exists.')
        const owner = snap.data().userId
        if (owner && owner !== user.uid) throw new Error('This device was just claimed by another account.')
        tx.update(ref, { userId: user.uid, hasLightingModule, hasFertilizerModule })
      })
      onClose()
    } catch (err) {
      setClaimError(err?.message?.startsWith('This device')
        ? err.message
        : 'Failed to claim device. Please try again.')
      setClaiming(false)
    }
  }

  const isIndoor = foundDevice?.deviceType?.toLowerCase() === 'indoor'
  const isCamera = foundDevice?.deviceType === 'camera'
  const isOnline = foundDevice?.status === 'online'

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-center justify-center p-4">
      <div className="dialog w-full max-w-md p-6">
        <h2 className="text-headline-sm text-on-surface mb-2">Add Device</h2>
        <p className="text-sm text-on-surface-variant mb-5">Select a device that's powered on and connected, or enter its ID.</p>

        {/* Discovered (unclaimed + online) devices */}
        {!discoverError && (
          <div className="mb-3">
            <p className="text-title-sm text-on-surface-variant mb-2">New devices nearby</p>
            {nearbyDevices === null ? (
              <p className="text-sm text-on-surface-variant py-3">Searching…</p>
            ) : nearbyDevices.length === 0 ? (
              <p className="text-sm text-on-surface-variant bg-surface-container rounded-xl px-3 py-3">
                No new devices found. Power on your device and keep the server running — it appears
                here within a few seconds of connecting.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {nearbyDevices.map((d) => {
                  const camera = d.deviceType === 'camera'
                  const selected = foundDevice?.id === d.id
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => selectDevice(d)}
                      aria-pressed={selected}
                      className={`state-layer w-full flex items-center gap-4 text-left rounded-xl px-4 py-3 ${
                        selected ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-low'
                      }`}
                    >
                      <Icon name={camera ? 'photo_camera' : 'sensors'} className="text-on-surface-variant" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{d.deviceName}</p>
                        <p className="text-xs text-on-surface-variant truncate">
                          {camera ? 'Camera' : d.deviceType === 'outdoor' ? 'Outdoor' : 'Indoor'}
                          {d.deviceName !== d.id && <span className="font-mono"> · {d.id}</span>}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 text-label-md text-primary flex-shrink-0">
                        {selected ? <Icon name="check_circle" filled size={20} /> : <><span className="w-2 h-2 rounded-full bg-primary" />Online</>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {discoverError && (
          <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-3">{discoverError}</p>
        )}

        {!showManual ? (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="btn-text btn-sm mb-4"
          >
            Can't see your device? Enter its ID
          </button>
        ) : (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="e.g. ESP32-ABCD1234"
            className="field flex-1"
          />
          <button
            onClick={search}
            disabled={searching || !searchId.trim()}
            className="btn-filled"
          >
            {searching ? '…' : 'Find'}
          </button>
        </div>
        )}

        {searchError && (
          <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-3">{searchError}</p>
        )}

        {/* Found device card */}
        {foundDevice && (
          <div className="card-outlined p-4 mb-4 space-y-2">
            <div className="flex items-center gap-3">
              <Icon name="check_circle" filled className="text-primary" />
              <div>
                <p className="text-sm font-medium text-on-surface">{foundDevice.deviceName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-primary' : 'bg-outline'}`} />
                  <span className="text-xs text-on-surface-variant capitalize">
                    {foundDevice.deviceType ?? 'Unknown'} · {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            {!isCamera && <div className="border-t border-outline-variant pt-3 mt-1 space-y-2">
              <p className="text-xs font-medium text-on-surface-variant">Modules</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <Icon name="science" size={20} className="text-on-surface-variant" />
                <span className="flex-1 text-sm text-on-surface">Fertilizer module</span>
                <input
                  type="checkbox"
                  checked={hasFertilizerModule}
                  onChange={(e) => setHasFertilizerModule(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Icon name="light_mode" size={20} className="text-on-surface-variant" />
                <span className="flex-1 text-sm text-on-surface">Light module</span>
                <input
                  type="checkbox"
                  checked={hasLightingModule}
                  onChange={(e) => setHasLightingModule(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            </div>}
          </div>
        )}

        {claimError && (
          <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-3">{claimError}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="btn-text"
          >
            Cancel
          </button>
          {foundDevice && (
            <button
              onClick={claim}
              disabled={claiming}
              className="btn-filled"
            >
              {claiming ? 'Claiming…' : 'Claim device'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DevicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', user.uid)),
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  const onlineCount = devices.filter((d) => d.status === 'online').length
  const offlineCount = devices.length - onlineCount

  if (loading) {
    return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-headline-sm text-on-surface">Devices</h1>
        <button onClick={() => setShowAdd(true)} className="btn-filled">
          <Icon name="add" />
          Add device
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total devices', value: devices.length, icon: 'router',   tone: 'bg-primary-container text-on-primary-container' },
          { label: 'Online',        value: onlineCount,    icon: 'wifi',     tone: 'bg-secondary-container text-on-secondary-container' },
          { label: 'Offline',       value: offlineCount,   icon: 'wifi_off', tone: 'bg-surface-container-highest text-on-surface-variant' },
        ].map(({ label, value, icon, tone }) => (
          <div key={label} className={`rounded-xl p-4 flex items-center gap-3 ${tone}`}>
            <Icon name={icon} size={32} />
            <div>
              <p className="text-headline-sm">{value}</p>
              <p className="text-label-md">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {devices.length === 0 ? (
        <div className="card-outlined p-8 text-center">
          <Icon name="router" size={40} className="text-on-surface-variant" />
          <p className="text-body-md text-on-surface-variant mt-2">No devices registered yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {devices.map((device) => {
            const online = device.status === 'online'
            return (
              <div
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}`)}
                className="card state-layer p-4 flex items-center gap-4 cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-full grid place-items-center flex-shrink-0 ${online ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                  <Icon name={device.deviceType === 'camera' ? 'photo_camera' : 'sensors'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-title-md text-on-surface">{device.deviceName}</p>
                  <p className="text-body-md text-on-surface-variant capitalize">
                    {device.deviceType === 'camera' ? 'Camera' : device.deviceType === 'indoor' ? 'Indoor' : 'Outdoor'}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-label-lg flex-shrink-0 ${online ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                  <Icon name={online ? 'wifi' : 'wifi_off'} size={18} />
                  {online ? 'Online' : 'Offline'}
                </span>
                <Icon name="chevron_right" className="text-on-surface-variant" />
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <AddDeviceModal user={user} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
