import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Icon from '../../components/ui/Icon'
import Switch from '../../components/ui/Switch'
import { useAuth } from '../../context/AuthContext'
import { fetchAutomationPlan } from '../../lib/aiSummary'

// Formats the bridge's schedule parsers accept (server/src/services/mqttBridge.js); "7:00" is fine there too
const TIME_RE  = /^([01]?\d|2[0-3]):[0-5]\d$/
const LIGHT_RE = /^([01]?\d|2[0-3]):[0-5]\d\s*[–-]\s*([01]?\d|2[0-3]):[0-5]\d$/
const FERT_RE  = /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]?\d|2[0-3]):[0-5]\d$/
const SAVE_FAILED = "Couldn't save the change. Please try again."

function ToggleSetting({ title, subtitle, value, onChange, busy, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-title-md text-on-surface">{title}</p>
          <p className="text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
        <Switch checked={value} onChange={onChange} disabled={busy} label={title} />
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
  const [configError, setConfigError] = useState(null)
  const [savingToggle, setSavingToggle] = useState({})  // field → save in flight

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
    { label: 'Water',     icon: 'water_drop', on: waterOn,
      onToggle: () => devRef && updateDoc(devRef, { irrigationActive: !waterOn }) },
    ...(hasFert  ? [{ label: 'Fertilize', icon: 'compost', on: fertOn,
      onToggle: () => devRef && updateDoc(devRef, { fertilizerActive: !fertOn }) }] : []),
    ...(hasLight ? [{ label: 'Light',     icon: 'light_mode', on: lightOn,
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

  // Toggles save immediately; on failure the switch flips back, so it never shows an unsaved setting.
  // The switch is disabled until its save settles, so a failed save can't undo a newer flip.
  function saveToggle(patch, revert) {
    const field = Object.keys(patch)[0]
    setSavingToggle((s) => ({ ...s, [field]: true }))
    setDoc(doc(db, 'automationConfig', zone.id), patch, { merge: true })
      .catch((e) => { console.error('Automation save failed:', e); revert(); setConfigError(SAVE_FAILED) })
      .finally(() => setSavingToggle((s) => ({ ...s, [field]: false })))
  }

  async function saveTextConfig() {
    const ws = waterSched.trim(), ls = lightSched.trim(), fs = fertSched.trim().toUpperCase()
    // Only check fields the user changed: a hidden field (e.g. lighting without a light
    // module) holding an old value must not block saving the others.
    const bad = (v, orig, re) => v && v !== orig.trim() && !re.test(v)
    if (bad(ws, waterSchedOrig, TIME_RE))              return setConfigError('Watering time must look like 07:00 (24-hour).')
    if (bad(ls, lightSchedOrig, LIGHT_RE))             return setConfigError('Lighting schedule must look like 08:00–18:00.')
    if (bad(fs, fertSchedOrig.toUpperCase(), FERT_RE)) return setConfigError('Fertilizing schedule must look like MON 06:00.')
    setConfigError(null)
    try {
      await setDoc(doc(db, 'automationConfig', zone.id), {
        wateringThreshold:   waterThresh    ? parseFloat(waterThresh)   : null,
        wateringSchedule:    ws             || null,
        wateringDuration:    waterDuration  ? parseInt(waterDuration)   : null,
        lightingSchedule:    ls             || null,
        fertilizingSchedule: fs             || null,
        fertilizingDuration: fertDuration   ? parseInt(fertDuration)    : null,
      }, { merge: true })
    } catch (e) {
      console.error('Automation save failed:', e)
      return setConfigError(SAVE_FAILED)  // keeps the edits so the user can retry
    }
    setWaterThreshOrig(waterThresh); setWaterSchedOrig(waterSched)
    setWaterDurOrig(waterDuration);  setLightSchedOrig(lightSched)
    setFertSchedOrig(fertSched);     setFertDurOrig(fertDuration)
  }

  function cancelTextConfig() {
    setConfigError(null)
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
    try {
      await setDoc(doc(db, 'automationConfig', zone.id), { ...plan, aiRecommended: true }, { merge: true })
    } catch (e) {
      console.error('Automation save failed:', e)
      return setConfigError(SAVE_FAILED)
    }
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

  const inputCls = 'field'

  if (!zone.deviceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Icon name="tune" size={48} className="text-on-surface-variant mb-4" />
        <p className="text-title-md text-on-surface">No device connected</p>
        <p className="text-body-md text-on-surface-variant mt-2 max-w-xs">
          Connect a device to this zone from the Overview tab to access automation controls.
        </p>
      </div>
    )
  }

  if (loading) {
    return <p className="text-sm text-on-surface-variant mt-8 text-center">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {/* Manual controls */}
      <div>
        <h3 className="text-title-md text-on-surface mb-3">Manual controls</h3>
        <div className="grid grid-cols-3 gap-3">
          {actuators.map(({ label, icon, on, onToggle }) => (
            <button
              key={label}
              onClick={onToggle}
              aria-pressed={on}
              className={`state-layer rounded-xl p-4 flex flex-col gap-3 text-left transition-colors ${
                on ? 'bg-primary text-on-primary shadow-elevation-1' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              <Icon name={icon} filled={on} size={32} />
              <span className="flex items-center justify-between text-label-lg">
                {label}
                <span className="text-label-sm">{on ? 'ON' : 'OFF'}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Automation toggles */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-title-md text-on-surface">Automation settings</h3>
          <button
            onClick={requestAiPlan}
            disabled={aiLoading}
            className="btn-tonal"
          >
            <Icon name="auto_awesome" />
            {aiLoading ? 'Thinking…' : 'Use AI recommendation'}
          </button>
        </div>

        {aiPlan && (
          <div className="card-outlined p-4 mb-4">
            {aiPlan.source === 'error' || !aiPlan.plan ? (
              <p className="text-sm text-on-surface-variant">Couldn’t reach the AI service. Try again in a moment.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="flex items-center gap-2 text-title-sm text-on-surface"><Icon name="auto_awesome" size={18} className="text-primary" />Suggested automation plan</p>
                  <span className="text-label-sm px-1.5 rounded bg-primary-container text-on-primary-container">
                    {aiPlan.source === 'ai' ? 'AI' : 'Auto'}
                  </span>
                </div>
                <div className="space-y-1">
                  {planRows.map(([label, cur, next]) => (
                    <div key={label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-on-surface-variant">{label}</span>
                      <span className="text-on-surface-variant">
                        <span className="text-on-surface-variant">{String(cur)}</span>
                        <Icon name="arrow_forward" size={14} className="mx-1.5 align-middle" />
                        <span className="font-medium text-on-surface">{String(next)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {aiPlan.rationale?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-on-surface-variant list-disc list-inside">
                    {aiPlan.rationale.map((r, i) => <li key={i}>{r.text}</li>)}
                  </ul>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setAiPlan(null)}
                    className="btn-text"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => applyAiPlan(aiPlan.plan)}
                    className="btn-filled"
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
            busy={savingToggle.autoWateringEnabled}
            onChange={(v) => { setAutoWater(v); saveToggle({ autoWateringEnabled: v }, () => setAutoWater(!v)) }}
          >
            <label className="block text-label-lg text-on-surface-variant mb-1">Moisture threshold (%)</label>
            <input
              type="number"
              value={waterThresh}
              onChange={(e) => setWaterThresh(e.target.value)}
              className={inputCls}
              placeholder="e.g. 30"
            />
            <label className="block text-label-lg text-on-surface-variant mb-1 mt-3">Daily schedule (e.g. 07:00)</label>
            <input
              type="text"
              value={waterSched}
              onChange={(e) => setWaterSched(e.target.value)}
              className={inputCls}
              placeholder="07:00"
            />
            <label className="block text-label-lg text-on-surface-variant mb-1 mt-3">Duration (seconds)</label>
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
              busy={savingToggle.autoLightingEnabled}
              onChange={(v) => { setAutoLight(v); saveToggle({ autoLightingEnabled: v }, () => setAutoLight(!v)) }}
            >
              <label className="block text-label-lg text-on-surface-variant mb-1">Schedule (e.g. 08:00–18:00)</label>
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
              busy={savingToggle.autoFertilizingEnabled}
              onChange={(v) => { setAutoFert(v); saveToggle({ autoFertilizingEnabled: v }, () => setAutoFert(!v)) }}
            >
              <label className="block text-label-lg text-on-surface-variant mb-1">Weekly schedule (e.g. MON 06:00)</label>
              <input
                type="text"
                value={fertSched}
                onChange={(e) => setFertSched(e.target.value)}
                className={inputCls}
                placeholder="MON 06:00"
              />
              <label className="block text-label-lg text-on-surface-variant mb-1 mt-3">Duration (seconds)</label>
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

        {configError && (
          <p className="text-xs text-on-error-container bg-error-container rounded-lg px-3 py-2 mt-4">{configError}</p>
        )}

        {isDirty && (
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={cancelTextConfig}
              className="btn-text"
            >
              Cancel
            </button>
            <button
              onClick={saveTextConfig}
              className="btn-filled"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
