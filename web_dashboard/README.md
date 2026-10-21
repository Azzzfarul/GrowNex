# GrowNex Web Dashboard

FERN stack web dashboard for the GrowNex plant monitoring system.

| Layer    | Technology            |
|----------|-----------------------|
| Firebase | Auth + Firestore       |
| Express  | REST API (Node.js)    |
| React    | Vite + Tailwind CSS   |
| Node     | v18+                  |

## Project structure

```
web_dashboard/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/layout/   # Sidebar, Topbar, Layout
│       ├── components/ui/       # Reusable UI components
│       ├── context/             # AuthContext
│       ├── pages/               # Dashboard, Analytics, Plants, Devices, Login
│       └── firebase.js          # Firebase SDK init
└── server/          # Express.js backend
    └── src/
        ├── routes/              # /api/auth  /api/plants  /api/analytics
        ├── middleware/          # verifyToken (Firebase Admin)
        └── firebase-admin.js    # Admin SDK init
```

## Setup

### 1. Firebase config

Copy both `.env.example` files and fill in your Firebase credentials.

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

For the server, download a Firebase Admin service account JSON from the Firebase console and populate `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.

### 2. Install dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### 3. Run

Open two terminals:

```bash
# Terminal 1 — React client (http://localhost:3000)
cd client && npm run dev

# Terminal 2 — Express server (http://localhost:5000)
cd server && npm run dev
```

Login uses the same Firebase Auth accounts created via the mobile app.

## Tests

No live Firebase project or hardware is touched by any of these.

```bash
cd client && npm test                 # analytics, plant-health and zone-fit logic
cd server && npm test                 # AI output validation, schedule parsers, zone status
cd server && npm run test:integration # real server + MQTT bridge + nightly job (~1-2 min)
```

The integration suite starts the Firebase emulators (Auth, Firestore, Storage, project
`demo-grownex`; needs Java 21+) and an in-process MQTT broker, then drives fake devices
and REST calls through the real server.

### Local sandbox

To click around the apps safely, run them against the emulators instead of the live project.
`PROJECT` is any ID: use `demo-grownex` for the web app alone, or `grownex-iot` (the ID in the
mobile app's `google-services.json`) when the phone app is involved.

```bash
# 1. Firebase emulators (Auth, Firestore, Storage)
npx firebase-tools emulators:start --project $PROJECT --only auth,firestore,storage
# 2. MQTT broker on :1883 + a fake sensor node ESP32-MOB01 (readings every 3 s)
cd server && node test/sandbox.js
# 3. Server against the emulators and the local broker
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIREBASE_PROJECT_ID=$PROJECT \
FIREBASE_STORAGE_BUCKET=$PROJECT.appspot.com MQTT_BROKER_HOST=127.0.0.1 MQTT_BROKER_PORT=1883 \
MQTT_USER= MQTT_PASS= npm start
# 4a. Web client
VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=$PROJECT VITE_FIREBASE_API_KEY=fake \
VITE_FIREBASE_STORAGE_BUCKET=$PROJECT.appspot.com npm run dev
# 4b. Mobile app on an Android emulator (debug builds only)
cd ../mobile_app && flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

### Mobile tests

```bash
cd mobile_app && flutter test                        # shared logic, same cases as client/test
# Full walkthrough on an Android emulator, with the sandbox above running (PROJECT=grownex-iot)
# and ESP32-MOB01 unclaimed (restart test/sandbox.js against fresh emulators, or delete its doc):
flutter test integration_test --dart-define=USE_FIREBASE_EMULATORS=true
```
