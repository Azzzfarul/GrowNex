// Zone/plant status as an M3 label in the matching container color
function tone(status) {
  const s = status?.toLowerCase() || ''
  if (s === 'healthy') return 'bg-primary-container text-on-primary-container'
  if (s === 'stable') return 'bg-tertiary-container text-on-tertiary-container'
  if (s.includes('attention')) return 'bg-warning-container text-on-warning-container'
  if (s === 'critical' || s === 'wilting') return 'bg-error-container text-on-error-container'
  return 'bg-surface-container-highest text-on-surface-variant'
}

export default function StatusLabel({ status, className = '' }) {
  return (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-lg text-label-md capitalize shrink-0 ${tone(status)} ${className}`}>
      {status || 'Unknown'}
    </span>
  )
}
