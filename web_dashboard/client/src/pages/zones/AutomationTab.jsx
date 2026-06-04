import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        value ? 'bg-brand-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function ToggleSetting({ title, subtitle, value, onChange, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{title}</p>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
        <Toggle value={value} onChange={onChange} />
      </div>
      {value && <div className="mt-4">{children}</div>}
    </div>
  )
}

export default function AutomationTab({ zone }) {
  const [autoWater,     setAutoWater]     = useState(false)
  const [autoLight,     setAutoLight]     = useState(false)
  const [autoFertilizer,setAutoFertilizer]= useState(false)
  const [waterThreshold,setWaterThreshold]= useState('')
  const [lightSchedule, setLightSchedule] = useState('')
  const [fertSchedule,  setFertSchedule]  = useState('')
  const [loading, setLoading] = useState(true)
  const debounce = useRef(null)

  useEffect(() => {
    getDoc(doc(db, 'automationConfig', zone.id)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setAutoWater(d.autoWateringEnabled ?? false)
        setAutoLight(d.autoLightingEnabled ?? false)
        setAutoFertilizer(d.autoFertilizingEnabled ?? false)
        setWaterThreshold(d.wateringThreshold?.toString() ?? '')
        setLightSchedule(d.lightingSchedule ?? '')
        setFertSchedule(d.fertilizingSchedule ?? '')
      }
      setLoading(false)
    })
  }, [zone.id])

  function save(patch) {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      setDoc(doc(db, 'automationConfig', zone.id), patch, { merge: true })
    }, 500)
  }

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {/* Manual controls */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3">Manual controls</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Water',     icon: '💧', color: 'text-blue-600',  ring: 'hover:ring-blue-200'  },
            { label: 'Fertilize', icon: '🌿', color: 'text-brand-600', ring: 'hover:ring-brand-200' },
            { label: 'Light',     icon: '☀️', color: 'text-amber-600', ring: 'hover:ring-amber-200' },
          ].map(({ label, icon, color, ring }) => (
            <button
              key={label}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 text-left hover:ring-2 ${ring} transition-all`}
            >
              <span className="text-2xl">{icon}</span>
              <span className={`text-sm font-bold ${color}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Automation toggles */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3">Automation settings</h3>
        <div className="space-y-3">

          <ToggleSetting
            title="Water automation"
            subtitle="Trigger at moisture threshold"
            value={autoWater}
            onChange={(v) => { setAutoWater(v); save({ autoWateringEnabled: v }) }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Moisture threshold (%)
            </label>
            <input
              type="number"
              value={waterThreshold}
              onChange={(e) => {
                setWaterThreshold(e.target.value)
                save({ wateringThreshold: e.target.value ? parseFloat(e.target.value) : null })
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g. 30"
            />
          </ToggleSetting>

          <ToggleSetting
            title="Light automation"
            subtitle="Schedule lighting times"
            value={autoLight}
            onChange={(v) => { setAutoLight(v); save({ autoLightingEnabled: v }) }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule (e.g. 08:00–18:00)
            </label>
            <input
              type="text"
              value={lightSchedule}
              onChange={(e) => {
                setLightSchedule(e.target.value)
                save({ lightingSchedule: e.target.value || null })
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="08:00–18:00"
            />
          </ToggleSetting>

          <ToggleSetting
            title="Fertilizer automation"
            subtitle="Trigger on schedule"
            value={autoFertilizer}
            onChange={(v) => { setAutoFertilizer(v); save({ autoFertilizingEnabled: v }) }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule (e.g. weekly)
            </label>
            <input
              type="text"
              value={fertSchedule}
              onChange={(e) => {
                setFertSchedule(e.target.value)
                save({ fertilizingSchedule: e.target.value || null })
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="weekly"
            />
          </ToggleSetting>

        </div>
      </div>
    </div>
  )
}
