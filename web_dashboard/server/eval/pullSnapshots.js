// Saves every current camera snapshot locally so it can be labelled for the zone evaluation.
// Snapshots are pruned after 48 h, so run this at least every other day while collecting.
//   node eval/pullSnapshots.js      → eval/data/zone/<zoneId>_<bucket>.jpg + rows in labels.csv
// Read-only against Firestore/Storage; safe to run while the server is up.
import 'dotenv/config'
import '../src/firebase-admin.js'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { mkdir, appendFile, access, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dir = 'eval/data/zone'
const labels = path.join(dir, 'labels.csv')
const exists = (p) => access(p).then(() => true, () => false)

await mkdir(dir, { recursive: true })
if (!await exists(labels)) await writeFile(labels, 'file,label,split,species\n')

let saved = 0
const snaps = await getFirestore().collectionGroup('snapshots').get()
for (const snap of snaps.docs) {
  const { storagePath } = snap.data()
  const zoneId = snap.ref.parent.parent.id
  const file = `${zoneId}_${snap.id}.jpg`
  if (!storagePath || await exists(path.join(dir, file))) continue
  await getStorage().bucket().file(storagePath).download({ destination: path.join(dir, file) })
  await appendFile(labels, `${file},,,\n`)  // fill in label (healthy|stressed|unhealthy) and split (dev|test)
  saved++
}
console.log(`${saved} new snapshot(s) saved to ${dir}. Label them in ${labels} (see eval/LABELS.md).`)
