import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { fetchAutomationPlan } from '../../lib/aiSummary'

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
  const { user } = useAuth()
  const [aiPlan,    setAiPlan]    = useState(null)   // { source, plan, rationale } | null
  const [aiLoading, setAiLoading] = useState(false)
  const [autoWater,    setAutoWater]    = useState(false)
  const [autoLight,    setAutoLight]    = useState(false)
  const [autoFert,     setAutoFert]     = useState(false)
  const [waterThresh,  setWaterThresh]  = useState('')
  const [waterSched,   setWaterSched]   = useState('')
  const [waterDuration, setWaterDuration] = useState('')
  const [lightSched,   setLightSched]   = useState('')
  const [fertSched,    setFertSched]    = useState('')
  const [fertDuration, setFertDuration] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [device,   setDevice]   = useState(null)

  // Saved-value mirrors for dirty detection and Cancel revert
  const [waterThreshOrig, setWaterThreshOrig] = useState('')
  const [waterSchedOrig,  setWaterSchedOrig]  = useState('')
  const [waterDurOrig,    setWaterDurOrig]    = useState('')
  const [lightSchedOrig,  setLightSchedOrig]  = useState('')
  const [fertSchedOrig,   setFertSchedOrig]   = useState('')
  const [fertDurOrig,     setFertDurOrig]     = useState('')

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

        const wt  = d.wateringThreshold?.toString()  ?? ''
        const ws  = d.wateringSchedule               ?? ''
        const wd  = d.wateringDuration?.toString()   ?? ''
        const ls  = d.lightingSchedule               ?? ''
        const fs  = d.fertilizingSchedule            ?? ''
        const fd  = d.fertilizingDuration?.toString() ?? ''

        setWaterThresh(wt);  setWaterThreshOrig(wt)
        setWaterSched(ws);   setWaterSchedOrig(ws)
        setWaterDuration(wd); setWaterDurOrig(wd)
        setLightSched(ls);   setLightSchedOrig(ls)
        setFertSched(fs);    setFertSchedOrig(fs)
        setFertDuration(fd); setFertDurOrig(fd)
      }
      setLoading(false)
    })
  }, [zone.id])

  // Toggles save immediately
  function saveToggle(patch) {
    setDoc(doc(db, 'automationConfig', zone.id), patch, { merge: true })
  }

  async function saveTextConfig() {
    await setDoc(doc(db, 'automationConfig', zone.id), {
      wateringThreshold:   waterThresh    ? parseFloat(waterThresh)   : null,
      wateringSchedule:    waterSched     || null,
      wateringDuration:    waterDuration  ? parseInt(waterDuration)   : null,
      lightingSchedule:    lightSched     || null,
      fertilizingSchedule: fertSched      || null,
      fertilizingDuration: fertDuration   ? parseInt(fertDuration)    : null,
    }, { merge: true })
    setWaterThreshOrig(waterThresh); setWaterSchedOrig(waterSched)
    setWaterDurOrig(waterDuration);  setLightSchedOrig(lightSched)
    setFertSchedOrig(fertSched);     setFertDurOrig(fertDuration)
  }

  function cancelTextConfig() {
    setWaterThresh(waterThreshOrig); setWaterSched(waterSchedOrig)
    setWaterDuration(waterDurOrig);  setLightSched(lightSchedOrig)
    setFertSched(fertSchedOrig);     setFertDuration(fertDurOrig)
  }

  async function requestAiPlan() {
    if (!user) return
    setAiLoading(true)
    try {
      const tok = await user.getIdToken()
      setAiPlan(await fetchAutomationPlan(tok, { zoneId: zone.id }))
    } finally {
      setAiLoading(false)
    }
  }

  async function applyAiPlan(plan) {
    await setDoc(doc(db, 'automationConfig', zone.id), { ...plan, aiRecommended: true }, { merge: true })
    setAutoWater(!!plan.autoWateringEnabled)
    setAutoLight(!!plan.autoLightingEnabled)
    setAutoFert(!!plan.autoFertilizingEnabled)
    const set = (v) => (v != null ? String(v) : '')
    const wt = set(plan.wateringThreshold), ws = plan.wateringSchedule ?? '', wd = set(plan.wateringDuration)
    const ls = plan.lightingSchedule ?? '', fs = plan.fertilizingSchedule ?? '', fd = set(plan.fertilizingDuration)
    setWaterThresh(wt);   setWaterThreshOrig(wt)
    setWaterSched(ws);    setWaterSchedOrig(ws)
    setWaterDuration(wd); setWaterDurOrig(wd)
    setLightSched(ls);    setLightSchedOrig(ls)
    setFertSched(fs);     setFertSchedOrig(fs)
    setFertDuration(fd);  setFertDurOrig(fd)
    setAiPlan(null)
  }

  const planRows = aiPlan?.plan ? [
    ['Auto watering',            autoWater ? 'On' : 'Off',   aiPlan.plan.autoWateringEnabled ? 'On' : 'Off'],
    ['Moisture threshold (%)',   waterThresh   || '—',       aiPlan.plan.wateringThreshold ?? '—'],
    ['Watering time',            waterSched    || '—',       aiPlan.plan.wateringSchedule ?? '—'],
    ['Watering duration (s)',    waterDuration || '—',       aiPlan.plan.wateringDuration ?? '—'],
    ['Auto lighting',            autoLight ? 'On' : 'Off',   aiPlan.plan.autoLightingEnabled ? 'On' : 'Off'],
    ['Lighting schedule',        lightSched    || '—',       aiPlan.plan.lightingSchedule ?? '—'],
    ['Auto fertilizing',         autoFert ? 'On' : 'Off',    aiPlan.plan.autoFertilizingEnabled ? 'On' : 'Off'],
    ['Fertilizing schedule',     fertSched     || '—',       aiPlan.plan.fertilizingSchedule ?? '—'],
    ['Fertilizing duration (s)', fertDuration  || '—',       aiPlan.plan.fertilizingDuration ?? '—'],
  ] : []

  const isDirty = waterThresh !== waterThreshOrig || waterSched !== waterSchedOrig ||
    waterDuration !== waterDurOrig || lightSched !== lightSchedOrig ||
    fertSched !== fertSchedOrig    || fertDuration !== fertDurOrig

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400'

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
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-gray-900">Automation settings</h3>
          <button
            onClick={requestAiPlan}
            disabled={aiLoading}
            className="text-sm font-medium px-3 py-1.5 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          >
            {aiLoading ? 'Thinking…' : '✨ Use AI recommendation'}
          </button>
        </div>

        {aiPlan && (
          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 mb-4">
            {aiPlan.source === 'error' || !aiPlan.plan ? (
              <p className="text-sm text-gray-600">Couldn’t reach the AI service. Try again in a moment.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-gray-800">Suggested automation plan</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">
                    {aiPlan.source === 'ai' ? 'AI' : 'Auto'}
                  </span>
                </div>
                <div className="space-y-1">
                  {planRows.map(([label, cur, next]) => (
                    <div key={label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="text-gray-700">
                        <span className="text-gray-400">{String(cur)}</span>
                        <span className="mx-1.5 text-gray-300">→</span>
                        <span className="font-medium">{String(next)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {aiPlan.rationale?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-gray-500 list-disc list-inside">
                    {aiPlan.rationale.map((r, i) => <li key={i}>{r.text}</li>)}
                  </ul>
                )}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setAiPlan(null)}
                    className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => applyAiPlan(aiPlan.plan)}
                    className="flex-1 bg-brand-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-brand-700"
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          <ToggleSetting
            title="Water automation"
            subtitle="Trigger at moisture threshold or daily schedule"
            value={autoWater}
            onChange={(v) => { setAutoWater(v); saveToggle({ autoWateringEnabled: v }) }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-1">Moisture threshold (%)</label>
            <input
              type="number"
              value={waterThresh}
              onChange={(e) => setWaterThresh(e.target.value)}
              className={inputCls}
              placeholder="e.g. 30"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">Daily schedule (e.g. 07:00)</label>
            <input
              type="text"
              value={waterSched}
              onChange={(e) => setWaterSched(e.target.value)}
              className={inputCls}
              placeholder="07:00"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">Duration (seconds)</label>
            <input
              type="number"
              value={waterDuration}
              onChange={(e) => setWaterDuration(e.target.value)}
              className={inputCls}
              placeholder="300"
            />
          </ToggleSetting>

          {hasLight && (
            <ToggleSetting
              title="Light automation"
              subtitle="Schedule lighting times"
              value={autoLight}
              onChange={(v) => { setAutoLight(v); saveToggle({ autoLightingEnabled: v }) }}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (e.g. 08:00–18:00)</label>
              <input
                type="text"
                value={lightSched}
                onChange={(e) => setLightSched(e.target.value)}
                className={inputCls}
                placeholder="08:00–18:00"
              />
            </ToggleSetting>
          )}

          {hasFert && (
            <ToggleSetting
              title="Fertilizer automation"
              subtitle="Trigger on schedule"
              value={autoFert}
              onChange={(v) => { setAutoFert(v); saveToggle({ autoFertilizingEnabled: v }) }}
            >
              <label className="block text-sm font-medium text-gray-700 mb-1">Weekly schedule (e.g. MON 06:00)</label>
              <input
                type="text"
                value={fertSched}
                onChange={(e) => setFertSched(e.target.value)}
                className={inputCls}
                placeholder="MON 06:00"
              />
              <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">Duration (seconds)</label>
              <input
                type="number"
                value={fertDuration}
                onChange={(e) => setFertDuration(e.target.value)}
                className={inputCls}
                placeholder="600"
              />
            </ToggleSetting>
          )}
        </div>

        {isDirty && (
          <div className="flex gap-3 mt-4">
            <button
              onClick={cancelTextConfig}
              className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={saveTextConfig}
              className="flex-1 bg-brand-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-brand-700"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
