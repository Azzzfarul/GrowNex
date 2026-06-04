import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'

const MAX_PLANTS = 4
const LIGHT_OPTIONS = ['', 'low', 'medium', 'high']

function statusColor(status) {
  switch (status?.toLowerCase()) {
    case 'healthy':         return 'bg-green-100 text-green-700'
    case 'wilting':         return 'bg-red-100 text-red-700'
    case 'needs attention': return 'bg-orange-100 text-orange-700'
    case 'stable':          return 'bg-teal-100 text-teal-700'
    default:                return 'bg-gray-100 text-gray-600'
  }
}

/* ── Slot Picker ─────────────────────────────────────────────────────── */
function SlotPicker({ takenSlots, selected, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Plant slot</label>
      <p className="text-xs text-gray-400 mb-3">Select an available slot for this plant.</p>
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
              className={`w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                isTaken
                  ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                  : isSelected
                    ? 'bg-green-600 border-green-600'
                    : 'bg-white border-gray-200 hover:border-green-400'
              }`}
            >
              <span className={`text-lg ${isTaken ? 'grayscale' : ''}`}>
                {isTaken ? '🚫' : '🌱'}
              </span>
              <span className={`text-xs font-semibold ${
                isTaken ? 'text-gray-400' : isSelected ? 'text-white' : 'text-gray-700'
              }`}>
                Slot {slot}
              </span>
            </button>
          )
        })}
      </div>
      {selected == null && (
        <p className="text-xs text-gray-400 mt-2">No slot selected</p>
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
        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
          <p className="text-xs font-semibold text-gray-600 mb-1.5">{label}</p>
          <div className="flex items-center gap-2">
            {field(min)}
            <span className="text-gray-400 text-sm font-bold">–</span>
            {field(max)}
          </div>
        </div>
      ))}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Light condition</p>
        <select
          value={prefs.preferredLightCondition ?? ''}
          onChange={(e) => onChange({ ...prefs, preferredLightCondition: e.target.value || null })}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white capitalize"
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
  const [species,      setSpecies]     = useState('')
  const [name,         setName]        = useState('')
  const [selectedSlot, setSelectedSlot]= useState(null)
  const [showPrefs,    setShowPrefs]   = useState(false)
  const [prefs,        setPrefs]       = useState({})
  const [errors,       setErrors]      = useState({})
  const [loading,      setLoading]     = useState(false)

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
      await addDoc(collection(db, 'plants'), {
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
        createdAt: serverTimestamp(),
      })
      onClose()
    } catch {
      setErrors({ submit: 'Failed to add plant. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Add plant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {errors.submit && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-4">{errors.submit}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Species <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g. Phalaenopsis"
            />
            {errors.species && <p className="text-xs text-red-500 mt-1">{errors.species}</p>}
            <p className="text-xs text-gray-400 mt-1">An accurate species helps give better care recommendations.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plant nickname <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g. My Orchid"
            />
          </div>

          <div>
            <SlotPicker takenSlots={takenSlots} selected={selectedSlot} onChange={setSelectedSlot} />
            {errors.slot && <p className="text-xs text-red-500 mt-1">{errors.slot}</p>}
          </div>

          {/* Preferred conditions — collapsible */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPrefs(!showPrefs)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span>⚙️</span> Preferred growing conditions <span className="text-gray-400 font-normal">(optional)</span>
              </span>
              <span className="text-gray-400 text-xs">{showPrefs ? '▲' : '▼'}</span>
            </button>
            {showPrefs && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400 mb-3">Helps compute ideal zone environment. Edit any time from plant details.</p>
                <ConditionFields prefs={prefs} onChange={setPrefs} />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {loading ? 'Adding…' : 'Add plant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Plant Detail Modal ──────────────────────────────────────────────── */
function PlantDetailModal({ plant, onClose }) {
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
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)

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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Plant details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="w-full h-36 rounded-xl bg-gray-100 flex items-center justify-center mb-5">
          <span className="text-5xl text-gray-300">🌿</span>
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(plant.status)}`}>
            {plant.status}
          </span>
          {plant.slotNumber > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              Slot {plant.slotNumber}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Species</label>
            <input
              type="text"
              value={species}
              onChange={(e) => { setSpecies(e.target.value); setSaved(false) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Preferred conditions — editable */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Preferred growing conditions
            </p>
            <ConditionFields prefs={prefs} onChange={(p) => { setPrefs(p); setSaved(false) }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setSaved(false) }}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
              placeholder="Enter notes"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
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
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
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
        <PlantDetailModal plant={selected} onClose={() => setSelected(null)} />
      )}

      <div>
        <button
          onClick={() => !isFull && setShowAdd(true)}
          disabled={isFull}
          className={`w-full flex items-center justify-center gap-2 font-medium py-2.5 rounded-xl text-sm transition-colors mb-5 ${
            isFull
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
          }`}
        >
          {isFull ? `🚫 Zone full (${plants.length}/${MAX_PLANTS})` : '+ Add plant'}
        </button>

        {plants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No plants in this zone yet.</p>
        ) : (
          <div className="space-y-3">
            {plants.map((plant) => (
              <button
                key={plant.id}
                onClick={() => setSelected(plant)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <p className="font-bold text-gray-900 text-base">{plant.plantName}</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ml-2 ${statusColor(plant.status)}`}>
                    {plant.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">{plant.species}</p>
                <div className="flex gap-2 flex-wrap">
                  {plant.slotNumber > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      Slot {plant.slotNumber}
                    </span>
                  )}
                  {plant.preferredLightCondition && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full capitalize">
                      Light: {plant.preferredLightCondition}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
