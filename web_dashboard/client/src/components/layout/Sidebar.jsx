import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useTheme } from '../../context/ThemeContext'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { to: '/plants',    label: 'Plants',    icon: 'potted_plant' },
  { to: '/analytics', label: 'Analytics', icon: 'monitoring' },
  { to: '/devices',   label: 'Devices',   icon: 'router' },
  { to: '/profile',   label: 'Profile',   icon: 'account_circle' },
]

// M3 navigation rail below lg, standard navigation drawer from lg up (styles: .nav-item in index.css).
// The FAB holds the app's main create action.
export default function Sidebar({ onAddZone }) {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <aside className="w-20 lg:w-64 shrink-0 flex flex-col items-center lg:items-stretch py-4 lg:px-3">
      <div className="h-12 flex items-center gap-2 lg:px-4 mb-2">
        <Icon name="eco" filled className="text-primary" size={28} />
        <span className="hidden lg:inline text-title-lg text-on-surface">GrowNex</span>
      </div>

      <button onClick={onAddZone} className="fab mb-6 lg:self-start lg:ml-1 lg:pr-5" aria-label="New zone">
        <Icon name="add" />
        <span className="hidden lg:inline">New zone</span>
      </button>

      <nav className="flex-1 flex flex-col gap-3 lg:gap-1">
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

      <button
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        className="icon-btn lg:ml-2"
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        data-tip={dark ? 'Light theme' : 'Dark theme'}
      >
        <Icon name={dark ? 'light_mode' : 'dark_mode'} />
      </button>
    </aside>
  )
}
