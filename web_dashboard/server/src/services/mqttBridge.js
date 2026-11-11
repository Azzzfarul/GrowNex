import mqtt from 'mqtt'
import cron from 'node-cron'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { notify } from './notifications.js'
import { runDailySummary } from './dailySummary.js'
import { saveZoneSnapshot } from './cameraSnapshots.js'

const BROKER      = process.env.MQTT_BROKER_HOST || 'broker.hivemq.com'
const DEVICE_SYNC_MS = 4 * 60 * 1000
const BROKER_PORT = parseInt(process.env.MQTT_BROKER_PORT || '1883')
const MQTT_USER   = process.env.MQTT_USER || ''
const MQTT_PASS   = process.env.MQTT_PASS || ''
const db          = getFirestore()

let client

// ─── Zone-alert notifications (fire only when status worsens) ─────────────────
const STATUS_RANK        = { unknown: 0, healthy: 1, attention: 2, critical: 3 }
const zoneStatusCache    = new Map()  // Map<zoneId, lastStatus>
const lastAlertAt        = new Map()  // Map<zoneId, timestamp>
const ALERT_COOLDOWN_MS  = 30 * 60 * 1000

async function maybeNotifyStatus(zoneId, newStatus, alertSummary) {
  const prev = zoneStatusCache.get(zoneId)
  zoneStatusCache.set(zoneId, newStatus)

  if (prev === undefined) return  // first status since restart — don't re-alert on every reboot
  if (!['attention', 'critical'].includes(newStatus)) return
  if ((STATUS_RANK[newStatus] ?? 0) <= (STATUS_RANK[prev] ?? 0)) return  // not worse

  const last = lastAlertAt.get(zoneId) ?? 0
  if (Date.now() - last < ALERT_COOLDOWN_MS) return
  lastAlertAt.set(zoneId, Date.now())

  const z = (await db.collection('zones').doc(zoneId).get()).data() ?? {}
  await notify({
    userId: z.userId,
    zoneId,
    zoneName: z.zoneName ?? null,
    type: 'threshold',
    severity: newStatus === 'critical' ? 'critical' : 'warn',
    title: newStatus === 'critical'
      ? `${z.zoneName ?? 'A zone'}: conditions critical`
      : `${z.zoneName ?? 'A zone'} needs attention`,
    message: alertSummary || 'Sensor readings are outside the preferred range.',
  })
}

// ─── Helper: get or create a device document using hardwareId as doc ID ───────
// Camera nodes (firmware_cam/) identify as ESP32CAM-<MAC>; sensor/relay nodes as ESP32-<MAC>.
// A camera is assigned via zones.cameraDeviceId, not zones.deviceId, but still sets
// devices.assignedZoneId — so never look up "the zone's device" by assignedZoneId alone.
const isCameraId = id => id.startsWith('ESP32CAM-')

async function getOrCreateDevice(deviceId) {
  const ref  = db.collection('devices').doc(deviceId)
  const snap = await ref.get()
  if (!snap.exists) {
    const camera = isCameraId(deviceId)
    // create(), not set(): a device's first messages (status, state, sensors) arrive together,
    // and a late set() would overwrite the doc — un-claiming it if the user claimed it meanwhile.
    const created = await ref.create({
      deviceName:          deviceId,
      deviceType:          camera ? 'camera' : 'indoor',
      status:              'online',
      assignedZoneId:      null,
      hasLightingModule:   false,
      hasFertilizerModule: false,
      totalSlots:          camera ? 0 : 4,
      userId:              '',
      lastSync:            FieldValue.serverTimestamp(),
    }).then(() => true, e => { if (e.code === 6) return false; throw e })  // 6 = ALREADY_EXISTS
    if (created) console.log(`[MQTT bridge] new device registered: ${deviceId}`)
    return (await ref.get()).data()
  }
  return snap.data()
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

  // Daily stats doc ID + hour key, UTC: "2024-01-15" / "14"
  const nowIso = new Date().toISOString()
  const statsDayId = nowIso.slice(0, 10)
  const statsHour = nowIso.slice(11, 13)

  const sensorFields = {
    temperature, humidity, lightLevel,
    soilMoisture1: soilMoisture1 ?? null,
    soilMoisture2: soilMoisture2 ?? null,
    soilMoisture3: soilMoisture3 ?? null,
    soilMoisture4: soilMoisture4 ?? null,
    moisture,
  }

  // After a restart the cache is empty until this zone's first write: fall back to the stored status.
  const prevStatus = zoneStatusCache.get(assignedZoneId) ??
    (await db.collection('zones').doc(assignedZoneId).get()).data()?.status
  const { status, alertSummary } = computeZoneStatus(sensorFields, plantCache.get(assignedZoneId), prevStatus)

  // History: one doc per UTC day, each hour's entry holding that hour's latest values, so 7 days of
  // charts cost 8 reads, not 168 (clients flatten it: zoneStats.js / ZoneService.getStats). The
  // merge is deep, and a failed DHT11 read sends null temperature/humidity: leave them out so the
  // hour keeps its last good ones. No raw per-reading docs: nothing read them.
  const stats = { ...sensorFields, timestamp: FieldValue.serverTimestamp() }
  if (temperature == null) delete stats.temperature
  if (humidity == null) delete stats.humidity

  // lastSync only backs "seen in the last 10 minutes" checks: refresh it at most every 4 minutes.
  const lastSyncMs = device.lastSync?.toMillis?.() ?? 0
  const deviceStale = device.status !== 'online' || Date.now() - lastSyncMs > DEVICE_SYNC_MS

  await Promise.all([
    db.collection('zones').doc(assignedZoneId)
      .collection('statsDaily').doc(statsDayId).set({ hours: { [statsHour]: stats } }, { merge: true }),

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
      ...(alertSummary != null ? { status, alertSummary } : { status }),
    }),

    deviceStale && db.collection('devices').doc(deviceId).update({
      status:   'online',
      lastSync: FieldValue.serverTimestamp(),
    }),
  ])

  console.log(`[MQTT bridge] sensor write → zone ${assignedZoneId}`)

  await maybeNotifyStatus(assignedZoneId, status, alertSummary)

  // ── Moisture threshold check (30-minute cooldown per device) ──────────────
  // From watchAutomationConfig's listener, not a read per reading. Until it has loaded, or after it
  // failed, read it directly: a missed check would delay watering by a whole reading interval.
  const cfg = automationConfigsReady
    ? automationConfigs.get(assignedZoneId)
    : (await db.collection('automationConfig').doc(assignedZoneId).get()).data()
  if (cfg) {
    if (cfg.autoWateringEnabled &&
        cfg.wateringThreshold != null &&
        moisture != null &&
        moisture < cfg.wateringThreshold) {
      // Also kept on the device doc, so a server restart doesn't water the same dry soil again right away.
      const last = lastIrrTrigger.get(deviceId) ?? device.lastAutoWateringAt?.toMillis() ?? 0
      if (Date.now() - last > COOLDOWN_MS) {
        lastIrrTrigger.set(deviceId, Date.now())
        await db.collection('devices').doc(deviceId).update({ lastAutoWateringAt: Timestamp.now() })
        // Like the cron jobs: the auto-off is scheduled even if the "on" reports an error — the
        // write may have committed anyway, and nothing else would ever switch the pump off.
        await fireActuator(assignedZoneId, 'irrigation', true)
        const waterDuration = (cfg.wateringDuration ?? 300) * 1000
        setTimeout(() => fireActuator(assignedZoneId, 'irrigation', false), waterDuration)
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
  const { assignedZoneId } = await getOrCreateDevice(deviceId)
  await db.collection('devices').doc(deviceId).update({ status })

  // Mirror device online/offline onto the assigned zone so zone cards
  // can hide stale sensor readings without fetching the device separately.
  // Cameras don't produce readings, so they must not flip deviceOnline.
  if (assignedZoneId && !isCameraId(deviceId)) {
    await db.collection('zones').doc(assignedZoneId).update({ deviceOnline: isOnline })
  }

  console.log(`[MQTT bridge] ${deviceId} → ${status}`)
}

// ─── Camera image handler ─────────────────────────────────────────────────────
// Topic: grownex/{deviceId}/camera
// Payload: raw JPEG bytes (not JSON), one per 4h bucket — see firmware_cam/
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

async function handleCameraImage(deviceId, buf) {
  if (!isCameraId(deviceId)) return
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf.length > MAX_IMAGE_BYTES) {
    console.warn(`[MQTT bridge] ${deviceId}: rejected camera payload (${buf.length} bytes, not a JPEG or too large)`)
    return
  }

  const { assignedZoneId } = await getOrCreateDevice(deviceId)
  await db.collection('devices').doc(deviceId).update({ lastSync: FieldValue.serverTimestamp() })
  if (!assignedZoneId) {
    console.log(`[MQTT bridge] ${deviceId}: photo from unassigned camera — ignored`)
    return
  }

  const { bucketId } = await saveZoneSnapshot(assignedZoneId, buf, deviceId)
  console.log(`[MQTT bridge] camera snapshot (${Math.round(buf.length / 1024)} KB) → zone ${assignedZoneId} / ${bucketId}`)
}

// ─── Actuator state handler ───────────────────────────────────────────────────
// Topic: grownex/{deviceId}/actuators/state
// Payload: { deviceId, lightState, fertilizerState, irrigationState, irrigationTimedOut?, fertilizerTimedOut? }
async function handleActuatorState(deviceId, payload) {
  const { lightState, fertilizerState, irrigationState } = payload
  const device = await getOrCreateDevice(deviceId)
  // Write to *Confirmed fields only — never copy the reported state into irrigationActive/
  // fertilizerActive/lightActive (those are user intent; overwriting them here causes a
  // watchDeviceActuators → publishCommand feedback loop via a debounce race condition).
  // The one exception, the safety-limit stop below, goes through triggerActuator, which syncs the cache.
  // The firmware re-sends its state with every reading: write only when something changed.
  if (device.irrigationConfirmed !== irrigationState || device.fertilizerConfirmed !== fertilizerState ||
      device.lightConfirmed !== lightState) {
    await db.collection('devices').doc(deviceId).update({
      irrigationConfirmed: irrigationState,
      fertilizerConfirmed: fertilizerState,
      lightConfirmed:      lightState,
    })
    console.log(`[MQTT bridge] actuator state confirmed for ${deviceId}`)
  }

  // The device stopped a pump at its safety limit (firmware/src/main.cpp) because no "off" came: a
  // restart mid-cycle lost the bridge's auto-off, or a manual toggle was left on. Make that the intent
  // too, so the app shows it off and the retained command says "off", which also releases the latch.
  for (const a of ['irrigation', 'fertilizer']) {
    if (!payload[`${a}TimedOut`] || !device.assignedZoneId) continue
    if (!device[`${a}Active`]) {
      // Already off in the app, yet still latched: the "off" never reached the device (e.g. the broker
      // lost the retained command), so the next "on" would be ignored. Send the stored intent again.
      publishCommand(deviceId, actuatorCache.get(deviceId) ?? device)  // the cache: newest intent we know
      continue
    }
    console.log(`[MQTT bridge] ${deviceId} stopped ${a} at its safety limit`)
    // On this device, whatever the zone doc says; throws on failure, and the next state report retries.
    const z = await triggerActuator(device.assignedZoneId, a, false, deviceId)
    await notify({
      userId: z.userId ?? device.userId,
      zoneId: device.assignedZoneId,
      zoneName: z.zoneName ?? null,
      type: 'actuator',
      severity: 'warn',
      always: true,  // a fault, not the routine activity a user may have muted
      title: `${ACTUATOR_LABEL[a]} stopped at its safety limit`,
      message: `${ACTUATOR_LABEL[a]} in ${z.zoneName ?? 'a zone'} ran too long without being switched off, so the device stopped it.`,
    })
  }
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
const ACTUATORS = ['irrigation', 'fertilizer', 'light']
const manualOns = new Map()  // Map<deviceId, Set<actuator>> switched on manually, waiting for the debounce

// The bridge's own intent writes whose Firestore echo hasn't come back yet. The echo can arrive before
// or after applyActuator syncs the cache, so it's recognised by its values, not by the cache.
const ownWrites = new Map()  // Map<deviceId, { intent, at }[]>
const sameIntent = (a, b) => ACTUATORS.every(x => !!a[`${x}Active`] === !!b[`${x}Active`])
function isOwnEcho(deviceId, data) {
  const writes = (ownWrites.get(deviceId) ?? []).filter(w => Date.now() - w.at < 5000)  // drop lost echoes
  const i = writes.findIndex(w => sameIntent(w.intent, data))
  ownWrites.set(deviceId, i >= 0 ? writes.slice(i + 1) : writes)
  return i >= 0
}

// A device that drops off silently still looks online until the broker gives up on it (~20 s), so a
// manual toggle can go to a dead device, and its retained "on" would fire whenever the device
// reconnects, maybe hours later. A manual "on" the device doesn't confirm within CONFIRM_MS is
// switched back off, with a warning. Automation isn't checked: a schedule that fires while the
// device is away should still run when it's back.
const CONFIRM_MS = 15000
const confirmTimers = new Map()  // Map<"deviceId/actuator", TimeoutId>

function expectConfirmation(deviceId, actuator) {
  const key = `${deviceId}/${actuator}`
  clearTimeout(confirmTimers.get(key))
  confirmTimers.set(key, setTimeout(() => {
    confirmTimers.delete(key)
    revertUnconfirmed(deviceId, actuator)
      .catch(e => console.error(`[MQTT bridge] ${deviceId} ${actuator} revert failed:`, e.message))
  }, CONFIRM_MS))
}

async function revertUnconfirmed(deviceId, a) {
  const d = (await db.collection('devices').doc(deviceId).get()).data()
  if (!d?.assignedZoneId || !d[`${a}Active`] || d[`${a}Confirmed`]) return
  console.log(`[MQTT bridge] ${deviceId} never confirmed ${a} on — switching it back off`)
  const z = await fireActuator(d.assignedZoneId, a, false, deviceId)
  if (!z) return  // still failing after the retries (logged)
  await notify({
    userId: z.userId ?? d.userId,
    zoneId: d.assignedZoneId,
    zoneName: z.zoneName ?? null,
    type: 'actuator',
    severity: 'warn',
    always: true,  // a fault, not the routine activity a user may have muted
    title: `${ACTUATOR_LABEL[a]} didn't turn on`,
    message: `The device in ${z.zoneName ?? 'a zone'} didn't respond, so ${ACTUATOR_LABEL[a].toLowerCase()} was switched back off. Check that it's online, then try again.`,
  })
}

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
      try {
        const zoneSnap = await db.collection('zones').doc(zoneId).get()
        if (!zoneSnap.exists) continue
        const zone = zoneSnap.data()
        const sensorFields = {
          temperature: zone.latestTemp    ?? null,
          humidity:    zone.latestHumid   ?? null,
          moisture:    zone.latestMoisture ?? null,
        }
        const { status, alertSummary } = computeZoneStatus(sensorFields, plantCache.get(zoneId), zoneStatusCache.get(zoneId) ?? zone.status)
        await db.collection('zones').doc(zoneId).update(
          alertSummary != null ? { status, alertSummary } : { status }
        )
        await maybeNotifyStatus(zoneId, status, alertSummary)
        console.log(`[MQTT bridge] recomputed alertSummary for zone ${zoneId} after plant change`)
      } catch (e) {
        console.error(`[MQTT bridge] status recompute failed for zone ${zoneId}:`, e.message)
      }
    }
  }, err => console.error('[MQTT bridge] plants listener stopped:', err.message))
}

// prevStatus: the zone's last computed status, used when a reading is incomplete (see below).
export function computeZoneStatus(sensorFields, plants, prevStatus) {
  if (!plants || plants.length === 0) return { status: 'unknown', alertSummary: null }

  const avg = field => {
    const vals = plants.map(p => p[field]).filter(v => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const { temperature, humidity, moisture } = sensorFields
  const issues = []
  const missing = []  // metrics the plants have a range for but this reading lacks (e.g. a failed DHT11 read)

  const check = (val, min, max, label, unit) => {
    if (min == null || max == null) return
    if (val == null) { missing.push(label.toLowerCase()); return }
    const v = Math.round(val * 10) / 10  // moisture is an average, e.g. 41.666…
    if (val < min) issues.push(`${label} too low (${v}${unit}, ideal ≥ ${min.toFixed(1)}${unit})`)
    else if (val > max) issues.push(`${label} too high (${v}${unit}, ideal ≤ ${max.toFixed(1)}${unit})`)
  }

  check(temperature, avg('preferredTemperatureMin'), avg('preferredTemperatureMax'), 'Temperature', '°C')
  check(humidity,    avg('preferredHumidityMin'),    avg('preferredHumidityMax'),    'Humidity',    '%')
  check(moisture,    avg('preferredMoistureMin'),    avg('preferredMoistureMax'),    'Moisture',    '%')

  let result
  if (issues.length === 0)      result = { status: 'healthy',   alertSummary: 'All conditions are within preferred range.' }
  else if (issues.length === 1) result = { status: 'attention', alertSummary: issues[0] }
  else                          result = { status: 'critical',  alertSummary: `${issues.length} conditions out of range: ${issues.join('; ')}` }

  if (!missing.length) return result
  // An incomplete reading can't show the zone recovered: keep a worse previous status, so each
  // missed DHT11 read doesn't flip it and re-alert. The summary says what's missing.
  const kept = (STATUS_RANK[prevStatus] ?? 0) > STATUS_RANK[result.status]
  return {
    status: kept ? prevStatus : result.status,
    alertSummary: `No ${missing.join(' or ')} reading${kept ? ', so the last status is kept' : ''}. ` +
      (issues.length ? `${issues.join('; ')}.` : 'The other conditions are within preferred range.'),
  }
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
      snapshot.docs.forEach(d => switchOffIfNoZone(d.id, d.data()))
      reconcileCommands()
      return
    }

    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') { switchOffIfNoZone(change.doc.id, null); return }

      const deviceId = change.doc.id
      const data     = change.doc.data()
      const cached   = actuatorCache.get(deviceId) ?? {}

      const changed = ACTUATORS.filter(a => cached[`${a}Active`] !== !!data[`${a}Active`])

      actuatorCache.set(deviceId, {
        irrigationActive: !!data.irrigationActive,
        fertilizerActive: !!data.fertilizerActive,
        lightActive:      !!data.lightActive,
      })

      // The bridge's own write coming back (applyActuator already published it): not a manual toggle.
      if (isOwnEcho(deviceId, data)) return
      if (!data.assignedZoneId) { switchOffIfNoZone(deviceId, data); return }
      if (!changed.length) return

      const ons = manualOns.get(deviceId) ?? new Set()
      for (const a of changed) data[`${a}Active`] ? ons.add(a) : ons.delete(a)
      manualOns.set(deviceId, ons)

      if (debounceTimers.has(deviceId)) clearTimeout(debounceTimers.get(deviceId))
      debounceTimers.set(deviceId, setTimeout(() => {
        debounceTimers.delete(deviceId)
        publishCommand(deviceId, actuatorCache.get(deviceId))
        for (const a of manualOns.get(deviceId) ?? []) expectConfirmation(deviceId, a)
        manualOns.delete(deviceId)
      }, DEBOUNCE_MS))
    })
  }, err => console.error('[MQTT bridge] devices listener stopped:', err.message))
}

// A sensor board without a zone has nothing that may run it: its zone's schedules are gone, and
// nothing here sends it commands. So when it loses its zone (removed from it, zone deleted) or its
// doc is deleted (device or account deleted), switch everything off, or its last retained command
// (say, the grow light on) would stay in force with no way left to stop it.
// data: the device doc, or null once it's deleted.
const ALL_OFF = { irrigationActive: false, fertilizerActive: false, lightActive: false }
function switchOffIfNoZone(deviceId, data) {
  if (isCameraId(deviceId) || data?.assignedZoneId) return
  const intent = data ?? actuatorCache.get(deviceId) ?? {}
  if (!ACTUATORS.some(a => intent[`${a}Active`])) return
  console.log(`[MQTT bridge] ${deviceId} ${data ? 'has no zone' : 'was deleted'} — switching everything off`)
  publishCommand(deviceId, ALL_OFF)  // syncs the cache first, so the write's echo below is no change
  if (data) {
    db.collection('devices').doc(deviceId).update(ALL_OFF)
      .catch(e => console.error(`[MQTT bridge] ${deviceId} intent reset failed:`, e.message))
  }
}

// ─── Startup: re-send intent that changed while the bridge was down ──────────
// Nothing publishes those changes, so the broker still holds an older retained command, which a
// device applies on its next reconnect. On (re)subscribe the broker hands us every retained command:
// compare each with the stored intent once the cache is loaded, and re-send the intent where they differ.
// shortcut: a device that has never been sent a command has none retained, so it isn't checked.
const retainedCommands = new Map()  // Map<deviceId, command> waiting for the cache

function reconcileCommands() {
  if (!devicesListenerInitialized) return  // runs again once the cache is loaded
  for (const [deviceId, cmd] of retainedCommands) {
    retainedCommands.delete(deviceId)
    const want = actuatorCache.get(deviceId)
    if (!cmd || typeof cmd !== 'object') continue
    if (!want) {
      // No device doc: deleted while the bridge was down, so nothing switched the board off.
      if (!isCameraId(deviceId) && ['irrigationState', 'fertilizerState', 'lightState'].some(k => cmd[k])) {
        console.log(`[MQTT bridge] ${deviceId} has no device doc but a retained "on" — switching everything off`)
        publishCommand(deviceId, ALL_OFF)
      }
      continue
    }
    if (cmd.irrigationState === want.irrigationActive &&
        cmd.fertilizerState === want.fertilizerActive &&
        cmd.lightState      === want.lightActive) continue
    console.log(`[MQTT bridge] ${deviceId}: broker's command is stale, re-sending stored intent`)
    publishCommand(deviceId, want)
  }
}

// ─── Schedule-based automation ────────────────────────────────────────────────

const cronJobs       = new Map()   // Map<zoneId, CronTask[]>
const lastIrrTrigger = new Map()   // Map<deviceId, timestamp>
const COOLDOWN_MS    = 30 * 60 * 1000  // 30 minutes
const ACTUATOR_LABEL = { irrigation: 'Irrigation', fertilizer: 'Fertilizer', light: 'Grow light' }

// triggerActuator: reads current device state, merges one field, publishes.
// Calls publishCommand directly (no debounce) — schedule/threshold should fire immediately.
// Runs one at a time per zone: same-minute schedules (e.g. light 06:00 + fertilizer MON 06:00)
// would otherwise each read the old state and overwrite each other's change.
const actuatorQueues = new Map()  // Map<zoneId, Promise>
function triggerActuator(zoneId, actuator, state, onDevice = null) {
  return enqueue(actuatorQueues, zoneId, () => applyActuator(zoneId, actuator, state, onDevice))
}

// Runs fn once every earlier fn queued under the same key has settled.
// shortcut: in-process queue, fine while only one bridge runs (the MQTT client ID already forces that).
function enqueue(queues, key, fn) {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(fn)
  queues.set(key, run)
  return run
}

// onDevice: act on that device rather than the zone's relay node (zones.deviceId), for fixes that must
// reach the device that reported, whatever the zone doc says. Resolves with the zone's data.
async function applyActuator(zoneId, actuator, state, onDevice = null) {
  // Use zones.deviceId (the relay node) — a camera in the same zone shares assignedZoneId.
  const z = (await db.collection('zones').doc(zoneId).get()).data() ?? {}
  const deviceId = onDevice ?? z.deviceId
  if (!deviceId) return z
  const deviceSnap = await db.collection('devices').doc(deviceId).get()
  if (!deviceSnap.exists) return z

  const deviceData = deviceSnap.data()

  // Only switch something on for a board whose own record points back at this zone. A zone can
  // outlive its link (board removed or deleted, zone being deleted, an assign half done), and a
  // stale pointer must not run a board that may now be someone else's. Off is always allowed.
  if (state && deviceData.assignedZoneId !== zoneId) {
    console.warn(`[MQTT bridge] not switching ${actuator} on: ${deviceId} isn't assigned to zone ${zoneId}`)
    return z
  }

  const merged = {
    irrigationActive: actuator === 'irrigation' ? state : !!deviceData.irrigationActive,
    fertilizerActive: actuator === 'fertilizer' ? state : !!deviceData.fertilizerActive,
    lightActive:      actuator === 'light'      ? state : !!deviceData.lightActive,
  }

  // The bridge now owns this actuator's state: a manual "on" waiting for confirmation no longer applies.
  clearTimeout(confirmTimers.get(`${deviceId}/${actuator}`))
  confirmTimers.delete(`${deviceId}/${actuator}`)

  // Recorded before the write, since its Firestore echo can beat update() back: watchDeviceActuators
  // then knows it's ours, so it neither re-publishes it nor treats it as a manual toggle. Not when
  // nothing changes: such a write may have no echo, and the leftover would swallow the user's next
  // toggle back to these values.
  const own = { intent: merged, at: Date.now() }
  if (!sameIntent(merged, deviceData)) ownWrites.set(deviceId, [...(ownWrites.get(deviceId) ?? []), own])
  try {
    await db.collection('devices').doc(deviceId).update({
      irrigationActive: merged.irrigationActive,
      fertilizerActive: merged.fertilizerActive,
      lightActive:      merged.lightActive,
    })
  } catch (e) {
    ownWrites.set(deviceId, (ownWrites.get(deviceId) ?? []).filter(w => w !== own))
    throw e
  }

  publishCommand(deviceId, merged)

  // Notify on the "started" event only (automation-driven — manual toggles never
  // call triggerActuator; the auto-off setTimeout passes state=false).
  if (state === true) {
    await notify({
      userId: z.userId,
      zoneId,
      zoneName: z.zoneName ?? null,
      type: 'actuator',
      severity: 'info',
      title: `${ACTUATOR_LABEL[actuator] ?? actuator} started`,
      message: `${ACTUATOR_LABEL[actuator] ?? actuator} turned on in ${z.zoneName ?? 'a zone'}.`,
    })
  }
  return z
}

// For timers and cron callbacks, where nothing awaits the promise — an unhandled
// rejection there would crash the whole bridge.
// A failed "off" is retried: the last retained command is "on", so nothing else would stop it.
const OFF_RETRIES = 3
const OFF_RETRY_MS = 5000
// Resolves with the zone's data, or undefined if it failed for good.
async function fireActuator(zoneId, actuator, state, onDevice = null, attempt = 1) {
  try {
    return await triggerActuator(zoneId, actuator, state, onDevice)
  } catch (e) {
    console.error(`[MQTT bridge] ${actuator} ${state ? 'on' : 'off'} failed for zone ${zoneId}:`, e.message)
    if (state || attempt > OFF_RETRIES) return
    await new Promise(r => setTimeout(r, OFF_RETRY_MS))
    console.log(`[MQTT bridge] retrying ${actuator} off for zone ${zoneId} (${attempt}/${OFF_RETRIES})`)
    return fireActuator(zoneId, actuator, state, onDevice, attempt + 1)
  }
}

// Schedule string parsers
// "07:00"        → "0 7 * * *"    (daily)
export function dailyCron(timeStr) {
  const [h, m] = timeStr.trim().split(':').map(Number)
  return `${m} ${h} * * *`
}

// "08:00–18:00"  → { onCron, offCron }  (daily on/off)
export function lightCron(schedStr) {
  const [on, off] = schedStr.split(/[–-]/).map(s => s.trim())
  const [oh, om]  = on.split(':').map(Number)
  const [fh, fm]  = off.split(':').map(Number)
  return { onCron: `${om} ${oh} * * *`, offCron: `${fm} ${fh} * * *` }
}

// "MON 06:00"    → "0 6 * * 1"    (weekly, specific day)
const DAY_MAP = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
export function weeklyCron(schedStr) {
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
          await fireActuator(zoneId, 'irrigation', true)
          setTimeout(() => fireActuator(zoneId, 'irrigation', false), waterDuration)
        }))
    }

    if (config.autoLightingEnabled && config.lightingSchedule) {
      const { onCron, offCron } = lightCron(config.lightingSchedule)
      if (cron.validate(onCron))
        jobs.push(cron.schedule(onCron,  () => fireActuator(zoneId, 'light', true)))
      if (cron.validate(offCron))
        jobs.push(cron.schedule(offCron, () => fireActuator(zoneId, 'light', false)))
    }

    if (config.autoFertilizingEnabled && config.fertilizingSchedule) {
      const expr = weeklyCron(config.fertilizingSchedule)
      const fertDuration = (config.fertilizingDuration ?? 600) * 1000
      if (cron.validate(expr))
        jobs.push(cron.schedule(expr, async () => {
          await fireActuator(zoneId, 'fertilizer', true)
          setTimeout(() => fireActuator(zoneId, 'fertilizer', false), fertDuration)
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
const automationConfigs = new Map()  // Map<zoneId, config>, for handleSensors' threshold check
let automationConfigsReady = false   // false until the first snapshot, and again if the listener fails

function watchAutomationConfig() {
  db.collection('automationConfig').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'removed') {
        automationConfigs.delete(change.doc.id)
        cancelCronJobs(change.doc.id)
        return
      }
      automationConfigs.set(change.doc.id, change.doc.data())
      scheduleCronJobsForZone(change.doc.id, change.doc.data())
    })
    automationConfigsReady = true
  }, err => {
    automationConfigsReady = false  // handleSensors falls back to reading the config itself
    console.error('[MQTT bridge] automationConfig listener stopped:', err.message)
  })
}

// ─── Init ─────────────────────────────────────────────────────────────────────
const deviceQueues = new Map()  // Map<deviceId, Promise>

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
    client.subscribe('grownex/+/camera')
    client.subscribe('grownex/+/actuators/command')  // only its retained copies are used: reconcileCommands
  })

  // Register Firestore listeners once — outside connect to prevent stacking on reconnect
  watchPlants()
  watchDeviceActuators()
  watchAutomationConfig()

  // Nightly per-user summary notification
  const summaryCron = process.env.DAILY_SUMMARY_CRON || '0 20 * * *'
  const summaryTz   = process.env.DAILY_SUMMARY_TZ   || 'Asia/Kuala_Lumpur'
  if (cron.validate(summaryCron)) {
    cron.schedule(summaryCron, () => {
      runDailySummary().catch(e => console.error('[daily summary] failed:', e.message))
    }, { timezone: summaryTz })
    console.log(`[MQTT bridge] daily summary scheduled: "${summaryCron}" (${summaryTz})`)
  } else {
    console.warn(`[MQTT bridge] invalid DAILY_SUMMARY_CRON: "${summaryCron}"`)
  }

  client.on('message', (topic, buf, packet) => {
    const parts    = topic.split('/')   // ['grownex', deviceId, ...]
    const deviceId = parts[1]

    if (parts[2] === 'camera') {  // binary JPEG — handle before any toString()
      handleCameraImage(deviceId, buf)
        .catch(e => console.error(`[MQTT bridge] ${deviceId} camera upload failed:`, e.message))
      return
    }

    const raw = buf.toString()

    // A device's status/state messages are applied in arrival order: a quick reconnect delivers the
    // old session's "offline" will right before "online", and parallel handlers can land them swapped.
    if (parts[2] === 'status') {
      enqueue(deviceQueues, deviceId, () => handleStatus(deviceId, raw))
        .catch(e => console.error(`[MQTT bridge] ${deviceId} status update failed:`, e.message))
      return
    }

    let payload
    try { payload = JSON.parse(raw) }
    catch { return }

    // Unhandled rejections crash the bridge (e.g. update() on a device deleted mid-handler)
    if (parts[2] === 'sensors') {
      handleSensors(deviceId, payload)
        .catch(e => console.error(`[MQTT bridge] ${deviceId} sensor write failed:`, e.message))
    } else if (parts[2] === 'actuators' && parts[3] === 'state') {
      enqueue(deviceQueues, deviceId, () => handleActuatorState(deviceId, payload))
        .catch(e => console.error(`[MQTT bridge] ${deviceId} actuator state failed:`, e.message))
    } else if (parts[2] === 'actuators' && parts[3] === 'command' && packet.retain) {
      retainedCommands.set(deviceId, payload)  // live echoes of our own publishes aren't retained-flagged
      reconcileCommands()
    }
  })

  client.on('error',     err => console.error('[MQTT bridge] error:', err.message))
  client.on('reconnect', ()  => console.log('[MQTT bridge] reconnecting...'))
}
