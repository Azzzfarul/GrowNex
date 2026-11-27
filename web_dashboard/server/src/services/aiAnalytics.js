// Prompt builders, output validation, and deterministic fallbacks for the AI
// analytics summary and automation planner. Model output is always treated as a
// suggestion: validateSummary / validatePlan clip and clamp it, and fallbackPlan
// produces a usable plan with no model at all.

// ── small helpers ────────────────────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)) }

function num(v) { return typeof v === 'number' && isFinite(v) ? v : null }

function str(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

function avg(arr) {
  const v = arr.filter(x => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

const TIME_RE  = /^([01]\d|2[0-3]):[0-5]\d$/
const LIGHT_RE = /^([01]\d|2[0-3]):[0-5]\d\s*[–-]\s*([01]\d|2[0-3]):[0-5]\d$/
const FERT_RE  = /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]\d|2[0-3]):[0-5]\d$/

function lightScheduleFor(condition) {
  switch (condition) {
    case 'high':   return '06:00–20:00'
    case 'medium': return '07:00–18:00'
    case 'low':    return '08:00–16:00'
    default:       return null
  }
}

// Schedule lists, cleaned the same way the apps' upsertSchedule does (web lib/schedules.js,
// mobile utils/schedules.dart): "7:00" → "07:00", "8:00 - 18:00" → "08:00–18:00", "mon 6:00" → "MON 06:00".
const canonical = s => s.trim().toUpperCase()
  .replace(/\s*[–-]\s*/, '–').replace(/\s+/, ' ').replace(/(^|\D)(\d):/g, '$10$2:')
const minutes = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
// Minute of the day ("07:00", or a light window's start) or of the week ("MON 06:00")
const startOf = v => (/^[A-Z]/.test(v) ? DAYS.indexOf(v.slice(0, 3)) * 1440 + minutes(v.slice(4)) : minutes(v.slice(0, 5)))
const lightRanges = w => {
  const [s, e] = w.split('–').map(minutes)
  return s < e ? [[s, e]] : [[s, 1440], [0, e]]
}
// Touching counts: one window's "off" and the next one's "on" in the same minute fire in no set order.
const windowsClash = (a, b) => lightRanges(a).some(([s1, e1]) => lightRanges(b).some(([s2, e2]) => s1 <= e2 && s2 <= e1))
const SCHEDULE = {
  water: { re: TIME_RE,  max: 4, period: 1440 },
  light: { re: LIGHT_RE, max: 2 },
  fert:  { re: FERT_RE,  max: 3, period: 10080 },
}

// Keeps the valid entries of a model-suggested list (or single string), sorted, dropping duplicates,
// light windows that are empty or clash with an earlier one, and pump runs that would overlap or
// touch (no more than durationS apart, so they never chain toward the firmware's pump limit).
export function cleanSchedule(v, kind, durationS = 0, allowed = () => true) {
  const { re, max, period } = SCHEDULE[kind]
  const gap = (a, b) => { const d = Math.abs(startOf(a) - startOf(b)); return Math.min(d, period - d) }
  const kept = []
  for (const x of [].concat(v ?? [])) {
    if (kept.length === max) break
    if (typeof x !== 'string') continue
    const e = canonical(x)
    if (!re.test(e) || !allowed(e) || kept.includes(e)) continue   // before spacing/cap: a dropped time takes no slot
    if (kind === 'light'
      ? e.slice(0, 5) === e.slice(6) || kept.some(w => windowsClash(w, e))   // on = off, or clashes
      : kept.some(k => gap(k, e) * 60 <= durationS)) continue
    kept.push(e)
  }
  return kept.sort((a, b) => startOf(a) - startOf(b))
}

const LIGHT_HOURS = { low: 8, medium: 11, high: 14 }   // lightScheduleFor's window lengths

// Plant-care rules the plan must follow, whatever the model says:
// cacti/succulents (every plant prefers ≤ 40 % moisture) get no scheduled watering, only the threshold
const droughtTolerant = plants =>
  plants.length > 0 && plants.every(p => p.preferredMoistureMax != null && p.preferredMoistureMax <= 40)
// no watering at night (wet leaves overnight invite fungus), nor in the midday sun outdoors
function goodWateringTime(t, zoneType) {
  const m = minutes(t)
  if (m >= 20 * 60 || m < 5 * 60) return false
  return !(zoneType === 'outdoor' && m >= 10 * 60 && m < 16 * 60)
}
// total lit hours of a set of windows
const litHours = windows => windows.flatMap(lightRanges).reduce((h, [s, e]) => h + (e - s) / 60, 0)

function dominantLightCondition(plants) {
  const counts = {}
  for (const p of plants) {
    const c = p.preferredLightCondition
    if (c) counts[c] = (counts[c] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'medium'
}

// ── analytics summary ───────────────────────────────────────────────────────

export function buildSummaryMessages(input) {
  const system = [
    'You are a concise plant-care assistant for an IoT grow system.',
    "You receive time-bucketed sensor trends for one grow zone and the plants' preferred ranges.",
    'Return STRICT JSON only (no markdown, no prose) matching exactly:',
    '{',
    '  "overview": string,        // 1-2 sentences on the overall situation',
    '  "temperature": string,     // <=90 chars, what the temperature graph shows',
    '  "humidity": string,        // <=90 chars',
    '  "light": string,           // <=90 chars; if the light series is flat or empty say "Light sensor data isn\'t available yet."',
    '  "moisture": string,        // <=90 chars',
    '  "advice": [ { "severity": "info"|"warn"|"critical", "text": string } ]  // 0-4 short actionable items',
    '}',
    'Base every statement on the numbers provided. Never invent readings. Use plain language a hobby grower understands.',
  ].join('\n')

  const user = JSON.stringify({
    zoneName: input.zoneName ?? null,
    timeRange: input.timeRange,          // 'today' = hourly buckets, '7days' = daily buckets
    labels: input.labels ?? [],
    series: input.series,                // { temperature:[], humidity:[], light:[], moisture:[] }
    preferredRanges: input.prefs ?? null,
    latest: input.latest ?? null,        // { temp, humid, light, moisture }
    plants: input.plants ?? [],
    ruleBasedDraft: input.ruleResults ?? null,  // our deterministic text — refine it, don't just echo
  })

  return { system, user }
}

export function validateSummary(obj) {
  const summaries = {
    overview:    str(obj?.overview, 240),
    temperature: str(obj?.temperature, 120),
    humidity:    str(obj?.humidity, 120),
    light:       str(obj?.light, 120),
    moisture:    str(obj?.moisture, 120),
  }
  for (const k of Object.keys(summaries)) {
    if (!summaries[k]) throw new Error(`AI summary missing field: ${k}`)
  }
  const advice = Array.isArray(obj?.advice)
    ? obj.advice
        .slice(0, 4)
        .map(a => ({
          severity: ['info', 'warn', 'critical'].includes(a?.severity) ? a.severity : 'info',
          text: str(a?.text, 200),
        }))
        .filter(a => a.text)
    : []
  return { summaries, advice }
}

// ── automation plan ─────────────────────────────────────────────────────────

export function buildPlanMessages({ plants, device, latest, current, zoneType }) {
  const system = [
    'You are a plant-care automation planner for an IoT grow system.',
    'Given the plants in one zone, their preferred ranges, the latest readings and the current',
    'automation config, propose a sensible automation plan. Return STRICT JSON only:',
    '{',
    '  "plan": {',
    '    "autoWateringEnabled": boolean,',
    '    "wateringThreshold": number|null,    // soil moisture %, fire irrigation below this',
    '    "wateringSchedule": string[],        // daily top-up times "HH:MM", 0-4 entries',
    '    "wateringDuration": number|null,     // seconds, 60-900',
    '    "autoLightingEnabled": boolean,      // false if the zone has no lighting module',
    '    "lightingSchedule": string[],        // daily on–off windows "HH:MM–HH:MM", usually 1, at most 2',
    '    "autoFertilizingEnabled": boolean,   // false if the zone has no fertilizer module',
    '    "fertilizingSchedule": string[],     // weekly times "DDD HH:MM" e.g. "MON 06:00", 0-3 entries',
    '    "fertilizingDuration": number|null   // seconds, 60-1800',
    '  },',
    '  "rationale": [ { "field": string, "text": string } ]  // one short reason per field you set',
    '}',
    "Set the watering threshold a few points below the plants' lowest preferred minimum moisture.",
    'Only enable lighting or fertilizing when the matching module is present.',
    "All times are 24-hour, in the grower's local time.",
    'Watering: the threshold already handles dry soil, so scheduled times are top-ups. Use one early-morning',
    'time (05:00-08:00); add a late-afternoon one (16:00-18:00) only for thirsty plants (high preferred',
    'moisture) or hot, dry readings. Never water between 20:00 and 05:00, and in outdoor zones not between',
    '10:00 and 16:00. Space times at least 4 hours apart. For drought-tolerant plants (every preferred',
    'moisture max 40 or less, e.g. cacti and succulents) leave wateringSchedule empty: the threshold waters them.',
    'Lighting: the grow light supplements daylight. Use one window lasting targetLightHours (8 h for low,',
    '11 h for medium, 14 h for high light). Start it in the morning and end it by 22:00. Windows must not',
    'overlap or touch.',
    'Fertilizing: once a week (one entry) is typical; twice a week at most for heavy feeders, on different',
    'days, early in the morning.',
    'The plan replaces the current times, so keep the current ones that already suit the plants.',
  ].join('\n')

  const user = JSON.stringify({
    plants: plants.map(p => ({
      name: p.plantName ?? p.name ?? null,
      species: p.species ?? null,
      preferredMoisture: [p.preferredMoistureMin ?? null, p.preferredMoistureMax ?? null],
      preferredHumidity: [p.preferredHumidityMin ?? null, p.preferredHumidityMax ?? null],
      preferredTemperature: [p.preferredTemperatureMin ?? null, p.preferredTemperatureMax ?? null],
      preferredLight: p.preferredLightCondition ?? null,
    })),
    zoneType: zoneType ?? null,
    targetLightHours: LIGHT_HOURS[dominantLightCondition(plants)] ?? 11,
    hasLightingModule: !!device.hasLightingModule,
    hasFertilizerModule: !!device.hasFertilizerModule,
    latest: latest ?? null,
    currentConfig: current ?? null,
  })

  return { system, user }
}

// Deterministic plan — always valid. Used when AI is disabled or its output fails validation.
export function fallbackPlan(plants, { hasLight, hasFert }) {
  const mins = plants.map(p => p.preferredMoistureMin).filter(v => v != null)
  const threshold = mins.length ? clamp(Math.round(avg(mins) - 5), 15, 75) : 35
  const thirsty = mins.length > 0 && avg(mins) >= 60   // e.g. ferns, basil: add an afternoon top-up
  return {
    autoWateringEnabled: true,
    wateringThreshold: threshold,
    wateringSchedule: droughtTolerant(plants) ? [] : thirsty ? ['07:00', '17:00'] : ['07:00'],
    wateringDuration: 300,
    autoLightingEnabled: hasLight,
    lightingSchedule: hasLight ? [lightScheduleFor(dominantLightCondition(plants)) || '07:00–18:00'] : [],
    autoFertilizingEnabled: hasFert,
    fertilizingSchedule: hasFert ? ['MON 06:00'] : [],
    fertilizingDuration: hasFert ? 600 : null,
  }
}

// Sanitizes model output into a safe plan. The bounds here win over anything the model says.
export function validatePlan(obj, { hasLight, hasFert, plants, zoneType }) {
  const p = obj?.plan
  if (!p || typeof p !== 'object') throw new Error('AI plan missing "plan" object')

  const mins = plants.map(x => x.preferredMoistureMin).filter(v => v != null)
  const maxs = plants.map(x => x.preferredMoistureMax).filter(v => v != null)
  const loBound = mins.length ? Math.round(avg(mins) - 10) : 15
  const hiBound = maxs.length ? Math.round(avg(maxs) - 3)  : 75

  let wateringThreshold = num(p.wateringThreshold)
  if (wateringThreshold != null) {
    wateringThreshold = clamp(Math.round(wateringThreshold), Math.max(15, loBound), Math.max(16, Math.min(75, hiBound)))
  }

  let wateringDuration = num(p.wateringDuration)
  wateringDuration = wateringDuration != null ? clamp(Math.round(wateringDuration), 60, 900) : 300

  let fertilizingDuration = num(p.fertilizingDuration)
  fertilizingDuration = fertilizingDuration != null ? clamp(Math.round(fertilizingDuration), 60, 1800) : null

  // Lists (a single string is accepted too); safe defaults when a module exists but nothing valid came back.
  const wateringSchedule = droughtTolerant(plants) ? []
    : cleanSchedule(p.wateringSchedule, 'water', wateringDuration, t => goodWateringTime(t, zoneType))
  // A light plan far from the plants' needs (more than 2 h off) falls back to the standard window.
  const condition = dominantLightCondition(plants)
  let lightingSchedule = cleanSchedule(p.lightingSchedule, 'light')
  if (Math.abs(litHours(lightingSchedule) - (LIGHT_HOURS[condition] ?? 11)) > 2) lightingSchedule = []
  if (hasLight && !lightingSchedule.length) lightingSchedule = [lightScheduleFor(condition) || '07:00–18:00']
  let fertilizingSchedule = cleanSchedule(p.fertilizingSchedule, 'fert', fertilizingDuration ?? 600)
  if (hasFert && !fertilizingSchedule.length) fertilizingSchedule = ['MON 06:00']

  const autoWateringEnabled     = !!p.autoWateringEnabled && wateringThreshold != null
  const autoLightingEnabled     = !!p.autoLightingEnabled && hasLight && lightingSchedule.length > 0
  const autoFertilizingEnabled  = !!p.autoFertilizingEnabled && hasFert && fertilizingSchedule.length > 0

  const plan = {
    autoWateringEnabled,
    wateringThreshold,
    wateringSchedule,
    wateringDuration,
    autoLightingEnabled,
    lightingSchedule: hasLight ? lightingSchedule : [],
    autoFertilizingEnabled,
    fertilizingSchedule: hasFert ? fertilizingSchedule : [],
    fertilizingDuration: hasFert ? (fertilizingDuration ?? 600) : null,
  }

  const rationale = Array.isArray(obj?.rationale)
    ? obj.rationale
        .slice(0, 6)
        .map(r => ({ field: str(r?.field, 40) || 'general', text: str(r?.text, 200) }))
        .filter(r => r.text)
    : []

  return { plan, rationale }
}
