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
