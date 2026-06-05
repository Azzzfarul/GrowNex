import mqtt from 'mqtt'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883'
const db = getFirestore()

let client

// ─── Helper: get or create a device document using hardwareId as doc ID ───────
async function getOrCreateDevice(deviceId) {
  const ref = db.collection('devices').doc(deviceId)
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
    // Device exists but isn't assigned to a zone yet — still mark it online
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
    // New sensor reading document — matches SensorReading.fromMap() field names
    db.collection('zones').doc(assignedZoneId)
      .collection('sensorReadings').add(reading),

    // Mirror latest values on zone document — matches ZoneModel latestXxx fields
    db.collection('zones').doc(assignedZoneId).update({
      latestMoisture:  moisture,
      latestTemp:      temperature,
      latestHumid:     humidity,
      latestLight:     lightLevel,
      latestTimestamp: FieldValue.serverTimestamp(),
    }),

    // Mark device online and record sync time
    db.collection('devices').doc(deviceId).update({
      status:   'online',
      lastSync: FieldValue.serverTimestamp(),
    }),
  ])

  console.log(`[MQTT bridge] sensor write → zone ${assignedZoneId}`)
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
  await db.collection('devices').doc(deviceId).update({
    lightActive:      lightState,
    fertilizerActive: fertilizerState,
    irrigationActive: irrigationState,
  })
  console.log(`[MQTT bridge] actuator state saved for ${deviceId}`)
}

// ─── Firestore → MQTT: push manual actuator control changes to device ────────
// Uses a cache to detect real value changes and avoid looping with handleActuatorState.
// The first onSnapshot callback delivers all existing docs as 'added' — used to
// populate the cache without sending any MQTT commands (prevents startup spam).
const actuatorCache  = new Map()  // Map<deviceId, { irrigationActive, fertilizerActive, lightActive }>
const debounceTimers = new Map()  // Map<deviceId, TimeoutId>
const DEBOUNCE_MS    = 600        // wait 600ms after last click before sending command
let devicesListenerInitialized = false

function publishCommand(deviceId, data) {
  const command = JSON.stringify({
    irrigationState: !!data.irrigationActive,
    fertilizerState: !!data.fertilizerActive,
    lightState:      !!data.lightActive,
  })
  const topic = `grownex/${deviceId}/actuators/command`
  client.publish(topic, command, { retain: true })
  console.log(`[MQTT bridge] manual command → ${topic}: ${command}`)
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

      // Debounce — cancel any pending publish for this device and restart the timer
      if (debounceTimers.has(deviceId)) clearTimeout(debounceTimers.get(deviceId))
      debounceTimers.set(deviceId, setTimeout(() => {
        debounceTimers.delete(deviceId)
        publishCommand(deviceId, actuatorCache.get(deviceId))
      }, DEBOUNCE_MS))
    })
  })
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init() {
  client = mqtt.connect(BROKER, { clientId: 'grownex-bridge' })

  client.on('connect', () => {
    console.log(`[MQTT bridge] connected to ${BROKER}`)
    client.subscribe('grownex/+/sensors')
    client.subscribe('grownex/+/actuators/state')
    client.subscribe('grownex/+/status')
  })

  watchDeviceActuators()  // register once — outside connect to prevent stacking on reconnect


  client.on('message', (topic, buf) => {
    const parts = topic.split('/')     // ['grownex', deviceId, ...]
    const deviceId = parts[1]
    const raw = buf.toString()

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

  client.on('error', err => console.error('[MQTT bridge] error:', err.message))
  client.on('reconnect', ()  => console.log('[MQTT bridge] reconnecting...'))
}
