// Minimal server-side port of the client's analytics rule helpers
// (web AnalyticsPage.jsx). Used by AI features to build deterministic fallbacks.

export function avgPref(plants, minKey, maxKey) {
  const mins = plants.map(p => p[minKey]).filter(v => v != null)
  const maxs = plants.map(p => p[maxKey]).filter(v => v != null)
  return {
    min: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    max: maxs.length ? maxs.reduce((a, b) => a + b, 0) / maxs.length : null,
  }
}

// % of non-null series values inside [min, max]; null if unknowable.
export function compliancePercent(series, min, max) {
  if (min == null || max == null) return null
  const v = series.filter(x => x != null)
  if (!v.length) return null
  return Math.round((v.filter(x => x >= min && x <= max).length / v.length) * 100)
}

// latest: { temperature, humidity, moisture }
// prefs:  { temperature: {min,max}|null, humidity: {...}, moisture: {...} }
// → [{ metric, state: 'low'|'high', value, min, max }]
export function rangeIssues(latest, prefs) {
  const out = []
  for (const metric of ['temperature', 'humidity', 'moisture']) {
    const val = latest?.[metric]
    const p = prefs?.[metric]
    if (val == null || !p || p.min == null || p.max == null) continue
    if (val < p.min) out.push({ metric, state: 'low', value: val, min: p.min, max: p.max })
    else if (val > p.max) out.push({ metric, state: 'high', value: val, min: p.min, max: p.max })
  }
  return out
}
