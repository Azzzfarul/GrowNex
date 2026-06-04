function SensorRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-gray-50">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value ?? '—'}</span>
    </div>
  )
}

export default function OverviewTab({ zone }) {
  return (
    <div className="space-y-4">
      {/* Zone photo */}
      <div className="w-full h-44 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center">
        {zone.zonePhotoUrl ? (
          <img src={zone.zonePhotoUrl} alt={zone.zoneName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl text-gray-300">🖼</span>
        )}
      </div>

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-3">
          {zone.zoneType}
        </p>
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            Total plant slots: <span className="font-semibold">{zone.totalPlantSlots}</span>
          </p>
          <p className="text-sm text-gray-700">
            {zone.deviceId ? `Device: ${zone.deviceId}` : 'No device connected'}
          </p>
          {zone.alertSummary && (
            <p className="text-sm text-orange-500 mt-2">{zone.alertSummary}</p>
          )}
        </div>
      </div>

      {/* Sensor card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Latest sensor readings</h3>
        <SensorRow label="Temperature" value={zone.latestTemp     != null ? `${zone.latestTemp}°C`     : null} />
        <SensorRow label="Humidity"    value={zone.latestHumid    != null ? `${zone.latestHumid}%`    : null} />
        <SensorRow label="Light"       value={zone.latestLight    != null ? `${zone.latestLight} lx`  : null} />
        <SensorRow label="Moisture"    value={zone.latestMoisture != null ? `${zone.latestMoisture}%` : null} />
        {zone.latestTimestamp && (
          <p className="text-xs text-gray-400 mt-3">
            Last updated{' '}
            {zone.latestTimestamp?.toDate
              ? zone.latestTimestamp.toDate().toLocaleString()
              : new Date(zone.latestTimestamp).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
