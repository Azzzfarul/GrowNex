// Builds labels.csv for a PlantDoc download (folders: <root>/train/<class>/*.jpg, <root>/test/<class>/*.jpg).
//   node eval/plantdocLabels.js <plantdoc-root> [devPerClass=15]  → <plantdoc-root>/labels.csv
// test/ becomes the held-out test split; the first N images per class of train/ become dev.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [root, devPerClass = '15'] = process.argv.slice(2)
if (!root) { console.error('usage: node eval/plantdocLabels.js <plantdoc-root> [devPerClass]'); process.exit(1) }
const map = JSON.parse(await readFile(new URL('./plantdoc-map.json', import.meta.url), 'utf8'))

const out = ['file,label,split,species']
const unmapped = new Set()
for (const [folder, split, cap] of [['train', 'dev', +devPerClass], ['test', 'test', Infinity]]) {
  for (const cls of (await readdir(path.join(root, folder))).sort()) {
    const m = map[cls]
    if (!m) { if (!cls.startsWith('.')) unmapped.add(cls); continue }
    const files = (await readdir(path.join(root, folder, cls))).filter(f => /\.jpe?g$/i.test(f) && !f.includes(',')).sort()
    for (const f of files.slice(0, cap)) out.push(`${folder}/${cls}/${f},${m.label},${split},${m.species}`)
  }
}
await writeFile(path.join(root, 'labels.csv'), out.join('\n') + '\n')
console.log(`${out.length - 1} rows → ${path.join(root, 'labels.csv')}`)
if (unmapped.size) console.warn(`No mapping (skipped), add to eval/plantdoc-map.json: ${[...unmapped].join('; ')}`)
