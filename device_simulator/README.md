# GrowNex device simulator

A stand-in for the real boards, so you can test the whole system (dashboard, mobile app,
server automation, notifications, camera feed) without an ESP32. It speaks exactly the same
MQTT contract as [`firmware/`](../firmware) and [`firmware_cam/`](../firmware_cam): same broker
and credentials, topics, JSON payloads, retained flags and last-will.

| Simulated board | ID | Does |
|---|---|---|
| Sensor/relay node (`firmware/`) | `ESP32-XXXXXXXXXXXX` | Sends temperature, humidity, light and soil moisture every 60 s; obeys irrigation / fertilizer / light commands and confirms them |
| Camera node (`firmware_cam/`) | `ESP32CAM-XXXXXXXXXXXX` | Sends one JPEG right after start, then one per 4-hour UTC window |

The IDs are fixed for your computer, so the boards keep their claim between runs, just as a
real board keeps its MAC address.

## Run it

```bash
cd device_simulator
npm install
npm start
```

It reads the broker credentials from `firmware/include/secrets.h` (the same file the real board
uses, so set that up first by copying `secrets.example.h`). To use other credentials, set
`MQTT_HOST`, `MQTT_USERNAME`, `MQTT_PASSWORD` (and `MQTT_PORT`, default 8883 = TLS; anything else
is plain MQTT, e.g. `1883` for a local broker).

With the server running (`web_dashboard/server`, `npm run dev`):

1. In the dashboard or app, go to **Devices → Add device**. Both simulated boards appear under
   *New devices nearby*. Claim them.
2. Open a zone and assign the sensor node in **Overview → Device**, and the camera in
   **Overview → Camera**.
3. Readings appear within a minute. Manual controls and automation drive the simulated relays.

Options (after `npm start --`):

| Option | Default | |
|---|---|---|
| `--node sensor\|camera\|both` | `both` | which boards to run |
| `--interval <s>` | `60` | seconds between readings (try `5` while testing) |
| `--slots 1-4` | `1` | soil probes to report (`soilMoisture1..4`); the real board has 1 |
| `--images <folder>` | `./images` | JPEGs the camera cycles through (max 1.5 MB each) |
| `--id`, `--camera-id` | per computer | pick the IDs yourself (keep the `ESP32-` / `ESP32CAM-` prefixes) |

Example: `npm start -- --interval 5 --slots 4`

## Test scenarios

Type these while it runs:

| Command | What happens | What to check |
|---|---|---|
| `dry` | soil moisture drops to 15% | threshold watering starts, an *Irrigation started* notification, moisture climbs while watering |
| `wet` | soil moisture to 85% | zone status / alert for soil too wet |
| `hot` / `cold` / `normal` | temperature ±12 °C | zone turns *attention* / *critical* with a threshold notification |
| `photo` | sends a camera photo now | Monitoring → Camera feed (replaces this 4-hour window's photo) |
| `offline` / `online` | simulates a power cut / power back | device and zone show *Offline* (via the last-will), then recover |
| `reading` | sends a reading now | |
| `state` | prints the simulated values | |
| `quit` (or Ctrl+C) | marks both boards offline and exits | |

The simulated soil dries about 0.6% a minute and gains about 15% a minute while the irrigation
relay is on. Temperature and humidity follow the time of day. Light level is the firmware's fixed
placeholder (300), or 800 while the grow light is on.

## Differences from the real boards

- The first reading goes out 1 s after connecting, instead of after one full interval.
- The camera's `photo` command and image folder have no hardware equivalent.
- The simulated boards don't drive any pins, so nothing physical switches on.

Each simulated board shows up in Firestore like a real one. When you're done testing, delete
it from the Devices page.
