import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot, getDocs, orderBy, Timestamp,
  setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import StatusLabel from '../../components/ui/StatusLabel'
import Icon from '../../components/ui/Icon'
import { useAuth } from '../../context/AuthContext'
import { fetchPlantProfile } from '../../lib/aiSummary'
import { zoneFitHint } from '../../lib/zoneFit'
import { plantHealth, plantHealthSummary } from '../../lib/plantHealth'
import { scoreBadge } from '../../lib/analytics'
import { uploadPlantPhoto, removePlantPhoto, removePlantPhotoFile } from '../../lib/photoUpload'

const MAX_PLANTS = 4
const LIGHT_OPTIONS = ['', 'low', 'medium', 'high']

const ZONE_HINT_REASON = {
  temperature: 'needs a different temperature range than',
  light:       'needs a different light level than',
  humidity:    'prefers a different humidity than',
  moisture:    'prefers different soil moisture than',
}


function MoistureBar({ moisture, min, max }) {
  if (moisture == null) return null
  const hasRange = min != null && max != null
  const inRange  = hasRange && moisture >= min && moisture <= max
  const tooLow   = hasRange && moisture < min

  const color = !hasRange ? 'text-tertiary'
    : inRange ? 'text-primary'
    : tooLow  ? 'text-warning'
    : 'text-error'

  const barColor = !hasRange ? 'bg-tertiary'
    : inRange ? 'bg-primary'
    : tooLow  ? 'bg-warning'
    : 'bg-error'

  const label = !hasRange ? null
    : inRange ? 'Within preferred range'
    : tooLow  ? 'Too dry'
    : 'Too wet'

  return (
    <div className="mt-3 pt-3 border-t border-outline-variant">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-on-surface-variant">Soil moisture</span>
        <span className={`font-medium ${color}`}>{Number(moisture).toFixed(1)}%</span>
      </div>
      <div className="w-full bg-surface-container-high rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(Math.max(moisture, 0), 100)}%` }}
        />
      </div>
      {label && <p className={`text-xs mt-1 ${color}`}>{label}</p>}
      {hasRange && (
        <p className="text-xs text-on-surface-variant mt-0.5">Ideal: {Number(min).toFixed(0)}–{Number(max).toFixed(0)}%</p>
      )}
    </div>
  )
}

/* ── Slot Picker ─────────────────────────────────────────────────────── */
function SlotPicker({ takenSlots, selected, onChange }) {
  return (
    <div>
      <label className="block text-label-lg text-on-surface-variant mb-2">Plant slot</label>
      <p className="text-xs text-on-surface-variant mb-3">Select an available slot for this plant.</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((slot) => {
          const isTaken    = takenSlots.has(slot)
          const isSelected = selected === slot
          return (
            <button
              key={slot}
              type="button"
              disabled={isTaken}
              onClick={() => onChange(isSelected ? null : slot)}
              aria-pressed={isSelected}
              className={`state-layer w-16 h-16 rounded-xl border flex flex-col items-center justify-center gap-1 ${
                isTaken
                  ? 'border-on-surface/[.12] text-on-surface/[.38] cursor-not-allowed'
                  : isSelected
                    ? 'bg-secondary-container border-secondary-container text-on-secondary-container'
                    : 'border-outline text-on-surface-variant'
              }`}
            >
              <Icon name={isTaken ? 'block' : isSelected ? 'check_circle' : 'potted_plant'} filled={isSelected} size={20} />
              <span className="text-label-md">Slot {slot}</span>
            </button>
          )
        })}
      </div>
      {selected == null && (
        <p className="text-xs text-on-surface-variant mt-2">No slot selected</p>
      )}
    </div>
  )
}

/* ── Preferred Conditions Fields ─────────────────────────────────────── */
function ConditionFields({ prefs, onChange }) {
  function field(key) {
    return (
      <input
        type="number"
        value={prefs[key] ?? ''}
        onChange={(e) => onChange({ ...prefs, [key]: e.target.value === '' ? null : parseFloat(e.target.value) })}
        className="field w-full"
        placeholder="—"
        step="0.1"
      />
    )
  }

  return (
    <div className="space-y-3">
      {[
        { label: 'Moisture (%)',    min: 'preferredMoistureMin',    max: 'preferredMoistureMax'    },
        { label: 'Humidity (%)',    min: 'preferredHumidityMin',    max: 'preferredHumidityMax'    },
        { label: 'Temperature (°C)', min: 'preferredTemperatureMin', max: 'preferredTemperatureMax' },
      ].map(({ label, min, max }) => (
        <div key={label}>
          <p className="text-xs font-medium text-on-surface-variant mb-1.5">{label}</p>
          <div className="flex items-center gap-2">
            {field(min)}
            <span className="text-on-surface-variant text-sm font-medium">–</span>
            {field(max)}
          </div>
        </div>
      ))}
      <div>
        <p className="text-xs font-medium text-on-surface-variant mb-1.5">Light condition</p>
        <select
          value={prefs.preferredLightCondition ?? ''}
          onChange={(e) => onChange({ ...prefs, preferredLightCondition: e.target.value || null })}
          className="field w-full capitalize"
        >
          {LIGHT_OPTIONS.map((o) => (
            <option key={o} value={o}>{o || 'Not specified'}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/* ── Add Plant Modal ─────────────────────────────────────────────────── */
function AddPlantModal({ zone, takenSlots, onClose }) {
  const { user } = useAuth()
  const [species,      setSpecies]     = useState('')
  const [name,         setName]        = useState('')
  const [selectedSlot, setSelectedSlot]= useState(null)
  const [showPrefs,    setShowPrefs]   = useState(false)
  const [prefs,        setPrefs]       = useState({})
  const [errors,       setErrors]      = useState({})
  const [loading,      setLoading]     = useState(false)
  const [aiLoading,    setAiLoading]   = useState(false)
  const [aiMeta,       setAiMeta]      = useState(null)   // { source, commonName, confidence, careNotes }
  const [zonesById,    setZonesById]   = useState(null)   // { zid: { zone, plants } } for the fit hint
  const [hintDismissed, setHintDismissed] = useState(false)
  const [photoFile,    setPhotoFile]   = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  function handlePhotoPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  // Load the user's other zones + their plants once — for the wrong-zone hint (Feature 2)
  useEffect(() => {
    if (!zone.userId) return
    let cancelled = false
    getDocs(query(collection(db, 'zones'), where('userId', '==', zone.userId))).then(async (zs) => {
      const zones = zs.docs.map((d) => ({ id: d.id, ...d.data() }))
      const map = {}
      await Promise.all(zones.map(async (z) => {
        const ps = await getDocs(query(collection(db, 'plants'), where('zoneId', '==', z.id)))
        map[z.id] = { zone: z, plants: ps.docs.map((d) => d.data()) }
      }))
      if (!cancelled) setZonesById(map)
    })
    return () => { cancelled = true }
  }, [zone.userId])

  async function suggestConditions() {
    if (species.trim().length < 3 || !user) return
    setAiLoading(true)
    try {
      const { source, profile } = await fetchPlantProfile(await user.getIdToken(), {
        species: species.trim(),
        zoneType: zone.zoneType ?? 'indoor',
      })
      if (profile) {
        setPrefs((p) => ({ ...p, ...profile }))
        setShowPrefs(true)
        setAiMeta({
          source,
          commonName: profile.commonName ?? null,
          confidence: profile.confidence ?? 'high',
          careNotes: profile.careNotes ?? null,
        })
      } else {
        setAiMeta({ source: 'fallback' })
      }
    } finally {
      setAiLoading(false)
    }
  }

  const zoneHint = (!hintDismissed && zonesById && (prefs.preferredTemperatureMin != null || prefs.preferredMoistureMin != null))
    ? zoneFitHint(prefs, zone.id, zonesById)
    : null

  function validate() {
    const e = {}
    if (!species.trim()) e.species = 'Enter the plant species'
    if (selectedSlot == null) e.slot = 'Please select a slot'
    if (takenSlots.has(selectedSlot)) e.slot = 'That slot is already taken'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      const plantRef = doc(collection(db, 'plants'))
      await setDoc(plantRef, {
        zoneId:     zone.id,
        plantName:  name.trim() || species.trim(),
        species:    species.trim(),
        status:     'healthy',
        slotNumber: selectedSlot,
        preferredMoistureMin:     prefs.preferredMoistureMin    ?? null,
        preferredMoistureMax:     prefs.preferredMoistureMax    ?? null,
        preferredHumidityMin:     prefs.preferredHumidityMin    ?? null,
        preferredHumidityMax:     prefs.preferredHumidityMax    ?? null,
        preferredTemperatureMin:  prefs.preferredTemperatureMin ?? null,
        preferredTemperatureMax:  prefs.preferredTemperatureMax ?? null,
        preferredLightCondition:  prefs.preferredLightCondition ?? null,
        notes: aiMeta?.careNotes ?? null,
        photoUrl: null,
        createdAt: serverTimestamp(),
      })
      if (photoFile) {
        const { error } = await uploadPlantPhoto(plantRef.id, photoFile)
        if (error) console.warn('Plant created, but photo upload failed:', error)
      }
      onClose()
    } catch {
      setErrors({ submit: 'Failed to add plant. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-end sm:items-center justify-center p-4">
      <div className="dialog w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-headline-sm text-on-surface">Add plant</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon name="close" /></button>
        </div>

        {errors.submit && (
          <p className="text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4">{errors.submit}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-surface-container-highest flex items-center justify-center overflow-hidden shrink-0">
              {photoPreview ? (
                <img src={photoPreview} alt="Plant preview" className="w-full h-full object-cover" />
              ) : (
                <Icon name="add_photo_alternate" className="text-on-surface-variant" />
              )}
            </div>
            <label className="btn-text cursor-pointer">
              {photoFile ? 'Change photo' : 'Add photo'} <span className="text-on-surface-variant font-normal">(optional)</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoPick} className="hidden" />
            </label>
          </div>

          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">
              Species <span className="text-error">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={species}
                onChange={(e) => { setSpecies(e.target.value); setAiMeta(null) }}
                className="field flex-1"
                placeholder="e.g. Phalaenopsis"
              />
              <button
                type="button"
                onClick={suggestConditions}
                disabled={aiLoading || species.trim().length < 3}
                className="btn-tonal h-12 px-4 shrink-0"
              >
                <Icon name="auto_awesome" />
                {aiLoading ? '…' : 'Suggest'}
              </button>
            </div>
            {errors.species && <p className="text-xs text-error mt-1">{errors.species}</p>}
            {aiMeta?.source === 'fallback' || aiMeta?.source === 'error' ? (
              <p className="text-xs text-on-surface-variant mt-1">Couldn’t fetch suggestions — enter the conditions manually.</p>
            ) : aiMeta ? (
              <p className="text-xs text-on-surface-variant mt-1">
                {aiMeta.commonName
                  ? <>Interpreted as <span className="font-medium">{aiMeta.commonName}</span>. </>
                  : null}
                {aiMeta.confidence === 'low' && <span className="text-warning">Low-confidence guess — double-check these. </span>}
                {aiMeta.careNotes && <span>Care tips added to Notes below. </span>}
              </p>
            ) : (
              <p className="text-xs text-on-surface-variant mt-1">
                Suggest fills in the preferred conditions below and adds care tips for this species to Notes.
              </p>
            )}
          </div>

          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">
              Plant nickname <span className="text-on-surface-variant">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field w-full"
              placeholder="e.g. My Orchid"
            />
          </div>

          <div>
            <SlotPicker takenSlots={takenSlots} selected={selectedSlot} onChange={setSelectedSlot} />
            {errors.slot && <p className="text-xs text-error mt-1">{errors.slot}</p>}
          </div>

          {/* Preferred conditions — collapsible */}
          <div className="border border-outline-variant rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPrefs(!showPrefs)}
              aria-expanded={showPrefs}
              className="w-full flex items-center justify-between px-4 py-3 text-label-lg text-on-surface state-layer"
            >
              <span className="flex items-center gap-2">
                <Icon name="tune" size={20} className="text-on-surface-variant" /> Preferred growing conditions <span className="text-on-surface-variant font-normal">(optional)</span>
              </span>
              <Icon name={showPrefs ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
            </button>
            {showPrefs && (
              <div className="px-4 pb-4 border-t border-outline-variant pt-4">
                {aiMeta && aiMeta.source !== 'fallback' && aiMeta.source !== 'error' ? (
                  <p className="text-xs text-primary mb-3">
                    <span className="font-medium">AI suggestion</span> — adjust as needed. Different growth
                    stages need different soil moisture and feeding; revisit these as the plant matures.
                  </p>
                ) : (
                  <p className="text-xs text-on-surface-variant mb-3">Helps compute ideal zone environment. Edit any time from plant details.</p>
                )}
                <ConditionFields prefs={prefs} onChange={setPrefs} />
              </div>
            )}
          </div>

          {zoneHint && (
            <div className="bg-warning-container rounded-lg p-3 text-body-md">
              <p className="text-on-warning-container">
                This plant {ZONE_HINT_REASON[zoneHint.reason] ?? 'is a poorer fit for'} {zone.zoneName}’s other plants
                {zoneHint.kind === 'move' ? (
                  <> — <span className="font-medium">{zoneHint.zone.zoneName}</span> is a closer match.</>
                ) : (
                  <>, and none of your other zones suit it either. Consider giving it its own zone.</>
                )}
              </p>
              <button
                type="button"
                onClick={() => setHintDismissed(true)}
                className="text-xs text-on-warning-container underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-filled"
            >
              {loading ? 'Adding…' : 'Add plant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Condition block (rule-based per-plant health) ───────────────────── */
const statScoreBadge = (s) => s == null ? 'bg-surface-container-high text-on-surface-variant' : scoreBadge(s)

function ConditionCard({ plant, zone }) {
  const [readings, setReadings] = useState(null)

  useEffect(() => {
    if (!zone?.id) return
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    getDocs(query(
      collection(db, 'zones', zone.id, 'stats'),
      where('timestamp', '>=', Timestamp.fromDate(cutoff)),
      orderBy('timestamp', 'asc'),
    )).then(s => setReadings(s.docs.map(d => d.data()))).catch(() => setReadings([]))
  }, [zone?.id])

  if (readings == null) return null
  const h = plantHealth(plant, zone, readings)

  return (
    <div className="bg-surface-container rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-label-md text-on-surface-variant">Condition</p>
        <span className={`inline-flex items-center h-6 px-2.5 rounded-lg text-label-md ${statScoreBadge(h.score)}`}>
          {h.score != null ? `${h.score}%` : '—'}
        </span>
      </div>
      <p className="text-sm text-on-surface-variant">{plantHealthSummary(h)}</p>
    </div>
  )
}

/* ── Plant Detail Modal ──────────────────────────────────────────────── */
function PlantDetailModal({ plant, zone, onClose }) {
  const [name,    setName]    = useState(plant.plantName)
  const [species, setSpecies] = useState(plant.species)
  const [notes,   setNotes]   = useState(plant.notes ?? '')
  const [prefs,   setPrefs]   = useState({
    preferredMoistureMin:    plant.preferredMoistureMin    ?? null,
    preferredMoistureMax:    plant.preferredMoistureMax    ?? null,
    preferredHumidityMin:    plant.preferredHumidityMin    ?? null,
    preferredHumidityMax:    plant.preferredHumidityMax    ?? null,
    preferredTemperatureMin: plant.preferredTemperatureMin ?? null,
    preferredTemperatureMax: plant.preferredTemperatureMax ?? null,
    preferredLightCondition: plant.preferredLightCondition ?? null,
  })
  const [loading,        setLoading]        = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [showDelConfirm, setShowDelConfirm] = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [photoUrl,       setPhotoUrl]       = useState(plant.photoUrl ?? null)
  const [photoBusy,      setPhotoBusy]      = useState(false)
  const [photoError,     setPhotoError]     = useState(null)

  async function handlePhotoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setPhotoError(null)
    const { photoUrl: url, error } = await uploadPlantPhoto(plant.id, file)
    if (error) setPhotoError(error)
    else setPhotoUrl(url)
    setPhotoBusy(false)
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true)
    setPhotoError(null)
    const { error } = await removePlantPhoto(plant.id)
    if (error) setPhotoError(error)
    else setPhotoUrl(null)
    setPhotoBusy(false)
  }

  async function handleSave() {
    setLoading(true)
    setSaved(false)
    try {
      await updateDoc(doc(db, 'plants', plant.id), {
        plantName: name.trim() || species.trim(),
        species:   species.trim(),
        notes:     notes.trim() || null,
        ...prefs,
      })
      setSaved(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      if (photoUrl) await removePlantPhotoFile(plant.id)
      await deleteDoc(doc(db, 'plants', plant.id))
      onClose()
    } catch (e) {
      console.error('Failed to delete plant:', e)
      setDeleting(false)
      setShowDelConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-scrim/[.32] z-50 flex items-end sm:items-center justify-center p-4">
      <div className="dialog w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-headline-sm text-on-surface">Plant details</h2>
          <div className="flex items-center">
            <button
              onClick={() => setShowDelConfirm(true)}
              className="icon-btn text-error"
              title="Remove plant"
              aria-label="Remove plant"
            >
              <Icon name="delete" />
            </button>
            <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon name="close" /></button>
          </div>
        </div>

        {/* Delete confirmation inline */}
        {showDelConfirm && (
          <div className="bg-error-container rounded-xl p-4 mb-4">
            <p className="text-body-md text-on-error-container mb-3">
              Remove <span className="font-medium">{plant.plantName}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDelConfirm(false)}
                disabled={deleting}
                className="btn-text btn-sm text-on-error-container"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-error btn-sm"
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        )}

        <div className="w-full h-36 rounded-xl bg-surface-container-high flex items-center justify-center mb-2 overflow-hidden">
          {photoUrl ? (
            <img src={photoUrl} alt={plant.plantName} className="w-full h-full object-contain" />
          ) : (
            <Icon name="local_florist" size={48} className="text-on-surface-variant" />
          )}
        </div>
        <div className="flex items-center gap-3 mb-5">
          <label className="btn-text btn-sm cursor-pointer">
            {photoBusy ? 'Working…' : photoUrl ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFile}
              disabled={photoBusy}
              className="hidden"
            />
          </label>
          {photoUrl && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              disabled={photoBusy}
              className="btn-text btn-sm text-error"
            >
              Remove
            </button>
          )}
        </div>
        {photoError && <p className="text-xs text-error mb-3">{photoError}</p>}

        <div className="flex gap-2 mb-5 flex-wrap">
          <StatusLabel status={plant.status} />
          {plant.slotNumber > 0 && (
            <span className="inline-flex items-center h-6 px-2.5 rounded-lg border border-outline-variant text-label-md text-on-surface-variant">
              Slot {plant.slotNumber}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false) }}
              className="field w-full"
            />
          </div>
          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Species</label>
            <input
              type="text"
              value={species}
              onChange={(e) => { setSpecies(e.target.value); setSaved(false) }}
              className="field w-full"
            />
          </div>

          {/* Preferred conditions — editable */}
          <div className="bg-surface-container rounded-xl p-4">
            <p className="text-label-md text-on-surface-variant mb-3">
              Preferred growing conditions
            </p>
            <ConditionFields prefs={prefs} onChange={(p) => { setPrefs(p); setSaved(false) }} />
          </div>

          {zone && <ConditionCard plant={plant} zone={zone} />}

          <div>
            <label className="block text-label-lg text-on-surface-variant mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
              rows={4}
              className="field w-full resize-none"
              placeholder="Enter notes"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="btn-filled w-full"
          >
            {loading ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Plants Tab ──────────────────────────────────────────────────────── */
export default function PlantsTab({ zone }) {
  const [plants,   setPlants]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'plants'), where('zoneId', '==', zone.id)),
      (snap) => {
        setPlants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [zone.id])

  const isFull     = plants.length >= MAX_PLANTS
  const takenSlots = new Set(plants.map((p) => p.slotNumber).filter(Boolean))

  if (loading) {
    return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  }

  return (
    <>
      {showAdd && (
        <AddPlantModal
          zone={zone}
          takenSlots={takenSlots}
          onClose={() => setShowAdd(false)}
        />
      )}
      {selected && (
        <PlantDetailModal plant={selected} zone={zone} onClose={() => setSelected(null)} />
      )}

      <div>
        <button
          onClick={() => !isFull && setShowAdd(true)}
          disabled={isFull}
          className="btn-filled w-full mb-5"
        >
          <Icon name={isFull ? 'block' : 'add'} />
          {isFull ? `Zone full (${plants.length}/${MAX_PLANTS})` : 'Add plant'}
        </button>

        {plants.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-10">No plants in this zone yet.</p>
        ) : (
          <div className="space-y-3">
            {plants.map((plant) => {
              const slotMoisture = plant.slotNumber > 0
                ? zone[`latestMoisture${plant.slotNumber}`] ?? null
                : null
              return (
                <button
                  key={plant.id}
                  onClick={() => setSelected(plant)}
                  className="card state-layer w-full text-left p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden">
                      {plant.photoUrl ? (
                        <img src={plant.photoUrl} alt={plant.plantName} className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="local_florist" className="text-on-surface-variant" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="text-title-md text-on-surface">{plant.plantName}</p>
                        <StatusLabel status={plant.status} className="ml-2" />
                      </div>
                      <p className="text-body-md text-on-surface-variant mb-3">{plant.species}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {plant.slotNumber > 0 && (
                      <span className="inline-flex items-center h-6 px-2.5 rounded-lg border border-outline-variant text-label-md text-on-surface-variant">
                        Slot {plant.slotNumber}
                      </span>
                    )}
                    {plant.preferredLightCondition && (
                      <span className="inline-flex items-center h-6 px-2.5 rounded-lg bg-warning-container text-on-warning-container text-label-md capitalize">
                        Light: {plant.preferredLightCondition}
                      </span>
                    )}
                  </div>
                  <MoistureBar
                    moisture={slotMoisture}
                    min={plant.preferredMoistureMin ?? null}
                    max={plant.preferredMoistureMax ?? null}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
