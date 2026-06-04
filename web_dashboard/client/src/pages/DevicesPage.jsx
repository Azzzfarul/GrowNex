import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function DevicesPage() {
  const { user } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Connected devices</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Control your hardware and check which devices are online.</p>

      {devices.length === 0 ? (
        <p className="text-sm text-gray-400">No devices found. Register devices in the mobile app.</p>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => (
            <div key={device.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 text-xl flex-shrink-0">
                ⊕
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{device.deviceName}</p>
                <p className="text-sm text-gray-400 capitalize">{device.deviceType}</p>
                <div className="flex gap-3 mt-1">
                  {device.hasLightingModule && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Lighting</span>
                  )}
                  {device.hasFertilizerModule && (
                    <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">Fertilizer</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  device.status === 'online'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {device.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
