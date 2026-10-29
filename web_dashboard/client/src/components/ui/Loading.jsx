// M3 circular progress indicator (indeterminate)
export function Spinner({ size = 40, className = '' }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={`animate-spin text-primary ${className}`} aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="90 200" />
    </svg>
  )
}

export default function Loading({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-4 py-24 text-body-md text-on-surface-variant">
      <Spinner />
      {label}
    </div>
  )
}
