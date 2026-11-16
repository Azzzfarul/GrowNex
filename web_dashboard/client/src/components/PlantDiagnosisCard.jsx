import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Icon from './ui/Icon'
import StatusLabel from './ui/StatusLabel'
import { formatRelative } from '../hooks/useNotifications'
import { conditionLabel, conditionTone } from '../lib/plantDiagnosis'
import { runPlantDiagnosis, deleteDiagnosis } from '../lib/diagnosisApi'

// AI diagnosis of one plant from a close-up photo, with its history.
// Mobile: widgets/plant_diagnosis_card.dart.
export default function PlantDiagnosisCard({ plant }) {
  const { user } = useAuth()
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)  // a history entry expanded in place of the latest

  useEffect(() => {
    if (!user) return
    // Two equality filters, sorted here: no composite index needed.
    const q = query(collection(db, 'plantDiagnoses'), where('userId', '==', user.uid), where('plantId', '==', plant.id))
    return onSnapshot(q, (snap) => {
      setItems(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity)))
    }, () => setItems([]))
  }, [user, plant.id])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    const { error: err } = await runPlantDiagnosis(user, plant.id, file)
    if (err) setError(err)
    else setOpenId(null)
    setBusy(false)
  }

  async function handleDelete(d) {
    setError(null)
    try {
      await deleteDiagnosis(d)
    } catch {
      setError("Couldn't delete that diagnosis. Please try again.")
    }
  }

  const shown = items?.find((d) => d.id === openId) ?? items?.[0]

  return (
    <div className="card-filled p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-title-sm text-on-surface">Visual diagnosis</p>
        <label className={`btn-tonal btn-sm ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
          <Icon name="add_a_photo" />
          {busy ? 'Diagnosing…' : 'Upload photo'}
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} className="hidden" />
        </label>
      </div>
      <p className="text-body-sm text-on-surface-variant">
        A close-up of the affected leaves works best. AI estimate, not a professional diagnosis.
      </p>
      {error && <p className="banner banner-error mt-3" role="alert"><Icon name="error" />{error}</p>}

      {shown && (
        <div className="mt-4">
          <img src={shown.imageUrl} alt={`${plant.plantName} diagnosis photo`} className="w-full aspect-[4/3] object-cover rounded-lg bg-surface-container-high" />
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <StatusLabel status={conditionLabel(shown.condition)} tone={conditionTone(shown.condition, shown.severity)} />
            {shown.severity !== 'none' && <span className="tag bg-surface-container-high text-on-surface-variant">{shown.severity}</span>}
            <span className="text-body-sm text-on-surface-variant">
              {Math.round((shown.confidence ?? 0) * 100)}% confident · {formatRelative(shown.createdAt) || 'just now'}
            </span>
          </div>
          {shown.summary && <p className="text-body-md text-on-surface mt-2">{shown.summary}</p>}
          {shown.likelyCause && <p className="text-body-md text-on-surface-variant mt-1">Likely cause: {shown.likelyCause}</p>}
          <DiagnosisList title="What the photo shows" items={shown.observations} />
          <DiagnosisList title="What to do" items={shown.advice} />
        </div>
      )}

      {items?.length > 0 && (
        <div className="mt-4">
          <p className="text-label-lg text-on-surface-variant mb-1">History</p>
          <ul>
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-1">
                <button type="button" onClick={() => setOpenId(d.id)} aria-current={d.id === shown?.id}
                  className={`flex-1 min-w-0 flex items-center gap-2 text-left rounded-lg px-2 h-10 hover:bg-surface-container-high ${d.id === shown?.id ? 'bg-surface-container-high' : ''}`}>
                  <StatusLabel status={conditionLabel(d.condition)} tone={conditionTone(d.condition, d.severity)} />
                  <span className="text-body-sm text-on-surface-variant truncate">{formatRelative(d.createdAt) || 'just now'}</span>
                </button>
                <button type="button" onClick={() => handleDelete(d)} className="icon-btn icon-btn-sm" aria-label="Delete diagnosis" data-tip="Delete">
                  <Icon name="delete" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DiagnosisList({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="mt-3">
      <p className="text-label-lg text-on-surface-variant">{title}</p>
      <ul className="list-disc pl-5 text-body-md text-on-surface">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  )
}
