// Local sandbox helpers for manual / on-device testing without hardware:
// an MQTT broker on :1883 plus a fake sensor/relay node (ESP32-MOB01) that sends a reading
// every 3 s and confirms every command it receives, like firmware/ does.
//   node test/sandbox.js          (then start the server with MQTT_BROKER_HOST=127.0.0.1)
import { createServer } from 'node:net'
import { Aedes } from 'aedes'
import mqtt from 'mqtt'

const ID = process.env.FAKE_DEVICE_ID || 'ESP32-MOB01'

const broker = await Aedes.createBroker()
await new Promise(r => createServer(broker.handle).listen(1883, '127.0.0.1', r))
console.log('broker on 127.0.0.1:1883')

const dev = await mqtt.connectAsync('mqtt://127.0.0.1:1883', {
  clientId: ID, will: { topic: `grownex/${ID}/status`, payload: 'offline', retain: true },
})
await dev.publishAsync(`grownex/${ID}/status`, 'online', { retain: true })
await dev.subscribeAsync(`grownex/${ID}/actuators/command`)
dev.on('message', (_t, buf) => {
  const cmd = JSON.parse(buf.toString())
  console.log(`${ID} command`, cmd)
  dev.publish(`grownex/${ID}/actuators/state`, JSON.stringify({ deviceId: ID, ...cmd }), { retain: true })
})
let i = 0
setInterval(() => {
  dev.publish(`grownex/${ID}/sensors`, JSON.stringify({
    deviceId: ID, temperature: 26.5, humidity: 55, lightLevel: 0, soilMoisture1: 48 + (i++ % 2),
  }))
}, 3000)
console.log(`fake device ${ID} online`)
