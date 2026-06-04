import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'

function statusColor(status) {
  switch (status?.toLowerCase()) {
    case 'healthy':         return 'bg-green-100 text-green-700'
    case 'wilting':         return 'bg-red-100 text-red-700'
    case 'needs attention': return 'bg-orange-100 text-orange-700'
    case 'stable':          return 'bg-teal-100 text-teal-700'
    default:                return 'bg-gray-100 text-gray-600'
  }
}

/* ── Add Plant Modal ─────────────────────────────────────────────────── */
function AddPlantModal({ zone, onClose }) {
  const [species, setSpecies] = useState('')
  const [name, setName]       = useState('')
  const [slot, setSlot]       = useState('')
  const [errors, setErrors]   = useState({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e = {}
    if (!species.trim()) e.species = 'Enter the plant species'
    if (slot) {
      const n = parseInt(slot, 10)
      if (isNaN(n) || n < 1 || n > zone.totalPlantSlots)
        e.slot = `Slot must be between 1 and ${zone.totalPlantSlots}`
    }
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await addDoc(collection(db, 'plants'), {
        zoneId:      zone.id,
        plantName:   name.trim() || species.trim(),
        species:     species.trim(),
        status:      'healthy',
        slotNumber:  slot ? parseInt(slot, 10) : 0,
        createdAt:   serverTimestamp(),
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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6">
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
            <p className="text-xs text-gray-400 mt-1">
              An accurate species helps give better care recommendations.
            </p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slot number <span className="text-gray-400">(optional, 1–{zone.totalPlantSlots})</span>
            </label>
            <input
              type="number"
              min="1"
              max={zone.totalPlantSlots}
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="1"
            />
            {errors.slot && <p className="text-xs text-red-500 mt-1">{errors.slot}</p>}
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
      })
      setSaved(true)
    } finally {
      setLoading(false)
    }
  }

  const hasPrefs = plant.preferredTemperatureMin != null
    || plant.preferredMoistureMin != null
    || plant.preferredHumidityMin != null
    || plant.preferredLightCondition

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Plant details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Photo placeholder */}
        <div className="w-full h-36 rounded-xl bg-gray-100 flex items-center justify-center mb-5">
          <span className="text-5xl text-gray-300">🌿</span>
        </div>

        {/* Status + slot badges */}
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

          {/* Preferred conditions — read only */}
          {hasPrefs && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Preferred conditions
              </p>
              <div className="space-y-1.5">
                {plant.preferredTemperatureMin != null && (
                  <p className="text-sm text-gray-600">
                    Temp: {plant.preferredTemperatureMin}–{plant.preferredTemperatureMax}°C
                  </p>
                )}
                {plant.preferredMoistureMin != null && (
                  <p className="text-sm text-gray-600">
                    Moisture: {plant.preferredMoistureMin}–{plant.preferredMoistureMax}%
                  </p>
                )}
                {plant.preferredHumidityMin != null && (
                  <p className="text-sm text-gray-600">
                    Humidity: {plant.preferredHumidityMin}–{plant.preferredHumidityMax}%
                  </p>
                )}
                {plant.preferredLightCondition && (
                  <p className="text-sm text-gray-600 capitalize">
                    Light: {plant.preferredLightCondition}
                  </p>
                )}
              </div>
            </div>
          )}

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
  const [plants,  setPlants]  = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
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

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <>
      {showAdd && <AddPlantModal zone={zone} onClose={() => setShowAdd(false)} />}
      {selected && (
        <PlantDetailModal
          plant={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl text-sm transition-colors mb-5"
        >
          + Add plant
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
