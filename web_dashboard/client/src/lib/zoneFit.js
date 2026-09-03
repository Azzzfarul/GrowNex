// Feature 2 — rule-based "this plant may fit another zone better".
// No AI. Range-overlap math on preferred conditions.
//
// Temperature, light and moisture are weighted higher than humidity: in GrowNex
// they are zone-wide (shared air, one grow light, one irrigation pump + one
// wateringThreshold per zone) and can't be tuned per plant slot, so a mismatch
// on any of them forces a "wrong zone" call. Humidity isn't actuated at all, so
// it only nudges. (You can't share a pump between chili and a barrel cactus.)

const METRIC_KEYS = {
  moisture:    ['preferredMoistureMin', 'preferredMoistureMax'],
  humidity:    ['preferredHumidityMin', 'preferredHumidityMax'],
  temperature: ['preferredTemperatureMin', 'preferredTemperatureMax'],
}
const WEIGHT = { temperature: 2, light: 2, moisture: 2, humidity: 1 }
const STARK_METRICS = ['temperature', 'light', 'moisture']

function avgRange(plants, minKey, maxKey) {
  const mins = plants.map(p => p[minKey]).filter(v => v != null)
  const maxs = plants.map(p => p[maxKey]).filter(v => v != null)
  if (!mins.length || !maxs.length) return null
  return {
    min: mins.reduce((a, b) => a + b, 0) / mins.length,
    max: maxs.reduce((a, b) => a + b, 0) / maxs.length,
  }
}

// overlap of [aMin,aMax] with [bMin,bMax] as a fraction of a's width (0..1)
function overlap(a, b) {
  if (!a || !b) return null
  const width = a.max - a.min
  if (width <= 0) return null
  const lo = Math.max(a.min, b.min)
  const hi = Math.min(a.max, b.max)
  return Math.max(0, Math.min(1, (hi - lo) / width))
}

// plant: a prefs object; plants: existing plants in a zone.
// → { fit, byMetric: { temperature, humidity, moisture, light }, worst } or null
export function plantZoneFit(plant, plants) {
  if (!plants || !plants.length) return null

  const byMetric = {}
  for (const [metric, [minK, maxK]] of Object.entries(METRIC_KEYS)) {
    const a = plant[minK] != null && plant[maxK] != null ? { min: plant[minK], max: plant[maxK] } : null
    const o = overlap(a, avgRange(plants, minK, maxK))
    if (o != null) byMetric[metric] = o
  }
  if (plant.preferredLightCondition) {
    const counts = {}
    for (const p of plants) if (p.preferredLightCondition) counts[p.preferredLightCondition] = (counts[p.preferredLightCondition] || 0) + 1
    const dominant = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0]
    if (dominant) byMetric.light = dominant === plant.preferredLightCondition ? 1 : 0.2
  }

  const metrics = Object.keys(byMetric)
  if (!metrics.length) return null
  let wsum = 0, wtot = 0
  for (const m of metrics) { wsum += byMetric[m] * WEIGHT[m]; wtot += WEIGHT[m] }
  const worst = metrics.reduce((a, b) => (byMetric[b] < byMetric[a] ? b : a))
  return { fit: wsum / wtot, byMetric, worst }
}

// zonesById: { zoneId -> { zone, plants } }. Returns:
//   { kind: 'move', zone, reason }  — another existing zone fits clearly better
//   { kind: 'new', reason }         — poor fit here and nowhere else fits either
//   null                            — the plant fits the current zone fine
// Triggered by a poor weighted fit OR a stark temperature/light/moisture clash.
export function zoneFitHint(plant, currentZoneId, zonesById) {
  const cur = plantZoneFit(plant, zonesById[currentZoneId]?.plants ?? [])
  if (!cur) return null

  const stark = STARK_METRICS.find(m => cur.byMetric[m] != null && cur.byMetric[m] < 0.15)
  if (cur.fit >= 0.45 && !stark) return null

  const reason = stark || cur.worst

  let best = null
  for (const [zid, { zone, plants }] of Object.entries(zonesById)) {
    if (zid === currentZoneId) continue
    const f = plantZoneFit(plant, plants)
    if (!f) continue
    if (!best || f.fit > best.fit) best = { zone, fit: f.fit, byMetric: f.byMetric }
  }

  if (best) {
    const overallBetter = best.fit >= cur.fit + 0.2
    const starkBetter = stark && best.byMetric[stark] != null && best.byMetric[stark] >= 0.5
    if (overallBetter || starkBetter) {
      return { kind: 'move', zone: best.zone, reason, fit: best.fit, currentFit: cur.fit }
    }
  }
  return { kind: 'new', reason, currentFit: cur.fit }
}
