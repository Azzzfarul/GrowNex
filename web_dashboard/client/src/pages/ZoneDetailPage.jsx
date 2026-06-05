import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore'
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
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function handleDeleteZone() {
    setDeleting(true)
    try {
      // Delete all plants in this zone
      const plantsSnap = await getDocs(query(collection(db, 'plants'), where('zoneId', '==', zoneId)))
      await Promise.all(plantsSnap.docs.map((d) => deleteDoc(d.ref)))
      // Delete automationConfig
      await deleteDoc(doc(db, 'automationConfig', zoneId)).catch(() => {})
      // Delete zone
      await deleteDoc(doc(db, 'zones', zoneId))
      navigate('/plants')
    } catch (e) {
      console.error('Failed to delete zone:', e)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

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
      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete zone?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently delete <span className="font-semibold text-gray-800">"{zone.zoneName}"</span> and
              all its plants. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteZone}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-xl transition-colors flex-shrink-0"
        >
          <span>🗑</span>
          <span className="font-medium">Delete zone</span>
        </button>
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
