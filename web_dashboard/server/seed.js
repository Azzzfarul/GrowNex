import 'dotenv/config'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

// ─── Usage ────────────────────────────────────────────────────────────────────
//   Seed demo data for a user (run after registering):
//     node seed.js <FIREBASE_UID>
//
//   Delete all seeded data for a user:
//     node seed.js <FIREBASE_UID> --clean
//
// Side-effect free: the seeded automationConfig has every automation DISABLED, so
// the MQTT bridge's watchAutomationConfig schedules zero cron jobs, and all device
// actuator fields are false so watchDeviceActuators has nothing meaningful to
// publish. Nothing here talks to MQTT or triggers an actuator. (For a guaranteed
// no-op even on the bridge side, run this while the server is stopped.)

const USER_ID = process.argv[2]

if (!USER_ID || USER_ID.startsWith('--')) {
  console.error('ERROR: Provide your Firebase UID as the first argument.')
  console.error('  node seed.js <FIREBASE_UID>')
  process.exit(1)
}

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

// ─── Clean ────────────────────────────────────────────────────────────────────

async function deleteSubcollection(ref, name) {
  const snap = await ref.collection(name).get()
  if (snap.empty) return
  const batch = db.batch()
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  console.log(`  Deleted ${snap.size} docs from ${name}`)
}

async function clean() {
  console.log(`Cleaning demo data for user: ${USER_ID}`)

  const UNCLAIMED_ID = 'GRX-DEMO-HUB02'
  const unclaimedRef = db.collection('devices').doc(UNCLAIMED_ID)
  const unclaimedSnap = await unclaimedRef.get()
  if (unclaimedSnap.exists) {
    await unclaimedRef.delete()
    console.log(`  Deleted unclaimed device: ${UNCLAIMED_ID}`)
  }

  const [devicesSnap, zonesSnap] = await Promise.all([
    db.collection('devices').where('userId', '==', USER_ID).where('_demo', '==', true).get(),
    db.collection('zones').where('userId', '==', USER_ID).where('_demo', '==', true).get(),
  ])

  // Delete subcollections first
  for (const zoneDoc of zonesSnap.docs) {
    await deleteSubcollection(zoneDoc.ref, 'stats')
    await deleteSubcollection(zoneDoc.ref, 'sensorReadings')
    await deleteSubcollection(zoneDoc.ref, 'aiCache')
  }

  // Delete plants linked to seeded zones
  const zoneIds = zonesSnap.docs.map(d => d.id)
  if (zoneIds.length > 0) {
    const plantsSnap = await db.collection('plants').where('zoneId', 'in', zoneIds).get()
    const batch = db.batch()
    plantsSnap.docs.forEach(d => batch.delete(d.ref))
    zonesSnap.docs.forEach(d => batch.delete(d.ref))
    devicesSnap.docs.forEach(d => batch.delete(d.ref))
    // automationConfig lives in a top-level collection keyed by zoneId
    zoneIds.forEach(id => batch.delete(db.collection('automationConfig').doc(id)))
    await batch.commit()
    console.log(`  Deleted ${plantsSnap.size} plants, ${zonesSnap.size} zones, ${devicesSnap.size} devices, automationConfig`)
  } else {
    const batch = db.batch()
    devicesSnap.docs.forEach(d => batch.delete(d.ref))
    if (!batch._ops?.length) {
      console.log('  Nothing to delete.')
      return
    }
    await batch.commit()
  }

  console.log('Done — demo data removed.')
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding demo data for user: ${USER_ID}`)

  const now = Timestamp.now()
  const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const fiveDaysAgo  = Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000))

  // ── 1. Zone (created first so we have its ID for the device) ─────────────
  const sm1 = rand(50, 62), sm2 = rand(55, 68), sm3 = rand(38, 50), sm4 = rand(58, 72)
  const latestMoisture = +((sm1 + sm2 + sm3 + sm4) / 4).toFixed(1)

  const zoneRef = db.collection('zones').doc()

  // ── 2. Device (assignedZoneId links back to the zone) ─────────────────────
  const deviceRef = db.collection('devices').doc()
  await deviceRef.set({
    _demo:               true,
    userId:              USER_ID,
    assignedZoneId:      zoneRef.id,
    deviceName:          'GrowNex Hub 01',
    deviceType:          'indoor',
    status:              'online',
    totalSlots:          4,
    hasLightingModule:   true,
    hasFertilizerModule: true,
    irrigationActive:    false,
    fertilizerActive:    false,
    lightActive:         false,
    lastSync:            now,
  })
  console.log(`  Created device: ${deviceRef.id}`)

  await zoneRef.set({
    _demo:            true,
    userId:           USER_ID,
    deviceId:         deviceRef.id,
    zoneName:         'Herb Garden',
    zoneType:         'indoor',
    status:           'healthy',
    alertSummary:     'All conditions are within preferred range.',
    deviceOnline:     true,
    totalPlantSlots:  4,
    hasFertilizer:    true,
    hasLight:         true,
    latestTemp:       rand(25, 29),
    latestHumid:      rand(62, 75),
    latestLight:      rand(60, 85),
    latestMoisture,
    latestMoisture1:  sm1,
    latestMoisture2:  sm2,
    latestMoisture3:  sm3,
    latestMoisture4:  sm4,
    latestTimestamp:  now,
    createdAt:        sevenDaysAgo,
  })
  console.log(`  Created zone: ${zoneRef.id}`)

  // ── 3. Plants ─────────────────────────────────────────────────────────────
  const plantDefs = [
    {
      plantName: 'Basil', species: 'Ocimum basilicum', slotNumber: 1,
      preferredMoistureMin: 45,   preferredMoistureMax: 70,
      preferredHumidityMin: 50,   preferredHumidityMax: 80,
      preferredTemperatureMin: 22, preferredTemperatureMax: 30,
      preferredLightCondition: 'high',
      notes: 'Keep away from cold drafts. Pinch flowers to prolong leaf production.',
    },
    {
      plantName: 'Mint', species: 'Mentha spicata', slotNumber: 2,
      preferredMoistureMin: 55,   preferredMoistureMax: 75,
      preferredHumidityMin: 55,   preferredHumidityMax: 80,
      preferredTemperatureMin: 18, preferredTemperatureMax: 28,
      preferredLightCondition: 'medium',
      notes: 'Trim regularly to prevent leggy growth.',
    },
    {
      plantName: 'Chili', species: 'Capsicum annuum', slotNumber: 3,
      preferredMoistureMin: 35,   preferredMoistureMax: 55,
      preferredHumidityMin: 45,   preferredHumidityMax: 65,
      preferredTemperatureMin: 24, preferredTemperatureMax: 32,
      preferredLightCondition: 'high',
      notes: 'Reduce watering when fruiting. Likes warmth.',
    },
    {
      plantName: 'Lettuce', species: 'Lactuca sativa', slotNumber: 4,
      preferredMoistureMin: 55,   preferredMoistureMax: 78,
      preferredHumidityMin: 60,   preferredHumidityMax: 80,
      preferredTemperatureMin: 15, preferredTemperatureMax: 22,
      preferredLightCondition: 'medium',
      notes: 'Sensitive to heat — watch temperature carefully.',
    },
  ]

  for (const plant of plantDefs) {
    const ref = await db.collection('plants').add({
      zoneId:    zoneRef.id,
      status:    'healthy',
      createdAt: fiveDaysAgo,
      ...plant,
    })
    console.log(`  Created plant: ${plant.plantName} (${ref.id})`)
  }

  // ── 4. Hourly stats + sensorReadings (7 days) ─────────────────────────────
  const HOURS = 7 * 24   // 168 hourly buckets
  // Firestore batches cap at 500 ops; split into two batches (168 stats + 168 readings = 336 ≤ 500)
  const batch = db.batch()

  for (let i = HOURS - 1; i >= 0; i--) {
    const hourMs = Date.now() - i * 60 * 60 * 1000
    const docId  = new Date(hourMs).toISOString().slice(0, 13)  // "2026-06-01T08"
    const hour   = new Date(hourMs).getUTCHours()
    const isDay  = hour >= 6 && hour <= 20

    const s1 = rand(35, 65), s2 = rand(35, 65), s3 = rand(35, 65), s4 = rand(35, 65)
    const reading = {
      temperature:   rand(24, 32),
      humidity:      rand(50, 80),
      lightLevel:    isDay ? rand(40, 100) : rand(0, 10),
      moisture:      +((s1 + s2 + s3 + s4) / 4).toFixed(1),
      soilMoisture1: s1,
      soilMoisture2: s2,
      soilMoisture3: s3,
      soilMoisture4: s4,
      timestamp:     Timestamp.fromDate(new Date(hourMs)),
    }

    // Analytics (web + mobile) reads the hourly zones/{id}/stats buckets.
    batch.set(zoneRef.collection('stats').doc(docId), reading)
    // Raw zones/{id}/sensorReadings feeds the "latest reading" stream; carries a
    // TTL field (expiresAt) exactly like the MQTT bridge writes.
    batch.set(zoneRef.collection('sensorReadings').doc(docId), {
      ...reading,
      expiresAt: Timestamp.fromDate(new Date(hourMs + 30 * 24 * 60 * 60 * 1000)),
    })
  }

  await batch.commit()
  console.log(`  Seeded ${HOURS} hourly stats + sensorReadings docs`)

  // ── 5. Automation config ──────────────────────────────────────────────────
  // Top-level automationConfig/{zoneId} — the collection the app and MQTT bridge
  // actually use. Every automation is DISABLED so the bridge's watchAutomationConfig
  // schedules no cron jobs on seed. Threshold/schedule values are pre-filled purely
  // so the Automation UI has something to show; they stay inert until toggled on.
  await db.collection('automationConfig').doc(zoneRef.id).set({
    autoWateringEnabled:    false,
    wateringThreshold:      40,
    wateringSchedule:       '08:00',
    wateringDuration:       300,
    autoLightingEnabled:    false,
    lightingSchedule:       '06:00–20:00',
    autoFertilizingEnabled: false,
    fertilizingSchedule:    'MON 06:00',
    fertilizingDuration:    600,
    aiRecommended:          false,
  })
  console.log(`  Created automationConfig (all automation disabled)`)

  // ── 6. Unclaimed device (for the "Add Device" demo flow) ──────────────────
  const UNCLAIMED_ID = 'GRX-DEMO-HUB02'
  await db.collection('devices').doc(UNCLAIMED_ID).set({
    _demo:               true,
    userId:              '',          // empty = unclaimed
    assignedZoneId:      null,
    deviceName:          'GrowNex Hub 02',
    deviceType:          'indoor',
    status:              'offline',
    totalSlots:          4,
    hasLightingModule:   true,
    hasFertilizerModule: true,
    irrigationActive:    false,
    fertilizerActive:    false,
    lightActive:         false,
    lastSync:            null,
  })
  console.log(`  Created unclaimed device: ${UNCLAIMED_ID}`)

  console.log(`
Done! Demo data ready.

  Claimed device  : ${deviceRef.id}
  Zone            : ${zoneRef.id}
  Unclaimed device: ${UNCLAIMED_ID}

Open the app/dashboard and navigate to:
  • Dashboard  → see live summary cards
  • Plants     → Herb Garden with 4 plants
  • Devices    → GrowNex Hub 01 (claimed)
  • Analytics  → select "Herb Garden" for charts and health score

To demo "Add Device":
  → Devices → Add device → type: ${UNCLAIMED_ID} → Find → Claim device

To remove this demo data later:
  node seed.js ${USER_ID} --clean
`)
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const mode = process.argv[3]
if (mode === '--clean') {
  clean().catch(err => { console.error('Clean failed:', err.message); process.exit(1) })
} else {
  seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1) })
}
