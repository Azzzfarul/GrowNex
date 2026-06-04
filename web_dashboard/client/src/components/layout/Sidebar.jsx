import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/plants',    label: 'Plants',    icon: '❧' },
  { to: '/analytics', label: 'Analytics', icon: '◈' },
  { to: '/devices',   label: 'Devices',   icon: '⊕' },
  { to: '/profile',   label: 'Profile',   icon: '◉' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col">
      <div className="px-6 py-5 flex items-center gap-2 border-b border-gray-100">
        <span className="text-2xl">🌱</span>
        <span className="text-lg font-bold text-brand-700 tracking-tight">GrowNex</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 px-3">Final Year Project</p>
      </div>
    </aside>
  )
}
