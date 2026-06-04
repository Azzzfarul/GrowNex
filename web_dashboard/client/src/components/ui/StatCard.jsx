export default function StatCard({ title, value, subtitle, accent = 'green' }) {
  const accentMap = {
    green: 'bg-brand-50 text-brand-700',
    blue:  'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    teal:  'bg-teal-50 text-teal-700',
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <p className="text-sm text-gray-500 mb-3">{title}</p>
      <p className={`inline-block text-2xl font-bold px-3 py-1 rounded-lg ${accentMap[accent]}`}>
        {value}
      </p>
      {subtitle && <p className="mt-3 text-sm text-gray-400">{subtitle}</p>}
    </div>
  )
}
