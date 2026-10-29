import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import NotificationBell from '../NotificationPanel'

// One header row per page: optional back button, title (+ inline tags), subtitle, actions, notifications.
export default function PageHeader({ title, subtitle, back, actions, children }) {
  const navigate = useNavigate()
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3 pt-6 pb-6">
      {back && (
        <button onClick={() => navigate(back)} className="icon-btn text-on-surface -ml-2" aria-label="Back" data-tip="Back">
          <Icon name="arrow_back" />
        </button>
      )}
      <div className="flex-1 min-w-[12rem]">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-headline-md text-on-surface">{title}</h1>
          {children}
        </div>
        {subtitle && <p className="text-body-md text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <NotificationBell />
      </div>
    </header>
  )
}
