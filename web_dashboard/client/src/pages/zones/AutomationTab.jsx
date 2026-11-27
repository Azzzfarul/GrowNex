import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Icon from '../../components/ui/Icon'
import Switch from '../../components/ui/Switch'
import TextField from '../../components/ui/TextField'
import Loading from '../../components/ui/Loading'
import EmptyState from '../../components/ui/EmptyState'
import { useAuth } from '../../context/AuthContext'
import { fetchAutomationPlan } from '../../lib/aiSummary'
import { scheduleList, upsertSchedule } from '../../lib/schedules'

const SAVE_FAILED = "Couldn't save the change. Please try again."
const MAX_WATERING_S = 900, MAX_FERTILIZING_S = 1800  // validatePlan's caps (server/src/services/aiAnalytics.js)

function ToggleSetting({ icon, title, subtitle, value, onChange, busy, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-4">
        <span className={`list-icon ${value ? '' : 'bg-surface-container-highest text-on-surface-variant'}`}><Icon name={icon} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-title-md text-on-surface">{title}</p>
          <p className="text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
        <Switch checked={value} onChange={onChange} disabled={busy} label={title} />
      </div>
      {value && <div className="grid gap-4 sm:grid-cols-3 mt-5 pl-14">{children}</div>}
    </div>
  )
}

// Times are added to (or edited in) the list below the field; Save at the bottom stores the list.
function ScheduleList({ kind, label, placeholder, support, list, onChange, onPending }) {
  const [draft,   setDraft]   = useState('')
  const [editing, setEditing] = useState(-1)  // index of the entry in the field, or -1 when adding
  const [error,   setError]   = useState(null)
  // Tells the tab a typed time hasn't been added yet, so Save can't silently drop it.
  useEffect(() => { onPending(kind, !!draft.trim()); return () => onPending(kind, false) }, [kind, draft])

  function submit() {
    const r = upsertSchedule(list, kind, draft, editing)
    if (r.error) return setError(r.error)
    onChange(r.list); setDraft(''); setEditing(-1); setError(null)
  }
  function reset() { setDraft(''); setEditing(-1); setError(null) }
  function edit(i) { setDraft(list[i]); setEditing(i); setError(null) }
  function remove(i) {
    onChange(list.filter((_, j) => j !== i))
    if (editing === i) reset()
    else if (editing > i) setEditing(editing - 1)
  }

  return (
    <div className="sm:col-span-3">
      <div className="flex items-start gap-2">
        <TextField
          className="flex-1 max-w-xs" label={editing >= 0 ? `Edit ${label.toLowerCase()}` : label}
          value={draft} placeholder={placeholder} support={support} error={error}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } else if (e.key === 'Escape') reset() }}
        />
        <button type="button" onClick={submit} disabled={!draft.trim()} className="btn-tonal mt-2">
          <Icon name={editing >= 0 ? 'check' : 'add'} />{editing >= 0 ? 'Update' : 'Add'}
        </button>
        {editing >= 0 && <button type="button" onClick={reset} className="btn-text mt-2">Cancel</button>}
      </div>
      {list.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant mt-2">No times yet.</p>
      ) : (
        <ul className="mt-3 rounded-lg bg-surface-container divide-y divide-outline-variant max-w-md" aria-label={`${label} list`}>
          {list.map((v, i) => (
            <li key={v} className={`flex items-center gap-2 pl-4 pr-1 h-12 ${editing === i ? 'bg-secondary-container text-on-secondary-container' : ''}`}>
              <Icon name="schedule" size={18} className="text-on-surface-variant" />
              <span className="flex-1 text-body-lg tabular-nums">{v}</span>
              <button type="button" onClick={() => edit(i)} className="icon-btn icon-btn-sm" aria-label={`Edit ${v}`} data-tip="Edit"><Icon name="edit" size={18} /></button>
              <button type="button" onClick={() => remove(i)} className="icon-btn icon-btn-sm" aria-label={`Delete ${v}`} data-tip="Delete"><Icon name="delete" size={18} /></button>
            </li>
          ))}
        </ul>
      )}
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
  const [waterSched,   setWaterSched]   = useState([])
  const [waterDuration, setWaterDuration] = useState('')
  const [lightSched,   setLightSched]   = useState([])
  const [fertSched,    setFertSched]    = useState([])
  const [fertDuration, setFertDuration] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [device,   setDevice]   = useState(null)
  const [configError, setConfigError] = useState(null)
  const [savingToggle, setSavingToggle] = useState({})  // field → save in flight
  // Bumped when the lists are replaced from outside (Cancel, AI plan), so each
  // ScheduleList drops a half-done edit that would point at the wrong entry.
  const [formEpoch, setFormEpoch] = useState(0)
  const [pending, setPending] = useState({})  // kind → a typed time not yet added to its list
  const onPending = (kind, p) => setPending((s) => (s[kind] === p ? s : { ...s, [kind]: p }))

  // Saved-value mirrors for dirty detection and Cancel revert
  const [waterThreshOrig, setWaterThreshOrig] = useState('')
  const [waterSchedOrig,  setWaterSchedOrig]  = useState([])
  const [waterDurOrig,    setWaterDurOrig]    = useState('')
  const [lightSchedOrig,  setLightSchedOrig]  = useState([])
  const [fertSchedOrig,   setFertSchedOrig]   = useState([])
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
  // An offline device can't take a toggle now; it would fire whenever the device reconnects, maybe hours later.
  const offline  = device?.status === 'offline'

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
        const ws  = scheduleList(d.wateringSchedule)
        const wd  = d.wateringDuration?.toString()   ?? ''
        const ls  = scheduleList(d.lightingSchedule)
        const fs  = scheduleList(d.fertilizingSchedule)
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
      .then(() => setConfigError(null))
      .catch((e) => { console.error('Automation save failed:', e); revert(); setConfigError(SAVE_FAILED) })
      .finally(() => setSavingToggle((s) => ({ ...s, [field]: false })))
  }

  async function saveTextConfig() {
    if (Object.values(pending).some(Boolean)) return setConfigError('Add or update the time you typed (or clear it) before saving.')
    // Schedule entries are checked as they're added to their list (upsertSchedule).
    // Only check durations the user changed: a hidden field (e.g. fertilizing without a
    // fertilizer module) holding an old value must not block saving the others.
    // The board stops a pump by itself after 20 / 40 min (firmware safety limit), so runs stay well inside it.
    const tooLong = (v, orig, max) => v && v !== orig && !(parseInt(v) > 0 && parseInt(v) <= max)
    if (tooLong(waterDuration, waterDurOrig, MAX_WATERING_S)) return setConfigError(`Watering duration must be 1 to ${MAX_WATERING_S} seconds.`)
    if (tooLong(fertDuration, fertDurOrig, MAX_FERTILIZING_S)) return setConfigError(`Fertilizing duration must be 1 to ${MAX_FERTILIZING_S} seconds.`)
    setConfigError(null)
    try {
      await setDoc(doc(db, 'automationConfig', zone.id), {
        wateringThreshold:   waterThresh    ? parseFloat(waterThresh)   : null,
        wateringSchedule:    waterSched,
        wateringDuration:    waterDuration  ? parseInt(waterDuration)   : null,
        lightingSchedule:    lightSched,
        fertilizingSchedule: fertSched,
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
    setFormEpoch((n) => n + 1)
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
    setConfigError(null)
    // The plan's lists replace the current ones (the server keeps the current times that suit the plants).
    const ws = scheduleList(plan.wateringSchedule), ls = scheduleList(plan.lightingSchedule), fs = scheduleList(plan.fertilizingSchedule)
    try {
      await setDoc(doc(db, 'automationConfig', zone.id), {
        ...plan, wateringSchedule: ws, lightingSchedule: ls, fertilizingSchedule: fs, aiRecommended: true,
      }, { merge: true })
    } catch (e) {
      console.error('Automation save failed:', e)
      return setConfigError(SAVE_FAILED)
    }
    setAutoWater(!!plan.autoWateringEnabled)
    setAutoLight(!!plan.autoLightingEnabled)
    setAutoFert(!!plan.autoFertilizingEnabled)
    const set = (v) => (v != null ? String(v) : '')
    const wt = set(plan.wateringThreshold), wd = set(plan.wateringDuration), fd = set(plan.fertilizingDuration)
    setWaterThresh(wt);   setWaterThreshOrig(wt)
    setWaterSched(ws);    setWaterSchedOrig(ws)
    setWaterDuration(wd); setWaterDurOrig(wd)
    setLightSched(ls);    setLightSchedOrig(ls)
    setFertSched(fs);     setFertSchedOrig(fs)
    setFertDuration(fd);  setFertDurOrig(fd)
    setFormEpoch((n) => n + 1)
    setAiPlan(null)
  }

  const shown = (list) => list.join(', ') || '—'
  const planRows = aiPlan?.plan ? [
    ['Auto watering',            autoWater ? 'On' : 'Off',   aiPlan.plan.autoWateringEnabled ? 'On' : 'Off'],
    ['Moisture threshold (%)',   waterThresh   || '—',       aiPlan.plan.wateringThreshold ?? '—'],
    ['Watering times',           shown(waterSched),          shown(scheduleList(aiPlan.plan.wateringSchedule))],
    ['Watering duration (s)',    waterDuration || '—',       aiPlan.plan.wateringDuration ?? '—'],
    ['Auto lighting',            autoLight ? 'On' : 'Off',   aiPlan.plan.autoLightingEnabled ? 'On' : 'Off'],
    ['Lighting schedule',        shown(lightSched),          shown(scheduleList(aiPlan.plan.lightingSchedule))],
    ['Auto fertilizing',         autoFert ? 'On' : 'Off',    aiPlan.plan.autoFertilizingEnabled ? 'On' : 'Off'],
    ['Fertilizing schedule',     shown(fertSched),           shown(scheduleList(aiPlan.plan.fertilizingSchedule))],
    ['Fertilizing duration (s)', fertDuration  || '—',       aiPlan.plan.fertilizingDuration ?? '—'],
  ] : []

  const isDirty = waterThresh !== waterThreshOrig || shown(waterSched) !== shown(waterSchedOrig) ||
    waterDuration !== waterDurOrig || shown(lightSched) !== shown(lightSchedOrig) ||
    shown(fertSched) !== shown(fertSchedOrig) || fertDuration !== fertDurOrig ||
    Object.values(pending).some(Boolean)

  if (!zone.deviceId) {
    return (
      <EmptyState
        icon="tune"
        title="No device connected"
        body="Assign a sensor node to this zone on the Overview tab to control its pumps and light."
      />
    )
  }

  if (loading) return <Loading />

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        {/* Manual controls */}
        <section className="card p-5">
          <h3 className="card-title mb-1">Manual controls</h3>
          <p className="text-body-sm text-on-surface-variant mb-4">
            {offline ? 'Device offline. Everything is off until it reconnects, then these settings resume.' : 'Turn an actuator on or off right now.'}
          </p>
          <div className="space-y-2">
            {actuators.map(({ label, icon, on, onToggle }) => (
              <button
                key={label}
                onClick={onToggle}
                disabled={offline}
                aria-pressed={on}
                className={`state-layer w-full h-16 rounded-2xl px-4 flex items-center gap-4 text-left transition-colors duration-200 disabled:opacity-[.38] disabled:cursor-not-allowed ${
                  on ? 'bg-primary text-on-primary shadow-elevation-1' : 'bg-surface-container-highest text-on-surface'
                }`}
              >
                <Icon name={icon} filled={on} />
                <span className="flex-1 text-title-sm">{label}</span>
                <span className="text-label-lg">{on ? 'ON' : 'OFF'}</span>
              </button>
            ))}
          </div>
        </section>

        {/* AI recommendation */}
        <section className="card-outlined p-5">
          <div className="flex items-center gap-3">
            <span className="list-icon bg-tertiary-container text-on-tertiary-container"><Icon name="auto_awesome" /></span>
            <div className="flex-1 min-w-0">
              <h3 className="card-title">AI recommendation</h3>
              <p className="text-body-sm text-on-surface-variant">A plan from this zone's plants and readings.</p>
            </div>
          </div>
          {!aiPlan && (
            <button onClick={requestAiPlan} disabled={aiLoading} className="btn-tonal mt-4">
              <Icon name="auto_awesome" />{aiLoading ? 'Thinking…' : 'Suggest a plan'}
            </button>
          )}
          {aiPlan && (
            <div className="mt-4">
              {aiPlan.source === 'error' || !aiPlan.plan ? (
                <p className="banner banner-error"><Icon name="cloud_off" />Couldn’t reach the AI service. Try again in a moment.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-title-sm text-on-surface">Suggested changes</p>
                    <span className="tag bg-primary-container text-on-primary-container">{aiPlan.source === 'ai' ? 'AI' : 'Auto'}</span>
                  </div>
                  <div className="rounded-lg bg-surface-container divide-y divide-outline-variant">
                    {planRows.map(([label, cur, next]) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-body-sm">
                        <span className="text-on-surface-variant">{label}</span>
                        <span className="text-right whitespace-nowrap">
                          <span className="text-on-surface-variant">{String(cur)}</span>
                          <Icon name="arrow_forward" size={14} className="mx-1 align-middle text-on-surface-variant" />
                          <span className={`font-medium ${String(cur) !== String(next) ? 'text-primary' : 'text-on-surface'}`}>{String(next)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {aiPlan.rationale?.length > 0 && (
                    <ul className="mt-3 space-y-1 text-body-sm text-on-surface-variant list-disc pl-5">
                      {aiPlan.rationale.map((r, i) => <li key={i}>{r.text}</li>)}
                    </ul>
                  )}
                  {configError && <p role="alert" className="banner banner-error mt-3"><Icon name="error" />{configError}</p>}
                </>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setAiPlan(null)} className="btn-text">Dismiss</button>
                {aiPlan.plan && aiPlan.source !== 'error' && (
                  <button onClick={() => applyAiPlan(aiPlan.plan)} className="btn-filled">Apply plan</button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Automation settings */}
      <section className="space-y-4">
        <div>
          <h3 className="text-title-lg text-on-surface">Automation</h3>
          <p className="text-body-md text-on-surface-variant">Switches save immediately. Schedules are in the server's local time.</p>
        </div>

        <ToggleSetting
          icon="water_drop"
          title="Water automation"
          subtitle="Water when moisture drops below the threshold, and at set daily times"
          value={autoWater}
          busy={savingToggle.autoWateringEnabled}
          onChange={(v) => { setAutoWater(v); saveToggle({ autoWateringEnabled: v }, () => setAutoWater(!v)) }}
        >
          <TextField label="Threshold (%)" type="number" value={waterThresh} onChange={(e) => setWaterThresh(e.target.value)} placeholder="e.g. 30" />
          <TextField label="Duration (s)" type="number" value={waterDuration} onChange={(e) => setWaterDuration(e.target.value)} placeholder="300" />
          <ScheduleList key={`water${formEpoch}`} kind="water" onPending={onPending} label="Daily time" list={waterSched} onChange={setWaterSched} placeholder="07:00" support="24-hour, e.g. 07:00" />
        </ToggleSetting>

        {hasLight && (
          <ToggleSetting
            icon="light_mode"
            title="Light automation"
            subtitle="Keep the grow light on for one or more daily windows"
            value={autoLight}
            busy={savingToggle.autoLightingEnabled}
            onChange={(v) => { setAutoLight(v); saveToggle({ autoLightingEnabled: v }, () => setAutoLight(!v)) }}
          >
            <ScheduleList key={`light${formEpoch}`} kind="light" onPending={onPending} label="Light window" list={lightSched} onChange={setLightSched} placeholder="08:00–18:00" support="Start–end, e.g. 08:00–18:00" />
          </ToggleSetting>
        )}

        {hasFert && (
          <ToggleSetting
            icon="compost"
            title="Fertilizer automation"
            subtitle="Feed on one or more weekly times"
            value={autoFert}
            busy={savingToggle.autoFertilizingEnabled}
            onChange={(v) => { setAutoFert(v); saveToggle({ autoFertilizingEnabled: v }, () => setAutoFert(!v)) }}
          >
            <TextField label="Duration (s)" type="number" value={fertDuration} onChange={(e) => setFertDuration(e.target.value)} placeholder="600" />
            <ScheduleList key={`fert${formEpoch}`} kind="fert" onPending={onPending} label="Weekly time" list={fertSched} onChange={setFertSched} placeholder="MON 06:00" support="Day and time, e.g. MON 06:00" />
          </ToggleSetting>
        )}

        {configError && !aiPlan?.plan && (
          <p role="alert" className="banner banner-error"><Icon name="error" />{configError}</p>
        )}

        {isDirty && (
          <div className="sticky bottom-4 flex items-center gap-2 pl-5 pr-3 h-16 rounded-2xl bg-inverse-surface text-inverse-on-surface shadow-elevation-3 animate-fade-in">
            <Icon name="edit" size={20} />
            <span className="flex-1 text-body-md">You have unsaved schedule changes</span>
            <button onClick={cancelTextConfig} className="btn-text text-inverse-primary">Cancel</button>
            <button onClick={saveTextConfig} className="btn-filled">Save</button>
          </div>
        )}
      </section>
    </div>
  )
}
