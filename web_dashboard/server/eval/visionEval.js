// Measures how accurate the vision prompts are. Run by hand (it costs money), never in npm test.
//   node eval/visionEval.js --task plant --split dev  --dir eval/data/plant --labels eval/data/plant/labels.csv
//   node eval/visionEval.js --task zone  --split test --dir eval/data/zone  --labels eval/data/zone/labels.csv
//   node eval/visionEval.js --task agreement [--zone <zoneId>]
// Options: --model <dated model id>  --provider <OpenRouter provider>  --no-context  --out <dir>
// Protocol (dev/test split, the "unclear" rule, minimum per class): eval/README.md.
import 'dotenv/config'
import { parseArgs } from 'node:util'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { aiEnabled } from '../src/services/aiClient.js'
import {
  diagnosePlantImage, checkZoneImage, CONDITIONS, ZONE_STATUSES, VISION_PROMPT_V,
} from '../src/services/aiVision.js'
import { scoreRows, calibration, cohenKappa } from './metrics.js'

const { values: opt } = parseArgs({ options: {
  task: { type: 'string' }, split: { type: 'string' }, dir: { type: 'string' }, labels: { type: 'string' },
  model: { type: 'string' }, provider: { type: 'string' }, out: { type: 'string', default: 'eval/out' },
  'no-context': { type: 'boolean', default: false }, zone: { type: 'string' },
} })

const fail = (msg) => { console.error(`ERROR: ${msg}`); process.exit(1) }
const pct = (x) => `${(x * 100).toFixed(1)} %`

if (opt.task === 'agreement') await agreement()
else if (opt.task === 'plant' || opt.task === 'zone') await accuracy()
else fail('--task must be plant, zone or agreement')

// ── labelled accuracy ───────────────────────────────────────────────────────

async function accuracy() {
  const plant = opt.task === 'plant'
  if (!['dev', 'test'].includes(opt.split)) fail('--split must be dev or test')
  if (!opt.dir || !opt.labels) fail('--dir and --labels are required')
  if (!aiEnabled()) fail('OPENROUTER_API_KEY is not set')

  // Scored classes: the abstaining ones are answers, never labels.
  const classes = (plant ? CONDITIONS : ZONE_STATUSES).filter(c => c !== 'unclear' && c !== 'not_plant')
  // shortcut: plain comma split, so file names must not contain commas; use a CSV parser if they ever do.
  const lines = (await readFile(opt.labels, 'utf8')).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const items = lines.slice(lines[0].startsWith('file,') ? 1 : 0).map(l => {
    const [file, label, split, species] = l.split(',').map(s => s.trim())
    return { file, label, split, species }
  }).filter(i => i.label)  // unlabelled rows (fresh from pullSnapshots.js) are skipped
  const bad = items.find(i => !classes.includes(i.label) || !['dev', 'test'].includes(i.split))
  if (bad) fail(`labels.csv: "${bad.file}" has label "${bad.label}" / split "${bad.split}". Labels: ${classes.join(', ')}; split: dev or test`)
  const todo = items.filter(i => i.split === opt.split)
  if (!todo.length) fail(`no "${opt.split}" rows in ${opt.labels}`)

  // Plant photos get the same downscale as the apps (longest side 1280 px, JPEG quality 80:
  // web downscaleToJpeg, mobile image_picker). Zone images go raw, as the bridge sends them.
  const sharp = plant ? (await import('sharp')).default : null
  const call = plant ? diagnosePlantImage : checkZoneImage

  const rows = []
  for (const [i, item] of todo.entries()) {
    const row = { file: item.file, label: item.label }
    try {
      let jpeg = await readFile(path.join(opt.dir, item.file))
      if (sharp) jpeg = await sharp(jpeg).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
      const context = opt['no-context'] || !item.species ? undefined
        : plant ? { species: item.species } : { species: item.species.split('|') }
      const { result, meta } = await call({ jpeg, context, model: opt.model, provider: opt.provider })
      Object.assign(row, { predicted: plant ? result.condition : result.status, confidence: result.confidence, result, meta })
    } catch (e) {
      Object.assign(row, { predicted: 'error', confidence: 0, error: e.message })
    }
    rows.push(row)
    console.log(`${i + 1}/${todo.length} ${row.file}: ${row.label} → ${row.predicted}${row.error ? ` (${row.error})` : ''}`)
  }

  const run = {
    task: opt.task, split: opt.split, date: new Date().toISOString(), promptV: VISION_PROMPT_V,
    commit: execSync('git rev-parse --short HEAD').toString().trim(),
    modelRequested: opt.model ?? '(server default)', providerRequested: opt.provider ?? '(not pinned)',
    modelsReturned: [...new Set(rows.map(r => r.meta?.model).filter(Boolean))],
    providersReturned: [...new Set(rows.map(r => r.meta?.provider).filter(Boolean))],
    context: !opt['no-context'],
  }
  const scores = scoreRows(rows, classes)
  const bins = calibration(rows.filter(r => r.predicted !== 'error'))
  const ok = rows.filter(r => r.meta)
  const mean = (f) => ok.length ? ok.reduce((s, r) => s + (f(r) ?? 0), 0) / ok.length : 0

  const outDir = path.join(opt.out, `${opt.task}-${opt.split}-${run.date.replace(/[:.]/g, '-')}`)
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify({ run, scores, calibration: bins, rows }, null, 2))

  const predicted = [...classes, 'unclear', ...(plant ? ['not_plant'] : []), 'error']
  const report = [
    `# Vision evaluation: ${opt.task}, ${opt.split} split`,
    '',
    ...Object.entries(run).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') || '(none)' : v}`),
    ...(run.providersReturned.length > 1 || !opt.provider ? ['- WARNING: provider not pinned to one; results may not be repeatable'] : []),
    '',
    '## Headline (an "unclear", "not_plant" or failed answer counts as wrong)',
    '',
    `- Images: ${scores.n}`,
    `- Accuracy: ${pct(scores.accuracy)} (95 % interval ${pct(scores.wilson[0])} to ${pct(scores.wilson[1])})`,
    `- Macro-F1 over reported classes: ${scores.macroF1.toFixed(3)}`,
    '',
    '## Secondary',
    '',
    `- Coverage (share given a real class): ${pct(scores.coverage)}`,
    `- Accuracy on answered images: ${pct(scores.answeredAccuracy)}`,
    `- Mean latency: ${Math.round(mean(r => r.meta.latencyMs))} ms; mean tokens: ${Math.round(mean(r => r.meta.usage?.total_tokens))}`,
    '',
    '## Per class (reported only with at least 20 images)',
    '',
    '| Class | Images | Precision | Recall | F1 |',
    '|---|---|---|---|---|',
    ...scores.perClass.map(c => c.reported
      ? `| ${c.label} | ${c.support} | ${c.precision.toFixed(3)} | ${c.recall.toFixed(3)} | ${c.f1.toFixed(3)} |`
      : `| ${c.label} | ${c.support} | ${c.support ? `insufficient data (${c.support})` : 'not tested'} | | |`),
    '',
    '## Confusion matrix (rows: true label, columns: answer)',
    '',
    `| | ${predicted.join(' | ')} |`,
    `|---|${predicted.map(() => '---').join('|')}|`,
    ...classes.filter(c => scores.confusion[c]).map(c => `| ${c} | ${predicted.map(p => scores.confusion[c][p] ?? 0).join(' | ')} |`),
    '',
    '## Calibration (does stated confidence track accuracy?)',
    '',
    '| Confidence | Images | Accuracy |',
    '|---|---|---|',
    ...bins.map(b => `| ${b.lo.toFixed(1)} to ${b.hi.toFixed(1)} | ${b.n} | ${pct(b.accuracy)} |`),
    '',
  ].join('\n')
  await writeFile(path.join(outDir, 'report.md'), report)
  console.log(`\n${report}\nWritten to ${outDir}`)
}

// ── camera vs sensors (no labels needed) ────────────────────────────────────
// Reads the hours where the bridge recorded both a visual status and the sensor status.
// Agreement is not accuracy: the two measure different things. See eval/README.md.

async function agreement() {
  await import('../src/firebase-admin.js')
  const { getFirestore } = await import('firebase-admin/firestore')
  const db = getFirestore()
  const sensorAs = { healthy: 'healthy', attention: 'stressed', critical: 'unhealthy' }
  const zoneIds = opt.zone ? [opt.zone] : (await db.collection('zones').get()).docs.map(d => d.id)

  const pairs = [], differ = []
  for (const zoneId of zoneIds) {
    const days = await db.collection('zones').doc(zoneId).collection('statsDaily').get()
    for (const day of days.docs) {
      for (const [hh, h] of Object.entries(day.data().hours ?? {})) {
        const sensor = sensorAs[h.sensorStatus]
        if (!sensor || !h.visualStatus || h.visualStatus === 'unclear') continue
        pairs.push([h.visualStatus, sensor])
        if (h.visualStatus !== sensor) differ.push(`${zoneId} ${day.id}T${hh}: camera ${h.visualStatus} (${h.visualConfidence}), sensors ${sensor}`)
      }
    }
  }
  if (!pairs.length) fail('no hours with both a visual and a sensor status yet')
  const k = cohenKappa(pairs)
  console.log(`Hours compared: ${pairs.length}\nAgreement: ${pct(k.agreement)}\nCohen's kappa: ${k.kappa.toFixed(3)}`)
  console.log('Matrix (camera → sensors):', JSON.stringify(k.matrix, null, 2))
  console.log(`Disagreements (${differ.length}):\n${differ.sort().join('\n')}`)
}
