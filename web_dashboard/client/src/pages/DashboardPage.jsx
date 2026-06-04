import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import StatCard from '../components/ui/StatCard'

export default function DashboardPage() {
  const { user } = useAuth()
  const [zones, setZones] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let zonesReady = false
    let devicesReady = false
    const tryDone = () => { if (zonesReady && devicesReady) setLoading(false) }

    const zonesUnsub = onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      (snap) => {
        setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        zonesReady = true
        tryDone()
      }
    )

    const devicesUnsub = onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', user.uid)),
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        devicesReady = true
        tryDone()
      }
    )

    return () => { zonesUnsub(); devicesUnsub() }
  }, [user])

  const totalSlots = zones.reduce((s, z) => s + (z.totalPlantSlots || 0), 0)

  const zonesWithHumid = zones.filter((z) => z.latestHumid != null)
  const avgHumid = zonesWithHumid.length
    ? Math.round(zonesWithHumid.reduce((s, z) => s + z.latestHumid, 0) / zonesWithHumid.length)
    : null

  const healthyCount = zones.filter((z) => z.status === 'healthy').length
  const healthScore = zones.length ? Math.round((healthyCount / zones.length) * 100) : null

  const onlineDevices = devices.filter((d) => d.status === 'online').length

  const zonesWithTemp = zones.filter((z) => z.latestTemp != null)
  const avgTemp = zonesWithTemp.length
    ? Math.round(zonesWithTemp.reduce((s, z) => s + z.latestTemp, 0) / zonesWithTemp.length * 10) / 10
    : null

  const growthStatus =
    zones.length === 0 ? '—'
    : zones.every((z) => z.status === 'healthy') ? 'Stable and thriving'
    : zones.some((z) => z.status === 'needs attention') ? 'Needs attention'
    : 'Mixed conditions'

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Plant performance overview</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Plant slots"
          value={zones.length ? totalSlots : '—'}
          subtitle={`Across ${zones.length} zone${zones.length !== 1 ? 's' : ''}`}
          accent="green"
        />
        <StatCard
          title="Humidity"
          value={avgHumid != null ? `${avgHumid}%` : '—'}
          subtitle={avgHumid != null ? 'Avg across zones' : 'No readings yet'}
          accent="blue"
        />
        <StatCard
          title="Health score"
          value={healthScore != null ? `${healthScore}%` : '—'}
          subtitle={zones.length ? `${healthyCount} of ${zones.length} zones healthy` : 'No zones yet'}
          accent="teal"
        />
        <StatCard
          title="Devices"
          value={devices.length ? (onlineDevices > 0 ? 'Online' : 'Offline') : '—'}
          subtitle={`${onlineDevices} of ${devices.length} online`}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Growth status</h2>
          <p className="text-3xl font-bold text-brand-600 mt-3">{growthStatus}</p>
          <p className="text-sm text-gray-400 mt-2">
            {zones.length === 0
              ? 'Add zones in the mobile app to get started.'
              : `Based on ${zones.length} active zone${zones.length !== 1 ? 's' : ''}.`}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Environment</h2>
          <p className="text-3xl font-bold text-teal-600 mt-3">
            {avgTemp != null ? `${avgTemp}°C avg` : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {avgHumid != null
              ? `${avgHumid}% avg humidity across zones.`
              : 'No sensor readings available yet.'}
          </p>
        </div>
      </div>
    </div>
  )
}
