import Icon from './Icon'

export default function EmptyState({ icon, title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center text-center gap-2 px-6 py-12 rounded-xl border border-dashed border-outline-variant ${className}`}>
      <span className="grid place-items-center w-14 h-14 rounded-full bg-secondary-container text-on-secondary-container mb-2">
        <Icon name={icon} />
      </span>
      <p className="text-title-md text-on-surface">{title}</p>
      {body && <p className="text-body-md text-on-surface-variant max-w-sm">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
