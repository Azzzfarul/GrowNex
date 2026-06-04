import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

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
  const [deviceName, setDeviceName] = useState('')
  const [hasLightingModule, setHasLightingModule] = useState(false)
  const [hasFertilizerModule, setHasFertilizerModule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveLabel, setSaveLabel] = useState('Save changes')
  const [zoneInfo, setZoneInfo] = useState({ zone: null, plantsUsed: 0, loaded: false })

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'devices', deviceId), (snap) => {
      if (!snap.exists()) {
        setDevice(null)
        setLoading(false)
        return
      }
      const d = { id: snap.id, ...snap.data() }
      setDevice(d)
      setDeviceName(d.deviceName || '')
      setHasLightingModule(d.hasLightingModule || false)
      setHasFertilizerModule(d.hasFertilizerModule || false)
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
    async function loadZone() {
      const zoneSnap = await getDoc(doc(db, 'zones', device.assignedZoneId))
      const zone = zoneSnap.exists() ? { id: zoneSnap.id, ...zoneSnap.data() } : null
      const plantsSnap = await getDocs(
        query(collection(db, 'plants'), where('zoneId', '==', device.assignedZoneId))
      )
      setZoneInfo({ zone, plantsUsed: plantsSnap.size, loaded: true })
    }
    loadZone()
  }, [device?.assignedZoneId])

  async function handleSave() {
    if (!device) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'devices', deviceId), {
        deviceName: deviceName.trim(),
        hasLightingModule,
        hasFertilizerModule,
      })
      setSaveLabel('Saved!')
      setTimeout(() => setSaveLabel('Save changes'), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  if (!device) return <p className="text-sm text-gray-400 mt-8 text-center">Device not found.</p>

  const totalSlots = device.totalSlots || 4
  const slotsLeft = Math.max(0, totalSlots - zoneInfo.plantsUsed)
  const sensorAvailable = isSensorAvailable(device.lastSync)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/devices')}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{device.deviceName}</h1>
      </div>

      <div className="flex flex-col gap-4">
        {/* Device info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Device info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Device name</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-lg leading-none">☀️</span>
                <span className="flex-1 text-sm text-gray-800">Light module</span>
                <input
                  type="checkbox"
                  checked={hasLightingModule}
                  onChange={(e) => setHasLightingModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-lg leading-none">🧪</span>
                <span className="flex-1 text-sm text-gray-800">Fertilizer module</span>
                <input
                  type="checkbox"
                  checked={hasFertilizerModule}
                  onChange={(e) => setHasFertilizerModule(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
              </label>
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">📷</span>
                <span className="flex-1 text-sm text-gray-800">Camera module</span>
                <span className="text-xs text-green-600 font-semibold">Built-in</span>
              </div>
            </div>
          </div>
        </div>

        {/* Zone assignment */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Zone assignment</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Assigned zone</span>
              <span className="text-sm font-semibold text-gray-800">
                {!zoneInfo.loaded ? '…' : (zoneInfo.zone?.zoneName ?? 'Not assigned')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Plant slots</span>
              <span className="text-sm font-semibold text-gray-800">
                {!zoneInfo.loaded
                  ? '…'
                  : device.assignedZoneId
                  ? `${zoneInfo.plantsUsed} used · ${slotsLeft} left (of ${totalSlots})`
                  : `${totalSlots} total`}
              </span>
            </div>
          </div>
        </div>

        {/* Sensor status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Sensor status</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Availability</span>
              <span className={`text-sm font-semibold ${sensorAvailable ? 'text-green-600' : 'text-red-400'}`}>
                {sensorAvailable ? 'Available' : 'Unavailable'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Last sync</span>
              <span className="text-sm font-semibold text-gray-800">{formatLastSync(device.lastSync)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
