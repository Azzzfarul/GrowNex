import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import AddZoneDialog from '../AddZoneDialog'

// Navigation on the surface-container background; page content on a rounded surface panel.
// Pages open the Add zone dialog through the outlet context (useOutletContext().openAddZone).
export default function Layout() {
  const [addingZone, setAddingZone] = useState(false)
  const openAddZone = () => setAddingZone(true)
  return (
    <div className="flex h-screen bg-surface-container">
      <Sidebar onAddZone={openAddZone} />
      <main className="flex-1 min-w-0 overflow-y-auto bg-surface sm:my-2 sm:mr-2 sm:rounded-3xl">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 xl:px-10 pb-12">
          <Outlet context={{ openAddZone }} />
        </div>
      </main>
      {addingZone && <AddZoneDialog onClose={() => setAddingZone(false)} />}
    </div>
  )
}
