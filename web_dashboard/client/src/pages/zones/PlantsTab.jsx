import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, getDocs,
  setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import StatusLabel from '../../components/ui/StatusLabel'
import Icon from '../../components/ui/Icon'
import TextField from '../../components/ui/TextField'
import Dialog, { Sheet } from '../../components/ui/Dialog'
import Loading from '../../components/ui/Loading'
import { useAuth } from '../../context/AuthContext'
import { fetchPlantProfile, identifyPlant } from '../../lib/aiSummary'
import { zoneFitHint } from '../../lib/zoneFit'
import { plantHealth, plantHealthSummary } from '../../lib/plantHealth'
import { scoreBadge, plantStatus } from '../../lib/analytics'
import { fetchZoneStats } from '../../lib/zoneStats'
import { uploadPlantPhoto, removePlantPhoto, removePlantPhotoFile } from '../../lib/photoUpload'
import { deletePlantDiagnoses } from '../../lib/diagnosisApi'
import PlantDiagnosisCard from '../../components/PlantDiagnosisCard'

const LIGHT_OPTIONS = ['', 'low', 'medium', 'high']

const ZONE_HINT_REASON = {
  temperature: 'needs a different temperature range than',
  light:       'needs a different light level than',
  humidity:    'prefers a different humidity than',
  moisture:    'prefers different soil moisture than',
}


function ConditionFields({ prefs, onChange }) {
  const num = (key, label) => (
    <TextField
      type="number"
      step="0.1"
      label={label}
      value={prefs[key] ?? ''}
      onChange={(e) => onChange({ ...prefs, [key]: e.target.value === '' ? null : parseFloat(e.target.value) })}
    />
  )
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      {num('preferredMoistureMin', 'Moisture min (%)')}
      {num('preferredMoistureMax', 'Moisture max (%)')}
      {num('preferredHumidityMin', 'Humidity min (%)')}
      {num('preferredHumidityMax', 'Humidity max (%)')}
      {num('preferredTemperatureMin', 'Temp min (°C)')}
      {num('preferredTemperatureMax', 'Temp max (°C)')}
      <TextField
        as="select"
        label="Light condition"
        value={prefs.preferredLightCondition ?? ''}
        onChange={(e) => onChange({ ...prefs, preferredLightCondition: e.target.value || null })}
        className="col-span-2 capitalize"
      >
        {LIGHT_OPTIONS.map((o) => <option key={o} value={o}>{o || 'Not specified'}</option>)}
      </TextField>
    </div>
  )
}

/* ── Add Plant Modal ─────────────────────────────────────────────────── */
function AddPlantModal({ zone, onClose }) {
  const { user } = useAuth()
  const [species,      setSpecies]     = useState('')
  const [name,         setName]        = useState('')
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
  const [idLoading,    setIdLoading]   = useState(false)
  const [idResult,     setIdResult]    = useState(null)   // { results } | { error } from identifyPlant
  const suggestSeq = useRef(0)  // only the latest Suggest's answer is applied

  function handlePhotoPick(e) {
    const file = e.target.files?.[0]
    if (!file) return null
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setIdResult(null)
    return file
  }

  async function identify(file = photoFile) {
    if (!file || !user) return
    setIdLoading(true)
    setIdResult(await identifyPlant(await user.getIdToken(), file))
    setIdLoading(false)
  }

  // The one line under the species tools: the latest result, or how to use them
  function speciesHelper() {
    if (aiMeta?.source === 'fallback' || aiMeta?.source === 'error') return 'Couldn’t fetch suggestions. Enter the conditions manually.'
    if (aiMeta) return <>
      {aiMeta.commonName && <>Interpreted as <span className="font-medium text-on-surface">{aiMeta.commonName}</span>. </>}
      {aiMeta.confidence === 'low' && <span className="text-warning">Low-confidence guess, so double-check these. </span>}
      {aiMeta.careNotes && 'Care tips added to Notes.'}
    </>
    if (idResult?.error) return <span className="text-error">{idResult.error}</span>
    if (idResult?.results?.length === 0) return 'No match. Try a closer, well-lit photo of a leaf or flower.'
    if (idResult?.results?.length) {
      return idResult.results[0].score < 0.3
        ? <span className="text-warning">Low confidence: pick only if one looks right.</span>
        : 'Pick the match that looks right.'
    }
    return 'Type a name and tap Suggest, or let a photo name it.'
  }

  // A Pl@ntNet match fills in the species (and the nickname, if empty), then its conditions
  function pickMatch(m) {
    setSpecies(m.species)
    if (!name.trim() && m.commonName) setName(m.commonName)
    suggestConditions(m.species)
  }

  // Load the user's other zones (own and shared) + their plants once — for the wrong-zone hint
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getDocs(query(collection(db, 'zones'), where('memberIds', 'array-contains', user.uid))).then(async (zs) => {
      const zones = zs.docs.map((d) => ({ id: d.id, ...d.data() }))
      const map = {}
      await Promise.all(zones.map(async (z) => {
        const ps = await getDocs(query(collection(db, 'plants'), where('zoneId', '==', z.id)))
        map[z.id] = { zone: z, plants: ps.docs.map((d) => d.data()) }
      }))
      if (!cancelled) setZonesById(map)
    })
    return () => { cancelled = true }
  }, [user])

  async function suggestConditions(sp = species) {
    if (sp.trim().length < 3 || !user) return
    const seq = ++suggestSeq.current
    setAiLoading(true)
    setAiMeta(null)
    try {
      const { source, profile } = await fetchPlantProfile(await user.getIdToken(), {
        species: sp.trim(),
        zoneType: zone.zoneType ?? 'indoor',
      })
      // A newer pick, Suggest or edit of the species replaced this one: its answer would
      // save another plant's conditions under this species
      if (seq !== suggestSeq.current) return
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
      if (seq === suggestSeq.current) setAiLoading(false)
    }
  }

  const zoneHint = (!hintDismissed && zonesById && (prefs.preferredTemperatureMin != null || prefs.preferredMoistureMin != null))
    ? zoneFitHint(prefs, zone.id, zonesById)
    : null

  function validate() {
    const e = {}
    if (!species.trim()) e.species = 'Enter the plant species'
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

  const aiOk = aiMeta && aiMeta.source !== 'fallback' && aiMeta.source !== 'error'

  return (
    <Dialog
      title="Add plant"
      size="lg"
      onClose={onClose}
      busy={loading}
      actions={<>
        <button type="button" onClick={onClose} className="btn-text">Cancel</button>
        <button type="submit" form="add-plant-form" disabled={loading} className="btn-filled">{loading ? 'Adding…' : 'Add plant'}</button>
      </>}
    >
      <form id="add-plant-form" onSubmit={handleSubmit} className="space-y-5 pt-1">
        {errors.submit && <p className="banner banner-error"><Icon name="error" />{errors.submit}</p>}

        <div className="flex items-start gap-4">
          <label className="state-layer w-20 h-20 rounded-xl bg-surface-container-highest grid place-items-center overflow-hidden shrink-0 cursor-pointer" aria-label="Add photo">
            {photoPreview
              ? <img src={photoPreview} alt="Plant preview" className="w-full h-full object-cover" />
              : <Icon name="add_photo_alternate" className="text-on-surface-variant" />}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoPick} className="hidden" />
          </label>
          <div className="flex-1 min-w-0 space-y-2">
            <TextField
              label="Species *"
              value={species}
              onChange={(e) => { setSpecies(e.target.value); setAiMeta(null); suggestSeq.current++; setAiLoading(false) }}
              placeholder="e.g. basil"
              error={errors.species}
              autoFocus
            />
            {/* The two ways to fill it in: a photo (Pl@ntNet) or a typed name (Suggest) */}
            <div className="flex flex-wrap gap-2">
              <label className={`btn-tonal btn-sm cursor-pointer ${idLoading ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => { if (photoFile) { e.preventDefault(); identify() } }}>
                <Icon name="image_search" />{idLoading ? 'Identifying…' : 'Identify from photo'}
                {/* No photo yet: pick one, then identify it right away */}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const f = handlePhotoPick(e); if (f) identify(f) }} />
              </label>
              <button type="button" onClick={() => suggestConditions()} disabled={aiLoading || species.trim().length < 3} className="btn-tonal btn-sm">
                <Icon name="auto_awesome" />{aiLoading ? 'Thinking…' : 'Suggest'}
              </button>
            </div>
            {idResult?.results?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {idResult.results.map((m) => (
                  <button type="button" key={m.species} onClick={() => pickMatch(m)} aria-pressed={species === m.species}
                    className={`chip ${species === m.species ? 'bg-secondary-container text-on-secondary-container' : ''}`}>
                    {m.commonName && <span>{m.commonName} ·</span>}<i>{m.species}</i>
                    <span className="text-on-surface-variant">{Math.round(m.score * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-body-sm text-on-surface-variant">{speciesHelper()}</p>
            {/* Credit suggested by the Pl@ntNet API terms for free use */}
            {idResult?.results && (
              <p className="text-label-sm text-on-surface-variant">
                Species identification powered by{' '}
                <a href="https://my.plantnet.org/" target="_blank" rel="noopener noreferrer" className="underline">Pl@ntNet</a>
              </p>
            )}
          </div>
        </div>

        <TextField label="Nickname (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My basil" />

        <div className="rounded-xl border border-outline-variant overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPrefs(!showPrefs)}
            aria-expanded={showPrefs}
            className="state-layer w-full flex items-center gap-3 px-4 h-14 text-left"
          >
            <Icon name="tune" className="text-on-surface-variant" />
            <span className="flex-1">
              <span className="block text-body-lg text-on-surface">Preferred growing conditions</span>
            </span>
            {aiOk && <span className="tag bg-primary-container text-on-primary-container"><Icon name="auto_awesome" />AI</span>}
            <Icon name={showPrefs ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
          </button>
          {showPrefs && (
            <div className="px-4 pb-4 pt-1">
              <p className="text-body-sm text-on-surface-variant mb-4">
                {aiOk
                  ? 'AI suggestion — adjust as needed. Growth stages need different moisture and feeding; revisit these as the plant matures.'
                  : 'Used to compute the ideal zone environment. Editable later from the plant details.'}
              </p>
              <ConditionFields prefs={prefs} onChange={setPrefs} />
            </div>
          )}
        </div>

        {zoneHint && (
          <div className="banner banner-warning">
            <Icon name="lightbulb" />
            <div className="flex-1">
              This plant {ZONE_HINT_REASON[zoneHint.reason] ?? 'is a poorer fit for'} {zone.zoneName}’s other plants
              {zoneHint.kind === 'move'
                ? <> — <span className="font-medium">{zoneHint.zone.zoneName}</span> is a closer match.</>
                : <>, and none of your other zones suit it either. Consider giving it its own zone.</>}
            </div>
            <button type="button" onClick={() => setHintDismissed(true)} className="btn-text btn-sm text-on-warning-container -my-1">Dismiss</button>
          </div>
        )}
      </form>
    </Dialog>
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
    fetchZoneStats(zone.id, cutoff).then(setReadings).catch(() => setReadings([]))
  }, [zone?.id])

  if (readings == null) return null
  const h = plantHealth(plant, zone, readings)

  return (
    <div className="card-filled p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-title-sm text-on-surface">7-day condition</p>
        <span className={`tag ${statScoreBadge(h.score)}`}>{h.score != null ? `${h.score}%` : '—'}</span>
      </div>
      <p className="text-body-md text-on-surface-variant">{plantHealthSummary(h)}</p>
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
      await deletePlantDiagnoses(plant.zoneId, plant.id)
      await deleteDoc(doc(db, 'plants', plant.id))
      onClose()
    } catch (e) {
      console.error('Failed to delete plant:', e)
      setDeleting(false)
      setShowDelConfirm(false)
    }
  }

  const status = plantStatus(zone, plant)

  return (
    <Sheet
      title="Plant details"
      onClose={onClose}
      busy={deleting || showDelConfirm || loading}
      headerActions={
        <button onClick={() => setShowDelConfirm(true)} disabled={loading || deleting || showDelConfirm} className="icon-btn text-error" aria-label="Remove plant" data-tip="Remove plant">
          <Icon name="delete" />
        </button>
      }
      actions={<>
        {saved && <span className="flex items-center gap-1 mr-auto text-body-md text-primary"><Icon name="check" size={18} />Saved</span>}
        <button onClick={onClose} className="btn-text">Close</button>
        <button onClick={handleSave} disabled={loading} className="btn-filled">{loading ? 'Saving…' : 'Save changes'}</button>
      </>}
    >
      {showDelConfirm && (
        <Dialog
          icon="delete"
          title="Remove plant?"
          onClose={() => setShowDelConfirm(false)}
          busy={deleting}
          actions={<>
            <button onClick={() => setShowDelConfirm(false)} disabled={deleting} className="btn-text">Cancel</button>
            <button onClick={handleDelete} disabled={deleting} className="btn-error">{deleting ? 'Removing…' : 'Remove'}</button>
          </>}
        >
          <span className="font-medium text-on-surface">{plant.plantName}</span> and its photos and diagnoses will be deleted. This can't be undone.
        </Dialog>
      )}

      <div className="relative w-full aspect-[4/3] rounded-xl bg-surface-container-high grid place-items-center overflow-hidden">
        {photoUrl
          ? <img src={photoUrl} alt={plant.plantName} className="absolute inset-0 w-full h-full object-cover" />
          : <Icon name="local_florist" size={48} className="text-on-surface-variant" />}
        <div className="absolute bottom-3 right-3 flex gap-2">
          <label className="btn-tonal btn-sm cursor-pointer shadow-elevation-1">
            <Icon name="add_photo_alternate" />
            {photoBusy ? 'Working…' : photoUrl ? 'Change' : 'Add photo'}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} disabled={photoBusy} className="hidden" />
          </label>
          {photoUrl && (
            <button type="button" onClick={handleRemovePhoto} disabled={photoBusy}
              className="icon-btn icon-btn-sm icon-btn-tonal shadow-elevation-1" aria-label="Remove photo" data-tip="Remove photo">
              <Icon name="delete" />
            </button>
          )}
        </div>
      </div>
      {photoError && <p className="banner banner-error mt-3"><Icon name="error" />{photoError}</p>}

      <div className="flex gap-2 mt-4 mb-6 flex-wrap">
        {status && <StatusLabel status={status} />}
      </div>

      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} />
        <TextField label="Species" value={species} onChange={(e) => { setSpecies(e.target.value); setSaved(false) }} />

        {zone && <ConditionCard plant={plant} zone={zone} />}
        <PlantDiagnosisCard plant={plant} />

        <h3 className="text-title-sm text-on-surface pt-2">Preferred growing conditions</h3>
        <ConditionFields prefs={prefs} onChange={(p) => { setPrefs(p); setSaved(false) }} />

        <TextField as="textarea" label="Notes" rows={5} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false) }} />
      </div>
    </Sheet>
  )
}

/* ── Plants Tab ──────────────────────────────────────────────────────── */
function PlantCard({ plant, zone, onOpen }) {
  const status = plantStatus(zone, plant)
  return (
    <button onClick={onOpen} className="card card-link overflow-hidden flex flex-col">
      <div className="relative h-36 w-full bg-surface-container-high grid place-items-center">
        {plant.photoUrl
          ? <img src={plant.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <Icon name="local_florist" size={40} className="text-on-surface-variant/60" />}
      </div>
      <div className="p-4 flex flex-col gap-3 w-full flex-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-title-md text-on-surface truncate">{plant.plantName}</p>
            <p className="text-body-md text-on-surface-variant truncate">{plant.species}</p>
          </div>
          {status && <StatusLabel status={status} />}
        </div>
        {plant.preferredLightCondition && (
          <span className="tag self-start bg-surface-container-high text-on-surface-variant capitalize">
            <Icon name="light_mode" />{plant.preferredLightCondition} light
          </span>
        )}
      </div>
    </button>
  )
}

export default function PlantsTab({ zone }) {
  const [plants,   setPlants]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [adding,   setAdding]   = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      // Newest first, like mobile's watchPlantsByZone (same query, so the same composite index).
      query(collection(db, 'plants'), where('zoneId', '==', zone.id), orderBy('createdAt', 'desc')),
      (snap) => {
        setPlants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [zone.id])

  if (loading) return <Loading />

  return (
    <>
      {adding && <AddPlantModal zone={zone} onClose={() => setAdding(false)} />}
      {selected && <PlantDetailModal plant={selected} zone={zone} onClose={() => setSelected(null)} />}

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <h3 className="text-title-lg text-on-surface">Plants</h3>
          <p className="text-body-md text-on-surface-variant">{plants.length} plant{plants.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-filled">
          <Icon name="add" />Add plant
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plants.map((p) => <PlantCard key={p.id} plant={p} zone={zone} onOpen={() => setSelected(p)} />)}
        <button
          onClick={() => setAdding(true)}
          className="state-layer min-h-[260px] rounded-xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 text-on-surface-variant"
        >
          <Icon name="add_circle" size={32} />
          <span className="text-title-sm">Add a plant</span>
        </button>
      </div>
    </>
  )
}
