import mqtt from 'mqtt'
import cron from 'node-cron'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const BROKER      = process.env.MQTT_BROKER_HOST || 'broker.hivemq.com'
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
// Payload: { deviceId, temperature, humidity, lightLevel, moisture }
async function handleSensors(deviceId, payload) {
  const { temperature, humidity, lightLevel, moisture } = payload

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

  const reading = { moisture, temperature, humidity, lightLevel,
                    timestamp: FieldValue.serverTimestamp() }

  await Promise.all([
    db.collection('zones').doc(assignedZoneId)
      .collection('sensorReadings').add(reading),

    db.collection('zones').doc(assignedZoneId).update({
      latestMoisture:  moisture,
      latestTemp:      temperature,
      latestHumid:     humidity,
      latestLight:     lightLevel,
      latestTimestamp: FieldValue.serverTimestamp(),
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
        moisture < cfg.wateringThreshold) {
      const last = lastIrrTrigger.get(deviceId) ?? 0
      if (Date.now() - last > COOLDOWN_MS) {
        lastIrrTrigger.set(deviceId, Date.now())
        await triggerActuator(assignedZoneId, 'irrigation', true)
        console.log(`[MQTT bridge] threshold trigger → ${deviceId} (moisture ${moisture}% < ${cfg.wateringThreshold}%)`)
      }
    }
  }
}

// ─── Status handler ───────────────────────────────────────────────────────────
// Topic: grownex/{deviceId}/status  — payload: "online" or "offline" (LWT)
async function handleStatus(deviceId, payload) {
  const status = payload === 'online' ? 'online' : 'offline'
  await db.collection('devices').doc(deviceId).update({ status })
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
      if (cron.validate(expr))
        jobs.push(cron.schedule(expr, () => triggerActuator(zoneId, 'irrigation', true)))
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
      if (cron.validate(expr))
        jobs.push(cron.schedule(expr, () => triggerActuator(zoneId, 'fertilizer', true)))
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
