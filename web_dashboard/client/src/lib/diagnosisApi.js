// Runs and deletes image diagnoses. The photo goes straight to Storage under a new doc ID, then
// POST /api/ai/plant-diagnosis has the server read it, ask the model and write
// plantDiagnoses/{id} (clients can't write that collection). Returns { error } like photoUpload.js.
// Mobile: services/firestore/diagnosis_service.dart.

import { ref, uploadBytes } from 'firebase/storage'
import { collection, doc, getDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore'
import { storage, db } from '../firebase'
import { downscaleToJpeg, deleteFile } from './photoUpload'
import { diagnosisError } from './plantDiagnosis'

const API = import.meta.env.VITE_API_URL || ''

export async function runPlantDiagnosis(user, plantId, file) {
  const id = doc(collection(db, 'plantDiagnoses')).id
  const path = `plantDiagnoses/${user.uid}/${id}.jpg`
  try {
    const blob = await downscaleToJpeg(file)
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' })
    const res = await fetch(`${API}/api/ai/plant-diagnosis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ plantId, diagnosisId: id }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.source === 'ai') return { diagnosis: body.diagnosis }
    if (res.ok || res.status === 400) return { error: diagnosisError(res.ok ? body.reason : 'image') }  // the server removed the photo
    throw new Error(`plant-diagnosis → ${res.status}`)
  } catch (err) {
    console.error('Diagnosis failed:', err)
    // The server may never have seen the photo. Remove it, unless the diagnosis was saved after
    // all and only the reply got lost (reading a missing doc is refused, hence the catch).
    const saved = await getDoc(doc(db, 'plantDiagnoses', id)).then(s => s.exists(), () => false)
    if (!saved) await deleteFile(path).catch(() => {})
    return { error: diagnosisError('error') }
  }
}

// Photo first, then the doc, so a failure leaves something to retry from.
export async function deleteDiagnosis(diagnosis) {
  if (diagnosis.storagePath) await deleteFile(diagnosis.storagePath)
  await deleteDoc(doc(db, 'plantDiagnoses', diagnosis.id))
}

// A plant's diagnoses, made by any member of its zone. The zoneId filter is what the rules allow;
// two equality filters, so no composite index.
export const plantDiagnosesQuery = (zoneId, plantId) =>
  query(collection(db, 'plantDiagnoses'), where('zoneId', '==', zoneId), where('plantId', '==', plantId))

// Part of the plant and zone delete cascades.
export async function deletePlantDiagnoses(zoneId, plantId) {
  const snap = await getDocs(plantDiagnosesQuery(zoneId, plantId))
  for (const d of snap.docs) await deleteDiagnosis({ id: d.id, ...d.data() })
}
