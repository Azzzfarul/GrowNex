import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, deleteDoc, updateDoc, onSnapshot, collection, query, where, getDocs, limit, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import StatusLabel from '../components/ui/StatusLabel'
import Icon from '../components/ui/Icon'
import Dialog from '../components/ui/Dialog'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'
import { deleteFile, removePlantPhotoFile } from '../lib/photoUpload'
import OverviewTab from './zones/OverviewTab'
import PlantsTab from './zones/PlantsTab'
import AutomationTab from './zones/AutomationTab'
import MonitoringTab from './zones/MonitoringTab'

const TABS = [['Overview', 'info'], ['Plants', 'potted_plant'], ['Automation', 'tune'], ['Monitoring', 'monitor_heart']]

// Clients can't list subcollections, so name them all (automationHistory is legacy data). Keep in
// step with mobile zone_detail_screen.dart; the server's account deletion uses recursiveDelete.
const ZONE_SUBCOLLECTIONS = ['sensorReadings', 'stats', 'aiCache', 'snapshots', 'automationHistory']

// Batched, so a week of readings (~10k docs) takes seconds rather than minutes.
async function deleteAll(col) {
  for (;;) {
    const snap = await getDocs(query(col, limit(400)))
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
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
      // Unassign the sensor node and camera first: while assigned, their next reading/photo
      // would recreate data under the zone being deleted
      for (const id of [zone?.deviceId, zone?.cameraDeviceId].filter(Boolean)) {
        await updateDoc(doc(db, 'devices', id), { assignedZoneId: null }).catch(() => {})
      }
      // Storage files before their docs, so a failure leaves something to retry from
      const snapshotsSnap = await getDocs(collection(db, 'zones', zoneId, 'snapshots'))
      for (const s of snapshotsSnap.docs) {
        if (s.data().storagePath) await deleteFile(s.data().storagePath)
      }
      const plantsSnap = await getDocs(query(collection(db, 'plants'), where('zoneId', '==', zoneId)))
      for (const p of plantsSnap.docs) {
        await removePlantPhotoFile(p.id)
        await deleteDoc(p.ref)
      }
      await deleteFile(`zonePhotos/${zoneId}.jpg`)
      await deleteDoc(doc(db, 'automationConfig', zoneId)).catch(() => {})
      for (const sub of ZONE_SUBCOLLECTIONS) await deleteAll(collection(db, 'zones', zoneId, sub))
      // Zone doc last: it's how a retry finds everything above
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

  if (loading) return <Loading />
  if (!zone) {
    return (
      <div>
        <PageHeader title="Zone not found" back="/plants" />
        <EmptyState icon="search_off" title="This zone doesn't exist" body="It may have been deleted." />
      </div>
    )
  }

  return (
    <div>
      {showDeleteConfirm && (
        <Dialog
          icon="delete"
          title="Delete zone?"
          onClose={() => setShowDeleteConfirm(false)}
          busy={deleting}
          actions={<>
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="btn-text">Cancel</button>
            <button onClick={handleDeleteZone} disabled={deleting} className="btn-error">{deleting ? 'Deleting…' : 'Delete'}</button>
          </>}
        >
          This permanently deletes <span className="font-medium text-on-surface">“{zone.zoneName}”</span>, its plants,
          readings and photos. This can't be undone.
        </Dialog>
      )}

      <PageHeader
        back="/plants"
        title={zone.zoneName}
        subtitle={<span className="capitalize">{zone.zoneType} · {zone.totalPlantSlots ?? 0} slot{zone.totalPlantSlots !== 1 ? 's' : ''}</span>}
        actions={
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-outlined btn-danger">
            <Icon name="delete" />Delete zone
          </button>
        }
      >
        <StatusLabel status={zone.status} />
      </PageHeader>

      <div role="tablist" className="flex border-b border-outline-variant mb-6 overflow-x-auto -mt-2">
        {TABS.map(([t, icon], i) => (
          <button key={t} role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className="tab">
            <Icon name={icon} filled={tab === i} />{t}
          </button>
        ))}
      </div>

      {tab === 0 && <OverviewTab zone={zone} />}
      {tab === 1 && <PlantsTab zone={zone} />}
      {tab === 2 && <AutomationTab zone={zone} />}
      {tab === 3 && <MonitoringTab zone={zone} />}
    </div>
  )
}
