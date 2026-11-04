import Icon from '../ui/Icon'

const FEATURES = [
  ['sensors', 'Live readings', 'Temperature, humidity, light and soil moisture for every zone.'],
  ['water_drop', 'Hands-off care', 'Water, light and feed on schedules or when the soil runs dry.'],
  ['auto_awesome', 'Growing advice', 'Plain-language summaries and plans for your plants.'],
]

// Sign-in / register / reset: brand panel on large screens, form column on the right
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-surface">
      <aside className="hidden lg:flex flex-col justify-between relative overflow-hidden m-3 rounded-[28px] p-12 bg-primary-container text-on-primary-container">
        <Icon name="eco" filled size={420} className="absolute -right-24 -bottom-24 opacity-[.07] rotate-12" />
        <div className="flex items-center gap-2">
          <Icon name="eco" filled size={32} />
          <span className="text-title-lg">GrowNex</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-display-sm">Healthier plants, on autopilot.</h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(([icon, title, body]) => (
              <li key={title} className="flex gap-4">
                <span className="grid place-items-center w-10 h-10 rounded-full bg-primary text-on-primary shrink-0"><Icon name={icon} size={20} /></span>
                <div>
                  <p className="text-title-md">{title}</p>
                  <p className="text-body-md opacity-80">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-sm opacity-70">IoT plant monitoring and automation</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <Icon name="eco" filled className="text-primary" size={32} />
            <span className="text-title-lg text-on-surface">GrowNex</span>
          </div>
          <h1 className="text-headline-md text-on-surface">{title}</h1>
          {subtitle && <p className="text-body-lg text-on-surface-variant mt-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
