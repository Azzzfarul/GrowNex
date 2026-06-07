import 'dotenv/config'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ← paste your zone ID here (Firebase Console → Firestore → zones → copy doc ID)
const ZONE_ID = 'DMdyKPLqZlpuKSZNCoPC'

initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const db = getFirestore()

function rand(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(1)
}

async function clean() {
  const snap = await db.collection('zones').doc(ZONE_ID).collection('stats').get()
  if (snap.empty) { console.log('Nothing to delete.'); return }

  const batch = db.batch()
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  console.log(`Deleted ${snap.size} stats docs from zones/${ZONE_ID}/stats`)
}

async function seed() {
  const now   = Date.now()
  const HOURS = 7 * 24   // 168 hourly buckets
  const batch = db.batch()

  for (let i = HOURS - 1; i >= 0; i--) {
    const hourMs = now - i * 60 * 60 * 1000
    const docId  = new Date(hourMs).toISOString().slice(0, 13)  // "2026-06-01T08"
    const hour   = new Date(hourMs).getUTCHours()
    const isDay  = hour >= 6 && hour <= 20

    const sm1 = rand(35, 65)
    const sm2 = rand(35, 65)
    const sm3 = rand(35, 65)
    const sm4 = rand(35, 65)

    batch.set(
      db.collection('zones').doc(ZONE_ID).collection('stats').doc(docId),
      {
        temperature:   rand(24, 32),
        humidity:      rand(50, 80),
        lightLevel:    isDay ? rand(40, 100) : rand(0, 10),
        moisture:      +((sm1 + sm2 + sm3 + sm4) / 4).toFixed(1),
        soilMoisture1: sm1,
        soilMoisture2: sm2,
        soilMoisture3: sm3,
        soilMoisture4: sm4,
        timestamp:     Timestamp.fromDate(new Date(hourMs)),
      }
    )
  }

  await batch.commit()
  console.log(`Seeded ${HOURS} hourly stats docs → zones/${ZONE_ID}/stats`)
  console.log('Open the Analytics page and select your zone to see the charts.')
}

if (ZONE_ID === 'YOUR_ZONE_ID') {
  console.error('ERROR: Replace YOUR_ZONE_ID in seed.js with your actual zone ID.')
  process.exit(1)
}

const mode = process.argv[2]
if (mode === '--clean') {
  clean().catch(err => { console.error('Clean failed:', err.message); process.exit(1) })
} else {
  seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1) })
}

//Seed 168 docs
//node seed.js

//Delete all seeded docs
//node seed.js --clean
