function SensorRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
  )
}

export default function MonitoringTab({ zone }) {
  const lastUpdated = zone.latestTimestamp
    ? (zone.latestTimestamp?.toDate
        ? zone.latestTimestamp.toDate().toLocaleString()
        : new Date(zone.latestTimestamp).toLocaleString())
    : null

  return (
    <div className="space-y-4">
      {/* Device status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Device status</h3>
        <p className="text-sm text-gray-700 mb-1.5">
          {zone.deviceId ? `Connected to ${zone.deviceId}` : 'No device connected'}
        </p>
        <span className={`text-sm font-medium ${zone.deviceId ? 'text-green-600' : 'text-red-500'}`}>
          {zone.deviceId ? 'Online' : 'Disconnected'}
        </span>
      </div>

      {/* Latest readings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Latest readings</h3>
        <SensorRow label="Temperature" value={zone.latestTemp     != null ? `${zone.latestTemp}°C`     : null} />
        <SensorRow label="Humidity"    value={zone.latestHumid    != null ? `${zone.latestHumid}%`    : null} />
        <SensorRow label="Light"       value={zone.latestLight    != null ? `${zone.latestLight} lx`  : null} />
        <SensorRow label="Moisture"    value={zone.latestMoisture != null ? `${zone.latestMoisture}%` : null} />
        {lastUpdated && (
          <p className="text-xs text-gray-400 mt-3">Last updated {lastUpdated}</p>
        )}
      </div>

      {/* Camera placeholder */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-48 flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl text-gray-200">📷</span>
          <p className="text-sm text-gray-400 mt-2">Camera feed</p>
        </div>
      </div>
    </div>
  )
}
