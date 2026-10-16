import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Add Device</h2>
        <p className="text-sm text-gray-400 mb-5">Select a device that's powered on and connected, or enter its ID.</p>

        {/* Discovered (unclaimed + online) devices */}
        {!discoverError && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">New devices nearby</p>
            {nearbyDevices === null ? (
              <p className="text-sm text-gray-400 py-3">Searching…</p>
            ) : nearbyDevices.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-3 py-3">
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
                      className={`w-full flex items-center gap-3 text-left border rounded-xl px-3 py-2.5 transition-colors ${
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl leading-none">{camera ? '📷' : '🖥️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{d.deviceName}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {camera ? 'Camera' : d.deviceType === 'outdoor' ? 'Outdoor' : 'Indoor'}
                          {d.deviceName !== d.id && <span className="font-mono"> · {d.id}</span>}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600 flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Online
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {discoverError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{discoverError}</p>
        )}

        {!showManual ? (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="text-xs font-medium text-brand-700 hover:text-brand-800 mb-4"
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
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={search}
            disabled={searching || !searchId.trim()}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {searching ? '…' : 'Find'}
          </button>
        </div>
        )}

        {searchError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{searchError}</p>
        )}

        {/* Found device card */}
        {foundDevice && (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-base">✓</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{foundDevice.deviceName}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500 capitalize">
                    {foundDevice.deviceType ?? 'Unknown'} · {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            {!isCamera && <div className="border-t border-green-200 pt-3 mt-1 space-y-2">
              <p className="text-xs font-semibold text-gray-500">Modules</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-base leading-none">🧪</span>
                <span className="flex-1 text-sm text-gray-800">Fertilizer module</span>
                <input
                  type="checkbox"
                  checked={hasFertilizerModule}
                  onChange={(e) => setHasFertilizerModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-base leading-none">☀️</span>
                <span className="flex-1 text-sm text-gray-800">Light module</span>
                <input
                  type="checkbox"
                  checked={hasLightingModule}
                  onChange={(e) => setHasLightingModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
            </div>}
          </div>
        )}

        {claimError && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{claimError}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {foundDevice && (
            <button
              onClick={claim}
              disabled={claiming}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
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
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span>Add device</span>
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-green-700 rounded-2xl shadow-md p-5 mb-6">
        <div className="grid grid-cols-3 divide-x divide-white/20">
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-white/70 text-xl leading-none">🖥️</span>
            <span className="text-white text-2xl font-bold">{devices.length}</span>
            <span className="text-white/70 text-xs">Total devices</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-white/70 text-xl leading-none">📶</span>
            <span className="text-white text-2xl font-bold">{onlineCount}</span>
            <span className="text-white/70 text-xs">Online</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-white/70 text-xl leading-none">📵</span>
            <span className="text-white text-2xl font-bold">{offlineCount}</span>
            <span className="text-white/70 text-xs">Offline</span>
          </div>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400">No devices registered yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {devices.map((device) => {
            const online = device.status === 'online'
            return (
              <div
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${online ? 'bg-green-50' : 'bg-gray-100'}`}>
                  <span className={`text-xl leading-none ${online ? '' : 'grayscale opacity-50'}`}>
                    {device.deviceType === 'camera' ? '📷' : '🖥️'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{device.deviceName}</p>
                  <p className="text-sm text-gray-400 capitalize">
                    {device.deviceType === 'camera' ? 'Camera' : device.deviceType === 'indoor' ? 'Indoor' : 'Outdoor'}
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0 ${online ? 'bg-green-50' : 'bg-gray-100'}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-green-600' : 'bg-gray-400'}`} />
                  <span className={`text-xs font-semibold ${online ? 'text-green-700' : 'text-gray-500'}`}>
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <AddDeviceModal user={user} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
