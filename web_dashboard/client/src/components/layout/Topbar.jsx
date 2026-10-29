import NotificationBell from '../NotificationPanel'

// M3 small top app bar
export default function Topbar() {
  return (
    <header className="h-16 shrink-0 bg-surface flex items-center justify-end px-4 sm:px-6">
      <NotificationBell />
    </header>
  )
}
