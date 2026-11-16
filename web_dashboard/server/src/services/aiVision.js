// Visual plant health: one vision-model call per image, answered as strict JSON.
// Two tasks share this file: a detailed diagnosis of one plant from a phone close-up, and a
// coarse check of a whole zone from an ESP32-CAM snapshot. The REST route, the MQTT bridge
// and eval/visionEval.js all call diagnosePlantImage / checkZoneImage, so the accuracy that
// gets measured is the accuracy of the code that runs.
// Same discipline as aiAnalytics.js: model output is a suggestion, the validators decide.

import { chatJsonRaw } from './aiClient.js'

// Bump on ANY change to the prompts or class definitions: it is stored with every result and
// printed in every evaluation report, so figures from different prompts are never mixed.
export const VISION_PROMPT_V = '2'

const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
export const SEVERITIES = ['none', 'mild', 'moderate', 'severe']
export const ZONE_STATUSES = ['healthy', 'stressed', 'unhealthy', 'unclear']

// The closed set a diagnosis is scored against. eval/LABELS.md uses these same definitions.
const CONDITION_DEFS = {
  healthy: 'no visible problem; foliage evenly coloured and turgid. Old lower leaves yellowing alone, or minor mechanical tears, still count as healthy.',
  nutrient_deficiency: 'patterned discolouration tied to leaf age or veins: uniform yellowing of older leaves, yellowing between green veins, purple or bronze tints, pale new growth. No distinct spots, no mould.',
  fungal_disease: 'discrete spots or lesions, often round with concentric rings or a yellow halo; powdery white or grey coating; rust-coloured pustules; fuzzy mould; dark sunken patches. Also late blight and downy mildew (fungus-like): large, fast-spreading dark or water-soaked patches that cross veins, or angular yellow patches, either with pale or grey-purple fuzzy growth on the underside.',
  bacterial_disease: 'small water-soaked, greasy or translucent lesions, often angular and limited by veins, sometimes with a yellow halo or ooze, never with fuzzy growth; soft wet rot.',
  viral_disease: 'mosaic or mottled light/dark green patterning, leaf curling, puckering or distortion, stunted deformed new growth, without spots or mould.',
  pest_damage: 'visible insects, mites, eggs or webbing; chewed holes or ragged edges; winding leaf-miner trails; fine pale stippling; sticky residue.',
  water_stress: 'wilting or drooping of the whole plant; dry crispy brown edges and tips (too little water); or limp yellow leaves with soft dark stems and wet soil (too much).',
  light_heat_stress: 'bleached, white or tan scorched patches on the most exposed leaves; or pale, stretched, leggy growth leaning to the light (too little light).',
  unclear: 'the image shows a plant but is too dark, blurred, distant or obstructed to judge, or the symptoms fit no class above.',
  not_plant: 'the image does not show a living plant.',
}
export const CONDITIONS = Object.keys(CONDITION_DEFS)
const NO_SEVERITY = ['healthy', 'unclear', 'not_plant']

// ── helpers ─────────────────────────────────────────────────────────────────

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function strList(v, maxItems) {
  return Array.isArray(v) ? v.map(x => str(x)).filter(Boolean).slice(0, maxItems) : []
}
// 0-1. A model answering on a 0-100 scale ("85", "85%") means a percentage, not certainty.
function confidence(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (typeof n !== 'number' || !isFinite(n)) return 0
  const pct = n > 1 || (typeof v === 'string' && v.trim().endsWith('%'))
  return Math.min(1, Math.max(0, pct ? n / 100 : n))
}
// The apps' display labels and common phrasings that don't reduce to a class name below.
const ALIASES = { not_a_plant: 'not_plant', no_plant: 'not_plant' }
// "Fungal disease", "fungal", " PEST_DAMAGE ", "Light / heat stress", "not a plant" → the
// class; anything else → 'unclear'.
function pick(v, list) {
  const n = str(v).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!n) return 'unclear'
  const s = ALIASES[n] ?? n
  if (list.includes(s)) return s
  const near = list.filter(c => c.startsWith(s) || s.startsWith(c))
  return near.length === 1 ? near[0] : 'unclear'
}

export function isJpeg(buf) {
  return !!buf && buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8
}

// True only when `next` is a real step down from `prev`; 'unclear' or a missing side never is.
export function worseZoneStatus(next, prev) {
  const rank = { healthy: 0, stressed: 1, unhealthy: 2 }
  return rank[next] != null && rank[prev] != null && rank[next] > rank[prev]
}

// ── validators ──────────────────────────────────────────────────────────────

export function validateDiagnosis(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const condition = pick(o.condition, CONDITIONS)
  const severity = NO_SEVERITY.includes(condition)
    ? 'none'
    : (SEVERITIES.slice(1).includes(str(o.severity).toLowerCase()) ? str(o.severity).toLowerCase() : 'mild')
  return {
    observations: strList(o.observations, 5),
    condition,
    severity,
    confidence: confidence(o.confidence),
    likelyCause: str(o.likelyCause, 80),
    advice: strList(o.advice, 4),
    summary: str(o.summary),
  }
}

export function validateZoneCheck(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    observations: strList(o.observations, 4),
    status: pick(o.status, ZONE_STATUSES),
    confidence: confidence(o.confidence),
    summary: str(o.summary),
  }
}

// ── prompts ─────────────────────────────────────────────────────────────────
// Order is deliberate: role and image type, class definitions with the cues that separate
// neighbouring classes, rules, then the JSON shape with observations before the conclusion so
// the model describes what it sees before it commits to a class.

const RULES = [
  'Rules:',
  '- Judge only what is visible in the image. Do not invent symptoms.',
  '- Any sensor readings or species given are background. They may support a conclusion the',
  '  image already shows; they never justify a conclusion the image does not show.',
  '- When two classes fit, choose the one with the most specific visible evidence, and lower',
  '  the confidence.',
  '- confidence is the probability that your chosen class is correct, from 0 to 1. Use below',
  '  0.5 when you are guessing. Do not default to high values.',
  '- Reply with STRICT JSON only, no markdown, keys in the order shown.',
]

export function buildDiagnosisMessages(context) {
  const system = [
    'You are a plant pathologist examining ONE close-up phone photo of a single plant.',
    'Classify its visible condition into exactly one of these classes:',
    ...CONDITIONS.map(c => `- ${c}: ${CONDITION_DEFS[c]}`),
    'Telling neighbours apart:',
    '- fungal vs bacterial: fungal spots are dry, often ringed or powdery, or carry fuzzy growth; bacterial lesions are small, look wet, greasy or translucent, stop at veins and never carry fuzz. Large dark water-soaked patches spreading across veins are late blight (fungal).',
    '- nutrient vs viral: deficiency follows leaf age and veins symmetrically; viral mottling is irregular and comes with distortion.',
    '- water vs light/heat: water stress affects the whole plant (droop, crisp edges all round); scorch is patchy and on the exposed side.',
    '- pest damage needs direct evidence: insects, holes, trails, stippling or webbing.',
    ...RULES,
    '- If the photo is too dark, blurred or far away to judge, use "unclear". If there is no living plant, use "not_plant".',
    '{',
    '  "observations": string[],  // 1-5 short statements of what is visibly there (colour, pattern, location on plant)',
    `  "condition": ${CONDITIONS.map(c => `"${c}"`).join('|')},`,
    '  "severity": "none"|"mild"|"moderate"|"severe",  // share of the plant affected: mild < 10%, moderate 10-40%, severe > 40%',
    '  "confidence": number,      // 0-1',
    '  "likelyCause": string,     // the most likely specific cause in a few words, e.g. "early blight", "nitrogen deficiency", "spider mites"; "" if none',
    '  "advice": string[],        // 1-4 practical next steps for a home grower, most important first',
    '  "summary": string          // one plain sentence for the grower',
    '}',
  ].join('\n')
  return { system, user: contextText(context, 'Diagnose the plant in this photo.') }
}

export function buildZoneCheckMessages(context) {
  const system = [
    'You are monitoring a small grow zone through a fixed, low-resolution camera that sees the',
    'whole zone from a distance. You cannot see leaf-level detail, so judge only the overall',
    'look of the plants. Give exactly one status:',
    '- healthy: plants upright, foliage mostly green and full.',
    '- stressed: some drooping or wilting, or noticeable yellow or brown areas, but most foliage still looks alive.',
    '- unhealthy: widespread collapse, heavy browning or yellowing, bare or dead plants.',
    '- unclear: too dark, blurred, over-exposed or blocked to judge, or no plants in view.',
    ...RULES,
    '- Do not name a disease or pest: this view cannot show one.',
    '- Grow lights can tint the whole image purple or yellow; do not read an overall colour cast as discolouration.',
    '{',
    '  "observations": string[],  // 1-4 short statements of what is visibly there',
    '  "status": "healthy"|"stressed"|"unhealthy"|"unclear",',
    '  "confidence": number,      // 0-1',
    '  "summary": string          // one plain sentence for the grower',
    '}',
  ].join('\n')
  return { system, user: contextText(context, 'Assess the zone in this camera image.') }
}

function contextText(context, task) {
  return context ? `${task}\nBackground (may be incomplete): ${JSON.stringify(context)}` : task
}

// ── the calls ───────────────────────────────────────────────────────────────

async function ask({ system, user }, jpeg, { model, provider }, validate) {
  const started = Date.now()
  const res = await chatJsonRaw({
    system, user,
    images: [`data:image/jpeg;base64,${jpeg.toString('base64')}`],
    temperature: 0,
    maxTokens: 600,
    model: model || VISION_MODEL,
    provider,
  })
  return {
    result: validate(res.data),
    meta: { model: res.model, provider: res.provider, promptV: VISION_PROMPT_V, usage: res.usage, latencyMs: Date.now() - started },
  }
}

// context (optional): { species, preferred: {...}, latest: {...} }
export function diagnosePlantImage({ jpeg, context, model, provider }) {
  return ask(buildDiagnosisMessages(context), jpeg, { model, provider }, validateDiagnosis)
}

// context (optional): { species: [...], latest: {...} }
export function checkZoneImage({ jpeg, context, model, provider }) {
  return ask(buildZoneCheckMessages(context), jpeg, { model, provider }, validateZoneCheck)
}
