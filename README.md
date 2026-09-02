# GrowNex

Full-stack IoT smart plant / farming monitoring and automation system.

| Part | Stack | Location |
|------|-------|----------|
| Firmware | C++ / Arduino (ESP32), PlatformIO | [`firmware/`](firmware/) |
| Backend | Express.js + MQTT bridge, Firebase Admin | [`web_dashboard/server/`](web_dashboard/server/) |
| Web dashboard | React + Vite + Tailwind CSS | [`web_dashboard/client/`](web_dashboard/client/) |
| Mobile app | Flutter / Dart | [`mobile_app/`](mobile_app/) |

Auth and data are shared across all clients through **Firebase Auth + Cloud Firestore**. Devices talk to the backend over **MQTT (HiveMQ, TLS 8883)**; the server's MQTT bridge mirrors that traffic into Firestore.

---

## Prerequisites

- **Node.js** v18+ and npm
- **Flutter SDK** (Dart >= 3.12) — run `flutter doctor` to verify your toolchain
- A **Firebase project** with Auth (Email/Password) and Firestore enabled
- A Firebase **service account** JSON (for the server) — *Project settings → Service accounts → Generate new private key*
- A **HiveMQ Cloud** cluster (or any MQTT broker) for device traffic — only needed if you run real firmware

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
MQTT_BROKER_HOST=your_cluster.s1.eu.hivemq.cloud
MQTT_BROKER_PORT=8883
MQTT_USER=your_mqtt_username
MQTT_PASS=your_mqtt_password
```

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

Open <http://localhost:3000>. The Vite dev server proxies `/api/*` to the server on port 5000.
Health check: <http://localhost:5000/api/health>.

Register an account from the app's Register page (or the mobile app). To load demo zones/plants/devices for that account:

```bash
cd web_dashboard/server
node seed.js <FIREBASE_UID>          # add demo data
node seed.js <FIREBASE_UID> --clean  # remove it
```

### 1.4 Production build (optional)

```bash
cd web_dashboard/client && npm run build   # outputs dist/
npm run preview                            # serve the build locally

cd ../server && npm start                  # run the API without --watch
```

---

## 2. Run the mobile app

A Flutter app that uses the same Firebase project as the website.

### 2.1 Configure Firebase

The repo already contains generated config (`mobile_app/lib/firebase_options.dart`,
`mobile_app/android/app/google-services.json`). To point the app at **your own** Firebase project,
regenerate them with the FlutterFire CLI:

```bash
dart pub global activate flutterfire_cli
cd mobile_app
flutterfire configure
```

This rewrites `lib/firebase_options.dart` and drops the platform config files
(`google-services.json` for Android, `GoogleService-Info.plist` for iOS).

### 2.2 Install dependencies

```bash
cd mobile_app
flutter pub get
```

### 2.3 Run

```bash
flutter devices          # list connected devices / emulators
flutter run              # run on the default device
flutter run -d chrome    # or run in a browser
```

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

Set your WiFi and MQTT credentials in `firmware/src/main.cpp` (or an `include/` secrets header) before flashing.
The device publishes sensor readings every 60s and subscribes to actuator command topics; the server's
MQTT bridge relays these to and from Firestore.

---

## Ports

| Service | URL |
|---------|-----|
| React dashboard (Vite dev) | http://localhost:3000 |
| Express API | http://localhost:5000 |
| API health check | http://localhost:5000/api/health |
| MQTT broker (HiveMQ, TLS) | your_cluster.s1.eu.hivemq.cloud:8883 |

## Notes

- `.env` files and Firebase service-account keys are secrets — they are git-ignored; never commit them.
- All clients must target the **same Firebase project** to share accounts and data.
- See [`web_dashboard/README.md`](web_dashboard/README.md) for more detail on the dashboard's structure.
