import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { uploadZonePhoto } from '../lib/photoUpload'
import Dialog from './ui/Dialog'
import TextField from './ui/TextField'
import Icon from './ui/Icon'

export default function AddZoneDialog({ onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [zoneName, setZoneName] = useState('')
  const [zoneType, setZoneType] = useState('indoor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  function handlePhotoPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!zoneName.trim()) return
    setLoading(true)
    setError('')
    try {
      const zoneRef = doc(collection(db, 'zones'))
      await setDoc(zoneRef, {
        userId: user.uid,
        zoneName: zoneName.trim(),
        zoneType,
        status: 'healthy',
        totalPlantSlots: 0,
        zonePhotoUrl: null,
        createdAt: serverTimestamp(),
      })
      if (photoFile) {
        const { error: photoErr } = await uploadZonePhoto(zoneRef.id, photoFile)
        if (photoErr) console.warn('Zone created, but photo upload failed:', photoErr)
      }
      onClose()
      navigate(`/zones/${zoneRef.id}`)
    } catch {
      setError('Failed to create zone. Please try again.')
      setLoading(false)
    }
  }

  return (
    <Dialog
      title="New zone"
      size="md"
      onClose={onClose}
      busy={loading}
      actions={<>
        <button type="button" onClick={onClose} className="btn-text">Cancel</button>
        <button type="submit" form="add-zone-form" disabled={loading} className="btn-filled">
          {loading ? 'Creating…' : 'Create zone'}
        </button>
      </>}
    >
      <form id="add-zone-form" onSubmit={handleSubmit} className="space-y-5 pt-1">
        <TextField label="Zone name" value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="e.g. Tomato bed" required autoFocus />

        <div>
          <p className="text-label-lg text-on-surface-variant mb-2">Zone type</p>
          <div role="group" aria-label="Zone type" className="segmented">
            {[['indoor', 'Indoor', 'home'], ['outdoor', 'Outdoor', 'park']].map(([v, l, ic]) => (
              <button key={v} type="button" aria-pressed={zoneType === v} onClick={() => setZoneType(v)}>
                <Icon name={zoneType === v ? 'check' : ic} />{l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-surface-container-highest grid place-items-center overflow-hidden shrink-0">
            {photoPreview
              ? <img src={photoPreview} alt="Zone preview" className="w-full h-full object-cover" />
              : <Icon name="add_photo_alternate" className="text-on-surface-variant" />}
          </div>
          <label className="btn-outlined btn-sm cursor-pointer">
            <Icon name="upload" />
            {photoFile ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoPick} className="hidden" />
          </label>
          <span className="text-body-sm text-on-surface-variant">Optional</span>
        </div>

        <p className="text-body-sm text-on-surface-variant">Assign a device from the zone's Overview once it's created.</p>
        {error && <p className="banner banner-error"><Icon name="error" />{error}</p>}
      </form>
    </Dialog>
  )
}
