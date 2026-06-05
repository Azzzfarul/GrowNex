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

// ─── Firestore → MQTT: push automationConfig changes to device ────────────────
// Watches automationConfig/{zoneId} — when automation toggles change, send command
function watchAutomationConfig() {
  db.collection('automationConfig').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'removed') return

      const zoneId = change.doc.id
      const { autoLightingEnabled, autoFertilizingEnabled, autoWateringEnabled }
        = change.doc.data()

      // Find device assigned to this zone — doc ID is the hardware ID (ESP32-XXXX)
      const deviceSnap = await db.collection('devices')
        .where('assignedZoneId', '==', zoneId).limit(1).get()
      if (deviceSnap.empty) return

      const hardwareId = deviceSnap.docs[0].id  // doc ID = ESP32-XXXX

      const command = JSON.stringify({
        lightState:      !!autoLightingEnabled,
        fertilizerState: !!autoFertilizingEnabled,
        irrigationState: !!autoWateringEnabled,
      })

      const topic = `grownex/${hardwareId}/actuators/command`
      client.publish(topic, command, { retain: true })
      console.log(`[MQTT bridge] command → ${topic}: ${command}`)
    })
  })
}

// ─── Firestore → MQTT: push manual actuator control changes to device ────────
// Uses a cache to detect real value changes and avoid looping with handleActuatorState.
// The first onSnapshot callback delivers all existing docs as 'added' — used to
// populate the cache without sending any MQTT commands (prevents startup spam).
const actuatorCache = new Map()  // Map<deviceId, { irrigationActive, fertilizerActive, lightActive }>
let devicesListenerInitialized = false

function watchDeviceActuators() {
  db.collection('devices').onSnapshot(snapshot => {
    if (!devicesListenerInitialized) {
      // Populate cache from initial state; do not publish any MQTT commands
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

      // Always update cache regardless of whether we publish
      actuatorCache.set(deviceId, {
        irrigationActive: !!data.irrigationActive,
        fertilizerActive: !!data.fertilizerActive,
        lightActive:      !!data.lightActive,
      })

      // Ignore changes unrelated to actuator fields (sensor reads, timestamps, etc.)
      if (!irrigationChanged && !fertilizerChanged && !lightChanged) return

      // Skip unassigned devices — no zone means no ESP32 to command
      if (!data.assignedZoneId) return

      const command = JSON.stringify({
        irrigationState: !!data.irrigationActive,
        fertilizerState: !!data.fertilizerActive,
        lightState:      !!data.lightActive,
      })

      const topic = `grownex/${deviceId}/actuators/command`
      client.publish(topic, command, { retain: true })
      console.log(`[MQTT bridge] manual command → ${topic}: ${command}`)
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
    watchAutomationConfig()
    watchDeviceActuators()
  })

  client.on('message', (topic, buf) => {
    let payload
    try { payload = JSON.parse(buf.toString()) }
    catch { return }

    const parts = topic.split('/')     // ['grownex', deviceId, ...]
    const deviceId = parts[1]

    if (parts[2] === 'sensors')                        handleSensors(deviceId, payload)
    else if (parts[2] === 'actuators' && parts[3] === 'state') handleActuatorState(deviceId, payload)
  })

  client.on('error', err => console.error('[MQTT bridge] error:', err.message))
  client.on('reconnect', ()  => console.log('[MQTT bridge] reconnecting...'))
}
