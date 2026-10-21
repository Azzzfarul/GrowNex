// Checks the simulator speaks the firmware's MQTT contract (firmware/, firmware_cam/), against an
// in-process broker — no server, Firebase or network needed: `npm test`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Aedes } from 'aedes'
import mqtt from 'mqtt'

const DIR = fileURLToPath(new URL('..', import.meta.url))
const SENSOR = 'ESP32-TEST00000001'
const CAM = 'ESP32CAM-TEST00000001'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let broker, server, port, watcher, sim
const msgs = []  // { topic, payload: Buffer, retain, at }

async function waitFor(fn, what, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(50) }
  throw new Error(`timed out waiting for ${what}`)
}
const since = t => msgs.filter(m => m.at >= t)
const find = (t, topic, pred = () => true) => since(t).find(m => m.topic === topic && pred(m))
const json = m => JSON.parse(m.payload.toString())
// `exited` resolves with the exit code even if the process died before anyone was waiting.
const runSim = (args, env = {}) => {
  const p = spawn(process.execPath, ['simulator.js', ...args], {
    cwd: DIR, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MQTT_HOST: '127.0.0.1', MQTT_PORT: String(port), MQTT_USERNAME: '', MQTT_PASSWORD: '', ...env },
  })
  p.exited = new Promise(r => p.once('exit', r))
  p.stdin.on('error', () => {})  // writing to a crashed simulator must fail the test, not the runner
  return p
}
const retained = async topic => {
  const c = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`)
  const got = []
  c.on('message', (_t, m, p) => p.retain && got.push(m.toString()))
  await c.subscribeAsync(topic)
  await sleep(300)
  await c.endAsync()
  return got
}

before(async () => {
  broker = await Aedes.createBroker()
  server = createServer(broker.handle)
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  port = server.address().port
  watcher = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`)
  await watcher.subscribeAsync('grownex/#')
  watcher.on('message', (topic, payload, p) => msgs.push({ topic, payload, retain: p.retain, at: Date.now() }))
  sim = runSim(['--interval', '1', '--slots', '2', '--id', SENSOR, '--camera-id', CAM])
})

after(async () => {
  if (sim.exitCode == null) sim.kill()
  await watcher?.endAsync()
  await new Promise(r => broker.close(r))
  server.close()
})

test('boards announce themselves online, retained', async () => {
  await waitFor(() => find(0, `grownex/${SENSOR}/status`, m => m.payload.toString() === 'online'), 'sensor online')
  await waitFor(() => find(0, `grownex/${CAM}/status`, m => m.payload.toString() === 'online'), 'camera online')
  assert.deepEqual(await retained(`grownex/${SENSOR}/status`), ['online'])
})

test('readings have the firmware payload shape', async () => {
  const m = await waitFor(() => find(0, `grownex/${SENSOR}/sensors`), 'a reading')
  const r = json(m)
  assert.deepEqual(Object.keys(r).sort(), ['deviceId', 'humidity', 'lightLevel', 'soilMoisture1', 'soilMoisture2', 'temperature'])
  assert.equal(r.deviceId, SENSOR)
  for (const k of ['temperature', 'humidity', 'lightLevel', 'soilMoisture1', 'soilMoisture2']) assert.equal(typeof r[k], 'number', k)
  assert.equal(m.retain, false)
  const state = await waitFor(() => find(0, `grownex/${SENSOR}/actuators/state`), 'actuator state')
  assert.deepEqual(json(state), { deviceId: SENSOR, lightState: false, fertilizerState: false, irrigationState: false })
})

test('commands: junk is ignored, present keys are applied and confirmed (retained)', async () => {
  await watcher.publishAsync(`grownex/${SENSOR}/actuators/command`, 'null', { retain: true })
  await sleep(300)
  assert.equal(sim.exitCode, null, 'a null command must not crash the board')

  const t = Date.now()
  await watcher.publishAsync(`grownex/${SENSOR}/actuators/command`, JSON.stringify({ irrigationState: true }), { retain: true })
  const state = await waitFor(() => find(t, `grownex/${SENSOR}/actuators/state`, m => json(m).irrigationState), 'confirmed state')
  assert.deepEqual(json(state), { deviceId: SENSOR, lightState: false, fertilizerState: false, irrigationState: true })
  assert.deepEqual(await retained(`grownex/${SENSOR}/actuators/state`).then(x => x.map(s => JSON.parse(s).irrigationState)), [true])
})

test('camera sends a raw JPEG, not retained, at boot and on "photo"', async () => {
  const boot = await waitFor(() => find(0, `grownex/${CAM}/camera`), 'boot photo')
  assert.equal(boot.retain, false)
  assert.ok(boot.payload[0] === 0xFF && boot.payload[1] === 0xD8, 'starts like a JPEG')
  assert.ok(boot.payload.length <= 1.5 * 1024 * 1024)
  const t = Date.now()
  sim.stdin.write('photo\n')
  await waitFor(() => find(t, `grownex/${CAM}/camera`), 'photo on demand')
})

test('power cut fires the last-will; power-on reboots like the firmware', async () => {
  const t = Date.now()
  sim.stdin.write('offline\n')
  await waitFor(() => find(t, `grownex/${SENSOR}/status`, m => m.payload.toString() === 'offline'), 'sensor last-will')
  await waitFor(() => find(t, `grownex/${CAM}/status`, m => m.payload.toString() === 'offline'), 'camera last-will')
  await sleep(1500)
  assert.ok(!find(t, `grownex/${SENSOR}/status`, m => m.payload.toString() === 'online'), 'stays off until "online"')

  const t2 = Date.now()
  sim.stdin.write('online\n')
  await waitFor(() => find(t2, `grownex/${SENSOR}/status`, m => m.payload.toString() === 'online'), 'sensor back online')
  // Boots with relays off, then the retained command switches irrigation back on
  await waitFor(() => find(t2, `grownex/${SENSOR}/actuators/state`, m => json(m).irrigationState), 'retained command re-applied')
  await waitFor(() => find(t2, `grownex/${CAM}/camera`), 'boot photo after power-on')
})

test('"forget" clears the retained messages and exits', async () => {
  sim.stdin.write('forget\n')
  const code = await sim.exited
  assert.equal(code, 0)
  for (const t of ['status', 'actuators/state', 'actuators/command']) {
    assert.deepEqual(await retained(`grownex/${SENSOR}/${t}`), [], `${t} cleared`)
  }
  assert.deepEqual(await retained(`grownex/${CAM}/status`), [])
})

test('bad IDs are refused', async () => {
  for (const args of [['--id', 'lab/node1'], ['--node', 'camera', '--camera-id', 'ESP32-NOTACAM']]) {
    const p = runSim(args)
    assert.equal(await p.exited, 1, args.join(' '))
  }
})
