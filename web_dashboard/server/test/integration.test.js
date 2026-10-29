// End-to-end test of the real server (REST API + MQTT bridge + nightly job) against the
// Firebase emulators and an in-process MQTT broker. Never touches the live project or devices.
//   npm run test:integration      (needs Java for the emulators; takes ~2-3 minutes)
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Aedes } from 'aedes'
import mqtt from 'mqtt'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getStorage } from 'firebase-admin/storage'

const PROJECT = 'demo-grownex'           // "demo-" projects can only ever reach emulators
const BUCKET  = `${PROJECT}.appspot.com`
const EMULATED = !!(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST)
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))
const API_PORT = 5055
const BROKER_PORT = 18830

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, msg, timeout = 10000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch (e) { last = e }
    await sleep(100)
  }
  throw new Error(`timed out waiting for: ${msg}${last ? ` (${last.message})` : ''}`)
}

describe('server against emulators', { skip: !EMULATED && 'run via npm run test:integration' }, () => {
  let db, auth, bucket, broker, brokerServer, device, server
  let logs = []
  const commands = []   // { deviceId, state, at }
  const users = {}      // name → { uid, token }
  const ids = {}

  const startServer = async () => {
    logs = []
    server = spawn(process.execPath, ['src/index.js'], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: BUCKET,
        FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
        MQTT_BROKER_HOST: '127.0.0.1', MQTT_BROKER_PORT: String(BROKER_PORT), MQTT_USER: '', MQTT_PASS: '',
        OPENROUTER_API_KEY: '',             // AI routes must use their fallbacks
        DAILY_SUMMARY_CRON: '0 0 1 1 *',     // the test runs the nightly job itself
      },
    })
    server.stdout.on('data', d => logs.push(...d.toString().split('\n')))
    server.stderr.on('data', d => logs.push(...d.toString().split('\n')))
    await waitFor(() => fetch(`http://127.0.0.1:${API_PORT}/api/health`).then(r => r.ok), 'server health', 20000)
    await waitForLog(/connected to 127\.0\.0\.1/)
    await waitForLog(/device actuator cache initialized/)
  }
  const stopServer = async () => {
    if (!server || server.exitCode != null) return
    const exited = new Promise(r => server.once('exit', r))
    server.kill('SIGTERM')
    await exited
  }
  const waitForLog = (re, timeout) => waitFor(() => logs.some(l => re.test(l)), `log ${re}`, timeout)

  const api = (path, { token, method = 'GET', body } = {}) =>
    fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

  const signUp = async (name) => {
    const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}@test.local`, password: 'secret123', returnSecureToken: true }),
    })
    const j = await res.json()
    users[name] = { uid: j.localId, token: j.idToken }
  }

  const publish = (topic, payload, opts = {}) =>
    device.publishAsync(topic, Buffer.isBuffer(payload) || typeof payload === 'string' ? payload : JSON.stringify(payload), opts)
  const sensors = (deviceId, values) => publish(`grownex/${deviceId}/sensors`, { deviceId, ...values })
  const commandsFor = (deviceId, since = 0) => commands.filter(c => c.deviceId === deviceId && c.at >= since)
  const docData = async (path) => (await db.doc(path).get()).data()
  const notifs = async (uid, type) =>
    (await db.collection('notifications').where('userId', '==', uid).get()).docs
      .map(d => d.data()).filter(n => !type || n.type === type)

  before(async () => {
    initializeApp({ projectId: PROJECT, storageBucket: BUCKET })
    db = getFirestore(); auth = getAuth(); bucket = getStorage().bucket()

    broker = await Aedes.createBroker()
    brokerServer = createServer(broker.handle)
    await new Promise(r => brokerServer.listen(BROKER_PORT, '127.0.0.1', r))

    // A fake device fleet on the same broker; it also records every command the bridge sends.
    device = await mqtt.connectAsync(`mqtt://127.0.0.1:${BROKER_PORT}`, { clientId: 'test-devices' })
    await device.subscribeAsync('grownex/+/actuators/command')
    device.on('message', (topic, buf) => {
      commands.push({ deviceId: topic.split('/')[1], state: JSON.parse(buf.toString()), at: Date.now() })
    })

    await startServer()
    await signUp('alice')
    await signUp('bob')
  })

  after(async () => {
    await stopServer()
    await device?.endAsync()
    await new Promise(r => broker ? broker.close(r) : r())
    brokerServer?.close()
  })

  test('health is public; every other route needs a valid token', async () => {
    assert.deepEqual(await (await api('/api/health')).json(), { status: 'ok' })
    assert.equal((await api('/api/zones')).status, 401)
    assert.equal((await api('/api/zones', { token: 'garbage' })).status, 401)
  })

  test('register creates the user profile doc', async () => {
    const res = await api('/api/auth/register', { token: users.alice.token, method: 'POST', body: { username: 'alice', email: 'alice@test.local' } })
    assert.equal(res.status, 201)
    assert.equal((await docData(`users/${users.alice.uid}`)).username, 'alice')
  })

  test('first MQTT message auto-creates an unclaimed device of the right type', async () => {
    for (const id of ['ESP32-T1', 'ESP32CAM-T1', 'ESP32-T2', 'ESP32-LONER'])
      await publish(`grownex/${id}/status`, 'online', { retain: true })
    const sensor = await waitFor(() => docData('devices/ESP32-T1'), 'ESP32-T1 created')
    assert.equal(sensor.userId, '')
    assert.equal(sensor.deviceType, 'indoor')
    assert.equal(sensor.status, 'online')
    const cam = await waitFor(() => docData('devices/ESP32CAM-T1'), 'camera created')
    assert.equal(cam.deviceType, 'camera')
    assert.equal(cam.totalSlots, 0)
    await waitFor(() => docData('devices/ESP32-LONER'), 'loner created')
  })

  test('a burst of first messages registers a device once and never undoes a claim', async () => {
    const id = 'ESP32-BURST'
    await Promise.all([
      publish(`grownex/${id}/status`, 'online', { retain: true }),
      publish(`grownex/${id}/actuators/state`, { deviceId: id, irrigationState: false, fertilizerState: false, lightState: false }),
      sensors(id, { temperature: 20, humidity: 50, lightLevel: 0, soilMoisture1: 50 }),
      sensors(id, { temperature: 20, humidity: 50, lightLevel: 0, soilMoisture1: 50 }),
    ])
    await waitFor(() => docData(`devices/${id}`), 'burst device created')
    await db.doc(`devices/${id}`).update({ userId: users.bob.uid })  // claimed right away
    await sleep(1500)
    assert.equal(logs.filter(l => l.includes(`new device registered: ${id}`)).length, 1)
    assert.equal((await docData(`devices/${id}`)).userId, users.bob.uid, 'claim survived')
  })

  test('a claimed, assigned device writes readings, hourly stats and zone status', async () => {
    const uid = users.alice.uid
    // What the web client does on claim + assign + add plants
    const zoneRef = db.collection('zones').doc()
    ids.zoneA = zoneRef.id
    await zoneRef.set({ userId: uid, zoneName: 'Herbs', zoneType: 'indoor', deviceId: 'ESP32-T1',
      cameraDeviceId: 'ESP32CAM-T1', totalPlantSlots: 4, createdAt: FieldValue.serverTimestamp() })
    await db.doc('devices/ESP32-T1').update({ userId: uid, assignedZoneId: ids.zoneA })
    await db.doc('devices/ESP32CAM-T1').update({ userId: uid, assignedZoneId: ids.zoneA })
    const basil = await db.collection('plants').add({ zoneId: ids.zoneA, plantName: 'Basil', slotNumber: 1,
      preferredMoistureMin: 45, preferredMoistureMax: 70, preferredTemperatureMin: 20, preferredTemperatureMax: 30,
      preferredHumidityMin: 40, preferredHumidityMax: 80 })
    ids.basil = basil.id
    await db.collection('plants').add({ zoneId: ids.zoneA, plantName: 'Mint', slotNumber: 2,
      preferredMoistureMin: 55, preferredMoistureMax: 75, preferredTemperatureMin: 18, preferredTemperatureMax: 28,
      preferredHumidityMin: 50, preferredHumidityMax: 80 })
    await waitForLog(new RegExp(`recomputed alertSummary for zone ${ids.zoneA}`))

    await sensors('ESP32-T1', { temperature: 25, humidity: 60, lightLevel: 0, soilMoisture1: 60, soilMoisture2: 64 })
    const zone = await waitFor(async () => {
      const z = await docData(`zones/${ids.zoneA}`)
      return z.latestTimestamp && z
    }, 'zone latest values')
    assert.equal(zone.latestMoisture, 62)
    assert.equal(zone.latestMoisture1, 60)
    assert.equal(zone.latestTemp, 25)
    assert.equal(zone.status, 'healthy')

    const readings = await db.collection(`zones/${ids.zoneA}/sensorReadings`).get()
    assert.equal(readings.size, 1)
    const ttlDays = (readings.docs[0].data().expiresAt.toMillis() - Date.now()) / 86400000
    assert.ok(ttlDays > 6.9 && ttlDays <= 7, `readings kept 7 days (got ${ttlDays})`)

    const hour = new Date().toISOString().slice(0, 13)
    assert.equal((await docData(`zones/${ids.zoneA}/stats/${hour}`)).moisture, 62)
  })

  test('a worsening zone alerts once, then the 30-minute cooldown holds', async () => {
    await sensors('ESP32-T1', { temperature: 25, humidity: 60, lightLevel: 0, soilMoisture1: 40, soilMoisture2: 40 })
    const z = await waitFor(async () => {
      const d = await docData(`zones/${ids.zoneA}`)
      return d.status === 'attention' && d
    }, 'status attention')
    assert.match(z.alertSummary, /^Moisture too low \(40%/)
    await waitFor(async () => (await notifs(users.alice.uid, 'threshold')).length === 1, 'threshold notification')

    await sensors('ESP32-T1', { temperature: 35, humidity: 60, lightLevel: 0, soilMoisture1: 40, soilMoisture2: 40 })
    await waitFor(async () => (await docData(`zones/${ids.zoneA}`)).status === 'critical', 'status critical')
    await sleep(500)
    assert.equal((await notifs(users.alice.uid, 'threshold')).length, 1)
  })

  test('a failed DHT11 read keeps the worse status and the hour’s last temperature', async () => {
    const before = await docData(`zones/${ids.zoneA}`)  // critical: temperature 35 + low moisture
    const hour = new Date().toISOString().slice(0, 13)
    await sensors('ESP32-T1', { temperature: null, humidity: null, lightLevel: 0, soilMoisture1: 60, soilMoisture2: 64 })
    await waitFor(async () => (await docData(`zones/${ids.zoneA}`)).latestMoisture === 62, 'zone updated')
    const stats = await waitFor(async () => {
      const s = await docData(`zones/${ids.zoneA}/stats/${hour}`)
      return s.moisture === 62 && s
    }, 'stats updated')
    assert.equal(stats.temperature, 35, 'a null reading does not blank the hour')
    const z = await docData(`zones/${ids.zoneA}`)
    assert.equal(z.latestTemp, null)
    assert.equal(before.status, 'critical')
    assert.equal(z.status, 'critical', 'moisture alone must not make the zone healthy')
    assert.match(z.alertSummary, /^No temperature or humidity reading, so the last status is kept\./)
    await sleep(500)
    assert.equal((await notifs(users.alice.uid, 'threshold')).length, 1)

    // A soil probe that stops reporting is cleared, not kept like temperature/humidity
    await sensors('ESP32-T1', { temperature: null, humidity: null, lightLevel: 0, soilMoisture1: 60 })
    const after = await waitFor(async () => {
      const s = await docData(`zones/${ids.zoneA}/stats/${hour}`)
      return s.moisture === 60 && s
    }, 'stats updated again')
    assert.equal(after.soilMoisture2, null)
    assert.equal(after.temperature, 35)
  })

  test('manual toggles publish one debounced command and ignore the device echo', async () => {
    const t0 = Date.now()
    const dev = db.doc('devices/ESP32-T1')
    await dev.update({ irrigationActive: true })
    await dev.update({ lightActive: true })
    await dev.update({ lightActive: false })
    await dev.update({ lightActive: true })
    await waitFor(() => commandsFor('ESP32-T1', t0).length, 'command published')
    await sleep(1200)
    const sent = commandsFor('ESP32-T1', t0)
    assert.equal(sent.length, 1, `rapid taps collapse into one publish (got ${sent.length})`)
    assert.deepEqual(sent[0].state, { irrigationState: true, fertilizerState: false, lightState: true })

    const t1 = Date.now()
    await publish('grownex/ESP32-T1/actuators/state', { deviceId: 'ESP32-T1', irrigationState: true, fertilizerState: false, lightState: true }, { retain: true })
    await waitFor(async () => (await docData('devices/ESP32-T1')).irrigationConfirmed === true, 'confirmed fields')
    const d = await docData('devices/ESP32-T1')
    assert.equal(d.lightConfirmed, true)
    assert.equal(d.irrigationActive, true, 'device state must not overwrite intent')
    await sleep(1200)
    assert.equal(commandsFor('ESP32-T1', t1).length, 0, 'no feedback-loop publish')

    await dev.update({ irrigationActive: false, lightActive: false })
    await waitFor(() => commandsFor('ESP32-T1', t1).some(c => !c.state.irrigationState && !c.state.lightState), 'all-off command')
  })

  test('low moisture triggers irrigation, auto-off, a notification and a cooldown', async () => {
    await db.doc(`automationConfig/${ids.zoneA}`).set({ autoWateringEnabled: true, wateringThreshold: 50, wateringDuration: 1 })
    await sleep(300)
    const t0 = Date.now()
    await sensors('ESP32-T1', { temperature: 25, humidity: 60, lightLevel: 0, soilMoisture1: 40, soilMoisture2: 40 })
    const on = await waitFor(() => commandsFor('ESP32-T1', t0).find(c => c.state.irrigationState), 'irrigation on')
    await waitFor(() => commandsFor('ESP32-T1', on.at + 1).some(c => !c.state.irrigationState), 'irrigation auto-off', 5000)
    await waitFor(async () => (await docData('devices/ESP32-T1')).irrigationActive === false, 'intent back to off')
    await waitFor(async () => (await notifs(users.alice.uid, 'actuator')).length === 1, 'actuator notification')

    const t1 = Date.now()
    await sensors('ESP32-T1', { temperature: 25, humidity: 60, lightLevel: 0, soilMoisture1: 40, soilMoisture2: 40 })
    await sleep(1500)
    assert.equal(commandsFor('ESP32-T1', t1).filter(c => c.state.irrigationState).length, 0, 'cooldown blocks re-trigger')
    await db.doc(`automationConfig/${ids.zoneA}`).set({ autoWateringEnabled: false }, { merge: true })
  })

  test('an unassigned device updates only itself', async () => {
    await sensors('ESP32-LONER', { temperature: 20, humidity: 50, lightLevel: 0, soilMoisture1: 50 })
    await waitForLog(/ESP32-LONER has no assigned zone/)
  })

  test('sensor-node status mirrors onto the zone; camera status does not', async () => {
    await publish('grownex/ESP32-T1/status', 'offline', { retain: true })
    await waitFor(async () => (await docData(`zones/${ids.zoneA}`)).deviceOnline === false, 'zone offline')
    await publish('grownex/ESP32-T1/status', 'online', { retain: true })
    await waitFor(async () => (await docData(`zones/${ids.zoneA}`)).deviceOnline === true, 'zone online')
    await publish('grownex/ESP32CAM-T1/status', 'offline', { retain: true })
    await waitFor(async () => (await docData('devices/ESP32CAM-T1')).status === 'offline', 'camera offline')
    assert.equal((await docData(`zones/${ids.zoneA}`)).deviceOnline, true)
  })

  test('camera JPEGs land in Storage + the snapshots feed; junk is rejected', async () => {
    await publish('grownex/ESP32CAM-T1/camera', Buffer.from('not a jpeg'))
    await waitForLog(/rejected camera payload/)

    const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2048, 7), Buffer.from([0xFF, 0xD9])])
    await publish('grownex/ESP32CAM-T1/camera', jpeg)
    const snap = await waitFor(async () => {
      const s = await db.collection(`zones/${ids.zoneA}/snapshots`).get()
      return !s.empty && s.docs[0].data()
    }, 'snapshot doc')
    assert.equal(snap.source, 'camera')
    assert.equal(snap.deviceId, 'ESP32CAM-T1')
    const [exists] = await bucket.file(snap.storagePath).exists()
    assert.ok(exists, 'image stored')
    const [buf] = await bucket.file(snap.storagePath).download()
    assert.equal(buf.length, jpeg.length)
  })

  test('REST routes enforce ownership and fall back without an AI key', async () => {
    const A = users.alice.token, B = users.bob.token
    const plan = await (await api('/api/ai/automation-plan', { token: A, method: 'POST', body: { zoneId: ids.zoneA } })).json()
    assert.equal(plan.source, 'fallback')
    assert.equal(plan.plan.wateringThreshold, 45)       // avg min (45+55)/2 − 5
    assert.equal(plan.plan.autoLightingEnabled, false)  // device has no light module
    assert.equal((await api('/api/ai/automation-plan', { token: B, method: 'POST', body: { zoneId: ids.zoneA } })).status, 403)
    assert.equal((await api('/api/ai/automation-plan', { token: A, method: 'POST', body: {} })).status, 400)

    const sum = await api('/api/ai/analytics-summary', { token: A, method: 'POST', body: { zoneId: ids.zoneA, timeRange: '7days', series: { temperature: [21, 22] } } })
    assert.equal((await sum.json()).source, 'fallback')
    assert.equal((await api('/api/ai/analytics-summary', { token: A, method: 'POST', body: { zoneId: ids.zoneA, timeRange: 'year' } })).status, 400)
    assert.equal((await api('/api/ai/analytics-summary', { token: B, method: 'POST', body: { zoneId: ids.zoneA, timeRange: 'today' } })).status, 403)

    assert.deepEqual(await (await api('/api/ai/plant-profile', { token: A, method: 'POST', body: { species: 'basil' } })).json(), { source: 'fallback', profile: null })
    assert.equal((await api('/api/ai/plant-profile', { token: A, method: 'POST', body: { species: 'a' } })).status, 400)

    assert.deepEqual((await (await api('/api/zones', { token: A })).json()).map(z => z.id), [ids.zoneA])
    assert.deepEqual(await (await api('/api/zones', { token: B })).json(), [])
    assert.equal((await (await api(`/api/zones/${ids.zoneA}/plants`, { token: A })).json()).length, 2)
    assert.equal((await api(`/api/zones/${ids.zoneA}/plants`, { token: B })).status, 403)
    assert.ok((await (await api(`/api/zones/${ids.zoneA}/sensor-readings`, { token: A })).json()).length >= 1)
    assert.equal((await api(`/api/zones/${ids.zoneA}/sensor-readings`, { token: B })).status, 403)
    assert.deepEqual((await (await api('/api/devices', { token: A })).json()).map(d => d.id).sort(), ['ESP32-T1', 'ESP32CAM-T1'])
    assert.equal((await api('/api/devices/ESP32-T1', { token: B })).status, 403)
    assert.equal((await api('/api/devices/NOPE', { token: A })).status, 404)
    assert.equal((await (await api('/api/plants', { token: A })).json()).length, 2)
    assert.equal((await api(`/api/plants/${ids.basil}`, { token: B })).status, 403)
    assert.ok((await (await api('/api/analytics/summary', { token: A })).json()).readings.length >= 1)
    assert.equal((await (await api('/api/auth/me', { token: A })).json()).username, 'alice')
  })

  test('schedules fire on the minute, and same-minute schedules do not clobber each other', { timeout: 120000 }, async () => {
    const uid = users.alice.uid
    const zoneRef = db.collection('zones').doc()
    ids.zoneS = zoneRef.id
    await zoneRef.set({ userId: uid, zoneName: 'Scheduled', zoneType: 'indoor', deviceId: 'ESP32-T2', createdAt: FieldValue.serverTimestamp() })
    await db.doc('devices/ESP32-T2').update({ userId: uid, assignedZoneId: ids.zoneS, hasLightingModule: true, hasFertilizerModule: true })

    // Next minute in server local time; skip ahead if it's too close to set up in time
    const at = new Date(Date.now() + 60000 + (new Date().getSeconds() > 50 ? 60000 : 0))
    const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][at.getDay()]
    const later = new Date(at.getTime() + 3 * 3600000)
    await db.doc(`automationConfig/${ids.zoneS}`).set({
      autoWateringEnabled: true, wateringSchedule: hm(at), wateringDuration: 2,
      autoLightingEnabled: true, lightingSchedule: `${hm(at)}–${hm(later)}`,
      autoFertilizingEnabled: true, fertilizingSchedule: `${day} ${hm(at)}`, fertilizingDuration: 2,
    })
    await waitForLog(new RegExp(`4 cron job\\(s\\) scheduled for zone ${ids.zoneS}`))

    const fireAt = new Date(at); fireAt.setSeconds(0, 0)
    await waitFor(() => commandsFor('ESP32-T2').some(c => c.state.irrigationState), 'scheduled irrigation on', fireAt - Date.now() + 15000)
    await sleep(1500)  // all three jobs have run; the 2 s auto-offs haven't yet
    const dev = await docData('devices/ESP32-T2')
    assert.deepEqual(
      { irrigation: dev.irrigationActive, fertilizer: dev.fertilizerActive, light: dev.lightActive },
      { irrigation: true, fertilizer: true, light: true },
      'every same-minute schedule must stay on')
    const last = commandsFor('ESP32-T2').at(-1).state
    assert.deepEqual(last, { irrigationState: true, fertilizerState: true, lightState: true })

    // Auto-offs leave only the light on
    await waitFor(async () => {
      const d = await docData('devices/ESP32-T2')
      return !d.irrigationActive && !d.fertilizerActive && d.lightActive
    }, 'auto-offs', 6000)
    assert.deepEqual(commandsFor('ESP32-T2').at(-1).state, { irrigationState: false, fertilizerState: false, lightState: true })
    await db.doc(`automationConfig/${ids.zoneS}`).delete()
  })

  test('nightly job: per-user summary, opt-out respected, retention prunes', async () => {
    const A = users.alice.uid, B = users.bob.uid
    const zB = db.collection('zones').doc()
    await zB.set({ userId: B, zoneName: 'Bob zone', status: 'healthy' })
    ids.zoneB = zB.id
    await db.doc(`users/${B}`).set({ notificationPrefs: { daily: false } })

    const old = Timestamp.fromMillis(Date.now() - 31 * 86400000)
    await db.collection('notifications').add({ userId: A, type: 'threshold', title: 'old', createdAt: old })
    await db.collection(`zones/${ids.zoneA}/sensorReadings`).doc('expired').set({ moisture: 1, expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    const oldPath = `zoneSnapshots/${ids.zoneA}/old.jpg`
    await bucket.file(oldPath).save(Buffer.from([0xFF, 0xD8]))
    await db.collection(`zones/${ids.zoneA}/snapshots`).doc('old').set({ storagePath: oldPath, capturedAt: Timestamp.fromMillis(Date.now() - 49 * 3600000) })

    const { runDailySummary } = await import('../src/services/dailySummary.js')
    await runDailySummary()

    const daily = await notifs(A, 'daily')
    assert.equal(daily.length, 1)
    assert.match(daily[0].message, /1 needs attention \(Herbs\)/)  // Herbs is still critical
    assert.equal((await notifs(B, 'daily')).length, 0, 'opt-out respected')
    assert.ok(!(await notifs(A)).some(n => n.title === 'old'), 'notifications > 30 days pruned')
    assert.equal((await db.doc(`zones/${ids.zoneA}/sensorReadings/expired`).get()).exists, false)
    assert.ok((await db.collection(`zones/${ids.zoneA}/sensorReadings`).get()).size >= 1, 'fresh readings kept')
    assert.equal((await db.doc(`zones/${ids.zoneA}/snapshots/old`).get()).exists, false)
    assert.equal((await bucket.file(oldPath).exists())[0], false)
    assert.ok((await db.collection(`zones/${ids.zoneA}/snapshots`).get()).size >= 1, 'recent snapshot kept')
  })

  test('after a restart: no commands re-sent, and the first status seen does not alert', async () => {
    const before = commands.length
    const alerts = (await notifs(users.alice.uid, 'threshold')).length
    await db.doc(`zones/${ids.zoneA}`).update({ status: 'critical' })  // the status the bridge last stored
    await stopServer()
    await startServer()
    await sleep(1000)
    assert.equal(commands.length, before, 'startup publishes nothing')

    // A failed DHT11 read right after the restart keeps the stored status, not just the in-memory one
    await sensors('ESP32-T1', { temperature: null, humidity: null, lightLevel: 0, soilMoisture1: 60, soilMoisture2: 64 })
    await waitForLog(/sensor write → zone/)
    assert.equal((await docData(`zones/${ids.zoneA}`)).status, 'critical')

    await sensors('ESP32-T1', { temperature: 35, humidity: 60, lightLevel: 0, soilMoisture1: 40, soilMoisture2: 40 })
    await waitFor(async () => (await docData(`zones/${ids.zoneA}`)).latestTemp === 35, 'second reading')
    await sleep(500)
    assert.equal((await notifs(users.alice.uid, 'threshold')).length, alerts)
  })

  test('account deletion removes all of the user’s data and nobody else’s', async () => {
    const A = users.alice.uid
    await db.doc(`zones/${ids.zoneA}/aiCache/today`).set({ payload: {} })
    await bucket.file(`zonePhotos/${ids.zoneA}.jpg`).save(Buffer.from('z'))
    await bucket.file(`plantPhotos/${ids.basil}.jpg`).save(Buffer.from('p'))

    const res = await api('/api/auth/me', { token: users.alice.token, method: 'DELETE' })
    assert.equal(res.status, 200, await res.text())

    for (const sub of ['sensorReadings', 'stats', 'aiCache', 'snapshots'])
      assert.equal((await db.collection(`zones/${ids.zoneA}/${sub}`).get()).size, 0, `${sub} deleted`)
    assert.equal((await db.collection('zones').where('userId', '==', A).get()).size, 0)
    assert.equal((await db.collection('plants').where('zoneId', '==', ids.zoneA).get()).size, 0)
    assert.equal((await db.doc(`automationConfig/${ids.zoneA}`).get()).exists, false)
    assert.equal((await db.collection('devices').where('userId', '==', A).get()).size, 0)
    assert.equal((await notifs(A)).length, 0)
    assert.equal((await db.doc(`users/${A}`).get()).exists, false)
    await assert.rejects(auth.getUser(A))
    for (const p of [`zonePhotos/${ids.zoneA}.jpg`, `plantPhotos/${ids.basil}.jpg`])
      assert.equal((await bucket.file(p).exists())[0], false, `${p} deleted`)
    const [left] = await bucket.getFiles({ prefix: `zoneSnapshots/${ids.zoneA}/` })
    assert.equal(left.length, 0)

    assert.equal((await db.doc(`zones/${ids.zoneB}`).get()).exists, true, "bob's zone untouched")
    await auth.getUser(users.bob.uid)
  })

  test('seed.js seeds demo data and --clean removes it, even past 500 readings', { timeout: 60000 }, async () => {
    const B = users.bob.uid
    const run = (...args) => new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['seed.js', ...args], { cwd: SERVER_DIR,
        env: { ...process.env, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_STORAGE_BUCKET: BUCKET } })
      let out = ''
      p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
      p.on('exit', code => code === 0 ? resolve(out) : reject(new Error(out)))
    })
    await run(B)
    const zones = await db.collection('zones').where('userId', '==', B).where('_demo', '==', true).get()
    assert.equal(zones.size, 1)
    const demo = zones.docs[0].ref
    assert.equal((await demo.collection('stats').get()).size, 168)

    // A demo device left running for ~10 hours
    const w = db.bulkWriter()
    for (let i = 0; i < 600; i++) w.set(demo.collection('sensorReadings').doc(), { moisture: 50 })
    await w.close()

    await run(B, '--clean')
    assert.equal((await demo.get()).exists, false)
    assert.equal((await demo.collection('sensorReadings').get()).size, 0)
    assert.equal((await db.collection('plants').where('zoneId', '==', demo.id).get()).size, 0)
    assert.equal((await db.doc('devices/GRX-DEMO-HUB02').get()).exists, false)
  })

  test('the bridge never crashed', () => {
    assert.equal(server.exitCode, null)
    assert.ok(!logs.some(l => /Unhandled|uncaught/i.test(l)), logs.filter(l => /Unhandled|uncaught/i.test(l)).join('\n'))
  })
})
