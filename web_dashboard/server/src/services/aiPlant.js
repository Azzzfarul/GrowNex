// Prompt, validation and fallback for the plant-profile AI feature (Feature 1).
// Same discipline as aiAnalytics.js: model output is a suggestion — validate/clamp
// it, and there's always a non-AI path.

// ── helpers ─────────────────────────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)) }
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null }
function str(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

const LIGHT = ['low', 'medium', 'high']

// ── Feature 1: plant profile from species ───────────────────────────────────

export function buildPlantProfileMessages({ species, zoneType }) {
  const context = zoneType === 'outdoor' ? 'an outdoor bed' : 'an indoor controlled grow'
  const system = [
    'You are a horticulture assistant. Given a plant species, return its typical preferred',
    `growing conditions for ${context}, as STRICT JSON only (no markdown):`,
    '{',
    '  "commonName": string,          // REQUIRED, never empty — the common name you interpreted the input as (e.g. "Tulip", "Golden barrel cactus")',
    '  "confidence": "high"|"low",    // "low" if the species is ambiguous or unfamiliar',
    '  "preferredMoistureMin": number, "preferredMoistureMax": number,   // soil moisture %, capacitive probe in potting soil',
    '  "preferredHumidityMin": number, "preferredHumidityMax": number,   // relative humidity %',
    '  "preferredTemperatureMin": number, "preferredTemperatureMax": number,  // °C',
    '  "preferredLightCondition": "low"|"medium"|"high",',
    '  "careNotes": string           // one or two short sentences',
    '}',
    'Assume a mature, vegetative plant. If the common name is ambiguous (e.g. "pepper", "mint",',
    '"sage", "lily"), pick the most common cultivated interpretation and say which in commonName.',
  ].join('\n')

  const user = JSON.stringify({ species, zoneType: zoneType ?? 'indoor' })
  return { system, user }
}

function titleCase(s) {
  return s.replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())
}

export function validatePlantProfile(obj, { species } = {}) {
  const clampPair = (minV, maxV, lo, hi) => {
    let a = num(minV), b = num(maxV)
    if (a == null || b == null) return [null, null]
    a = clamp(a, lo, hi); b = clamp(b, lo, hi)
    if (a >= b) return [null, null]
    return [Math.round(a * 10) / 10, Math.round(b * 10) / 10]
  }

  const [mMin, mMax] = clampPair(obj?.preferredMoistureMin, obj?.preferredMoistureMax, 0, 100)
  const [hMin, hMax] = clampPair(obj?.preferredHumidityMin, obj?.preferredHumidityMax, 0, 100)
  const [tMin, tMax] = clampPair(obj?.preferredTemperatureMin, obj?.preferredTemperatureMax, 0, 50)

  if (mMin == null && hMin == null && tMin == null) throw new Error('AI plant profile has no usable ranges')

  return {
    profile: {
      commonName: str(obj?.commonName, 60) ?? (species ? titleCase(species).slice(0, 60) : null),
      confidence: obj?.confidence === 'low' ? 'low' : 'high',
      preferredMoistureMin: mMin, preferredMoistureMax: mMax,
      preferredHumidityMin: hMin, preferredHumidityMax: hMax,
      preferredTemperatureMin: tMin, preferredTemperatureMax: tMax,
      preferredLightCondition: LIGHT.includes(obj?.preferredLightCondition) ? obj.preferredLightCondition : 'medium',
      careNotes: str(obj?.careNotes, 300),
    },
  }
}
