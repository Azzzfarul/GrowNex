// Pure scoring functions for eval/visionEval.js. A row is { label, predicted, confidence }.

// Headline rule: an abstaining answer ('unclear', 'not_plant', or a failed call) on an image
// that has a real label is a wrong answer. Coverage and accuracy-on-answered are secondary.
export function scoreRows(rows, classes, { abstain = ['unclear', 'not_plant', 'error'], minSupport = 20 } = {}) {
  const n = rows.length
  const correct = rows.filter(r => r.predicted === r.label).length
  const answered = rows.filter(r => !abstain.includes(r.predicted))

  const confusion = {}
  for (const r of rows) {
    confusion[r.label] ??= {}
    confusion[r.label][r.predicted] = (confusion[r.label][r.predicted] ?? 0) + 1
  }

  const perClass = classes.map(label => {
    const support = rows.filter(r => r.label === label).length
    const predicted = rows.filter(r => r.predicted === label).length
    const tp = rows.filter(r => r.label === label && r.predicted === label).length
    const precision = predicted ? tp / predicted : 0
    const recall = support ? tp / support : 0
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
    return { label, support, precision, recall, f1, reported: support >= minSupport }
  })
  const reported = perClass.filter(c => c.reported)

  return {
    n,
    accuracy: n ? correct / n : 0,
    wilson: wilson(correct, n),
    macroF1: reported.length ? reported.reduce((s, c) => s + c.f1, 0) / reported.length : 0,
    coverage: n ? answered.length / n : 0,
    answeredAccuracy: answered.length ? answered.filter(r => r.predicted === r.label).length / answered.length : 0,
    perClass,
    confusion,
  }
}

// 95 % Wilson score interval for k successes out of n.
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n
  const centre = p + (z * z) / (2 * n)
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const denom = 1 + (z * z) / n
  return [(centre - half) / denom, (centre + half) / denom]
}

// Accuracy per confidence bin: does a higher stated confidence mean a likelier correct answer?
export function calibration(rows, binWidth = 0.1) {
  const count = Math.round(1 / binWidth)
  const bins = Array.from({ length: count }, (_, i) => ({ lo: i * binWidth, hi: (i + 1) * binWidth, n: 0, right: 0 }))
  for (const r of rows) {
    const b = bins[Math.min(count - 1, Math.floor((r.confidence ?? 0) / binWidth + 1e-9))]
    b.n++
    if (r.predicted === r.label) b.right++
  }
  return bins.filter(b => b.n).map(({ lo, hi, n, right }) => ({ lo, hi: +hi.toFixed(10), n, accuracy: right / n }))
}

// Agreement between two raters over [a, b] pairs, corrected for chance.
export function cohenKappa(pairs) {
  const n = pairs.length
  const matrix = {}, rowTotals = {}, colTotals = {}
  let agree = 0
  for (const [a, b] of pairs) {
    matrix[a] ??= {}
    matrix[a][b] = (matrix[a][b] ?? 0) + 1
    rowTotals[a] = (rowTotals[a] ?? 0) + 1
    colTotals[b] = (colTotals[b] ?? 0) + 1
    if (a === b) agree++
  }
  const agreement = n ? agree / n : 0
  const chance = n ? Object.keys(rowTotals).reduce((s, k) => s + (rowTotals[k] * (colTotals[k] ?? 0)) / (n * n), 0) : 0
  return { kappa: chance === 1 ? 1 : (agreement - chance) / (1 - chance), agreement, matrix }
}
