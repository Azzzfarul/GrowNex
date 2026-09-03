// Rule-based per-plant health — used by the Analytics "Plant Ranking" box and
// the plant detail "Condition" block. No AI.
//
// Score per metric = 0.7·(compliance % over the window) + 0.3·(closeness of the
// latest value to the range). Weighted mean: soil moisture ×2 (per-slot, the one
// you can actually tune per plant), temperature/humidity ×1.

export function compliancePercent(readings, field, min, max) {
  if (min == null || max == null) return null
  const valid = readings.filter(r => r[field] != null)
  if (!valid.length) return null
  return Math.round(valid.filter(r => r[field] >= min && r[field] <= max).length / valid.length * 100)
}

// 100 inside [min,max], decaying linearly to 0 one range-width beyond the bound.
function metricNowScore(value, min, max) {
  if (value == null || min == null || max == null) return null
  if (value >= min && value <= max) return 100
  const width = Math.max(max - min, 5)
  const dist = value < min ? min - value : value - max
  return Math.max(0, Math.round(100 * (1 - dist / width)))
}

// readings: raw docs from zones/{id}/stats (fields temperature, humidity, soilMoisture1..4).
// → { score: 0-100|null, metrics: { moisture|temperature|humidity: {...} }, worst }
export function plantHealth(plant, zone, readings) {
  const slot = plant.slotNumber
  const defs = [
    { key: 'moisture', field: `soilMoisture${slot}`, weight: 2, label: 'Soil moisture', unit: '%',
      latest: zone[`latestMoisture${slot}`] ?? zone.latestMoisture ?? null,
      min: plant.preferredMoistureMin, max: plant.preferredMoistureMax },
    { key: 'temperature', field: 'temperature', weight: 1, label: 'Temperature', unit: '°C',
      latest: zone.latestTemp ?? null,
      min: plant.preferredTemperatureMin, max: plant.preferredTemperatureMax },
    { key: 'humidity', field: 'humidity', weight: 1, label: 'Humidity', unit: '%',
      latest: zone.latestHumid ?? null,
      min: plant.preferredHumidityMin, max: plant.preferredHumidityMax },
  ]

  const metrics = {}
  let wsum = 0, wtot = 0
  for (const d of defs) {
    if (d.min == null || d.max == null) { metrics[d.key] = { state: 'no-range', label: d.label }; continue }
    const compliance = compliancePercent(readings, d.field, d.min, d.max)
    const now = metricNowScore(d.latest, d.min, d.max)
    if (compliance == null && now == null) {
      metrics[d.key] = { state: 'no-data', label: d.label, min: d.min, max: d.max, unit: d.unit }
      continue
    }
    const score = 0.7 * (compliance ?? now) + 0.3 * (now ?? compliance)
    const state = d.latest == null ? 'no-data'
      : d.latest < d.min ? 'low'
      : d.latest > d.max ? 'high' : 'ok'
    metrics[d.key] = { score, compliance, state, latest: d.latest, min: d.min, max: d.max, label: d.label, unit: d.unit }
    wsum += score * d.weight
    wtot += d.weight
  }

  const score = wtot ? Math.round(wsum / wtot) : null
  const graded = Object.entries(metrics).filter(([, m]) => m.score != null)
  const worst = graded.length ? graded.reduce((a, b) => (b[1].score < a[1].score ? b : a))[0] : null
  return { score, metrics, worst }
}

export function plantHealthSummary(h) {
  if (h.score == null) {
    return Object.values(h.metrics).some(m => m.state === 'no-data')
      ? 'Waiting for readings.'
      : 'No readings for this plant yet.'
  }
  const problems = Object.values(h.metrics)
    .filter(m => m.state === 'low' || m.state === 'high')
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
  if (!problems.length) return 'All conditions in range.'
  return problems.map(m => {
    const dir = m.state === 'low' ? 'below' : 'above'
    const now = Math.round(m.latest * 10) / 10
    const comp = m.compliance != null ? `, in range ${m.compliance}% of the period` : ''
    return `${m.label} ${dir} range — ${now}${m.unit} vs ${m.min.toFixed(0)}–${m.max.toFixed(0)}${m.unit}${comp}`
  }).join('. ') + '.'
}
