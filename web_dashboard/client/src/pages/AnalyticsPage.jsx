import { useState, useEffect } from 'react'
import {
  collection, query, where, onSnapshot,
  getDocs, orderBy, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildChartData(readings) {
  const buckets = {}
  for (const r of readings) {
    const ts = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
    const label = DAY_LABELS[ts.getDay()]
    if (!buckets[label]) buckets[label] = { moisture: [], temp: [], humidity: [] }
    if (r.moisture    != null) buckets[label].moisture.push(r.moisture)
    if (r.temperature != null) buckets[label].temp.push(r.temperature)
    if (r.humidity    != null) buckets[label].humidity.push(r.humidity)
  }
  return Object.entries(buckets).map(([day, v]) => ({
    day,
    moisture: v.moisture.length ? Math.round(v.moisture.reduce((a, b) => a + b) / v.moisture.length) : undefined,
    temp:     v.temp.length     ? Math.round(v.temp.reduce((a, b) => a + b)     / v.temp.length * 10) / 10 : undefined,
    humidity: v.humidity.length ? Math.round(v.humidity.reduce((a, b) => a + b) / v.humidity.length) : undefined,
  }))
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b) / arr.length * 10) / 10 : null
}

export default function AnalyticsPage() {
  const { user } = useAuth()
  const [zones, setZones] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const unsub = onSnapshot(
      query(collection(db, 'zones'), where('userId', '==', user.uid)),
      async (snap) => {
        const zoneList = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setZones(zoneList)

        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const arrays = await Promise.all(
          zoneList.map((zone) =>
            getDocs(
              query(
                collection(db, 'zones', zone.id, 'sensorReadings'),
                where('timestamp', '>=', Timestamp.fromDate(sevenDaysAgo)),
                orderBy('timestamp', 'asc'),
              )
            ).then((s) => s.docs.map((d) => d.data()))
          )
        )

        setChartData(buildChartData(arrays.flat()))
        setLoading(false)
      }
    )

    return unsub
  }, [user])

  const avgHumid    = avg(zones.filter((z) => z.latestHumid    != null).map((z) => z.latestHumid))
  const avgTemp     = avg(zones.filter((z) => z.latestTemp     != null).map((z) => z.latestTemp))
  const avgMoisture = avg(zones.filter((z) => z.latestMoisture != null).map((z) => z.latestMoisture))

  const metrics = [
    { label: 'Moisture level', value: avgMoisture != null ? `${avgMoisture}%`  : '—', desc: 'Avg soil moisture across zones.',   color: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700'   },
    { label: 'Temperature',    value: avgTemp     != null ? `${avgTemp}°C`     : '—', desc: 'Avg ambient temperature.',           color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700' },
    { label: 'Humidity',       value: avgHumid    != null ? `${avgHumid}%`     : '—', desc: 'Avg humidity across zones.',         color: 'text-brand-600',  badge: 'bg-brand-100 text-brand-700'  },
  ]

  if (loading) {
    return <p className="text-sm text-gray-400 mt-8 text-center">Loading…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">Track plant health and growing conditions in one place.</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">7-day sensor trends</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No sensor readings in the last 7 days.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="moisture" stroke="#3b82f6" strokeWidth={2} dot={false} name="Moisture %" connectNulls />
              <Line type="monotone" dataKey="temp"     stroke="#f97316" strokeWidth={2} dot={false} name="Temp °C"    connectNulls />
              <Line type="monotone" dataKey="humidity" stroke="#22c55e" strokeWidth={2} dot={false} name="Humidity %" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map(({ label, value, desc, color, badge }) => (
          <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
            <div className="flex items-center justify-between">
              <span className={`text-3xl font-bold ${color}`}>{value}</span>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${badge}`}>Live</span>
            </div>
            <p className="text-sm text-gray-400 mt-3">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
