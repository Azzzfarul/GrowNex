import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

function AddDeviceModal({ userId, onClose }) {
  const [deviceName, setDeviceName] = useState('')
  const [deviceType, setDeviceType] = useState('indoor')
  const [hasLightingModule, setHasLightingModule] = useState(false)
  const [hasFertilizerModule, setHasFertilizerModule] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!deviceName.trim()) return
    setLoading(true)
    setError('')
    try {
      await addDoc(collection(db, 'devices'), {
        userId,
        deviceName: deviceName.trim(),
        deviceType,
        status: 'offline',
        totalSlots: 4,
        hasLightingModule,
        hasFertilizerModule,
        lastSync: null,
        assignedZoneId: null,
      })
      onClose()
    } catch {
      setError('Failed to add device. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-5">Add Device</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Device name</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. Greenhouse sensor"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Device type</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
            >
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Optional modules</p>
            <p className="text-xs text-gray-400 mb-3">Camera module is built-in on all devices.</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50">
                <span className="text-lg leading-none">☀️</span>
                <span className="flex-1 text-sm text-gray-800">Light module</span>
                <input
                  type="checkbox"
                  checked={hasLightingModule}
                  onChange={(e) => setHasLightingModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50">
                <span className="text-lg leading-none">🧪</span>
                <span className="flex-1 text-sm text-gray-800">Fertilizer module</span>
                <input
                  type="checkbox"
                  checked={hasFertilizerModule}
                  onChange={(e) => setHasFertilizerModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Registering…' : 'Register device'}
            </button>
          </div>
        </form>
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

      {showAdd && <AddDeviceModal userId={user.uid} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
