import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import OverviewTab from './zones/OverviewTab'
import PlantsTab from './zones/PlantsTab'
import AutomationTab from './zones/AutomationTab'
import MonitoringTab from './zones/MonitoringTab'

const TABS = ['Overview', 'Plants', 'Automation', 'Monitoring']

function statusColor(status) {
  switch (status?.toLowerCase()) {
    case 'healthy': return 'bg-green-100 text-green-700'
    case 'needs attention': return 'bg-orange-100 text-orange-700'
    case 'stable': return 'bg-teal-100 text-teal-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export default function ZoneDetailPage() {
  const { zoneId } = useParams()
  const navigate = useNavigate()
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'zones', zoneId), (snap) => {
      setZone(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })
    return unsub
  }, [zoneId])

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }
  if (!zone) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Zone not found.</p>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/plants')}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{zone.zoneName}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(zone.status)}`}>
              {zone.status || 'Unknown'}
            </span>
          </div>
          <p className="text-sm text-gray-500 capitalize mt-0.5">
            {zone.zoneType} · {zone.totalPlantSlots} slot{zone.totalPlantSlots !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === i
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && <OverviewTab zone={zone} />}
      {tab === 1 && <PlantsTab zone={zone} />}
      {tab === 2 && <AutomationTab zone={zone} />}
      {tab === 3 && <MonitoringTab zone={zone} />}
    </div>
  )
}
