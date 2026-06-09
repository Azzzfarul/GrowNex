import mqtt from 'mqtt'
import cron from 'node-cron'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

const BROKER      = process.env.MQTT_BROKER_HOST || 'broker.hivemq.com'
const READING_TTL_MS = 30 * 24 * 60 * 60 * 1000  // raw sensorReadings kept for 30 days
const BROKER_PORT = parseInt(process.env.MQTT_BROKER_PORT || '1883')
const MQTT_USER   = process.env.MQTT_USER || ''
const MQTT_PASS   = process.env.MQTT_PASS || ''
const db          = getFirestore()

let client

// ─── Helper: get or create a device document using hardwareId as doc ID ───────
async function getOrCreateDevice(deviceId) {
  const ref  = db.collection('devices').doc(deviceId)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      deviceName:          deviceId,
      deviceType:          'indoor',
      status:              'online',
      assignedZoneId:      null,
      hasLightingModule:   false,
      hasFertilizerModule: false,
      totalSlots:          4,
      userId:              '',
      lastSync:            FieldValue.serverTimestamp(),
    })
    console.log(`[MQTT bridge] new device registered: ${deviceId}`)
  }
  return (await ref.get()).data()
}

// ─── Sensor message handler ───────────────────────────────────────────────────
// Topic: grownex/{deviceId}/sensors
// Payload: { deviceId, temperature, humidity, lightLevel, soilMoisture1–4 }
async function handleSensors(deviceId, payload) {
  const { temperature, humidity, lightLevel,
          soilMoisture1, soilMoisture2, soilMoisture3, soilMoisture4 } = payload

  // Average of non-null slot readings — used for threshold checks and backward compat
  const slotValues = [soilMoisture1, soilMoisture2, soilMoisture3, soilMoisture4].filter(v => v != null)
  const moisture = slotValues.length ? slotValues.reduce((a, b) => a + b) / slotValues.length : null

  const device = await getOrCreateDevice(deviceId)
  const { assignedZoneId } = device

  if (!assignedZoneId) {
    await db.collection('devices').doc(deviceId).update({
      status:   'online',
      lastSync: FieldValue.serverTimestamp(),
    })
    console.warn(`[MQTT bridge] device ${deviceId} has no assigned zone — skipping sensor write`)
    return
  }

  // Hourly stats doc ID — UTC hour bucket, e.g. "2024-01-15T14"
  const statsDocId = new Date().toISOString().slice(0, 13)

  const sensorFields = {
    temperature, humidity, lightLevel,
    soilMoisture1: soilMoisture1 ?? null,
    soilMoisture2: soilMoisture2 ?? null,
    soilMoisture3: soilMoisture3 ?? null,
    soilMoisture4: soilMoisture4 ?? null,
    moisture,
  }

  // Raw reading keeps a TTL field so Firestore auto-deletes it after 30 days.
  // Configure the TTL policy once in Firebase Console → Firestore → TTL
  // (collection group: sensorReadings, field: expiresAt).
  const reading = {
    ...sensorFields,
    timestamp: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + READING_TTL_MS)),
  }

  await Promise.all([
    db.collection('zones').doc(assignedZoneId)
      .collection('sensorReadings').add(reading),

    // Hourly stats: overwrite the current-hour bucket with the latest reading.
    // Analytics queries this instead of sensorReadings (168 docs/zone/7d vs 10,080).
    db.collection('zones').doc(assignedZoneId)
      .collection('stats').doc(statsDocId).set({
        ...sensorFields,
        timestamp: FieldValue.serverTimestamp(),
      }),

    db.collection('zones').doc(assignedZoneId).update({
      latestMoisture:  moisture,
      latestMoisture1: soilMoisture1 ?? null,
      latestMoisture2: soilMoisture2 ?? null,
      latestMoisture3: soilMoisture3 ?? null,
      latestMoisture4: soilMoisture4 ?? null,
      latestTemp:      temperature,
      latestHumid:     humidity,
      latestLight:     lightLevel,
      latestTimestamp: FieldValue.serverTimestamp(),
      ...(() => {
        const { status, alertSummary } = computeZoneStatus(sensorFields, plantCache.get(assignedZoneId))
        return alertSummary != null ? { status, alertSummary } : { status }
      })(),
    }),

    db.collection('devices').doc(deviceId).update({
      status:   'online',
      lastSync: FieldValue.serverTimestamp(),
    }),
  ])

  console.log(`[MQTT bridge] sensor write → zone ${assignedZoneId}`)

  // ── Moisture threshold check (30-minute cooldown per device) ──────────────
  const configSnap = await db.collection('automationConfig').doc(assignedZoneId).get()
  if (configSnap.exists) {
    const cfg = configSnap.data()
    if (cfg.autoWateringEnabled &&
        cfg.wateringThreshold != null &&
        moisture != null &&
        moisture < cfg.wateringThreshold) {
      const last = lastIrrTrigger.get(deviceId) ?? 0
      if (Date.now() - last > COOLDOWN_MS) {
        lastIrrTrigger.set(deviceId, Date.now())
        await triggerActuator(assignedZoneId, 'irrigation', true)
        const waterDuration = (cfg.wateringDuration ?? 300) * 1000
        setTimeout(() => triggerActuator(assignedZoneId, 'irrigation', false), waterDuration)
        console.log(`[MQTT bridge] threshold trigger → ${deviceId} (moisture ${moisture}% < ${cfg.wateringThreshold}%), auto-off in ${waterDuration / 1000}s`)
      }
    }
  }
}

// ─── Status handler ───────────────────────────────────────────────────────────
// Topic: grownex/{deviceId}/status  — payload: "online" or "offline" (LWT)
async function handleStatus(deviceId, payload) {
  const status   = payload === 'online' ? 'online' : 'offline'
  const isOnline = status === 'online'
  await db.collection('devices').doc(deviceId).set({ status }, { merge: true })

  // Mirror device online/offline onto the assigned zone so zone cards
  // can hide stale sensor readings without fetching the device separately.
  const deviceSnap = await db.collection('devices').doc(deviceId).get()
  const assignedZoneId = deviceSnap.data()?.assignedZoneId
  if (assignedZoneId) {
    await db.collection('zones').doc(assignedZoneId).update({ deviceOnline: isOnline })
  }

  console.log(`[MQTT bridge] ${deviceId} → ${status}`)
}

// ─── Actuator state handler ───────────────────────────────────────────────────
// Topic: grownex/{deviceId}/actuators/state
// Payload: { deviceId, lightState, fertilizerState, irrigationState }
async function handleActuatorState(deviceId, payload) {
  const { lightState, fertilizerState, irrigationState } = payload
  await getOrCreateDevice(deviceId)
  // Write to *Confirmed fields only — never touch irrigationActive/fertilizerActive/lightActive
  // (those are written by the app/bridge as user intent; overwriting them here causes a
  // watchDeviceActuators → publishCommand feedback loop via a debounce race condition).
  await db.collection('devices').doc(deviceId).update({
    irrigationConfirmed: irrigationState,
    fertilizerConfirmed: fertilizerState,
    lightConfirmed:      lightState,
  })
  console.log(`[MQTT bridge] actuator state confirmed for ${deviceId}`)
}

// ─── Publish helper ───────────────────────────────────────────────────────────
// Centralises all MQTT command publishes AND keeps actuatorCache in sync so
// watchDeviceActuators does not re-publish the same command (loop prevention).
// data: { irrigationActive, fertilizerActive, lightActive }
function publishCommand(deviceId, data) {
  const command = JSON.stringify({
    irrigationState: !!data.irrigationActive,
    fertilizerState: !!data.fertilizerActive,
    lightState:      !!data.lightActive,
  })
  // Sync cache before publishing so any Firestore echo from handleActuatorState
  // finds matching values and does not trigger a second publish.
  actuatorCache.set(deviceId, {
    irrigationActive: !!data.irrigationActive,
    fertilizerActive: !!data.fertilizerActive,
    lightActive:      !!data.lightActive,
  })
  const topic = `grownex/${deviceId}/actuators/command`
  client.publish(topic, command, { retain: true })
  console.log(`[MQTT bridge] command → ${topic}: ${command}`)
}

// ─── Firestore → MQTT: manual actuator control ───────────────────────────────
// Cache-based diff prevents re-publishing when handleActuatorState echoes back.
// Debounce prevents burst-publishing when the user rapidly taps the UI.
const actuatorCache          = new Map()  // Map<deviceId, { irrigationActive, fertilizerActive, lightActive }>
const debounceTimers         = new Map()  // Map<deviceId, TimeoutId>
const DEBOUNCE_MS            = 600
let   devicesListenerInitialized = false

// ─── Plant cache ──────────────────────────────────────────────────────────────
const plantCache = new Map()  // Map<zoneId, Plant[]>
let   plantsInitialized = false

function watchPlants() {
  db.collection('plants').onSnapshot(async snapshot => {
    // Collect affected zoneIds before updating the cache (skip on initial load)
    const changedZoneIds = new Set()
    if (plantsInitialized) {
      snapshot.docChanges().forEach(change => {
        const { zoneId } = change.doc.data()
        if (zoneId) changedZoneIds.add(zoneId)
      })
    }

    const byZone = new Map()
    snapshot.docs.forEach(d => {
      const { zoneId } = d.data()
      if (!zoneId) return
      if (!byZone.has(zoneId)) byZone.set(zoneId, [])
      byZone.get(zoneId).push(d.data())
    })
    // replace each zone's list; clear zones that no longer have plants
    plantCache.clear()
    byZone.forEach((plants, zoneId) => plantCache.set(zoneId, plants))

    if (!plantsInitialized) { plantsInitialized = true; return }

    // Immediately recompute alertSummary for zones whose plants changed,
    // using the latest sensor values already stored on the zone document.
    for (const zoneId of changedZoneIds) {
      const zoneSnap = await db.collection('zones').doc(zoneId).get()
      if (!zoneSnap.exists) continue
      const zone = zoneSnap.data()
      const sensorFields = {
        temperature: zone.latestTemp    ?? null,
        humidity:    zone.latestHumid   ?? null,
        moisture:    zone.latestMoisture ?? null,
      }
      const { status, alertSummary } = computeZoneStatus(sensorFields, plantCache.get(zoneId))
      await db.collection('zones').doc(zoneId).update(
        alertSummary != null ? { status, alertSummary } : { status }
      )
      console.log(`[MQTT bridge] recomputed alertSummary for zone ${zoneId} after plant change`)
    }
  })
}

function computeZoneStatus(sensorFields, plants) {
  if (!plants || plants.length === 0) return { status: 'unknown', alertSummary: null }

  const avg = field => {
    const vals = plants.map(p => p[field]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const { temperature, humidity, moisture } = sensorFields
  const issues = []

  const check = (val, min, max, label, unit) => {
    if (val == null || min == null || max == null) return
    if (val < min) issues.push(`${label} too low (${val}${unit}, ideal ≥ ${min.toFixed(1)}${unit})`)
    else if (val > max) issues.push(`${label} too high (${val}${unit}, ideal ≤ ${max.toFixed(1)}${unit})`)
  }

  check(temperature, avg('preferredTemperatureMin'), avg('preferredTemperatureMax'), 'Temperature', '°C')
  check(humidity,    avg('preferredHumidityMin'),    avg('preferredHumidityMax'),    'Humidity',    '%')
  check(moisture,    avg('preferredMoistureMin'),    avg('preferredMoistureMax'),    'Moisture',    '%')

  if (issues.length === 0) return { status: 'healthy',   alertSummary: 'All conditions are within preferred range.' }
  if (issues.length === 1) return { status: 'attention', alertSummary: issues[0] }
  return { status: 'critical', alertSummary: `${issues.length} conditions out of range: ${issues.join('; ')}` }
}

function watchDeviceActuators() {
  db.collection('devices').onSnapshot(snapshot => {
    if (!devicesListenerInitialized) {
      snapshot.docs.forEach(d => {
        const { irrigationActive, fertilizerActive, lightActive } = d.data()
        actuatorCache.set(d.id, {
          irrigationActive: !!irrigationActive,
          fertilizerActive: !!fertilizerActive,
          lightActive:      !!lightActive,
        })
      })
      devicesListenerInitialized = true
      console.log(`[MQTT bridge] device actuator cache initialized (${actuatorCache.size} devices)`)
      return
    }

    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') return

      const deviceId = change.doc.id
      const data     = change.doc.data()
      const cached   = actuatorCache.get(deviceId) ?? {}

      const irrigationChanged = cached.irrigationActive !== !!data.irrigationActive
      const fertilizerChanged = cached.fertilizerActive !== !!data.fertilizerActive
      const lightChanged      = cached.lightActive      !== !!data.lightActive

      actuatorCache.set(deviceId, {
        irrigationActive: !!data.irrigationActive,
        fertilizerActive: !!data.fertilizerActive,
        lightActive:      !!data.lightActive,
      })

      if (!irrigationChanged && !fertilizerChanged && !lightChanged) return
      if (!data.assignedZoneId) return

      if (debounceTimers.has(deviceId)) clearTimeout(debounceTimers.get(deviceId))
      debounceTimers.set(deviceId, setTimeout(() => {
        debounceTimers.delete(deviceId)
        publishCommand(deviceId, actuatorCache.get(deviceId))
      }, DEBOUNCE_MS))
    })
  })
}

// ─── Schedule-based automation ────────────────────────────────────────────────

const cronJobs       = new Map()   // Map<zoneId, CronTask[]>
const lastIrrTrigger = new Map()   // Map<deviceId, timestamp>
const COOLDOWN_MS    = 30 * 60 * 1000  // 30 minutes

// triggerActuator: reads current device state, merges one field, publishes.
// Calls publishCommand directly (no debounce) — schedule/threshold should fire immediately.
async function triggerActuator(zoneId, actuator, state) {
  const snap = await db.collection('devices')
    .where('assignedZoneId', '==', zoneId).limit(1).get()
  if (snap.empty) return

  const deviceId   = snap.docs[0].id
  const deviceData = snap.docs[0].data()

  const merged = {
    irrigationActive: actuator === 'irrigation' ? state : !!deviceData.irrigationActive,
    fertilizerActive: actuator === 'fertilizer' ? state : !!deviceData.fertilizerActive,
    lightActive:      actuator === 'light'      ? state : !!deviceData.lightActive,
  }

  // Update Firestore first so watchDeviceActuators sees matching values
  // and does not re-publish an opposite command after the cache sync.
  await db.collection('devices').doc(deviceId).update({
    irrigationActive: merged.irrigationActive,
    fertilizerActive: merged.fertilizerActive,
    lightActive:      merged.lightActive,
  })

  publishCommand(deviceId, merged)
}

// Schedule string parsers
// "07:00"        → "0 7 * * *"    (daily)
function dailyCron(timeStr) {
  const [h, m] = timeStr.trim().split(':').map(Number)
  return `${m} ${h} * * *`
}

// "08:00–18:00"  → { onCron, offCron }  (daily on/off)
function lightCron(schedStr) {
  const [on, off] = schedStr.split(/[–-]/).map(s => s.trim())
  const [oh, om]  = on.split(':').map(Number)
  const [fh, fm]  = off.split(':').map(Number)
  return { onCron: `${om} ${oh} * * *`, offCron: `${fm} ${fh} * * *` }
}

// "MON 06:00"    → "0 6 * * 1"    (weekly, specific day)
const DAY_MAP = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
function weeklyCron(schedStr) {
  const [day, time] = schedStr.trim().split(' ')
  const [h, m]      = time.split(':').map(Number)
  return `${m} ${h} * * ${DAY_MAP[day.toUpperCase()] ?? 1}`
}

function cancelCronJobs(zoneId) {
  cronJobs.get(zoneId)?.forEach(t => t.stop())
  cronJobs.set(zoneId, [])
}

function scheduleCronJobsForZone(zoneId, config) {
  cancelCronJobs(zoneId)
  const jobs = []

  try {
    if (config.autoWateringEnabled && config.wateringSchedule) {
      const expr = dailyCron(config.wateringSchedule)
      const waterDuration = (config.wateringDuration ?? 300) * 1000
      if (cron.validate(expr))
        jobs.push(cron.schedule(expr, async () => {
          await triggerActuator(zoneId, 'irrigation', true)
          setTimeout(() => triggerActuator(zoneId, 'irrigation', false), waterDuration)
        }))
    }

    if (config.autoLightingEnabled && config.lightingSchedule) {
      const { onCron, offCron } = lightCron(config.lightingSchedule)
      if (cron.validate(onCron))
        jobs.push(cron.schedule(onCron,  () => triggerActuator(zoneId, 'light', true)))
      if (cron.validate(offCron))
        jobs.push(cron.schedule(offCron, () => triggerActuator(zoneId, 'light', false)))
    }

    if (config.autoFertilizingEnabled && config.fertilizingSchedule) {
      const expr = weeklyCron(config.fertilizingSchedule)
      const fertDuration = (config.fertilizingDuration ?? 600) * 1000
      if (cron.validate(expr))
        jobs.push(cron.schedule(expr, async () => {
          await triggerActuator(zoneId, 'fertilizer', true)
          setTimeout(() => triggerActuator(zoneId, 'fertilizer', false), fertDuration)
        }))
    }
  } catch (e) {
    console.warn(`[MQTT bridge] invalid schedule for zone ${zoneId}:`, e.message)
  }

  cronJobs.set(zoneId, jobs)
  if (jobs.length > 0)
    console.log(`[MQTT bridge] ${jobs.length} cron job(s) scheduled for zone ${zoneId}`)
}

// ─── Firestore → cron: watch automationConfig for schedule changes ────────────
// First snapshot fires with all existing docs as 'added' — sets up jobs on startup.
// No MQTT commands are sent during initial load.
function watchAutomationConfig() {
  db.collection('automationConfig').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') {
        cancelCronJobs(change.doc.id)
        return
      }
      scheduleCronJobsForZone(change.doc.id, change.doc.data())
    })
  })
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init() {
  client = mqtt.connect({
    host:     BROKER,
    port:     BROKER_PORT,
    protocol: BROKER_PORT === 8883 ? 'mqtts' : 'mqtt',
    clientId: 'grownex-bridge',
    username: MQTT_USER,
    password: MQTT_PASS,
  })

  client.on('connect', () => {
    console.log(`[MQTT bridge] connected to ${BROKER}`)
    client.subscribe('grownex/+/sensors')
    client.subscribe('grownex/+/actuators/state')
    client.subscribe('grownex/+/status')
  })

  // Register Firestore listeners once — outside connect to prevent stacking on reconnect
  watchPlants()
  watchDeviceActuators()
  watchAutomationConfig()

  client.on('message', (topic, buf) => {
    const parts    = topic.split('/')   // ['grownex', deviceId, ...]
    const deviceId = parts[1]
    const raw      = buf.toString()

    if (parts[2] === 'status') {
      handleStatus(deviceId, raw)
      return
    }

    let payload
    try { payload = JSON.parse(raw) }
    catch { return }

    if (parts[2] === 'sensors')                                handleSensors(deviceId, payload)
    else if (parts[2] === 'actuators' && parts[3] === 'state') handleActuatorState(deviceId, payload)
  })

  client.on('error',     err => console.error('[MQTT bridge] error:', err.message))
  client.on('reconnect', ()  => console.log('[MQTT bridge] reconnecting...'))
}
