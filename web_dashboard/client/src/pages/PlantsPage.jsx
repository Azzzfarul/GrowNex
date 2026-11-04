import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/ui/Icon'
import StatusLabel from '../components/ui/StatusLabel'
import Loading from '../components/ui/Loading'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/layout/PageHeader'

const MAX_PLANTS = 4
const FILTERS = ['All', 'Indoor', 'Outdoor']

function Reading({ icon, value }) {
  return (
    <span className="flex items-center gap-1 text-body-md text-on-surface">
      <Icon name={icon} size={18} className="text-on-surface-variant" />{value ?? '–'}
    </span>
  )
}

function ZoneTile({ z, plantCount }) {
  const navigate = useNavigate()
  const isFull = plantCount >= MAX_PLANTS
  const offline = z.deviceOnline === false
  const v = (val, unit) => (!offline && val != null ? `${val}${unit}` : null)

  return (
    <button onClick={() => navigate(`/zones/${z.id}`)} className="card card-link overflow-hidden flex flex-col">
      <div className="relative h-32 w-full bg-surface-container-highest grid place-items-center">
        {z.zonePhotoUrl
          ? <img src={z.zonePhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <Icon name={z.zoneType === 'outdoor' ? 'park' : 'yard'} size={40} className="text-on-surface-variant/60" />}
        <StatusLabel status={z.status} className="absolute top-3 right-3" />
      </div>
      <div className="p-4 flex flex-col gap-3 w-full flex-1">
        <div>
          <h2 className="text-title-md text-on-surface truncate">{z.zoneName}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="tag bg-surface-container-high text-on-surface-variant capitalize">
              <Icon name={z.zoneType === 'outdoor' ? 'park' : 'home'} />{z.zoneType}
            </span>
            <span className={`tag ${isFull ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
              <Icon name="potted_plant" />{plantCount}/{MAX_PLANTS} plants
            </span>
            <span className={`tag ${z.deviceId
              ? offline ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'
              : 'bg-surface-container-high text-on-surface-variant'}`}>
              <Icon name={z.deviceId ? (offline ? 'wifi_off' : 'wifi') : 'link_off'} />
              {z.deviceId ? (offline ? 'Offline' : 'Connected') : 'No device'}
            </span>
          </div>
        </div>
        {z.deviceId && (
          <div className="flex items-center gap-4 flex-wrap pt-3 border-t border-outline-variant">
            <Reading icon="thermostat" value={v(z.latestTemp, '°C')} />
            <Reading icon="humidity_percentage" value={v(z.latestHumid, '%')} />
            <Reading icon="water_drop" value={v(z.latestMoisture, '%')} />
            <Reading icon="light_mode" value={v(z.latestLight, '%')} />
          </div>
        )}
      </div>
    </button>
  )
}

export default function PlantsPage() {
  const { user } = useAuth()
  const { openAddZone } = useOutletContext()
  const [zones,       setZones]       = useState([])
  const [plantCounts, setPlantCounts] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('All')
  const [search,      setSearch]      = useState('')

  // Subscribe to zones
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      (snap) => {
        setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
  }, [user])

  // Subscribe to plant counts per zone (single query, grouped client-side)
  const zoneIdsKey = zones.map((z) => z.id).sort().join(',')
  useEffect(() => {
    if (zones.length === 0) { setPlantCounts({}); return }
    const ids = zones.map((z) => z.id)
    return onSnapshot(
      query(collection(db, 'plants'), where('zoneId', 'in', ids.slice(0, 30))),
      (snap) => {
        const counts = {}
        snap.docs.forEach((d) => {
          const zid = d.data().zoneId
          counts[zid] = (counts[zid] || 0) + 1
        })
        setPlantCounts(counts)
      }
    )
  }, [zoneIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const term = search.trim().toLowerCase()
  const filteredZones = zones
    .filter((z) => filter === 'All' || z.zoneType?.toLowerCase() === filter.toLowerCase())
    .filter((z) => !term || z.zoneName?.toLowerCase().includes(term))

  return (
    <div>
      <PageHeader
        title="Plant zones"
        subtitle={loading ? null : `${zones.length} zone${zones.length === 1 ? '' : 's'}`}
        actions={<button onClick={openAddZone} className="btn-filled"><Icon name="add" />Add zone</button>}
      />

      {loading ? <Loading /> : (
        <>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`chip ${filter === f ? 'chip-selected' : ''}`}>
                {filter === f && <Icon name="check" />}
                {f}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 h-10 w-full sm:w-72 px-4 rounded-full bg-surface-container-high text-on-surface-variant focus-within:outline focus-within:outline-2 focus-within:outline-primary">
              <Icon name="search" size={20} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search zones"
                aria-label="Search zones"
                className="flex-1 min-w-0 bg-transparent outline-none text-body-lg text-on-surface placeholder:text-on-surface-variant"
              />
            </label>
          </div>

          {filteredZones.length === 0 ? (
            zones.length === 0 ? (
              <EmptyState
                icon="potted_plant"
                title="No zones yet"
                body="A zone is a group of up to four plants watched by one sensor node."
                action={<button onClick={openAddZone} className="btn-filled"><Icon name="add" />Add zone</button>}
              />
            ) : (
              <EmptyState icon="search_off" title="No matching zones" body="Try a different filter or search." />
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredZones.map((z) => <ZoneTile key={z.id} z={z} plantCount={plantCounts[z.id] ?? 0} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
