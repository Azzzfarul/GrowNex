# GrowNex

Full-stack IoT smart plant / farming monitoring and automation system.

| Part | Stack | Location |
|------|-------|----------|
| Firmware | C++ / Arduino (ESP32), PlatformIO | [`firmware/`](firmware/) |
| Camera firmware | C++ / Arduino (ESP32-CAM), PlatformIO | [`firmware_cam/`](firmware_cam/) |
| Device simulator | Node.js (MQTT), stands in for both boards | [`device_simulator/`](device_simulator/) |
| Backend | Express.js + MQTT bridge, Firebase Admin | [`web_dashboard/server/`](web_dashboard/server/) |
| Web dashboard | React + Vite + Tailwind CSS | [`web_dashboard/client/`](web_dashboard/client/) |
| Mobile app | Flutter / Dart | [`mobile_app/`](mobile_app/) |

Auth and data are shared across all clients through **Firebase Auth + Cloud Firestore** (photos in **Firebase Storage**). Devices talk to the backend over **MQTT (HiveMQ, TLS 8883)**; the server's MQTT bridge mirrors that traffic into Firestore.

---

## Prerequisites

- **Node.js** v18+ and npm
- **Flutter SDK** (Dart >= 3.12) — run `flutter doctor` to verify your toolchain
- A **Firebase project** with Auth (Email/Password), Firestore and Storage enabled
- A Firebase **service account** JSON (for the server) — *Project settings → Service accounts → Generate new private key*
- A **HiveMQ Cloud** cluster (or any MQTT broker) for device traffic — needed for real firmware or the device simulator
- Optional: **Docker** with Compose, to run the website in containers instead (section 1.5)
- Optional: an **OpenRouter** API key for the AI features (without one, the apps use built-in rule-based output)

You can run the mobile app and the website against the same Firebase project so they share accounts and data.

---

## 1. Run the website

The website is two processes: an Express API (`server`) and a React app (`client`).

### 1.1 Configure environment

```bash
cd web_dashboard

cp client/.env.example client/.env
cp server/.env.example server/.env
```

**`client/.env`** — from *Firebase console → Project settings → Your apps → Web app*:

```
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

**`server/.env`** — Firebase values come from the service account JSON; MQTT values from your HiveMQ cluster:

```
PORT=5000
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
MQTT_BROKER_HOST=your_cluster.s1.eu.hivemq.cloud
MQTT_BROKER_PORT=8883
MQTT_USER=your_mqtt_username
MQTT_PASS=your_mqtt_password

# Optional — leave OPENROUTER_API_KEY blank to disable AI (rule-based fallback is used)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_CACHE_TTL_MS=1800000

# Nightly summary notification + data cleanup (cron expression + IANA timezone)
DAILY_SUMMARY_CRON=0 20 * * *
DAILY_SUMMARY_TZ=Asia/Kuala_Lumpur
```

> `FIREBASE_STORAGE_BUCKET` is required — the server won't start the MQTT bridge without it.
> Keep `FIREBASE_PRIVATE_KEY` on one line with literal `\n` sequences, wrapped in double quotes.

### 1.2 Install dependencies

```bash
cd web_dashboard/client && npm install
cd ../server && npm install
```

### 1.3 Start both processes

Open two terminals from `web_dashboard/`:

```bash
# Terminal 1 — Express API + MQTT bridge  →  http://localhost:5000
cd server && npm run dev

# Terminal 2 — React dashboard            →  http://localhost:3000
cd client && npm run dev
```

Open <http://localhost:3000>. Health check: <http://localhost:5000/api/health>.

> **Starting the server touches real things.** It listens to the live Firestore project, runs automation
> schedules, sends notifications, and can switch pumps/lights on connected hardware. Run only one server
> per Firebase project/broker — two instances fight over the same MQTT client ID and fire every schedule twice.
> To experiment safely, use the local sandbox in [`web_dashboard/README.md`](web_dashboard/README.md#local-sandbox).

Register an account from the app's Register page (or the mobile app). To load demo zones/plants/devices for that account:

```bash
cd web_dashboard/server
node seed.js <FIREBASE_UID>          # add demo data
node seed.js <FIREBASE_UID> --clean  # remove it
```

### 1.4 Production build (optional)

```bash
cd web_dashboard/client && npm run build   # outputs dist/
npm run preview                            # serve the build locally (:4173 — add it to the CORS origin in server/src/index.js)

cd ../server && npm start                  # run the API without --watch
```

### 1.5 Run with Docker (optional)

Instead of 1.2–1.4, after configuring both `.env` files (1.1), from `web_dashboard/`:

```bash
docker compose up -d --build                      # dashboard :3000 (nginx), API :5000
docker compose exec server node seed.js <FIREBASE_UID>   # optional demo data
docker compose down
```

The same live-system warning applies. Details are in [`web_dashboard/README.md`](web_dashboard/README.md#docker).

---

## 2. Run the mobile app

A Flutter app that uses the same Firebase project as the website.

### 2.1 Configure Firebase

The repo contains Android config only (`mobile_app/android/app/google-services.json`); `main.dart` calls
`Firebase.initializeApp()` with no options. iOS, web and desktop are **not configured** —
`lib/firebase_options.dart` throws on them. To use your own Firebase project or another platform,
run the FlutterFire CLI:

```bash
dart pub global activate flutterfire_cli
cd mobile_app
flutterfire configure
```

This rewrites `lib/firebase_options.dart` and drops the platform config files
(`google-services.json` for Android, `GoogleService-Info.plist` for iOS). For non-Android platforms, also change
`main.dart` to `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`.

### 2.2 Install dependencies

```bash
cd mobile_app
flutter pub get
```

### 2.3 Run

```bash
flutter devices          # list connected devices / emulators
flutter run --dart-define=API_BASE_URL=http://<your-computer-ip>:5000
```

The app reads and writes Firestore directly; only the AI features and account deletion call the server.
`API_BASE_URL` defaults to `http://10.0.2.2:5000` (your computer, as seen from an Android emulator), so
on an emulator a plain `flutter run` works. On a real phone, use your computer's LAN IP.

Common targets: `flutter run -d <deviceId>`, `flutter emulators --launch <id>` to start an Android emulator first.

### 2.4 Build a release artifact (optional)

```bash
flutter build apk        # Android APK  → build/app/outputs/flutter-apk/
flutter build appbundle  # Android AAB
flutter build ios        # iOS (macOS + Xcode required)
```

---

## 3. Firmware (optional, for real hardware)

ESP32 project built with [PlatformIO](https://platformio.org/).

```bash
cd firmware
pio run                  # build
pio run -t upload        # flash a connected ESP32
pio device monitor       # serial monitor @ 115200 baud
```

Before flashing, copy `firmware/include/secrets.example.h` to `firmware/include/secrets.h` and fill in your WiFi
and MQTT credentials (`secrets.h` is gitignored; the build fails with a hint if it's missing).
The device publishes sensor readings every 60s and subscribes to actuator command topics; the server's
MQTT bridge relays these to and from Firestore.

### Camera node (ESP32-CAM)

A separate PlatformIO project for an AI-Thinker ESP32-CAM that fills each zone's **Camera feed**
automatically: one photo right after boot, then one per 4-hour UTC window (00/04/08/12/16/20).

```bash
cd firmware_cam
pio run                  # build
pio run -t upload        # flash — ESP32-CAM seated on the ESP32-CAM-MB USB board
pio device monitor       # serial monitor @ 115200 baud — note the "Device ID: ESP32CAM-…" line
```

1. Copy `firmware_cam/include/secrets.example.h` to `firmware_cam/include/secrets.h` and fill in the same
   WiFi/MQTT credentials. Frame size, JPEG quality, flip/mirror and flash LED are constants at the top of
   `firmware_cam/src/main.cpp`.
2. With the server running, the camera registers itself as a `camera` device on its first message.
   Claim its `ESP32CAM-…` ID on the Devices page, then assign it in the zone's Overview → **Camera** card.
3. Photos are published as raw JPEG to `grownex/{id}/camera`; the bridge stores them exactly like a manual
   "+ Add photo" upload. Photos taken while the server is down are not queued (they're lost, like sensor readings).

If the board keeps resetting ("Brownout detector was triggered"), power it from a solid 5V/2A supply —
the camera plus WiFi peaks above what many USB ports deliver.

### No hardware? Use the simulator

[`device_simulator/`](device_simulator/) runs a fake sensor/relay node and a fake camera on your computer,
using the same broker credentials (`firmware/include/secrets.h`) and the same MQTT messages as the boards:

```bash
cd device_simulator && npm install && npm start
```

Claim and assign the two simulated devices like real ones, then type `dry`, `hot`, `photo` or `offline`
to trigger watering, alerts, the camera feed or a power cut. See its README for details.

---

## Tests

None of these touch the live Firebase project or real hardware.

```bash
cd web_dashboard/client && npm test            # analytics, plant-health, zone-fit logic
cd web_dashboard/server && npm test            # AI output validation, schedule parsers, zone status
cd web_dashboard/server && npm run test:integration   # real server vs Firebase emulators + local MQTT (needs Java 21+)
cd device_simulator && npm test                # simulator's MQTT contract
cd mobile_app && flutter test                  # same logic cases as the web client
cd mobile_app && flutter analyze
```

The mobile on-device walkthrough (`flutter test integration_test …`) and a local sandbox for clicking
around both apps safely are described in [`web_dashboard/README.md`](web_dashboard/README.md#tests).
The firmware has no tests.

---

## Ports

| Service | URL |
|---------|-----|
| React dashboard (Vite dev, or nginx under Docker) | http://localhost:3000 |
| Express API | http://localhost:5000 |
| API health check | http://localhost:5000/api/health |
| MQTT broker (HiveMQ, TLS) | your_cluster.s1.eu.hivemq.cloud:8883 |

## Notes

- `.env` files and Firebase service-account keys are secrets — they are git-ignored; never commit them.
- All clients must target the **same Firebase project** to share accounts and data.
- Firestore/Storage security rules and composite indexes live in the Firebase console, not in this repo.
  The notifications list needs a composite index on `notifications` (`userId` + `createdAt` desc) —
  the first query logs a link that creates it. (`web_dashboard/emulator/storage.rules` is only for the local emulators.)
- Automation timers live in the server's memory. Restarting it mid-watering (including a `--watch` reload)
  can leave an actuator on until you switch it off.
- See [`web_dashboard/README.md`](web_dashboard/README.md) for more detail on the dashboard's structure.
