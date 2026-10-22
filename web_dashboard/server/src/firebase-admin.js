import { initializeApp, cert } from 'firebase-admin/app'

// Emulators (tests, local runs) need no service account.
const useEmulators = !!process.env.FIRESTORE_EMULATOR_HOST

initializeApp({
  ...(useEmulators ? {} : {
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  }),
  projectId:     process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
})
