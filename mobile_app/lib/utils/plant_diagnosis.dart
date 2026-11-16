// Display logic for image diagnoses (plantDiagnoses docs) and the zone camera check.
// Web: client/src/lib/plantDiagnosis.js. Keep the two in step.

const _labels = {
  'healthy': 'Healthy',
  'nutrient_deficiency': 'Nutrient deficiency',
  'fungal_disease': 'Fungal disease',
  'bacterial_disease': 'Bacterial disease',
  'viral_disease': 'Viral disease',
  'pest_damage': 'Pest damage',
  'water_stress': 'Water stress',
  'light_heat_stress': 'Light / heat stress',
  'unclear': 'Unclear',
  'not_plant': 'Not a plant',
};

/// Same list as the server's CONDITIONS (services/aiVision.js).
final diagnosisConditions = _labels.keys.toList();

String conditionLabel(String? condition) => _labels[condition] ?? _labels['unclear']!;

/// A StatusLabel tone for a plant condition + severity, or for a zone's visualStatus
/// (healthy | stressed | unhealthy | unclear).
String conditionTone(String? condition, [String? severity]) {
  if (condition == 'healthy') return 'healthy';
  if (condition == null || condition == 'unclear' || condition == 'not_plant') return 'unknown';
  if (severity == 'severe' || condition == 'unhealthy') return 'critical';
  return 'attention';
}

/// [reason]: the server's fallback reason, or 'image' for a rejected photo.
String diagnosisError(String? reason) {
  if (reason == 'limit') return 'Daily diagnosis limit reached. Try again tomorrow.';
  if (reason == 'image') return 'Use a JPEG photo under 1.5 MB.';
  return 'Diagnosis unavailable right now.';
}
