import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.ts'
import { Sidebar } from './Sidebar.tsx'
import { Button } from '../ui/Button.tsx'

export function AppShell() {
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const { currentUser, logout } = useAuth()

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} />

      <section className="main-pane">
        <header className="topbar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            Menu
          </button>

          <div>
            <strong>{currentUser?.username ?? 'Unknown user'}</strong>
            <div>{currentUser?.role ?? 'No role'}</div>
          </div>

          <Button variant="secondary" onClick={logout}>
            Logout
          </Button>
        </header>

        <Outlet />
      </section>
    </div>
  )
}
