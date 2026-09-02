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
const FERT_RE  = /^(MON|TUE|WED|THU|FRI|SAT|SUN)\s([01]\d|2[0-3]):[0-5]\d$/

function lightScheduleFor(condition) {
  switch (condition) {
    case 'high':   return '06:00–20:00'
    case 'medium': return '07:00–18:00'
    case 'low':    return '08:00–16:00'
    default:       return null
  }
}

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

export function buildPlanMessages({ plants, device, latest, current }) {
  const system = [
    'You are a plant-care automation planner for an IoT grow system.',
    'Given the plants in one zone, their preferred ranges, the latest readings and the current',
    'automation config, propose a sensible automation plan. Return STRICT JSON only:',
    '{',
    '  "plan": {',
    '    "autoWateringEnabled": boolean,',
    '    "wateringThreshold": number|null,    // soil moisture %, fire irrigation below this',
    '    "wateringSchedule": string|null,     // "HH:MM" 24h daily top-up time',
    '    "wateringDuration": number|null,     // seconds, 60-900',
    '    "autoLightingEnabled": boolean,      // false if the zone has no lighting module',
    '    "lightingSchedule": string|null,     // "HH:MM–HH:MM" on–off',
    '    "autoFertilizingEnabled": boolean,   // false if the zone has no fertilizer module',
    '    "fertilizingSchedule": string|null,  // "DDD HH:MM" e.g. "MON 06:00"',
    '    "fertilizingDuration": number|null   // seconds, 60-1800',
    '  },',
    '  "rationale": [ { "field": string, "text": string } ]  // one short reason per field you set',
    '}',
    "Set the watering threshold a few points below the plants' lowest preferred minimum moisture.",
    'Only enable lighting or fertilizing when the matching module is present.',
  ].join('\n')

  const user = JSON.stringify({
    plants: plants.map(p => ({
      name: p.plantName ?? p.name ?? null,
      species: p.species ?? null,
      slot: p.slotNumber ?? null,
      preferredMoisture: [p.preferredMoistureMin ?? null, p.preferredMoistureMax ?? null],
      preferredHumidity: [p.preferredHumidityMin ?? null, p.preferredHumidityMax ?? null],
      preferredTemperature: [p.preferredTemperatureMin ?? null, p.preferredTemperatureMax ?? null],
      preferredLight: p.preferredLightCondition ?? null,
    })),
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
  return {
    autoWateringEnabled: true,
    wateringThreshold: threshold,
    wateringSchedule: '07:00',
    wateringDuration: 300,
    autoLightingEnabled: hasLight,
    lightingSchedule: hasLight ? (lightScheduleFor(dominantLightCondition(plants)) || '07:00–18:00') : null,
    autoFertilizingEnabled: hasFert,
    fertilizingSchedule: hasFert ? 'MON 06:00' : null,
    fertilizingDuration: hasFert ? 600 : null,
  }
}

// Sanitizes model output into a safe plan. The bounds here win over anything the model says.
export function validatePlan(obj, { hasLight, hasFert, plants }) {
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

  const wateringSchedule =
    typeof p.wateringSchedule === 'string' && TIME_RE.test(p.wateringSchedule.trim())
      ? p.wateringSchedule.trim()
      : null

  let lightingSchedule = null
  if (typeof p.lightingSchedule === 'string' && LIGHT_RE.test(p.lightingSchedule.trim())) {
    lightingSchedule = p.lightingSchedule.trim().replace(/\s*[–-]\s*/, '–')
  }
  if (hasLight && !lightingSchedule) {
    lightingSchedule = lightScheduleFor(dominantLightCondition(plants))
  }

  let fertilizingSchedule = null
  if (typeof p.fertilizingSchedule === 'string' && FERT_RE.test(p.fertilizingSchedule.trim().toUpperCase())) {
    fertilizingSchedule = p.fertilizingSchedule.trim().toUpperCase()
  } else if (hasFert) {
    fertilizingSchedule = 'MON 06:00'
  }

  const autoWateringEnabled     = !!p.autoWateringEnabled && wateringThreshold != null
  const autoLightingEnabled     = !!p.autoLightingEnabled && hasLight && !!lightingSchedule
  const autoFertilizingEnabled  = !!p.autoFertilizingEnabled && hasFert && !!fertilizingSchedule

  const plan = {
    autoWateringEnabled,
    wateringThreshold,
    wateringSchedule,
    wateringDuration,
    autoLightingEnabled,
    lightingSchedule: hasLight ? lightingSchedule : null,
    autoFertilizingEnabled,
    fertilizingSchedule: hasFert ? fertilizingSchedule : null,
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
