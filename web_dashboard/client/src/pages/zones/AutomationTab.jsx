import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore'
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
  const [autoWater,    setAutoWater]    = useState(false)
  const [autoLight,    setAutoLight]    = useState(false)
  const [autoFert,     setAutoFert]     = useState(false)
  const [waterThresh,  setWaterThresh]  = useState('')
  const [lightSched,   setLightSched]   = useState('')
  const [fertSched,    setFertSched]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [device,   setDevice]   = useState(null)
  const debounce = useRef(null)

  // Watch device doc for live module flag updates
  useEffect(() => {
    if (!zone.deviceId) { setDevice(null); return }
    return onSnapshot(doc(db, 'devices', zone.deviceId), (snap) => {
      setDevice(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [zone.deviceId])

  const hasFert  = device?.hasFertilizerModule ?? false
  const hasLight = device?.hasLightingModule   ?? false
  const waterOn  = device?.irrigationActive    ?? false
  const fertOn   = device?.fertilizerActive    ?? false
  const lightOn  = device?.lightActive         ?? false

  const devRef = zone.deviceId ? doc(db, 'devices', zone.deviceId) : null

  const actuators = [
    { label: 'Water',     icon: '💧', activeRing: 'ring-blue-300',  on: waterOn,
      onToggle: () => devRef && updateDoc(devRef, { irrigationActive: !waterOn }) },
    ...(hasFert  ? [{ label: 'Fertilize', icon: '🌿', activeRing: 'ring-green-300', on: fertOn,
      onToggle: () => devRef && updateDoc(devRef, { fertilizerActive: !fertOn }) }] : []),
    ...(hasLight ? [{ label: 'Light',     icon: '☀️', activeRing: 'ring-amber-300', on: lightOn,
      onToggle: () => devRef && updateDoc(devRef, { lightActive: !lightOn }) }] : []),
  ]

  useEffect(() => {
    getDoc(doc(db, 'automationConfig', zone.id)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setAutoWater(d.autoWateringEnabled   ?? false)
        setAutoLight(d.autoLightingEnabled   ?? false)
        setAutoFert(d.autoFertilizingEnabled ?? false)
        setWaterThresh(d.wateringThreshold?.toString() ?? '')
        setLightSched(d.lightingSchedule  ?? '')
        setFertSched(d.fertilizingSchedule ?? '')
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

  if (!zone.deviceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-5xl text-gray-200 mb-4">🎛️</span>
        <p className="font-semibold text-gray-700 text-lg">No device connected</p>
        <p className="text-sm text-gray-400 mt-2 max-w-xs">
          Connect a device to this zone from the Overview tab to access automation controls.
        </p>
      </div>
    )
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
          {actuators.map(({ label, icon, activeRing, on, onToggle }) => (
            <button
              key={label}
              onClick={onToggle}
              className={`rounded-2xl border shadow-sm p-4 flex flex-col gap-3 text-left transition-all ring-2 ${
                on
                  ? `bg-green-600 border-green-600 ${activeRing} text-white`
                  : `bg-white border-gray-100 ring-transparent hover:ring-2 hover:${activeRing}`
              }`}
            >
              <span className="text-2xl">{icon}</span>
              <span className={`text-sm font-bold ${on ? 'text-white' : 'text-gray-700'}`}>{label}</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Moisture threshold (%)</label>
            <input
              type="number"
              value={waterThresh}
              onChange={(e) => { setWaterThresh(e.target.value); save({ wateringThreshold: e.target.value ? parseFloat(e.target.value) : null }) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g. 30"
            />
          </ToggleSetting>

          {hasLight && (
            <ToggleSetting
              title="Light automation"
              subtitle="Schedule lighting times"
              value={autoLight}
              onChange={(v) => { setAutoLight(v); save({ autoLightingEnabled: v }) }}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (e.g. 08:00–18:00)</label>
              <input
                type="text"
                value={lightSched}
                onChange={(e) => { setLightSched(e.target.value); save({ lightingSchedule: e.target.value || null }) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="08:00–18:00"
              />
            </ToggleSetting>
          )}

          {hasFert && (
            <ToggleSetting
              title="Fertilizer automation"
              subtitle="Trigger on schedule"
              value={autoFert}
              onChange={(v) => { setAutoFert(v); save({ autoFertilizingEnabled: v }) }}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (e.g. weekly)</label>
              <input
                type="text"
                value={fertSched}
                onChange={(e) => { setFertSched(e.target.value); save({ fertilizingSchedule: e.target.value || null }) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="weekly"
              />
            </ToggleSetting>
          )}
        </div>
      </div>
    </div>
  )
}
