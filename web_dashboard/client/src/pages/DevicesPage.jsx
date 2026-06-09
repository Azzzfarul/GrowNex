import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore'
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
          setFoundDevice(d)
          setHasLightingModule(!!d.hasLightingModule)
          setHasFertilizerModule(!!d.hasFertilizerModule)
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
      await setDoc(doc(db, 'devices', foundDevice.id), { userId: user.uid, hasLightingModule, hasFertilizerModule }, { merge: true })
      onClose()
    } catch {
      setClaimError('Failed to claim device. Please try again.')
      setClaiming(false)
    }
  }

  const isIndoor = foundDevice?.deviceType?.toLowerCase() === 'indoor'
  const isOnline = foundDevice?.status === 'online'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Add Device</h2>
        <p className="text-sm text-gray-400 mb-5">Enter your ESP32 device ID to link it to your account.</p>

        {/* Search row */}
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
            <div className="border-t border-green-200 pt-3 mt-1 space-y-2">
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
            </div>
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
                  <span className={`text-xl leading-none ${online ? '' : 'grayscale opacity-50'}`}>🖥️</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{device.deviceName}</p>
                  <p className="text-sm text-gray-400 capitalize">
                    {device.deviceType === 'indoor' ? 'Indoor' : 'Outdoor'}
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
