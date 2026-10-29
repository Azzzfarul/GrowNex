#!/usr/bin/env node
// GrowNex device simulator — stands in for the boards in firmware/ (sensor/relay node) and
// firmware_cam/ (ESP32-CAM) so the whole system can be tested without hardware. It speaks the
// exact same MQTT contract: same broker and credentials, topics, payloads, retained flags and
// last-will. See README.md in this folder.

import mqtt from 'mqtt'
import { parseArgs } from 'node:util'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024  // the bridge rejects larger camera payloads
const CAMERA_RETRY_MS = 5 * 60 * 1000      // firmware_cam RETRY_INTERVAL_MS

const HELP = `Usage: npm start -- [options]

  --node sensor|camera|both   which boards to simulate (default: both)
  --id ESP32-XXXXXXXXXXXX     sensor node ID (default: stable per computer)
  --camera-id ESP32CAM-…      camera node ID (default: stable per computer)
  --interval <seconds>        time between readings (default: 60, like the firmware)
  --slots 1-4                 soil probes to report (default: 1, like the firmware)
  --images <folder>           JPEGs for the camera (default: ./images)
  -h, --help

Broker: MQTT_HOST / MQTT_USERNAME / MQTT_PASSWORD (and MQTT_PORT, default 8883) from the
environment, else read from ../firmware/include/secrets.h. With MQTT_HOST set, secrets.h is ignored.`

const COMMANDS = `Commands (type and press Enter):
  dry | wet          set soil moisture to 15% / 85%
  hot | cold         push temperature 12 °C above / below normal
  normal             clear hot/cold
  reading            publish a sensor reading now
  photo              publish a camera photo now (ignores the 4-hour window)
  offline | online   simulate a power cut (last-will fires, relays off) / power back on
  forget             clear this board's retained messages from the broker, then quit
                     (do this before deleting the simulated devices in the app)
  state              show the current simulated values
  help | quit`

// ─── Options and broker config ────────────────────────────────────────────────

let opt
try {
  opt = parseArgs({ options: {
    node: { type: 'string', default: 'both' },
    id: { type: 'string' },
    'camera-id': { type: 'string' },
    interval: { type: 'string', default: '60' },
    slots: { type: 'string', default: '1' },
    images: { type: 'string', default: path.join(HERE, 'images') },
    help: { type: 'boolean', short: 'h' },
  } }).values
} catch (e) {
  fail(`${e.message}\n\n${HELP}`)
}
if (opt.help) { console.log(HELP); process.exit(0) }

const runSensor = opt.node === 'sensor' || opt.node === 'both'
const runCamera = opt.node === 'camera' || opt.node === 'both'
const intervalMs = Number(opt.interval) * 1000
const slots = Number(opt.slots)
if (!runSensor && !runCamera) fail(`--node must be sensor, camera or both\n\n${HELP}`)
// setInterval treats anything over 2^31-1 ms as 1 ms, which would flood the broker.
if (!(intervalMs >= 1000 && intervalMs <= 2147483647)) fail('--interval must be 1 to 2147483 seconds')
if (![1, 2, 3, 4].includes(slots)) fail('--slots must be 1, 2, 3 or 4')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function brokerConfig() {
  const secretsPath = path.join(HERE, '..', 'firmware', 'include', 'secrets.h')
  const secrets = {}
  if (existsSync(secretsPath)) {
    // Only lines that are a #define, so `// #define …` and /* … */ blocks are skipped like the compiler does.
    const text = readFileSync(secretsPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, key, value] of text.matchAll(/^\s*#define\s+(\w+)\s+"([^"]*)"/gm)) {
      secrets[key] = value
    }
  }
  // Another broker gets only the credentials given with it, never the firmware broker's.
  const fromEnv = process.env.MQTT_HOST !== undefined
  const pick = key => process.env[key] ?? (fromEnv ? undefined : secrets[key])
  const host = pick('MQTT_HOST')
  if (!host || host.includes('your-cluster-id')) {
    fail('No broker configured. Set MQTT_HOST, MQTT_USERNAME and MQTT_PASSWORD, or fill in\n' +
      `${secretsPath} (copy secrets.example.h) as you would for the real board.`)
  }
  return {
    host,
    port: Number(process.env.MQTT_PORT || 8883),  // firmware MQTT_PORT
    username: pick('MQTT_USERNAME') || undefined,
    password: pick('MQTT_PASSWORD') || undefined,
    source: fromEnv ? 'environment' : 'firmware/include/secrets.h',
  }
}

// Stable per computer, so the simulated board keeps its ID (and its claim) across runs, like a
// real board keeps its MAC. Same format as the firmware: prefix + 12 uppercase hex digits.
function fakeMac(kind) {
  return createHash('sha1').update(`grownex-sim:${hostname()}:${kind}`).digest('hex').slice(0, 12).toUpperCase()
}

const broker = brokerConfig()
const sensorId = opt.id || `ESP32-${fakeMac('sensor')}`
const cameraId = opt['camera-id'] || `ESP32CAM-${fakeMac('camera')}`
// The ID is a topic level (grownex/{id}/…) and a Firestore doc ID: no / + # or spaces.
for (const id of [sensorId, cameraId]) if (/[/+#\s]/.test(id)) fail(`Invalid device ID "${id}": no / + # or spaces`)
if (runCamera && !cameraId.startsWith('ESP32CAM-')) {
  fail('--camera-id must start with ESP32CAM- (the server uses the prefix to recognise cameras)')
}
if (runSensor && sensorId.startsWith('ESP32CAM-')) fail('--id must not start with ESP32CAM- (that marks a camera)')

const time = () => new Date().toLocaleTimeString()
const log = (who, msg) => console.log(`${time()} [${who}] ${msg}`)

// ─── MQTT connection (both boards) ────────────────────────────────────────────

const RECONNECT_MS = 3000  // firmware retries every 3 s
const FIRST_SEND_DELAY_MS = 1000

function connect(id, { keepalive }) {
  const statusTopic = `grownex/${id}/status`
  const client = mqtt.connect({
    host: broker.host,
    port: broker.port,
    protocol: broker.port === 8883 ? 'mqtts' : 'mqtt',
    clientId: id,
    username: broker.username,
    password: broker.password,
    keepalive,
    reconnectPeriod: RECONNECT_MS,
    // Same last-will as the firmware: retained "offline", QoS 1, sent by the broker if the
    // connection drops without a clean disconnect (power cut, Wi-Fi loss).
    will: { topic: statusTopic, payload: 'offline', qos: 1, retain: true },
  })
  client.on('connect', () => {
    client.publish(statusTopic, 'online', { retain: true })
    log(id, `MQTT OK — online on ${broker.host}:${broker.port}`)
  })
  client.on('reconnect', () => log(id, 'reconnecting…'))
  client.on('error', e => log(id, `MQTT error: ${e.message}`))
  return client
}

// Power cut: a forced close sends no DISCONNECT, so the broker fires the last-will; it also
// stops any reconnect already in progress.
function powerOff(client) {
  client.end(true)
}

function powerOn(client) {
  if (!client.connected) client.reconnect()
}

// Empty retained publishes delete the retained status/state/command, so the bridge can't
// recreate the device from them after it's deleted in the app.
// Resolves false if anything was left on the broker, so the caller doesn't quit as if it worked.
async function forget(client, id) {
  if (!client.connected) { log(id, 'not connected — retained messages NOT cleared'); return false }
  const topics = ['status', 'actuators/state', 'actuators/command'].map(t => `grownex/${id}/${t}`)
  const oks = await Promise.all(topics.map(t =>
    new Promise(resolve => client.publish(t, '', { retain: true }, err => resolve(!err)))))
  const ok = oks.every(Boolean)
  log(id, ok ? 'retained messages cleared' : 'clearing retained messages failed')
  await new Promise(resolve => client.end(false, resolve))
  return ok
}

// Clean shutdown (Ctrl+C): mark the board offline first, as the last-will would.
function shutdown(client, id) {
  return new Promise(resolve => {
    if (!client.connected) { client.end(true, resolve); return }
    client.publish(`grownex/${id}/status`, 'offline', { retain: true }, () => client.end(false, resolve))
  })
}

// ─── Sensor / relay node (firmware/) ──────────────────────────────────────────

const sim = {
  moisture: [55, 62, 48, 58].slice(0, slots),  // % per soil probe
  tempOffset: 0,                               // set by hot / cold
  actuators: { lightState: false, fertilizerState: false, irrigationState: false },
}

const round1 = v => Math.round(v * 10) / 10
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const noise = size => (Math.random() * 2 - 1) * size

// Soil dries ~0.6 %/min and gains ~15 %/min while the irrigation relay is on, so threshold
// watering visibly kicks in and refills the soil. Temperature and humidity follow the time of day.
const DRY_PER_SEC = 0.01
const WATER_PER_SEC = 0.25
setInterval(() => {
  const delta = sim.actuators.irrigationState ? WATER_PER_SEC : -DRY_PER_SEC
  sim.moisture = sim.moisture.map(m => clamp(m + delta, 0, 100))
}, 1000).unref()

function readSensors() {
  const hour = new Date().getHours() + new Date().getMinutes() / 60
  const day = Math.sin((2 * Math.PI * (hour - 9)) / 24)  // peaks mid-afternoon
  const reading = {
    deviceId: sensorId,
    temperature: round1(26 + 4 * day + sim.tempOffset + noise(0.3)),
    humidity: round1(clamp(65 - 10 * day + noise(1), 0, 100)),
    // Like the firmware's LDR reading: 0–100 % brightness, high under the grow light.
    lightLevel: sim.actuators.lightState ? 85 : 30,
  }
  sim.moisture.forEach((m, i) => { reading[`soilMoisture${i + 1}`] = round1(clamp(m + noise(0.5), 0, 100)) })
  return reading
}

let sensorClient
function startSensor() {
  const topics = {
    sensors: `grownex/${sensorId}/sensors`,
    state: `grownex/${sensorId}/actuators/state`,
    command: `grownex/${sensorId}/actuators/command`,
  }
  sensorClient = connect(sensorId, { keepalive: 15 })  // PubSubClient default keep-alive

  const publishState = () => sensorClient.publish(topics.state, JSON.stringify({ deviceId: sensorId, ...sim.actuators }), { retain: true })

  const publishReading = () => {
    if (!sensorClient.connected) return
    const r = readSensors()
    sensorClient.publish(topics.sensors, JSON.stringify(r))
    publishState()  // the firmware republishes actuator state with every reading
    const soil = sim.moisture.map((_, i) => `soil${i + 1}=${r[`soilMoisture${i + 1}`]}%`).join(' ')
    log(sensorId, `sensors → temp=${r.temperature}°C humid=${r.humidity}% ${soil} light=${r.lightLevel}`)
  }

  sensorClient.on('connect', () => {
    sensorClient.subscribe(topics.command)  // the retained last command arrives right away
    // The real board waits one interval before its first reading; 1 s is handier for testing.
    // Don't send it in the same instant as "online": some brokers (e.g. aedes) then drop the
    // retained "online" as a duplicate of the reading that overtook it.
    setTimeout(publishReading, FIRST_SEND_DELAY_MS)
  })

  // Same as the firmware's onMessage: apply only the boolean keys present, then confirm the new state.
  sensorClient.on('message', (_topic, buf) => {
    let cmd
    try { cmd = JSON.parse(buf.toString()) } catch { return }
    if (!cmd || typeof cmd !== 'object') return  // e.g. a retained `null`; the firmware ignores it too
    for (const key of ['lightState', 'fertilizerState', 'irrigationState']) {
      if (typeof cmd[key] === 'boolean') sim.actuators[key] = cmd[key]
    }
    publishState()
    const a = sim.actuators
    log(sensorId, `cmd → light=${+a.lightState} fert=${+a.fertilizerState} irrig=${+a.irrigationState}`)
  })

  setInterval(publishReading, intervalMs)
  return { publishReading }
}

// ─── Camera node (firmware_cam/) ──────────────────────────────────────────────

function loadImages(dir) {
  if (!existsSync(dir)) fail(`Image folder not found: ${dir}`)
  const files = readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)).sort()
  const images = []
  for (const f of files) {
    const buf = readFileSync(path.join(dir, f))
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) { console.warn(`skipping ${f}: not a JPEG`); continue }
    if (buf.length > MAX_IMAGE_BYTES) { console.warn(`skipping ${f}: over 1.5 MB`); continue }
    images.push({ name: f, buf })
  }
  if (!images.length) fail(`No usable .jpg files in ${dir}`)
  return images
}

// Same 4-hour UTC buckets as the firmware and the dashboard: "2026-01-15T12".
function currentBucket(d = new Date()) {
  const b = new Date(d)
  b.setUTCMinutes(0, 0, 0)
  b.setUTCHours(Math.floor(b.getUTCHours() / 4) * 4)
  return b.toISOString().slice(0, 13)
}

let cameraClient
function startCamera() {
  const images = loadImages(opt.images)
  const topic = `grownex/${cameraId}/camera`
  let next = 0
  let lastUploadedBucket = null
  let lastAttempt = 0
  cameraClient = connect(cameraId, { keepalive: 30 })  // firmware_cam setKeepAlive(30)

  // Raw JPEG bytes, not retained — exactly what firmware_cam streams with beginPublish/write.
  const publishPhoto = () => new Promise(resolve => {
    if (!cameraClient.connected) { resolve(false); return }
    const img = images[next++ % images.length]
    cameraClient.publish(topic, img.buf, { qos: 0, retain: false }, err => {
      if (err) log(cameraId, `image publish failed: ${err.message}`)
      else log(cameraId, `published ${img.buf.length} bytes (${img.name}) → ${topic}`)
      resolve(!err)
    })
  })

  // One photo right after boot, then one per 4-hour window; retry 5 min after a failure.
  const tick = async () => {
    if (!cameraClient.connected) return
    const bucket = currentBucket()
    if (bucket === lastUploadedBucket) return
    if (lastAttempt && Date.now() - lastAttempt < CAMERA_RETRY_MS) return
    lastAttempt = Date.now()
    if (await publishPhoto()) lastUploadedBucket = bucket
  }
  cameraClient.on('connect', () => setTimeout(tick, FIRST_SEND_DELAY_MS))  // see the sensor node
  setInterval(tick, 10_000)
  // After a power cut the board boots again and takes its boot photo, like firmware_cam.
  const reboot = () => { lastUploadedBucket = null; lastAttempt = 0 }
  return { publishPhoto, reboot, imageCount: images.length }
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`GrowNex device simulator — broker ${broker.host}:${broker.port} (from ${broker.source})`)
const sensor = runSensor ? startSensor() : null
const camera = runCamera ? startCamera() : null
if (runSensor) console.log(`  sensor node  ${sensorId}  every ${intervalMs / 1000}s, ${slots} soil probe(s)`)
if (runCamera) console.log(`  camera node  ${cameraId}  ${camera.imageCount} image(s) from ${opt.images}`)
console.log('Claim them in the app: Devices → Add device (they show under "New devices nearby" while online).')

const clients = () => [[sensorClient, sensorId], [cameraClient, cameraId]].filter(([c]) => c)

let quitting = false
async function quit() {
  if (quitting) process.exit(1)  // second Ctrl+C: leave now
  quitting = true
  setTimeout(() => process.exit(0), 2000).unref()  // a dead link must not keep us waiting
  await Promise.all(clients().map(([c, id]) => shutdown(c, id)))
  process.exit(0)
}
process.on('SIGINT', quit)
process.on('SIGTERM', quit)

// Commands come from stdin: typed in a terminal, or piped in by a script.
if (process.stdin.isTTY) console.log(`\n${COMMANDS}\n`)
{
  const rl = createInterface({ input: process.stdin })
  rl.on('line', async line => {
    const cmd = line.trim().toLowerCase()
    switch (cmd) {
      case 'dry': sim.moisture = sim.moisture.map(() => 15); log('sim', 'soil moisture → 15%'); sensor?.publishReading(); break
      case 'wet': sim.moisture = sim.moisture.map(() => 85); log('sim', 'soil moisture → 85%'); sensor?.publishReading(); break
      case 'hot': sim.tempOffset = 12; log('sim', 'temperature +12 °C'); sensor?.publishReading(); break
      case 'cold': sim.tempOffset = -12; log('sim', 'temperature −12 °C'); sensor?.publishReading(); break
      case 'normal': sim.tempOffset = 0; log('sim', 'temperature back to normal'); sensor?.publishReading(); break
      case 'reading': sensor ? sensor.publishReading() : log('sim', 'no sensor node running'); break
      case 'photo': camera ? await camera.publishPhoto() : log('sim', 'no camera node running'); break
      case 'offline':
        // A board without power has every relay off, and boots again afterwards.
        sim.actuators = { lightState: false, fertilizerState: false, irrigationState: false }
        camera?.reboot()
        clients().forEach(([c, id]) => { powerOff(c); log(id, 'power cut — broker sends the last-will "offline"') })
        break
      case 'forget':
        if ((await Promise.all(clients().map(([c, id]) => forget(c, id)))).every(Boolean)) process.exit(0)
        log('sim', 'forget incomplete — type online, wait for "MQTT OK", then forget again')
        break
      case 'online': clients().forEach(([c, id]) => { powerOn(c); log(id, 'power back on') }); break
      case 'state':
        console.log({ moisture: sim.moisture.map(round1), tempOffset: sim.tempOffset, ...sim.actuators,
          connected: Object.fromEntries(clients().map(([c, id]) => [id, c.connected])) })
        break
      case 'help': console.log(COMMANDS); break
      case 'quit': case 'exit': await quit(); break
      case '': break
      default: console.log(`Unknown command "${cmd}". Type help.`)
    }
  })
}
