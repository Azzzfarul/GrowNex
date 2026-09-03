// Prompts, validation and deterministic fallbacks for the plant-profile and
// plant-diagnosis AI features. Same discipline as aiAnalytics.js: model output is
// a suggestion — validate*/clamp it, and there's always a non-AI path.

import { compliancePercent, rangeIssues } from './analyticsRules.js'

// ── helpers ─────────────────────────────────────────────────────────────────

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)) }
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null }
function str(v, max) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

const LIGHT = ['low', 'medium', 'high']
const METRIC_LABEL = { temperature: 'Temperature', humidity: 'Humidity', moisture: 'Soil moisture' }
const METRIC_UNIT = { temperature: '°C', humidity: '%', moisture: '%' }

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

// ── Feature 3: plant health diagnosis ──────────────────────────────────────

export function buildDiagnosisMessages({ plant, prefs, latest, series, compliance, siblingNames }) {
  const system = [
    'You are a plant-care assistant diagnosing why one plant in an IoT grow zone may be struggling.',
    'You get the plant, its preferred ranges, recent sensor trends for its zone, and how often each',
    'metric was in range. Return STRICT JSON only:',
    '{',
    '  "headline": string,                       // one sentence summary',
    '  "severity": "ok"|"watch"|"act-now",',
    '  "likelyCauses": [ { "cause": string, "confidence": "high"|"medium"|"low", "evidence": string } ],  // 0-4',
    '  "steps": [ string ]                       // 0-5 concrete actions, most important first',
    '}',
    'Ground every claim in the numbers provided. If nothing looks wrong, say so with severity "ok".',
  ].join('\n')

  const user = JSON.stringify({
    plant: { name: plant.plantName, species: plant.species, slot: plant.slotNumber },
    preferredRanges: prefs,
    latest,
    compliancePct: compliance,
    recentSeries: series,
    otherPlantsInZone: siblingNames,
  })
  return { system, user }
}

export function validateDiagnosis(obj) {
  const causes = Array.isArray(obj?.likelyCauses)
    ? obj.likelyCauses.slice(0, 4).map(c => ({
        cause: str(c?.cause, 120),
        confidence: ['high', 'medium', 'low'].includes(c?.confidence) ? c.confidence : 'medium',
        evidence: str(c?.evidence, 200),
      })).filter(c => c.cause)
    : []
  const steps = Array.isArray(obj?.steps)
    ? obj.steps.map(s => str(s, 200)).filter(Boolean).slice(0, 5)
    : []
  const headline = str(obj?.headline, 160)

  if (!headline && !causes.length && !steps.length) throw new Error('AI diagnosis is empty')

  return {
    diagnosis: {
      headline: headline ?? 'Reviewed recent conditions for this plant.',
      severity: ['ok', 'watch', 'act-now'].includes(obj?.severity) ? obj.severity : 'watch',
      likelyCauses: causes,
      steps,
    },
  }
}

// Deterministic diagnosis from the rule helpers — always returns something.
export function fallbackDiagnosis({ prefs, latest, series }) {
  const issues = rangeIssues(latest, prefs)
  const causes = []
  const steps = []

  for (const iss of issues) {
    const label = METRIC_LABEL[iss.metric]
    const unit = METRIC_UNIT[iss.metric]
    const bound = iss.state === 'low' ? `${iss.min.toFixed(0)}${unit} min` : `${iss.max.toFixed(0)}${unit} max`
    causes.push({
      cause: `${label} out of range (${iss.state === 'low' ? 'below' : 'above'} preferred)`,
      confidence: 'high',
      evidence: `Latest ${label.toLowerCase()} is ${Number(iss.value).toFixed(1)}${unit} vs ${bound}.`,
    })
    if (iss.metric === 'moisture') steps.push(iss.state === 'low' ? 'Increase watering frequency or amount.' : 'Reduce watering; let the medium dry out more between cycles.')
    if (iss.metric === 'temperature') steps.push(iss.state === 'low' ? 'Move the zone somewhere warmer or add gentle heat.' : 'Improve ventilation or shade the zone during peak heat.')
    if (iss.metric === 'humidity') steps.push(iss.state === 'low' ? 'Raise humidity (tray of water, grouping plants, humidifier).' : 'Improve airflow to bring humidity down.')
  }

  // Persistent-drift check from the series compliance
  for (const metric of ['temperature', 'humidity', 'moisture']) {
    const p = prefs?.[metric]
    const s = series?.[metric]
    if (!p || !s) continue
    const pct = compliancePercent(s, p.min, p.max)
    if (pct != null && pct < 60 && !issues.some(i => i.metric === metric)) {
      causes.push({
        cause: `${METRIC_LABEL[metric]} frequently outside preferred range`,
        confidence: 'medium',
        evidence: `In range only ${pct}% of the recent period.`,
      })
    }
  }

  const headline = causes.length
    ? `${causes.length} condition${causes.length > 1 ? 's' : ''} may be affecting this plant.`
    : 'Recent conditions look within the preferred ranges for this plant.'

  return {
    diagnosis: {
      headline,
      severity: causes.some(c => c.confidence === 'high') ? 'act-now' : causes.length ? 'watch' : 'ok',
      likelyCauses: causes,
      steps: steps.length ? [...new Set(steps)] : (causes.length ? [] : ['No action needed right now — keep monitoring.']),
    },
  }
}
