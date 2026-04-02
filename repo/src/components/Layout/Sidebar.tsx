import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.ts'
import type { UserRole } from '../../types/index.ts'

interface NavItem {
  to: string
  label: string
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/fish', label: 'Fish Knowledge' },
  { to: '/campaigns', label: 'Group Buys', roles: ['Member', 'Administrator'] },
  { to: '/dispatch', label: 'Dispatch Board', roles: ['Dispatcher', 'Administrator'] },
  {
    to: '/courses',
    label: 'Course Registration',
    roles: ['Instructor', 'Member', 'Administrator'],
  },
  { to: '/finance', label: 'Finance', roles: ['FinanceClerk', 'Administrator'] },
  { to: '/notifications', label: 'Notifications' },
  { to: '/admin', label: 'Admin', roles: ['Administrator'] },
]

export function Sidebar({ isOpen }: { isOpen: boolean }) {
  const { hasRole } = useAuth()

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <h1>HarborFresh Console</h1>
      <nav aria-label="Main navigation">
        {navItems
          .filter((item) => (item.roles ? hasRole(...item.roles) : true))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              end={item.to === '/dashboard'}
            >
              {item.label}
            </NavLink>
          ))}
      </nav>
    </aside>
  )
}
