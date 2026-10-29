import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { to: '/plants',    label: 'Plants',    icon: 'potted_plant' },
  { to: '/analytics', label: 'Analytics', icon: 'monitoring' },
  { to: '/devices',   label: 'Devices',   icon: 'router' },
  { to: '/profile',   label: 'Profile',   icon: 'account_circle' },
]

// M3 navigation rail below lg, standard navigation drawer from lg up (styles: .nav-item in index.css)
export default function Sidebar() {
  return (
    <aside className="w-20 lg:w-72 shrink-0 bg-surface-container-low flex flex-col py-3 lg:px-3">
      <div className="h-14 flex items-center justify-center lg:justify-start gap-2 lg:px-4 mb-2">
        <Icon name="eco" filled className="text-primary" size={28} />
        <span className="hidden lg:inline text-title-lg text-on-surface">GrowNex</span>
      </div>

      <nav className="flex-1 flex flex-col gap-3 lg:gap-0">
        {nav.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} className="nav-item">
            {({ isActive }) => (
              <>
                <span className="nav-pill"><Icon name={icon} filled={isActive} /></span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
  )
}
