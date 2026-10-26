// Client-side plant/zone photo upload to Firebase Storage + the small Firestore metadata docs
// that point at it. Swallows errors and returns { error } — matches aiSummary.js's convention
// of degrading gracefully (callers show inline text, no toast library exists in this app).

import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage'
import { doc, updateDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { storage, db } from '../firebase'

function fourHourBucketId(date = new Date()) {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCHours(Math.floor(d.getUTCHours() / 4) * 4)
  return d.toISOString().slice(0, 13) // e.g. "2026-01-15T12"
}

function downscaleToJpeg(file, maxEdge = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxEdge || height > maxEdge) {
        if (width >= height) {
          height = Math.round((height / width) * maxEdge)
          width = maxEdge
        } else {
          width = Math.round((width / height) * maxEdge)
          height = maxEdge
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to encode image'))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

export async function uploadPlantPhoto(plantId, file) {
  try {
    const blob = await downscaleToJpeg(file)
    const storageRef = ref(storage, `plantPhotos/${plantId}.jpg`)
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
    const photoUrl = await getDownloadURL(storageRef)
    await updateDoc(doc(db, 'plants', plantId), { photoUrl })
    return { photoUrl }
  } catch (err) {
    return { error: err.message ?? 'Failed to upload photo' }
  }
}

// A missing file is already the goal; any other Storage error is thrown so the caller can retry.
export const deleteFile = (path) =>
  deleteObject(ref(storage, path)).catch((e) => { if (e.code !== 'storage/object-not-found') throw e })

// Storage object only — delete it before the plant doc, so a failure leaves something to retry
export const removePlantPhotoFile = (plantId) => deleteFile(`plantPhotos/${plantId}.jpg`)

export async function removePlantPhoto(plantId) {
  try {
    await removePlantPhotoFile(plantId)
    await updateDoc(doc(db, 'plants', plantId), { photoUrl: null })
    return {}
  } catch (err) {
    return { error: err.message ?? 'Failed to remove photo' }
  }
}

export async function uploadZonePhoto(zoneId, file) {
  try {
    const blob = await downscaleToJpeg(file)
    const storageRef = ref(storage, `zonePhotos/${zoneId}.jpg`)
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
    const zonePhotoUrl = await getDownloadURL(storageRef)
    await updateDoc(doc(db, 'zones', zoneId), { zonePhotoUrl })
    return { zonePhotoUrl }
  } catch (err) {
    return { error: err.message ?? 'Failed to upload photo' }
  }
}

export async function removeZonePhoto(zoneId) {
  try {
    await deleteFile(`zonePhotos/${zoneId}.jpg`)
    await updateDoc(doc(db, 'zones', zoneId), { zonePhotoUrl: null })
    return {}
  } catch (err) {
    return { error: err.message ?? 'Failed to remove photo' }
  }
}

export async function uploadZoneSnapshot(zoneId, file) {
  try {
    const bucketId = fourHourBucketId()
    const blob = await downscaleToJpeg(file)
    const storagePath = `zoneSnapshots/${zoneId}/${bucketId}.jpg`
    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
    const imageUrl = await getDownloadURL(storageRef)
    await setDoc(doc(db, 'zones', zoneId, 'snapshots', bucketId), {
      imageUrl,
      storagePath,
      capturedAt: Timestamp.now(),
      createdAt: serverTimestamp(),
    })
    return { imageUrl }
  } catch (err) {
    return { error: err.message ?? 'Failed to upload photo' }
  }
}
