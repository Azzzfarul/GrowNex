import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'
import TextField from '../components/ui/TextField'
import Dialog from '../components/ui/Dialog'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'
import { formatRelative } from '../hooks/useNotifications'

function AddDeviceModal({ user, onClose }) {
  const [searchId,           setSearchId]           = useState('')
  const [foundDevice,        setFoundDevice]        = useState(null)
  const [searching,          setSearching]          = useState(false)
  const [searchError,        setSearchError]        = useState(null)
  const [claiming,           setClaiming]           = useState(false)
  const [claimError,         setClaimError]         = useState(null)
  const [hasLightingModule,  setHasLightingModule]  = useState(false)
  const [hasFertilizerModule,setHasFertilizerModule]= useState(false)
  const [nearbyDevices,      setNearbyDevices]      = useState(null) // null = still loading
  const [discoverError,      setDiscoverError]      = useState(null)
  const [showManual,         setShowManual]         = useState(false)

  // Discovery: the bridge auto-creates a devices/{id} doc with userId '' on a device's first MQTT
  // message, so unclaimed devices are already listed here. Only online ones are shown (status is
  // retained + LWT) so stale/test docs don't clutter the list; anything else uses the ID fallback.
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', '')),
      (snap) => {
        setNearbyDevices(snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.status === 'online')
          .sort((a, b) => (b.lastSync?.toMillis?.() ?? 0) - (a.lastSync?.toMillis?.() ?? 0)))
      },
      (err) => {
        console.error('Device discovery failed:', err)
        setDiscoverError("Couldn't search for devices. Enter the device ID instead.")
        setShowManual(true)
      }
    )
  }, [])

  function selectDevice(d) {
    setFoundDevice(d)
    setHasLightingModule(!!d.hasLightingModule)
    setHasFertilizerModule(!!d.hasFertilizerModule)
    setSearchError(null)
    setClaimError(null)
  }

  async function search() {
    const id = searchId.trim()
    if (!id) return
    setSearching(true)
    setSearchError(null)
    setFoundDevice(null)
    try {
      const snap = await getDoc(doc(db, 'devices', id))
      if (!snap.exists()) {
        setSearchError('Device not found. Check the ID and try again.')
      } else {
        const d = { id: snap.id, ...snap.data() }
        if (d.userId && d.userId !== user.uid) {
          setSearchError('This device is already registered to another account.')
        } else {
          selectDevice(d)
        }
      }
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function claim() {
    if (!foundDevice) return
    setClaiming(true)
    setClaimError(null)
    try {
      // Transaction so two users claiming the same listed device can't both win.
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'devices', foundDevice.id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('This device no longer exists.')
        const owner = snap.data().userId
        if (owner && owner !== user.uid) throw new Error('This device was just claimed by another account.')
        tx.update(ref, { userId: user.uid, hasLightingModule, hasFertilizerModule })
      })
      onClose()
    } catch (err) {
      setClaimError(err?.message?.startsWith('This device')
        ? err.message
        : 'Failed to claim device. Please try again.')
      setClaiming(false)
    }
  }

  const isIndoor = foundDevice?.deviceType?.toLowerCase() === 'indoor'
  const isCamera = foundDevice?.deviceType === 'camera'
  const isOnline = foundDevice?.status === 'online'

  return (
    <Dialog
      title="Add device"
      size="md"
      onClose={onClose}
      busy={claiming}
      actions={<>
        <button onClick={onClose} className="btn-text">Cancel</button>
        <button onClick={claim} disabled={!foundDevice || claiming} className="btn-filled">{claiming ? 'Claiming…' : 'Claim device'}</button>
      </>}
    >
      <p className="mb-5">Pick a device that's powered on and connected, or enter its ID.</p>

      {!discoverError && (
        <div className="mb-4">
          <p className="text-title-sm text-on-surface mb-2">New devices nearby</p>
          {nearbyDevices === null ? (
            <div className="progress-linear my-4" role="progressbar" aria-label="Searching" />
          ) : nearbyDevices.length === 0 ? (
            <p className="rounded-xl bg-surface-container px-4 py-3">
              No new devices found. Power on your device and keep the server running — it shows up here
              a few seconds after connecting.
            </p>
          ) : (
            <div className="rounded-xl border border-outline-variant overflow-hidden max-h-60 overflow-y-auto divide-y divide-outline-variant">
              {nearbyDevices.map((d) => {
                const camera = d.deviceType === 'camera'
                const selected = foundDevice?.id === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => selectDevice(d)}
                    aria-pressed={selected}
                    className={`state-layer list-row w-full ${selected ? 'bg-secondary-container text-on-secondary-container' : ''}`}
                  >
                    <span className="list-icon"><Icon name={camera ? 'photo_camera' : 'sensors'} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-body-lg text-on-surface truncate">{d.deviceName}</span>
                      <span className="block text-body-sm text-on-surface-variant truncate">
                        {camera ? 'Camera' : d.deviceType === 'outdoor' ? 'Outdoor' : 'Indoor'}
                        {d.deviceName !== d.id && <span className="font-mono"> · {d.id}</span>}
                      </span>
                    </span>
                    {selected
                      ? <Icon name="check_circle" filled className="text-primary" />
                      : <span className="flex items-center gap-1.5 text-label-md text-primary"><span className="w-2 h-2 rounded-full bg-primary" />Online</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {discoverError && <p className="banner banner-error mb-4"><Icon name="error" />{discoverError}</p>}

      {!showManual ? (
        <button type="button" onClick={() => setShowManual(true)} className="btn-text btn-sm -ml-2 mb-2">
          <Icon name="keyboard" />Enter a device ID instead
        </button>
      ) : (
        <div className="flex items-start gap-2 mb-4">
          <TextField
            label="Device ID"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="e.g. ESP32-ABCD1234"
            className="flex-1"
            error={searchError}
          />
          <button onClick={search} disabled={searching || !searchId.trim()} className="btn-tonal h-12">
            {searching ? 'Finding…' : 'Find'}
          </button>
        </div>
      )}

      {foundDevice && (
        <div className="card-outlined p-4 mb-2">
          <div className="flex items-center gap-3">
            <Icon name="check_circle" filled className="text-primary" />
            <div>
              <p className="text-body-lg text-on-surface">{foundDevice.deviceName}</p>
              <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant capitalize">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-outline'}`} />
                {foundDevice.deviceType ?? 'Unknown'} · {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          {!isCamera && (
            <div className="border-t border-outline-variant pt-3 mt-3">
              <p className="text-label-lg text-on-surface-variant mb-1">Installed modules</p>
              {[
                ['science', 'Fertilizer module', hasFertilizerModule, setHasFertilizerModule],
                ['light_mode', 'Light module', hasLightingModule, setHasLightingModule],
              ].map(([icon, label, checked, set]) => (
                <label key={label} className="state-layer flex items-center gap-3 h-12 px-2 -mx-2 rounded-lg cursor-pointer">
                  <Icon name={icon} size={20} className="text-on-surface-variant" />
                  <span className="flex-1 text-body-lg text-on-surface">{label}</span>
                  <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} className="checkbox" />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {claimError && <p className="banner banner-error mt-3"><Icon name="error" />{claimError}</p>}
    </Dialog>
  )
}

const TYPE_LABEL = { camera: 'Camera', indoor: 'Indoor', outdoor: 'Outdoor' }

export default function DevicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [zoneNames, setZoneNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', user.uid)),
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [user])

  // Zone names for the Zone column
  useEffect(() => {
    if (!user) return
    return onSnapshot(query(collection(db, 'zones'), where('userId', '==', user.uid)), (snap) => {
      setZoneNames(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().zoneName])))
    })
  }, [user])

  const onlineCount = devices.filter((d) => d.status === 'online').length
  const offlineCount = devices.length - onlineCount
  const shown = devices.filter((d) => filter === 'all' || (filter === 'online') === (d.status === 'online'))

  return (
    <div>
      <PageHeader
        title="Devices"
        subtitle="Sensor nodes and cameras on your account"
        actions={<button onClick={() => setShowAdd(true)} className="btn-filled"><Icon name="add" />Add device</button>}
      />

      {loading ? <Loading /> : devices.length === 0 ? (
        <EmptyState
          icon="router"
          title="No devices yet"
          body="Power on a GrowNex sensor node or camera, then add it here."
          action={<button onClick={() => setShowAdd(true)} className="btn-filled"><Icon name="add" />Add device</button>}
        />
      ) : (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[['all', 'All', devices.length], ['online', 'Online', onlineCount], ['offline', 'Offline', offlineCount]].map(([k, l, n]) => (
              <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`chip ${filter === k ? 'chip-selected' : ''}`}>
                {filter === k && <Icon name="check" />}{l}<span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Device</th><th>Type</th><th>Zone</th><th>Status</th><th>Last seen</th><th className="w-12" /></tr>
              </thead>
              <tbody>
                {shown.map((device) => {
                  const online = device.status === 'online'
                  return (
                    <tr key={device.id} role="link" tabIndex={0}
                      onClick={() => navigate(`/devices/${device.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/devices/${device.id}`)}>
                      <td>
                        <span className="flex items-center gap-3">
                          <span className={`list-icon ${online ? '' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                            <Icon name={device.deviceType === 'camera' ? 'photo_camera' : 'sensors'} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-body-lg text-on-surface">{device.deviceName}</span>
                            {device.deviceName !== device.id && <span className="block text-body-sm text-on-surface-variant font-mono">{device.id}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="text-on-surface-variant">{TYPE_LABEL[device.deviceType] ?? 'Outdoor'}</td>
                      <td className="text-on-surface-variant">{zoneNames[device.assignedZoneId] ?? '—'}</td>
                      <td>
                        <span className={`tag ${online ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                          <Icon name={online ? 'wifi' : 'wifi_off'} />{online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="text-on-surface-variant whitespace-nowrap">{device.lastSync ? formatRelative(device.lastSync) : 'Never'}</td>
                      <td><Icon name="chevron_right" className="text-on-surface-variant" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {shown.length === 0 && <p className="p-6 text-center text-body-md text-on-surface-variant">No {filter} devices.</p>}
          </div>
        </>
      )}

      {showAdd && <AddDeviceModal user={user} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
