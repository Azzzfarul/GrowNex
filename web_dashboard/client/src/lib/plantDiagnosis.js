// Display logic for image diagnoses (plantDiagnoses docs) and the zone camera check.
// Pure, so it is unit-tested; the calls are in diagnosisApi.js. Mobile: utils/plant_diagnosis.dart.

const LABELS = {
  healthy: 'Healthy',
  nutrient_deficiency: 'Nutrient deficiency',
  fungal_disease: 'Fungal disease',
  bacterial_disease: 'Bacterial disease',
  viral_disease: 'Viral disease',
  pest_damage: 'Pest damage',
  water_stress: 'Water stress',
  light_heat_stress: 'Light / heat stress',
  unclear: 'Unclear',
  not_plant: 'Not a plant',
}
// Same list as the server's CONDITIONS (services/aiVision.js)
export const CONDITIONS = Object.keys(LABELS)

export const conditionLabel = (condition) => LABELS[condition] ?? LABELS.unclear

// A StatusLabel tone for a plant condition + severity, or for a zone's visualStatus
// (healthy | stressed | unhealthy | unclear).
export function conditionTone(condition, severity) {
  if (condition === 'healthy') return 'healthy'
  if (condition === 'unclear' || condition === 'not_plant' || !condition) return 'unknown'
  if (severity === 'severe' || condition === 'unhealthy') return 'critical'
  return 'attention'
}

// reason: the server's fallback reason, or 'image' for a rejected photo
export function diagnosisError(reason) {
  if (reason === 'limit') return 'Daily diagnosis limit reached. Try again tomorrow.'
  if (reason === 'image') return 'Use a JPEG photo under 1.5 MB.'
  return 'Diagnosis unavailable right now.'
}
